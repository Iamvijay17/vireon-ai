import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpeechEvents,
  findPhrase,
  getActiveWords,
  getCaptionGroupAt,
  getCurrentWordIndex,
  getEventsInRange,
  getItemProgress,
  getNextPause,
  getNextPhrase,
  getPauseAtTime,
  getPhraseAtTime,
  getPreviousPhrase,
  getSegmentAtTime,
  getSpeechBounds,
  getSpeechProgress,
  getWordAtTime,
  getWordsInRange,
  groupCaptionWords,
  isSpeaking,
  normalizeSpeechTimeline,
  resolveTarget,
} from '../timeline';
import { applySpeechTimingToPlan, resolveSpeechTrigger, triggerFrame } from '../speechTiming';
import { buildCaptionModel, matchRatio, resolveCaptionState } from '../captionSync';
import { ease, phraseTransitionState, popState, pulseEnvelope, revealProgress, scaleFromEnvelope } from '../speechMath';

// ---------------------------------------------------------------------------
// Fixture: two segments with a real 0.6s gap between them and a 0.5s gap
// inside the second. Shaped exactly like the backend's canonical timeline.
//
//   seg 1  "Artificial intelligence is changing the world."   0.00 - 2.40
//   gap                                                         2.40 - 3.00 (pause)
//   seg 2  "It starts now, truly."                             3.00 - 5.00
//                                                   (pause inside)  3.90 - 4.40
// ---------------------------------------------------------------------------

const W = (segmentId, index, captionIndex, text, start, end, extra = {}) => ({
  wordId: `${segmentId}-w${String(index + 1).padStart(3, '0')}`,
  segmentId, index, captionIndex, text, start, end, duration: +(end - start).toFixed(3), confidence: 0.95, emphasis: false, ...extra,
});

const makeTimeline = () => {
  const words = [
    W('s1', 0, 0, 'Artificial', 0.0, 0.52, { emphasis: true }),
    W('s1', 1, 1, 'intelligence', 0.53, 1.1, { emphasis: true }),
    W('s1', 2, 2, 'is', 1.12, 1.25),
    W('s1', 3, 3, 'changing', 1.27, 1.8),
    W('s1', 4, 4, 'the', 1.82, 1.92),
    W('s1', 5, 5, 'world.', 1.94, 2.4),
    W('s2', 0, 6, 'It', 3.0, 3.12),
    W('s2', 1, 7, 'starts', 3.14, 3.55),
    W('s2', 2, 8, 'now,', 3.58, 3.9),
    W('s2', 3, 9, 'truly.', 4.4, 4.9),
  ];
  const phrase = (id, segmentId, text, first, last, extra = {}) => ({
    phraseId: id, segmentId, text, start: words[first].start, end: words[last].end,
    duration: +(words[last].end - words[first].start).toFixed(3),
    firstWordId: words[first].wordId, lastWordId: words[last].wordId, wordCount: last - first + 1,
    emphasis: false, importance: 'normal', ...extra,
  });
  return {
    version: 1,
    alignmentStatus: 'complete',
    granularity: 'word',
    duration: 5.0,
    segments: [
      { segmentId: 's1', index: 0, text: 'Artificial intelligence is changing the world.', wordCount: 6, start: 0, end: 2.4, duration: 2.4, granularity: 'word', alignmentStatus: 'complete' },
      { segmentId: 's2', index: 1, text: 'It starts now, truly.', wordCount: 4, start: 3.0, end: 5.0, duration: 2.0, granularity: 'word', alignmentStatus: 'complete' },
    ],
    words,
    phrases: [
      phrase('s1-p01', 's1', 'Artificial intelligence', 0, 1, { emphasis: true, importance: 'high' }),
      phrase('s1-p02', 's1', 'is changing the world.', 2, 5),
      phrase('s2-p01', 's2', 'It starts now,', 6, 8),
      phrase('s2-p02', 's2', 'truly.', 9, 9),
    ],
    pauses: [
      { pauseId: 'pause-001', start: 2.4, end: 3.0, duration: 0.6, kind: 'segment', afterId: 's1', beforeId: 's2' },
      { pauseId: 'pause-002', start: 3.9, end: 4.4, duration: 0.5, kind: 'word', afterId: words[8].wordId, beforeId: words[9].wordId },
    ],
  };
};

