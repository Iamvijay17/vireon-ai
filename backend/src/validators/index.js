const { z } = require('zod');
const {
  VIDEO_TYPES,
  RESOLUTIONS,
  LANGUAGES,
  STANDALONE_VIDEO_DURATIONS,
} = require('../constants');

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createVideoSchema = z
  .object({
    topic: z.string().min(3).max(500).trim(),
    type: z.enum(VIDEO_TYPES),
    language: z.enum(LANGUAGES).optional().default('english'),
    // Requested video length in minutes - the worker derives an exact scene
    // count from this (see videoWorker.js).
    duration: z
      .number()
      .refine((v) => STANDALONE_VIDEO_DURATIONS.includes(v), {
        message: `Duration must be one of: ${STANDALONE_VIDEO_DURATIONS.join(', ')}`,
      })
      .optional()
      .default(5),
    // Accepts legacy keys ("female-1"), "custom:<Speaker>", or "clone:<file>.wav"
    // - see AudioService.resolveVoice for how this is interpreted.
    voice: z.string().min(1).max(200).optional().default('female-1'),
    // Podcast type only: separate voice per speaker (same format as `voice`).
    // Non-podcast submissions send "" (the wizard's default), so this can't
    // require min(1) - the superRefine below enforces it for podcast only.
    hostVoice: z.string().max(200).optional(),
    guestVoice: z.string().max(200).optional(),
    // Aspect ratio isn't independently selectable - it's fully implied by
    // resolution (see getAspectRatioForResolution), derived server-side.
    resolution: z.enum(RESOLUTIONS).optional().default('1920x1080'),
    // true: current auto flow (audio/images/render run automatically after
    // script approval). false: manual mode - audio and render each need an
    // explicit trigger, like the course-video pipeline.
    fastGeneration: z.boolean().optional().default(true),
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
  });

const jobIdSchema = z.object({
  id: z.string().regex(/^job-[0-9A-Z]{8}$/, 'Invalid video job id'),
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
  registerSchema,
  loginSchema,
  createVideoSchema,
  jobIdSchema,
  validate,
};
