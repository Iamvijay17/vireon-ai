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

/**
 * @swagger
 * /api/analytics/videos:
 *   get:
 *     summary: Per-video pipeline stage timing breakdown
 *     tags: [Analytics]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20 }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Per-video metrics
 *         content:
 *           application/json:
 *             schema: { type: object }
 */
router.get('/videos', authenticate, AnalyticsController.videos);

module.exports = router;
