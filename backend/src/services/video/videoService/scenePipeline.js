const VideoJob = require('../../../models/VideoJob');
const LoggerService = require('../../common/LoggerService');
const ActivityLogService = require('../../common/ActivityLogService');
const AudioService = require('../../audio/audioService');
const { updateSceneAudio } = require('./statusUpdates');
const config = require('../../../config');
const { NotFoundError, ConflictError, ValidationError } = require('../../../utils/errors');

/**
 * Script-level context the segmented TTS pipeline plans a scene with. Must
 * match what the worker's audio step passes, otherwise a regenerated scene
 * would be planned differently (first/last-scene cues, style) from the
 * original and miss its own cache entries.
 */
function audioOptions(job) {
  return {
    videoType: job.type,
    style: job.voiceStyle || undefined,
    voiceProfile: job.voiceProfile || undefined,
    totalScenes: job.script?.scenes?.length,
  };
}

/**
 * Regenerate audio for a single scene, rather than the whole job. Runs
 * synchronously (not queued) since it's one TTS call, not a batch.
 * Lazily requires SocketService to avoid a circular require -
 * SocketService.js already requires VideoService at the top level.
 */
async function regenerateSceneAudio(jobId, sceneNumber) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  const scene = job.script?.scenes?.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) {
    throw new NotFoundError(`Scene ${sceneNumber} not found`);
  }

  const SocketService = require('../../common/SocketService');

  try {
    // skipCache: true - an explicit regenerate must always produce a fresh
    // take, never a cached one, even if this exact (text, voice) was
    // already cached from another job. The fresh result still gets written
    // back into the cache afterward. See AudioService.generateSceneAudio.
    const result = await AudioService.generateSceneAudio(
      jobId,
      scene,
      job.voice || scene.audio?.voice,
      job.fastAudio,
      true,
      audioOptions(job),
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

/**
 * Re-synthesize one failed (or unsatisfactory) narration segment of a scene.
 * Every other segment is served from the cache, so only the named segment
 * touches the GPU. Requires the segmented pipeline.
 */
async function retrySceneSegment(jobId, sceneNumber, segmentId) {
  if (!config.audio.segmentedTts) {
    throw new ConflictError('Segment retry needs the segmented narration pipeline (TTS_SEGMENTED=true)');
  }

  const job = await VideoJob.findById(jobId);
  if (!job) throw new NotFoundError('Job not found');
  const scene = job.script?.scenes?.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) throw new NotFoundError(`Scene ${sceneNumber} not found`);

  // Segment ids are deterministic from (scene, position); a stored list is only
  // a hint, so also accept an id the current text still produces.
  const known = (scene.audio?.segments || []).map((s) => s.id);
  if (known.length > 0 && !known.includes(segmentId)) {
    throw new NotFoundError(`Segment ${segmentId} not found in scene ${sceneNumber}`);
  }
  if (!/^s\d{2,}-seg\d{3,}$/.test(segmentId)) throw new ValidationError('Invalid segment id');

  const SocketService = require('../../common/SocketService');

  try {
    const result = await AudioService.generateSceneAudio(
      jobId,
      scene,
      job.voice || scene.audio?.voice,
      job.fastAudio,
      false,
      { ...audioOptions(job), forceSegmentIds: [segmentId] },
    );
    if (!result) throw new Error('Audio generation returned no result');

    await updateSceneAudio(jobId, sceneNumber, result);
    await ActivityLogService.add(jobId, `Scene ${sceneNumber} segment ${segmentId} regenerated`);
    SocketService.emitSceneAudioReady(jobId, sceneNumber, result);
    return { sceneNumber, segmentId, audio: { file: result.file, duration: result.duration }, segments: result.segments };
  } catch (err) {
    await ActivityLogService.add(jobId, `Scene ${sceneNumber} segment ${segmentId} retry failed`);
    throw err;
  }
}

module.exports = { regenerateSceneAudio, retrySceneSegment };
