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
 * /api/videos/{id}/scenes/{sceneNumber}/versions:
 *   get:
 *     summary: A scene's immutable version history
 *     description: Newest first. A version is recorded whenever a finished render differs from the scene's active version; none is ever modified.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *     responses:
 *       200: { description: The scene's versions and which one is active }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/scenes/:sceneNumber/versions', authenticate, SceneController.listVersions);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/options:
 *   get:
 *     summary: What the Studio may offer for a scene right now
 *     description: Which regeneration actions are allowed (and why not), the layouts that can show the scene's content, the named looks, and the version count.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *     responses:
 *       200: { description: Scene options }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/scenes/:sceneNumber/options', authenticate, SceneController.sceneOptions);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/regenerate:
 *   post:
 *     summary: Regenerate one part of one scene
 *     description: >
 *       Changes or redoes a single part of a scene and queues the rebuild of only what
 *       depends on it. Unrelated scenes are not regenerated. The scene's current state is
 *       recorded as a version first, and the result becomes a new version once the render
 *       finishes. The response is the plan: { changed, regenerate, reusable, produce, stages }.
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
 *             required: [target]
 *             properties:
 *               target: { type: string, enum: [image, voice, script, layout, style, scene] }
 *               prompt: { type: string, description: 'target=image - a new picture description' }
 *               voice: { type: string, description: 'target=voice - record in this voice' }
 *               text: { type: string, description: 'target=script - the new narration' }
 *               layout: { type: string, description: 'target=layout - a layout id the content fits' }
 *               preset: { type: string, enum: [cinematic, minimal, dynamic], description: 'target=style' }
 *     responses:
 *       200: { description: Queued (or a no-op when nothing changed), with the regeneration plan }
 *       400: { description: Invalid request, an incompatible layout, or the video is not in a state that allows it }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/regenerate', authenticate, SceneController.regenerateScenePart);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/revert:
 *   post:
 *     summary: Revert a scene to an earlier version
 *     description: Restores the scene from the chosen version (no version is modified) and queues only the composition and render.
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
 *             required: [version]
 *             properties:
 *               version: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Queued }
 *       400: { description: Invalid version, or the video is not in a state that allows it }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/revert', authenticate, SceneController.revertScene);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/regeneration-plan:
 *   get:
 *     summary: What a change to a scene would rebuild
 *     description: >
 *       With changeType, the dependency-graph plan for that kind of change
 *       ({ changed, regenerate, reusable, produce, stages }). Without it, the plan
 *       for whatever currently differs from the scene's active version.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *       - name: changeType
 *         in: query
 *         schema: { type: string, enum: [script, voice, image, layout, motion, transition, style, scene] }
 *     responses:
 *       200: { description: The regeneration plan }
 *       400: { description: Unknown changeType }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/scenes/:sceneNumber/regeneration-plan', authenticate, SceneController.regenerationPlan);

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
 * /api/videos/{id}/speech-timeline:
 *   get:
 *     summary: Canonical speech timeline of a video's scenes
 *     description: >
 *       Word / phrase / segment / pause timings (seconds from each scene's audio start) measured from the generated narration,
 *       with the alignment status, provider and version. Present only for audio made with ENABLE_SPEECH_ALIGNMENT=true;
 *       otherwise each scene reports `timeline: null`. `issues` lists any violated timing invariant (empty when sound).
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { in: query, name: scene, schema: { type: integer, minimum: 1 }, description: Only this scene }
 *     responses:
 *       200: { description: Per-scene timelines }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/speech-timeline', authenticate, SceneController.getSpeechTimeline);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/segments/{segmentId}/retry:
 *   post:
 *     summary: Retry one narration segment of a scene
 *     description: Segmented TTS pipeline only (TTS_SEGMENTED=true). Re-synthesizes just the named segment; the scene's other segments are served from the cache. Runs synchronously.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *       - { name: segmentId, in: path, required: true, schema: { type: string, example: s03-seg002 } }
 *     responses:
 *       200: { description: Segment regenerated and scene audio reassembled }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Segmented pipeline is not enabled }
 */
router.post('/:id/scenes/:sceneNumber/segments/:segmentId/retry', authenticate, SceneController.retrySceneSegment);

/**
 * @swagger
 * /api/videos/{id}/captions:
 *   get:
 *     summary: Download the captions as SRT or WebVTT
 *     description: >
 *       The video's narration as a subtitle file. Timed from the word-level forced alignment, with scene starts laid out the way the
 *       renderer does. A scene without alignment gets its narration spread evenly over its audio.
 *       404 until the script has narration.
 *     tags: [Videos]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { in: query, name: format, schema: { type: string, enum: [srt, vtt], default: srt } }
 *     responses:
 *       200: { description: Subtitle file }
 *       400: { description: Unknown format }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/captions', authenticate, VideoController.captions);

/**
 * @swagger
 * /api/videos/{id}/scenes/{sceneNumber}/regenerate-image:
 *   post:
 *     summary: Re-roll one scene's generated image
 *     description: >
 *       Clears the scene's image, picks a new seed (so it is a different picture, not the cached one),
 *       optionally from a new prompt, and re-queues the job at the image step followed by a re-render.
 *       Only COMPLETED, FAILED or AUDIO_COMPLETED jobs. A scene with no image prompt needs one in the body.
 *     tags: [Scenes]
 *     parameters:
 *       - { $ref: '#/components/parameters/VideoJobId' }
 *       - { $ref: '#/components/parameters/SceneNumber' }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt: { type: string, maxLength: 400 }
 *     responses:
 *       200: { description: Job re-queued }
 *       400: { description: Invalid scene number, wrong job state, or no prompt available }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/regenerate-image', authenticate, VideoController.regenerateImage);

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
 * /api/videos/{id}/scenes/{sceneNumber}/convert-type:
 *   post:
 *     summary: Compute a scene converted to a different sceneType
 *     description: |
 *       Returns the template, elements, subtitle and image fields the scene needs as the new type.
 *       For image-bearing types (image, contentwithimage) a scene with no image prompt gets one
 *       drafted from its narration (LLM, with a deterministic fallback). Does not persist anything -
 *       the frontend merges the returned fields into its local (unsaved) scene state.
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
 *             required: [sceneType, scene]
 *             properties:
 *               sceneType: { type: string, enum: [title, content, image, contentwithimage, podcast] }
 *               scene: { type: object, description: The scene as the editor holds it, unsaved edits included }
 *     responses:
 *       200:
 *         description: Fields to merge into the scene
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 scene: { type: object }
 *                 promptSource: { type: string, enum: [existing, llm, fallback, none] }
 *       400: { description: Invalid sceneType / scene / sceneNumber }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/scenes/:sceneNumber/convert-type', authenticate, SceneController.convertSceneType);

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
