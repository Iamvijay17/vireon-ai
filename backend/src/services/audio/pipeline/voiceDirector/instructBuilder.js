const { STYLE_PRESETS, EMOTION_PHRASES } = require('./styles');

/**
 * Turns a structured VoiceInstruction into the single `instruct` sentence
 * Qwen3-TTS understands (the only delivery control it exposes - there are no
 * speed/pitch/emotion parameters). Pure and deterministic: the same
 * instruction always yields the same string, which is what keeps the TTS
 * cache key stable.
 *
 * Speed and pitch are intentionally NOT described here - they are applied as
 * real audio processing (audioProcessor.js), so telling the model to "speak
 * slowly" as well would double-apply them.
 */
const TAIL = 'Vary pitch and pacing naturally and avoid a flat monotone reading.';

function opening({ role, speakerName }, phrase) {
  if (role === 'host') return `Speak like a podcast host in a live conversation with a guest: ${phrase}.`;
  if (role === 'guest') return `Speak like a podcast guest responding to the host in a live conversation: ${phrase}.`;
  if (speakerName) return `Speak like ${speakerName} in a live, natural conversation: ${phrase}.`;
  return `Speak naturally like a human narrator: ${phrase}.`;
}

function energyClause(energy) {
  if (energy <= 0.3) return 'Keep the energy low and quiet.';
  if (energy >= 0.8) return 'Keep the energy high.';
  return '';
}

/**
 * @param {object} instruction a parsed voiceInstructionSchema value
 * @param {{ role?: 'narrator'|'host'|'guest', speakerName?: string }} [who]
 * @returns {string}
 */
function buildInstruct(instruction, who = {}) {
  const preset = STYLE_PRESETS[instruction.style] || STYLE_PRESETS.professional;

  let phrase = preset.phrase;
  if (instruction.emotion !== preset.emotion) {
    const emotionPhrase = EMOTION_PHRASES[instruction.emotion];
    if (emotionPhrase) phrase = `${phrase}, ${emotionPhrase}`;
  }

  const parts = [opening(who, phrase)];

  const energy = energyClause(instruction.energy);
  if (energy) parts.push(energy);

  if (instruction.emphasis.length > 0) {
    parts.push(`Lightly stress: ${instruction.emphasis.map((w) => `"${w}"`).join(', ')}.`);
  }

  if (instruction.note) {
    parts.push(`Delivery note: ${instruction.note.replace(/[.\s]+$/, '')}.`);
  }

  parts.push(TAIL);
  return parts.join(' ');
}

module.exports = { buildInstruct };
