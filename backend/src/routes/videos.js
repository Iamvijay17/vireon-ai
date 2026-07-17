const { Router } = require('express');
const VideoController = require('../controllers/videoController');
const SceneController = require('../controllers/sceneController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.post('/', authenticate, VideoController.create);
router.get('/', authenticate, VideoController.list);
router.get('/:id', authenticate, VideoController.getById);
router.delete('/:id', authenticate, VideoController.delete);
router.post('/:id/restart', authenticate, VideoController.restart);
router.post('/:id/rerender', authenticate, VideoController.rerender);
router.put('/:id/scenes', authenticate, SceneController.updateScenes);

module.exports = router;
