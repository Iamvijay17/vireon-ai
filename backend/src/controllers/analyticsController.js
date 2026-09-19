const AnalyticsService = require('../services/common/AnalyticsService');

class AnalyticsController {
  /**
   * GET /api/analytics/overview?days=30 - Platform-wide metrics across the
   * video job and course pipelines.
   */
  static async overview(req, res, next) {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      const data = await AnalyticsService.getOverview(days);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/analytics/videos?page=1&limit=20&status=COMPLETED - Per-video
   * pipeline stage timing breakdown (Planning/TTS/Scene Build/Rendering/Upload).
   */
  static async videos(req, res, next) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const status = req.query.status || undefined;
      const data = await AnalyticsService.getVideoMetrics({ page, limit, status });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AnalyticsController;
