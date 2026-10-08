# Speech alignment and speech-driven animation

Real speech timing, measured from the generated audio, drives captions,
Remotion animation and scene timing from **one** canonical timeline.

```
Script → Voice Director → segment TTS (Qwen3-TTS) → audio processing
      → speech alignment (faster-whisper, CPU) → canonical timeline
              ├─→ captions         (CaptionRenderer, same data)
              ├─→ animation        (speech primitives, motion controller)
              └─→ scene timing     ({ timingMode: "speech", trigger, ... })
      → Remotion render
```

Almost everything upstream already existed (Voice Director, segment TTS, the
two-layer segment cache, faster-whisper alignment, `ttsStage` progress,
`CaptionRenderer`, the Motion Design System). This feature adds the canonical
timeline, honest status/fallback handling, alignment versioning, the
speech-aware Remotion layer, events, an API and a developer preview. Nothing
was rebuilt.

## Feature flags

| Env | Effect when `true` | Off |
|---|---|---|
| `ENABLE_SPEECH_ALIGNMENT` | Builds and stores the canonical timeline per scene; emits speech progress events. **Implies the segmented narration pipeline** (`TTS_SEGMENTED`), because the timeline is built from the per-segment clips. | Existing behaviour. No timeline, no events. |
| `ENABLE_SPEECH_DRIVEN_ANIMATION` | Hands the timeline (and a scene's `speechTiming`) to Remotion: captions and animation follow the voice. | Render props are byte-for-byte what they were. |
| `SPEECH_ALIGNMENT_REQUIRED` | Fails a scene that cannot be fully word-aligned. | Alignment is a refinement; failures fall back (below). |

Other knobs: `SPEECH_PAUSE_MIN_MS` (250), `SPEECH_PHRASE_GAP_MS` (180),
`SPEECH_MAX_PHRASE_WORDS` (8), `SPEECH_COMPLETE_RATIO` (0.9),
`ALIGNMENT_MODEL` (`base`), `ALIGNMENT_CONCURRENCY` (1),
`ALIGNMENT_CPU_THREADS` (4), `ALIGNMENT_TEXT_PROMPT` (true). See `backend/.env.example`.

## Never faked

Word timestamps come only from the aligner. They are never produced by dividing
the audio duration by the word count.

- A word the aligner could not place is **absent** from the timeline (not
  interpolated). The legacy `captionTimestamps` shape still flags such words
  `estimated: true` for the old renderer path; the canonical timeline excludes them.
- A segment is `granularity: "word"` (measured words) or `"segment"` (only its
  clip bounds, which are real because they come from the assembled audio).
- Status per segment and per scene: `complete` (≥ `SPEECH_COMPLETE_RATIO` of
  words measured), `partial`, or `failed`. Why a segment fell back is recorded in
  `fallbackReasons` (debugging only).
- Fallback ladder: word-level → segment-level (per segment, so a scene can be
  `mixed`) → no timeline → existing duration-based rendering. TTS audio stays
  valid in every case. Phrases are derived from words, so there is no separate
  phrase-level step.

## Canonical timeline

Stored at `scene.audio.speechTimeline`; **seconds** from the start of the scene's
audio everywhere (pipeline-internal segment fields elsewhere are milliseconds and
are converted once, in `timelineBuilder`). Schema: `speech/schemas.js` (Zod).

```
{ version, sceneNumber, alignmentStatus, alignmentProvider, alignmentVersion,
  granularity: 'word'|'mixed'|'segment', fallbackReasons[], duration, createdAt,
  segments[]: { segmentId, index, text, wordCount, start, end, duration, speaker, voice,
                voiceProfile, confidence, alignmentStatus, granularity,
                direction: { emotion, energy, speed, emphasis[], importance } },
  words[]:    { wordId, segmentId, index, captionIndex, text, start, end, duration, confidence, emphasis },
  phrases[]:  { phraseId, segmentId, text, start, end, duration, firstWordId, lastWordId, wordCount, emphasis, importance },
  pauses[]:   { pauseId, start, end, duration, kind: 'segment'|'word', afterId, beforeId },
  stats }
```

Invariants (`validateTimeline`): `start < end`, `duration = end − start`,
everything inside `[0, duration]`, words monotonic and inside their segment.
The builder cannot emit violations; the check guards tests, the API and old data.

Voice Director metadata is carried, not duplicated: segments hold the
director's emotion/energy/speed/emphasis and an `importance` (`high` when it has
emphasis, high energy, or the pause engine put a beat before the line); emphasised
words/phrases are flagged. Segments name their `speaker`/`voice`, so multi-speaker
needs no schema change.

**Pauses** are measured, not added: silence between segments (the pause the
assembler already placed, from real clip bounds) and gaps ≥ `SPEECH_PAUSE_MIN_MS`
between two *adjacent* measured words. A gap next to an unmeasured word is that
word, not silence. No pause is added to the audio.

## Alignment provider

`speech/alignmentService.js` is the only door: `alignAudio({ audioPath, text,
language, options })` (one clip) and `alignClips(clips)` (one provider call per
scene, the model loads once). It returns a normalised `AlignmentResult`
regardless of engine. A provider only implements
`alignBatch(files, { signal, languages, prompts }) → [{ word, start, end, probability? }] | null`
and `version` (`alignment/index.js`, `registerProvider`). One provider ships:
**faster-whisper** (CPU, int8, already installed). It runs as a single process at
a time (`ALIGNMENT_CONCURRENCY`), below-normal priority, capped threads. It is
ASR-driven alignment: the audio is synthetic speech reading a known script, and the
recognised words are mapped back onto the caption words (Needleman–Wunsch,
`alignment/mapWords.js`).

## Caching and versions

