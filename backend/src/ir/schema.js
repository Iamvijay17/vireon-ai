const { z } = require('zod');
const { SCENE_TYPES } = require('./templateRegistry');

/**
 * SceneGraph IR - the typed contract between what the director/Studio
 * produced and what Remotion is handed.
 *
 * Every field here is something a template, the composition, or the
 * pipeline actually reads. Nothing is stored in this shape: it's compiled
 * fresh from the Mongo script + job config (see compile.js), so bumping
 * IR_VERSION never requires a data migration - only the compiler changes.
 */
const IR_VERSION = 1;

const SceneTiming = z.object({
  durationSeconds: z.number().nonnegative(),
  durationFrames: z.number().int().nonnegative(),
  fps: z.number().int().positive(),
});

const SceneAudio = z.object({
  text: z.string(),
  // Public storage URL the renderer fetches, or null before TTS has run.
  url: z.string().nullable(),
  durationSeconds: z.number().nonnegative(),
  voice: z.string(),
  emotion: z.string(),
  captionTimestamps: z.any().nullable(),
});

const SceneIR = z.object({
  sceneId: z.string(),
  sceneNumber: z.number().int().positive(),
  sceneType: z.enum(SCENE_TYPES),
  templateId: z.string().min(1),
  speaker: z.enum(['host', 'guest', '']),
  title: z.string(),
  subtitle: z.string(),
  backgroundColor: z.string(),
  transition: z.string(),
  cameraMotion: z.string(),
  animation: z.string(),
  imagePrompt: z.string(),
  imageUrl: z.string(),
  timing: SceneTiming,
  audio: SceneAudio,
  // Validated separately against the resolved template's own schema in
  // compile.js - the family isn't known until templateId is resolved.
  elements: z.record(z.any()).nullable(),
});

const VideoSettings = z.object({
  type: z.string(),
  language: z.string(),
  resolution: z.string(),
  aspectRatio: z.string(),
  fps: z.number().int().positive(),
  quality: z.string(),
  fontPairing: z.string(),
  captionAnimation: z.string(),
});

const AvatarOverlay = z.object({
  videoUrl: z.string().min(1),
  position: z.string().nullable(),
});

const SceneGraph = z.object({
  version: z.literal(IR_VERSION),
  jobId: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  thumbnailPrompt: z.string(),
  video: VideoSettings,
  avatar: AvatarOverlay.nullable(),
  scenes: z.array(SceneIR).min(1),
});

module.exports = {
  IR_VERSION,
  SceneGraph,
  SceneIR,
  SceneAudio,
  SceneTiming,
  VideoSettings,
  AvatarOverlay,
};
