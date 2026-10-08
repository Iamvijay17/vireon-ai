const VideoJob = require('../../models/VideoJob');
const SceneVersion = require('../../models/SceneVersion');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { generateSceneId } = require('../../utils/id');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { fingerprintScene, diffFingerprints, sameFingerprints } = require('./sceneFingerprint');
const { getRegenerationPlan, restorePlan, changeTypeFor } = require('./dependencyGraph');

/**
 * Immutable scene history for video jobs (models/SceneVersion.js).
 *
 *   settle(jobId)        the video just rendered: record a new version of every
 *                        scene whose parts differ from its active version
 *   list / get           read the history
 *   revert(...)          restore a scene from an older version
 *   planFor(...)         what would have to be rebuilt to get the scene to a state
 *
 * A scene's identity is its `sceneId`; versions are keyed by it, so reordering
 * or inserting scenes never detaches history. Recording is best-effort: a
 * failure here is logged and never fails the render it follows.
 */

const AUDIO_ARCHIVE_DIR = 'versions';

const versionId = (jobId, sceneId, version) => `${jobId}:${sceneId}:v${version}`;

function storage() {
  // Lazy: the provider opens its MinIO client on first use.
  return require('../storage/providers').getStorageProvider();
}

/** Where scene N's narration currently lives, and where a version's copy is kept. */
const audioKey = (jobId, sceneNumber) => `${jobId}/audio/scene${sceneNumber}.mp3`;
const archiveKey = (jobId, sceneNumber, audioFp) => `${jobId}/audio/${AUDIO_ARCHIVE_DIR}/scene${sceneNumber}.${audioFp.slice(0, 12)}.mp3`;

/**
 * The renderer reads `scene{N}.mp3`, and regenerating narration overwrites it.
 * So each distinct recording is copied (server-side, no download) to a name that
 * can never be overwritten; the version points at the copy. Returns the archive
 * key, or null if the object is not there to copy - the version is still
 * recorded, it just cannot restore its audio.
 */
async function archiveAudio(jobId, sceneNumber, audioFp) {
  const dest = archiveKey(jobId, sceneNumber, audioFp);
  try {
    const bucket = config.minio.scenesBucket;
    await storage().copyObject(bucket, dest, bucket, audioKey(jobId, sceneNumber));
    return dest;
  } catch (err) {
    LoggerService.warn('[SceneVersion] could not archive scene audio', { jobId, sceneNumber, error: err.message });
    return null;
  }
}

/** Put an archived recording back where the renderer reads it. */
async function restoreAudio(jobId, sceneNumber, archivedKey) {
  const bucket = config.minio.scenesBucket;
  await storage().copyObject(bucket, audioKey(jobId, sceneNumber), bucket, archivedKey);
}

/** "How was this made" - the record that makes a version reproducible. */
function provenanceFor(job, scene, { audioArchive = null } = {}) {
  const audio = scene.audio || {};
  const storyboard = scene.storyboard || {};
  const brief = job.script?.brief || {};
  const visual = storyboard.visual || {};
  return {
    prompt: audio.text || '',
    llmModel: brief.llmModel || config.ollama.model,
    ttsModel: audio.ttsMeta?.ttsModel || `Qwen3-TTS ${job.fastAudio ? config.tts.fastModelSize : config.tts.modelSize}`,
    ttsConfig: {
      voice: audio.voice || job.voice || '',
      emotion: audio.emotion || '',
      fastAudio: Boolean(job.fastAudio),
      voiceProfile: audio.ttsMeta?.voiceProfile || job.voiceProfile || null,
      voiceStyle: audio.ttsMeta?.style || job.voiceStyle || null,
      segmented: Boolean(audio.segments?.length),
    },
    imageModel: scene.imagePrompt ? config.imageGen.checkpoint || null : null,
    imagePrompt: scene.imagePrompt || '',
    imageParams: scene.imagePrompt
      ? {
          variant: Number(visual.variant) || 0,
          steps: config.imageGen.steps,
          cfg: config.imageGen.cfg,
          sampler: config.imageGen.sampler,
          scheduler: config.imageGen.scheduler,
        }
      : null,
    template: scene.templateId || '',
    sceneType: scene.sceneType || '',
    layout: storyboard.layout || '',
    motion: { cameraMotion: scene.cameraMotion || 'static', animation: scene.animation || '', ...(scene.composition || {}) },
    transition: scene.transition || 'fade',
    assets: { audioFile: audio.file || '', audioArchive, imageUrl: scene.imageUrl || '' },
    generation: { storyboardSource: brief.storyboardSource || null, directorVersion: brief.directorVersion || null },
  };
}

