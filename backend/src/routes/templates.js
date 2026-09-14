const { Router } = require('express');
const TemplatesController = require('../controllers/templatesController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: List the scene-template catalog
 *     description: Studio's TemplatePickerModal fetches this catalog instead of importing template metadata directly.
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Template catalog
 */
router.get('/', authenticate, TemplatesController.list);

module.exports = router;
