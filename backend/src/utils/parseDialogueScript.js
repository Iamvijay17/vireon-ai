// Parses a plain-text multi-speaker script into ordered turns, e.g.:
//   Host: Welcome to the show!
//   Guest (nervous, half-laughing): Thanks for having me.
//   Host: So tell us about your work.
// The optional "(...)" after a name is a free-text delivery/emotion note
// passed to the TTS model as its instruct prompt for that turn (see
// AudioService._instructFor's `scene.audio.emotion` for the same idea in
// the video pipeline). A line with no "Name:" prefix is treated as a
// continuation of the previous turn (so speakers can write multi-line/
// multi-paragraph turns) and keeps that turn's emotion. Speaker matching
// against the provided roster is case-insensitive.
const LINE_PATTERN = /^([A-Za-z][A-Za-z0-9 _-]{0,39})\s*(?:\(([^)]{1,200})\))?:\s*(.+)$/;

function parseDialogueScript(script, speakers) {
  const rosterByLower = new Map(speakers.map((s) => [s.name.toLowerCase(), s]));
  const lines = script.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const turns = [];
  const unknownSpeakers = new Set();

  for (const line of lines) {
    const match = line.match(LINE_PATTERN);
    const label = match ? match[1].trim() : null;
    const roster = label ? rosterByLower.get(label.toLowerCase()) : null;

    if (match && roster) {
      turns.push({
        speaker: roster.name,
        voice: roster.voice,
        text: match[3].trim(),
        emotion: match[2] ? match[2].trim() : "",
      });
    } else if (match && !roster) {
      // Looks like "Name:" but doesn't match the roster - flag it rather
      // than silently swallowing what was probably meant as a speaker cue.
      unknownSpeakers.add(label);
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${line}`;
    }
    // A leading continuation line with no prior turn is dropped - there's
    // no speaker to attribute it to.
  }

  return {
    turns: turns.filter((t) => t.text.trim().length > 0),
    unknownSpeakers: Array.from(unknownSpeakers),
  };
}

module.exports = { parseDialogueScript };
