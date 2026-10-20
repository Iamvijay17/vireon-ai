const { sceneAt } = require('./timeline');

/**
 * The quality checks themselves, as pure functions: decoded media or script
 * data in, `issues` out. No ffmpeg, no files, no config - thresholds are
 * passed in - so every rule can be tested with a synthetic buffer.
 *
 * An issue is `{ check, severity: 'error' | 'warn', scene?, atSec?, message, detail? }`.
 * `error` is what blocks completion; `warn` is reported and never blocks.
 */

const ERROR = 'error';
const WARN = 'warn';
const issue = (check, severity, message, extra = {}) => ({ check, severity, message, ...extra });

const round1 = (n) => Math.round(n * 10) / 10;
const fmtSec = (s) => `${round1(s)}s`;

// ── Audio ───────────────────────────────────────────────────────────────────

/** dBFS of a signal level where 1.0 is full scale. Silence floors at -120 rather than -Infinity. */
const toDb = (level) => (level > 1e-6 ? 20 * Math.log10(level) : -120);

/**
 * Per-window loudness of mono signed-16-bit PCM: `{ rmsDb: [], windowSec, peakDb }`.
 * Windows are non-overlapping; a short tail is kept as its own window.
 */
function measureWindows(pcm, sampleRate, windowMs = 100) {
  // A Buffer read off a pipe can sit at an odd offset in its pool; an Int16Array view
  // must be 2-byte aligned, so copy in that case rather than throw.
  const aligned = pcm instanceof Int16Array || pcm.byteOffset % 2 === 0 ? pcm : Buffer.from(pcm);
  const samples = aligned instanceof Int16Array
    ? aligned
    : new Int16Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 2));
  const windowSamples = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const rmsDb = [];
  let peak = 0;

  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(start + windowSamples, samples.length);
    let sumSquares = 0;
    for (let i = start; i < end; i += 1) {
      const v = samples[i] / 32768;
      sumSquares += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    rmsDb.push(toDb(Math.sqrt(sumSquares / (end - start))));
  }
  return { rmsDb, windowSec: windowSamples / sampleRate, peakDb: toDb(peak) };
}

/** Runs of consecutive windows at or below `thresholdDb` as `{ startSec, endSec }`, at least `minSec` long. */
function silentRuns(rmsDb, windowSec, thresholdDb, minSec) {
  const runs = [];
  let from = null;
  for (let i = 0; i <= rmsDb.length; i += 1) {
    const silent = i < rmsDb.length && rmsDb[i] <= thresholdDb;
    if (silent && from === null) from = i;
    if (!silent && from !== null) {
      const run = { startSec: from * windowSec, endSec: i * windowSec };
      if (run.endSec - run.startSec >= minSec) runs.push(run);
      from = null;
    }
  }
  return runs;
}

/**
 * Is the narration actually audible?
 *
 * Silence is only a defect where speech was expected, so scenes are judged
 * against the script: a scene with narration that is (nearly) silent in the
 * render means its TTS clip was empty or never reached the mix. Scenes with
 * no narration are allowed to be quiet.
 */
