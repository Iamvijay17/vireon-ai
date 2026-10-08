const VideoJob = require('../models/VideoJob');
const { validate, jobIdSchema } = require('../validators');
const LoggerService = require('../services/common/LoggerService');
const VideoService = require('../services/video/VideoService');
const ScriptParserService = require('../services/video/ScriptParserService');
const { convertSceneType } = require('../services/video/sceneConversion');
const { JOB_STATUS } = require('../constants');
const { NotFoundError, ValidationError } = require('../utils/errors');
const config = require('../config');
const { speechTimelineQuerySchema, validateTimeline } = require('../services/audio/pipeline/speech/schemas');
const SceneVersionService = require('../services/scene/SceneVersionService');
const { getRegenerationPlan, CHANGE_TYPES } = require('../services/scene/dependencyGraph');

// Cross-cutting fields that aren't part of any template's per-template shape
// in ScriptParserService._createDefaultElements, but should still carry over
// when a scene switches templates (a style edit or background pick shouldn't
// be lost just because the layout changed).
const CARRYOVER_ELEMENT_FIELDS = ['backgroundColor', 'styleConfig'];

// The 3 "content" scene-type variants (see SceneTypeCategories.content in
// remotion/src/templates/TemplateCategories.js) all use the
// `items: [{ heading?, text? }]` shape - kept as a list (rather than a
// sceneType check) since the carry-over logic just needs "is this
// templateId one that speaks the items shape".
const STANDARDIZED_ITEMS_TEMPLATE_IDS = ['001-content', '002-content', '003-content', '004-content', '005-content', '006-content', '007-content', '008-content', '009-content', '010-content', '011-content', '012-content', '013-content', '014-content', '015-content'];

const parseSceneNumber = (raw) => {
  const sceneNumber = parseInt(raw, 10);
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
    throw new ValidationError('sceneNumber must be a positive integer');
  }
  return sceneNumber;
};

