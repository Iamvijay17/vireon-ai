const { Router } = require('express');
const VideoController = require('../controllers/videoController');
const SceneController = require('../controllers/sceneController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.post('/', authenticate, VideoController.create);
router.get('/', authenticate, VideoController.list);
router.get('/:id', authenticate, VideoController.getById);
router.put('/:id', authenticate, VideoController.update);
router.delete('/:id', authenticate, VideoController.delete);
router.post('/:id/restart', authenticate, VideoController.restart);
router.post('/:id/regenerate-script', authenticate, VideoController.regenerateScript);
router.post('/:id/approve', authenticate, VideoController.approve);
router.post('/:id/generate-audio', authenticate, VideoController.generateAudio);
router.post('/:id/generate-render', authenticate, VideoController.generateRender);
router.post('/:id/rerender', authenticate, VideoController.rerender);
router.post('/:id/stop', authenticate, VideoController.stop);
router.put('/:id/scenes', authenticate, SceneController.updateScenes);
router.post('/:id/scenes/:sceneNumber/regenerate-audio', authenticate, SceneController.regenerateSceneAudio);
router.post('/:id/scenes/:sceneNumber/remap-template', authenticate, SceneController.remapElementsForTemplate);
router.get('/:id/activity-logs', authenticate, VideoController.getActivityLogs);

module.exports = router;