/**
 * Scenes saved before versioning get their `sceneId` only as a schema default,
 * which Mongoose re-rolls on every load until it is stored. Persist one so the
 * identity versions hang off is stable. Returns the scenes with ids filled in.
 */
async function ensureSceneIds(jobId, scenes) {
  const missing = scenes.filter((s) => !s.sceneId);
  if (missing.length === 0) return scenes;
  await Promise.all(
    missing.map(async (scene) => {
      scene.sceneId = generateSceneId();
      await VideoJob.updateOne(
        { _id: jobId, 'script.scenes.sceneNumber': scene.sceneNumber },
        { $set: { 'script.scenes.$.sceneId': scene.sceneId } }
      );
    })
  );
  return scenes;
}

async function latestVersion(jobId, sceneId) {
  return SceneVersion.findOne({ jobId, sceneId }).sort({ version: -1 }).lean();
}

async function getVersion(jobId, sceneId, version) {
  return SceneVersion.findById(versionId(jobId, sceneId, version)).lean();
}

/**
 * Append a version for one scene if its parts moved. Returns the new version, or
 * null when the scene still matches its active version.
 */
async function recordIfChanged(job, scene, { changeType, reason } = {}) {
  const fingerprints = fingerprintScene(scene, job);
  const latest = await latestVersion(job._id, scene.sceneId);
  // Compare against the version the scene IS (it may have been reverted to an
  // older one), not just the newest.
  const base = scene.activeVersion && latest && scene.activeVersion !== latest.version
    ? await getVersion(job._id, scene.sceneId, scene.activeVersion)
    : latest;

  if (base && sameFingerprints(base.fingerprints, fingerprints)) {
    if (scene.activeVersion !== base.version) {
      await setActive(job._id, scene.sceneId, base.version);
    }
    return null;
  }

  const changed = diffFingerprints(base?.fingerprints, fingerprints);
  const nextNumber = (latest?.version || 0) + 1;

  // The recording is only archived when it is one this history has not kept yet.
  const audioMoved = !base || changed.includes('audio');
  const audioArchive = scene.audio?.file && audioMoved
    ? await archiveAudio(job._id, scene.sceneNumber, fingerprints.audio)
    : base?.provenance?.assets?.audioArchive || null;

  const doc = {
    _id: versionId(job._id, scene.sceneId, nextNumber),
    jobId: String(job._id),
    sceneId: scene.sceneId,
    sceneNumber: scene.sceneNumber,
    version: nextNumber,
    parentVersion: base?.version ?? null,
    changeType: base ? changeType || changeTypeFor(changed) || 'edit' : 'initial',
    changed,
    reason: reason || '',
    snapshot: { ...scene, activeVersion: nextNumber },
    fingerprints,
    provenance: provenanceFor(job, scene, { audioArchive }),
  };

  try {
    await SceneVersion.create(doc);
  } catch (err) {
    if (err?.code === 11000) {
      // Another settle recorded this version first (two workers, a retried call).
      return getVersion(job._id, scene.sceneId, nextNumber);
    }
    throw err;
  }
  await setActive(job._id, scene.sceneId, nextNumber);
  return doc;
}

async function setActive(jobId, sceneId, version) {
  await VideoJob.updateOne(
    { _id: jobId, 'script.scenes.sceneId': sceneId },
    { $set: { 'script.scenes.$.activeVersion': version } }
  );
}

/**
 * The video has finished: record a version for every scene that changed since its
 * active one. Safe to call any number of times - an unchanged scene records
 * nothing - and never throws.
 */
async function settle(jobId, { changeType, reason } = {}) {
  try {
    const job = await VideoJob.findById(jobId).lean();
    const scenes = job?.script?.scenes;
    if (!scenes?.length) return [];

    await ensureSceneIds(jobId, scenes);

    const recorded = [];
    for (const scene of scenes) {
      const version = await recordIfChanged(job, scene, { changeType, reason });
      if (version) recorded.push({ sceneId: scene.sceneId, sceneNumber: scene.sceneNumber, version: version.version, changed: version.changed });
    }
    if (recorded.length > 0) {
      LoggerService.info('[SceneVersion] recorded scene versions', { jobId, count: recorded.length, versions: recorded });
    }
    return recorded;
  } catch (err) {
    LoggerService.warn('[SceneVersion] could not record scene versions', { jobId, error: err.message });
    return [];
  }
}