const CAPTION_WORDS = 'Artificial intelligence is changing the world. It starts now, truly.'.split(' ');

// ---------------------------------------------------------------------------
// Timing queries
// ---------------------------------------------------------------------------

test('speech timeline: the active word follows the voice and is null in gaps', () => {
  const tl = makeTimeline();
  assert.equal(getWordAtTime(tl, 0.2).text, 'Artificial');
  assert.equal(getWordAtTime(tl, 0.51).text, 'Artificial');
  assert.equal(getWordAtTime(tl, 0.525), null);
  assert.equal(getWordAtTime(tl, 0.53).text, 'intelligence');
  // End is exclusive: at exactly the end the next word (if any) owns the instant.
  assert.equal(getWordAtTime(tl, 1.1), null);
  assert.equal(getWordAtTime(tl, 2.7), null);
  assert.equal(getWordAtTime(tl, 99), null);
});

test('speech timeline: getActiveWords / getCurrentWordIndex / getWordsInRange', () => {
  const tl = makeTimeline();
  assert.deepEqual(getActiveWords(tl, 1.3).map((w) => w.text), ['changing']);
  assert.deepEqual(getActiveWords(tl, 2.6), []);
  assert.equal(getCurrentWordIndex(tl, -1), -1);
  assert.equal(getCurrentWordIndex(tl, 0), 0);
  assert.equal(getCurrentWordIndex(tl, 2.7), 5, 'holds the last spoken word through a pause');
  assert.deepEqual(getWordsInRange(tl, 1.0, 1.3).map((w) => w.text), ['intelligence', 'is', 'changing']);
  assert.deepEqual(getWordsInRange(tl, 2.5, 2.9), []);
  assert.deepEqual(getWordsInRange(tl, 3, 3), [], 'empty range');
});

test('speech timeline: phrases, segments, next / previous', () => {
  const tl = makeTimeline();
  assert.equal(getPhraseAtTime(tl, 0.8).text, 'Artificial intelligence');
  assert.equal(getPhraseAtTime(tl, 2.6), null);
  assert.equal(getSegmentAtTime(tl, 3.5).segmentId, 's2');
  assert.equal(getSegmentAtTime(tl, 2.7), null);

  assert.equal(getNextPhrase(tl, 0.8).text, 'is changing the world.');
  assert.equal(getNextPhrase(tl, 2.7).text, 'It starts now,');
  assert.equal(getNextPhrase(tl, 4.5), null);
  assert.equal(getPreviousPhrase(tl, 1.5).text, 'Artificial intelligence');
  assert.equal(getPreviousPhrase(tl, 2.7).text, 'is changing the world.');
  assert.equal(getPreviousPhrase(tl, 0.3), null);
});

test('speech timeline: pauses are reported with their duration and kind', () => {
  const tl = makeTimeline();
  const between = getPauseAtTime(tl, 2.7);
  assert.equal(between.kind, 'segment');
  assert.equal(between.duration, 0.6);
  assert.equal(getPauseAtTime(tl, 4.0).kind, 'word');
  assert.equal(getPauseAtTime(tl, 1.0), null);
  assert.equal(getNextPause(tl, 0).pauseId, 'pause-001');
  assert.equal(getNextPause(tl, 3.0).pauseId, 'pause-002');
  assert.equal(getNextPause(tl, 4.4), null);
});

test('speech timeline: isSpeaking is false in pauses and outside the audio', () => {
  const tl = makeTimeline();
  assert.equal(isSpeaking(tl, 1.0), true);
  assert.equal(isSpeaking(tl, 2.7), false);
  assert.equal(isSpeaking(tl, 4.0), false, 'inside a pause within a segment');
  assert.equal(isSpeaking(tl, 6), false);
});

test('speech timeline: progress is 0..1 over the narration', () => {
  const tl = makeTimeline();
  assert.deepEqual(getSpeechBounds(tl), { start: 0, end: 5 });
  assert.equal(getSpeechProgress(tl, -1), 0);
  assert.equal(getSpeechProgress(tl, 2.5), 0.5);
  assert.equal(getSpeechProgress(tl, 9), 1);
  assert.equal(getItemProgress(tl.words[0], 0.26), 0.5);
  assert.equal(getItemProgress(null, 1), 0);
});

