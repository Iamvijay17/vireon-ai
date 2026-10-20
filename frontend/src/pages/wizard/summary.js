import {
  VIDEO_TYPES, LANGUAGES, DURATIONS, SHORTS_DURATIONS, CAPTION_STYLES, FONT_PAIRINGS, QUALITY_PRESETS, RESOLUTIONS,
  aspectOf, isVerticalResolution,
} from "./constants";

export const STEPS = [
  { key: "brief", title: "Brief", description: "Topic, type and length" },
  { key: "voice", title: "Voice & style", description: "Narration, captions, fonts" },
  { key: "output", title: "Output", description: "Format, quality, workflow" },
  { key: "review", title: "Review", description: "Check and start" },
];

export const TOPIC_MIN = 3;
export const TOPIC_MAX = 500;

const labelOf = (options, value, fallback = "—") => options.find((o) => o.value === value)?.label ?? (value || fallback);

/**
 * The rules each step enforces before you can move on - the same rules the
 * server's createVideoSchema applies, so a value that passes here is not
 * rejected there. Returns { field: message }; empty means the step is valid.
 */
export function validateStep(stepKey, values) {
  const errors = {};

  if (stepKey === "brief") {
    const topic = (values.topic || "").trim();
    if (topic.length < TOPIC_MIN) errors.topic = `Describe the topic in at least ${TOPIC_MIN} characters`;
    else if (topic.length > TOPIC_MAX) errors.topic = `Keep the topic under ${TOPIC_MAX} characters`;
    if (!values.type) errors.type = "Choose a video type";
    const durations = values.type === "youtube_shorts" ? SHORTS_DURATIONS : DURATIONS;
    if (!durations.some((d) => d.value === values.duration)) errors.duration = "Choose a duration";
  }

  if (stepKey === "voice" && values.type === "podcast") {
    if (!values.hostVoice) errors.hostVoice = "Choose a host voice";
    if (!values.guestVoice) errors.guestVoice = "Choose a guest voice";
  }

  if (stepKey === "output") {
    if (values.type === "youtube_shorts" && !isVerticalResolution(values.resolution)) {
      errors.resolution = "YouTube Shorts must use a 9:16 resolution";
    }
  }

  return errors;
}

/** Every step's errors at once, keyed by field (the Review step re-checks all of them). */
export function validateAll(values) {
  return STEPS.reduce((acc, step) => ({ ...acc, ...validateStep(step.key, values) }), {});
}

const FIELD_STEP = { topic: 0, type: 0, duration: 0, hostVoice: 1, guestVoice: 1, resolution: 2 };

/** The step a field's error belongs to, so a failed submit can jump back to it. */
export const stepOfField = (field) => FIELD_STEP[field] ?? 0;

const voiceLabel = (voiceOptions, id) => voiceOptions.find((o) => o.value === id)?.label || id || "—";

/**
 * The form as labelled rows grouped by step, for the live summary and the
 * Review step. `voiceOptions` resolves voice ids to the names a person knows.
 */
export function buildSummary(values, voiceOptions = []) {
  const isPodcast = values.type === "podcast";
  const style = values.voiceStyle ? values.voiceStyle.charAt(0).toUpperCase() + values.voiceStyle.slice(1) : "Auto";

  return [
    {
      key: "brief",
      title: "Brief",
      step: 0,
      rows: [
        { label: "Topic", value: values.topic?.trim() || "—", long: true },
        { label: "Type", value: labelOf(VIDEO_TYPES, values.type) },
        { label: "Length", value: values.duration ? `${values.duration} min` : "—" },
        { label: "Language", value: labelOf(LANGUAGES, values.language) },
      ],
    },
    {
      key: "voice",
      title: "Voice & style",
      step: 1,
      rows: [
        ...(isPodcast
          ? [
              { label: "Host", value: `${voiceLabel(voiceOptions, values.hostVoice)}${values.hostName ? ` (${values.hostName})` : ""}` },
              { label: "Guest", value: `${voiceLabel(voiceOptions, values.guestVoice)}${values.guestName ? ` (${values.guestName})` : ""}` },
            ]
          : [
              { label: "Voice", value: voiceLabel(voiceOptions, values.voice) },
              { label: "Narration style", value: style },
            ]),
        { label: "Captions", value: isPodcast ? "Podcast highlight" : labelOf(CAPTION_STYLES, values.captionAnimation) },
        { label: "Fonts", value: labelOf(FONT_PAIRINGS, values.fontPairing) },
      ],
    },
    {
      key: "output",
      title: "Output",
      step: 2,
      rows: [
        { label: "Format", value: `${aspectOf(values.resolution)} · ${labelOf(RESOLUTIONS, values.resolution)}` },
        { label: "Render quality", value: labelOf(QUALITY_PRESETS, values.quality) },
        { label: "Workflow", value: workflowLabel(values) },
        { label: "Narration model", value: values.fastAudio ? "Fast (0.6B)" : "Standard (1.7B)" },
      ],
    },
  ];
}

export function workflowLabel(values) {
  if (!values.fastGeneration) return "Manual - you trigger each step";
  return values.autoApprove ? "Fully automatic" : "Automatic after you approve the script";
}
