const { Router } = require('express');
const AssetController = require('../controllers/assetController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/assets:
 *   get:
 *     summary: List assets across all owner types (video/course-video/audio-studio), unified
 *     tags: [Assets]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: ownerType
 *         in: query
 *         schema: { type: string, enum: [video, course-video, audio-studio] }
 *       - name: category
 *         in: query
 *         schema: { type: string, enum: [audio, avatar, render, audio-studio] }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: orphanedOnly
 *         in: query
 *         schema: { type: string, enum: ['true', 'false'] }
 *     responses:
 *       200:
 *         description: Paginated asset list
 */
router.get('/', authenticate, AssetController.list);

/**
 * @swagger
 * /api/assets/{id}:
 *   delete:
 *     summary: Delete a single asset (MinIO object + registry entry only)
 *     tags: [Assets]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authenticate, AssetController.remove);

module.exports = router;