class SceneController {
  /**
   * GET /api/videos/:id/scenes/:sceneNumber/versions - the scene's immutable
   * history (newest first) and which version it is currently on.
   */
  static async listVersions(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      res.json(await SceneVersionService.list(id, parseSceneNumber(req.params.sceneNumber)));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos/:id/scenes/:sceneNumber/regeneration-plan - what would have
   * to be rebuilt, and what is reusable, for a kind of change
   * (?changeType=script|voice|image|layout|motion|transition|style|scene) - or,
   * without changeType, for whatever currently differs from the active version.
   */
  static async regenerationPlan(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const sceneNumber = parseSceneNumber(req.params.sceneNumber);
      const { changeType } = req.query;

      if (changeType === undefined) {
        res.json(await SceneVersionService.planFor(id, sceneNumber));
        return;
      }
      if (!Object.keys(CHANGE_TYPES).includes(changeType)) {
        throw new ValidationError(`changeType must be one of: ${Object.keys(CHANGE_TYPES).join(', ')}`);
      }
      const { sceneId } = await SceneVersionService.list(id, sceneNumber);
      res.json(getRegenerationPlan(sceneId, changeType));
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/videos/:id/scenes - Update video job scenes (studio editor)
   * Allows modifying scene data before re-rendering.
   */
  static async updateScenes(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const { scenes } = req.body;

      if (!Array.isArray(scenes)) {
        throw new ValidationError('Scenes must be an array');
      }

      // Preserve AWAITING_APPROVAL if that's the job's current status, so
      // saving edits during the pre-render approval pause doesn't lose track
      // of the fact it's still awaiting approval (vs. SCRIPT_COMPLETED for
      // post-completion revisions, which are ready for an explicit re-render).
      // AUDIO_COMPLETED (manual mode, paused before "Generate Render") is kept
      // too while every scene still has its audio file: the audio step skips
      // those scenes anyway, so dropping back to SCRIPT_COMPLETED would only
      // force a pointless "Generate Audio" click. A scene added without audio
      // does need that step, so it falls through to SCRIPT_COMPLETED.
      const existing = await VideoJob.findById(id).select('status').lean();
      const keepsStatus = existing?.status === JOB_STATUS.AWAITING_APPROVAL
        || (existing?.status === JOB_STATUS.AUDIO_COMPLETED && scenes.every((s) => s?.audio?.file));
      const nextStatus = keepsStatus ? existing.status : JOB_STATUS.SCRIPT_COMPLETED;
      const nextProgress = nextStatus === JOB_STATUS.AUDIO_COMPLETED ? 50 : 20;

      const updatedJob = await VideoJob.findByIdAndUpdate(
        id,
        {
          'script.scenes': scenes,
          status: nextStatus,
          progress: nextProgress,
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
      const { templateId, fromTemplateId, title, subtitle, audioText, speaker, elements: currentElements, sceneType } = req.body;

      if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
        throw new ValidationError('sceneNumber must be a positive integer');
      }
      if (!templateId || typeof templateId !== 'string') {
        throw new ValidationError('templateId is required');
      }
      // ScriptParserService.GENERATIVE_TEMPLATE_ID ("generative") is one
      // shared id across every sceneType, unlike a numbered "NNN-<sceneType>"
      // id - it can't be reverse-derived, so the caller (which already
      // knows which sceneType bucket it's picking "generative" from in the
      // template picker) must say so explicitly.
      if (templateId === ScriptParserService.GENERATIVE_TEMPLATE_ID && !sceneType) {
        throw new ValidationError('sceneType is required when templateId is "generative"');
      }

      const job = await VideoJob.findById(id).select('hostName guestName').lean();
      if (!job) {
        throw new NotFoundError('Video job not found');
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
      }, sceneType || null);

      const oldElements = currentElements || {};
      for (const field of CARRYOVER_ELEMENT_FIELDS) {
        if (oldElements[field] !== undefined) newElements[field] = oldElements[field];
      }

      // Both templates speak the same items shape - keep the user's actual
      // bullet/step content instead of resetting it to an empty placeholder.
      // "generative" rendering a "content" scene reads the exact same
      // `items` shape as the legacy numbered content templates (see
      // ScriptParserService._createContentElementsFromMeta) - for the "from"
      // side, its own sceneType isn't known here, so an `items` array on
      // the old elements is used as the structural signal instead.
      const isItemsShaped = (id, type, elements) =>
        STANDARDIZED_ITEMS_TEMPLATE_IDS.includes(id) ||
        (id === ScriptParserService.GENERATIVE_TEMPLATE_ID && (type === 'content' || Array.isArray(elements?.items)));

      const bothStandardized =
        isItemsShaped(templateId, sceneType, oldElements) &&
        isItemsShaped(fromTemplateId, null, oldElements);
      if (bothStandardized && Array.isArray(oldElements.items) && oldElements.items.length) {
        newElements.items = oldElements.items;
      }

      res.json({ elements: newElements });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/scenes/:sceneNumber/convert-type - Compute what a
   * scene looks like as a different sceneType: a template of that type, the
   * matching `elements` shape, and - for image-bearing types - an image prompt
   * (the scene's own, else drafted from its narration).
   *
   * The Studio's Scene Type dropdown used to flip only `sceneType`, leaving a
   * `content` template, items-shaped elements and no image prompt - so the
   * scene never got a picture. Like remap-template this reads the scene from
   * the request body (the editor holds unsaved edits) and persists nothing.
   */
  static async convertSceneType(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      const { sceneType, scene } = req.body;

      if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
        throw new ValidationError('sceneNumber must be a positive integer');
      }
      if (!Object.keys(ScriptParserService.SCENE_TYPE_TEMPLATE_IDS).includes(sceneType)) {
        throw new ValidationError(`sceneType must be one of: ${Object.keys(ScriptParserService.SCENE_TYPE_TEMPLATE_IDS).join(', ')}`);
      }
      if (!scene || typeof scene !== 'object') {
        throw new ValidationError('scene is required');
      }

      const job = await VideoJob.findById(id).select('type topic language hostName guestName script.brief').lean();
      if (!job) {
        throw new NotFoundError('Video job not found');
      }

      const { patch, promptSource } = await convertSceneType(scene, sceneType, job);
      res.json({ scene: patch, promptSource });
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
        throw new ValidationError('sceneNumber must be a positive integer');
      }

      const result = await VideoService.regenerateSceneAudio(id, sceneNumber);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos/:id/speech-timeline[?scene=N] - the canonical speech
   * timeline(s) stored with the scenes' audio, plus the invariant check of each
   * (empty `issues` = sound). Developer/debug use: the speech timing preview
   * reads this. A scene without a timeline (flag off when its audio was made,
   * or legacy audio) reports `timeline: null` rather than inventing one.
   */
  static async getSpeechTimeline(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const { scene: onlyScene } = validate(speechTimelineQuerySchema)(req.query);

      const job = await VideoJob.findById(id).select('script.scenes.sceneNumber script.scenes.audio').lean();
      if (!job) throw new NotFoundError('Job not found');

      const scenes = (job.script?.scenes || [])
        .filter((s) => onlyScene === undefined || s.sceneNumber === onlyScene)
        .map((s) => {
          const timeline = s.audio?.speechTimeline || null;
          return {
            sceneNumber: s.sceneNumber,
            audioFile: s.audio?.file || null,
            duration: s.audio?.duration || 0,
            timeline,
            issues: timeline ? validateTimeline(timeline) : [],
          };
        });
      if (onlyScene !== undefined && scenes.length === 0) throw new NotFoundError(`Scene ${onlyScene} not found`);

      res.json({
        alignmentEnabled: config.speech.alignmentEnabled,
        drivenAnimationEnabled: config.speech.drivenAnimationEnabled,
        scenes,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/scenes/:sceneNumber/segments/:segmentId/retry -
   * Re-synthesize one narration segment (segmented TTS pipeline only). The
   * scene's other segments come from the cache, so only this one uses the GPU.
   */
  static async retrySceneSegment(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
        throw new ValidationError('sceneNumber must be a positive integer');
      }

      const result = await VideoService.retrySceneSegment(id, sceneNumber, String(req.params.segmentId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = SceneController;