const { z } = require('zod');
const {
  VIDEO_TYPES,
  RESOLUTIONS,
  ASPECT_RATIOS,
  VOICES,
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

const createVideoSchema = z.object({
  topic: z.string().min(3).max(500).trim(),
  type: z.enum(VIDEO_TYPES),
  language: z.enum(LANGUAGES).optional().default('english'),
  voice: z.enum(VOICES).optional().default('female-1'),
  resolution: z.enum(RESOLUTIONS).optional().default('1920x1080'),
  aspectRatio: z.enum(ASPECT_RATIOS).optional().default('16:9'),
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