function checkAudioSilence({ windows, timeline, thresholdDb, silentSceneError, silentSceneWarn, maxSilentGapSec }) {
  const issues = [];
  const narrated = timeline.filter((t) => t.narrated);
  if (narrated.length === 0) return issues; // nothing was meant to be heard

  const { rmsDb, windowSec, peakDb } = windows;
  if (rmsDb.length === 0) {
    return [issue('audio-silence', ERROR, 'The video has no decodable audio samples, but the script has narration')];
  }

  // Whole track dead: the cheapest, loudest failure - report it once, not per scene.
  if (peakDb <= thresholdDb) {
    return [issue('audio-silence', ERROR, `The audio track is silent (peak ${round1(peakDb)} dBFS) but the script has narration in ${narrated.length} scene(s)`, { detail: { peakDb: round1(peakDb) } })];
  }

  for (const t of narrated) {
    const from = Math.floor(t.startSec / windowSec);
    const to = Math.min(rmsDb.length, Math.ceil(t.endSec / windowSec));
    if (to <= from) continue; // the scene lies beyond the decoded audio; the duration check reports that
    const slice = rmsDb.slice(from, to);
    const silentRatio = slice.filter((db) => db <= thresholdDb).length / slice.length;

    if (silentRatio >= silentSceneError) {
      issues.push(issue('audio-silence', ERROR, `Scene ${t.sceneNumber} has narration but its audio is silent (${Math.round(silentRatio * 100)}% silent)`, { scene: t.sceneNumber, atSec: round1(t.startSec), detail: { silentRatio: round1(silentRatio * 100) / 100 } }));
      continue;
    }
    if (silentRatio >= silentSceneWarn) {
      issues.push(issue('audio-silence', WARN, `Scene ${t.sceneNumber} narration is mostly silent (${Math.round(silentRatio * 100)}% silent)`, { scene: t.sceneNumber, atSec: round1(t.startSec) }));
      continue;
    }

    const gap = silentRuns(slice, windowSec, thresholdDb, maxSilentGapSec)[0];
    if (gap) {
      issues.push(issue('audio-silence', WARN, `Scene ${t.sceneNumber} has a ${fmtSec(gap.endSec - gap.startSec)} silent gap in its narration`, { scene: t.sceneNumber, atSec: round1(t.startSec + gap.startSec) }));
    }
  }
  return issues;
}

// ── Video ───────────────────────────────────────────────────────────────────

/**
 * Brightness of each sampled frame from concatenated 8-bit grayscale frames:
 * `[{ mean, p99 }]`. p99 is what tells a black frame from a dark slide - a
 * dark theme with white text has a low mean but a bright 99th percentile.
 */
function measureFrames(gray, frameBytes) {
  const frames = [];
  const count = Math.floor(gray.length / frameBytes);
  for (let f = 0; f < count; f += 1) {
    const offset = f * frameBytes;
    const histogram = new Uint32Array(256);
    let sum = 0;
    for (let i = 0; i < frameBytes; i += 1) {
      const v = gray[offset + i];
      histogram[v] += 1;
      sum += v;
    }
    const target = Math.ceil(frameBytes * 0.99);
    let seen = 0;
    let p99 = 255;
    for (let v = 0; v < 256; v += 1) {
      seen += histogram[v];
      if (seen >= target) { p99 = v; break; }
    }
    frames.push({ mean: sum / frameBytes, p99 });
  }
  return frames;
}

/**
 * Black stretches in the render. A frame is black when it is dark overall AND
 * nothing in it is bright, so a deliberately dark scene with light text is not
 * flagged. Short blacks are normal (fade in/out, a cut), so only stretches of
 * `minSec` or more are reported, and ones of `errorSec` or more - or a video
 * that is black throughout - block completion: that is a broken render, not a design.
 */
function checkBlackFrames({ frames, sampleFps, timeline, meanMax, brightMax, minSec, errorSec }) {
  if (frames.length === 0) return [];
  const isBlack = frames.map((f) => f.mean <= meanMax && f.p99 <= brightMax);

  if (isBlack.every(Boolean) && frames.length / sampleFps >= minSec) {
    return [issue('video-black-frames', ERROR, 'The video is black from start to end', { atSec: 0 })];
  }

  const issues = [];
  let from = null;
  for (let i = 0; i <= isBlack.length; i += 1) {
    const black = i < isBlack.length && isBlack[i];
    if (black && from === null) from = i;
    if (!black && from !== null) {
      const startSec = from / sampleFps;
      const lengthSec = (i - from) / sampleFps;
      from = null;
      if (lengthSec < minSec) continue;
      const scene = sceneAt(timeline, startSec);
      const where = scene ? ` (scene ${scene.sceneNumber})` : '';
      issues.push(issue(
        'video-black-frames',
        lengthSec >= errorSec ? ERROR : WARN,
        `Black frames for ${fmtSec(lengthSec)} starting at ${fmtSec(startSec)}${where}`,
        { atSec: round1(startSec), ...(scene ? { scene: scene.sceneNumber } : {}), detail: { lengthSec: round1(lengthSec) } }
      ));
    }
  }
  return issues;
}

