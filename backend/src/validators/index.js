const { z } = require('zod');
const { SchemaValidationError } = require('../utils/errors');
const {
  VIDEO_TYPES,
  RESOLUTIONS,
  QUALITY_PRESETS,
  LANGUAGES,
  STANDALONE_VIDEO_DURATIONS,
  SHORTS_VIDEO_DURATIONS,
  FONT_PAIRINGS,
  CAPTION_STYLES,
  getAspectRatioForResolution,
} = require('../constants');
const { ID_PATTERN, PREFIXES, idPatternFor } = require('../utils/id');
const { STYLES: VOICE_STYLES } = require('../services/audio/pipeline/schemas');
const { STYLE_KEYS: IMAGE_STYLE_KEYS, MAX_TEXT_LINES: MAX_IMAGE_TEXT_LINES } = require('../services/image/styles');

const createVideoSchema = z
  .object({
    topic: z.string().min(3).max(500).trim(),
    type: z.enum(VIDEO_TYPES),
    language: z.enum(LANGUAGES).optional().default('english'),
    // Requested video length in minutes - the worker derives an exact scene
    // count from this (see videoWorker.js). Valid range depends on `type`
    // (see superRefine below): youtube_shorts uses SHORTS_VIDEO_DURATIONS
    // (YouTube caps Shorts at 3 minutes), every other type uses
    // STANDALONE_VIDEO_DURATIONS.
    duration: z.number().optional().default(5),
    // Accepts legacy keys ("female-1"), "custom:<Speaker>", or "clone:<file>.wav"
    // - see AudioService.resolveVoice for how this is interpreted.
    voice: z.string().min(1).max(200).optional().default('female-1'),
    // Podcast type only: separate voice per speaker (same format as `voice`).
    // Non-podcast submissions send "" (the wizard's default), so this can't
    // require min(1) - the superRefine below enforces it for podcast only.
    hostVoice: z.string().max(200).optional(),
    guestVoice: z.string().max(200).optional(),
    // Optional display names for the podcast host/guest - falls back to
    // "Host"/"Guest" server-side when left blank (see ScriptParserService).
    hostName: z.string().max(80).trim().optional(),
    guestName: z.string().max(80).trim().optional(),
    // Aspect ratio isn't independently selectable - it's fully implied by
    // resolution (see getAspectRatioForResolution), derived server-side.
    // youtube_shorts is further restricted to vertical (9:16) resolutions
    // only - see superRefine below.
    resolution: z.enum(RESOLUTIONS).optional().default('1920x1080'),
    // Render quality preset - see constants.QUALITY_PRESETS /
    // config.remotion.qualityCrf. 'standard' matches the encode quality
    // every job used before this setting existed.
    quality: z.enum(QUALITY_PRESETS).optional().default('standard'),
    // Curated title/body Google Font pairing - see backend/remotion/src/fonts.js.
    // 'default' keeps the legacy system-font look.
    fontPairing: z.enum(FONT_PAIRINGS).optional().default('default'),
    // Word-by-word caption animation for content scenes - see
    // backend/remotion/src/captions/captionAnimations.js's registry.
    captionAnimation: z.enum(CAPTION_STYLES).optional().default('fadeInUp'),
    // true: current auto flow (audio/images/render run automatically after
    // script approval). false: manual mode - audio and render each need an
    // explicit trigger, like the course-video pipeline.
    fastGeneration: z.boolean().optional().default(true),
    // With fastGeneration: also skip the script-approval pause (see VideoJob.autoApprove).
    autoApprove: z.boolean().optional().default(false),
    // Unrelated to fastGeneration above: uses the smaller/faster Qwen3-TTS
    // 0.6B model for this job's narration instead of the default 1.7B -
    // trades some audio quality for speed.
    fastAudio: z.boolean().optional().default(false),
    // Narration direction for the segmented TTS pipeline (see
    // services/audio/pipeline). Both optional: omitted means "choose from the
    // video type". voiceProfile is a profile id from GET /api/voices.
    // The wizard sends '' for "Auto"; treat it as not provided.
    voiceProfile: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(64).optional()),
    voiceStyle: z.preprocess((v) => (v === '' ? undefined : v), z.enum(VOICE_STYLES).optional()),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'podcast') {
      if (!data.hostVoice) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hostVoice'], message: 'Host voice is required for podcast videos' });
      }
      if (!data.guestVoice) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guestVoice'], message: 'Guest voice is required for podcast videos' });
      }
    }

    if (data.type === 'youtube_shorts') {
      if (!SHORTS_VIDEO_DURATIONS.includes(data.duration)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration'], message: `YouTube Shorts duration must be one of: ${SHORTS_VIDEO_DURATIONS.join(', ')}` });
      }
      if (getAspectRatioForResolution(data.resolution) !== '9:16') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolution'], message: 'YouTube Shorts must use a vertical resolution' });
      }
    } else if (!STANDALONE_VIDEO_DURATIONS.includes(data.duration)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration'], message: `Duration must be one of: ${STANDALONE_VIDEO_DURATIONS.join(', ')}` });
    }
  });

