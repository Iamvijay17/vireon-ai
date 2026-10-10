const { Router } = require('express');
const PublishingController = require('../controllers/publishingController');
const { authenticate } = require('../middleware/auth');
const { publishingGuard, publishingLimiter, connectLimiter } = require('../middleware/publishingGuard');

const router = Router();

// Every publishing route: attribute to an owner, refuse cross-origin writes,
// throttle state changes. (`authenticate` is the app's pass-through stub - see
// middleware/auth.js and docs/publishing.md#security.)
router.use(authenticate, publishingGuard, publishingLimiter);

/**
 * @swagger
 * /api/publishing/capabilities:
 *   get:
 *     summary: What publishing can do right now (YouTube configuration, quota, restrictions; Udemy capabilities)
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Capabilities }
 */
router.get('/capabilities', PublishingController.capabilities);

/**
 * @swagger
 * /api/publishing/accounts:
 *   get:
 *     summary: List connected publishing accounts (never includes tokens)
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Connected accounts }
 * /api/publishing/accounts/youtube/connect:
 *   post:
 *     summary: Start the Google OAuth flow - returns the consent URL to navigate to
 *     tags: [Publishing]
 *     responses:
 *       200: { description: "{ authUrl, expiresAt }" }
 * /api/publishing/oauth/google/callback:
 *   get:
 *     summary: OAuth redirect target. Validates state, exchanges the code, redirects the browser to the app.
 *     tags: [Publishing]
 *     responses:
 *       303: { description: Redirect to the frontend with ?connect=<result> }
 * /api/publishing/accounts/{id}:
 *   delete:
 *     summary: Disconnect an account (revokes the grant at Google and deletes the stored credential)
 *     tags: [Publishing]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Disconnected }
 */
router.get('/accounts', PublishingController.listAccounts);
router.post('/accounts/youtube/connect', connectLimiter, PublishingController.startYouTubeConnect);
router.get('/oauth/google/callback', connectLimiter, PublishingController.googleCallback);
router.delete('/accounts/:id', PublishingController.disconnectAccount);

/**
 * @swagger
 * /api/publishing/courses/{courseId}/lessons:
 *   get:
 *     summary: A course's lessons with render + publishing state
 *     tags: [Publishing]
 *     parameters: [{ name: courseId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Lessons }
 */
router.get('/courses/:courseId/lessons', PublishingController.listLessons);

/**
 * @swagger
 * /api/publishing/videos:
 *   get:
 *     summary: Finished standalone videos (New Video wizard) with their publishing state
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Videos }
 */
router.get('/videos', PublishingController.listVideos);

/**
 * @swagger
 * /api/publishing/jobs:
 *   post:
 *     summary: Create a publishing DRAFT for a lesson (nothing is queued or uploaded)
 *     tags: [Publishing]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountId, courseVideoId]
 *             properties:
 *               accountId: { type: string }
 *               courseVideoId: { type: string, description: 'A course lesson - give this OR videoJobId' }
 *               videoJobId: { type: string, description: 'A standalone video - give this OR courseVideoId' }
 *               allowReupload: { type: boolean }
 *               metadata: { type: object, description: "title, description, tags, categoryId, language, privacyStatus, publishAt, madeForKids, containsSyntheticMedia" }
 *     responses:
 *       201: { description: Draft created }
 *       200: { description: An identical draft already existed and is returned }
 *       409: { description: The lesson already has an active or completed publish for this channel }
 *   get:
 *     summary: List publishing jobs (filters - platform, status, courseId, courseVideoId, finished, page, limit)
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Paginated jobs }
 * /api/publishing/history:
 *   get:
 *     summary: Finished jobs (completed, failed, cancelled), newest first
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Paginated jobs }
 * /api/publishing/jobs/{id}:
 *   get:
 *     summary: One job, with its event timeline and the actions currently allowed
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Job }
 *       404: { description: Not found (also returned for another owner's job) }
 *   patch:
 *     summary: Edit metadata - only while DRAFT, or FAILED before anything was uploaded
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Updated job }
 *   delete:
 *     summary: Delete a draft or cancelled job
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Deleted }
 * /api/publishing/jobs/{id}/submit:
 *   post:
 *     summary: 'Approve a DRAFT and queue the upload. Requires the body {"confirm": true}.'
 *     tags: [Publishing]
 *     responses:
 *       202: { description: Queued }
 * /api/publishing/jobs/{id}/retry:
 *   post:
 *     summary: Retry an eligible FAILED job (an already-uploaded video is verified, never uploaded twice)
 *     tags: [Publishing]
 *     responses:
 *       202: { description: Queued }
 * /api/publishing/jobs/{id}/cancel:
 *   post:
 *     summary: Cancel a queued or running job
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Cancelled }
 * /api/publishing/jobs/{id}/download:
 *   get:
 *     summary: Download a finished Udemy package (ZIP)
 *     tags: [Publishing]
 *     responses:
 *       200: { description: application/zip }
 */
router.post('/jobs', PublishingController.createJob);
router.get('/jobs', PublishingController.listJobs);
router.get('/history', PublishingController.history);
router.get('/jobs/:id', PublishingController.getJob);
router.patch('/jobs/:id', PublishingController.updateJob);
router.delete('/jobs/:id', PublishingController.deleteJob);
router.post('/jobs/:id/submit', PublishingController.submitJob);
router.post('/jobs/:id/retry', PublishingController.retryJob);
router.post('/jobs/:id/cancel', PublishingController.cancelJob);
router.get('/jobs/:id/download', PublishingController.downloadExport);

/**
 * @swagger
 * /api/publishing/courses/{courseId}/udemy:
 *   get:
 *     summary: Udemy export overview - capabilities, profile, curriculum plan and validation report
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Overview }
 *   put:
 *     summary: Save the course's Udemy publishing profile (subtitle, objectives, sections ...)
 *     tags: [Publishing]
 *     responses:
 *       200: { description: Saved profile }
 * /api/publishing/courses/{courseId}/udemy/export:
 *   post:
 *     summary: Queue a Udemy course package build. Does not publish anything to Udemy.
 *     tags: [Publishing]
 *     responses:
 *       202: { description: Queued }
 */
router.get('/courses/:courseId/udemy', PublishingController.udemyOverview);
router.put('/courses/:courseId/udemy', PublishingController.saveUdemyProfile);
router.post('/courses/:courseId/udemy/export', PublishingController.createUdemyExport);

module.exports = router;