// ── Duration ────────────────────────────────────────────────────────────────

/**
 * Does the video last as long as the script says it should, and do its audio
 * and picture agree? Tolerance is the larger of a fixed floor and a percentage,
 * because crossfades and frame rounding make exact equality wrong.
 *
 * Short and long are not equally bad. A short file is a truncated render - the
 * viewer loses the end of the story - so it blocks once it is 2x the tolerance
 * (or 10%) short. A long one is usually a held outro or a transition and only
 * blocks when it is wildly over (3x the tolerance and 25%).
 */
function checkDuration({ actualSec, expectedSec, videoSec, audioSec, toleranceSec, tolerancePct }) {
  const issues = [];

  if (!(actualSec > 0)) {
    return [issue('duration', ERROR, 'The video reports no duration')];
  }

  if (expectedSec > 0) {
    const tolerance = Math.max(toleranceSec, expectedSec * tolerancePct);
    const diff = actualSec - expectedSec;
    const size = Math.abs(diff);
    if (size > tolerance) {
      const direction = diff < 0 ? 'shorter' : 'longer';
      const blockAbove = diff < 0
        ? Math.max(tolerance * 2, expectedSec * 0.1)
        : Math.max(tolerance * 3, expectedSec * 0.25);
      issues.push(issue(
        'duration',
        size > blockAbove ? ERROR : WARN,
        `The video is ${fmtSec(size)} ${direction} than the script expects (${fmtSec(actualSec)} vs ${fmtSec(expectedSec)})`,
        { detail: { actualSec: round1(actualSec), expectedSec: round1(expectedSec) } }
      ));
    }
  }

  if (videoSec > 0 && audioSec > 0) {
    const drift = Math.abs(videoSec - audioSec);
    if (drift > Math.max(toleranceSec, 1)) {
      issues.push(issue(
        'duration',
        drift > 5 ? ERROR : WARN,
        `Audio and picture differ in length by ${fmtSec(drift)} (audio ${fmtSec(audioSec)}, video ${fmtSec(videoSec)})`,
        { detail: { audioSec: round1(audioSec), videoSec: round1(videoSec) } }
      ));
    }
  }
  return issues;
}

// ── Captions and subtitles ──────────────────────────────────────────────────

const wordCount = (text) => String(text || '').split(/\s+/).filter(Boolean).length;

/**
 * Are the burned-in captions backed by usable timing?
 *
 * Only scenes that actually show captions (`elements.caption` is set - podcast
 * scenes by default) are checked. A scene without word timings still renders -
 * captions fall back to an even pace - so that is a warning; timings that are
 * malformed, out of order, or stop well short of the narration are what make
 * captions visibly wrong, and those are errors.
 */
