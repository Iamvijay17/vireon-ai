const { z } = require('zod');
const {
  PURPOSES, STRATEGIES, LAYOUTS, CAMERA_MOTIONS, TRANSITIONS,
} = require('./vocabulary');
const {
  BACKGROUND_REGISTRY, DECORATION_REGISTRY, TEXT_MOTION_REGISTRY, IMAGE_MOTION_REGISTRY,
} = require('../../ir/compositionRegistry');

/**
 * Zod contracts for everything the AI Director produces. The model's raw JSON is
 * never trusted: it is parsed against these before any of it is used, and
 * whatever does not parse is repaired (llmValidation.js) or replaced with the
 * deterministic default - it is never passed on to the renderer.
 *
 * Two layers:
 *   - the *response* schemas (StoryPlanSchema, StoryboardEntrySchema) are what an
 *     LLM call is allowed to return. They are strict about values (an unknown
 *     layout is an error, not a silent ''), forgiving about shape (a missing
 *     optional field takes its default; casing and separators are normalised).
 *   - the *plan* schemas (ScenePlan, VisualPlan, MotionPlan, AssetPlan,
 *     DirectorPlan) describe what the Director finally decided and stores on the
 *     script's brief. They are built from the same vocabulary.
 */

const strip = (value) => String(value).toLowerCase().replace(/[\s_-]+/g, '');

/**
 * An enum that accepts the common near-misses a model produces - "Zoom In",
 * "zoom_in", "SLIDEUP", "split image" - by resolving them to the canonical id
 * first. Anything that still is not in the vocabulary fails validation.
 */
const vocab = (values) => {
  const canonical = new Map(values.map((v) => [strip(v), v]));
  return z.preprocess(
    (input) => (typeof input === 'string' ? canonical.get(strip(input)) ?? input.trim() : input),
    z.enum(values)
  );
};

const emptyOr = (schema) => z.union([z.literal(''), schema]);

const SceneNumber = z.coerce.number().int().positive();
const Text = (max) => z.string().trim().max(max);

// ---- Visual ----------------------------------------------------------------

const MIN_IMAGE_PROMPT_CHARS = 8;
const MAX_IMAGE_PROMPT_CHARS = 600;

const VisualSchema = z
  .object({
    kind: vocab(['image', 'none']).default('none'),
    prompt: Text(MAX_IMAGE_PROMPT_CHARS).default(''),
  })
  .superRefine((visual, ctx) => {
    if (visual.kind === 'image' && visual.prompt.length < MIN_IMAGE_PROMPT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prompt'],
        message: `must describe the picture (at least ${MIN_IMAGE_PROMPT_CHARS} characters) when kind is "image"`,
      });
    }
  });

// ---- What an LLM storyboard call may return, per scene -----------------------

const StoryboardEntrySchema = z.object({
  sceneNumber: SceneNumber,
  purpose: vocab(PURPOSES).optional(),
  strategy: vocab(STRATEGIES).optional(),
  layout: emptyOr(vocab(LAYOUTS)).default(''),
  visual: VisualSchema.default({ kind: 'none', prompt: '' }),
  cameraMotion: vocab(CAMERA_MOTIONS).optional(),
  transition: vocab(TRANSITIONS).optional(),
});

// ---- What the story-structure call may return -----------------------------------

const BeatSchema = z
  .object({
    beatIndex: z.coerce.number().int().positive(),
    purpose: Text(400).min(1, 'purpose is required'),
    sceneRange: z.tuple([SceneNumber, SceneNumber]),
    toneNote: Text(300).default(''),
  })
  .refine((beat) => beat.sceneRange[0] <= beat.sceneRange[1], {
    path: ['sceneRange'],
    message: 'must run from a lower to a higher scene number',
  });

const StyleGuideSchema = z.object({
  visualPalette: Text(300).default(''),
  motionVocabulary: Text(300).default(''),
  voiceTone: Text(300).default(''),
});