async function findScene(jobId, sceneNumber) {
  const job = await VideoJob.findById(jobId).lean();
  if (!job) throw new NotFoundError('Job not found');
  const scene = job.script?.scenes?.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) throw new NotFoundError(`Scene ${sceneNumber} not found`);
  await ensureSceneIds(jobId, [scene]);
  return { job, scene };
}

/** A scene's history, newest first, with the version it is currently on. */
async function list(jobId, sceneNumber) {
  const { scene } = await findScene(jobId, sceneNumber);
  const versions = await SceneVersion.find({ jobId, sceneId: scene.sceneId })
    .sort({ version: -1 })
    .select('-snapshot')
    .lean();
  const latest = versions[0]?.version ?? null;
  return {
    sceneId: scene.sceneId,
    sceneNumber,
    activeVersion: scene.activeVersion ?? latest,
    versions: versions.map((v) => ({ ...v, id: v._id, active: v.version === (scene.activeVersion ?? latest) })),
  };
}

/**
 * Which parts of the scene differ from a recorded version, and what rebuilding
 * them takes. With no `version`, compares against the scene's active one.
 */
async function planFor(jobId, sceneNumber, { version } = {}) {
  const { job, scene } = await findScene(jobId, sceneNumber);
  const target = version ?? scene.activeVersion;
  const base = target ? await getVersion(jobId, scene.sceneId, target) : null;
  if (version && !base) throw new NotFoundError(`Scene ${sceneNumber} has no version ${version}`);

  const changed = diffFingerprints(base?.fingerprints, fingerprintScene(scene, job));
  if (changed.length === 0) {
    return { version: base?.version ?? null, ...restorePlan(scene.sceneId, []) };
  }
  return { version: base?.version ?? null, ...getRegenerationPlan(scene.sceneId, changeTypeFor(changed) || 'custom', { changed }) };
}

/**
 * Make an older version the scene's current state. The version itself is not
 * touched; the scene (the working copy) is rewritten from its snapshot and its
 * active pointer moved. The narration recording is copied back from the archive.
 * The caller re-renders afterwards - the returned plan says that is all it takes
 * unless the parts moved further.
 */
async function revert(jobId, sceneNumber, version) {
  if (!Number.isInteger(version) || version < 1) throw new ValidationError('version must be a positive integer');
  const { job, scene } = await findScene(jobId, sceneNumber);

  const target = await getVersion(jobId, scene.sceneId, version);
  if (!target) throw new NotFoundError(`Scene ${sceneNumber} has no version ${version}`);

  const before = fingerprintScene(scene, job);
  // Identity (id, position) is the live scene's; everything else is the version's.
  const restored = { ...target.snapshot, sceneId: scene.sceneId, sceneNumber: scene.sceneNumber, activeVersion: version };

  const audioFp = target.fingerprints.audio;
  const archived = target.provenance?.assets?.audioArchive;
  let audioRestored = false;
  if (before.audio !== audioFp) {
    if (archived) {
      try {
        await restoreAudio(jobId, scene.sceneNumber, archived);
        audioRestored = true;
      } catch (err) {
        LoggerService.warn('[SceneVersion] archived audio is missing - keeping the current recording', { jobId, sceneNumber, version, error: err.message });
      }
    }
    if (!audioRestored) {
      // Keep what is actually in storage so the scene never points at audio that is not there.
      restored.audio = { ...restored.audio, file: scene.audio?.file || '', duration: scene.audio?.duration || 0,
        captionTimestamps: scene.audio?.captionTimestamps ?? null, segments: scene.audio?.segments,
        ttsMeta: scene.audio?.ttsMeta, speechTimeline: scene.audio?.speechTimeline };
    }
  }

  await VideoJob.updateOne(
    { _id: jobId, 'script.scenes.sceneId': scene.sceneId },
    { $set: { 'script.scenes.$': restored } }
  );

  const changed = diffFingerprints(before, fingerprintScene(restored, job));
  LoggerService.info('[SceneVersion] reverted scene', { jobId, sceneNumber, version, changed, audioRestored });
  return {
    sceneId: scene.sceneId,
    sceneNumber,
    version,
    audioRestored,
    // Audio the archive could not restore is reported, not hidden.
    warnings: before.audio !== audioFp && !audioRestored ? ['The original narration could not be restored; the current recording was kept.'] : [],
    plan: restorePlan(scene.sceneId, changed),
  };
}

module.exports = { settle, list, planFor, revert, recordIfChanged, ensureSceneIds, provenanceFor, archiveKey, audioKey, versionId };
