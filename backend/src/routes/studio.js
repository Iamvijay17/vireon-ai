const { Router } = require('express');
const StudioController = require('../controllers/studioController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/studio/preview/{id}:
 *   post:
 *     summary: Build/refresh a live HyperFrames preview for a job's current scenes
 *     description: Accepts the editor's in-memory (possibly unsaved) scenes and ensures a `hyperframes preview` server is serving them. Returns the project id/port used to fetch thumbnail frames.
 *     tags: [Studio]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Preview server ready
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/preview/:id', authenticate, StudioController.buildPreview);

/**
 * @swagger
 * /api/studio/preview/{id}/thumbnail:
 *   get:
 *     summary: Fetch a single rendered PNG frame from the active preview
 *     tags: [Studio]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: t
 *         in: query
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: PNG frame
 *         content:
 *           image/png: {}
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.get('/preview/:id/thumbnail', authenticate, StudioController.getThumbnail);

module.exports = router;
