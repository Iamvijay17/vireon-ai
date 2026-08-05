const { Router } = require('express');
const CourseVideoController = require('../controllers/courseVideoController');
const { authenticate } = require('../middleware/auth');
const requireCourseWorker = require('../middleware/requireCourseWorker');

const router = Router();

// Worker status (frontend polls this to show a running/offline indicator)
router.get('/worker-status', authenticate, CourseVideoController.workerStatus);

// Bulk actions (must be registered before /:id routes)
router.post('/bulk-generate', authenticate, requireCourseWorker, CourseVideoController.bulkGenerate);
router.post('/bulk-approve-script', authenticate, CourseVideoController.bulkApproveScript);
router.post('/bulk-delete', authenticate, CourseVideoController.bulkDelete);

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
router.post('/:id/generate-avatar', authenticate, requireCourseWorker, CourseVideoController.generateAvatar);
router.post('/:id/render', authenticate, requireCourseWorker, CourseVideoController.render);
router.post('/:id/retry', authenticate, requireCourseWorker, CourseVideoController.retry);

// Stop doesn't require the worker to be running - a user should be able to
// mark a lesson cancelled even if the worker process is down.
router.post('/:id/stop', authenticate, CourseVideoController.stop);

// Runs synchronously in the API process (a single TTS call), not queued,
// so it doesn't need requireCourseWorker either.
router.post('/:id/scenes/:sceneNumber/regenerate-audio', authenticate, CourseVideoController.regenerateSceneAudio);

// Activity logs
router.get('/:id/activity-logs', authenticate, CourseVideoController.getActivityLogs);

module.exports = router;
