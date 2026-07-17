const VideoJob = require('../models/VideoJob');
const { validate, jobIdSchema } = require('../validators');
const LoggerService = require('../services/LoggerService');

class SceneController {
  /**
   * PUT /api/videos/:id/scenes - Update video job scenes (studio editor)
   * Allows modifying scene data before re-rendering.
   */
  static async updateScenes(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const { scenes } = req.body;

      if (!Array.isArray(scenes)) {
        throw { status: 400, message: 'Scenes must be an array' };
      }

      const updatedJob = await VideoJob.findByIdAndUpdate(
        id,
        {
          'script.scenes': scenes,
          status: 'SCRIPT_COMPLETED', // Ready for re-render
          progress: 20,
          currentStep: 'SCRIPT_COMPLETED',
          error: undefined,
        },
        { new: true }
      );

      LoggerService.info('Scenes updated via studio editor', {
        jobId: id,
        sceneCount: scenes.length,
      });

      res.json({
        job: updatedJob,
        message: 'Scenes updated successfully. Ready for re-render.',
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = SceneController;