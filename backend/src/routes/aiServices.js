const { Router } = require('express');
const AIServicesController = require('../controllers/aiServicesController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/system/ai-services:
 *   get:
 *     summary: Status of the local AI services (LM Studio, Qwen3-TTS) the Local AI Service Manager controls
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Per-service status/pid/url/lastChecked
 */
router.get('/', authenticate, AIServicesController.getAll);

/**
 * @swagger
 * /api/system/ai-services/{service}/start:
 *   post:
 *     summary: Start a local AI service if it isn't already running
 *     tags: [System]
 *     parameters:
 *       - { name: service, in: path, required: true, schema: { type: string, enum: [llm, tts, comfyui, avatar] } }
 *     responses:
 *       200: { description: Updated status }
 */
router.post('/:service/start', authenticate, AIServicesController.start);

/**
 * @swagger
 * /api/system/ai-services/{service}/stop:
 *   post:
 *     summary: Stop a local AI service this process started
 *     tags: [System]
 *     parameters:
 *       - { name: service, in: path, required: true, schema: { type: string, enum: [llm, tts, comfyui, avatar] } }
 *     responses:
 *       200: { description: Updated status }
 */
router.post('/:service/stop', authenticate, AIServicesController.stop);

/**
 * @swagger
 * /api/system/ai-services/{service}/restart:
 *   post:
 *     summary: Restart a local AI service
 *     tags: [System]
 *     parameters:
 *       - { name: service, in: path, required: true, schema: { type: string, enum: [llm, tts, comfyui, avatar] } }
 *     responses:
 *       200: { description: Updated status }
 */
router.post('/:service/restart', authenticate, AIServicesController.restart);

module.exports = router;
