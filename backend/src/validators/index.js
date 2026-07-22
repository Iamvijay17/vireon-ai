const { z } = require('zod');
const {
  VIDEO_TYPES,
  RESOLUTIONS,
  ASPECT_RATIOS,
  LANGUAGES,
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

const SCENE_COUNTS = ['5-10', '10-15', '15-20', '20-25', '25-30'];

const createVideoSchema = z
  .object({
    topic: z.string().min(3).max(500).trim(),
    type: z.enum(VIDEO_TYPES),
    language: z.enum(LANGUAGES).optional().default('english'),
    sceneCount: z.enum(SCENE_COUNTS).optional().default('5-10'),
    // Accepts legacy keys ("female-1"), "custom:<Speaker>", or "clone:<file>.wav"
    // - see AudioService.resolveVoice for how this is interpreted.
    voice: z.string().min(1).max(200).optional().default('female-1'),
    // Podcast type only: separate voice per speaker (same format as `voice`).
    hostVoice: z.string().min(1).max(200).optional(),
    guestVoice: z.string().min(1).max(200).optional(),
    resolution: z.enum(RESOLUTIONS).optional().default('1920x1080'),
    aspectRatio: z.enum(ASPECT_RATIOS).optional().default('16:9'),
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
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId'),
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
