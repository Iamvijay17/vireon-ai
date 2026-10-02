const { Router } = require('express');
const VoiceController = require('../controllers/voiceController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/voices:
 *   get:
 *     summary: List available TTS voices
 *     description: Built-in custom-voice presets and cloneable reference voices discovered from backend/voices/, each flagged with isFavorite.
 *     tags: [Voices]
 *     responses:
 *       200:
 *         description: Voice catalog
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VoiceListResponse' }
 */
router.get('/', authenticate, VoiceController.list);

/**
 * @swagger
 * /api/voices/favorites:
 *   get:
 *     summary: List favorited voice ids
 *     tags: [Voices]
 *     responses:
 *       200:
 *         description: Favorite voice ids
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { favorites: { type: array, items: { type: string } } }
 *   post:
 *     summary: Mark a voice as favorite
 *     tags: [Voices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [voiceId]
 *             properties: { voiceId: { type: string } }
 *     responses:
 *       200:
 *         description: Updated favorites list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { favorites: { type: array, items: { type: string } } }
 *       400: { description: voiceId is required }
 *   delete:
 *     summary: Unmark a voice as favorite
 *     tags: [Voices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [voiceId]
 *             properties: { voiceId: { type: string } }
 *     responses:
 *       200:
 *         description: Updated favorites list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { favorites: { type: array, items: { type: string } } }
 *       400: { description: voiceId is required }
 */
router.get('/favorites', authenticate, VoiceController.listFavorites);
router.post('/favorites', authenticate, VoiceController.addFavorite);
router.delete('/favorites', authenticate, VoiceController.removeFavorite);

module.exports = router;
