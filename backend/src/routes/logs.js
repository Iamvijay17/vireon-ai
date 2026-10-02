const { Router } = require('express');
const LogsController = require('../controllers/logsController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/logs/recent:
 *   get:
 *     summary: Recent server log entries
 *     description: Hydrates the Live Logs page before any new lines have streamed in over the 'serverLog' socket event.
 *     tags: [Logs]
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Max entries to return (clamped 1-300)
 *         schema: { type: integer, default: 200 }
 *     responses:
 *       200:
 *         description: Recent log lines
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { logs: { type: array, items: { type: string } } }
 */
router.get('/recent', authenticate, LogsController.recent);

module.exports = router;
