const fs = require('fs').promises;
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const { parseWav } = require('../../../utils/wavAudio');
const ffmpeg = require('./ffmpeg');
const { SegmentError, SEGMENT_ERROR_CODES } = require('./errors');

/**
 * Post-processing for one TTS clip. Gentle by design - the goal is
 * consistency (every clip at the same loudness, no leading/trailing dead air,
 * no rumble or clipping), not to "improve" the voice:
 *
 *   speed/pitch -> trim silence -> [noise reduction] -> EQ -> compression
 *               -> loudness normalisation (two-pass, linear) -> true-peak limiter
 *
 * Each stage is switchable (config.audio.processing). Normalisation is
 * two-pass linear so a short clip is *scaled* to the target rather than
 * dynamically squashed. Everything degrades rather than fails: with no ffmpeg
 * the raw clip is passed through untouched and the result says so.
 */

const SILENCE_THRESHOLD_DB = -50;
// Silence kept at the clip edges so trimming never clips a breath or a final consonant.
const EDGE_PADDING_S = 0.06;

/** Linear ceiling for ffmpeg's alimiter from a dBTP value. */
const dbToLinear = (db) => Math.pow(10, db / 20);

/**
 * Pure: the ffmpeg audio filters for the pre-normalisation stages.
 * @param {{ speed:number, pitch:number, hasRubberband:boolean, hasAfftdn:boolean, processing:object }} o
 * @returns {{ filters: string[], appliedSpeed: number, appliedPitch: number }}
 */
function buildPreFilters({ speed = 1, pitch = 0, hasRubberband = false, hasAfftdn = false, processing = config.audio.processing }) {
  const filters = [];
  let appliedSpeed = 1;
  let appliedPitch = 0;

  const wantsPitch = Math.abs(pitch) > 0.01;
  const wantsSpeed = Math.abs(speed - 1) > 0.001;

  if (wantsPitch && hasRubberband) {
    filters.push(`rubberband=tempo=${speed.toFixed(4)}:pitch=${Math.pow(2, pitch / 12).toFixed(5)}`);
    appliedSpeed = speed;
    appliedPitch = pitch;
  } else if (wantsSpeed) {
    // atempo preserves pitch and is clean within roughly 0.5-2x.
    filters.push(`atempo=${speed.toFixed(4)}`);
    appliedSpeed = speed;
  }

  if (processing.enabled) {
    if (processing.trimSilence) {
      const trim = `silenceremove=start_periods=1:start_silence=${EDGE_PADDING_S}:start_threshold=${SILENCE_THRESHOLD_DB}dB:detection=peak`;
      filters.push(trim, 'areverse', trim, 'areverse');
    }
    if (processing.noiseReduction && hasAfftdn) filters.push('afftdn=nr=10:nf=-45');
    if (processing.eq) filters.push('highpass=f=70', 'equalizer=f=3000:t=q:w=1.2:g=1.2');
    if (processing.compression) filters.push('acompressor=threshold=-21dB:ratio=2.5:attack=12:release=160:makeup=2');
  }

  return { filters, appliedSpeed, appliedPitch };
}

/** Pull the measurement JSON that loudnorm prints to stderr. */
function parseLoudnormJson(stderr) {
  const start = String(stderr).lastIndexOf('{');
  const end = String(stderr).lastIndexOf('}');
  if (start === -1 || end < start) return null;
  try {
    const j = JSON.parse(stderr.slice(start, end + 1));
    const num = (v) => (v === undefined || v === '-inf' || v === 'inf' ? NaN : parseFloat(v));
    const m = {
      inputI: num(j.input_i), inputTP: num(j.input_tp), inputLRA: num(j.input_lra),
      inputThresh: num(j.input_thresh), targetOffset: num(j.target_offset),
    };
    return Object.values(m).every(Number.isFinite) ? m : null;
  } catch {
    return null;
  }
}

const loudnormArgs = (processing) => `I=${processing.targetLoudness}:TP=${processing.truePeakLimit}:LRA=11`;

async function passThrough(inputPath, outputPath) {
  if (inputPath !== outputPath) await fs.copyFile(inputPath, outputPath);
}

function wavInfo(buffer) {
  const { fmt, data } = parseWav(buffer);
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, durationMs: Math.round((data.length / fmt.byteRate) * 1000) };
}

