const fs = require('fs').promises;
const { parseWav, buildWavBuffer, silenceBuffer } = require('../../../utils/wavAudio');
const { SegmentError, SEGMENT_ERROR_CODES } = require('./errors');

/**
 * Joins a scene's processed segment clips into one narration track and
 * reports exactly where each segment sits in it.
 *
 * Pure PCM concatenation (no ffmpeg), so assembly works even when
 * post-processing is unavailable. The silence between two clips is
 * max(pauseAfter[i], pauseBefore[i+1]) - margins collapse instead of adding
 * up. The last clip's pauseAfter becomes the scene's tail, which is how a
 * scene "breathes" before the next one starts.
 *
 * Segment timings are the *speech* bounds inside the track (the clip itself,
 * not the pauses around it), in milliseconds - the contract Remotion and the
 * caption mapper read:  { startMs, endMs, durationMs }.
 */

/**
 * @param {{ file: string, pauseBeforeMs?: number, pauseAfterMs?: number }[]} clips in order
 * @param {string} outputPath
 * @returns {Promise<{ durationMs: number, timings: {startMs:number,endMs:number,durationMs:number}[], sampleRate: number }>}
 */
async function assembleScene(clips, outputPath) {
  if (clips.length === 0) throw new SegmentError(SEGMENT_ERROR_CODES.INVALID_INPUT, 'No audio clips to assemble');

  const parsed = [];
  for (const clip of clips) {
    try {
      parsed.push({ ...parseWav(await fs.readFile(clip.file)), clip });
    } catch (err) {
      throw new SegmentError(SEGMENT_ERROR_CODES.PROCESSING_FAILED, `Audio assembly could not read a clip: ${err.message}`, { cause: err });
    }
  }

  const fmt = parsed[0].fmt;
  for (const { fmt: other } of parsed) {
    if (other.sampleRate !== fmt.sampleRate || other.channels !== fmt.channels || other.bitsPerSample !== fmt.bitsPerSample || other.audioFormat !== fmt.audioFormat) {
      throw new SegmentError(SEGMENT_ERROR_CODES.PROCESSING_FAILED, 'Audio assembly: clips have inconsistent formats');
    }
  }

  const parts = [];
  const timings = [];
  let bytes = 0;
  const msAt = (b) => Math.round((b / fmt.byteRate) * 1000);

  parsed.forEach(({ data, clip }, i) => {
    const gapMs = i === 0 ? clip.pauseBeforeMs || 0 : Math.max(parsed[i - 1].clip.pauseAfterMs || 0, clip.pauseBeforeMs || 0);
    if (gapMs > 0) {
      const gap = silenceBuffer(fmt, gapMs / 1000);
      parts.push(gap);
      bytes += gap.length;
    }
    const startMs = msAt(bytes);
    parts.push(data);
    bytes += data.length;
    const endMs = msAt(bytes);
    timings.push({ startMs, endMs, durationMs: endMs - startMs });
  });

  const tailMs = parsed[parsed.length - 1].clip.pauseAfterMs || 0;
  if (tailMs > 0) {
    const tail = silenceBuffer(fmt, tailMs / 1000);
    parts.push(tail);
    bytes += tail.length;
  }

  await fs.writeFile(outputPath, buildWavBuffer(fmt, Buffer.concat(parts)));
  return { durationMs: msAt(bytes), timings, sampleRate: fmt.sampleRate };
}

module.exports = { assembleScene };
