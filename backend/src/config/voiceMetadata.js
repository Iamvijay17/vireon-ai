// Hand-authored descriptors for the 9 fixed Qwen3-TTS custom-voice presets
// (see AudioService.QWEN_SPEAKERS) - these can't be derived from a filename
// the way clone-voice tags can (see AudioService.listCloneVoices), so they
// live here instead. Best-guess defaults - cosmetic only (voice library
// browse/filter), not correctness-critical, so safe to tune by ear later
// without touching any calling code.
module.exports = Object.freeze({
  'custom:Ryan': { gender: 'male', accent: 'american', tags: ['warm', 'conversational', 'narrator'] },
  'custom:Aiden': { gender: 'male', accent: 'american', tags: ['energetic', 'youthful', 'upbeat'] },
  'custom:Eric': { gender: 'male', accent: 'neutral', tags: ['calm', 'professional', 'clear'] },
  'custom:Dylan': { gender: 'male', accent: 'british', tags: ['smooth', 'storyteller', 'polished'] },
  'custom:Uncle_fu': { gender: 'male', accent: 'neutral', tags: ['deep', 'mature', 'wise'] },
  'custom:Serena': { gender: 'female', accent: 'american', tags: ['warm', 'friendly', 'conversational'] },
  'custom:Vivian': { gender: 'female', accent: 'american', tags: ['professional', 'clear', 'confident'] },
  'custom:Sohee': { gender: 'female', accent: 'neutral', tags: ['soft', 'gentle', 'calm'] },
  'custom:Ono_anna': { gender: 'female', accent: 'neutral', tags: ['playful', 'expressive', 'youthful'] },
});
