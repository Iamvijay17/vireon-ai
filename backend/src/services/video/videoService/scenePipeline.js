const VideoJob = require('../../../models/VideoJob');
const LoggerService = require('../../common/LoggerService');
const ActivityLogService = require('../../common/ActivityLogService');
const AudioService = require('../../audio/audioService');
const { updateSceneAudio } = require('./statusUpdates');

/**
 * Regenerate audio for a single scene, rather than the whole job. Runs
 * synchronously (not queued) since it's one TTS call, not a batch.
 * Lazily requires SocketService to avoid a circular require -
 * SocketService.js already requires VideoService at the top level.
 */
async function regenerateSceneAudio(jobId, sceneNumber) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  const scene = job.script?.scenes?.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) {
    throw { status: 404, message: `Scene ${sceneNumber} not found` };
  }

  const SocketService = require('../../common/SocketService');

  try {
    const result = await AudioService.generateSceneAudio(
      jobId,
      scene,
      job.voice || scene.audio?.voice,
      job.fastAudio,
    );
    if (!result) {
      throw new Error('Audio generation returned no result');
    }

    await updateSceneAudio(jobId, sceneNumber, result);
    await ActivityLogService.add(jobId, `Scene ${sceneNumber} audio regenerated`);
    SocketService.emitSceneAudioReady(jobId, sceneNumber, result);

    LoggerService.info('Video job scene audio regenerated', { jobId, sceneNumber });

    return { sceneNumber, audio: { file: result.file, duration: result.duration } };
  } catch (err) {
    await ActivityLogService.add(jobId, `Scene ${sceneNumber} audio regeneration failed: ${err.message}`);
    throw err;
  }
}

module.exports = { regenerateSceneAudio };
