const fs = require('fs').promises;
const path = require('path');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const MetricsService = require('../../common/MetricsService');
const CacheService = require('../../common/CacheService');
const { getStorageProvider } = require('../../storage/providers');
const { makeAbortError } = require('../../../utils/abortableDelay');
const { synthesizeRaw } = require('./rawSynthesis');
const { processClip } = require('./audioProcessor');
const { assembleScene } = require('./assembler');
const { alignBatch } = require('./alignment');
const { mapToOriginalWords } = require('./alignment/mapWords');
const { toSegmentError } = require('./errors');
const { toPersisted } = require('./segmentPlanner');
const { buildSceneTimeline } = require('./timeline');

/**
 * Runs a planned scene: for each segment (strictly one at a time - this is
 * the only GPU consumer) cache lookup -> TTS -> post-process, then batch word
 * alignment, assembly into one scene track, and timing metadata.
 *
 * Each segment is independently recoverable. A failure is recorded on that
 * segment (code + user-safe message, never a stack), the remaining segments
 * still run so they land in the cache, and the scene then fails. Re-running
 * the scene - the normal resume/retry path - finds every finished segment in
 * the cache and synthesizes only the ones that failed; `forceSegmentIds`
 * re-synthesizes specific segments even when cached.
 *
 * Caller owns the GPU lease (audioStep holds it across the whole job).
 */

/** Thrown when one or more segments failed; carries every segment's state for persistence. */
class SceneAudioError extends Error {
  constructor(sceneNumber, segments) {
    const failed = segments.filter((s) => s.status === 'failed');
    const code = failed[0]?.error?.code || 'UNKNOWN';
    super(`TTS failed for scene ${sceneNumber}: ${failed.length} of ${segments.length} segment(s) failed (${code})`);
    this.name = 'SceneAudioError';
    this.sceneNumber = sceneNumber;
    this.segments = segments.map(toPersisted);
    this.code = code;
  }
}

const noop = () => {};

/** Cached word timings are only trusted if they cover exactly this segment's caption words. */
function usableWords(meta, seg) {
  return Array.isArray(meta?.words) && meta.words.length === seg.internal.wordMap.length ? meta.words : null;
}

/**
 * @param {object} o
 * @param {string} o.jobId
 * @param {number} o.sceneNumber
 * @param {{ segments: object[], style: string, voice: string, version: object }} o.plan
 * @param {string} o.workDir scratch directory for this scene's clips
 * @param {string} o.outputPath where the assembled scene WAV is written
 * @param {boolean} [o.skipCache]
 * @param {Set<string>|string[]} [o.forceSegmentIds]
 * @param {{current: object|null}|null} [o.clientHolder]
 * @param {AbortSignal|null} [o.signal]
 * @param {boolean} [o.align] word-level caption timing; previews skip it
 * @param {(e: {stage: string, current: number, total: number, sceneNumber: number, progress: number}) => void} [o.onProgress]
 */
