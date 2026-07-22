const { Router } = require('express');
const CourseVideoController = require('../controllers/courseVideoController');
const { authenticate } = require('../middleware/auth');
const requireCourseWorker = require('../middleware/requireCourseWorker');

const router = Router();

// Worker status (frontend polls this to show a running/offline indicator)
router.get('/worker-status', authenticate, CourseVideoController.workerStatus);

// Bulk actions (must be registered before /:id routes)
router.post('/bulk-generate', authenticate, requireCourseWorker, CourseVideoController.bulkGenerate);

// Video CRUD
router.get('/:id', authenticate, CourseVideoController.getById);
router.put('/:id', authenticate, CourseVideoController.update);
router.delete('/:id', authenticate, CourseVideoController.delete);

// Generation pipeline - all of these enqueue a worker job, so they 503 if
// no worker is currently running rather than silently queuing forever.
router.post('/:id/generate-script', authenticate, requireCourseWorker, CourseVideoController.generateScript);
router.post('/:id/approve-script', authenticate, CourseVideoController.approveScript);
router.put('/:id/script', authenticate, CourseVideoController.updateScript);
router.post('/:id/regenerate-script', authenticate, requireCourseWorker, CourseVideoController.regenerateScript);
router.post('/:id/generate-audio', authenticate, requireCourseWorker, CourseVideoController.generateAudio);
router.post('/:id/render', authenticate, requireCourseWorker, CourseVideoController.render);
router.post('/:id/retry', authenticate, requireCourseWorker, CourseVideoController.retry);

// Activity logs
router.get('/:id/activity-logs', authenticate, CourseVideoController.getActivityLogs);

module.exports = router;
