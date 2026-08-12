const { Router } = require('express');
const CourseVideoController = require('../controllers/courseVideoController');
const { authenticate } = require('../middleware/auth');
const requireCourseWorker = require('../middleware/requireCourseWorker');

const router = Router();

/**
 * @swagger
 * /api/course-videos/worker-status:
 *   get:
 *     summary: Whether a course-video worker process is currently listening on the queue
 *     description: Backs the frontend's running/offline indicator.
 *     tags: [Course Videos]
 *     responses:
 *       200:
 *         description: Worker status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 running: { type: boolean }
 *                 count: { type: integer }
 */
router.get('/worker-status', authenticate, CourseVideoController.workerStatus);

/**
 * @swagger
 * /api/course-videos/bulk-generate:
 *   post:
 *     summary: Queue a generation action for one or more lessons
 *     description: Used by both single-row and multi-row (bulk) actions in the lesson table. Requires the course-video worker to be running (503 otherwise).
 *     tags: [Course Videos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BulkGenerateRequest' }
 *     responses:
 *       200:
 *         description: Jobs queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queued: { type: integer }
 *                 jobs: { type: integer }
 *                 skipped: { type: array, items: { type: object } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       503: { description: Course-video worker is not running }
 */
router.post('/bulk-generate', authenticate, requireCourseWorker, CourseVideoController.bulkGenerate);

/**
 * @swagger
 * /api/course-videos/bulk-approve-script:
 *   post:
 *     summary: Approve scripts for multiple videos at once
 *     description: Synchronous (no worker queue involved) - doesn't need the worker to be running.
 *     tags: [Course Videos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BulkVideoIdsRequest' }
 *     responses:
 *       200: { description: Scripts approved }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/bulk-approve-script', authenticate, CourseVideoController.bulkApproveScript);

/**
 * @swagger
 * /api/course-videos/bulk-delete:
 *   post:
 *     summary: Delete multiple videos at once
 *     tags: [Course Videos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BulkVideoIdsRequest' }
 *     responses:
 *       200: { description: Videos deleted }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/bulk-delete', authenticate, CourseVideoController.bulkDelete);

/**
 * @swagger
 * /api/course-videos/{id}:
 *   get:
 *     summary: Get a single course video
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200:
 *         description: The course video
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { video: { $ref: '#/components/schemas/CourseVideo' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: Update a course video
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CourseVideoCreateRequest' }
 *     responses:
 *       200:
 *         description: Updated video
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { video: { $ref: '#/components/schemas/CourseVideo' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete a course video
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authenticate, CourseVideoController.getById);
router.put('/:id', authenticate, CourseVideoController.update);
router.delete('/:id', authenticate, CourseVideoController.delete);

/**
 * @swagger
 * /api/course-videos/{id}/generate-script:
 *   post:
 *     summary: Generate script for a lesson
 *     description: Dispatches to the BullMQ worker - returns immediately. Requires the course-video worker to be running.
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Script generation queued }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       503: { description: Course-video worker is not running }
 */
router.post('/:id/generate-script', authenticate, requireCourseWorker, CourseVideoController.generateScript);

/**
 * @swagger
 * /api/course-videos/{id}/approve-script:
 *   post:
 *     summary: Approve a lesson's script
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200:
 *         description: Script approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { video: { $ref: '#/components/schemas/CourseVideo' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/approve-script', authenticate, CourseVideoController.approveScript);

/**
 * @swagger
 * /api/course-videos/{id}/script:
 *   put:
 *     summary: Update (edit) a lesson's script
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [script]
 *             properties:
 *               script: { $ref: '#/components/schemas/Script' }
 *     responses:
 *       200:
 *         description: Script updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { video: { $ref: '#/components/schemas/CourseVideo' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put('/:id/script', authenticate, CourseVideoController.updateScript);

/**
 * @swagger
 * /api/course-videos/{id}/regenerate-script:
 *   post:
 *     summary: Regenerate a lesson's script
 *     description: Dispatches to the BullMQ worker - returns immediately. Requires the course-video worker to be running.
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Script regeneration queued }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       503: { description: Course-video worker is not running }
 */
router.post('/:id/regenerate-script', authenticate, requireCourseWorker, CourseVideoController.regenerateScript);

/**
 * @swagger
 * /api/course-videos/{id}/generate-audio:
 *   post:
 *     summary: Generate audio for a lesson
 *     description: Dispatches to the BullMQ worker - returns immediately. Requires the course-video worker to be running.
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Audio generation queued }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       503: { description: Course-video worker is not running }
 */
router.post('/:id/generate-audio', authenticate, requireCourseWorker, CourseVideoController.generateAudio);

/**
 * @swagger
 * /api/course-videos/{id}/render:
 *   post:
 *     summary: Render a lesson's video
 *     description: Dispatches to the BullMQ worker - returns immediately. Requires the course-video worker to be running.
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Rendering queued }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       503: { description: Course-video worker is not running }
 */
router.post('/:id/render', authenticate, requireCourseWorker, CourseVideoController.render);

/**
 * @swagger
 * /api/course-videos/{id}/retry:
 *   post:
 *     summary: Retry a lesson's failed step
 *     description: Dispatches to the BullMQ worker - returns immediately. Requires the course-video worker to be running.
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Retry queued }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       503: { description: Course-video worker is not running }
 */
router.post('/:id/retry', authenticate, requireCourseWorker, CourseVideoController.retry);

/**
 * @swagger
 * /api/course-videos/{id}/stop:
 *   post:
 *     summary: Stop a lesson's in-progress generation
 *     description: Marks it CANCELLED and removes any not-yet-started jobs for it from the queue; an already-running stage notices at its next checkpoint.
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200:
 *         description: Lesson stopped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { video: { $ref: '#/components/schemas/CourseVideo' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/stop', authenticate, CourseVideoController.stop);

/**
 * @swagger
 * /api/course-videos/{id}/scenes/{sceneNumber}/regenerate-audio:
 *   post:
 *     summary: Regenerate a single scene's audio
 *     description: Runs synchronously in the API process (a single TTS call), not queued.
 *     tags: [Course Videos]
 *     parameters:
 *       - { $ref: '#/components/parameters/EntityId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *     responses:
 *       200: { description: Scene audio regenerated }
 *       400: { description: sceneNumber must be a positive integer }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/regenerate-audio', authenticate, CourseVideoController.regenerateSceneAudio);

/**
 * @swagger
 * /api/course-videos/{id}/activity-logs:
 *   get:
 *     summary: Get activity logs for a course video
 *     tags: [Course Videos]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200:
 *         description: Activity logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs: { type: array, items: { $ref: '#/components/schemas/ActivityLog' } }
 */
router.get('/:id/activity-logs', authenticate, CourseVideoController.getActivityLogs);

module.exports = router;