const StoryPlanSchema = z.object({
  title: Text(300).min(1, 'title is required'),
  description: Text(1000).default(''),
  tags: z.array(Text(60)).max(30).default([]),
  thumbnailPrompt: Text(600).default(''),
  beats: z.array(BeatSchema).min(1, 'at least one beat is required').max(12),
  styleGuide: StyleGuideSchema.default({}),
});

// ---- What the Director finally decides ----------------------------------------

const ScenePlanSchema = z.object({
  sceneNumber: SceneNumber,
  beat: z.number().int().positive().nullable(),
  purpose: z.enum(PURPOSES),
  intent: Text(400).default(''),
  strategy: z.enum(STRATEGIES),
  estimatedDuration: z.number().positive().max(600),
});

const VisualPlanSchema = z.object({
  sceneNumber: SceneNumber,
  layout: emptyOr(z.enum(LAYOUTS)),
  density: z.enum(['light', 'balanced', 'dense']),
  contentItems: z.number().int().min(0),
  visual: z.object({ kind: z.enum(['image', 'none']), prompt: Text(MAX_IMAGE_PROMPT_CHARS) }),
});

const MotionPlanSchema = z.object({
  sceneNumber: SceneNumber,
  cameraMotion: z.enum(CAMERA_MOTIONS),
  transition: z.enum(TRANSITIONS),
  // The composable motion slots (ir/compositionRegistry.js); the Director may leave any unset.
  composition: z
    .object({
      background: z.enum(BACKGROUND_REGISTRY).optional(),
      decoration: z.enum(DECORATION_REGISTRY).optional(),
      textMotion: z.enum(TEXT_MOTION_REGISTRY).optional(),
      imageMotion: z.enum(IMAGE_MOTION_REGISTRY).optional(),
    })
    .default({}),
});

const AssetPlanSchema = z
  .object({
    sceneNumber: SceneNumber,
    needsImage: z.boolean(),
    imagePrompt: Text(MAX_IMAGE_PROMPT_CHARS).default(''),
    role: z.enum(['hero', 'supporting', 'none']),
    status: z.enum(['pending', 'none']),
    // What the image prompt was written against, for traceability.
    context: z.object({ previous: Text(200).default(''), next: Text(200).default('') }).default({}),
  })
  .refine((asset) => !asset.needsImage || asset.imagePrompt.length >= MIN_IMAGE_PROMPT_CHARS, {
    path: ['imagePrompt'],
    message: 'an image scene needs an image prompt',
  });

const DirectorSceneSchema = z.object({
  scene: ScenePlanSchema,
  visual: VisualPlanSchema,
  motion: MotionPlanSchema,
  asset: AssetPlanSchema,
  source: z.enum(['director', 'default']),
  warnings: z.array(z.string()).default([]),
});

const DirectorPlanSchema = z.object({
  version: z.literal(1),
  source: z.enum(['director', 'partial', 'default']),
  story: z.object({
    title: z.string(),
    audience: z.string(),
    beats: z.array(BeatSchema),
    styleGuide: StyleGuideSchema,
  }),
  scenes: z.array(DirectorSceneSchema),
  diversity: z.object({
    score: z.number().min(0).max(1),
    maxLayoutRun: z.number().int().min(0),
    layoutCounts: z.record(z.number().int().min(0)),
    warnings: z.array(z.string()).default([]),
  }),
  validation: z.object({
    repairs: z.number().int().min(0),
    rejectedScenes: z.array(SceneNumber),
  }),
});

/** "layout: Invalid enum value ..." lines, ready for a log or a repair prompt. */
function formatIssues(error) {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

module.exports = {
  MIN_IMAGE_PROMPT_CHARS,
  MAX_IMAGE_PROMPT_CHARS,
  StoryboardEntrySchema,
  StoryPlanSchema,
  BeatSchema,
  StyleGuideSchema,
  ScenePlanSchema,
  VisualPlanSchema,
  MotionPlanSchema,
  AssetPlanSchema,
  DirectorSceneSchema,
  DirectorPlanSchema,
  formatIssues,
};
