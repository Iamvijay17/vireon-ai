const { z } = require('zod');
const VideoJob = require('../../models/VideoJob');
const LoggerService = require('../common/LoggerService');
const ActivityLogService = require('../common/ActivityLogService');
const stageTracker = require('../pipeline/stageTracker');
const { STAGE_RESUME } = require('../pipeline/stages');
const { JOB_STATUS } = require('../../constants');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { LAYOUT_REGISTRY } = require('../../ir/compositionRegistry');
const { prepareSceneForImage } = require('../image/sceneImages');
const { profileOf, isLayoutCompatible } = require('../director/layoutCompat');
const { PODCAST_LAYOUTS } = require('../director/vocabulary');
const VideoService = require('../video/VideoService');
const SceneVersionService = require('./SceneVersionService');
const { getRegenerationPlan } = require('./dependencyGraph');
const { presetPatch, listPresets, PRESETS } = require('./stylePresets');

/**
 * Scene-level regeneration: change or redo ONE part of ONE scene and rebuild only
 * what that part feeds (dependencyGraph.js), instead of regenerating the video.
 *
 *   image    redraw the picture (optionally from a new prompt)
 *   voice    re-record the narration (optionally in another voice)
 *   script   change the narration text; voice, captions follow
 *   layout   pick another composition for the scene
 *   style    apply a named look ("more cinematic")
 *   scene    a fresh voice and picture for the scene
 *
 * How it stays cheap and safe:
 *   - the scene's current state is recorded as a version FIRST (settle), so the
 *     change can always be undone - including for videos finished before versions
 *     existed;
 *   - only the target scene's fields change; every other scene is untouched, and
 *     the worker's steps skip any scene whose audio/image is already stored, so
 *     unrelated scenes cost nothing;
 *   - the job is rewound to the first stage the plan needs, never further, so
 *     everything before it is reused; the previous video stays in place until the
 *     new render replaces it;
 *   - the result is a NEW version once the render finishes (SceneVersionService.settle
 *     at the end of the upload step) - old versions are never modified.
 */

// A finished or stopped job can be regenerated from; one that is mid-pipeline or still
// waiting for its script to be approved cannot (there is nothing rendered to change).
const REGENERABLE = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.SCRIPT_COMPLETED, JOB_STATUS.AUDIO_COMPLETED];
const REVERTIBLE = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.SCRIPT_COMPLETED];

const regenerateSceneSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('image'), prompt: z.string().trim().max(600).optional() }),
  z.object({ target: z.literal('voice'), voice: z.string().trim().min(1).max(160).optional() }),
  z.object({ target: z.literal('script'), text: z.string().trim().min(1).max(8000) }),
  z.object({ target: z.literal('layout'), layout: z.enum(LAYOUT_REGISTRY) }),
  z.object({ target: z.literal('style'), preset: z.enum(Object.keys(PRESETS)) }),
  z.object({ target: z.literal('scene') }),
]);

const CHANGE_TYPE = { image: 'image', voice: 'voice', script: 'script', layout: 'layout', style: 'style', scene: 'scene' };

const hasText = (v) => typeof v === 'string' && v.trim().length > 0;

async function loadJob(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) throw new NotFoundError('Job not found');
  return job;
}

function findScene(job, sceneNumber) {
  const scene = job.script?.scenes?.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) throw new NotFoundError(`Scene ${sceneNumber} not found`);
  return scene;
}

/** Narration gone, so the worker's audio step records it again - and only this scene's. */
function clearNarration(scene, { fresh }) {
  scene.audio.file = '';
  scene.audio.duration = 0;
  scene.audio.captionTimestamps = null;
  scene.audio.segments = undefined;
  scene.audio.ttsMeta = undefined;
  scene.audio.speechTimeline = undefined;
  // Same text and voice would be served from the cache; an explicit "regenerate" must not be.
  scene.audio.fresh = fresh ? true : undefined;
  if (scene.elements) {
    scene.elements.captionTimestamps = null;
    scene.markModified('elements');
  }
}

/** The compatible layouts for a stored scene - what "Change layout" may offer. */
function compatibleLayouts(scene) {
  const plain = typeof scene.toObject === 'function' ? scene.toObject() : scene;
  const picture = Boolean(plain.imageUrl || plain.imagePrompt) || plain.sceneType === 'image' || plain.sceneType === 'contentwithimage';
  const profile = profileOf(plain, { hasImage: picture });
  return LAYOUT_REGISTRY.filter((layout) => isLayoutCompatible(layout, profile));
}

/**
 * What the Studio may offer for this scene, and why not when it may not.
 */
