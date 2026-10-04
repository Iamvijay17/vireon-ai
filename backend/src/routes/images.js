const { Router } = require('express');
const ImageController = require('../controllers/imageController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/images/generate:
 *   post:
 *     summary: Start a standalone text-to-image generation (Image Studio)
 *     description: Queues an image for the given prompt on the local ComfyUI workflow, independent of the video pipeline. Returns the PENDING record immediately (202); poll GET /api/images for the finished image - a render takes 1-2 minutes.
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt: { type: string, minLength: 3, maxLength: 1000 }
 *               aspectRatio: { type: string, enum: ['16:9', '9:16', '1:1', '4:5'], default: '16:9' }
 *               quality: { type: string, enum: [fast, standard, high], default: standard, description: 'fast ~60% and high ~140% of the configured steps' }
 *               style: { type: string, enum: [none, photo, cinematic, illustration, render3d, flat, watercolor, anime], default: none, description: 'a phrase appended to the prompt' }
 *               negative: { type: string, maxLength: 500, description: 'things to leave out; switches to guided mode (CFG > 1, ~50% slower)' }
 *               count: { type: integer, minimum: 1, maximum: 4, default: 1, description: 'pictures to make, each with a new seed' }
 *               seed: { type: integer, nullable: true, description: 'pin the seed to reproduce a picture; requires count 1' }
 *     responses:
 *       202: { description: 'Generation started - { image, images } with the PENDING record(s)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       503: { description: Image generation is not enabled (COMFYUI_ENABLED) }
 */
router.post('/generate', authenticate, ImageController.generate);

/**
 * @swagger
 * /api/images:
 *   get:
 *     summary: List past standalone image generations
 *     tags: [Images]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated list, newest first
 */
router.get('/', authenticate, ImageController.list);

/**
 * @swagger
 * /api/images/progress:
 *   get:
 *     summary: Live progress of running image generations
 *     description: In-memory and cheap to poll. Each active id maps to { phase (queued|loading|sampling|saving), percent, step, steps }.
 *     tags: [Images]
 *     responses:
 *       200: { description: Active generations keyed by id }
 */
router.get('/progress', authenticate, ImageController.progress);

/**
 * @swagger
 * /api/images/{id}:
 *   delete:
 *     summary: Delete a standalone image generation and its file
 *     tags: [Images]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Image generation id (format img-XXXXXXXX)
 *         schema: { type: string, example: img-A1B2C3D4 }
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Still generating }
 */
router.delete('/:id', authenticate, ImageController.remove);

module.exports = router;
