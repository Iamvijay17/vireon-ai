const VideoService = require('../services/VideoService');
const ActivityLogService = require('../services/ActivityLogService');
const videoQueue = require('../queues/videoQueue');
const LoggerService = require('../services/LoggerService');
const SocketService = require('../services/SocketService');
const { validate, createVideoSchema, jobIdSchema } = require('../validators');

/**
 * (Re-)enqueue a job for the worker, always under a BullMQ jobId matching
 * our own Mongo _id (so /stop can look it up and remove it if still
 * queued). BullMQ treats `.add()` with an id that already exists as a
 * no-op - it does NOT create a new job run - so every restart/approve/
 * rerender/regenerate call needs to clear out the job's old BullMQ record
 * first (which sticks around for a while: removeOnComplete/removeOnFail
 * are age-based, 24h/7d), or the DB status updates but the worker never
 * actually reprocesses it.
 */
async function enqueueJob(jobId) {
  try {
    const existing = await videoQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch (err) {
    // Can't remove an actively-processing job (still locked) - fine, that
    // means it's already running and doesn't need re-adding anyway.
    LoggerService.warn('Could not clear prior BullMQ record before re-queueing', { jobId, error: err.message });
  }
  await videoQueue.add('render-video', { jobId }, { jobId });
}

class VideoController {
  /**
   * POST /api/videos - Create a new video job
   * Returns immediately with job ID - rendering happens in background.
   */
  static async create(req, res, next) {
    try {
      const data = validate(createVideoSchema)(req.body);
      const job = await VideoService.create(data);
      await ActivityLogService.add(job._id.toString(), 'Job created and queued');

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Add to BullMQ queue for background processing
      await enqueueJob(job._id.toString());

      LoggerService.info('Video job queued for processing', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.status(201).json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos - Get all videos
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const filters = {
        status: req.query.status,
        type: req.query.type,
        search: req.query.search,
      };
      const result = await VideoService.getAllJobs(page, limit, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos/:id - Get a single video job
   */
  static async getById(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.getById(id);
      res.json({ job });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/videos/:id - Delete a video job
   */
  static async delete(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const result = await VideoService.delete(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/restart - Restart a failed or stuck job
   */
  static async restart(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });

      // VideoService.restart() only blocks restarting a COMPLETED job - a
      // job that's genuinely still being processed by a live worker (not
      // stuck, just legitimately mid-render) has the same intermediate
      // status a stuck job would, so that check alone can't tell them
      // apart. BullMQ's own job state can: 'active' means a worker
      // currently holds its lock and is actively working it. Rewinding the
      // DB status underneath a live worker wouldn't cause double-processing
      // (enqueueJob's re-add is a no-op while the old record is still
      // locked), but it would leave misleading status in the UI/API until
      // the real worker finishes and overwrites it again - reject up front
      // instead.
      const existingBullJob = await videoQueue.getJob(id);
      if (existingBullJob && (await existingBullJob.getState()) === 'active') {
        throw { status: 400, message: 'Job is still actively being processed and cannot be restarted. If it appears stuck, wait a few minutes for automatic crash recovery, or stop it first.' };
      }

      const job = await VideoService.restart(id);
      await ActivityLogService.add(id, 'Job restarted');

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Re-add to BullMQ queue for background processing
      await enqueueJob(job._id.toString());

      LoggerService.info('Video job restarted for processing', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/approve - Approve a script that's awaiting manual
   * review. Fast-generation jobs resume straight into audio/image/render;
   * manual jobs stop here until /generate-audio is called explicitly.
   */
  static async approve(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.approve(id);
      await ActivityLogService.add(id, 'Script approved');

      // Emit socket event
      SocketService.emitJobCreated(job);

      if (job.fastGeneration) {
        // Re-add to BullMQ queue for background processing - the worker will
        // skip script generation since the job is no longer QUEUED.
        await enqueueJob(job._id.toString());

        LoggerService.info('Video job approved and queued for processing', {
          jobId: job._id,
          queue: 'video-rendering',
        });
      } else {
        LoggerService.info('Video job script approved (manual mode) - awaiting Generate Audio', {
          jobId: job._id,
        });
      }

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/generate-audio - Manual mode only: trigger audio
   * generation for an approved script.
   */
  static async generateAudio(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.generateAudio(id);

      SocketService.emitJobCreated(job);

      await enqueueJob(job._id.toString());

      LoggerService.info('Video job audio generation queued (manual mode)', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/generate-render - Manual mode only: trigger the
   * final image/render/upload stage once audio is ready.
   */
  static async generateRender(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.generateRender(id);

      SocketService.emitJobCreated(job);

      await enqueueJob(job._id.toString());

      LoggerService.info('Video job render queued (manual mode)', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/rerender - Re-render a completed or failed job
   * Resets to PREPARING_ASSETS state and re-runs rendering + upload.
   * Keeps existing script and audio data intact.
   */
  static async rerender(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.rerender(id);
      await ActivityLogService.add(id, 'Re-render started');

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Add to BullMQ queue for background processing
      await enqueueJob(job._id.toString());

      LoggerService.info('Video job queued for re-rendering', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/regenerate-script - Regenerate just the script
   * step for a job that already has one (e.g. stuck at AWAITING_APPROVAL
   * with a truncated/bad script). Clears the existing script and any
   * downstream audio/render output, then re-queues from script generation.
   */
  static async regenerateScript(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });

      // Same "actively processing" guard as restart - rewinding the DB
      // status underneath a live worker wouldn't cause double-processing
      // (enqueueJob's re-add is a no-op while the old record is still
      // locked), but it would leave misleading status in the UI until the
      // real worker finishes and overwrites it again.
      const existingBullJob = await videoQueue.getJob(id);
      if (existingBullJob && (await existingBullJob.getState()) === 'active') {
        throw { status: 400, message: 'Job is still actively being processed and cannot regenerate its script. Stop it first if it appears stuck.' };
      }

      const job = await VideoService.regenerateScript(id);
      await ActivityLogService.add(id, 'Script regeneration requested');

      SocketService.emitJobCreated(job);

      await enqueueJob(job._id.toString());

      LoggerService.info('Video job script regeneration queued', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/stop - Stop a running job. Marks it CANCELLED and
   * removes it from BullMQ if it hasn't started processing yet. A job that's
   * already actively running can't be removed from the queue mid-flight -
   * the worker itself notices the CANCELLED status at its next checkpoint
   * (see videoWorker.js) and stops there instead.
   */
  static async stop(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.stop(id);
      await ActivityLogService.add(id, 'Stopped by user');

      try {
        const bullJob = await videoQueue.getJob(id);
        if (bullJob) {
          const state = await bullJob.getState();
          if (['waiting', 'delayed', 'paused'].includes(state)) {
            await bullJob.remove();
            LoggerService.info('Removed not-yet-started job from queue', { jobId: id, state });
          }
        }
      } catch (queueErr) {
        LoggerService.warn('Could not remove queued job during stop', { jobId: id, error: queueErr.message });
      }

      SocketService.emitJobProgress(job);

      LoggerService.info('Video job stopped by user', { jobId: id });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos/:id/activity-logs - Get activity logs for a video job
   */
  static async getActivityLogs(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const logs = await ActivityLogService.getByVideo(id);
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VideoController;
