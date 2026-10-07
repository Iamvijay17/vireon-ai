const { Router } = require('express');
const TtsController = require('../controllers/ttsController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/tts/voices:
 *   get:
 *     summary: Voice Studio options - voice profiles, styles, emotions and numeric limits
 *     tags: [TTS]
 *     responses:
 *       200: { description: Profiles plus the valid values and ranges the server enforces }
 */
router.get('/voices', authenticate, TtsController.voices);

/**
 * @swagger
 * /api/tts/preview:
 *   post:
 *     summary: Preview narration for a line of text without creating a video
 *     description: Runs the real narration pipeline (pronunciation, Voice Director, TTS, post-processing) and returns the audio file. Timing and cache details are in X-Tts-* response headers. Queues behind the GPU; at most 3 previews may be pending.
 *     tags: [TTS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string }
 *               voiceProfile: { type: string, example: professional-narrator }
 *               voice: { type: string, example: 'custom:Ryan' }
 *               style: { type: string, example: educational }
 *               emotion: { type: string, example: neutral }
 *               speed: { type: number, example: 1 }
 *               pitch: { type: number, example: 0 }
 *               language: { type: string, example: auto }
 *               format: { type: string, enum: [wav, mp3] }
 *               pronunciations: { type: object, additionalProperties: { type: string } }
 *     responses:
 *       200: { description: Audio (audio/wav or audio/mpeg) }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       429: { description: Too many previews pending }
 *       502: { description: Voice generation failed }
 */
router.post('/preview', authenticate, TtsController.preview);

/**
 * @swagger
 * /api/tts/stats:
 *   get:
 *     summary: Narration performance - cache hit rates, average stage times, failures, GPU
 *     tags: [TTS]
 *     responses:
 *       200: { description: Metrics }
 */
router.get('/stats', authenticate, TtsController.stats);

module.exports = router;
