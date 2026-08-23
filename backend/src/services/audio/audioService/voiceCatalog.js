const fs = require("fs").promises;
const path = require("path");
const VOICE_METADATA = require("../../../config/voiceMetadata");

// Qwen3-TTS built-in speaker presets (used for "custom voice" mode).
const QWEN_SPEAKERS = Object.freeze([
  "Aiden",
  "Dylan",
  "Eric",
  "Ono_anna",
  "Ryan",
  "Serena",
  "Sohee",
  "Uncle_fu",
  "Vivian",
]);

const DEFAULT_SPEAKER = "Ryan";

// Backward-compatible mapping for the old bare voice keys (male-1, female-1, ...).
const LEGACY_VOICE_MAP = Object.freeze({
  "male-1": "Ryan",
  "male-2": "Aiden",
  "female-1": "Serena",
  "female-2": "Vivian",
  "neutral-1": "Eric",
});

const VOICES_DIR = path.resolve(__dirname, "../../../../voices");

// Words too generic to be useful as a filter tag, dropped when deriving tags
// from a clone voice's filename (see listCloneVoices).
const FILENAME_TAG_STOPWORDS = new Set(["and", "the", "a", "an", "voice", "sample"]);

// Dropped from filename-derived tags (not from the filename entirely - see
// genderFromFilename) so gender isn't double-represented as both the
// dedicated gender filter and a generic tag chip in the voice library.
const GENDER_WORDS = new Set(["male", "female", "man", "woman", "boy", "girl"]);

// Clone voice filenames already encode their own descriptors, e.g.
// "benedict-smooth-polished-and-british.mp3" -> ["smooth","polished","british"].
// Drops the leading token (the speaker's name) and any stopword/short/gender
// tokens. Multi-word names ("cecilia-oconnor-warm-and-conversational.mp3")
// still leak the surname as a token here ("oconnor") - listCloneVoices
// filters those out afterward by cross-file frequency instead of trying to
// detect names token-by-token.
function tagsFromFilename(file) {
  const slug = file.replace(/\.(wav|mp3)$/i, "");
  const parts = slug.split(/[-_]+/).slice(1);
  return parts
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !FILENAME_TAG_STOPWORDS.has(w) && !GENDER_WORDS.has(w));
}

// Best-effort gender signal from a clone filename's own tokens (many
// explicitly say "male"/"female" - see backend/voices/), used only when
// voiceMetadata.js has no explicit override for that file.
function genderFromFilename(file) {
  const slug = file.toLowerCase();
  if (/(^|[-_])(female|woman|girl)([-_.]|$)/.test(slug)) return "female";
  if (/(^|[-_])(male|man|boy)([-_.]|$)/.test(slug)) return "male";
  return null;
}

/**
 * List the built-in custom-voice speaker presets, matched up against any
 * same-named reference .wav in backend/voices/ (e.g. "Aiden" -> aiden.wav)
 * so the frontend can preview an actual sample of that speaker instead of
 * a generic placeholder. Matching is substring-based (normalized to
 * lowercase, underscores stripped) so "Ono_anna" matches anna.wav and
 * "Uncle_fu" matches uncle.wav.
 */
async function listCustomVoices() {
  let files = [];
  try {
    files = await fs.readdir(VOICES_DIR);
  } catch {
    files = [];
  }
  const wavFiles = files.filter((f) => f.toLowerCase().endsWith(".wav"));

  return QWEN_SPEAKERS.map((speaker) => {
    const normalizedSpeaker = speaker.toLowerCase().replace(/_/g, "");
    const file = wavFiles.find((f) => {
      const normalizedFile = f.replace(/\.wav$/i, "").toLowerCase().replace(/_/g, "");
      return normalizedSpeaker.includes(normalizedFile) || normalizedFile.includes(normalizedSpeaker);
    });

    const meta = VOICE_METADATA[`custom:${speaker}`] || {};

    return {
      id: `custom:${speaker}`,
      speaker,
      label: speaker.replace(/_/g, " "),
      file: file || null,
      gender: meta.gender || null,
      accent: meta.accent || null,
      tags: meta.tags || [],
    };
  });
}

/**
 * List cloneable voices, discovered from the .wav/.mp3 files in backend/voices/.
 */
