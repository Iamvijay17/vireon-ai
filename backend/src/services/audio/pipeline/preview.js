const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const LoggerService = require('../../common/LoggerService');
const MetricsService = require('../../common/MetricsService');
const { AppError } = require('../../../utils/errors');
const { planScene } = require('./segmentPlanner');
const { synthesizeScene, SceneAudioError } = require('./segmentSynthesis');
const { getProfile } = require('./voiceProfiles');
const ffmpeg = require('./ffmpeg');

/**
 * Narration preview: text + voice + style in, playable audio out, with no job,
 * database record or storage upload. It goes through exactly the same
 * planning (pronunciation, Voice Director, pauses) and synthesis (cache,
 * Qwen3-TTS, post-processing, assembly) as a real video, so what you hear is
 * what the video will use - and a repeated preview is served from the cache.
 *
 * Word alignment is skipped (nothing consumes it here).
 *
 * The GPU is the scarce resource, so previews queue behind the GPU lease like
 * any other TTS work; only MAX_PENDING may wait at once, the rest are turned
 * away rather than piling up open HTTP requests.
 */
const MAX_PENDING = 3;
let pending = 0;

/** Previews are for listening to a voice, not a finished scene - treat as a standalone line. */
const PREVIEW_SCENE = 0;

async function toMp3(wavBuffer, workDir) {
  if (!(await ffmpeg.isAvailable())) return null;
  const wavPath = path.join(workDir, 'preview-src.wav');
  const mp3Path = path.join(workDir, 'preview.mp3');
  await fs.writeFile(wavPath, wavBuffer);
  await ffmpeg.runFfmpeg(['-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '3', mp3Path]);
  return fs.readFile(mp3Path);
}

/**
 * @param {object} request a validated previewRequestSchema value
 * @returns {Promise<{ buffer: Buffer, contentType: string, format: string, durationMs: number, cache: 'hit'|'miss'|'mixed',
 *   segments: number, style: string, voice: string, formatNote?: string }>}
 */
async function generatePreview(request) {
  // Check-and-take must be synchronous: planning below is async, and two
  // requests arriving together would otherwise both pass the check.
  if (pending >= MAX_PENDING) {
    throw new AppError('Too many previews are already being generated - try again in a moment', 429);
  }
  pending++;

  const workDir = path.join(os.tmpdir(), 'vireon-preview', crypto.randomUUID());
  const holder = { current: null };
  try {
    const profile = getProfile(request.voiceProfile);
    if (request.voiceProfile && !profile) throw new AppError(`Unknown voice profile "${request.voiceProfile}"`, 400);

    const plan = await planScene({
      text: request.text,
      sceneNumber: PREVIEW_SCENE,
      voice: request.voice,
      voiceProfile: request.voiceProfile,
      style: request.style,
      language: request.language,
      isLastScene: true,
      fastMode: request.fastMode,
      pronunciations: request.pronunciations,
      overrides: { emotion: request.emotion, speed: request.speed, pitch: request.pitch },
    });
    if (plan.segments.length === 0) throw new AppError('There is no text to speak', 400);

    const outputPath = path.join(workDir, 'preview.wav');
    await fs.mkdir(workDir, { recursive: true });

    const requestedAt = Date.now();
    const LocalAIService = require('../../localAI');
    const result = await LocalAIService.gpu.withGPU('tts', () => {
      MetricsService.recordDuration('tts.queueWait', Date.now() - requestedAt);
      return synthesizeScene({ jobId: 'preview', sceneNumber: PREVIEW_SCENE, plan, workDir: path.join(workDir, 'segments'), outputPath, clientHolder: holder, align: false });
    });

    let buffer = await fs.readFile(outputPath);
    let format = 'wav';
    let formatNote;
    if (request.format === 'mp3') {
      try {
        const mp3 = await toMp3(buffer, workDir);
        if (mp3) { buffer = mp3; format = 'mp3'; } else formatNote = 'mp3 requested but ffmpeg is unavailable; returned wav';
      } catch (err) {
        LoggerService.warn('Preview mp3 conversion failed, returning wav', { error: err.message });
        formatNote = 'mp3 conversion failed; returned wav';
      }
    }

    const { cacheHits, cacheMisses } = result.stats;
    return {
      buffer,
      format,
      formatNote,
      contentType: format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      durationMs: result.durationMs,
      cache: cacheMisses === 0 ? 'hit' : cacheHits === 0 ? 'miss' : 'mixed',
      segments: result.segments.length,
      style: plan.style,
      voice: plan.voice,
    };
  } catch (err) {
    if (err instanceof SceneAudioError) {
      // User-safe message only; the per-segment detail is already in the logs.
      const first = err.segments.find((s) => s.status === 'failed');
      throw new AppError(first?.error?.message || 'Voice generation failed', 502);
    }
    throw err;
  } finally {
    pending--;
    if (holder.current) {
      try { holder.current.close(); } catch { /* already closed */ }
    }
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { generatePreview, MAX_PENDING };
