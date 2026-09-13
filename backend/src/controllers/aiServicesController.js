const LocalAIService = require('../services/localAI');
const LoggerService = require('../services/common/LoggerService');
const { ValidationError } = require('../utils/errors');

const MANAGERS = {
  llm: LocalAIService.lmStudio,
  tts: LocalAIService.tts,
  comfyui: LocalAIService.comfyUI,
};

function assertValidService(service) {
  if (!MANAGERS[service]) {
    throw new ValidationError(`Invalid service "${service}" - must be one of: ${Object.keys(MANAGERS).join(', ')}`);
  }
}

class AIServicesController {
  /**
   * GET /api/system/ai-services
   * { gpu: { currentService, mode, maxConcurrent }, services: { llm, tts, comfyui, remotion } }
   */
  static async getAll(req, res, next) {
    try {
      res.json(await LocalAIService.getAllStatuses());
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/system/ai-services/:service/start
   * Manual override outside the normal GPU-sequential pipeline flow - goes
   * straight to the manager, not through GPUResourceManager, so use this
   * for diagnostics/manual control, not for anything that should respect
   * the one-GPU-service-at-a-time rule.
   */
  static async start(req, res, next) {
    try {
      const { service } = req.params;
      assertValidService(service);
      const manager = MANAGERS[service];
      await manager.start();
      await manager.waitUntilReady();
      res.json(await manager.getStatus());
    } catch (err) {
      LoggerService.error(`[AI SERVICE] Manual start failed for ${req.params.service}`, { error: err.message });
      next(err);
    }
  }

  /** POST /api/system/ai-services/:service/stop */
  static async stop(req, res, next) {
    try {
      const { service } = req.params;
      assertValidService(service);
      await MANAGERS[service].stop();
      res.json(await MANAGERS[service].getStatus());
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/system/ai-services/:service/restart */
  static async restart(req, res, next) {
    try {
      const { service } = req.params;
      assertValidService(service);
      await MANAGERS[service].restart();
      res.json(await MANAGERS[service].getStatus());
    } catch (err) {
      LoggerService.error(`[AI SERVICE] Manual restart failed for ${req.params.service}`, { error: err.message });
      next(err);
    }
  }
}

module.exports = AIServicesController;
