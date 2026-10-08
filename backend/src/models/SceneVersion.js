const mongoose = require('mongoose');

/**
 * One immutable version of one scene.
 *
 * A scene (`sce-xxxxxxxx`, VideoJob.script.scenes[]) is the *working copy* the
 * Studio edits and the pipeline fills in. Whenever that copy settles (the video
 * finished rendering) and differs from the scene's active version, a new version
 * is appended here - v1, v2, v3 - and the scene's `activeVersion` points at it.
 * Versions are never rewritten: change something and you get a new one; go back
 * and the scene is restored from an old one (the old one stays as it was).
 *
 * `snapshot` is the whole scene as it was, enough to restore it byte for byte
 * (audio aside - the MP3 is archived in storage, see `assets.audioArchive`).
 * `provenance` is the "how was this made" record: prompts, models, parameters,
 * template, motion and asset references. `fingerprints` are per-part hashes
 * (services/scene/sceneFingerprint.js) - what makes "which parts changed" a
 * comparison instead of a guess.
 *
 * Existing scenes need no migration: a scene with no versions simply gets its
 * v1 the first time it settles.
 */
const sceneVersionSchema = new mongoose.Schema(
  {
    // `${jobId}:${sceneId}:v${version}` - deterministic, so recording the same
    // version twice (a retried settle) collides on the key instead of duplicating.
    _id: { type: String },
    ownerType: { type: String, default: 'video' },
    jobId: { type: String, required: true },
    sceneId: { type: String, required: true },
    // Position when the version was taken. Identity is sceneId; the number can shift on reorder.
    sceneNumber: { type: Number, required: true },
    version: { type: Number, required: true, min: 1 },
    // The version this one was derived from (null for the first).
    parentVersion: { type: Number, default: null },
    // What caused it: 'initial' | a CHANGE_TYPES key | 'revert' | 'edit'.
    changeType: { type: String, default: 'edit' },
    // Which scene parts differ from the parent, e.g. ['image'].
    changed: { type: [String], default: [] },
    reason: { type: String, default: '' },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    fingerprints: { type: mongoose.Schema.Types.Mixed, required: true },
    provenance: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

sceneVersionSchema.index({ jobId: 1, sceneId: 1, version: -1 }, { unique: true });
sceneVersionSchema.index({ jobId: 1, createdAt: -1 });

// Immutability is enforced, not just promised: every write path other than
// creating a new document, and deleting a whole job's history, is refused.
const refuse = () => {
  throw new Error('Scene versions are immutable - create a new version instead');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'].forEach((op) => {
  sceneVersionSchema.pre(op, refuse);
});
sceneVersionSchema.pre('save', function immutableSave(next) {
  if (!this.isNew) return next(new Error('Scene versions are immutable - create a new version instead'));
  return next();
});

module.exports = mongoose.model('SceneVersion', sceneVersionSchema);