// Editing an existing job - same field shapes as createVideoSchema but all
// optional (only changed fields need to be sent), and `type` isn't editable
// (duration/resolution's valid ranges are keyed off it - VideoService.update
// re-validates duration/resolution against the job's existing type).
const updateVideoJobSchema = z
  .object({
    topic: z.string().min(3).max(500).trim().optional(),
    language: z.enum(LANGUAGES).optional(),
    duration: z.number().optional(),
    voice: z.string().min(1).max(200).optional(),
    hostVoice: z.string().max(200).optional(),
    guestVoice: z.string().max(200).optional(),
    hostName: z.string().max(80).trim().optional(),
    guestName: z.string().max(80).trim().optional(),
    resolution: z.enum(RESOLUTIONS).optional(),
    quality: z.enum(QUALITY_PRESETS).optional(),
    fontPairing: z.enum(FONT_PAIRINGS).optional(),
    captionAnimation: z.enum(CAPTION_STYLES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields provided to update' });

// Optional replacement prompt when re-rolling one scene's image.
const regenerateImageSchema = z.object({
  prompt: z.string().trim().max(400).optional(),
});

// Id patterns come from utils/id.js and accept both the current lowercase ids
// (job-r8v3k1mx) and legacy uppercase ones (job-R8V3K1MX) still in the DB.
const JOB_ID_PATTERN = idPatternFor(PREFIXES.job);

const jobIdSchema = z.object({
  id: z.string().regex(JOB_ID_PATTERN, 'Invalid video job id'),
});

// Matches any entity id produced by utils/id.js (course, course-video,
// scene, ...) - used for course-video routes, which aren't scoped to a
// single prefix the way jobIdSchema is to "job-".
const idSchema = z.object({
  id: z.string().regex(ID_PATTERN, 'Invalid id'),
});

const idArraySchema = z.object({
  videoIds: z.array(z.string().regex(ID_PATTERN, 'Invalid id')).min(1, 'videoIds must be a non-empty array'),
});

const createAudioSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000, 'Text must be 5000 characters or fewer').trim(),
  // Same voice string format as video jobs - "custom:<Speaker>",
  // "clone:<file>.wav", or "design:<description>" (see AudioService.resolveVoice).
  voice: z.string().min(1, 'Voice is required').max(260),
  // Free-text delivery/emotion note (e.g. "cheerful and energetic") passed
  // to the TTS model's instruct prompt - see AudioService.generateStandaloneAudio.
  emotion: z.string().max(200).trim().optional().default(''),
  // When true, uses the smaller/faster Qwen3-TTS 0.6B model instead of the
  // default 1.7B - trades some quality for speed.
  fastMode: z.boolean().optional().default(false),
});

const audioIdSchema = z.object({
  id: z.string().regex(idPatternFor(PREFIXES.audio), 'Invalid audio generation id'),
});

const IMAGE_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5'];
const IMAGE_RESOLUTIONS = ['1k', '2k', '4k'];

