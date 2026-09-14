const HyperFramesService = require('../services/video/HyperFramesService');

class TemplatesController {
  /** GET /api/templates - the scene-template catalog Studio's picker renders. */
  static async list(req, res, next) {
    try {
      res.json({ templates: HyperFramesService.listTemplates() });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = TemplatesController;
