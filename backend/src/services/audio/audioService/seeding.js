/**
 * Derive a stable positive 32-bit seed from a jobId so every scene in the
 * same video gets identical TTS prosody instead of a random seed per call.
 */
function seedFromJobId(jobId) {
  let hash = 5381;
  const str = String(jobId);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Clone/custom voices are anchored by a reference file or a fixed preset
 * id, so varying the seed per turn/chunk only changes prosody - identity
 * stays put. A designed voice ("design:<description>" - see
 * voiceCatalog.resolveVoice) has no such anchor: identity is entirely
 * (description text, seed), so a different seed for the same description
 * can synthesize an audibly different-sounding voice. Pin the seed to
 * (id, voice) for design mode so every turn/chunk from the same speaker
 * reuses the exact same seed and stays one consistent voice; fall back to
 * the caller's own per-turn/chunk variant key for every other mode.
 */
function seedForVoice(id, voice, variantKey) {
  if (typeof voice === "string" && voice.startsWith("design:")) {
    return seedFromJobId(`${id}:${voice}`);
  }
  return seedFromJobId(`${id}:${variantKey}`);
}

/**
 * Podcast voice-clone turns have no `instruct` param to hint delivery (see
 * sceneSynthesis.instructFor) - the Qwen3 clone endpoint just doesn't
 * expose one - so a shared per-job seed is the one place left that can
 * vary. Reusing the exact same seed for all ~30 alternating turns (host and
 * guest alike) makes every line land with byte-identical prosodic rhythm,
 * which reads as robotic repetition rather than two people talking. Derive
 * a seed per scene instead, still fully deterministic (jobId+sceneNumber)
 * so resumed/retried scenes reproduce the same output. Non-podcast scenes
 * (scene.speaker unset) keep the original one-seed-per-job behavior, which
 * exists so a single narrator's pace/tone doesn't jump scene to scene.
 */
function seedForScene(jobId, scene, voice) {
  if (typeof voice === "string" && voice.startsWith("design:")) {
    return seedFromJobId(`${jobId}:${voice}`);
  }
  if (scene?.speaker === "host" || scene?.speaker === "guest") {
    return seedFromJobId(`${jobId}:${scene.sceneNumber}`);
  }
  return seedFromJobId(jobId);
}

/**
 * Deterministic small pause (0.25-0.55s) inserted before the given
 * dialogue turn when merging per-turn audio into one file (see
 * audioController.generateDialogue + utils/wavAudio.concatWavFiles) -
 * keeps turns from butting up against each other while staying
 * reproducible for a given generation id. Varied per turn (not a fixed
 * gap) for the same reason scene synthesis varies podcast turn gaps - a
 * fixed pause across many turns reads as metronomic.
 */
function turnGapSeconds(seedKey) {
  return 0.25 + (seedFromJobId(seedKey) % 300) / 1000;
}

module.exports = { seedFromJobId, seedForVoice, seedForScene, turnGapSeconds };