// The service derives seeds as 48-bit integers (see ImageGenerationService.seedFor).
const MAX_IMAGE_SEED = 2 ** 48 - 1;

const createImageSchema = z
  .object({
    prompt: z.string().min(3, 'Describe the image you want (at least 3 characters)').max(1000, 'Prompt must be 1000 characters or fewer').trim(),
    aspectRatio: z.enum(IMAGE_ASPECT_RATIOS).optional().default('16:9'),
    // How many sampling steps: 'fast' fewer, 'high' more (see imageController.stepsFor).
    quality: z.enum(['fast', 'standard', 'high']).optional().default('standard'),
    // Size of the saved picture: 1k is what the model samples, 2k/4k enlarge it (see ImageGenerationService.outputSizeFor).
    resolution: z.enum(IMAGE_RESOLUTIONS).optional().default('1k'),
    // Appended to the prompt - see services/image/styles.js.
    style: z.enum(IMAGE_STYLE_KEYS).optional().default('none'),
    // Things to leave out. Only has an effect with guidance above 1 (see config.imageGen.guidedCfg),
    // so a non-empty value switches the render to that slower guided mode.
    negative: z.string().max(500, 'Avoid text must be 500 characters or fewer').trim().optional().default(''),
    // Exact words to draw in the picture, one per line (max 3, see services/image/styles.js). Empty = no text at all.
    text: z
      .string()
      .max(240, 'Text must be 240 characters or fewer')
      .refine((v) => v.split(/\r?\n/).filter((l) => l.trim()).length <= MAX_IMAGE_TEXT_LINES, `At most ${MAX_IMAGE_TEXT_LINES} lines of text`)
      .refine((v) => v.split(/\r?\n/).every((l) => l.length <= 80), 'Each text line must be 80 characters or fewer')
      .optional()
      .default(''),
    // How many pictures to make from this one prompt (each a different seed).
    count: z.number().int().min(1, 'Make at least 1 image').max(4, 'At most 4 images at a time').optional().default(1),
    // Pin the seed to reproduce a picture or refine its prompt. Omitted/null = random.
    seed: z.number().int().min(0).max(MAX_IMAGE_SEED).nullable().optional(),
  })
  .refine((d) => d.seed == null || d.count === 1, {
    message: 'A fixed seed makes every image identical - set Images to 1',
    path: ['count'],
  });

const imageIdSchema = z.object({
  id: z.string().regex(idPatternFor(PREFIXES.image), 'Invalid image generation id'),
});

const dialogueSpeakerSchema = z.object({
  name: z.string().min(1).max(40).trim(),
  voice: z.string().min(1).max(260),
});

const createDialogueAudioSchema = z.object({
  script: z.string().min(1, 'Script is required').max(20000, 'Script must be 20000 characters or fewer'),
  speakers: z
    .array(dialogueSpeakerSchema)
    .min(2, 'At least 2 speakers are required')
    .max(6, 'At most 6 speakers are supported')
    .refine(
      (speakers) => new Set(speakers.map((s) => s.name.toLowerCase())).size === speakers.length,
      { message: 'Speaker names must be unique' },
    ),
  // When true, uses the smaller/faster Qwen3-TTS 0.6B model instead of the
  // default 1.7B - trades some quality for speed.
  fastMode: z.boolean().optional().default(false),
});

const jobIdArraySchema = z.object({
  jobIds: z.array(z.string().regex(JOB_ID_PATTERN, 'Invalid video job id')).min(1, 'jobIds must be a non-empty array'),
});

const validate = (schema) => (data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw new SchemaValidationError(errors);
  }
  return result.data;
};

module.exports = {
  createVideoSchema,
  updateVideoJobSchema,
  regenerateImageSchema,
  jobIdSchema,
  idSchema,
  idArraySchema,
  jobIdArraySchema,
  createAudioSchema,
  audioIdSchema,
  createDialogueAudioSchema,
  createImageSchema,
  imageIdSchema,
  IMAGE_ASPECT_RATIOS,
  validate,
};