test('speech timeline: every query is neutral without a timeline', () => {
  for (const tl of [null, undefined, {}, { segments: [] }, 'nope']) {
    assert.equal(getWordAtTime(tl, 1), null);
    assert.deepEqual(getActiveWords(tl, 1), []);
    assert.equal(getCurrentWordIndex(tl, 1), -1);
    assert.deepEqual(getWordsInRange(tl, 0, 9), []);
    assert.equal(getPhraseAtTime(tl, 1), null);
    assert.equal(getSegmentAtTime(tl, 1), null);
    assert.equal(getNextPhrase(tl, 1), null);
    assert.equal(getPreviousPhrase(tl, 1), null);
    assert.equal(getPauseAtTime(tl, 1), null);
    assert.equal(getSpeechProgress(tl, 1), 0);
    assert.equal(isSpeaking(tl, 1), false);
    assert.deepEqual(buildSpeechEvents(tl), []);
    assert.equal(findPhrase(tl, 'x'), null);
    assert.equal(resolveTarget(tl, { phrase: 'x' }), null);
  }
});

test('speech timeline: normalisation drops impossible items instead of trusting them', () => {
  const raw = makeTimeline();
  raw.words.push({ wordId: 'bad1', text: 'x', start: 3, end: 2 }); // end before start
  raw.words.push({ wordId: 'bad2', text: 'y', start: 'a', end: 1 }); // not a number
  raw.words.push({ wordId: 'bad3', text: 'z', start: 6, end: 6 }); // zero length: never "active"
  const tl = normalizeSpeechTimeline(raw);
  assert.equal(tl.words.length, 10);
  assert.equal(normalizeSpeechTimeline(raw), tl, 'memoised per object');
  // Unsorted input is sorted.
  const shuffled = { ...makeTimeline(), words: makeTimeline().words.reverse() };
  assert.equal(normalizeSpeechTimeline(shuffled).words[0].text, 'Artificial');
});

// ---------------------------------------------------------------------------
// Finding speech
// ---------------------------------------------------------------------------

test('findPhrase: matches spoken words ignoring case and punctuation, across phrase boundaries', () => {
  const tl = makeTimeline();
  const hit = findPhrase(tl, 'artificial INTELLIGENCE');
  assert.deepEqual([hit.start, hit.end], [0.0, 1.1]);
  assert.equal(findPhrase(tl, 'the world').start, 1.82);
  const across = findPhrase(tl, 'now truly');
  assert.deepEqual([across.start, across.end], [3.58, 4.9], 'spans the silence between the two words');
});

test('findPhrase: does not stitch words across an unmeasured gap', () => {
  const tl = makeTimeline();
  tl.words = tl.words.filter((w) => w.text !== 'is'); // aligner could not time "is"
  assert.equal(findPhrase(tl, 'intelligence changing'), null);
  assert.ok(findPhrase(tl, 'changing the'));
});

test('findPhrase: fromTime finds a later repeat', () => {
  const tl = makeTimeline();
  tl.words.push(W('s2', 4, 10, 'intelligence', 4.95, 5.0));
  tl.segments[1].end = 5.0;
  assert.equal(findPhrase(tl, 'intelligence').start, 0.53);
  assert.equal(findPhrase(tl, 'intelligence', { fromTime: 2 }).start, 4.95);
});

