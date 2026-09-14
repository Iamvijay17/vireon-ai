const PreviewService = require('../services/video/PreviewService');
const LoggerService = require('../services/common/LoggerService');
const { validate, idSchema, studioPreviewSchema, studioThumbnailQuerySchema } = require('../validators');

/**
 * Studio's live preview - replaces the old @remotion/player-based
 * ScenePreview/SceneThumbnail with real HyperFrames output. See
 * backend/src/services/video/PreviewService.js: rather than a custom
 * postMessage/GSAP bridge, this reuses HyperFrames' own `hyperframes
 * preview` server and its per-frame PNG thumbnail endpoint, same as
 * HyperFrames Studio's own scrubbing UI does.
 */
class StudioController {
  /**
   * POST /api/studio/preview/:id - (re)build the scratch composition for
   * this job's current (possibly unsaved) scenes and ensure a preview
   * server is serving it.
   */
  static async buildPreview(req, res, next) {
    try {
      const { id } = validate(idSchema)(req.params);
      const { scenes, resolution, fontPairing } = validate(studioPreviewSchema)(req.body);
      const preview = await PreviewService.ensurePreview(id, { scenes, resolution, fontPairing });
      res.json(preview);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/studio/preview/:id/thumbnail?t=<seconds> - a single rendered
   * PNG frame from the currently active preview for this job.
   */
  static async getThumbnail(req, res, next) {
    // helmet's default Cross-Origin-Resource-Policy: same-origin blocks the
    // frontend dev server (different port/origin) from loading this in an
    // <img> tag - same relaxation server.js already applies to voice-sample
    // static files, for the same reason. Set unconditionally, before the
    // request can fail: an error response left with the default policy gets
    // silently dropped by the browser (net::ERR_BLOCKED_BY_RESPONSE) instead
    // of reaching the <img>'s onerror handler, which is exactly the case a
    // thumbnail racing an in-progress preview build hits (see
    // PreviewService.getThumbnail's "No active preview" error).
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    try {
      const { id } = validate(idSchema)(req.params);
      const { t } = validate(studioThumbnailQuerySchema)(req.query);
      const png = await PreviewService.getThumbnail(id, t);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store');
      res.send(png);
    } catch (err) {
      LoggerService.warn('Studio preview thumbnail request failed', { jobId: req.params.id, error: err.message });
      next(err);
    }
  }
}

module.exports = StudioController;
