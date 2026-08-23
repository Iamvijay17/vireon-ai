const { Router } = require('express');
const AudioController = require('../controllers/audioController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/audio/generate:
 *   post:
 *     summary: Generate standalone TTS audio from text (Audio Studio)
 *     description: Synthesizes audio for arbitrary text with a chosen voice, independent of the video pipeline. Synchronous - can take tens of seconds.
 *     tags: [Audio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AudioGenerateRequest' }
 *     responses:
 *       201:
 *         description: Generated audio
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { audio: { $ref: '#/components/schemas/AudioGeneration' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       500: { description: TTS generation failed }
 */
router.post('/generate', authenticate, AudioController.generate);

/**
 * @swagger
 * /api/audio/generate-dialogue:
 *   post:
 *     summary: Generate multi-speaker (podcast-style) TTS audio from a script
 *     description: 'Parses a "Name: line" script against a speaker roster and synthesizes one audio file per turn, in order. Synchronous - can take a while for longer scripts (one TTS call per turn).'
 *     tags: [Audio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AudioDialogueGenerateRequest' }
 *     responses:
 *       201:
 *         description: Generated turns
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { audio: { $ref: '#/components/schemas/AudioGeneration' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       500: { description: TTS generation failed }
 */
router.post('/generate-dialogue', authenticate, AudioController.generateDialogue);

/**
 * @swagger
 * /api/audio:
 *   get:
 *     summary: List past standalone audio generations
 *     tags: [Audio]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items: { type: array, items: { $ref: '#/components/schemas/AudioGeneration' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', authenticate, AudioController.list);

/**
 * @swagger
 * /api/audio/{id}:
 *   delete:
 *     summary: Delete a standalone audio generation and its file
 *     tags: [Audio]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Audio generation id (format aud-XXXXXXXX)
 *         schema: { type: string, example: aud-A1B2C3D4 }
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authenticate, AudioController.remove);

module.exports = router;