async function synthesizeScene({ jobId, sceneNumber, plan, workDir, outputPath, skipCache = false, forceSegmentIds = [], clientHolder = null, signal = null, onProgress = noop, align = true }) {
  const segments = plan.segments;
  const total = segments.length;
  const force = new Set(forceSegmentIds);
  const stats = { cacheHits: 0, cacheMisses: 0, generationMs: 0, processingMs: 0, alignmentMs: 0, assemblyMs: 0, degraded: false };
  const meta = new Map(); // segment id -> cached processed metadata (may carry words)
  const words = new Map(); // segment id -> mapped original words, seconds relative to the clip start
  const emit = (stage, current) => onProgress({ stage, current, total, sceneNumber, progress: Math.round((current / total) * 100) });

  await fs.mkdir(workDir, { recursive: true });
  emit('segmenting', 0);

  // ---- Phase 1: produce every segment's processed clip ---------------------
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw makeAbortError();
    const seg = segments[i];
    const processedPath = path.join(workDir, `${seg.id}.wav`);
    const rawPath = path.join(workDir, `${seg.id}.raw.wav`);
    const forced = skipCache || force.has(seg.id);

    try {
      seg.status = 'generating';
      seg.error = null;

      let cached = forced ? null : await CacheService.getSegmentAudio('processed', seg.processedCacheKey, processedPath);
      if (cached) {
        seg.cache = 'hit';
        stats.cacheHits++;
        meta.set(seg.id, cached);
        const cachedWords = usableWords(cached, seg);
        if (cachedWords) words.set(seg.id, cachedWords);
        seg.durationMs = cached.durationMs ?? null;
        seg.audioFile = processedPath;
        seg.status = 'completed';
        emit('tts-cache-hit', i + 1);
        continue;
      }

      // Raw cache: re-processing needs no GPU.
      cached = forced ? null : await CacheService.getSegmentAudio('raw', seg.rawCacheKey, rawPath);
      if (cached) {
        seg.cache = 'hit';
        stats.cacheHits++;
        emit('tts-cache-hit', i + 1);
      } else {
        seg.cache = 'miss';
        stats.cacheMisses++;
        emit('tts-generating', i + 1);
        const synth = await synthesizeRaw({
          resolved: seg.internal.resolved,
          spokenText: seg.spokenText,
          seed: seg.internal.seed,
          instruct: seg.internal.instruct,
          fastMode: seg.internal.fastMode,
          language: seg.language,
          outputPath: rawPath,
          clientHolder,
          signal,
          logCtx: { jobId, sceneNumber, segment: seg.id },
        });
        seg.generationMs = synth.generationMs;
        stats.generationMs += synth.generationMs;
        await CacheService.putSegmentAudio('raw', seg.rawCacheKey, rawPath, {
          textLength: seg.spokenText.length,
          model: `Qwen3-TTS ${seg.internal.modelSize}`,
          pronunciationVersion: plan.version.pronunciation,
          createdAt: new Date().toISOString(),
        });
      }

      seg.status = 'processing';
      emit('tts-processing', i + 1);
      const processStart = Date.now();
      const processed = await processClip({
        inputPath: rawPath,
        outputPath: processedPath,
        speed: seg.instruction.speed,
        pitch: seg.instruction.pitch,
        signal,
      });
      seg.processingMs = Date.now() - processStart;
      stats.processingMs += seg.processingMs;
      if (processed.degraded) stats.degraded = true;
      MetricsService.recordDuration('audio.processing', seg.processingMs);

      seg.durationMs = processed.durationMs;
      seg.audioFile = processedPath;
      seg.status = 'completed';

      const processedMeta = {
        durationMs: processed.durationMs,
        appliedSpeed: processed.appliedSpeed,
        appliedPitch: processed.appliedPitch,
        normalized: processed.normalized,
        pronunciationVersion: plan.version.pronunciation,
        directorVersion: plan.version.director,
        createdAt: new Date().toISOString(),
      };
      meta.set(seg.id, processedMeta);
      // A degraded clip (ffmpeg missing/failed) is the raw audio - caching it
      // as "processed" would keep serving it after ffmpeg is fixed.
      if (!processed.degraded) await CacheService.putSegmentAudio('processed', seg.processedCacheKey, processedPath, processedMeta);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      seg.status = 'failed';
      seg.error = { ...toSegmentError(err), attempts: err.attempts || 1 };
      LoggerService.error('TTS segment failed', { jobId, sceneNumber, segment: seg.id, code: seg.error.code, error: err.message });
      MetricsService.increment('tts.segment.failed');
    }
  }

  if (segments.some((s) => s.status === 'failed')) throw new SceneAudioError(sceneNumber, segments);

  // ---- Phase 2: word timing for clips that do not have it yet --------------
  const needAlignment = segments.filter((s) => !words.has(s.id));
  if (align && needAlignment.length > 0 && config.audio.alignment.provider !== 'none') {
    const alignStart = Date.now();
    const heardPerClip = await alignBatch(needAlignment.map((s) => s.audioFile), { signal });
    needAlignment.forEach((seg, k) => {
      const mapped = mapToOriginalWords(heardPerClip[k], seg.internal.spokenTokens, seg.internal.wordMap);
      if (!mapped) return;
      words.set(seg.id, mapped.words);
      const segMeta = { ...(meta.get(seg.id) || {}), words: mapped.words, alignedWith: config.audio.alignment.provider };
      meta.set(seg.id, segMeta);
      if (!stats.degraded) CacheService.putSegmentMeta('processed', seg.processedCacheKey, segMeta);
    });
    stats.alignmentMs = Date.now() - alignStart;
  }

  // ---- Phase 3: assemble the scene track ------------------------------------
  emit('audio-assembling', total);
  const assembleStart = Date.now();
  const assembled = await assembleScene(
    segments.map((s) => ({ file: s.audioFile, pauseBeforeMs: s.pauseBeforeMs, pauseAfterMs: s.pauseAfterMs })),
    outputPath
  );
  stats.assemblyMs = Date.now() - assembleStart;
  MetricsService.recordDuration('audio.assembly', stats.assemblyMs);

  segments.forEach((seg, i) => {
    seg.startMs = assembled.timings[i].startMs;
    seg.endMs = assembled.timings[i].endMs;
    seg.durationMs = assembled.timings[i].durationMs;
    seg.audioFile = null; // scratch path is meaningless once the workDir is gone
  });

  const timeline = buildSceneTimeline(segments, words);

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  emit('audio-complete', total);

  return {
    path: outputPath,
    durationMs: assembled.durationMs,
    segments: segments.map(toPersisted),
    captionTimestamps: timeline.captionTimestamps,
    speechRanges: timeline.speechRanges,
    fromCache: stats.cacheMisses === 0,
    stats,
  };
}

/** Uploads the assembled track the same way the legacy scene path does. */
async function uploadSceneTrack(jobId, outputPath) {
  return getStorageProvider().uploadFile(jobId, outputPath, 'audio');
}

module.exports = { synthesizeScene, uploadSceneTrack, SceneAudioError };
