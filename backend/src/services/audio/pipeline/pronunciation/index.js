const dictionary = require('./dictionary.json');
const config = require('../../../../config');

/**
 * Pronunciation engine: rewrites narration into `spokenText` for the TTS
 * model while leaving `originalText` untouched for captions, UI, subtitles,
 * search and metadata.
 *
 *   originalText: "React is used with Node.js."
 *   spokenText:   "React is used with Node JS."
 *
 * Besides the rewritten text it returns a `wordMap` tying every caption word
 * (tokenised exactly as CaptionRenderer does) to the spoken words it became.
 * Caption timing comes from aligning the *spoken* audio, so without this map
 * a rewrite that changes the word count ("MongoDB" -> "Mongo D B") would
 * push every later caption word out of sync.
 *
 * Pure and deterministic. Safe to call with enabled=false (identity result).
 */
const PRONUNCIATION_VERSION = dictionary.version;

const WORD_CHAR = '[A-Za-z0-9_]';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// ---------- dictionary matchers -------------------------------------------

function termsMatcher(terms, flags = 'g') {
  const keys = Object.keys(terms).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return null;
  return new RegExp(`(?<!${WORD_CHAR})(?:${keys.map(escapeRegex).join('|')})(?!${WORD_CHAR})`, flags);
}

const isAcronym = (term) => /^[A-Z]{2,6}$/.test(term);

const BASE_TERMS = dictionary.terms;
const BASE_MATCHER = termsMatcher(BASE_TERMS);
const ACRONYM_TERMS = Object.fromEntries(Object.entries(BASE_TERMS).filter(([term]) => isAcronym(term)));
// "APIs" / "GPUs": the acronym plus a plural s.
const ACRONYM_PLURAL_MATCHER = Object.keys(ACRONYM_TERMS).length
  ? new RegExp(`(?<!${WORD_CHAR})(${Object.keys(ACRONYM_TERMS).sort((a, b) => b.length - a.length).join('|')})s(?!${WORD_CHAR})`, 'g')
  : null;

// ---------- structural rules (URLs, numbers, symbols, identifiers) ---------

const CURRENCY = { $: 'dollars', '€': 'euros', '£': 'pounds', '₹': 'rupees' };
const MAGNITUDE = { k: 'thousand', K: 'thousand', M: 'million', B: 'billion' };