async function listCloneVoices() {
  let files;
  try {
    files = await fs.readdir(VOICES_DIR);
  } catch {
    return [];
  }

  const cloneFiles = files.filter((file) => /\.(wav|mp3)$/i.test(file));
  const rawTagsByFile = new Map(cloneFiles.map((file) => [file, tagsFromFilename(file)]));

  // Filename tokens are noisy - a one-off surname fragment ("oconnor",
  // "cartwell") shows up exactly as often as a real descriptor in the raw
  // token list. Real descriptive vocabulary recurs across multiple voices
  // ("warm", "smooth", "professional"...); one-off name fragments and
  // stray filler words don't. Keeping only tags that appear on 2+ files
  // filters that noise out without a hand-maintained blocklist.
  const tagFrequency = new Map();
  for (const tags of rawTagsByFile.values()) {
    for (const tag of new Set(tags)) tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
  }

  return cloneFiles.map((file) => {
    const meta = VOICE_METADATA[`clone:${file}`] || {};
    const filteredTags = (rawTagsByFile.get(file) || []).filter((t) => tagFrequency.get(t) >= 2);
    return {
      id: `clone:${file}`,
      file,
      label: file
        .replace(/\.(wav|mp3)$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      gender: meta.gender || genderFromFilename(file),
      accent: meta.accent || null,
      tags: meta.tags || filteredTags,
    };
  });
}

/**
 * Resolve a voice selection string into a custom-voice speaker, a
 * clone-voice reference file, or a from-scratch designed voice,
 * validating clone files on disk.
 */
async function resolveVoice(voice) {
  if (typeof voice === "string" && voice.startsWith("design:")) {
    const description = voice.slice("design:".length).trim();
    if (!description) {
      throw new Error("Voice design requires a non-empty description");
    }
    return { mode: "design", description };
  }

  if (typeof voice === "string" && voice.startsWith("clone:")) {
    const file = path.basename(voice.slice("clone:".length));
    if (!/\.(wav|mp3)$/i.test(file)) {
      throw new Error(`Invalid clone voice "${file}": must be a .wav or .mp3 file`);
    }

    const filePath = path.join(VOICES_DIR, file);
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Clone voice file not found: ${file}`);
    }

    return { mode: "clone", file, filePath };
  }

  if (typeof voice === "string" && voice.startsWith("custom:")) {
    const requested = voice.slice("custom:".length);
    const match = QWEN_SPEAKERS.find(
      (s) => s.toLowerCase() === requested.toLowerCase(),
    );
    return { mode: "custom", speaker: match || DEFAULT_SPEAKER };
  }

  // Legacy bare key (male-1, female-1, ...) or unrecognized value.
  return { mode: "custom", speaker: LEGACY_VOICE_MAP[voice] || DEFAULT_SPEAKER };
}

/**
 * Best-effort, synchronous "male"/"female" for a voice selection string -
 * used by AvatarService.resolveDefaultSourceImage to pick a matching
 * default avatar portrait. Reuses the same VOICE_METADATA gender field
 * that already drives the Voice Library's gender filter, so a voice's
 * avatar and its library listing never disagree. Synchronous (unlike
 * resolveVoice) since it never needs to touch disk - a clone file's
 * gender comes from its filename, not its contents.
 */
function resolveGenderSync(voice) {
  if (typeof voice !== "string") return "female";

  if (voice.startsWith("clone:")) {
    const file = path.basename(voice.slice("clone:".length));
    return VOICE_METADATA[`clone:${file}`]?.gender || genderFromFilename(file) || "female";
  }

  if (voice.startsWith("custom:")) {
    const requested = voice.slice("custom:".length);
    const match = QWEN_SPEAKERS.find((s) => s.toLowerCase() === requested.toLowerCase());
    const speaker = match || DEFAULT_SPEAKER;
    return VOICE_METADATA[`custom:${speaker}`]?.gender || "female";
  }

  if (voice.startsWith("design:")) {
    // No structured gender field for a from-scratch design - best-effort
    // keyword sniff of the description text the user wrote.
    const description = voice.slice("design:".length).toLowerCase();
    if (/\bfemale\b|\bwoman\b/.test(description)) return "female";
    if (/\bmale\b|\bman\b/.test(description)) return "male";
    return "female";
  }

  // Legacy bare key (male-1, female-1, neutral-1, ...) - most already
  // spell out the gender in the key itself.
  if (/female/i.test(voice)) return "female";
  if (/male/i.test(voice)) return "male";

  const speaker = LEGACY_VOICE_MAP[voice] || DEFAULT_SPEAKER;
  return VOICE_METADATA[`custom:${speaker}`]?.gender || "female";
}

module.exports = {
  QWEN_SPEAKERS,
  DEFAULT_SPEAKER,
  LEGACY_VOICE_MAP,
  VOICES_DIR,
  listCustomVoices,
  listCloneVoices,
  resolveVoice,
  resolveGenderSync,
};
