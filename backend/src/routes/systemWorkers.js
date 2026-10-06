const { Router } = require('express');
const config = require('../config');
const appVersion = require('../config/version');
const videoQueue = require('../queues/videoQueue');
const courseQueue = require('../queues/courseQueue');
const { authenticate } = require('../middleware/auth');
const { parseWorkerClient, assessWorkers } = require('../workers/workerIdentity');

const router = Router();

/**
 * @swagger
 * /api/system/workers:
 *   get:
 *     summary: Every BullMQ worker on the video and course queues, flagging stale and duplicate ones
 *     tags: [System]
 *     responses:
 *       200:
 *         description: api {env, commit}, workers[], duplicates[], stale[], unidentified[], healthy
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const [videoClients, courseClients] = await Promise.all([videoQueue.getWorkers(), courseQueue.getWorkers()]);
    const parse = (queue) => (c) => {
      const w = parseWorkerClient(c);
      // Workers started before identity names existed show up unparsed.
      return w ? { queue, ...w } : { queue, role: 'unnamed', env: 'unknown', commit: '', pid: null };
    };
    const workers = [...videoClients.map(parse('video-rendering')), ...courseClients.map(parse('course-video-processing'))];
    const api = { env: config.nodeEnv, commit: appVersion.commit };
    const result = assessWorkers(workers, { apiEnv: api.env, apiCommit: api.commit });
    res.json({ api, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
