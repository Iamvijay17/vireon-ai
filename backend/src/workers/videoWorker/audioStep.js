const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const AudioService = require('../../services/audio/audioService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');
const { bailIfCancelled } = require('./shared');

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

  await AudioService.generateAllAudio(
    jobId,
    scenesToProcess,
    jobVoice,
    async (sceneNumber, result) => {
      // Persist and broadcast as soon as this individual scene's audio is ready,
      // instead of waiting for the whole batch to finish.
      await VideoService.updateSceneAudio(jobId, sceneNumber, result);
      SocketService.emitSceneAudioReady(jobId, sceneNumber, result);
      LoggerService.info(`Scene ${sceneNumber} audio ready`, {
        file: result.file,
        duration: result.duration,
      });
    },
    () => bailIfCancelled(jobId),
    videoJob.fastAudio
  );
}

module.exports = { run };
