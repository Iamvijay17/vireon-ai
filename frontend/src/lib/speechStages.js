// Speech-timing progress, derived from the job's event stream.
//
// The backend emits `speechStage` events named tts:start ... render:complete
// (backend/src/services/audio/pipeline/speech/events.js). Normal users see four
// plain steps - never the raw event names or counters. Reading the stored +
// live event list (rather than keeping separate socket state) means a page
// opened mid-job shows the right steps too.

export const SPEECH_STEPS = [
  { key: "voice", start: "tts:start", done: "tts:complete", active: "Generating voice...", finished: "Voice generated" },
  { key: "alignment", start: "alignment:start", done: "alignment:complete", active: "Analyzing speech timing...", finished: "Speech timing analyzed" },
  { key: "timeline", start: "alignment:complete", done: "timeline:complete", active: "Building visual timeline...", finished: "Timeline ready" },
  { key: "render", start: "render:start", done: "render:complete", active: "Rendering video...", finished: "Video rendered" },
];

/** The most recent payload of each speech stage event, by event name. */
export function latestSpeechEvents(events = []) {
  const seen = {};
  for (const e of events) {
    if (e?.type !== "speechStage") continue;
    const name = e.data?.event;
    if (name) seen[name] = e.data;
  }
  return seen;
}

/**
 * Rows for the checklist: [{ key, label, state: 'done' | 'active' | 'pending', detail }].
 * Returns [] until the first speech event arrives (so jobs without speech
 * alignment show nothing).
 */
export function describeSpeechStages(events = []) {
  const seen = latestSpeechEvents(events);
  if (Object.keys(seen).length === 0) return [];

  return SPEECH_STEPS.map((step) => {
    const done = Boolean(seen[step.done]);
    const started = Boolean(seen[step.start]);
    const state = done ? "done" : started ? "active" : "pending";
    const progress = seen["alignment:progress"];
    const detail =
      step.key === "alignment" && state === "active" && progress?.current && progress?.total ? `scene ${progress.current} of ${progress.total}` : null;
    return { key: step.key, label: done ? step.finished : step.active, state, detail };
  });
}

/** Peak bars (0..1) from decoded samples: the max |sample| in each of `bins` equal slices. */
export function peaksFromSamples(samples, bins) {
  if (!samples?.length || bins <= 0) return [];
  const size = samples.length / bins;
  const peaks = new Array(bins).fill(0);
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((b + 1) * size)));
    let max = 0;
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(samples[i]));
    peaks[b] = max;
  }
  const top = Math.max(...peaks, 1e-6);
  return peaks.map((p) => p / top);
}

export const formatSeconds = (s) => (Number.isFinite(s) ? `${s.toFixed(2)}s` : "–");
