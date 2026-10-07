const config = require('../../../../config');
const { voiceInstructionSchema, STYLES } = require('../schemas');
const { STYLE_PRESETS, VIDEO_TYPE_STYLE } = require('./styles');
const { buildInstruct } = require('./instructBuilder');

/**
 * Voice Director: decides *how* each segment should be spoken. Rule-based and
 * deterministic (no LLM call, so no extra GPU model swap on the 6GB card):
 * a style preset sets the baseline, then light per-sentence cues nudge it.
 * The script LLM's own per-scene delivery note (scene.audio.emotion) is kept
 * verbatim as `note` - it already knows the line's intended arc, and we'd
 * rather pass it through than re-guess it.
 *
 * The default stays natural and professional: cues are small nudges and
 * most sentences come out identical to the style baseline.
 */
const DIRECTOR_VERSION = 1;

// Keyword -> emotion mapping for the script LLM's free-text note. First
// match wins, so order goes from most to least specific.
const EMOTION_KEYWORDS = [
  [/urgent|alarm|hurry|pressing/i, 'urgent'],
  [/excit|enthusias|thrill|energetic|upbeat|joy/i, 'excited'],
  [/inspir|uplift|motivat|hopeful/i, 'inspiring'],
  [/dramatic|intense|tense|suspens|ominous/i, 'dramatic'],
  [/sad|somber|melanchol|grief|wistful|subdued/i, 'sad'],
  [/serious|grave|stern|solemn/i, 'serious'],
  [/curious|wonder|intrigu|inquisitive/i, 'curious'],
  [/confident|assured|bold|authoritative/i, 'confident'],
  [/calm|sooth|gentle|peaceful|relax/i, 'calm'],
  [/warm|friendly|kind|caring|sincere/i, 'warm'],
];

// Capitalised words that are acronyms, not shouting.
const ACRONYMS = new Set(['HTML', 'HTTP', 'HTTPS', 'JSON', 'YAML', 'REST', 'CRUD', 'NASA', 'SQL', 'NOSQL', 'JWT', 'OAUTH', 'AJAX', 'DEVOPS', 'GRPC', 'IDE']);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Pick the style: explicit > chosen profile > video type > configured default. */
function resolveStyle({ style, profile, videoType } = {}) {
  if (style && STYLES.includes(style)) return style;
  if (profile?.defaultStyle && STYLES.includes(profile.defaultStyle)) return profile.defaultStyle;
  if (videoType && VIDEO_TYPE_STYLE[videoType]) return VIDEO_TYPE_STYLE[videoType];
  return STYLES.includes(config.audio.director.defaultStyle) ? config.audio.director.defaultStyle : 'professional';
}

/** Map the script LLM's free-text delivery note onto an emotion enum, or null. */
function emotionFromNote(note) {
  if (!note) return null;
  for (const [pattern, emotion] of EMOTION_KEYWORDS) {
    if (pattern.test(note)) return emotion;
  }
  return null;
}

/** Words the writer marked (*word*, **word**) or SHOUTED (4+ letters, not an acronym). Max 3. */
function extractEmphasis(text) {
  const found = [];
  const add = (w) => {
    const word = w.trim();
    if (word && !found.some((f) => f.toLowerCase() === word.toLowerCase())) found.push(word);
  };

  for (const m of text.matchAll(/\*{1,2}([^*\n]{1,40}?)\*{1,2}/g)) add(m[1]);

  const hasLowercase = /[a-z]{2,}/.test(text);
  if (hasLowercase) {
    for (const m of text.matchAll(/\b[A-Z]{4,}\b/g)) {
      if (!ACRONYMS.has(m[0])) add(m[0].toLowerCase());
    }
  }
  return found.slice(0, 3);
}

/**
 * Direct a run of segment texts.
 *
 * @param {string[]} texts segment source texts, in order
 * @param {object} [ctx]
 * @param {string}  [ctx.style]        explicit style
 * @param {object}  [ctx.profile]      a voice profile the user chose
 * @param {string}  [ctx.videoType]    constants.VIDEO_TYPES value
 * @param {string}  [ctx.note]         scene.audio.emotion free text
 * @param {string}  [ctx.sceneType]    'title' scenes get a slightly stronger open
 * @param {boolean} [ctx.isFirstScene]
 * @param {boolean} [ctx.isLastScene]
 * @param {object}  [ctx.overrides]    user-forced emotion/speed/pitch/pause values, applied last
 * @returns {object[]} one validated VoiceInstruction per text
 */
function direct(texts, ctx = {}) {
  const style = resolveStyle(ctx);
  const preset = STYLE_PRESETS[style];
  const { speedMin, speedMax, pitchLimit } = config.audio;

  const noteEmotion = emotionFromNote(ctx.note);
  const baseEmotion = noteEmotion || preset.emotion;
  const baseSpeed = preset.speed * (ctx.profile?.defaultSpeed || 1);
  const basePitch = ctx.profile?.defaultPitch || 0;
  const overrides = ctx.overrides || {};

  return texts.map((raw, i) => {
    const text = String(raw || '');
    const trimmed = text.trim();
    const isFirst = i === 0;
    const isLast = i === texts.length - 1;

    let { energy } = preset;
    let emotion = baseEmotion;
    let speed = baseSpeed;

    if (/!["')\]]*$/.test(trimmed)) energy += 0.12;
    // A question only colours the delivery when nothing stronger is already set.
    if (/\?["')\]]*$/.test(trimmed) && (emotion === 'neutral' || emotion === 'warm')) emotion = 'curious';

    // The opening line of the video sets the tone; the closing line lands a touch slower.
    if (ctx.isFirstScene && isFirst) energy += ctx.sceneType === 'title' ? 0.1 : 0.05;
    if (ctx.isLastScene && isLast) speed *= 0.97;

    const instruction = {
      emotion: overrides.emotion || emotion,
      energy: clamp(energy, 0, 1),
      speed: clamp(overrides.speed ?? speed, speedMin, speedMax),
      pitch: clamp(overrides.pitch ?? basePitch, -pitchLimit, pitchLimit),
      pauseBefore: overrides.pauseBefore ?? null,
      pauseAfter: overrides.pauseAfter ?? null,
      emphasis: extractEmphasis(text),
      delivery: preset.delivery,
      style,
      note: (ctx.note || '').trim().slice(0, 200),
    };

    return voiceInstructionSchema.parse(instruction);
  });
}

module.exports = { DIRECTOR_VERSION, direct, resolveStyle, emotionFromNote, extractEmphasis, buildInstruct };
