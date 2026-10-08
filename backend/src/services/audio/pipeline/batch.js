const fs = require('fs').promises;
const path = require('path');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const { planScene } = require('./segmentPlanner');
const { synthesizeScene, uploadSceneTrack, SceneAudioError } = require('./segmentSynthesis');
const { makeAbortError } = require('../../../utils/abortableDelay');

/** Thrown only when SPEECH_ALIGNMENT_REQUIRED=true and a scene could not be word-aligned. */
class SpeechAlignmentRequiredError extends Error {
  constructor(sceneNumber, timeline) {
    super(`Speech alignment is required but scene ${sceneNumber} could not be fully word-aligned (${timeline.fallbackReasons.map((r) => r.reason).join(', ') || timeline.alignmentStatus})`);
    this.name = 'SpeechAlignmentRequiredError';
    this.code = 'SPEECH_ALIGNMENT_REQUIRED';
    this.sceneNumber = sceneNumber;
  }
}

/**
 * Job-level entry points of the segmented pipeline. They are drop-in
 * counterparts of sceneSynthesis.generateAllAudio / generateSceneAudio (same
 * arguments, same result shape: `{ file, duration, captionTimestamps }` plus
 * the new `segments` / `ttsMeta`), which is what lets the video worker and the
 * course pipeline switch over with the TTS_SEGMENTED flag and no call-site
 * changes.
 *
 * `options` (all optional): { videoType, style, voiceProfile, speakers,
 * language, totalScenes, onProgress, onSceneFailed }.
 */

const jobsRoot = path.resolve(__dirname, '../../../../jobs');

/**
 * Alignment is a refinement by default: the audio is valid and the scene falls
 * back to segment-level timing. Only an explicit "required" mode
 * (SPEECH_ALIGNMENT_REQUIRED=true) turns a weak alignment into a failure.
 */
function assertAlignmentSatisfied(sceneNumber, timeline) {
  if (config.speech.alignmentRequired && timeline && timeline.alignmentStatus !== 'complete') {
    throw new SpeechAlignmentRequiredError(sceneNumber, timeline);
  }
}

