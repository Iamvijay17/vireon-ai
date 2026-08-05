const { Router } = require('express');
const VoiceController = require('../controllers/voiceController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/', authenticate, VoiceController.list);
router.get('/favorites', authenticate, VoiceController.listFavorites);
router.post('/favorites', authenticate, VoiceController.addFavorite);
router.delete('/favorites', authenticate, VoiceController.removeFavorite);

module.exports = router;
