const VideoJob = require('../models/VideoJob');
const { validate, jobIdSchema } = require('../validators');
const LoggerService = require('../services/LoggerService');
const VideoService = require('../services/VideoService');
const ScriptParserService = require('../services/ScriptParserService');
const { JOB_STATUS } = require('../constants');

// Cross-cutting fields that aren't part of any template's per-template shape
// in ScriptParserService._createDefaultElements, but should still carry over
// when a scene switches templates (a style edit or background pick shouldn't
// be lost just because the layout changed).
const CARRYOVER_ELEMENT_FIELDS = ['backgroundColor', 'styleConfig'];

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

  /**
   * POST /api/videos/:id/scenes/:sceneNumber/remap-template - Compute a
   * fresh `elements` shape for a scene switching to a different template.
   *
   * Each template expects its own elements shape (title+stats vs
   * title+columns vs title+items, etc. - see
   * ScriptParserService._createDefaultElements). Picking a new template in
   * the Studio Editor used to just swap `templateId` and leave the old
   * template's `elements` in place, so the new template silently rendered
   * with missing/mismatched fields (e.g. switching to a stats template kept
   * the old title but had no `stats` array to show). This reuses the same
   * shape table script generation already relies on, so switching templates
   * gets the new template's expected fields instead of stale ones.
   *
   * Takes the scene's *current* (possibly unsaved) title/subtitle/etc.
   * straight from the request body rather than re-reading the last-saved
   * scene from the DB - the Studio Editor only persists on "Save Changes",
   * so reading from the DB here would silently drop whatever text the user
   * just typed before switching templates. Only hostName/guestName (job-level,
   * not per-scene-editable) come from the DB.
   *
   * Does not persist anything - the frontend merges the returned `elements`
   * into its local (unsaved) scene state, same as any other edit.
   */
  static async remapElementsForTemplate(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      const { templateId, title, subtitle, audioText, speaker, elements: currentElements } = req.body;

      if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
        throw { status: 400, message: 'sceneNumber must be a positive integer' };
      }
      if (!templateId || typeof templateId !== 'string') {
        throw { status: 400, message: 'templateId is required' };
      }

      const job = await VideoJob.findById(id).select('hostName guestName').lean();
      if (!job) {
        throw { status: 404, message: 'Video job not found' };
      }

      const sceneInput = {
        title: title || '',
        subtitle: subtitle || '',
        speaker: speaker || '',
        audio: { text: audioText || '' },
      };

      const newElements = ScriptParserService._createDefaultElements(templateId, sceneInput, {
        hostName: job.hostName,
        guestName: job.guestName,
      });

      const oldElements = currentElements || {};
      for (const field of CARRYOVER_ELEMENT_FIELDS) {
        if (oldElements[field] !== undefined) newElements[field] = oldElements[field];
      }

      res.json({ elements: newElements });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/scenes/:sceneNumber/regenerate-audio - Regenerate
   * just one scene's audio instead of the whole job's. Runs synchronously
   * (not queued) since it's a single TTS call.
   */
  static async regenerateSceneAudio(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
        throw { status: 400, message: 'sceneNumber must be a positive integer' };
      }

      const result = await VideoService.regenerateSceneAudio(id, sceneNumber);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = SceneController;