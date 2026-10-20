const os = require('os');
const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { describeProfiles } = require('../config/perfProfiles');

const router = Router();

/**
 * @swagger
 * /api/system/perf-profile:
 *   get:
 *     summary: The active performance profile, every profile with the evidence behind its settings, and a suggestion
 *     description: >
 *       Read-only. `recommendation` is advice from current free memory and is never applied automatically.
 *       Knobs without a measurement are listed as `unmeasured`, not given a value.
 *     tags: [System]
 *     responses:
 *       200: { description: "{ active, recommendation, profiles }" }
 */
router.get('/', authenticate, (req, res) => {
  res.json(describeProfiles(process.env, {
    ramFreeMb: Math.round(os.freemem() / 1048576),
    ramTotalMb: Math.round(os.totalmem() / 1048576),
  }));
});

module.exports = router;
