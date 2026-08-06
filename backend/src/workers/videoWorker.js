const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const LoggerService = require('../services/LoggerService');

// Mirrors server.js's handlers - this process had neither before, meaning
// any unhandled rejection (e.g. @gradio/client's Client.close() aborting an
// internal SSE reader it never itself catches AbortError on - see
// audioService.js's _synthesizeSceneAudio) would crash the whole worker
// process on Node's default unhandled-rejection behavior, silently killing
// every job it was concurrently processing (concurrency: 3), not just the
// one that happened to trigger it. uncaughtException still exits (the
// process is in an undefined state past that point - Node's own default
// behavior is the same, this just guarantees it's logged through
// LoggerService first); unhandledRejection is logged and swallowed instead
// of being fatal, same tradeoff server.js already made.
process.on('uncaughtException', (err) => {
  LoggerService.error('Worker uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  LoggerService.error('Worker unhandled rejection', { reason: reason?.message || reason });
});

// Connect to MongoDB on worker startup
mongoose.connect(config.mongodb.uri, {
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
}).then(() => {
  LoggerService.success('Worker MongoDB connected successfully');
}).catch((err) => {
  LoggerService.error('Worker MongoDB connection failed', { error: err.message });
  process.exit(1);
});
const VideoService = require('../services/VideoService');
const ActivityLogService = require('../services/ActivityLogService');
const PromptService = require('../services/PromptService');
const LMStudioService = require('../services/LMStudioService');
const ScriptParserService = require('../services/ScriptParserService');
const AudioService = require('../services/TTS/audioService');
const RemotionService = require('../services/RemotionService');
const StorageService = require('../services/StorageService');
const GitHubService = require('../services/GitHubService');
const SocketService = require('../services/SocketService');
const { JOB_STATUS } = require('../constants');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

/**
 * Thrown when a job is found to be CANCELLED at one of the worker's
 * checkpoints. Caught specially in the outer catch block so cancellation
 * doesn't get treated as a failure (no FAILED status, no BullMQ retry).
 */
class JobCancelledError extends Error {
  constructor(jobId) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelledError';
    this.cancelled = true;
  }
}

/**
 * Checkpoint called between pipeline steps and per-scene loop iterations.
 * There's no way to kill an in-flight LM Studio/TTS/Remotion/upload
 * call directly, so cancellation only takes effect at these checkpoints -
 * the worker can be mid-step for a while after a stop request before it
 * actually notices and bails out.
 */
async function bailIfCancelled(jobId) {
  const current = await VideoService.getById(jobId).catch(() => null);
  if (current?.status === JOB_STATUS.CANCELLED) {
    throw new JobCancelledError(jobId);
  }
}

/**
 * Check if render output exists on disk for a job.
 */
