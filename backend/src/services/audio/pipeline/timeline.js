const config = require('../../../config');

/**
 * Timing metadata derived from an assembled scene: what Remotion (captions,
 * reveals, transitions, emphasis) and the audio mixer read, so visuals follow
 * the voice instead of being laid out independently of it.
 *
 *   VOICE -> TIMELINE -> VISUALS
 */

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Spread a segment's caption words evenly over its speech bounds. Used only
 * for a segment the aligner could not time, and every such word is flagged
 * `estimated: true` so nothing downstream mistakes it for a measurement.
 */
function estimateWords(seg) {
  const tokens = seg.internal?.wordMap || [];
  if (tokens.length === 0) return [];
  const start = seg.startMs / 1000;
  const span = (seg.endMs - seg.startMs) / 1000;
  const total = tokens.reduce((sum, t) => sum + Math.max(t.text.length, 1), 0);
  let acc = 0;
  return tokens.map((t) => {
    const from = start + span * (acc / total);
    acc += Math.max(t.text.length, 1);
    return { word: t.text, start: round3(from), end: round3(start + span * (acc / total)), confidence: null, estimated: true };
  });
}

/**
 * @param {object[]} segments assembled segments (startMs/endMs set), in order
 * @param {Map<string, object[]>} wordsBySegment aligned caption words per segment id, seconds relative to the clip start
 * @returns {{ captionTimestamps: object[]|null, speechRanges: {segmentId:string, startMs:number, endMs:number}[] }}
 *   captionTimestamps: one entry per caption word of the whole scene (seconds
 *   from the scene start), or null when nothing could be aligned - the
 *   renderer then uses its own estimated pacing instead of a made-up timeline.
 */
function buildSceneTimeline(segments, wordsBySegment) {
  const speechRanges = segments.map((s) => ({ segmentId: s.id, startMs: s.startMs, endMs: s.endMs }));

  if (!segments.some((s) => wordsBySegment.has(s.id))) return { captionTimestamps: null, speechRanges };

  const captionTimestamps = [];
  for (const seg of segments) {
    const aligned = wordsBySegment.get(seg.id);
    if (aligned) {
      const offset = seg.startMs / 1000;
      const limit = seg.endMs / 1000;
      for (const w of aligned) {
        // A word can never sit outside its own clip; clamping keeps the scene
        // timeline monotonic even if an aligner overshoots the clip end.
        const start = Math.min(offset + w.start, limit);
        captionTimestamps.push({ ...w, start: round3(start), end: round3(Math.min(Math.max(offset + w.end, start), limit)) });
      }
    } else {
      captionTimestamps.push(...estimateWords(seg));
    }
  }
  return { captionTimestamps, speechRanges };
}

/**
 * Volume envelope for background music: dips while narration speaks and
 * recovers after. Returned as keyframes `{ ms, volume }` (volume 1 = full,
 * linear interpolation between keyframes) that Remotion's <Audio volume={fn}>
 * can sample with `volumeAt`.
 *
 * Narration gaps shorter than attack+release are bridged, so music does not
 * pump up and down between sentences.
 *
 * @param {{startMs: number, endMs: number}[]} ranges speech ranges in the same time base as the music
 */
function buildDuckingEnvelope(ranges, { duckAmount, attackMs, releaseMs } = config.audio.ducking) {
  const ducked = 1 - Math.min(1, Math.max(0, duckAmount));
  const sorted = [...ranges].filter((r) => r.endMs > r.startMs).sort((a, b) => a.startMs - b.startMs);

  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.startMs - last.endMs < attackMs + releaseMs) last.endMs = Math.max(last.endMs, r.endMs);
    else merged.push({ startMs: r.startMs, endMs: r.endMs });
  }

  const keys = [{ ms: 0, volume: 1 }];
  for (const r of merged) {
    keys.push({ ms: Math.max(r.startMs - attackMs, 0), volume: 1 });
    keys.push({ ms: r.startMs, volume: ducked });
    keys.push({ ms: r.endMs, volume: ducked });
    keys.push({ ms: r.endMs + releaseMs, volume: 1 });
  }

  // Collapse same-time keyframes (speech starting at 0) keeping the later one.
  const out = [];
  for (const k of keys) {
    const last = out[out.length - 1];
    if (last && last.ms === k.ms) last.volume = k.volume;
    else out.push({ ...k });
  }
  return out;
}

/** Linear interpolation of an envelope at `ms`. */
function volumeAt(envelope, ms) {
  if (envelope.length === 0) return 1;
  if (ms <= envelope[0].ms) return envelope[0].volume;
  for (let i = 1; i < envelope.length; i++) {
    if (ms <= envelope[i].ms) {
      const a = envelope[i - 1];
      const b = envelope[i];
      return a.volume + ((b.volume - a.volume) * (ms - a.ms)) / (b.ms - a.ms);
    }
  }
  return envelope[envelope.length - 1].volume;
}

/**
 * The slice of a scene's persisted segments that the renderer needs:
 * `[{ segmentId, text, startMs, endMs, durationMs }]`, or null when the scene
 * has no segment timeline (legacy audio). Shared by the legacy render-props
 * builder and the IR compiler so the two stay identical.
 */
function toRenderTimeline(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const timed = segments.filter((s) => s && Number.isFinite(s.startMs) && Number.isFinite(s.endMs));
  if (timed.length === 0 || timed.length !== segments.length) return null;
  return timed.map((s) => ({
    segmentId: s.id,
    text: s.sourceText,
    startMs: s.startMs,
    endMs: s.endMs,
    durationMs: s.durationMs ?? s.endMs - s.startMs,
  }));
}

module.exports = { toRenderTimeline, buildSceneTimeline, buildDuckingEnvelope, volumeAt, estimateWords };