function checkCaptions({ timeline }) {
  const issues = [];

  for (const t of timeline) {
    const { scene } = t;
    const captionText = String(scene?.elements?.caption || '').trim();
    if (!captionText) continue; // this scene shows no spoken captions

    const label = `Scene ${t.sceneNumber}`;
    if (!t.narrated) {
      issues.push(issue('captions', WARN, `${label} has a caption but no narration to time it against`, { scene: t.sceneNumber }));
      continue;
    }

    const words = scene.audio?.captionTimestamps ?? scene.elements?.captionTimestamps;
    if (!Array.isArray(words) || words.length === 0) {
      issues.push(issue('captions', WARN, `${label} has no word timing - its captions will run at an even pace instead of following the voice`, { scene: t.sceneNumber }));
      continue;
    }

    const audioSec = Number(scene.audio.duration) || 0;
    const malformed = words.filter((w) => !w || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start);
    if (malformed.length > 0) {
      issues.push(issue('captions', ERROR, `${label} has ${malformed.length} caption word(s) with invalid timing`, { scene: t.sceneNumber }));
      continue;
    }

    const outOfOrder = words.some((w, i) => i > 0 && w.start + 0.05 < words[i - 1].start);
    if (outOfOrder) {
      issues.push(issue('captions', ERROR, `${label} caption words are out of order`, { scene: t.sceneNumber }));
      continue;
    }

    const lastEnd = words[words.length - 1].end;
    if (audioSec > 0 && lastEnd > audioSec + 1) {
      issues.push(issue('captions', ERROR, `${label} captions run ${fmtSec(lastEnd - audioSec)} past the end of its audio`, { scene: t.sceneNumber }));
    } else if (audioSec > 0 && lastEnd < audioSec * 0.6) {
      issues.push(issue('captions', WARN, `${label} captions stop at ${fmtSec(lastEnd)} but the narration lasts ${fmtSec(audioSec)}`, { scene: t.sceneNumber }));
    }

    const expectedWords = wordCount(scene.audio.text);
    if (expectedWords > 0) {
      const ratio = words.length / expectedWords;
      if (ratio < 0.5 || ratio > 1.6) {
        issues.push(issue('captions', WARN, `${label} has ${words.length} timed caption words for ${expectedWords} narrated words`, { scene: t.sceneNumber }));
      }
    }
  }
  return issues;
}

/**
 * Will subtitle cues fit on screen and be readable?
 *
 * Works on the cues the exporter builds (utils/subtitles.buildCues), so what is
 * checked is what a viewer gets. Overflow here is about *time and length*, not
 * pixels: a cue that is too long for the line, shown too briefly to read, or
 * still on screen after the video ended.
 */
function checkSubtitleCues({ cues, totalSec, maxChars, maxCueSec, maxCharsPerSec }) {
  const issues = [];

  // One finding for all of them: a short render pushes every later cue off the end,
  // and the duration check already blocks when that is serious - this only makes
  // sure the subtitle file is not silently wrong.
  const late = totalSec > 0 ? cues.filter((cue) => cue.end > totalSec + 0.5) : [];
  if (late.length > 0) {
    issues.push(issue('subtitle-overflow', WARN, `${late.length} subtitle(s) run past the end of the video (the first at ${fmtSec(late[0].start)}, video ends at ${fmtSec(totalSec)})`, { atSec: round1(late[0].start) }));
  }

  cues.forEach((cue, i) => {
    const length = cue.text.length;
    const duration = cue.end - cue.start;
    const at = round1(cue.start);

    if (length > maxChars) {
      issues.push(issue('subtitle-overflow', WARN, `Subtitle ${i + 1} is ${length} characters, over the ${maxChars}-character line limit`, { atSec: at, detail: { text: cue.text.slice(0, 80) } }));
    }
    if (duration > maxCueSec) {
      issues.push(issue('subtitle-overflow', WARN, `Subtitle ${i + 1} stays on screen for ${fmtSec(duration)}`, { atSec: at }));
    }
    if (duration > 0 && length / duration > maxCharsPerSec) {
      issues.push(issue('subtitle-overflow', WARN, `Subtitle ${i + 1} is too fast to read (${Math.round(length / duration)} characters/second)`, { atSec: at, detail: { text: cue.text.slice(0, 80) } }));
    }
    if (i > 0 && cue.start < cues[i - 1].end - 0.01) {
      issues.push(issue('subtitle-overflow', WARN, `Subtitle ${i + 1} overlaps the one before it`, { atSec: at }));
    }
  });
  return issues;
}

/**
 * Burned-in caption boxes that would not fit the frame.
 *
 * CaptionRenderer shows `maxVisibleWords` words at a time inside `maxWidth` of
 * the frame. The widest such chunk of a scene's words is estimated to wrap to
 * some number of lines; more than `maxLines`, or a block taller than
 * `maxHeightPct` of the frame, is flagged. An estimate (average glyph width is
 * a fraction of the font size) - hence a warning, never an error.
 */
