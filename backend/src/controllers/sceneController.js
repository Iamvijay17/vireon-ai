const VideoJob = require('../models/VideoJob');
const { validate, jobIdSchema } = require('../validators');
const LoggerService = require('../services/LoggerService');
const { JOB_STATUS } = require('../constants');

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

      // Preserve AWAITING_APPROVAL if that's the job's current status, so
      // saving edits during the pre-render approval pause doesn't lose track
      // of the fact it's still awaiting approval (vs. SCRIPT_COMPLETED for
      // post-completion revisions, which are ready for an explicit re-render).
      const existing = await VideoJob.findById(id).select('status').lean();
      const nextStatus = existing?.status === JOB_STATUS.AWAITING_APPROVAL
        ? JOB_STATUS.AWAITING_APPROVAL
        : JOB_STATUS.SCRIPT_COMPLETED;

      const updatedJob = await VideoJob.findByIdAndUpdate(
        id,
        {
          'script.scenes': scenes,
          status: nextStatus,
          progress: 20,
          currentStep: nextStatus,
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