async function getOptions(jobId, sceneNumber) {
  const job = await loadJob(jobId);
  const scene = findScene(job, sceneNumber);
  const plain = scene.toObject();

  const regenerable = REGENERABLE.includes(job.status);
  const reason = regenerable ? null : `The video is ${String(job.status).toLowerCase().replace(/_/g, ' ')} - scenes can be regenerated once it has finished.`;
  const generative = plain.templateId === 'generative';
  const picture = hasText(plain.imagePrompt) || hasText(plain.storyboard?.visual?.prompt);

  const history = await SceneVersionService.list(jobId, sceneNumber).catch(() => ({ versions: [], activeVersion: null }));

  return {
    sceneId: plain.sceneId,
    sceneNumber,
    status: job.status,
    allowed: {
      image: regenerable && picture,
      voice: regenerable && hasText(plain.audio?.text),
      script: regenerable,
      layout: regenerable && generative,
      style: regenerable && generative,
      scene: regenerable,
      revert: REVERTIBLE.includes(job.status) && history.versions.length > 1,
    },
    reason,
    layouts: generative ? compatibleLayouts(scene) : [],
    currentLayout: plain.storyboard?.layout || '',
    presets: generative ? listPresets() : [],
    voice: plain.audio?.voice || job.voice || '',
    activeVersion: history.activeVersion,
    versionCount: history.versions.length,
  };
}

/**
 * Apply a regeneration request to one scene. Returns what changed and what will be
 * rebuilt; the caller then (re)queues the job so the worker does the work.
 *
 * @param {string} jobId
 * @param {number} sceneNumber
 * @param {object} request     validated by regenerateSceneSchema
 * @returns {Promise<{ job: object, plan: object, noop?: boolean, message?: string }>}
 */
async function regenerate(jobId, sceneNumber, request) {
  const job = await loadJob(jobId);
  if (!REGENERABLE.includes(job.status)) {
    throw new ValidationError(`The video is ${job.status} - scenes can be regenerated once it has finished (or failed).`);
  }
  findScene(job, sceneNumber); // 404 for an unknown scene before anything is touched
  const { target } = request;

  // Keep a record of the scene as it is now, so this change can be reverted. For a
  // video finished before versions existed this is its v1.
  await SceneVersionService.settle(jobId, { reason: `before ${target} regeneration` });
  // settle() may have persisted a missing sceneId and a pointer; read the scene back.
  const fresh = await loadJob(jobId);
  const current = findScene(fresh, sceneNumber);

  switch (target) {
    case 'image': {
      // The existing image regeneration already does the whole job - re-rolls this scene's
      // picture (and a podcast's shared cover for every turn that uses it), rewinds to the
      // image stage and invalidates the stages after it. This only adds the version record
      // before it and the plan after it.
      const updated = await VideoService.regenerateSceneImage(jobId, sceneNumber, { prompt: request.prompt || undefined });
      const plan = getRegenerationPlan(current.sceneId, 'image');
      await ActivityLogService.add(jobId, describe(target, sceneNumber, request, plan));
      return { job: updated, plan };
    }

    case 'voice': {
      if (!hasText(current.audio?.text)) throw new ValidationError('This scene has no narration to record.');
      const voiceChanged = hasText(request.voice) && request.voice !== current.audio.voice;
      if (voiceChanged) current.audio.voice = request.voice;
      // A different voice is a different recording on its own; the same voice needs the cache bypassed.
      clearNarration(current, { fresh: !voiceChanged });
      break;
    }

    case 'script': {
      const text = request.text;
      if (text === current.audio?.text) {
        return { job: fresh, noop: true, message: 'The narration is unchanged - the existing recording is reused.', plan: getRegenerationPlan(current.sceneId, 'script', { changed: [] }) };
      }
      current.audio.text = text;
      clearNarration(current, { fresh: false });
      break;
    }

    case 'layout': {
      const plain = current.toObject();
      if (plain.templateId !== 'generative') {
        throw new ValidationError('Layouts apply to scenes drawn by the generative engine. This scene uses a numbered template - change the template instead.');
      }
      const picture = Boolean(plain.imageUrl || plain.imagePrompt) || ['image', 'contentwithimage'].includes(plain.sceneType);
      const profile = profileOf(plain, { hasImage: picture });
      if (PODCAST_LAYOUTS.includes(request.layout) !== (plain.sceneType === 'podcast') || !isLayoutCompatible(request.layout, profile)) {
        throw new ValidationError(
          `"${request.layout}" cannot show this scene's content without dropping text. Compatible layouts: ${compatibleLayouts(current).join(', ') || 'none'}.`
        );
      }
      if (plain.storyboard?.layout === request.layout) {
        return { job: fresh, noop: true, message: 'The scene already uses that layout.', plan: getRegenerationPlan(current.sceneId, 'layout', { changed: [] }) };
      }
      current.storyboard = { ...(plain.storyboard || {}), layout: request.layout, source: 'user' };
      current.markModified('storyboard');
      break;
    }

    case 'style': {
      const plain = current.toObject();
      if (plain.templateId !== 'generative') {
        throw new ValidationError('Looks apply to scenes drawn by the generative engine. This scene uses a numbered template.');
      }
      const patch = presetPatch(request.preset, plain);
      current.cameraMotion = patch.cameraMotion;
      current.transition = patch.transition;
      current.composition = patch.composition;
      current.markModified('composition');
      if (patch.layout) {
        current.storyboard = { ...(plain.storyboard || {}), layout: patch.layout, source: 'user' };
        current.markModified('storyboard');
      }
      break;
    }

    case 'scene': {
      const plain = current.toObject();
      clearNarration(current, { fresh: true });
      const prepared = hasText(plain.imagePrompt) || hasText(plain.storyboard?.visual?.prompt) ? prepareSceneForImage(plain, '') : null;
      if (prepared) applyPlain(current, prepared);
      break;
    }

    default:
      throw new ValidationError(`Unknown target "${target}"`);
  }

  await fresh.save();

  // What to rebuild comes from the dependency graph for this kind of change.
  const plan = getRegenerationPlan(current.sceneId, CHANGE_TYPE[target]);

  const firstStage = plan.stages[0];
  const resume = resumeStatusFor(firstStage);
  await stageTracker.invalidate(jobId, firstStage);

  // The previous video is deliberately kept (not blanked) until the new render replaces it:
  // if this regeneration fails, the video that already existed is not lost.
  const updated = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: { status: resume.status, progress: resume.progress, currentStep: resume.status },
      $unset: { error: '', nextRetryAt: '' },
    },
    { new: true }
  );

  await ActivityLogService.add(jobId, describe(target, sceneNumber, request, plan));
  LoggerService.info('Scene regeneration prepared', { jobId, sceneNumber, target, stages: plan.stages, regenerate: plan.regenerate, reusable: plan.reusable });

  return { job: updated, plan };
}

