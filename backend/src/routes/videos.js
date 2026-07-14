const { Router } = require('express');
const VideoController = require('../controllers/videoController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.post('/', authenticate, VideoController.create);
router.get('/', authenticate, VideoController.list);
router.get('/:id', authenticate, VideoController.getById);
router.delete('/:id', authenticate, VideoController.delete);

module.exports = router;