/**
 * @param {object} o
 * @param {string} o.inputPath  raw TTS WAV
 * @param {string} o.outputPath processed WAV (may equal inputPath's dir, never the same file)
 * @param {number} [o.speed]
 * @param {number} [o.pitch]    semitones
 * @param {object} [o.ffmpegApi] ffmpeg wrapper (injectable for tests)
 * @returns {Promise<{ processed: boolean, degraded: boolean, reason?: string, durationMs: number,
 *   appliedSpeed: number, appliedPitch: number, normalized: boolean, inputLufs: number|null }>}
 */
async function processClip({ inputPath, outputPath, speed = 1, pitch = 0, processing = config.audio.processing, signal, ffmpegApi = ffmpeg }) {
  const rawInfo = wavInfo(await fs.readFile(inputPath));
  const base = { appliedSpeed: 1, appliedPitch: 0, normalized: false, inputLufs: null };

  const wantsTransform = processing.enabled || Math.abs(speed - 1) > 0.001 || Math.abs(pitch) > 0.01;
  if (!wantsTransform) {
    await passThrough(inputPath, outputPath);
    return { ...base, processed: false, degraded: false, reason: 'processing-disabled', durationMs: rawInfo.durationMs };
  }

  if (!(await ffmpegApi.isAvailable())) {
    await passThrough(inputPath, outputPath);
    return { ...base, processed: false, degraded: true, reason: 'ffmpeg-unavailable', durationMs: rawInfo.durationMs };
  }

  const [hasRubberband, hasAfftdn] = await Promise.all([ffmpegApi.hasFilter('rubberband'), ffmpegApi.hasFilter('afftdn')]);
  const { filters, appliedSpeed, appliedPitch } = buildPreFilters({ speed, pitch, hasRubberband, hasAfftdn, processing });
  if (Math.abs(pitch) > 0.01 && !hasRubberband) {
    LoggerService.warn('Pitch shift requested but this ffmpeg has no rubberband filter - pitch not applied', { pitch });
  }

  const outArgs = ['-c:a', 'pcm_s16le', '-ar', String(rawInfo.sampleRate), '-ac', String(rawInfo.channels)];
  const chain = (extra) => [...filters, ...extra].join(',');

  try {
    let normalizedFilters = [];
    let normalized = false;
    let inputLufs = null;

    if (processing.enabled && processing.normalization) {
      // Pass 1: measure the clip as it will look going into loudnorm.
      const measure = await ffmpegApi.runFfmpeg(
        ['-i', inputPath, '-af', chain([`loudnorm=${loudnormArgs(processing)}:print_format=json`]), '-f', 'null', '-'],
        { signal }
      );
      const m = parseLoudnormJson(measure.stderr);
      if (m) {
        normalizedFilters = [
          `loudnorm=${loudnormArgs(processing)}:measured_I=${m.inputI}:measured_TP=${m.inputTP}:measured_LRA=${m.inputLRA}:measured_thresh=${m.inputThresh}:offset=${m.targetOffset}:linear=true`,
          `aresample=${rawInfo.sampleRate}`,
        ];
        normalized = true;
        inputLufs = m.inputI;
      } else {
        LoggerService.warn('Loudness measurement unusable (silent clip?) - skipping normalisation');
      }
    }

    const tail = processing.enabled ? [...normalizedFilters, `alimiter=limit=${dbToLinear(processing.truePeakLimit).toFixed(4)}:level=0`] : [];
    const finalChain = chain(tail);
    await ffmpegApi.runFfmpeg(['-i', inputPath, ...(finalChain ? ['-af', finalChain] : []), ...outArgs, outputPath], { signal });

    const outInfo = wavInfo(await fs.readFile(outputPath));
    if (outInfo.durationMs < 50) {
      throw new SegmentError(SEGMENT_ERROR_CODES.PROCESSING_FAILED, 'Processed audio is empty');
    }
    return { processed: true, degraded: false, durationMs: outInfo.durationMs, appliedSpeed, appliedPitch, normalized, inputLufs };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Never lose a good TTS clip to a processing problem: hand back the raw
    // audio, flagged degraded so it is not cached as the "processed" version.
    LoggerService.warn('Audio post-processing failed - using the raw clip', { error: err.message });
    await passThrough(inputPath, outputPath);
    return { ...base, processed: false, degraded: true, reason: 'ffmpeg-failed', durationMs: rawInfo.durationMs };
  }
}

module.exports = { processClip, buildPreFilters, parseLoudnormJson, wavInfo };
