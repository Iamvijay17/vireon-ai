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
 * /api/analytics/control-center:
 *   get:
 *     summary: Pipeline control center - real, persisted metrics only
 *     description: >
 *       Video outcomes, per-stage run time (from the stage state each job persists), cache
 *       hit rate / time saved by artifact kind (from the cache ledger), failure rate by stage,
 *       top error codes and retries (from the job event stream), and worker queue depth.
 *       A figure with nothing behind it is null, never 0; jobs that predate stage tracking are
 *       counted but left out of the stage averages.
 *     tags: [Analytics]
 *     parameters:
 *       - name: days
 *         in: query
 *         description: Lookback window in days (clamped 1-365)
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Control center metrics
 *         content:
 *           application/json:
 *             schema: { type: object }
 */
router.get('/control-center', authenticate, AnalyticsController.controlCenter);

/**
 * @swagger
 * /api/analytics/benchmarks:
 *   get:
 *     summary: Stored benchmark runs (hardware, versions, settings, per-stage time and measured memory)
 *     description: Written by scripts/benchPipeline.js. Each run carries its bottleneck explanation; an unmeasured value is null.
 *     tags: [Analytics]
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: "{ runs: [...] }" }
 */
router.get('/benchmarks', authenticate, AnalyticsController.benchmarks);

/**
 * @swagger
 * /api/analytics/benchmarks/compare:
 *   get:
 *     summary: Compare two stored benchmark runs (before / after)
 *     tags: [Analytics]
 *     parameters:
 *       - { name: before, in: query, required: true, schema: { type: string } }
 *       - { name: after, in: query, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ before, after, comparison } - comparison.comparable is false when the workloads differ a lot" }
 */
router.get('/benchmarks/compare', authenticate, AnalyticsController.compareBenchmarks);

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
