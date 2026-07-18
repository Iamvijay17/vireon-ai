const { Router } = require('express');
const CourseController = require('../controllers/courseController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Course CRUD
router.post('/', authenticate, CourseController.create);
router.get('/', authenticate, CourseController.list);
router.get('/:id', authenticate, CourseController.getById);
router.put('/:id', authenticate, CourseController.update);
router.delete('/:id', authenticate, CourseController.delete);

// Course Videos
router.get('/:id/videos', authenticate, CourseController.listVideos);
router.post('/:id/videos', authenticate, CourseController.createVideo);

module.exports = router;