function checkCaptionBox({ timeline, frameWidth, frameHeight, fontSize, maxWidthPct, maxVisibleWords, glyphWidthRatio, lineHeightRatio, maxLines, maxHeightPct }) {
  const issues = [];
  const usable = frameWidth * maxWidthPct;
  const charsPerLine = Math.max(1, Math.floor(usable / (fontSize * glyphWidthRatio)));

  for (const t of timeline) {
    if (!String(t.scene?.elements?.caption || '').trim()) continue;
    const words = String(t.scene?.audio?.text || t.scene.elements.caption).split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const chunk = maxVisibleWords > 0 ? maxVisibleWords : words.length;
    let worstLines = 1;
    let worstText = '';
    for (let i = 0; i < words.length; i += chunk) {
      const text = words.slice(i, i + chunk).join(' ');
      const lines = Math.ceil(text.length / charsPerLine);
      if (lines > worstLines) { worstLines = lines; worstText = text; }
    }

    const blockHeight = worstLines * fontSize * lineHeightRatio;
    if (worstLines > maxLines || blockHeight > frameHeight * maxHeightPct) {
      issues.push(issue('subtitle-overflow', WARN, `Scene ${t.sceneNumber} captions may overflow: a ${chunk === words.length ? 'caption' : `${chunk}-word chunk`} wraps to about ${worstLines} lines`, {
        scene: t.sceneNumber, atSec: round1(t.startSec), detail: { text: worstText.slice(0, 80), estimatedLines: worstLines },
      }));
    }
  }
  return issues;
}

// ── Images ──────────────────────────────────────────────────────────────────

/** Every image URL a scene refers to, once each. */
function sceneImageUrls(scene) {
  const urls = new Set();
  for (const url of [scene?.imageUrl, scene?.elements?.image, scene?.elements?.hostImage]) {
    if (typeof url === 'string' && url.trim()) urls.add(url.trim());
  }
  return [...urls];
}

/**
 * Pictures the finished video depends on. `probeResults` maps each URL to
 * `null` (reachable) or a short problem string, so the network stays outside
 * this function.
 *
 * - a referenced image that cannot be fetched is an error: the render drew
 *   something broken, or nothing, where a picture belongs.
 * - a scene the pipeline deliberately turned into text-only because its image
 *   could not be generated (`storyboard.visual.status === 'degraded'`) is a
 *   warning: the video is fine, but the viewer is not seeing what was planned.
 * - a prompt that never produced an image and was not degraded is an error.
 */
function checkImages({ timeline, probeResults }) {
  const issues = [];

  for (const t of timeline) {
    const { scene } = t;
    const urls = sceneImageUrls(scene);

    for (const url of urls) {
      const problem = probeResults.get(url);
      if (problem) {
        issues.push(issue('images', ERROR, `Scene ${t.sceneNumber}: the image ${problem}`, { scene: t.sceneNumber, atSec: round1(t.startSec), detail: { url } }));
      }
    }

    const visual = scene?.storyboard?.visual;
    if (visual?.status === 'degraded') {
      issues.push(issue('images', WARN, `Scene ${t.sceneNumber} shows text instead of its planned image${visual.reason ? ` (${String(visual.reason).slice(0, 120)})` : ''}`, { scene: t.sceneNumber, atSec: round1(t.startSec) }));
    } else if (urls.length === 0 && String(scene?.imagePrompt || '').trim()) {
      issues.push(issue('images', ERROR, `Scene ${t.sceneNumber} has an image prompt but no image`, { scene: t.sceneNumber, atSec: round1(t.startSec) }));
    }
  }
  return issues;
}

module.exports = {
  ERROR,
  WARN,
  issue,
  toDb,
  measureWindows,
  silentRuns,
  checkAudioSilence,
  measureFrames,
  checkBlackFrames,
  checkDuration,
  checkCaptions,
  checkSubtitleCues,
  checkCaptionBox,
  sceneImageUrls,
  checkImages,
};