test('resolveTarget: ids, text and explicit intervals', () => {
  const tl = makeTimeline();
  assert.deepEqual(resolveTarget(tl, { phraseId: 's2-p02' }), { start: 4.4, end: 4.9 });
  assert.deepEqual(resolveTarget(tl, { wordId: tl.words[2].wordId }), { start: 1.12, end: 1.25 });
  assert.deepEqual(resolveTarget(tl, { segmentId: 's2' }), { start: 3.0, end: 5.0 });
  assert.deepEqual(resolveTarget(tl, { phrase: 'starts now' }), { start: 3.14, end: 3.9 });
  assert.deepEqual(resolveTarget(tl, { start: 1, end: 2 }), { start: 1, end: 2 });
  assert.equal(resolveTarget(tl, { phrase: 'never said' }), null);
  assert.equal(resolveTarget(tl, {}), null);
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

test('speech events: every unit emits START/END, sorted, ends before starts at the same instant', () => {
  const tl = makeTimeline();
  const events = buildSpeechEvents(tl);
  const types = new Set(events.map((e) => e.type));
  for (const t of ['WORD_START', 'WORD_END', 'PHRASE_START', 'PHRASE_END', 'SEGMENT_START', 'SEGMENT_END', 'PAUSE_START', 'PAUSE_END']) {
    assert.ok(types.has(t), t);
  }
  for (let i = 1; i < events.length; i++) assert.ok(events[i].time >= events[i - 1].time, 'sorted by time');

  // 2.4: the word, phrase and segment all END together, and the pause STARTS - ends come first.
  const at24 = events.filter((e) => e.time === 2.4).map((e) => e.type);
  assert.deepEqual(at24, ['WORD_END', 'PHRASE_END', 'SEGMENT_END', 'PAUSE_START']);
  // 3.0: the pause ends, then the segment, phrase and word start (wide unit opens first).
  const at30 = events.filter((e) => e.time === 3.0).map((e) => e.type);
  assert.deepEqual(at30, ['PAUSE_END', 'SEGMENT_START', 'PHRASE_START', 'WORD_START']);

  assert.equal(events.filter((e) => e.type === 'WORD_START').length, 10);
  const phraseStart = events.find((e) => e.type === 'PHRASE_START' && e.time === 3.0);
  assert.equal(phraseStart.phraseId, 's2-p01');
  assert.equal(buildSpeechEvents(tl), events, 'cached');
});

test('speech events: getEventsInRange is half-open and can filter by type', () => {
  const tl = makeTimeline();
  assert.deepEqual(getEventsInRange(tl, 2.4, 3.0, 'PAUSE_START').map((e) => e.pauseId), ['pause-001']);
  assert.deepEqual(getEventsInRange(tl, 2.4, 3.0, 'PAUSE_END'), [], 'to is exclusive');
  assert.equal(getEventsInRange(tl, 0, 0.6, ['WORD_START']).length, 2);
});

// ---------------------------------------------------------------------------
// Captions: grouping + the same source as animation
// ---------------------------------------------------------------------------

test('caption groups: break on sentence ends, pauses and the word limit; tile the whole transcript', () => {
  const tl = makeTimeline();
  const groups = groupCaptionWords(tl, { maxWordsPerLine: 6, totalWords: 10 });
  assert.deepEqual(groups.map((g) => g.words.map((w) => w.text)), [
    ['Artificial', 'intelligence', 'is', 'changing', 'the', 'world.'],
    ['It', 'starts', 'now,'],
    ['truly.'],
  ]);
  // The groups cover caption indexes 0..9 with no holes and no overlap.
  assert.deepEqual(groups.map((g) => [g.firstIndex, g.lastIndex]), [[0, 5], [6, 8], [9, 9]]);
});

test('caption groups: maxWordsPerLine and maxCaptionDuration', () => {
  const tl = makeTimeline();
  const byWords = groupCaptionWords(tl, { maxWordsPerLine: 3, totalWords: 10 });
  assert.ok(byWords.every((g) => g.lastIndex - g.firstIndex + 1 <= 3));
  const byDuration = groupCaptionWords(tl, { maxWordsPerLine: 20, maxCaptionDuration: 1.2, totalWords: 10 });
  assert.ok(byDuration.every((g) => g.end - g.start <= 1.2 + 1e-9), 'no caption runs past the maximum duration');
});

test('caption groups: an unmeasured word still belongs to a group', () => {
  const tl = makeTimeline();
  tl.words = tl.words.filter((w) => w.text !== 'changing'); // caption index 3 has no timing
  const groups = groupCaptionWords(tl, { totalWords: 10 });
  assert.deepEqual([groups[0].firstIndex, groups[0].lastIndex], [0, 5]);
});

test('caption groups: appear with the first word, hold briefly after the last, then clear', () => {
  const tl = makeTimeline();
  const groups = groupCaptionWords(tl, { totalWords: 10 });
  assert.equal(getCaptionGroupAt(groups, -0.5).group, null);
  assert.equal(getCaptionGroupAt(groups, 0.0).index, 0);
  assert.equal(getCaptionGroupAt(groups, 2.7).index, 0, 'held through a short silence');
  assert.equal(getCaptionGroupAt(groups, 2.85, { hold: 0.5 }).group?.id, 'group-1');
  assert.equal(getCaptionGroupAt(groups, 2.99).group, null, 'cleared after the hold, and the next group never appears before its first word');
  assert.equal(getCaptionGroupAt(groups, 3.0).index, 1);
  assert.equal(getCaptionGroupAt(groups, 99).group, null, 'cleared long after the speech');
});

test('captions: the speech model describes the narration, not an unrelated caption', () => {
  const tl = makeTimeline();
  assert.ok(buildCaptionModel(tl, CAPTION_WORDS));
  assert.equal(matchRatio(CAPTION_WORDS, tl.words), 1);
  // A headline is not the narration: wrong length, so it must not borrow its timing.
  assert.equal(buildCaptionModel(tl, 'Welcome to the show'.split(' ')), null);
  // Same length, different words: rejected by the text check.
  assert.equal(buildCaptionModel(tl, 'a b c d e f g h i j'.split(' ')), null);
  assert.equal(buildCaptionModel(null, CAPTION_WORDS), null);
  assert.equal(buildCaptionModel({ ...tl, words: [] }, CAPTION_WORDS), null);
});

test('captions: highlighted word is exactly the word animation sees (one timing source)', () => {
  const tl = makeTimeline();
  const model = buildCaptionModel(tl, CAPTION_WORDS);
  for (let t = 0; t < 5; t += 0.01) {
    const state = resolveCaptionState(model, t);
    const word = getWordAtTime(tl, t);
    if (word && state) assert.equal(state.activeIndex, word.captionIndex, `at ${t.toFixed(2)}s`);
  }
});

test('captions: state follows the voice, holds in gaps, emphasises director-marked words', () => {
  const tl = makeTimeline();
  const model = buildCaptionModel(tl, CAPTION_WORDS);
  assert.equal(resolveCaptionState(model, -1), null, 'nothing before the first word');

  const early = resolveCaptionState(model, 0.2);
  assert.deepEqual([early.firstIndex, early.lastIndex, early.activeIndex], [0, 5, 0]);
  assert.deepEqual([...early.emphasisIndexes].sort(), [0, 1]);

  assert.equal(resolveCaptionState(model, 1.3).activeIndex, 3);
  assert.equal(resolveCaptionState(model, 2.45).activeIndex, 5, 'last word held through the pause');
  assert.equal(resolveCaptionState(model, 3.2).firstIndex, 6);
  assert.equal(resolveCaptionState(model, 4.1).activeIndex, 8, 'held through the pause inside the segment');
  assert.equal(resolveCaptionState(model, 4.5).activeIndex, 9);
  assert.equal(resolveCaptionState(model, 30), null, 'cleared after the speech');
});

test('captions: highlight=phrase lights through the end of the current phrase', () => {
  const model = buildCaptionModel(makeTimeline(), CAPTION_WORDS);
  assert.equal(resolveCaptionState(model, 0.2, { highlight: 'phrase' }).activeIndex, 1); // "Artificial intelligence"
  assert.equal(resolveCaptionState(model, 1.3, { highlight: 'phrase' }).activeIndex, 5); // "is changing the world."
});

// ---------------------------------------------------------------------------
// Scene timing
// ---------------------------------------------------------------------------

test('scene timing: only timingMode "speech" is acted on', () => {
  const tl = makeTimeline();
  for (const mode of ['fixed', 'duration', 'manual', undefined]) {
    const r = resolveSpeechTrigger(tl, { timingMode: mode, trigger: 'phrase', phrase: 'starts now' });
    assert.equal(r.source, 'none', String(mode));
  }
  assert.equal(resolveSpeechTrigger(tl, null).source, 'none');
});

test('scene timing: triggers resolve to real moments in the speech', () => {
  const tl = makeTimeline();
  const at = (cfg) => resolveSpeechTrigger(tl, { timingMode: 'speech', ...cfg });
  assert.equal(at({ trigger: 'phrase', phrase: 'artificial intelligence' }).time, 0);
  assert.equal(at({ trigger: 'phrase', phrase: 'starts now' }).time, 3.14);
  assert.equal(at({ trigger: 'word', word: 'truly' }).time, 4.4);
  assert.equal(at({ trigger: 'segment', segment: 1 }).time, 3.0);
  assert.equal(at({ trigger: 'segmentEnd', segment: 0 }).time, 2.4);
  assert.equal(at({ trigger: 'pause', pause: 0 }).time, 2.4);
  assert.equal(at({ trigger: 'speechStart' }).time, 0);
  assert.equal(at({ trigger: 'speechEnd' }).time, 5);
  assert.equal(at({ trigger: 'time', time: 1.5 }).time, 1.5);
  assert.equal(at({ trigger: 'phrase', phrase: 'starts now', offset: -0.2 }).time, 2.94);
  assert.equal(at({ trigger: 'phrase', phrase: 'artificial intelligence', offset: -0.5 }).time, 0, 'never before the start of the audio');
  assert.equal(at({ trigger: 'phrase', phrase: 'starts now' }).source, 'speech');
});

test('scene timing: a cue that is not in the speech falls back instead of guessing', () => {
  const tl = makeTimeline();
  const missing = { timingMode: 'speech', trigger: 'phrase', phrase: 'quantum computing' };
  assert.equal(resolveSpeechTrigger(tl, missing).source, 'none');
  const withFallback = resolveSpeechTrigger(tl, { ...missing, fallbackDelayFrames: 12 });
  assert.equal(withFallback.source, 'fallback');
  assert.equal(triggerFrame(withFallback, 30), 12);
  // No timeline at all: same fallback behaviour.
  assert.equal(resolveSpeechTrigger(null, { ...missing, fallbackDelayFrames: 12 }).source, 'fallback');
  assert.equal(triggerFrame(resolveSpeechTrigger(null, missing), 30), null);
  assert.equal(resolveSpeechTrigger(tl, { timingMode: 'speech', trigger: 'pause', pause: 9 }).source, 'none');
});

test('scene timing: re-times the targeted slots on the cue and keeps their stagger', () => {
  const tl = makeTimeline();
  const slots = [{ id: 'a', role: 'title' }, { id: 'b', role: 'listItem' }, { id: 'c', role: 'listItem' }];
  const plan = {
    a: { type: 'fadeIn', delay: 6, duration: 20 },
    b: { type: 'fadeSlideUp', delay: 12, duration: 20 },
    c: { type: 'fadeSlideUp', delay: 18, duration: 20 },
  };
  const cfg = { timingMode: 'speech', trigger: 'phrase', phrase: 'starts now', animation: 'scaleIn', target: 'listItem' };
  const next = applySpeechTimingToPlan(plan, slots, cfg, tl, 30);
  assert.equal(next.a, plan.a, 'untargeted slots are untouched');
  assert.deepEqual(next.b, { type: 'scaleIn', delay: Math.round(3.14 * 30), duration: 20 });
  assert.equal(next.c.delay - next.b.delay, 6, 'stagger preserved');
  assert.notEqual(next, plan);
  assert.equal(plan.b.delay, 12, 'input plan is not mutated');
});

test('scene timing: returns the original plan when nothing applies', () => {
  const tl = makeTimeline();
  const slots = [{ id: 'a', role: 'title' }];
  const plan = { a: { type: 'fadeIn', delay: 6, duration: 20 } };
  assert.equal(applySpeechTimingToPlan(plan, slots, null, tl, 30), plan);
  assert.equal(applySpeechTimingToPlan(plan, slots, { timingMode: 'fixed' }, tl, 30), plan);
  assert.equal(applySpeechTimingToPlan(plan, slots, { timingMode: 'speech', trigger: 'phrase', phrase: 'nope' }, tl, 30), plan);
  assert.equal(applySpeechTimingToPlan(plan, slots, { timingMode: 'speech', trigger: 'phrase', phrase: 'starts now', target: 'image' }, tl, 30), plan, 'no slot with that role');
  assert.equal(applySpeechTimingToPlan(plan, slots, { timingMode: 'speech', trigger: 'phrase', phrase: 'starts now' }, null, 30), plan, 'no timeline');
});

test('scene timing: a scene transition can wait for the narration to finish', () => {
  const tl = makeTimeline();
  const end = resolveSpeechTrigger(tl, { timingMode: 'speech', trigger: 'speechEnd', offset: 0.3 });
  assert.equal(triggerFrame(end, 30), Math.round(5.3 * 30));
  // ...or for the pause between ideas.
  const pause = resolveSpeechTrigger(tl, { timingMode: 'speech', trigger: 'pause', pause: 0 });
  assert.equal(triggerFrame(pause, 30), 72);
});

// ---------------------------------------------------------------------------
// Animation envelopes (subtle by construction)
// ---------------------------------------------------------------------------

test('envelopes: pulse rises, holds and releases; stays within 0..1', () => {
  assert.equal(pulseEnvelope(0.9, 1, 2), 0);
  assert.equal(pulseEnvelope(1.5, 1, 2), 1);
  assert.ok(pulseEnvelope(1.05, 1, 2, { attack: 0.2 }) > 0 && pulseEnvelope(1.05, 1, 2, { attack: 0.2 }) < 1);
  assert.ok(pulseEnvelope(2.1, 1, 2, { release: 0.2 }) > 0 && pulseEnvelope(2.1, 1, 2, { release: 0.2 }) < 1);
  assert.equal(pulseEnvelope(2.3, 1, 2, { release: 0.2 }), 0);
  for (let t = 0; t < 3; t += 0.01) {
    const v = pulseEnvelope(t, 1, 2);
    assert.ok(v >= 0 && v <= 1);
  }
});

test('envelopes: the word scale goes 1.0 -> 1.08 -> 1.0 and never beyond', () => {
  assert.equal(scaleFromEnvelope(0), 1);
  assert.equal(scaleFromEnvelope(1, 1.08), 1.08);
  assert.equal(scaleFromEnvelope(pulseEnvelope(0.5, 1, 2), 1.08), 1, 'before the word');
  assert.equal(scaleFromEnvelope(pulseEnvelope(1.5, 1, 2), 1.08), 1.08, 'during the word');
  assert.equal(scaleFromEnvelope(pulseEnvelope(2.5, 1, 2), 1.08), 1, 'after the word');
  let max = 0;
  for (let t = 0; t < 3; t += 0.005) max = Math.max(max, scaleFromEnvelope(pulseEnvelope(t, 1, 2), 1.08));
  assert.ok(max <= 1.08 + 1e-9);
});

test('envelopes: pop and reveal are bounded and settle at rest', () => {
  assert.deepEqual(popState(0.5, 1), { scale: 0.94, opacity: 0 });
  const end = popState(5, 1);
  assert.ok(Math.abs(end.scale - 1) < 1e-9 && end.opacity === 1);
  for (let t = 1; t < 1.5; t += 0.005) {
    const { scale, opacity } = popState(t, 1);
    assert.ok(scale >= 0.94 && scale <= 1.05, `scale ${scale}`);
    assert.ok(opacity >= 0 && opacity <= 1);
  }
  assert.equal(revealProgress(0.9, 1), 0);
  assert.equal(revealProgress(2, 1), 1);
  assert.equal(ease(0.5), 0.5);
});

test('envelopes: phrase transition enters on the phrase start and holds until the next', () => {
  const tl = makeTimeline();
  assert.deepEqual(phraseTransitionState(tl.phrases, -1), { phrase: null, enter: 0, state: 'idle' });
  const entering = phraseTransitionState(tl.phrases, 0.05, { inDuration: 0.25 });
  assert.equal(entering.phrase.text, 'Artificial intelligence');
  assert.equal(entering.state, 'entering');
  assert.ok(entering.enter > 0 && entering.enter < 1);
  assert.equal(phraseTransitionState(tl.phrases, 0.8).state, 'active');
  const hold = phraseTransitionState(tl.phrases, 2.7);
  assert.equal(hold.phrase.text, 'is changing the world.');
  assert.equal(hold.state, 'holding');
  assert.equal(hold.enter, 1);
});
