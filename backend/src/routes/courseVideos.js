const { Router } = require('express');
const CourseVideoController = require('../controllers/courseVideoController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Video CRUD
router.get('/:id', authenticate, CourseVideoController.getById);
router.put('/:id', authenticate, CourseVideoController.update);
router.delete('/:id', authenticate, CourseVideoController.delete);

// Generation pipeline
router.post('/:id/generate-script', authenticate, CourseVideoController.generateScript);
router.post('/:id/approve-script', authenticate, CourseVideoController.approveScript);
router.put('/:id/script', authenticate, CourseVideoController.updateScript);
router.post('/:id/regenerate-script', authenticate, CourseVideoController.regenerateScript);
router.post('/:id/generate-audio', authenticate, CourseVideoController.generateAudio);
router.post('/:id/render', authenticate, CourseVideoController.render);
router.post('/:id/retry', authenticate, CourseVideoController.retry);

module.exports = router;