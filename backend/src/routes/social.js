const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const SocialController = require('../controllers/socialController');
const { authenticate } = require('../middleware/auth');
const { publishingGuard, publishingLimiter, connectLimiter } = require('../middleware/publishingGuard');
const { createMediaHandler } = require('../services/social/mediaGateway');

/**
 * Promotion Studio routes (/api/social).
 *
 * TWO routers, because two very different trust levels live under one prefix:
 *
 *  - `mediaRouter` / `webhookRouter`  reachable by Meta over the internet when the operator chooses to expose it:
 *      GET|HEAD /media/:token/:file      signed, expiring, read-only media links
 *      POST     /webhooks/:provider/...  deauthorize / data-deletion callbacks (signature-verified)
 *    Neither returns anything without a valid signature, and neither touches accounts or posts otherwise.
 *
 *  - `router`  the dashboard API: owner attribution, cross-origin write refusal, rate limits
 *    (middleware/publishingGuard), exactly as the publishing routes.
 */

const publicLimiter = rateLimit({
  windowMs: 60_000,
  max: 600, // Meta fetches a video with several ranged requests; this is a ceiling, not a target
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// Media links are mounted in server.js BEFORE the global /api limiter (a video is fetched with many ranged
// requests that must not share the dashboard's budget); webhooks need the body parsers, so they come after it.
const mediaRouter = Router();
const mediaHandler = createMediaHandler();
mediaRouter.get('/media/:token/:file', publicLimiter, mediaHandler);
mediaRouter.head('/media/:token/:file', publicLimiter, mediaHandler);

const webhookRouter = Router();
webhookRouter.post('/webhooks/:provider/deauthorize', publicLimiter, SocialController.deauthorizeWebhook);
webhookRouter.post('/webhooks/:provider/data-deletion', publicLimiter, SocialController.dataDeletionWebhook);

const router = Router();
router.use(authenticate, publishingGuard, publishingLimiter);

/**
 * @swagger
 * /api/social/capabilities:
 *   get:
 *     summary: What the Promotion Studio can do right now (configured platforms, formats, limits, public media, scheduling window)
 *     tags: [Social]
 *     responses:
 *       200: { description: Capabilities }
 * /api/social/overview:
 *   get:
 *     summary: Dashboard overview - accounts needing attention, upcoming scheduled posts, last 7 days
 *     tags: [Social]
 *     responses:
 *       200: { description: Overview }
 */
router.get('/capabilities', SocialController.capabilities);
router.get('/overview', SocialController.overview);

/**
 * @swagger
 * /api/social/accounts:
 *   get:
 *     summary: List connected social accounts (never includes tokens)
 *     tags: [Social]
 *     responses:
 *       200: { description: Connected accounts }
 * /api/social/accounts/{provider}/connect:
 *   post:
 *     summary: Start OAuth for provider meta (Facebook Pages + linked Instagram) or threads - returns the consent URL to navigate to
 *     tags: [Social]
 *     parameters: [{ name: provider, in: path, required: true, schema: { type: string, enum: [meta, threads] } }]
 *     responses:
 *       200: { description: "authUrl and expiresAt" }
 * /api/social/oauth/{provider}/callback:
 *   get:
 *     summary: OAuth redirect target. Validates state, exchanges the code, redirects the browser to the app.
 *     tags: [Social]
 *     parameters: [{ name: provider, in: path, required: true, schema: { type: string, enum: [meta, threads] } }]
 *     responses:
 *       303: { description: Redirect to the frontend with connect result query parameters }
 * /api/social/accounts/{id}/validate:
 *   post:
 *     summary: Ask the platform whether the saved access still works (flags the account if not)
 *     tags: [Social]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Validation result }
 * /api/social/accounts/{id}:
 *   delete:
 *     summary: Disconnect an account - deletes the stored credential and cancels its pending posts
 *     tags: [Social]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Disconnected }
 */
router.get('/accounts', SocialController.listAccounts);
router.post('/accounts/:provider/connect', connectLimiter, SocialController.startConnect);
router.get('/oauth/:provider/callback', connectLimiter, SocialController.oauthCallback);
router.post('/accounts/:id/validate', connectLimiter, SocialController.validateAccount);
router.delete('/accounts/:id', SocialController.disconnectAccount);

/**
 * @swagger
 * /api/social/library:
 *   get:
 *     summary: Finished Vireon videos and course lessons that can be promoted
 *     tags: [Social]
 *     responses:
 *       200: { description: Library }
 * /api/social/campaigns:
 *   post:
 *     summary: Create a promotion (campaign) from a Vireon video / lesson, or empty to upload media afterwards
 *     tags: [Social]
 *     responses:
 *       201: { description: Created }
 *   get:
 *     summary: List promotions with their publishing summary
 *     tags: [Social]
 *     responses:
 *       200: { description: Paginated campaigns }
 * /api/social/campaigns/{id}:
 *   get:
 *     summary: One promotion with its posts
 *     tags: [Social]
 *     responses:
 *       200: { description: Campaign }
 *   patch:
 *     summary: Edit the brief, per-platform copy or media of a promotion
 *     tags: [Social]
 *     responses:
 *       200: { description: Updated }
 *   delete:
 *     summary: Delete a promotion that never posted (otherwise it is archived as history)
 *     tags: [Social]
 *     responses:
 *       200: { description: Deleted or archived }
 * /api/social/campaigns/{id}/media:
 *   put:
 *     summary: Upload an image (JPEG/PNG) or video (MP4/MOV) as the request body; type is verified from the file's bytes
 *     tags: [Social]
 *     responses:
 *       200: { description: Campaign with the new media }
 * /api/social/campaigns/{id}/generate-copy:
 *   post:
 *     summary: Write platform-specific captions and hashtags with the local LLM (503 AI_UNAVAILABLE if it cannot - write them by hand)
 *     tags: [Social]
 *     responses:
 *       200: { description: Campaign with generated variants }
 *       503: { description: AI unavailable }
 * /api/social/campaigns/{id}/validate:
 *   post:
 *     summary: Check every destination (content limits, media format, account health, schedule) without creating anything
 *     tags: [Social]
 *     responses:
 *       200: { description: Per-destination validation with the composed text }
 * /api/social/campaigns/{id}/publish:
 *   post:
 *     summary: 'Post now or schedule to one or more accounts. Requires {"confirm": true}. Each destination is independent.'
 *     tags: [Social]
 *     responses:
 *       201: { description: At least one destination was created (see results) }
 *       422: { description: No destination was created (see results) }
 */
router.get('/library', SocialController.library);
router.post('/campaigns', SocialController.createCampaign);
router.get('/campaigns', SocialController.listCampaigns);
router.get('/campaigns/:id', SocialController.getCampaign);
router.patch('/campaigns/:id', SocialController.updateCampaign);
router.delete('/campaigns/:id', SocialController.deleteCampaign);
router.put('/campaigns/:id/media', SocialController.uploadMedia);
router.post('/campaigns/:id/generate-copy', SocialController.generateCopy);
router.post('/campaigns/:id/validate', SocialController.validateCampaign);
router.post('/campaigns/:id/publish', SocialController.publishCampaign);

/**
 * @swagger
 * /api/social/posts:
 *   get:
 *     summary: Posts across all promotions (filters - platform, status, accountId, campaignId, finished, from, to, page, limit)
 *     tags: [Social]
 *     responses:
 *       200: { description: Paginated posts }
 * /api/social/posts/{id}:
 *   get:
 *     summary: One post with its event timeline and the actions currently allowed
 *     tags: [Social]
 *     responses:
 *       200: { description: Post }
 *   patch:
 *     summary: Edit text and/or time - only while SCHEDULED (or FAILED before anything reached the platform)
 *     tags: [Social]
 *     responses:
 *       200: { description: Updated post }
 *   delete:
 *     summary: Delete a cancelled/failed post that never reached the platform
 *     tags: [Social]
 *     responses:
 *       200: { description: Deleted }
 * /api/social/posts/{id}/cancel:
 *   post:
 *     summary: Cancel a scheduled / queued post that has not reached the platform
 *     tags: [Social]
 *     responses:
 *       200: { description: Cancelled }
 * /api/social/posts/{id}/retry:
 *   post:
 *     summary: Retry ONE failed destination (never re-publishes one that is already live)
 *     tags: [Social]
 *     responses:
 *       202: { description: Queued }
 * /api/social/calendar:
 *   get:
 *     summary: Scheduled and published posts in a date range (from, to, platform)
 *     tags: [Social]
 *     responses:
 *       200: { description: Calendar items }
 */
router.get('/posts', SocialController.listPosts);
router.get('/posts/:id', SocialController.getPost);
router.patch('/posts/:id', SocialController.editPost);
router.delete('/posts/:id', SocialController.deletePost);
router.post('/posts/:id/cancel', SocialController.cancelPost);
router.post('/posts/:id/retry', SocialController.retryPost);
router.get('/calendar', SocialController.calendar);

/**
 * @swagger
 * /api/social/analytics:
 *   get:
 *     summary: Aggregated results from cached platform insights (platform, from, to). Unavailable metrics are reported as unavailable, never 0.
 *     tags: [Social]
 *     responses:
 *       200: { description: Analytics }
 * /api/social/analytics/refresh:
 *   post:
 *     summary: Pull fresh insights for stale published posts (capped per call; respects the cache)
 *     tags: [Social]
 *     responses:
 *       200: { description: Refresh summary }
 */
router.get('/analytics', SocialController.analytics);
router.post('/analytics/refresh', SocialController.refreshAnalytics);

module.exports = router;
module.exports.mediaRouter = mediaRouter;
module.exports.webhookRouter = webhookRouter;
