const AudioService = require('../../services/audio/audioService');
const AvatarService = require('../../services/avatar/avatarService');
const RemotionService = require('../../services/video/RemotionService');
const StorageService = require('../../services/storage/StorageService');
const { getStorageProvider } = require('../../services/storage/providers');

const IMAGE_BEARING = new Set(['image', 'contentwithimage']);

/**
 * Compile a video job's SceneGraph IR into a step DAG - the v2 replacement
 * shape for videoWorker/processor.js's 9 hard-coded sequential steps.
 *
 * Every scene's audio (and image, where the sceneType needs one) becomes
 * its own node with no edge between sibling scenes, so N independent
 * scenes can run concurrently instead of the strict for-loop
 * generateAllAudio uses today - see DagRunner.analyzeParallelism for how
 * to measure how much that actually buys on a given script.
 *
 * `handlers` lets a caller override how a node's work actually executes
 * (real side effects vs. a shadow/dry-run stub) without changing the
 * topology - see shadowHandlers below for the read-only variant used by
 * scripts/graphShadowRun.js.
 */
function compileVideoGraph({ jobId, ir, videoJob, handlers }) {
  const nodes = [];

  for (const scene of ir.scenes) {
    const needsAudio = Boolean(scene.audio.text);
    if (needsAudio) {
      // No DagRunner-level `cacheKey` here: the real hash needs an async
      // voice lookup, and the real handler's own TTS call already checks
      // CacheService internally (see AudioService.generateSceneAudio). The
      // shadow handler instead returns its predicted key in the result so
      // scripts/graphShadowRun.js can report hit/miss without DagRunner's
      // short-circuit needing to know about it.
      nodes.push({
        id: `scene.audio.${scene.sceneNumber}`,
        deps: [],
        run: (ctx) => handlers.sceneAudio(scene, ctx),
      });
    }

    if (IMAGE_BEARING.has(scene.sceneType) && scene.imagePrompt) {
      nodes.push({
        id: `scene.image.${scene.sceneNumber}`,
        deps: [],
        run: (ctx) => handlers.sceneImage(scene, ctx),
      });
    }
  }

  if (videoJob.avatarEnabled) {
    nodes.push({
      id: 'avatar',
      deps: [],
      run: (ctx) => handlers.avatar(ctx),
    });
  }

  const sceneWorkIds = nodes.map((n) => n.id);

  nodes.push({
    id: 'compose',
    deps: sceneWorkIds,
    run: (ctx) => handlers.compose(ctx),
  });

  nodes.push({
    id: 'render',
    deps: ['compose'],
    run: (ctx) => handlers.render(ctx),
  });

  nodes.push({
    id: 'upload',
    deps: ['render'],
    run: (ctx) => handlers.upload(ctx),
  });

  return nodes;
}

/**
 * Real handlers: thin wrappers around the exact same service calls
 * videoWorker's step modules make today (AudioService, AvatarService,
 * RemotionService, StorageService) - no reimplementation, so running a job
 * through this graph produces the same artifacts the sequential pipeline
 * would. Not wired into the live queue/worker; see scripts/graphRun.js for
 * how to invoke this deliberately against a real job.
 */
function realHandlers({ jobId, videoJob }) {
  return {
    sceneAudio: async (scene) => {
      const VideoService = require('../../services/video/VideoService');
      const voice = videoJob.type === 'podcast' ? undefined : videoJob.voice;
      const result = await AudioService.generateSceneAudio(jobId, scene, voice || scene.audio.voice, videoJob.fastAudio);
      // Persist immediately, same as audioStep.js's onSceneComplete callback
      // - compose (below) re-reads the job fresh, so a scene whose audio
      // node finished must already be visible there before compose runs.
      await VideoService.updateSceneAudio(jobId, scene.sceneNumber, result);
      return result;
    },
    sceneImage: async () => {
      throw new Error('Image generation has no standalone service call yet - not wired into the step graph');
    },
    avatar: async () => {
      const VideoService = require('../../services/video/VideoService');
      const sourceImagePath = AvatarService.resolveDefaultSourceImage(videoJob.voice);
      const result = await AvatarService.animatePortrait(jobId, sourceImagePath);
      const updated = await VideoService.updateAvatar(jobId, result);
      return { videoUrl: updated.avatarVideoUrl, position: videoJob.avatarPosition };
    },
    compose: async (ctx) => {
      // Re-read is deliberate: scene.audio nodes just persisted new
      // durations/files that the freshest script reflects.
      const VideoService = require('../../services/video/VideoService');
      const fresh = await VideoService.getById(jobId);
      const avatarResult = ctx.results.get('avatar');
      return RemotionService.prepareAssets(jobId, fresh.script, {
        resolution: videoJob.resolution,
        quality: videoJob.quality,
        aspectRatio: videoJob.aspectRatio,
        fontPairing: videoJob.fontPairing,
        type: videoJob.type,
        avatar: avatarResult?.value,
      });
    },
    render: async (ctx) => RemotionService.renderVideo(jobId, ctx.results.get('compose').value),
    upload: async () => {
      const path = require('path');
      const fs = require('fs').promises;
      const renderDir = path.resolve(__dirname, '../../../jobs', jobId, 'render');
      const files = await fs.readdir(renderDir).catch(() => []);
      const urls = {};
      for (const fileName of files) {
        const url = await getStorageProvider().uploadFile(jobId, path.join(renderDir, fileName), 'render');
        if (/\.(mp4|mov|webm)$/i.test(fileName)) urls.videoUrl = url;
        else if (/\.(png|jpe?g)$/i.test(fileName)) urls.thumbnailUrl = url;
      }
      await StorageService.cleanupJob(jobId);
      return urls;
    },
  };
}

/**
 * Shadow handlers: never touch TTS/GPU/storage. Each returns what it would
 * have needed to do the real work, so DagRunner's cache resolver (see
 * scripts/graphShadowRun.js) can classify the node as a predicted hit or
 * miss using AudioService.predictCacheKey - the exact same hash the real
 * TTS call would check against.
 */
function shadowHandlers({ videoJob }) {
  return {
    sceneAudio: async (scene) => {
      const voice = videoJob.type === 'podcast' ? undefined : (videoJob.voice || scene.audio.voice);
      const cacheKey = await AudioService.predictCacheKey(scene, voice, videoJob.fastAudio);
      return { predicted: true, cacheKey };
    },
    sceneImage: async () => ({ predicted: true }),
    avatar: async () => ({ predicted: true }),
    compose: async () => ({ predicted: true }),
    render: async () => ({ predicted: true }),
    upload: async () => ({ predicted: true }),
  };
}

module.exports = { compileVideoGraph, realHandlers, shadowHandlers };
