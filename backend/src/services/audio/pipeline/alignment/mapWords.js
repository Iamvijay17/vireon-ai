/**
 * Maps aligner output (words as *heard* in the spoken audio) back onto the
 * caption's original words.
 *
 * Two things make this necessary:
 *  - the pronunciation engine feeds TTS respelled text ("Mongo D B"), so the
 *    aligner hears more words than the caption shows;
 *  - ASR word boundaries never match ours perfectly (numbers, hyphens,
 *    contractions), which used to push every later caption word out of step.
 *
 * Method: a Needleman-Wunsch alignment between the aligner's words and the
 * spoken-text tokens, then each caption word takes the span of the spoken
 * tokens it became. Tokens the aligner never heard get times interpolated
 * between their neighbours and are flagged `estimated: true`; if too little
 * of the audio matched, no timings are returned at all (null) so captions
 * use their estimated-pace fallback instead of a confidently wrong timeline.
 */

const MIN_MATCH_RATIO = 0.5;

const normalize = (w) => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Match quality of an aligner word vs a spoken token: 2 exact, 1 close, -2 different. */
function similarity(heard, expected) {
  const a = normalize(heard);
  const b = normalize(expected);
  if (!a || !b) return -2;
  if (a === b) return 2;
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 3 && (a.startsWith(b) || b.startsWith(a))) return 1;
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.7 ? 1 : -2;
}

const GAP = -1;

/** Returns, for each spoken token, the index of the aligner word it matched (or -1). */
function alignSequences(heard, tokens) {
  const n = heard.length;
  const m = tokens.length;
  const score = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); // 1 diag, 2 up (skip heard), 3 left (skip token)

  for (let i = 1; i <= n; i++) { score[i][0] = i * GAP; back[i][0] = 2; }
  for (let j = 1; j <= m; j++) { score[0][j] = j * GAP; back[0][j] = 3; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = score[i - 1][j - 1] + similarity(heard[i - 1].word, tokens[j - 1].text);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      if (diag >= up && diag >= left) { score[i][j] = diag; back[i][j] = 1; }
      else if (up >= left) { score[i][j] = up; back[i][j] = 2; }
      else { score[i][j] = left; back[i][j] = 3; }
    }
  }

  const matchOfToken = new Array(m).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (step === 1) {
      if (similarity(heard[i - 1].word, tokens[j - 1].text) > 0) matchOfToken[j - 1] = i - 1;
      i--; j--;
    } else if (step === 2) i--;
    else j--;
  }
  return matchOfToken;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Fill unmatched tokens with times spread evenly between their matched neighbours. */
function tokenTimes(heard, tokens, matchOfToken) {
  const times = tokens.map((_, k) => {
    const idx = matchOfToken[k];
    return idx >= 0
      ? { start: heard[idx].start, end: heard[idx].end, probability: heard[idx].probability ?? null, estimated: false }
      : null;
  });

  const firstStart = heard[0].start;
  const lastEnd = heard[heard.length - 1].end;

  let k = 0;
  while (k < times.length) {
    if (times[k]) { k++; continue; }
    let runEnd = k;
    while (runEnd < times.length && !times[runEnd]) runEnd++;
    const from = k > 0 ? times[k - 1].end : firstStart;
    const to = runEnd < times.length ? times[runEnd].start : lastEnd;
    const span = Math.max(to - from, 0);
    const count = runEnd - k;
    for (let r = 0; r < count; r++) {
      times[k + r] = {
        start: from + (span * r) / count,
        end: from + (span * (r + 1)) / count,
        probability: null,
        estimated: true,
      };
    }
    k = runEnd;
  }
  return times;
}

/**
 * @param {{word: string, start: number, end: number, probability?: number}[]} heard aligner output (seconds)
 * @param {{text: string}[]} tokens spoken-text tokens (whitespace split of spokenText)
 * @param {{index: number, text: string, spokenStart: number|null, spokenEnd: number|null}[]} wordMap from pronunciation.processText
 * @returns {{ words: {word: string, start: number, end: number, confidence: number|null, estimated: boolean}[], matchedRatio: number } | null}
 */
function mapToOriginalWords(heard, tokens, wordMap) {
  const usable = (heard || []).filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end));
  if (usable.length === 0 || tokens.length === 0 || wordMap.length === 0) return null;

  const matchOfToken = alignSequences(usable, tokens);
  const matched = matchOfToken.filter((x) => x >= 0).length;
  const matchedRatio = matched / tokens.length;
  if (matchedRatio < MIN_MATCH_RATIO) return null;

  const times = tokenTimes(usable, tokens, matchOfToken);

  const words = wordMap.map((entry) => {
    if (entry.spokenStart === null) return { word: entry.text, start: null, end: null, confidence: null, estimated: true };
    const span = times.slice(entry.spokenStart, entry.spokenEnd + 1);
    const probs = span.map((t) => t.probability).filter((p) => p !== null);
    return {
      word: entry.text,
      start: span[0].start,
      end: span[span.length - 1].end,
      confidence: probs.length ? round3(probs.reduce((a, b) => a + b, 0) / probs.length) : null,
      estimated: span.every((t) => t.estimated),
    };
  });

  // Several caption words sharing one spoken span (a multi-word rewrite):
  // split that span's time between them by length.
  for (let a = 0; a < wordMap.length; ) {
    const { spokenStart, spokenEnd } = wordMap[a];
    let b = a + 1;
    while (spokenStart !== null && b < wordMap.length && wordMap[b].spokenStart === spokenStart && wordMap[b].spokenEnd === spokenEnd) b++;
    if (b - a > 1) {
      const total = words.slice(a, b).reduce((sum, w) => sum + Math.max(w.word.length, 1), 0);
      const start = words[a].start;
      const span = words[a].end - start;
      let acc = 0;
      for (let k = a; k < b; k++) {
        const share = Math.max(words[k].word.length, 1) / total;
        words[k].start = start + span * acc;
        acc += share;
        words[k].end = start + span * acc;
      }
    }
    a = b;
  }

  // Words with no spoken counterpart sit at their predecessor's end.
  let cursor = words.find((w) => w.start !== null)?.start ?? 0;
  for (const w of words) {
    if (w.start === null) { w.start = cursor; w.end = cursor; }
    if (w.start < cursor) w.start = cursor;
    if (w.end < w.start) w.end = w.start;
    cursor = w.end;
    w.start = round3(w.start);
    w.end = round3(w.end);
  }

  return { words, matchedRatio: round3(matchedRatio) };
}

module.exports = { mapToOriginalWords, similarity, normalize, MIN_MATCH_RATIO };
