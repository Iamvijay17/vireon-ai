const { z } = require('zod');
const {
  VIDEO_TYPES,
  RESOLUTIONS,
  LANGUAGES,
  STANDALONE_VIDEO_DURATIONS,
  SHORTS_VIDEO_DURATIONS,
  getAspectRatioForResolution,
} = require('../constants');
const { ID_PATTERN } = require('../utils/id');

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
    // true: current auto flow (audio/images/render run automatically after
    // script approval). false: manual mode - audio and render each need an
    // explicit trigger, like the course-video pipeline.
    fastGeneration: z.boolean().optional().default(true),
    // Unrelated to fastGeneration above: uses the smaller/faster Qwen3-TTS
    // 0.6B model for this job's narration instead of the default 1.7B -
    // trades some audio quality for speed.
    fastAudio: z.boolean().optional().default(false),
    // Optional talking-head overlay source photo, sent as a base64 data URI
    // (e.g. "data:image/jpeg;base64,...") - the codebase is JSON-only
    // everywhere else, so this avoids introducing a separate multipart
    // upload endpoint. Decoded to disk in VideoService.create.
    avatarImage: z.string().startsWith('data:image/').max(10_000_000).optional(),
    avatarPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.avatarPosition && !data.avatarImage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['avatarImage'], message: 'avatarImage is required when avatarPosition is set' });
    }
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
    avatarImage: z.string().startsWith('data:image/').max(10_000_000).nullable().optional(),
    avatarPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields provided to update' });

const jobIdSchema = z.object({
  id: z.string().regex(/^job-[0-9A-Z]{8}$/, 'Invalid video job id'),
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
  id: z.string().regex(/^aud-[0-9A-Z]{8}$/, 'Invalid audio generation id'),
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
  jobIds: z.array(z.string().regex(/^job-[0-9A-Z]{8}$/, 'Invalid video job id')).min(1, 'jobIds must be a non-empty array'),
});

const validate = (schema) => (data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw { status: 400, errors };
  }
  return result.data;
};

module.exports = {
  createVideoSchema,
  updateVideoJobSchema,
  jobIdSchema,
  idSchema,
  idArraySchema,
  jobIdArraySchema,
  createAudioSchema,
  audioIdSchema,
  createDialogueAudioSchema,
  validate,
};