/** Plan + synthesize + upload one scene. Returns the legacy-compatible result. */
async function runScene({ jobId, scene, index, count, voice, fastMode, skipCache, forceSegmentIds, clientHolder, signal, options }) {
  const text = scene.audio?.text;
  if (!text || !String(text).trim()) {
    LoggerService.warn('Scene has no audio text, skipping', { sceneNumber: scene.sceneNumber });
    return null;
  }

  const sceneNumber = scene.sceneNumber;
  // First/last-scene cues must not depend on which scenes happen to be in
  // this call (a resumed run or a single-scene regenerate would otherwise
  // plan the same scene differently, missing its own cache). Prefer the
  // scene's position in the whole script when the caller knows the total.
  const total = options.totalScenes || null;
  const isFirstScene = total ? sceneNumber === 1 : index === 0;
  const isLastScene = total ? sceneNumber === total : index === count - 1;
  const plan = await planScene({
    text,
    sceneNumber,
    speaker: scene.speaker || 'narrator',
    voice: voice || scene.audio?.voice,
    voiceProfile: options.voiceProfile,
    speakers: options.speakers,
    videoType: options.videoType,
    style: options.style,
    emotionNote: scene.audio?.emotion || '',
    sceneType: scene.sceneType,
    isFirstScene,
    isLastScene,
    language: options.language,
    fastMode,
  });

  // Planning (director, pronunciation, pauses) is done - tell the caller how many
  // segments this scene will be spoken in before the slow work starts.
  if (typeof options.onProgress === 'function') {
    options.onProgress({ stage: 'voice-director', current: 0, total: plan.segments.length, sceneNumber, progress: 0 });
  }

  const audioDir = path.join(jobsRoot, jobId, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const file = `scene${sceneNumber}.mp3`; // WAV data, same name the renderer already expects
  const outputPath = path.join(audioDir, file);

  let synthesized;
  try {
    synthesized = await synthesizeScene({
      jobId,
      sceneNumber,
      plan,
      workDir: path.join(audioDir, '_segments', `scene${sceneNumber}`),
      outputPath,
      skipCache,
      forceSegmentIds,
      clientHolder,
      signal,
      onProgress: options.onProgress,
    });
  } catch (err) {
    if (err instanceof SceneAudioError && typeof options.onSceneFailed === 'function') {
      await options.onSceneFailed(sceneNumber, err.segments);
    }
    throw err;
  }

  // The finished clips stay cached when this throws, so a retry after fixing
  // the aligner costs no GPU time.
  try {
    assertAlignmentSatisfied(sceneNumber, synthesized.speechTimeline);
  } catch (err) {
    await fs.unlink(outputPath).catch(() => {});
    throw err;
  }

  // Durable copy first, then drop the local scratch file (as the legacy path does).
  await uploadSceneTrack(jobId, outputPath);
  await fs.unlink(outputPath).catch(() => {});

  const { stats } = synthesized;
  return {
    file,
    duration: synthesized.durationMs / 1000,
    captionTimestamps: synthesized.captionTimestamps,
    segments: synthesized.segments,
    ...(synthesized.speechTimeline ? { speechTimeline: synthesized.speechTimeline } : {}),
    ttsMeta: {
      voice: plan.voice,
      voiceProfile: synthesized.segments[0]?.voiceProfile ?? null,
      style: plan.style,
      ttsModel: `Qwen3-TTS ${plan.segments[0]?.internal.modelSize}`,
      voiceDirectorVersion: plan.version.director,
      pronunciationVersion: plan.version.pronunciation,
      segmentCount: synthesized.segments.length,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      ttsGenerationMs: stats.generationMs,
      audioProcessingMs: stats.processingMs,
      alignmentMs: stats.alignmentMs,
      alignmentCacheHits: stats.alignmentCacheHits,
      speechTimelineMs: stats.timelineMs,
      // alignment cost per second of audio (<1 = faster than real time)
      alignmentRatio: synthesized.durationMs > 0 ? Math.round((stats.alignmentMs / synthesized.durationMs) * 1000) / 1000 : null,
      alignmentStatus: synthesized.speechTimeline?.alignmentStatus ?? null,
      audioAssemblyMs: stats.assemblyMs,
      audioDurationMs: synthesized.durationMs,
      processingDegraded: stats.degraded,
    },
    speechRanges: synthesized.speechRanges,
    fromCache: synthesized.fromCache,
    cacheHash: null,
  };
}

async function generateAllAudioSegmented(jobId, scenes, voice, onSceneComplete, checkCancelled, fastMode = false, skipCache = false, signal = null, options = {}) {
  LoggerService.tts('Starting segmented batch audio generation', { jobId, scenes: scenes.length, voice });

  const results = [];
  // Connected lazily by the first segment that actually needs the model, so
  // a run served entirely from cache never starts (or waits for) the TTS server.
  const clientHolder = { current: null };

  try {
    for (let i = 0; i < scenes.length; i++) {
      if (signal?.aborted) throw makeAbortError();
      if (typeof checkCancelled === 'function') await checkCancelled();

      const result = await runScene({
        jobId, scene: scenes[i], index: i, count: scenes.length, voice, fastMode, skipCache,
        forceSegmentIds: [], clientHolder, signal, options,
      });
      if (!result) continue;

      results.push(result);
      if (typeof onSceneComplete === 'function') await onSceneComplete(scenes[i].sceneNumber, result);
    }
  } finally {
    if (clientHolder.current) {
      try { clientHolder.current.close(); } catch { /* already closed */ }
    }
  }

  LoggerService.tts('Segmented batch audio generation complete', { jobId, generated: results.length });
  return results;
}

/**
 * Single-scene entry (regenerate a scene, retry failed segments). Callers
 * outside a job's audio step hold no GPU lease, so this takes it - never call
 * it from inside withGPU('tts') (the slot is not reentrant).
 */
async function generateSceneAudioSegmented(jobId, scene, voice, fastMode = false, skipCache = false, options = {}) {
  const LocalAIService = require('../../localAI');
  const clientHolder = { current: null };
  try {
    return await LocalAIService.gpu.withGPU('tts', () =>
      runScene({
        jobId, scene, index: 0, count: 1, voice, fastMode, skipCache,
        forceSegmentIds: options.forceSegmentIds || [], clientHolder, signal: options.signal || null,
        options,
      })
    );
  } finally {
    if (clientHolder.current) {
      try { clientHolder.current.close(); } catch { /* already closed */ }
    }
  }
}

module.exports = { generateAllAudioSegmented, generateSceneAudioSegmented, SpeechAlignmentRequiredError, assertAlignmentSatisfied };
