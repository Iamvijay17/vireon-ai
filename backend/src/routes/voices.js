const { Router } = require('express');
const VoiceController = require('../controllers/voiceController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/', authenticate, VoiceController.list);

module.exports = router;