Alignment rides the existing per-segment cache (`tts-seg/processed/…` metadata).
It is reused only when the stored `alignment.version` equals the current
`provider:model:driver/mapper` version, so changing model, provider, prompting or
the mapper retires old alignment (the audio is untouched; only CPU alignment
re-runs, and the entry is upgraded in place). Cache entries from before versioning
are re-aligned once. Failed alignments are never cached.

## Progress events

One Socket.IO event `speechStage` (also stored on the job's event timeline, so a
reconnect replays it) with `event` ∈ `tts:start`, `tts:complete`, `alignment:start`,
`alignment:progress`, `alignment:complete`, `timeline:complete`, `render:start`,
`render:complete`. The render page shows four plain steps: *Generating voice… /
Voice generated → Analyzing speech timing… / Speech timing analyzed → Building
visual timeline… / Timeline ready → Rendering video…*. Per-segment detail still
rides `jobProgress.ttsStage` (`speech-aligning`, `speech-timeline`).

Alignment is **not a separate BullMQ job**: it runs inside the existing audio step
under the one GPU lease, because segment clips exist only inside that step and the
step's design (see `src/core/README.md`) deliberately avoids per-segment jobs.

## API

`GET /api/videos/:id/speech-timeline[?scene=N]` → `{ alignmentEnabled,
drivenAnimationEnabled, scenes: [{ sceneNumber, audioFile, duration, timeline|null,
issues[] }] }`. `issues` is the invariant check (empty = sound).

A scene can opt into speech timing through `scene.speechTiming` (saved with
`PUT /api/videos/:id/scenes`; validated with Zod, invalid configs are ignored).

## Remotion

Code lives in `backend/remotion/src/speech/`.

- **`timeline.js`** – the only place timing questions are answered: `getWordAtTime`,
  `getWordsInRange`, `getPhraseAtTime`, `getActiveWords`, `getSegmentAtTime`,
  `getNextPhrase`, `getPreviousPhrase`, `getSpeechProgress`, `getPauseAtTime`,
  `findPhrase`, `resolveTarget`, `groupCaptionWords`, and events
  (`buildSpeechEvents`: `WORD_/PHRASE_/SEGMENT_/PAUSE_ START|END`, ordered ends-before-starts).
  All are neutral (`null`/`[]`/`0`) without a timeline.
- **Captions** – `CaptionRenderer` reads the same timeline (through `SpeechProvider`
  wrapped around each scene in `VideoComposition`) when it genuinely describes the
  caption text (length + word check); otherwise the legacy timestamps apply unchanged.
  Words enter on the frame they are spoken; groups break at sentence ends, real
  pauses, the word limit and `maxCaptionDuration`; the caption clears after a hold.
  Options in `styleConfig.speechCaptions`: `maxWordsPerLine`, `maxCaptionDuration`,
  `breakOnPause`, `highlight: 'word'|'phrase'`, `hold`. Voice-Director-emphasised
  words get a subtle lift while spoken.
- **Primitives** (`primitives.jsx`, gentle by default, never hide content when speech
  is missing): `SpeechHighlight`, `SpeechScale` (1.0→1.08→1.0), `SpeechPop`,
  `SpeechReveal`, `SpeechEmphasis`, `SpeechWordHighlight`, `SpeechPhraseTransition`.
  Target with `{ phrase }`, `{ word }`, `{ wordId }`, `{ phraseId }`, `{ segmentId }`, `{ start, end }`.
- **Scene timing** (`speechTiming.js`): `{ timingMode: "speech", trigger, ... }` with
  triggers `phrase`, `word`, `segment`, `segmentEnd`, `pause`, `speechStart`,
  `speechEnd`, `time`; `animation` is a Motion Design System id; `target` is a layout
  role (generative scenes); `offset`, `fallbackDelayFrames`. `fixed`, `duration`,
  `manual` (or no config) are untouched. A cue not found in the speech keeps the
  scene's own timing. Hand-coded templates can use `useSpeech()` and the
  primitives; the generative template applies `speechTiming` itself.

## Developer preview

The render page shows **Speech timing (developer)** in dev builds or with `?dev=1`:
real waveform decoded from the audio (absent if it can't be decoded), words /
phrases / segments / pauses lanes, play/pause, seek, zoom, current word / phrase /
segment / pause readout, status/provider/version, invariant issues.

## Metrics

Per scene in `ttsMeta`: `ttsGenerationMs`, `audioProcessingMs`, `alignmentMs`,
`alignmentCacheHits`, `speechTimelineMs`, `audioDurationMs`, `alignmentRatio`
(alignment time ÷ audio time), `alignmentStatus`; plus `MetricsService`
durations `speech.alignment`, `speech.timeline`, `speech.alignmentRatioPermille`.
Render and total times are in the existing analytics.

## Testing and commands

```bash
cd backend && npx jest                      # includes tests/speech/*
cd backend/remotion && npm test             # engine + speech suites (node:test)
cd frontend && npx vitest run
node backend/scripts/smokeSpeechAlignment.js --cleanup   # real TTS + faster-whisper + cache
```

The smoke script cross-checks the timeline against ffmpeg's independent silence
detection and against a naive even-split timeline, and proves the second run does
no TTS and no alignment.

## Known limits

- Word *end* times from the recogniser are loose (typically within ~0.25 s), so a
  reported pause edge can be early. A larger `ALIGNMENT_MODEL` improves it at CPU cost.
- ASR-driven alignment, not a phoneme forced aligner; a stronger provider can replace
  it without pipeline changes.
- Course videos persist the timeline but not segment metadata (pre-existing).
- The studio's in-browser scene preview does not receive the speech timeline.
- No UI yet for editing `scene.speechTiming`; set it through the scenes API.