async function renderExists(jobId) {
  const fs = require('fs').promises;
  const path = require('path');
  const renderPath = path.resolve(__dirname, '../../jobs', jobId, 'render', 'video.mp4');
  try {
    await fs.access(renderPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Video rendering worker.
 * Processes jobs from the BullMQ queue through the 9-step pipeline.
 * Never crashes - all errors are caught and logged.
 * Supports resuming from failed steps.
 */
const worker = new Worker(
  'video-rendering',
  async (job) => {
    const { jobId } = job.data;
    LoggerService.border(`🎬 Processing Job: ${jobId}`, 'event');

    // Get job details to check current state
    const videoJob = await VideoService.getById(jobId);
    const currentStatus = videoJob.status;

    // Determine script to use (existing or generate new)
    let script = videoJob.script;

    // Track the current step for error reporting
    let currentStep = null;

    try {
      // ── Step 1: Script Generation (only if starting fresh or restarting from QUEUED)
      const needsScriptGeneration = !script?.scenes?.length || currentStatus === JOB_STATUS.QUEUED;

      if (needsScriptGeneration) {
        currentStep = JOB_STATUS.SCRIPT_GENERATION;
        await VideoService.updateStatus(jobId, JOB_STATUS.SCRIPT_GENERATION, { progress: 10 });
        SocketService.emitJobProgress({ _id: jobId, progress: 10, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: 0 });

        LoggerService.info('Starting script generation', { topic: videoJob.topic, type: videoJob.type });
        await ActivityLogService.add(jobId, 'Script generation started');

        // ── Step 2: Derive an exact scene count from the requested duration.
        const durationMinutes = videoJob.duration || 5;
        const totalDuration = durationMinutes * 60;
        // Word budget for LM Studio, matching CourseVideoService's ~130
        // words/min spoken pace. Without a length target the model writes a
        // fixed-length script regardless of scene count, so total runtime
        // doesn't scale with the requested duration.
        //
        // Measured across real runs, the model consistently UNDERSHOOTS a
        // soft "about N words" instruction rather than hitting it - a
        // "small scenes, more of them" podcast script came in at ~78% of
        // its target, an aggregate-target podcast script at ~67%, and an
        // educational script at ~55%. A flat 1.5x buffer on the target fed
        // into the prompt compensates for the typical case without being
        // so aggressive it inflates the token/context budget (which scales
        // off this same number) past what's actually needed.
        //
        // Scene COUNT is derived from the unbuffered word count so it stays
        // anchored to the original ratios (podcast: ~20 scenes per 3min;
        // others: ~2 scenes/min) - only wordsPerScene picks up the buffer.
        // Buffering scene count too would have compounded with podcast's
        // "more, shorter scenes" mechanism (a 30min podcast would ask for
        // ~293 turns instead of ~195, blowing past the token budget again).
        const WORD_COUNT_UNDERSHOOT_BUFFER = 1.5;
        const baseWordCount = Math.round(durationMinutes * 130);
        const wordCount = Math.round(baseWordCount * WORD_COUNT_UNDERSHOOT_BUFFER);

        let sceneCount, wordsPerScene;
        if (videoJob.type === 'podcast') {
          // Podcast turns are cheap to add (every turn reuses the same
          // shared cover image - no extra image-gen cost per turn) and read
          // more naturally as many short back-and-forth exchanges than a
          // few long monologues. Scale duration by adding MORE turns at a
          // ~20 words/turn baseline (matching real measured TTS timing);
          // the buffer nudges that up moderately per turn rather than
          // adding even more turns.
          sceneCount = Math.max(3, Math.round(baseWordCount / 20));
          wordsPerScene = Math.round(wordCount / sceneCount);
        } else {
          // Other types render a unique background/image per scene, so
          // scene count stays modest (~2/min, matching CourseVideoService's
          // heuristic) and duration is scaled via longer narration per
          // scene instead, with a floor of 3 for an intro/content/summary
          // shape.
          sceneCount = Math.max(3, Math.round(durationMinutes * 2));
          wordsPerScene = Math.round(wordCount / sceneCount);
        }

        // ── Step 2: Render prompt template
        const prompt = PromptService.render(videoJob.type, {
          topic: videoJob.topic,
          language: videoJob.language,
          sceneCount: sceneCount,
          wordCount: wordCount,
          wordsPerScene: wordsPerScene,
        });

        // A fixed max_tokens doesn't scale with the requested duration - a
        // longer script gets cut off mid-JSON ("Unexpected end of JSON
        // input") once its response would exceed the old flat 10000-token
        // budget. Estimate the actual response size instead: ~80 tokens/
        // scene for the surrounding JSON structure (keys, punctuation,
        // short field values like backgroundColor/transition), plus
        // narration at ~1.4 tokens/word. Non-podcast types repeat the
        // narration text twice per scene (once split into scene_meta.content
        // sentences, once whole in audio.text), roughly doubling its token
        // cost; podcast turns only carry it once (audio.text). A 25% buffer
        // covers the model's per-token variance, floored at the old default
        // (so short scripts are unaffected) and capped so a runaway
        // estimate can't request something the model can't produce anyway.
        const narrationMultiplier = videoJob.type === 'podcast' ? 1 : 2;
        const estimatedTokens = Math.round(
          (sceneCount * 80 + wordCount * 1.4 * narrationMultiplier) * 1.25
        );
        const scriptMaxTokens = Math.min(32000, Math.max(10000, estimatedTokens));
        // Generating more tokens takes proportionally longer on a local
        // model - scale the request timeout with it too, capped at 10
        // minutes of *scaling* so it never falls below whatever the user
        // has explicitly configured (LM_STUDIO_TIMEOUT).
        const scriptTimeout = Math.max(config.lmStudio.timeout, Math.min(600000, scriptMaxTokens * 50));

        await bailIfCancelled(jobId);

        // ── Step 3: Call LM Studio
        const rawScript = await LMStudioService.generateScript(prompt, {
          maxTokens: scriptMaxTokens,
          timeout: scriptTimeout,
        });
        script = ScriptParserService.validate(rawScript, videoJob.type, {
          hostVoice: videoJob.hostVoice,
          guestVoice: videoJob.guestVoice,
          seed: jobId,
        });

        // Save script to disk
        await ScriptParserService.saveScript(jobId, script);

        // Update job with script
        await VideoService.updateScript(jobId, script);

        LoggerService.success('Script generated and saved', {
          title: script.title,
          scenes: script.scenes.length,
        });

        // A stop request that arrived while the LM Studio call was in
        // flight wouldn't have been caught by the checkpoint before that
        // call - check again now, before writing AWAITING_APPROVAL, so a
        // cancellation can't get silently overwritten by this step's own
        // success path.
        await bailIfCancelled(jobId);

        // ── Pause here: wait for explicit manual approval before spending
        // TTS/image/render resources on this script. The user reviews/edits
        // it (and can set manual scene image URLs) in the Studio Editor,
        // then POST /:id/approve re-enqueues this same job - at that point
        // `needsScriptGeneration` above will be false (script exists, status
        // isn't QUEUED) so it resumes straight into Step 4 below.
        await VideoService.updateStatus(jobId, JOB_STATUS.AWAITING_APPROVAL, { progress: 20 });
        SocketService.emitJobProgress({ _id: jobId, progress: 20, status: JOB_STATUS.AWAITING_APPROVAL, currentStep: JOB_STATUS.AWAITING_APPROVAL, currentScene: 0 });

        LoggerService.info('Script awaiting manual approval - pausing pipeline', { jobId });
        await ActivityLogService.add(jobId, 'Script generated successfully. Please review and approve.');

        return { success: true, jobId, awaitingApproval: true };
      } else {
        LoggerService.info('Using existing script (skipping script generation)', {
          title: script.title,
          scenes: script.scenes.length,
          currentStatus,
        });
      }

      await bailIfCancelled(jobId);

      // ── Step 4: Audio Generation (skip if all scenes have audio files)
      const scenesWithAudio = script.scenes.filter(s => s.audio?.file);
      const needsAudioGeneration = scenesWithAudio.length < script.scenes.length;

      if (needsAudioGeneration) {
        currentStep = JOB_STATUS.GENERATING_AUDIO;
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
          () => bailIfCancelled(jobId)
        );
      } else {
        LoggerService.info('All audio already generated, skipping audio step');
      }

      // Catches a cancellation that landed after the last scene's audio
      // finished but before AUDIO_COMPLETED gets written below.
      await bailIfCancelled(jobId);

      // Re-fetch the job from DB to get updated scene durations from audio generation
      const updatedJob = await VideoService.getById(jobId);
      script = updatedJob.script;

      await VideoService.updateStatus(jobId, JOB_STATUS.AUDIO_COMPLETED, { progress: 50 });
      SocketService.emitJobProgress({ _id: jobId, progress: 50, status: JOB_STATUS.AUDIO_COMPLETED, currentStep: JOB_STATUS.AUDIO_COMPLETED, currentScene: script.scenes.length });

      LoggerService.success('Audio generation complete', { files: script.scenes.length });
      await ActivityLogService.add(jobId, 'Audio generated successfully.');

      // ── Pause here for manual-mode jobs (fastGeneration: false): wait for
      // an explicit POST /:id/generate-render before spending image/render
      // resources, mirroring the script-approval pause above. Only pause the
      // first time we reach this point in a given run (currentStatus was
      // still pre-audio when this job started) - if we're resuming from a
      // manual generate-render trigger (or a restart mid-render), currentStatus
      // is already AUDIO_COMPLETED or later, so fall through and continue.
      const PRE_AUDIO_STATUSES = [
        JOB_STATUS.QUEUED,
        JOB_STATUS.SCRIPT_GENERATION,
        JOB_STATUS.SCRIPT_COMPLETED,
        JOB_STATUS.AWAITING_APPROVAL,
        JOB_STATUS.GENERATING_AUDIO,
      ];
      if (!videoJob.fastGeneration && PRE_AUDIO_STATUSES.includes(currentStatus)) {
        LoggerService.info('Audio complete - pausing pipeline for manual render trigger (fastGeneration=false)', { jobId });
        return { success: true, jobId, awaitingRender: true };
      }

      await bailIfCancelled(jobId);

      // ── Step 6: Prepare Assets (always regenerate to include latest imageUrl and templateId)
      // Delete old assets.json if it exists to force regeneration with updated data
      const fs = require('fs').promises;
      const path = require('path');
      const oldAssetsPath = path.resolve(__dirname, '../../jobs', jobId, 'assets.json');
      try { await fs.unlink(oldAssetsPath); } catch {}

      currentStep = JOB_STATUS.PREPARING_ASSETS;
      await VideoService.updateStatus(jobId, JOB_STATUS.PREPARING_ASSETS, { progress: 70 });
      SocketService.emitJobProgress({ _id: jobId, progress: 70, status: JOB_STATUS.PREPARING_ASSETS, currentStep: JOB_STATUS.PREPARING_ASSETS, currentScene: 0 });

      const assetsPath = await RemotionService.prepareAssets(jobId, script, {
        resolution: videoJob.resolution,
        aspectRatio: videoJob.aspectRatio,
        type: videoJob.type,
      });

      LoggerService.success('Assets prepared');

      await bailIfCancelled(jobId);

      // ── Step 7: Render Video
      // Always re-render to ensure we have a valid, complete render
      // Remove old render if it exists to force clean re-render
      const renderPath = path.resolve(__dirname, '../../jobs', jobId, 'render', 'video.mp4');
      try { await fs.rm(renderPath, { recursive: true, force: true }); } catch {}
      try { await fs.rm(path.resolve(__dirname, '../../jobs', jobId, 'render'), { recursive: true, force: true }); } catch {}

      currentStep = JOB_STATUS.RENDERING;
      await VideoService.updateStatus(jobId, JOB_STATUS.RENDERING, { progress: 80 });
      SocketService.emitJobProgress({ _id: jobId, progress: 80, status: JOB_STATUS.RENDERING, currentStep: JOB_STATUS.RENDERING, currentScene: 0 });

      await ActivityLogService.add(jobId, 'Rendering started');

      const renderResult = await RemotionService.renderVideo(jobId);

      LoggerService.success('Video rendered', renderResult);
      await ActivityLogService.add(jobId, 'Rendering complete. Uploading assets to cloud storage...');

      await bailIfCancelled(jobId);

      // ── Step 8: Upload to GitHub
      currentStep = JOB_STATUS.UPLOADING;
      await VideoService.updateStatus(jobId, JOB_STATUS.UPLOADING, { progress: 95 });
      SocketService.emitJobProgress({ _id: jobId, progress: 95, status: JOB_STATUS.UPLOADING, currentStep: JOB_STATUS.UPLOADING, currentScene: 0 });

      const uploadFiles = await StorageService.getUploadFiles(jobId);
      const uploaded = await GitHubService.uploadJobAssets(jobId, uploadFiles);

      LoggerService.success('Upload complete', {
        script: uploaded.script?.length || 0,
        audio: uploaded.audio?.length || 0,
        render: uploaded.render?.length || 0,
      });
      await ActivityLogService.add(jobId, 'Assets uploaded to cloud storage.');

      // ── Step 9: Complete Job
      const completedJob = await VideoService.complete(jobId, {
        videoUrl: uploaded.render?.[0] || '',
        thumbnailUrl: uploaded.render?.[1] || '',
        scriptUrl: uploaded.script?.[0] || '',
        audioUrls: uploaded.audio || [],
        assetsUrl: uploaded.script?.[1] || '',
      });

      SocketService.emitJobCompleted(completedJob);
      await ActivityLogService.add(jobId, 'Video generation completed!');

      LoggerService.border(`✅ Job Complete: ${jobId}`, 'success');
      LoggerService.success('Video generation pipeline finished', {
        jobId,
        videoUrl: completedJob.videoUrl,
      });

      // Cleanup local files
      await StorageService.cleanupJob(jobId);

      return { success: true, jobId };
    } catch (err) {
      if (err.cancelled) {
        // Status is already CANCELLED (set by VideoService.stop, which is
        // what triggered this bailout) - don't overwrite it with FAILED, and
        // don't re-throw, since a cancellation isn't something BullMQ should
        // retry.
        LoggerService.info(`Job ${jobId} stopped mid-pipeline at ${currentStep}`, { jobId });
        try {
          const cancelledJob = await VideoService.getById(jobId);
          SocketService.emitJobProgress(cancelledJob);
        } catch (dbErr) {
          LoggerService.error('Failed to read cancelled job status', { error: dbErr.message });
        }
        return { success: false, jobId, cancelled: true };
      }

      LoggerService.error(`Job ${jobId} failed`, {
        error: err.message,
        step: currentStep,
        stack: config.isDev ? err.stack : undefined,
      });

      // Mark job as failed in database with the actual step
      try {
        const failedJob = await VideoService.fail(jobId, err.message, currentStep || 'PROCESSING');
        SocketService.emitJobFailed(failedJob, err.message);
        await ActivityLogService.add(jobId, `${currentStep || 'Processing'} failed: ${err.message}`);
      } catch (dbErr) {
        LoggerService.error('Failed to update job status in DB', { error: dbErr.message });
      }

      // Re-throw so BullMQ can handle retries
      throw err;
    }
  },
  {
    connection,
    concurrency: 3, // Process up to 3 jobs concurrently
    // BullMQ auto-renews this lock (roughly every lockDuration/2) for as
    // long as the worker process is alive and actively processing - a long
    // render doesn't need a long lockDuration, it just needs the process to
    // stay up. lockDuration only controls how long a *dead* worker's
    // abandoned lock lingers before another worker can reclaim the job. This
    // was set to 60 minutes on the mistaken assumption it needed to cover a
    // whole job's runtime, which meant a crashed/restarted worker left its
    // in-progress job stuck (unreclaimable) for up to an hour - hit this
    // directly (had to manually clear a stuck Redis lock to unstick a job).
    // 5 minutes comfortably covers the renewal interval while keeping
    // crash-recovery fast.
    lockDuration: 300_000,
    stalledInterval: 60_000, // Check for stalled jobs every 60 seconds
    maxStalledCount: 3, // Allow up to 3 stalled checks before failing
    limiter: {
      max: 10, // Max 10 jobs per second
      duration: 1000,
    },
  }
);

worker.on('completed', (job) => {
  LoggerService.info(`Worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  LoggerService.error(`Worker failed job ${job.id}`, { error: err.message });
});

worker.on('error', (err) => {
  LoggerService.error('Worker error', { error: err.message });
});

// Fires when a job's lock expired without renewal (its worker crashed/died
// mid-processing) and BullMQ is reclaiming it for reprocessing. The pipeline
// itself is resumable (script/audio/render steps each skip work already
// persisted), so this is safe - logged so a recurring pattern is visible
// instead of silently eating a few minutes of recovery time every time.
worker.on('stalled', (jobId) => {
  LoggerService.warn(`Job ${jobId} stalled - its worker likely crashed mid-processing, reclaiming for reprocessing`);
});

LoggerService.border('🎥 Video Worker Started', 'event');
LoggerService.info('Worker listening for jobs', {
  queue: 'video-rendering',
  concurrency: 3,
  redis: `${config.redis.host}:${config.redis.port}`,
});

module.exports = worker;
