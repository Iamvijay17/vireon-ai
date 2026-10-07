const fs = require('fs');
const path = require('path');
const LoggerService = require('../../../common/LoggerService');
const { voiceProfileSchema } = require('../schemas');

/**
 * Voice profiles: named, reusable bundles of voice + default delivery
 * (the "Professional / Educational / Energetic / Documentary / Custom"
 * choices). A profile points at a voice string AudioService.resolveVoice
 * already understands, so every existing voice ("custom:Ryan", "clone:x.wav",
 * "design:...", legacy "female-1") keeps working unchanged - a bare voice
 * string is simply treated as an anonymous profile.
 *
 * Profiles come from profiles.json (built-in) plus an optional operator file
 * (VOICE_PROFILES_FILE, same shape) for custom profiles. Invalid entries are
 * logged and skipped; they never stop the server.
 *
 * Multi-speaker: a speaker map ({ teacher: 'professional-narrator',
 * student: 'energetic-presenter' }) resolves each segment's `speaker` to its
 * own profile, so dialogue is a data change rather than a code change.
 */
const BUILT_IN = require('./profiles.json');

let cache = null;

function loadFile(entries, source) {
  const out = [];
  for (const entry of entries) {
    const parsed = voiceProfileSchema.safeParse(entry);
    if (parsed.success) out.push({ ...parsed.data, source });
    else LoggerService.warn('Skipping invalid voice profile', { id: entry?.id, source, issues: parsed.error.issues.map((i) => i.message) });
  }
  return out;
}

function load() {
  if (cache) return cache;
  const profiles = new Map(loadFile(BUILT_IN, 'built-in').map((p) => [p.id, p]));

  const extra = process.env.VOICE_PROFILES_FILE;
  if (extra) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.resolve(extra), 'utf8'));
      for (const p of loadFile(Array.isArray(raw) ? raw : [], 'custom')) profiles.set(p.id, p);
    } catch (err) {
      LoggerService.warn('Could not read VOICE_PROFILES_FILE', { file: extra, error: err.message });
    }
  }
  cache = profiles;
  return cache;
}

const listProfiles = () => [...load().values()];
const getProfile = (id) => (id ? load().get(id) || null : null);

/**
 * Pick the voice and delivery defaults for one segment.
 *
 * @param {{ speaker?: string, speakers?: Record<string,string>, voiceProfile?: string, voice?: string }} opts
 *   `speakers` maps a speaker name to a profile id or a raw voice string.
 * @returns {{ profile: object|null, voice: string, speaker: string }}
 */
function resolveVoiceFor({ speaker = 'narrator', speakers = {}, voiceProfile, voice } = {}) {
  const mapped = speakers[speaker];
  const profile = getProfile(mapped) || getProfile(voiceProfile);

  if (profile) return { profile, voice: profile.voice, speaker };
  // A speaker mapped straight to a voice string, or the caller's own voice.
  return { profile: null, voice: mapped || voice || '', speaker };
}

/** Test hook. */
function _reset() {
  cache = null;
}

module.exports = { listProfiles, getProfile, resolveVoiceFor, _reset };
