/**
 * Subtitle export - turns a script's scenes into SRT / WebVTT.
 *
 * Pure: scenes in, text out. Cue times line up with the render because scene
 * starts are laid out exactly as VideoComposition does it (frame-rounded
 * durations at 30 fps, back to back; the crossfade overlap only extends the
 * outgoing scene, it never shifts the next scene's start).
 *
 * Each scene's words come from the faster-whisper alignment
 * (`audio.captionTimestamps`, seconds from the scene's audio start). A scene
 * without alignment gets its narration spread evenly over the audio length -
 * the same steady-pace fallback the on-screen captions use.
 */

const FPS = 30;
const MAX_WORDS_PER_CUE = 8;
const MAX_CHARS_PER_CUE = 42;
const MAX_GAP_SECONDS = 0.8;
const MIN_CUE_SECONDS = 0.4;
const SENTENCE_END = /[.!?…]["')\]]*$/;

const sceneSeconds = (scene) => Math.round((Number(scene?.duration) || 8) * FPS) / FPS;

/** Words for one scene as `{ text, start, end }`, seconds from the scene start. */
function sceneWords(scene) {
  const audio = scene?.audio || {};
  const aligned = Array.isArray(audio.captionTimestamps) ? audio.captionTimestamps : [];
  const usable = aligned.filter((w) => w && String(w.word ?? '').trim() && Number.isFinite(w.start) && Number.isFinite(w.end));
  if (usable.length > 0) {
    return usable.map((w) => ({ text: String(w.word).trim(), start: w.start, end: Math.max(w.end, w.start) }));
  }

  const tokens = String(audio.text || '').split(/\s+/).filter(Boolean);
  const length = Number(audio.duration) || 0;
  if (tokens.length === 0 || length <= 0) return [];
  const step = length / tokens.length;
  return tokens.map((text, i) => ({ text, start: i * step, end: (i + 1) * step }));
}

/** Groups a scene's words into readable cues (`{ start, end, text }`, scene-relative seconds). */
function groupWords(words) {
  const cues = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
    });
    current = [];
  };

  for (const word of words) {
    const previous = current[current.length - 1];
    const chars = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
    if (previous && (current.length >= MAX_WORDS_PER_CUE || chars > MAX_CHARS_PER_CUE || word.start - previous.end > MAX_GAP_SECONDS)) {
      flush();
    }
    current.push(word);
    if (SENTENCE_END.test(word.text)) flush();
  }
  flush();
  return cues;
}

/**
 * All cues for a script, in video time. Overlaps are trimmed so one cue never
 * covers the next, and very short cues are held for MIN_CUE_SECONDS when
 * there is room.
 */
function buildCues(scenes) {
  const cues = [];
  let sceneStart = 0;
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const length = sceneSeconds(scene);
    for (const cue of groupWords(sceneWords(scene))) {
      const start = sceneStart + Math.min(cue.start, length);
      const end = sceneStart + Math.min(cue.end, length);
      if (end > start) cues.push({ start, end, text: cue.text });
    }
    sceneStart += length;
  }

  for (let i = 0; i < cues.length; i++) {
    const nextStart = i + 1 < cues.length ? cues[i + 1].start : Infinity;
    if (cues[i].end - cues[i].start < MIN_CUE_SECONDS) {
      cues[i].end = Math.min(cues[i].start + MIN_CUE_SECONDS, nextStart);
    }
    if (cues[i].end > nextStart) cues[i].end = nextStart;
  }
  return cues.filter((cue) => cue.end > cue.start);
}

const pad = (n, width) => String(n).padStart(width, '0');

function timestamp(seconds, separator) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  return `${pad(Math.floor(totalSeconds / 3600), 2)}:${pad(Math.floor(totalSeconds / 60) % 60, 2)}:${pad(totalSeconds % 60, 2)}${separator}${pad(ms, 3)}`;
}

// A blank line ends a cue in both formats, and "-->" inside text would confuse VTT parsers.
const cueText = (text) => String(text).replace(/\r?\n+/g, ' ').replace(/-->/g, '->').trim();

function toSrt(cues) {
  return cues
    .map((cue, i) => `${i + 1}\n${timestamp(cue.start, ',')} --> ${timestamp(cue.end, ',')}\n${cueText(cue.text)}\n`)
    .join('\n');
}

function toVtt(cues) {
  const body = cues
    .map((cue) => `${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cueText(cue.text)}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

/** @param {'srt'|'vtt'} format */
function buildSubtitles(scenes, format = 'srt') {
  const cues = buildCues(scenes);
  return { cues: cues.length, text: format === 'vtt' ? toVtt(cues) : toSrt(cues) };
}

module.exports = { buildCues, buildSubtitles, toSrt, toVtt, timestamp, sceneWords, groupWords };
