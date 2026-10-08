import {
  findPhrase,
  findWord,
  getSpeechBounds,
  normalizeSpeechTimeline,
} from './timeline';

/**
 * Speech-aware scene timing: the Motion Controller between the speech
 * timeline and the existing Motion Design System.
 *
 *   Speech Timeline -> resolveSpeechTrigger -> applySpeechTimingToPlan
 *                                           -> existing motion components (engine/motion)
 *
 * A scene opts in with a config such as
 *   { timingMode: 'speech', trigger: 'phrase', phrase: 'artificial intelligence', animation: 'scaleIn' }
 * Any other timingMode ('fixed' | 'duration' | 'manual') - or no config - is
 * left completely alone, so existing scenes render exactly as before. If the
 * trigger cannot be found in the speech, the scene's own timing is kept (or
 * `fallbackDelayFrames` is used when given): speech timing never hides content
 * on its own.
 */

/**
 * Resolves a scene's speech timing config to a moment in the audio.
 *
 * @returns {{ source: 'speech'|'fallback'|'none', time: number|null, frames: number|null, matched: string|null }}
 *   source 'speech'   `time` (seconds) was found in the narration
 *   source 'fallback' the trigger was not found; `frames` is the configured fallback delay
 *   source 'none'     leave the scene's own timing untouched
 */
export const resolveSpeechTrigger = (timeline, config) => {
  const none = { source: 'none', time: null, frames: null, matched: null };
  if (!config || config.timingMode !== 'speech') return none;

  const tl = normalizeSpeechTimeline(timeline);
  const offset = Number.isFinite(config.offset) ? config.offset : 0;
  let time = null;
  let matched = null;

  switch (config.trigger) {
    case 'phrase': {
      const hit = tl && config.phrase ? findPhrase(tl, config.phrase) : null;
      if (hit) { time = hit.start; matched = config.phrase; }
      break;
    }
    case 'word': {
      const hit = tl && (config.word || config.phrase) ? findWord(tl, config.word || config.phrase) : null;
      if (hit) { time = hit.start; matched = config.word || config.phrase; }
      break;
    }
    case 'segment': {
      const seg = tl?.segments[config.segment ?? 0];
      if (seg) { time = seg.start; matched = seg.segmentId; }
      break;
    }
    case 'segmentEnd': {
      const seg = tl?.segments[config.segment ?? 0];
      if (seg) { time = seg.end; matched = seg.segmentId; }
      break;
    }
    case 'pause': {
      const pause = tl?.pauses[config.pause ?? 0];
      if (pause) { time = pause.start; matched = pause.pauseId; }
      break;
    }
    case 'speechStart': {
      const bounds = tl && getSpeechBounds(tl);
      if (bounds) time = bounds.start;
      break;
    }
    case 'speechEnd': {
      const bounds = tl && getSpeechBounds(tl);
      if (bounds) time = bounds.end;
      break;
    }
    case 'time':
      // An explicit manual cue - needs no speech at all.
      if (Number.isFinite(config.time)) time = config.time;
      break;
    default:
      break;
  }

  if (time !== null) return { source: 'speech', time: Math.max(0, time + offset), frames: null, matched };
  if (Number.isFinite(config.fallbackDelayFrames)) return { source: 'fallback', time: null, frames: config.fallbackDelayFrames, matched: null };
  return none;
};

/** The frame a resolved trigger fires on, or null to keep the scene's own timing. */
export const triggerFrame = (resolved, fps) => {
  if (resolved.source === 'speech') return Math.round(resolved.time * fps);
  if (resolved.source === 'fallback') return resolved.frames;
  return null;
};

/**
 * Re-times a choreographed motion plan ({ [slotId]: { type, delay, duration } },
 * see engine/choreograph.js) so the targeted slots enter on the speech cue,
 * using the animation the config names (an id from the Motion Design System).
 * Slots keep their relative stagger: the first targeted slot enters on the cue
 * and later ones follow at their original spacing.
 *
 * Returns the original plan object when nothing applies.
 */
export const applySpeechTimingToPlan = (motionPlan, slots, config, timeline, fps) => {
  const resolved = resolveSpeechTrigger(timeline, config);
  const frame = triggerFrame(resolved, fps);
  if (frame === null) return motionPlan;

  const target = config.target || 'title';
  const targeted = slots.filter((s) => motionPlan[s.id] && (target === 'all' || s.role === target));
  if (targeted.length === 0) return motionPlan;

  const baseDelay = Math.min(...targeted.map((s) => motionPlan[s.id].delay));
  const next = { ...motionPlan };
  for (const slot of targeted) {
    const spec = motionPlan[slot.id];
    next[slot.id] = {
      ...spec,
      ...(config.animation ? { type: config.animation } : {}),
      delay: frame + (spec.delay - baseDelay),
    };
  }
  return next;
};
