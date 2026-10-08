const crypto = require('crypto');

/**
 * Per-part fingerprints of a scene: a short hash of exactly the inputs that
 * decide each part (see dependencyGraph.js for the parts). Two scenes with the
 * same fingerprint for a part would produce the same part, so:
 *
 *   - a new scene version is recorded only when a fingerprint moved, and
 *   - the parts that moved are the dependency graph's "changed" set, from which
 *     the regeneration plan follows - nobody has to say what they edited.
 *
 * The fingerprints cover inputs, not stored outputs, with two deliberate
 * exceptions that keep a re-take visible: the audio part also hashes the clip's
 * duration (a fresh take of the same text and voice is a different recording),
 * and the image part hashes the resolved image URL (a manually supplied picture
 * with the same prompt is a different image).
 *
 * Derived values written back into `elements` (word timings, the image URL)
 * are stripped before hashing the layout; otherwise every audio or image change
 * would also look like a layout change and defeat the dependency graph.
 */

// Written into `elements` by the audio / image stages, not chosen as layout.
const DERIVED_ELEMENT_KEYS = ['captionTimestamps', 'image', 'hostImage'];

// Canonical JSON: keys sorted at every depth, so a scene whose `elements` came back
// from Mongo in a different key order still hashes the same (utils/hashInputs only
// sorts the top level, which is not enough for user-shaped content).
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      if (value[key] !== undefined) acc[key] = canonical(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const short = (inputs) => crypto.createHash('sha256').update(JSON.stringify(canonical(inputs))).digest('hex').slice(0, 16);

const withoutDerived = (elements) => {
  if (!elements || typeof elements !== 'object') return elements ?? null;
  const rest = { ...elements };
  for (const key of DERIVED_ELEMENT_KEYS) delete rest[key];
  return rest;
};

// Composable motion spec (Phase 6); absent on scenes from before it existed.
const compositionOf = (scene) => (scene.composition && typeof scene.composition === 'object' ? scene.composition : {});

const PARTS = Object.freeze(['script', 'audio', 'captions', 'image', 'layout', 'motion', 'transition']);

/**
 * @param {object} scene  a plain scene (sceneSchema shape)
 * @param {object} [job]  job-level settings that feed narration ({ voice, fastAudio, voiceStyle, voiceProfile })
 * @returns {Record<string,string>} fingerprint per part plus `scene-composition`
 */
function fingerprintScene(scene, job = {}) {
  const audio = scene.audio || {};
  const storyboard = scene.storyboard || {};
  const composition = compositionOf(scene);

  const script = short({
    title: scene.title || '',
    subtitle: scene.subtitle || '',
    narration: audio.text || '',
    content: scene.scene_meta ?? null,
  });

  const audioPart = short({
    narration: audio.text || '',
    voice: audio.voice || job.voice || '',
    emotion: audio.emotion || '',
    fast: Boolean(job.fastAudio),
    style: job.voiceStyle || '',
    profile: job.voiceProfile || '',
    // See file header: a fresh take of identical inputs must register as a change.
    durationMs: Math.round((Number(audio.duration) || 0) * 1000),
  });

  // Word timings are derived from the audio by forced alignment, so they move
  // exactly when the audio does.
  const captions = short({ audio: audioPart, aligner: 1 });

  const image = short({
    prompt: scene.imagePrompt || '',
    variant: Number(storyboard.visual?.variant) || 0,
    url: scene.imageUrl || '',
  });

  const layout = short({
    templateId: scene.templateId || '',
    sceneType: scene.sceneType || '',
    layout: storyboard.layout || '',
    elements: withoutDerived(scene.elements),
    backgroundColor: scene.backgroundColor || '',
    background: composition.background || null,
    decoration: composition.decoration || null,
  });

  const motion = short({
    cameraMotion: scene.cameraMotion || 'static',
    animation: scene.animation || '',
    textMotion: composition.textMotion || null,
    imageMotion: composition.imageMotion || null,
  });

  const transition = short({ transition: scene.transition || 'fade' });

  const sceneComposition = short({
    script, captions, image, layout, motion, transition, speechTiming: scene.speechTiming ?? null,
  });

  return { script, audio: audioPart, captions, image, layout, motion, transition, 'scene-composition': sceneComposition };
}

/** The parts whose fingerprint differs. Everything counts as changed against nothing. */
function diffFingerprints(previous, next) {
  if (!previous) return [...PARTS];
  return PARTS.filter((part) => previous[part] !== next[part]);
}

const sameFingerprints = (a, b) => diffFingerprints(a, b).length === 0;

module.exports = { PARTS, fingerprintScene, diffFingerprints, sameFingerprints, withoutDerived };
