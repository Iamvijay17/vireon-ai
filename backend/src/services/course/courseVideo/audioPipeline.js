const CourseVideo = require('../../../models/CourseVideo');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const ActivityLogService = require('../../common/ActivityLogService');
const AudioService = require('../../audio/audioService');
const ScriptParserService = require('../../video/ScriptParserService');
const { getStorageProvider } = require('../../storage/providers');
const { VIDEO_STATUS, STAGE_STATUS } = require('../../../constants');
const { bailIfCancelled } = require('./shared');

/**
 * Generate audio for an approved video.
 */
async function generateAudio(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  if (!video.script?.scenes?.length) {
    throw { status: 400, message: 'A script must exist before generating audio' };
  }
  if (!video.approved) {
    throw { status: 400, message: 'The script must be approved before generating audio' };
  }

  video.status = VIDEO_STATUS.GENERATING_AUDIO;
  video.audioStatus = STAGE_STATUS.PROCESSING;
  await video.save();

  await ActivityLogService.add(videoId, 'Audio generation started');
  SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_AUDIO, 40, 'Generating audio...');

  try {
    // Plain object copy (not the live Mongoose subdocument) so it can be
    // freely spread/mutated below, then written back to video.script as
    // a whole once audio results are in.
    const scriptData = video.script.toObject();
    const scenes = scriptData.scenes;

    // Convert scenes to the format expected by AudioService
    // Ensure sceneType is included in the audio scenes
    const audioScenes = scenes.map((s, index) => {
      let sceneType = s.sceneType;
      if (!sceneType) {
        const sceneNum = s.sceneNumber || (index + 1);
        sceneType = sceneNum === 1 ? 'title' : 'content';
      }
      return {
        sceneNumber: s.sceneNumber || (index + 1),
        sceneType,
        audio: {
          text: s.audio?.text || s.title || '',
        },
      };
    });

    // Generate audio for all scenes - use videoId as job directory.
    // onSceneComplete persists + broadcasts each scene's audio as soon as
    // it's ready, so the course video detail page can show scenes
    // incrementally instead of waiting for the whole batch to finish.
    const jobId = video._id.toString();
    let sceneAudioDoneCount = 0;
    const audioResults = await AudioService.generateAllAudio(
      jobId,
      audioScenes,
      video.voice,
      async (sceneNumber, result) => {
        await CourseVideo.updateOne(
          { _id: videoId, 'script.scenes.sceneNumber': sceneNumber },
          {
            $set: {
              'script.scenes.$.audio.file': result.file,
              'script.scenes.$.audio.duration': result.duration,
              'script.scenes.$.duration': result.duration,
            },
          }
        );
        sceneAudioDoneCount += 1;
        await ActivityLogService.add(
          videoId,
          `Scene ${sceneNumber} audio generated (${sceneAudioDoneCount}/${audioScenes.length})`
        );
        SocketService.emitCourseVideoSceneAudioReady(video, sceneNumber, result);
      },
      () => bailIfCancelled(videoId),
      video.fastAudio
    );

    // Update each scene with actual audio duration
    for (const result of audioResults) {
      // Extract scene number from the result - either from sceneNumber property or from filename
      const sceneNum = result.sceneNumber || (typeof result.file === 'string' ? parseInt(result.file.match(/\d+/)?.[0], 10) : null);
      const scene = scriptData.scenes.find(s => s.sceneNumber === sceneNum);
      if (scene && result.duration) {
        scene.audio = {
          ...scene.audio,
          file: result.file,
          duration: result.duration,
        };
        // Update scene duration to match actual audio duration
        scene.duration = result.duration;
      }
    }

    // Save updated script with audio durations back to database and disk
    video.script = scriptData;

    // Also save updated script to disk for Remotion pipeline (durations
    // changed, content did too).
    await ScriptParserService.saveScript(video._id.toString(), scriptData);

    // Store audio URL (first scene's audio for preview). Each scene's
    // audio is already uploaded to storage the moment it's synthesized
    // (see AudioService._synthesizeSceneAudio), so build the public URL
    // from the storage provider instead of the local-disk static route.
    if (audioResults.length > 0) {
      video.audioUrl = audioResults[0].file
        ? getStorageProvider().getPublicUrl(jobId, 'audio', audioResults[0].file)
        : '';
      video.audioDuration = audioResults.reduce((sum, r) => sum + (r.duration || 0), 0);
    }

    video.status = VIDEO_STATUS.AUDIO_GENERATED;
    video.audioStatus = STAGE_STATUS.COMPLETED;
    video.audioGeneratedAt = new Date();
    await video.save();

    LoggerService.info('Course video audio generated', {
      videoId,
      courseId: video.courseId,
      scenes: audioResults.length,
      totalDuration: video.audioDuration,
    });

    await ActivityLogService.add(videoId, 'Audio generated successfully.', video.audioGeneratedAt);
    SocketService.emitCourseVideoAudioReady(video, 'Audio generated successfully.');

    return video;
  } catch (err) {
    if (err.cancelled) {
      await ActivityLogService.add(videoId, 'Audio generation stopped by user');
      throw err;
    }

    video.status = VIDEO_STATUS.FAILED;
    video.audioStatus = STAGE_STATUS.FAILED;
    video.audioError = { message: err.message, failedAt: new Date() };
    video.error = {
      message: err.message,
      step: 'Audio Generation',
      retryCount: (video.error?.retryCount || 0) + 1,
    };
    await video.save();

    await ActivityLogService.add(videoId, `Audio generation failed: ${err.message}`);
    SocketService.emitCourseVideoFailed(video, err.message, 'Audio Generation');

    throw err;
  }
}

/**
 * Regenerate audio for a single scene, rather than the whole lesson.
 * Runs synchronously (not queued) since it's one TTS call, not a batch -
 * mirrors AudioService.generateAllAudio's per-scene persistence pattern
 * but for exactly one scene, on demand.
 */
async function regenerateSceneAudio(videoId, sceneNumber) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  const scene = video.script?.scenes?.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) {
    throw { status: 404, message: `Scene ${sceneNumber} not found` };
  }

  const jobId = video._id.toString();
  const audioScene = {
    sceneNumber,
    sceneType: scene.sceneType || 'content',
    audio: { text: scene.audio?.text || scene.title || '' },
  };

  try {
    const [result] = await AudioService.generateAllAudio(jobId, [audioScene], video.voice, undefined, undefined, video.fastAudio);
    if (!result) {
      throw new Error('Audio generation returned no result');
    }

    await CourseVideo.updateOne(
      { _id: videoId, 'script.scenes.sceneNumber': sceneNumber },
      {
        $set: {
          'script.scenes.$.audio.file': result.file,
          'script.scenes.$.audio.duration': result.duration,
          'script.scenes.$.duration': result.duration,
        },
      }
    );

    await ActivityLogService.add(videoId, `Scene ${sceneNumber} audio regenerated`);
    SocketService.emitCourseVideoSceneAudioReady(video, sceneNumber, result);

    LoggerService.info('Course video scene audio regenerated', { videoId, sceneNumber });

    return { sceneNumber, audio: { file: result.file, duration: result.duration } };
  } catch (err) {
    await ActivityLogService.add(videoId, `Scene ${sceneNumber} audio regeneration failed: ${err.message}`);
    throw err;
  }
}

module.exports = { generateAudio, regenerateSceneAudio };
