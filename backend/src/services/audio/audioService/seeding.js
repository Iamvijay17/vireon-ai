/**
 * Derive a stable positive 32-bit seed from an arbitrary string (djb2-style)
 * so the same input always reproduces the same seed.
 */
function seedFromJobId(str) {
  let hash = 5381;
  str = String(str);
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
 * Content-based seed for a scene's TTS call: derived from (voice, narration
 * text) alone, no jobId. This is what makes Smart Cache's TTS reuse work -
 * two different jobs (or two lessons in the same course) speaking the exact
 * same line with the exact same voice get the exact same seed, and
 * therefore the exact same audio, so the second occurrence can be served
 * from the cache instead of re-synthesized. The tradeoff (accepted
 * deliberately): a recurring line - a welcome/congrats message, a
 * disclaimer, a repeated podcast reaction like "Right, right" - now sounds
 * identical every time it recurs, instead of getting fresh per-job
 * delivery. A designed voice ("design:<description>") still pins its seed
 * to the voice description alone (not the text), so its identity stays
 * put across every line it speaks - see seedForVoice's reasoning.
 */
function seedForScene(scene, voice) {
  if (typeof voice === "string" && voice.startsWith("design:")) {
    return seedFromJobId(`design:${voice}`);
  }
  const text = scene?.audio?.text || "";
  return seedFromJobId(`${voice || ""}:${text}`);
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
