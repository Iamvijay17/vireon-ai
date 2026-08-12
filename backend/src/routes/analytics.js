const { Router } = require('express');
const AnalyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/overview', authenticate, AnalyticsController.overview);

module.exports = router;
