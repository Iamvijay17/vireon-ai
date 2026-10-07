const config = require('../../../config');

/**
 * Splits narration into TTS-sized segments.
 *
 * Qwen3-TTS reads whole sentences best and every Gradio round trip has
 * fixed overhead, so this is deliberately NOT one-request-per-sentence:
 * sentences are packed greedily up to `maxChars`, which leaves most scenes as
 * a single segment and long lessons as a handful. Boundaries always fall on
 * sentence ends (or, for a sentence longer than the limit, on clause breaks,
 * then word breaks) and never inside a paragraph break.
 *
 * Pure: text in, segments out. Segment text is a verbatim slice of the input
 * (whitespace-normalised) - the pronunciation engine runs on each segment
 * afterwards, so `text` here is always the original wording.
 */

const SENTENCE_BREAK = /(?<=[.!?…]["')\]]*)\s+/;
const CLAUSE_BREAK = /(?<=[;:—–,])\s+/;
// Sentence-ending periods that are not sentence ends. "etc." / "vs." are left
// out on purpose: they usually do end a sentence.
const ABBREVIATION_END = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|inc|ltd|st|fig|approx|e\.g|i\.e)\.|\b[A-Z]\.)$/i;

function splitSentences(paragraph) {
  const pieces = paragraph.split(SENTENCE_BREAK).filter(Boolean);
  const sentences = [];
  for (const piece of pieces) {
    const prev = sentences[sentences.length - 1];
    // A false split: the previous piece ended in an abbreviation/initial, or
    // this one starts lowercase (so it continues the sentence).
    if (prev && (ABBREVIATION_END.test(prev) || /^[a-z]/.test(piece))) {
      sentences[sentences.length - 1] = `${prev} ${piece}`;
    } else {
      sentences.push(piece);
    }
  }
  return sentences;
}

/** Break one over-long sentence into <= maxChars pieces: clauses first, then words. */
function splitLongSentence(sentence, maxChars) {
  const clauses = sentence.split(CLAUSE_BREAK).filter(Boolean);
  const out = [];
  let current = '';

  const pushHard = (clause) => {
    let rest = clause;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(' ', maxChars);
      if (cut < maxChars * 0.4) cut = maxChars; // no usable space - hard cut
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    return rest;
  };

  for (const clause of clauses) {
    const candidate = current ? `${current} ${clause}` : clause;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    current = clause.length > maxChars ? pushHard(clause) : clause;
  }
  if (current) out.push(current);
  return out;
}

function packParagraph(paragraph, maxChars) {
  const units = splitSentences(paragraph).flatMap((s) => (s.length > maxChars ? splitLongSentence(s, maxChars) : [s]));
  const packed = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (candidate.length > maxChars && current) {
      packed.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) packed.push(current);
  return packed;
}

/** Fold undersized pieces into a neighbour so no clip is a clipped fragment. */
function mergeShort(pieces, minChars, maxChars) {
  const out = [];
  for (const piece of pieces) {
    const prev = out[out.length - 1];
    if (prev && (piece.length < minChars || prev.length < minChars) && prev.length + 1 + piece.length <= maxChars * 1.25) {
      out[out.length - 1] = `${prev} ${piece}`;
    } else {
      out.push(piece);
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {{ maxChars?: number, minChars?: number }} [opts]
 * @returns {{ text: string, paragraphBreakBefore: boolean }[]}
 */
function segmentText(text, { maxChars = config.audio.segmentMaxChars, minChars = config.audio.segmentMinChars } = {}) {
  const paragraphs = String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const segments = [];
  paragraphs.forEach((paragraph, p) => {
    const pieces = mergeShort(packParagraph(paragraph, maxChars), minChars, maxChars);
    pieces.forEach((piece, i) => {
      segments.push({ text: piece, paragraphBreakBefore: p > 0 && i === 0 });
    });
  });
  return segments;
}

module.exports = { segmentText, splitSentences };
