const fs = require('fs').promises;
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const MetricsService = require('../../common/MetricsService');
const withTimeout = require('../../../utils/withTimeout');
const { abortableDelay, makeAbortError } = require('../../../utils/abortableDelay');
const { parseWav } = require('../../../utils/wavAudio');
const ttsClient = require('../audioService/ttsClient');
const ffmpeg = require('./ffmpeg');
const { SegmentError, SEGMENT_ERROR_CODES, classifySegmentError } = require('./errors');

/**
 * One TTS request for one segment: call Qwen3-TTS, download the clip, make
 * sure it is a readable WAV. This is the only place that touches the GPU model
 * for the segmented pipeline, and it runs strictly one request at a time (the
 * caller holds the GPU lease and loops sequentially).
 *
 * Recovery mirrors the legacy scene path, scoped to a single segment:
 *   - retry with exponential backoff (config.tts.maxRetries)
 *   - after a timeout, restart the TTS process (its Gradio queue is wedged,
 *     a fresh connection to the same process does not clear it)
 *   - reconnect before every retry
 * A segment that exhausts its attempts throws; siblings are unaffected.
 */

/** Make sure `file` holds a parseable WAV; convert with ffmpeg if the model returned something else. */
async function ensureWav(file) {
  let buffer = await fs.readFile(file);
  try {
    parseWav(buffer);
    return;
  } catch {
    // Not a WAV - fall through to conversion.
  }
  if (!(await ffmpeg.isAvailable())) {
    throw new SegmentError(SEGMENT_ERROR_CODES.PROCESSING_FAILED, 'Not a valid WAV file and ffmpeg is unavailable to convert it');
  }
  const converted = `${file}.conv.wav`;
  await ffmpeg.runFfmpeg(['-i', file, '-c:a', 'pcm_s16le', converted]);
  await fs.rename(converted, file);
  buffer = await fs.readFile(file);
  parseWav(buffer);
}

/**
 * @param {object} o
 * @param {object} o.resolved  voiceCatalog.resolveVoice result
 * @param {string} o.spokenText
 * @param {number} o.seed
 * @param {string} o.instruct
 * @param {boolean} [o.fastMode]
 * @param {string} [o.language]
 * @param {string} o.outputPath where the WAV is written
 * @param {{ current: object|null }|null} [o.clientHolder] shared Gradio connection owned by the caller (may start empty)
 * @param {AbortSignal|null} [o.signal]
 * @param {object} [o.logCtx]
 * @returns {Promise<{ path: string, attempts: number, generationMs: number }>}
 */
async function synthesizeRaw({ resolved, spokenText, seed, instruct, fastMode = false, language = 'auto', outputPath, clientHolder = null, signal = null, logCtx = {} }) {
  if (signal?.aborted) throw makeAbortError();

  // The caller may share one connection across a whole job (connected lazily,
  // so an all-cache-hit run never touches the TTS server). Without a holder
  // this call connects - and closes - its own.
  const ownsClient = !clientHolder;
  if (ownsClient) clientHolder = { current: null };
  let lastError = null;

  try {
    if (!clientHolder.current) clientHolder.current = await ttsClient.connect(signal);

    for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
      if (signal?.aborted) throw makeAbortError();
      const startedAt = Date.now();

      try {
        LoggerService.tts(`Generating segment audio (attempt ${attempt})`, {
          ...logCtx,
          mode: resolved.mode,
          speaker: resolved.speaker,
          cloneFile: resolved.file,
          textLength: spokenText.length,
        });

        const result = await withTimeout(
          ttsClient.generate(clientHolder.current, resolved, spokenText, seed, instruct, fastMode, language),
          config.tts.timeout,
          'TTS generation timed out',
          signal
        );

        const audio = result.data?.[0];
        if (!audio?.url) throw new Error('No audio URL returned from TTS API');

        const response = await fetch(audio.url, { signal: signal || undefined });
        if (!response.ok) throw new Error(`Failed to download generated audio: ${response.status} ${response.statusText}`);
        await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
        await ensureWav(outputPath);

        const generationMs = Date.now() - startedAt;
        MetricsService.recordDuration('tts.segment.generation', generationMs);
        return { path: outputPath, attempts: attempt, generationMs };
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastError = err;
        const code = classifySegmentError(err);
        const isLast = attempt === config.tts.maxRetries;

        LoggerService.warn(`TTS segment attempt ${attempt} failed${isLast ? ' (final)' : ''}`, { ...logCtx, code, error: err.message });

        // Retrying cannot fix bad input.
        if (code === SEGMENT_ERROR_CODES.INVALID_INPUT || isLast) break;

        await abortableDelay(Math.min(2000 * 2 ** (attempt - 1), 16000), signal);

        if (code === SEGMENT_ERROR_CODES.TIMEOUT) {
          LoggerService.warn('Restarting Qwen3-TTS after a timeout - its job queue may be wedged');
          await require('../../localAI').tts.restart();
        }
        clientHolder.current = await ttsClient.connect(signal);
      }
    }
  } catch (err) {
    // A failure establishing the connection itself - surface as-is for classification.
    if (err.name === 'AbortError') throw err;
    lastError = err;
  } finally {
    if (ownsClient && clientHolder?.current) {
      try { clientHolder.current.close(); } catch { /* connection already gone */ }
    }
  }

  const error = new SegmentError(classifySegmentError(lastError), undefined, { cause: lastError });
  error.attempts = config.tts.maxRetries;
  throw error;
}

module.exports = { synthesizeRaw, ensureWav };
