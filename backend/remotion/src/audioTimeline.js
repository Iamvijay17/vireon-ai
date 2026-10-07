/**
 * Voice-driven timing for templates.
 *
 * A scene's `audio.timeline` (when the narration came from the segmented TTS
 * pipeline) lists where each spoken segment sits in the scene's audio:
 *   [{ segmentId, text, startMs, endMs, durationMs }]
 * Templates can use it to reveal text, trigger animations or add emphasis in
 * step with the voice instead of on a fixed clock. Every helper is pure and
 * returns a neutral value when there is no timeline (older scenes), so a
 * template can call them unconditionally.
 */

const msAt = (frame, fps) => (frame / fps) * 1000;

/** The segment being spoken at `frame` (scene-relative), or null in a pause / without a timeline. */
export const getActiveSegment = (timeline, frame, fps) => {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  const ms = msAt(frame, fps);
  return timeline.find((s) => ms >= s.startMs && ms < s.endMs) || null;
};

/** Index of the most recent segment that has started by `frame` (-1 before the first). */
export const getSegmentIndexAt = (timeline, frame, fps) => {
  if (!Array.isArray(timeline) || timeline.length === 0) return -1;
  const ms = msAt(frame, fps);
  let index = -1;
  timeline.forEach((s, i) => {
    if (ms >= s.startMs) index = i;
  });
  return index;
};

/** 0..1 progress through the segment being spoken (0 outside speech). */
export const getSegmentProgress = (timeline, frame, fps) => {
  const seg = getActiveSegment(timeline, frame, fps);
  if (!seg || seg.durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, (msAt(frame, fps) - seg.startMs) / seg.durationMs));
};

/** Frame at which a segment starts - for `<Sequence from>` style reveals. */
export const segmentStartFrame = (segment, fps) => Math.round((segment.startMs / 1000) * fps);

/** True while the narrator is speaking (false in pauses, and without a timeline). */
export const isSpeaking = (timeline, frame, fps) => getActiveSegment(timeline, frame, fps) !== null;
