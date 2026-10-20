# Output quality checker

After a video is rendered, the checker reads the **finished file** back and decides whether it may be
marked complete. Code: `backend/src/services/qc/video/`. Tests: `backend/tests/qc/video/`.

It is separate from the two checks that already existed, which look at *inputs*:

| Check | Looks at | When |
|---|---|---|
| `RemotionService.validateAssets` | script, storage, image URLs | before the render |
| `LayoutQcService` (`QC_ENABLED`) | each scene drawn in headless Chromium | before the render |
| **Output quality check** (this) | the rendered video and audio themselves | **after** the render, before upload |

## What it checks

| Check | Fails the job when | Only warns when |
|---|---|---|
| Video file exists | missing, or under 1 KB | |
| Video decodes | container unreadable, no video stream, or the decoder reports errors anywhere in the audio or picture | |
| Audio track present | the script has narration but the file has no audio stream | |
| Duration | the file is shorter than the script by more than 2x the tolerance (or 10%) - a truncated render; or wildly longer (3x tolerance and 25%); or audio and picture differ by > 5 s | a smaller gap in either direction; audio/picture drift of 1-5 s |
| Narration audible | the whole track is silent, or a narrated scene is ≥ 90% silent | a narrated scene is ≥ 60% silent, or has a gap over 6 s. Scenes with no narration may be quiet. |
| No black frames | the video is black throughout, or a black stretch lasts ≥ 3 s | a black stretch of 1-3 s. A dark slide with light text is *not* black (mean luma **and** brightest 1% must both be low). |
| Scene audio files | a narrated scene's audio file is missing from storage | storage could not be queried |
| Scene images | a referenced image cannot be fetched, or a prompt never produced an image | a scene the pipeline deliberately turned into text because its image failed |
| Captions timed | burned-in caption timings are invalid, out of order, or run past the audio | missing word timing (captions fall back to even pacing), captions stopping early, timed words far from spoken words |
| Subtitles fit | | a cue over the line limit, on screen too long, too fast to read, overlapping, past the video's end; a caption chunk estimated to wrap past 2 lines |

Expected length follows what Remotion actually renders: each scene's `audio.duration || duration || 8`,
summed and rounded once (`calculateVideoMetadata`).

## The gate

`QC_VIDEO_MODE` (default `enforce`):

- **enforce** - a failed check fails the job *before upload*, so it can never reach `COMPLETED` with a bad file.
- **report** - the report is recorded, nothing is blocked.
- **off** - skipped.

A failure is classified by what is wrong:

- **A fault in the file** (missing, undecodable, truncated, black): the render is discarded - including its fingerprint,
  otherwise the retry would skip rendering and re-check the same bad file - and the job retries from the render stage
  with the normal backoff and budget.
- **A fault in the content** (silent narration, a dead image URL, bad caption timing): a second render would reproduce it,
  so the job fails immediately with the findings as its message, instead of burning retries.

A checker that itself breaks (no ffmpeg, a probe crash) never blocks a video: the report is `skipped` and says why.
Checks that can't run (no ffmpeg) show as `skipped` per check; the file-existence checks still run.

## The report

Stored on `VideoJob.qualityReport` / `CourseVideo.qualityReport`, returned by `GET /api/videos/:id`, emitted as a
`qualityReport` job event, summarised in the activity log, and shown on the job page ("Quality report" card).

```
{ version, status: passed | passed-with-warnings | failed | skipped, passed, mode, checkedAt, durationMs,
  summary: { errors, warnings },
  checks: [{ id, name, status: pass | warn | fail | skipped, note? }],
  issues: [{ check, severity: error | warn, scene?, atSec?, message, detail? }],   // errors first, capped at 200
  media:  { durationSec, expectedSec, width, height, fps, videoCodec, audioCodec, sizeBytes, tools } }
```

## How it reads the file

ffprobe for the container, then ffmpeg decodes the audio to 8 kHz mono PCM and the picture to tiny grayscale frames
(2 fps), both analysed in JS. Nothing depends on which filters an ffmpeg build ships - Remotion's bundled one has no
`blackdetect`. Tools: `FFMPEG_PATH` / `FFPROBE_PATH` (else `PATH`), falling back to the ffmpeg Remotion installs.
Checking a short clip takes a fraction of a second; a 10-minute 1080p video is bounded by `QC_VIDEO_TIMEOUT_MS`.

## Settings

| Env | Default | |
|---|---|---|
| `QC_VIDEO_MODE` | `enforce` | `enforce` / `report` / `off` |
| `QC_VIDEO_TIMEOUT_MS` | 600000 | bound on decoding the file |
| `QC_DURATION_TOLERANCE_SEC` / `_PCT` | 1 / 0.015 | the larger applies |
| `QC_SILENCE_DB` | 50 | at or below -50 dBFS is silent |
| `QC_SILENT_SCENE_WARN` / `_ERROR` / `QC_MAX_SILENT_GAP_SEC` | 0.6 / 0.9 / 6 | |
| `QC_BLACK_MEAN_MAX` / `_BRIGHT_MAX` / `_MIN_SEC` / `_ERROR_SEC` | 12 / 40 / 1 / 3 | |
| `QC_SAMPLE_FPS` | 2 | frames sampled per second |
| `QC_SUBTITLE_MAX_CHARS` / `_MAX_CUE_SEC` / `_MAX_CPS` | 42 / 7 / 21 | |
| `QC_CAPTION_FONT_SIZE` / `QC_CAPTION_MAX_LINES` | 48 / 2 | caption box estimate |
| `QC_PROBE_IMAGES` | on | fetch each image once to confirm it loads |

## Known limits

- Thresholds were validated against synthetic media (generated with ffmpeg, in `VideoQualityService.media.test.js`)
  and unit fixtures, **not against a real Remotion render** - watch the first real jobs' reports and tune the
  duration tolerance if crossfades make real renders drift from the script.
- Caption box overflow is an *estimate* from font size and glyph width, hence a warning, never an error. The layout
  check (`QC_ENABLED`) is the measured one.
- It judges whether narration is *audible*, not whether it says the right words.
- A report is only produced when a render runs, so a completed job rendered before this existed has none.
