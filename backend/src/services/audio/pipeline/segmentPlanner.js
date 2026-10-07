const config = require('../../../config');
const { resolveVoice, DEFAULT_SPEAKER } = require('../audioService/voiceCatalog');
const { segmentText } = require('./segmenter');
const { processText, spokenTokens, PRONUNCIATION_VERSION } = require('./pronunciation');
const { direct, resolveStyle, buildInstruct, DIRECTOR_VERSION } = require('./voiceDirector');
const { computePauses } = require('./pauseEngine');
const { resolveVoiceFor } = require('./voiceProfiles');
const { rawCacheKey, processedCacheKey, seedForSegment } = require('./cacheKeys');
const { segmentSchema } = require('./schemas');

/**
 * Turns one scene's narration into a plan: a list of fully specified
 * segments (what to say, how to say it, in whose voice, with which pauses,
 * under which cache keys) *before* any GPU work happens. Planning is cheap,
 * deterministic and side-effect free (apart from resolving the voice on
 * disk), which is what lets cache hits be predicted and a single failed
 * segment be re-run on its own.
 *
 *   text -> segmenter -> pronunciation -> voice director -> pause engine
 *        -> voice/profile -> instruct + seed -> raw/processed cache keys
 */

const pad = (n, width = 3) => String(n).padStart(width, '0');

/** Stable per scene + position, so a retry addresses the same segment id. */
const segmentId = (sceneNumber, index) => `s${pad(sceneNumber ?? 0, 2)}-seg${pad(index + 1)}`;

/** Role used for the instruct opening of podcast dialogue lines. */
const roleOf = (speaker) => (speaker === 'host' || speaker === 'guest' ? speaker : 'narrator');

/**
 * @param {object} o
 * @param {string} o.text                      the scene narration (original wording)
 * @param {number|null} [o.sceneNumber]
 * @param {string} [o.speaker]                 'narrator' | 'host' | 'guest' | any speaker name
 * @param {string} [o.voice]                   voice string (custom:/clone:/design:/legacy key)
 * @param {string} [o.voiceProfile]            profile id
 * @param {Record<string,string>} [o.speakers] speaker -> profile id / voice string
 * @param {string} [o.videoType]
 * @param {string} [o.style]
 * @param {string} [o.emotionNote]             the script LLM's free-text delivery note
 * @param {string} [o.sceneType]
 * @param {boolean} [o.isFirstScene]
 * @param {boolean} [o.isLastScene]
 * @param {string} [o.language]
 * @param {object} [o.overrides]               forced emotion/speed/pitch/pause values
 * @param {Record<string,string>} [o.pronunciations] extra respellings for this request
 * @param {boolean} [o.fastMode]
 * @returns {Promise<{ segments: object[], style: string, voice: string, version: {director:number,pronunciation:number} }>}
 */
async function planScene(o) {
  const {
    text, sceneNumber = null, speaker = 'narrator', voice, voiceProfile, speakers, videoType, style,
    emotionNote = '', sceneType, isFirstScene = false, isLastScene = false, language, overrides, pronunciations, fastMode = false,
  } = o;

  const pieces = segmentText(text);
  if (pieces.length === 0) return { segments: [], style: resolveStyle({ style, videoType }), voice: voice || '', version: { director: DIRECTOR_VERSION, pronunciation: PRONUNCIATION_VERSION } };

  const picked = resolveVoiceFor({ speaker, speakers, voiceProfile, voice });
  // Same fallback as the legacy path: no/unknown voice means the default preset.
  const who = { ...picked, voice: picked.voice || `custom:${DEFAULT_SPEAKER}` };
  const resolved = await resolveVoice(who.voice);
  const resolvedLanguage = language || who.profile?.language || 'auto';

  const spoken = pieces.map((p) => processText(p.text, { extraTerms: pronunciations }));

  const instructions = direct(
    pieces.map((p) => p.text),
    { style, profile: who.profile, videoType, note: emotionNote, sceneType, isFirstScene, isLastScene, overrides }
  );
  const sceneStyle = instructions[0].style;

  const pauses = computePauses(
    pieces.map((p, i) => ({ text: p.text, paragraphBreakBefore: p.paragraphBreakBefore, instruction: instructions[i] })),
    { style: sceneStyle, isLastScene }
  );

  const modelSize = fastMode ? config.tts.fastModelSize : config.tts.modelSize;

  const segments = pieces.map((piece, i) => {
    const instruction = instructions[i];
    const instruct = buildInstruct(instruction, { role: roleOf(speaker) });
    const seed = seedForSegment(who.voice, spoken[i].spokenText);
    const rawKey = rawCacheKey({ spokenText: spoken[i].spokenText, resolved, instruct, seed, modelSize, language: resolvedLanguage });
    const processedKey = processedCacheKey({ rawKey, speed: instruction.speed, pitch: instruction.pitch });

    const base = segmentSchema.parse({
      id: segmentId(sceneNumber, i),
      index: i,
      sceneNumber,
      speaker,
      voiceProfile: who.profile?.id ?? null,
      voice: who.voice,
      language: resolvedLanguage,
      sourceText: piece.text,
      spokenText: spoken[i].spokenText,
      instruction,
      pauseBeforeMs: pauses[i].pauseBeforeMs,
      pauseAfterMs: pauses[i].pauseAfterMs,
      rawCacheKey: rawKey,
      processedCacheKey: processedKey,
    });

    // Work-only fields: needed to run and align the segment, never persisted.
    return {
      ...base,
      internal: { resolved, instruct, seed, modelSize, fastMode, wordMap: spoken[i].wordMap, spokenTokens: spokenTokens(spoken[i].spokenText) },
    };
  });

  return {
    segments,
    style: sceneStyle,
    voice: who.voice,
    version: { director: DIRECTOR_VERSION, pronunciation: PRONUNCIATION_VERSION },
  };
}

/** The persistable view of a planned/executed segment (no work-only fields). */
function toPersisted(segment) {
  const { internal, ...persisted } = segment;
  void internal;
  return persisted;
}

module.exports = { planScene, toPersisted, segmentId };
