const { Router } = require('express');
const JobController = require('../controllers/jobController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List jobs across all types (video/course/audio), unified
 *     tags: [Jobs]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: type
 *         in: query
 *         schema: { type: string, enum: [video, course, audio] }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated, normalized job list
 */
router.get('/', authenticate, JobController.list);

/**
 * @swagger
 * /api/jobs/bulk:
 *   post:
 *     summary: Apply cancel/retry/delete to multiple jobs across types at once
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobs, action]
 *             properties:
 *               jobs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties: { type: { type: string }, id: { type: string } }
 *               action: { type: string, enum: [cancel, retry, delete] }
 *     responses:
 *       200:
 *         description: Per-item success/failure results
 */
router.post('/bulk', authenticate, JobController.bulkAction);

/**
 * @swagger
 * /api/jobs/{type}/{id}:
 *   get:
 *     summary: Get a single job's normalized detail (plus activity log / lesson list)
 *     tags: [Jobs]
 *     parameters:
 *       - { name: type, in: path, required: true, schema: { type: string, enum: [video, course, audio] } }
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Job detail }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:type/:id', authenticate, JobController.getById);

/**
 * @swagger
 * /api/jobs/{type}/{id}/events:
 *   get:
 *     summary: Append-only event timeline for a job, oldest first
 *     tags: [Jobs]
 *     parameters:
 *       - { name: type, in: path, required: true, schema: { type: string, enum: [video, course, audio] } }
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *       - name: since
 *         in: query
 *         description: Exclusive - returns events with seq greater than this
 *         schema: { type: integer, default: 0 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 500, maximum: 500 }
 *     responses:
 *       200: { description: "{ events, latestSeq }" }
 */
router.get('/:type/:id/events', authenticate, JobController.events);

/**
 * @swagger
 * /api/jobs/{type}/{id}/cancel:
 *   post:
 *     summary: Cancel a job (not supported for audio - synchronous generation)
 *     tags: [Jobs]
 *     parameters:
 *       - { name: type, in: path, required: true, schema: { type: string, enum: [video, course, audio] } }
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Cancelled }
 *       400: { description: Not supported for this job type }
 */
router.post('/:type/:id/cancel', authenticate, JobController.cancel);

/**
 * @swagger
 * /api/jobs/{type}/{id}/retry:
 *   post:
 *     summary: Retry a job (video jobs only - course retry stays per-lesson, audio has no retry)
 *     tags: [Jobs]
 *     parameters:
 *       - { name: type, in: path, required: true, schema: { type: string, enum: [video, course, audio] } }
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Retried }
 *       400: { description: Not supported for this job type }
 */
router.post('/:type/:id/retry', authenticate, JobController.retry);

module.exports = router;
