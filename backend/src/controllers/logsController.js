const SocketService = require('../services/SocketService');

class LogsController {
  /**
   * GET /api/logs/recent?limit=200 - Recent server log entries, for
   * hydrating the Live Logs page before any new lines have streamed in
   * over the 'serverLog' socket event.
   */
  static recent(req, res, next) {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 300);
      res.json({ logs: SocketService.getRecentLogs(limit) });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = LogsController;
