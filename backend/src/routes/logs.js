const { Router } = require('express');
const LogsController = require('../controllers/logsController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/recent', authenticate, LogsController.recent);

module.exports = router;
