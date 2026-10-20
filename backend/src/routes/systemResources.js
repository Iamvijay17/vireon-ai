const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const ResourceService = require('../services/system/ResourceService');

const router = Router();

/**
 * @swagger
 * /api/system/resources:
 *   get:
 *     summary: Measured host telemetry - CPU, RAM, GPU/VRAM, the GPU task ledger and dependency health
 *     description: >
 *       Read-only. Any figure that cannot be measured is null (never a guess). Exposes no
 *       paths, hostnames, environment values or credentials.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: sampledAt, cpu, memory, gpu, gpuTasks, dependencies
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    res.json(await ResourceService.snapshot());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
