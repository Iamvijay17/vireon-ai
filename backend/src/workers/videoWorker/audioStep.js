const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const AudioService = require('../../services/audio/audioService');
const LocalAIService = require('../../services/localAI');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const MetricsService = require('../../services/common/MetricsService');
const { JOB_STATUS } = require('../../constants');
const { PROGRESS_BANDS, mapToBand } = require('../../utils/progressBands');
const { SPEECH_EVENTS, emitSpeechStage, speechEventsEnabled } = require('../../services/audio/pipeline/speech/events');
const { bailIfCancelled, JobCancelledError } = require('./shared');

/**
 * Step 4: audio generation, skipped if every scene already has an audio
 * file (resuming past this step). Persists + broadcasts each scene's
 * audio as soon as it's ready rather than waiting for the whole batch.
 * The caller re-fetches the job afterward to pick up the updated scene
 * durations - this step doesn't return the script itself.
 */
async function run(jobId, videoJob, script, ctx) {
  const scenesWithAudio = script.scenes.filter(s => s.audio?.file);
  const needsAudioGeneration = scenesWithAudio.length < script.scenes.length;

  if (!needsAudioGeneration) {
    LoggerService.info('All audio already generated, skipping audio step');
    return;
  }

  ctx.currentStep = JOB_STATUS.GENERATING_AUDIO;
  await VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_AUDIO, { progress: 40 });
  SocketService.emitJobProgress({ _id: jobId, progress: 40, status: JOB_STATUS.GENERATING_AUDIO, currentStep: JOB_STATUS.GENERATING_AUDIO, currentScene: 0 });

  // Get scenes that need audio (those without audio file)
  const scenesToProcess = script.scenes.filter(s => !s.audio?.file);

  LoggerService.info('Generating audio for scenes', {
    totalScenes: script.scenes.length,
    alreadyGenerated: scenesWithAudio.length,
    pendingScenes: scenesToProcess.length,
  });
  await ActivityLogService.add(jobId, 'Audio generation started');

  // Podcast turns already carry their own resolved host/guest voice on
  // scene.audio.voice (see ScriptParserService.validate) - don't pass a
  // job-wide voice for those, so generateSceneAudio's fallback
  // (`voice || scene.audio?.voice`) picks up the per-turn voice.
  const jobVoice = videoJob.type === 'podcast' ? undefined : videoJob.voice;

  // GENERATING_AUDIO spans 40-49% (50 is reserved for AUDIO_COMPLETED) -
  // scaled by scenes already done (scenesWithAudio) plus this batch's
  // completions, so resuming a partially-audio'd job doesn't restart the
  // band from scratch.
  let completedScenes = scenesWithAudio.length;
  const totalScenes = script.scenes.length;

  // Speech-timing progress (ENABLE_SPEECH_ALIGNMENT only; no-ops otherwise).
  // Alignment runs inside each scene's synthesis, so the job-level stages are:
  // tts:start -> (per scene: alignment:start/progress) -> tts:complete ->
  // alignment:complete -> timeline:complete.
  const speechStage = (event, extra) => emitSpeechStage(SocketService, jobId, event, { total: scenesToProcess.length, ...extra });
  let alignmentStarted = false;
  speechStage(SPEECH_EVENTS.TTS_START);

  // GPU-sequential: claim the GPU for TTS across the whole batch of scenes
  // (not per-scene) - releasing between scenes would just thrash
  // start/stop against Ollama/ComfyUI for no benefit, since this stage
  // owns TTS work start-to-finish anyway.
  try {
    const gpuRequestedAt = Date.now();
    await LocalAIService.gpu.withGPU('tts', () => {
      MetricsService.recordDuration('tts.queueWait', Date.now() - gpuRequestedAt);
      return AudioService.generateAllAudio(
        jobId,
        scenesToProcess,
        jobVoice,
        async (sceneNumber, result) => {
          // Persist and broadcast as soon as this individual scene's audio is ready,
          // instead of waiting for the whole batch to finish.
          await VideoService.updateSceneAudio(jobId, sceneNumber, result);
          SocketService.emitSceneAudioReady(jobId, sceneNumber, result);

          completedScenes += 1;
          const mapped = mapToBand(PROGRESS_BANDS.job.audio, completedScenes / totalScenes);
          SocketService.emitJobProgress({ _id: jobId, progress: mapped, status: JOB_STATUS.GENERATING_AUDIO, currentStep: JOB_STATUS.GENERATING_AUDIO, currentScene: sceneNumber });
          VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_AUDIO, { progress: mapped }).catch((err) => {
            LoggerService.warn('Failed to persist audio progress', { jobId, error: err.message });
          });

          LoggerService.info(`Scene ${sceneNumber} audio ready`, {
            file: result.file,
            duration: result.duration,
          });
        },
        () => bailIfCancelled(jobId),
        videoJob.fastAudio,
        false,
        ctx.signal,
        // Read only by the segmented TTS pipeline (TTS_SEGMENTED=true).
        {
          videoType: videoJob.type,
          style: videoJob.voiceStyle || undefined,
          voiceProfile: videoJob.voiceProfile || undefined,
          totalScenes,
          // Narration sub-stages ride the same jobProgress event the step
          // already emits (ttsStage field) - no second channel. Progress inside
          // the audio band advances with segments, not just whole scenes.
          onProgress: ({ stage, current, total, sceneNumber, progress }) => {
            if (stage === 'speech-aligning') {
              if (!alignmentStarted) {
                alignmentStarted = true;
                speechStage(SPEECH_EVENTS.ALIGNMENT_START, { sceneNumber });
              }
              speechStage(SPEECH_EVENTS.ALIGNMENT_PROGRESS, { sceneNumber, current: completedScenes - scenesWithAudio.length + 1 });
            }
            const within = (completedScenes + progress / 100) / totalScenes;
            SocketService.emitJobProgress({
              _id: jobId,
              progress: mapToBand(PROGRESS_BANDS.job.audio, Math.min(within, 0.99)),
              status: JOB_STATUS.GENERATING_AUDIO,
              currentStep: JOB_STATUS.GENERATING_AUDIO,
              currentScene: sceneNumber,
              ttsStage: { stage, current, total, progress },
            });
          },
          onSceneFailed: (sceneNumber, segments) =>
            VideoService.updateSceneSegments(jobId, sceneNumber, segments).catch((err) => {
              LoggerService.warn('Failed to persist failed segments', { jobId, sceneNumber, error: err.message });
            }),
        }
      );
    });
  } catch (err) {
    // ctx.signal (see processor.js) is aborted the moment a Stop request
    // reaches this process - see cancellationBus - which interrupts
    // whichever TTS call is currently in flight instead of waiting for it
    // to time out. Surface that the same way bailIfCancelled's checkpoints
    // do, so the outer pipeline treats it as a cancellation, not a failure.
    if (err.name === 'AbortError') throw new JobCancelledError(jobId);
    throw err;
  }

  if (speechEventsEnabled()) {
    speechStage(SPEECH_EVENTS.TTS_COMPLETE);
    // Every segment served from the cache means there was nothing to align.
    if (!alignmentStarted) speechStage(SPEECH_EVENTS.ALIGNMENT_START);
    speechStage(SPEECH_EVENTS.ALIGNMENT_COMPLETE);
    speechStage(SPEECH_EVENTS.TIMELINE_COMPLETE);
  }
}

module.exports = { run };
