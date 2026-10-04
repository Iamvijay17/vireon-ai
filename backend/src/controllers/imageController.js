const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const ImageGeneration = require('../models/ImageGeneration');
const ImageGenerationService = require('../services/image/ImageGenerationService');
const LocalAIService = require('../services/localAI');
const { getStorageProvider } = require('../services/storage/providers');
const LoggerService = require('../services/common/LoggerService');
const { createImageSchema, imageIdSchema, validate } = require('../validators');

// Ids of generations this process is working on right now. A PENDING record
// that is not in here was orphaned by a restart (the work lived only in this
// process), so list() reports it as failed instead of spinning forever.
const active = new Set();

// Live state of each active generation, kept in memory (it only means something
// while the work runs in this process) and served by GET /api/images/progress so
// the page can poll once a second without touching the database.
//   phase: queued (waiting for the GPU) -> loading (models) -> sampling -> saving
const progress = new Map();
const PHASE_PERCENT = { queued: 0, loading: 3, saving: 97 };

function setProgress(id, update) {
  const next = { ...progress.get(id), ...update };
  if (next.phase === 'sampling' && next.steps > 0) {
    // Sampling is nearly all of the wall time: it owns 5-95%.
    next.percent = Math.min(95, 5 + Math.round((90 * next.step) / next.steps));
  } else if (next.phase in PHASE_PERCENT) {
    next.percent = PHASE_PERCENT[next.phase];
  }
  progress.set(id, next);
}

class ImageController {
  /**
   * POST /api/images/generate - Start a standalone text-to-image generation
   * (Image Studio). Returns 202 with the PENDING record straight away: a
   * Qwen-Image render takes 1-2 minutes on this card, longer than a proxy is
   * willing to hold a request open, so the client polls GET /api/images
   * instead. Rendering goes through the same ImageGenerationService (workflow,
   * cache, MinIO) the video pipeline uses, holding the GPU lease like its
   * image step does.
   */
  static async generate(req, res, next) {
    try {
      const { prompt, aspectRatio } = validate(createImageSchema)(req.body);

      if (!config.imageGen.enabled) {
        return res.status(503).json({
          error: 'Image generation is not enabled',
          message: 'Set COMFYUI_ENABLED=true in backend/.env (see backend/workflows/README.md) and restart the API.',
        });
      }

      // The seed comes from the prompt, so generating the same prompt again
      // would just return the cached picture - step the variant for a new one.
      const last = await ImageGeneration.findOne({ prompt, aspectRatio }).sort({ variant: -1 }).select('variant').lean();
      const variant = last ? last.variant + 1 : 0;
      const { width, height } = ImageGenerationService.sizeFor(aspectRatio);

      const record = await ImageGeneration.create({ prompt, aspectRatio, variant, width, height, status: 'PENDING' });
      active.add(record._id);
      setProgress(record._id, { phase: 'queued' });
      ImageController._run(record);

      res.status(202).json({ image: record });
    } catch (err) {
      next(err);
    }
  }

  /** Background half of generate(): never throws, always leaves the record COMPLETED or FAILED. */
  static async _run(record) {
    const id = record._id;
    try {
      const result = await LocalAIService.gpu.withGPU('comfyui', () =>
        ImageGenerationService.generate({
          jobId: id,
          prompt: record.prompt,
          aspectRatio: record.aspectRatio,
          variant: record.variant,
          onProgress: (update) => setProgress(id, update),
        })
      );

      record.status = 'COMPLETED';
      record.imageUrl = result.url;
      record.fileName = result.fileName;
      record.durationMs = result.durationMs;
      record.fromCache = result.fromCache;
      await record.save();
    } catch (err) {
      LoggerService.error('Standalone image generation failed', { id, error: err.message });
      record.status = 'FAILED';
      record.error = err.message;
      await record.save().catch(() => {});
    } finally {
      active.delete(id);
      progress.delete(id);
      // The PNG is in MinIO by now (or the run failed); the scratch copy is dead weight.
      await fs.rm(path.resolve(__dirname, '../../jobs', id), { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * GET /api/images - List past generations, newest first.
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;

      await ImageGeneration.updateMany(
        { status: 'PENDING', _id: { $nin: [...active] } },
        { status: 'FAILED', error: 'Generation was interrupted (the server restarted). Try again.' }
      );

      const [items, total] = await Promise.all([
        ImageGeneration.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ImageGeneration.countDocuments(),
      ]);

      res.json({
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/images/progress - Live progress of every generation running in this
   * process, keyed by id. An id that is missing here but still PENDING in the
   * list has finished (or been orphaned) - the client re-fetches the list.
   */
  static progress(req, res) {
    res.json({ active: Object.fromEntries(progress) });
  }

  /**
   * DELETE /api/images/:id - Remove a generation's record and its image file.
   */
  static async remove(req, res, next) {
    try {
      const { id } = validate(imageIdSchema)({ id: req.params.id });
      if (active.has(id)) {
        return res.status(409).json({ error: 'This image is still generating', message: 'Wait for it to finish, then delete it.' });
      }

      const record = await ImageGeneration.findByIdAndDelete(id);
      if (!record) {
        return res.status(404).json({ error: 'Image generation not found' });
      }

      await fs.rm(path.resolve(__dirname, '../../jobs', id), { recursive: true, force: true }).catch(() => {});
      await getStorageProvider().deleteJob(id);

      res.json({ id });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ImageController;