function spellUrl(raw) {
  // Sentence punctuation right after a URL belongs to the sentence, not the URL.
  const url = raw.replace(/[.,;:!?)]+$/, '');
  const trailing = raw.slice(url.length);
  const spoken = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .replace(/[.]/g, ' dot ')
    .replace(/\//g, ' slash ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ')
    .replace(/\?/g, ' question mark ')
    .replace(/=/g, ' equals ')
    .replace(/&/g, ' and ')
    .replace(/#/g, ' hash ')
    .replace(/\s+/g, ' ')
    .trim();
  return spoken + trailing;
}

const RULES = [
  { name: 'url', re: /\b(?:https?:\/\/|www\.)[^\s]+/gi, to: (m) => spellUrl(m[0]) },
  {
    name: 'email',
    re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g,
    to: (m) => m[0].replace('@', ' at ').replace(/\./g, ' dot '),
  },
  { name: 'backtick', re: /`/g, to: () => '' },
  {
    name: 'currency',
    re: /([$€£₹])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|K|M|B)\b)?/g,
    to: (m) => `${m[2].replace(/,/g, '')}${m[3] ? ` ${MAGNITUDE[m[3]]}` : ''} ${CURRENCY[m[1]]}`,
  },
  { name: 'percent', re: /(\d[\d,.]*)\s?%/g, to: (m) => `${m[1]} percent` },
  { name: 'version', re: /\bv(\d+(?:\.\d+)+)\b/g, to: (m) => `version ${m[1].replace(/\./g, ' point ')}` },
  { name: 'dotted-number', re: /\b\d+\.\d+\.\d+(?:\.\d+)*\b/g, to: (m) => m[0].replace(/\./g, ' point ') },
  { name: 'thousands', re: /\b\d{1,3}(?:,\d{3})+\b/g, to: (m) => m[0].replace(/,/g, '') },
  { name: 'range', re: /(?<![\d-])(\d+)\s?[-–]\s?(\d+)(?![\d-])/g, to: (m) => `${m[1]} to ${m[2]}` },
  { name: 'approx', re: /~\s?(?=\d)/g, to: () => 'about ' },
  { name: 'number-sign', re: /#(?=\d)/g, to: () => 'number ' },
  { name: 'arrow', re: /\s?(?:->|→)\s?/g, to: () => ' to ' },
  { name: 'fat-arrow', re: /\s?=>\s?/g, to: () => ' arrow ' },
  { name: 'ampersand', re: /\s&\s/g, to: () => ' and ' },
  { name: 'plus', re: /\s\+\s/g, to: () => ' plus ' },
  { name: 'equals', re: /\s=\s/g, to: () => ' equals ' },
  { name: 'slash', re: /(?<=[A-Za-z])\/(?=[A-Za-z])/g, to: () => ' slash ' },
  {
    name: 'snake-case',
    re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g,
    to: (m) => m[0].replace(/_/g, ' '),
  },
  {
    // useState -> "use State". Leading i/e + capital (iPhone, eBay) are brand
    // names, not identifiers, so they are left alone.
    name: 'camel-case',
    re: /\b(?![ie][A-Z])[a-z]{2,}(?:[A-Z][a-z0-9]+)+\b/g,
    to: (m) => m[0].replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
  },
];

// Lower number wins when two matches start at the same place.
const PRIORITY = { override: 0, url: 1, email: 1, dictionary: 2, rule: 3 };

// ---------- caption tokenisation (mirrors remotion CaptionRenderer) --------

const DASH_FUSED = /([a-zA-Z0-9])[—–]([a-zA-Z0-9])/g;

/**
 * Split text into caption words with their character ranges, the same way
 * CaptionRenderer does: whitespace split, plus a break after an em/en dash
 * glued between two alphanumerics ("craving—our" -> "craving—", "our").
 * Word text is the original slice (en dashes are not rewritten here).
 */
function captionTokens(text) {
  const source = String(text || '');
  const cuts = new Set();
  source.replace(DASH_FUSED, (_m, _a, _b, offset) => {
    cuts.add(offset + 2); // right after "a" + dash
    return _m;
  });

  const tokens = [];
  for (const m of source.matchAll(/\S+/g)) {
    let start = m.index;
    const end = m.index + m[0].length;
    for (let i = start + 1; i < end; i++) {
      if (cuts.has(i)) {
        tokens.push({ text: source.slice(start, i), start, end: i });
        start = i;
      }
    }
    tokens.push({ text: source.slice(start, end), start, end });
  }
  return tokens;
}

const spokenTokens = (text) => [...String(text).matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));

// ---------- core ----------------------------------------------------------

function collectMatches(text, extraTerms) {
  const found = [];

  if (extraTerms && Object.keys(extraTerms).length > 0) {
    const re = termsMatcher(extraTerms);
    for (const m of text.matchAll(re)) {
      found.push({ start: m.index, end: m.index + m[0].length, spoken: extraTerms[m[0]], type: 'override', priority: PRIORITY.override });
    }
  }

  if (BASE_MATCHER) {
    for (const m of text.matchAll(BASE_MATCHER)) {
      found.push({ start: m.index, end: m.index + m[0].length, spoken: BASE_TERMS[m[0]], type: 'dictionary', priority: PRIORITY.dictionary });
    }
  }

  if (ACRONYM_PLURAL_MATCHER) {
    for (const m of text.matchAll(ACRONYM_PLURAL_MATCHER)) {
      found.push({ start: m.index, end: m.index + m[0].length, spoken: `${BASE_TERMS[m[1]]}s`, type: 'dictionary', priority: PRIORITY.dictionary });
    }
  }

  for (const rule of RULES) {
    const priority = rule.name === 'url' || rule.name === 'email' ? PRIORITY.url : PRIORITY.rule;
    for (const m of text.matchAll(rule.re)) {
      const spoken = rule.to(m);
      if (spoken === m[0]) continue;
      found.push({ start: m.index, end: m.index + m[0].length, spoken, type: rule.name, priority });
    }
  }

  // Earliest start wins; at the same start, the higher-priority then longer match.
  found.sort((a, b) => a.start - b.start || a.priority - b.priority || (b.end - b.start) - (a.end - a.start));

  const accepted = [];
  let cursor = 0;
  for (const m of found) {
    if (m.start >= cursor) {
      accepted.push(m);
      cursor = m.end;
    }
  }
  return accepted;
}

/** Spoken char range covering original range [a, b), via the piece table. */
function spokenRangeFor(pieces, a, b) {
  let from = null;
  let to = null;
  for (const p of pieces) {
    if (p.oe <= a || p.os >= b) continue;
    if (p.identity) {
      const s = p.ss + (Math.max(a, p.os) - p.os);
      const e = p.ss + (Math.min(b, p.oe) - p.os);
      from = from === null ? s : Math.min(from, s);
      to = to === null ? e : Math.max(to, e);
    } else {
      from = from === null ? p.ss : Math.min(from, p.ss);
      to = to === null ? p.se : Math.max(to, p.se);
    }
  }
  return from === null ? null : { start: from, end: to };
}

/**
 * @param {string} originalText
 * @param {{ enabled?: boolean, extraTerms?: Record<string,string> }} [opts]
 * @returns {{
 *   originalText: string, spokenText: string, version: number, changed: boolean,
 *   rewrites: {from: string, to: string, type: string}[],
 *   wordMap: {index: number, text: string, spokenStart: number|null, spokenEnd: number|null}[],
 *   spokenWordCount: number
 * }}
 */
function processText(originalText, { enabled = config.audio.pronunciation.enabled, extraTerms } = {}) {
  const original = String(originalText ?? '');
  const matches = enabled ? collectMatches(original, extraTerms) : [];

  let spoken = '';
  let o = 0;
  const pieces = [];
  for (const m of matches) {
    if (m.start > o) {
      pieces.push({ os: o, oe: m.start, ss: spoken.length, se: spoken.length + (m.start - o), identity: true });
      spoken += original.slice(o, m.start);
    }
    pieces.push({ os: m.start, oe: m.end, ss: spoken.length, se: spoken.length + m.spoken.length, identity: false });
    spoken += m.spoken;
    o = m.end;
  }
  if (o < original.length) {
    pieces.push({ os: o, oe: original.length, ss: spoken.length, se: spoken.length + (original.length - o), identity: true });
    spoken += original.slice(o);
  }

  const sTokens = spokenTokens(spoken);
  const wordMap = captionTokens(original).map((tok, index) => {
    const range = spokenRangeFor(pieces, tok.start, tok.end);
    let spokenStart = null;
    let spokenEnd = null;
    if (range) {
      sTokens.forEach((st, i) => {
        if (st.start < range.end && st.end > range.start) {
          if (spokenStart === null) spokenStart = i;
          spokenEnd = i;
        }
      });
    }
    return { index, text: tok.text, spokenStart, spokenEnd };
  });

  return {
    originalText: original,
    spokenText: spoken,
    version: PRONUNCIATION_VERSION,
    changed: spoken !== original,
    rewrites: matches.map((m) => ({ from: original.slice(m.start, m.end), to: m.spoken, type: m.type })),
    wordMap,
    spokenWordCount: sTokens.length,
  };
}

module.exports = { PRONUNCIATION_VERSION, processText, captionTokens, spokenTokens };