/** Copy the planned changes onto the Mongoose scene subdocument, field by field. */
function applyPlain(subdoc, plain) {
  for (const key of ['sceneType', 'subtitle', 'templateId', 'imagePrompt', 'imageUrl', 'elements', 'storyboard']) {
    if (key in plain) subdoc[key] = plain[key];
  }
  subdoc.markModified('elements');
  subdoc.markModified('storyboard');
}

/**
 * Where to put the job so the worker picks up at the right stage and nothing earlier
 * runs again. Audio resumes at AUDIO_COMPLETED rather than GENERATING_AUDIO: the audio
 * step still runs (it is gated on what is stored, and records only the scenes with no
 * audio), but a manual-mode job does not stop and wait for a "Generate Render" click
 * it never needed.
 */
function resumeStatusFor(stage) {
  if (stage === 'audio') return { status: JOB_STATUS.AUDIO_COMPLETED, progress: 50 };
  return STAGE_RESUME[stage] || STAGE_RESUME.assets;
}

function describe(target, sceneNumber, request, plan) {
  const rebuilds = plan.regenerate.length ? ` Rebuilds: ${plan.regenerate.join(', ')}.` : '';
  const reuses = plan.reusable.length ? ` Reuses: ${plan.reusable.join(', ')}.` : '';
  const what = {
    image: request.prompt ? 'Regenerating the image with a new prompt' : 'Regenerating the image',
    voice: request.voice ? `Re-recording the voice (${request.voice})` : 'Re-recording the voice',
    script: 'Narration changed - re-recording',
    layout: `Layout changed to ${request.layout}`,
    style: `Applied the "${request.preset}" look`,
    scene: 'Regenerating the scene (new voice and picture)',
  }[target];
  return `Scene ${sceneNumber}: ${what}.${rebuilds}${reuses}`;
}

/**
 * Restore a scene from an older version and queue the (cheap) rebuild: only the
 * composition and the render. Neither version is modified.
 */
async function revert(jobId, sceneNumber, version) {
  const job = await loadJob(jobId);
  if (!REVERTIBLE.includes(job.status)) {
    throw new ValidationError(`The video is ${job.status} - a scene can be reverted once it has finished.`);
  }

  // So the state being left can be returned to as well.
  await SceneVersionService.settle(jobId, { reason: `before reverting to v${version}` });

  const result = await SceneVersionService.revert(jobId, sceneNumber, version);
  await stageTracker.invalidate(jobId, 'assets');

  const updated = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60, currentStep: JOB_STATUS.PREPARING_ASSETS },
      $unset: { error: '', nextRetryAt: '' },
    },
    { new: true }
  );
  await ActivityLogService.add(jobId, `Scene ${sceneNumber}: reverted to version ${version}. Rebuilds: ${result.plan.regenerate.join(', ') || 'nothing'}.`);
  return { job: updated, ...result };
}

module.exports = { regenerate, revert, getOptions, regenerateSceneSchema, compatibleLayouts, REGENERABLE, REVERTIBLE };
