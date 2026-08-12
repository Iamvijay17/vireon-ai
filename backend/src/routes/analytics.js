const { Router } = require('express');
const AnalyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Platform-wide metrics across the video job and course pipelines
 *     tags: [Analytics]
 *     parameters:
 *       - name: days
 *         in: query
 *         description: Lookback window in days (clamped 1-365)
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Overview metrics
 *         content:
 *           application/json:
 *             schema: { type: object }
 */
router.get('/overview', authenticate, AnalyticsController.overview);

module.exports = router;
