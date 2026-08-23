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
}

module.exports = AnalyticsController;
