const config = require('../../../config');
const { STYLE_PRESETS } = require('./voiceDirector/styles');

/**
 * Decides how much silence goes around each segment. Defaults come from
 * punctuation and structure; the Voice Director can override any single value
 * (instruction.pauseBefore / pauseAfter, non-null), and everything is clamped
 * to config.audio.pauses so a stray override can never create dead air.
 *
 *   comma / clause break  -> short       sentence end -> normal
 *   ellipsis              -> long-ish    paragraph    -> longer
 *   scene end             -> transition  important statement -> dramatic lead-in
 *
 * The assembler places max(pauseAfter[i], pauseBefore[i+1]) between two
 * segments (collapsing margins instead of adding them), so the two values
 * never stack into a long silence.
 */

const IMPORTANT_OPENERS = /^\s*(?:remember|important|note that|key point|here'?s (?:the )?(?:key|thing|secret|catch|truth)|but here'?s|the (?:secret|truth|catch|key) is|never|always|imagine|picture this|ready\?)\b/i;

const wordCount = (s) => (String(s).match(/\S+/g) || []).length;

/** True for lines that deserve a beat of silence before them. */
function isImportantStatement(text, previousText = '') {
  if (IMPORTANT_OPENERS.test(text)) return true;
  // A short, punchy line landing after a long one ("...for hours. It failed.").
  return wordCount(text) <= 5 && /[.!]["')\]]*\s*$/.test(text) && String(previousText).length >= 100;
}

/** Pause implied by how a segment ends, before style scaling. */
function pauseForEnding(text, pauses) {
  const t = String(text).trim();
  if (/…\s*["')\]]*$|\.{3}\s*["')\]]*$/.test(t)) return Math.round(pauses.sentence * 1.4);
  if (/[.!?]["')\]]*$/.test(t)) return pauses.sentence;
  return pauses.comma;
}

const clamp = (n, pauses) => Math.round(Math.min(pauses.max, Math.max(pauses.min, n)));

/**
 * @param {{ text: string, paragraphBreakBefore?: boolean, instruction?: object }[]} segments one scene's segments, in order
 * @param {{ style?: string, isLastScene?: boolean, pauses?: object }} [opts]
 * @returns {{ pauseBeforeMs: number, pauseAfterMs: number }[]}
 */
function computePauses(segments, { style = 'professional', isLastScene = false, pauses = config.audio.pauses } = {}) {
  const scale = (STYLE_PRESETS[style] || STYLE_PRESETS.professional).pauseScale;

  return segments.map((seg, i) => {
    const next = segments[i + 1];
    const isLast = i === segments.length - 1;
    const instr = seg.instruction || {};

    let after;
    if (instr.pauseAfter !== null && instr.pauseAfter !== undefined) {
      after = instr.pauseAfter;
    } else if (isLast) {
      // Scene end: a transition breath, but the very last scene just ends.
      after = isLastScene ? pauses.comma * scale : pauses.sceneTransition * scale;
    } else {
      after = pauseForEnding(seg.text, pauses) * scale;
      if (next?.paragraphBreakBefore) after = Math.max(after, pauses.paragraph * scale);
    }

    let before;
    if (instr.pauseBefore !== null && instr.pauseBefore !== undefined) {
      before = instr.pauseBefore;
    } else if (i > 0 && isImportantStatement(seg.text, segments[i - 1].text)) {
      before = pauses.sentence * 1.6 * scale;
    } else {
      before = 0;
    }

    return { pauseBeforeMs: clamp(before, pauses), pauseAfterMs: clamp(after, pauses) };
  });
}

module.exports = { computePauses, isImportantStatement, pauseForEnding };
