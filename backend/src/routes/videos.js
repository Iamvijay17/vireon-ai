const { Router } = require('express');
const VideoController = require('../controllers/videoController');
const SceneController = require('../controllers/sceneController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/videos:
 *   post:
 *     summary: Create a new video job
 *     description: Queues a new standalone/short-form video job. Returns immediately - script/audio/render happen in the background.
 *     tags: [Videos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VideoJobCreateRequest' }
 *     responses:
 *       201:
 *         description: Job created and queued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *   get:
 *     summary: List video jobs
 *     tags: [Videos]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: type
 *         in: query
 *         schema: { type: string }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of video jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs: { type: array, items: { $ref: '#/components/schemas/VideoJob' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.post('/', authenticate, VideoController.create);
router.get('/', authenticate, VideoController.list);

/**
 * @swagger
 * /api/videos/{id}:
 *   get:
 *     summary: Get a single video job
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: The video job
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { job: { $ref: '#/components/schemas/VideoJob' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: Update editable job details
 *     description: Blocked while the job is actively processing. `type` cannot be changed.
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VideoJobUpdateRequest' }
 *     responses:
 *       200:
 *         description: Updated job
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { job: { $ref: '#/components/schemas/VideoJob' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete a video job
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authenticate, VideoController.getById);
router.put('/:id', authenticate, VideoController.update);
router.delete('/:id', authenticate, VideoController.delete);

/**
 * @swagger
 * /api/videos/bulk-delete:
 *   post:
 *     summary: Delete multiple video jobs at once
 *     tags: [Videos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobIds]
 *             properties:
 *               jobIds: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Jobs deleted }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/bulk-delete', authenticate, VideoController.bulkDelete);

/**
 * @swagger
 * /api/videos/{id}/restart:
 *   post:
 *     summary: Restart a failed or stuck job
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Job restarted and re-queued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       400: { description: Job is still actively processing }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/restart', authenticate, VideoController.restart);

/**
 * @swagger
 * /api/videos/{id}/regenerate-script:
 *   post:
 *     summary: Regenerate just the script step
 *     description: Clears the existing script and any downstream audio/render output, then re-queues from script generation.
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Script regeneration queued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       400: { description: Job is still actively processing }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/regenerate-script', authenticate, VideoController.regenerateScript);

/**
 * @swagger
 * /api/videos/{id}/approve:
 *   post:
 *     summary: Approve a script awaiting manual review
 *     description: Fast-generation jobs resume automatically into audio/image/render; manual jobs stop here until /generate-audio is called.
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Script approved
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/approve', authenticate, VideoController.approve);

/**
 * @swagger
 * /api/videos/{id}/generate-audio:
 *   post:
 *     summary: Trigger audio generation (manual mode only)
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Audio generation queued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/generate-audio', authenticate, VideoController.generateAudio);

/**
 * @swagger
 * /api/videos/{id}/generate-render:
 *   post:
 *     summary: Trigger the final image/render/upload stage (manual mode only)
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Render queued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/generate-render', authenticate, VideoController.generateRender);

/**
 * @swagger
 * /api/videos/{id}/rerender:
 *   post:
 *     summary: Re-render a completed or failed job
 *     description: Resets to the rendering stage and re-runs rendering + upload. Keeps existing script and audio data intact.
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Re-render queued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/rerender', authenticate, VideoController.rerender);

/**
 * @swagger
 * /api/videos/{id}/stop:
 *   post:
 *     summary: Stop a running job
 *     description: Marks it CANCELLED and removes it from the queue if not yet started; an already-running worker notices at its next checkpoint.
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     responses:
 *       200:
 *         description: Job stopped
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/JobActionResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/stop', authenticate, VideoController.stop);

/**
 * @swagger
 * /api/videos/{id}/scenes:
 *   put:
 *     summary: Update video job scenes (studio editor)
 *     description: Allows modifying scene data before re-rendering.
 *     tags: [Scenes]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scenes]
 *             properties:
 *               scenes: { type: array, items: { $ref: '#/components/schemas/Scene' } }
 *     responses:
 *       200:
 *         description: Scenes updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 job: { $ref: '#/components/schemas/VideoJob' }
 *                 message: { type: string }
 *       400: { description: scenes must be an array }
 */
router.put('/:id/scenes', authenticate, SceneController.updateScenes);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/regenerate-audio:
 *   post:
 *     summary: Regenerate a single scene's audio
 *     description: Runs synchronously (not queued) since it's a single TTS call.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *     responses:
 *       200: { description: Scene audio regenerated }
 *       400: { description: sceneNumber must be a positive integer }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/regenerate-audio', authenticate, SceneController.regenerateSceneAudio);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/remap-template:
 *   post:
 *     summary: Compute a fresh `elements` shape for a scene switching to a different template
 *     description: Does not persist anything - the frontend merges the returned elements into its local (unsaved) scene state.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateId]
 *             properties:
 *               templateId: { type: string }
 *               fromTemplateId: { type: string }
 *               title: { type: string }
 *               subtitle: { type: string }
 *               audioText: { type: string }
 *               speaker: { type: string }
 *               elements: { type: object }
 *     responses:
 *       200:
 *         description: Remapped elements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { elements: { type: object } }
 *       400: { description: templateId is required / sceneNumber must be a positive integer }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/remap-template', authenticate, SceneController.remapElementsForTemplate);

/**
 * @swagger
 * /api/videos/{id}/activity-logs:
 *   get:
 *     summary: Get activity logs for a video job
 *     tags: [Videos]
 *     parameters: [{ $ref: '#/components/parameters/VideoJobId' }]
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
router.get('/:id/activity-logs', authenticate, VideoController.getActivityLogs);

module.exports = router;
