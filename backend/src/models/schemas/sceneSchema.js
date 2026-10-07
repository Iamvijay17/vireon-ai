const mongoose = require('mongoose');
const { generateSceneId } = require('../../utils/id');

// Shared by VideoJob and CourseVideo - both scripts are produced by the same
// ScriptParserService.validate() and go through the same audio/image/render
// pipeline, so they use the same per-scene shape.
const sceneSchema = new mongoose.Schema(
  {
    // Stable identity for the scene, independent of sceneNumber (which is
    // just display/ordering position and can shift when scenes are
    // reordered/inserted/deleted in the Studio editor).
    sceneId: { type: String, default: generateSceneId },
    sceneNumber: { type: Number, required: true },
    sceneType: { type: String, default: 'content' },
    // "host" | "guest" - which speaker this turn belongs to (podcast type only).
    speaker: { type: String, default: '' },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    duration: { type: Number, default: 8 },
    backgroundColor: { type: String, default: '#1a1a2e' },
    transition: { type: String, default: 'fade' },
    imagePrompt: { type: String, default: '' },
    cameraMotion: { type: String, default: 'static' },
    animation: { type: String, default: '' },
    // The Director's storyboard entry for this scene - why it exists and what it
    // should look like: { beat, intent, layout, visual: { kind, prompt, status },
    // cameraMotion, transition }. Planning metadata the pipeline reads (layout
    // reaches the renderer; visual drives image generation); null for scripts
    // written before the storyboard existed. See services/director/.
    storyboard: { type: mongoose.Schema.Types.Mixed, default: null },
    imageUrl: { type: String, default: '' },
    templateId: { type: String, default: '' },
    elements: { type: mongoose.Schema.Types.Mixed, default: null },
    scene_meta: { type: mongoose.Schema.Types.Mixed, default: null },
    audio: {
      text: { type: String, default: '' },
      file: { type: String, default: '' },
      duration: { type: Number, default: 0 },
      voice: { type: String, default: '' },
      // Short delivery/emotion direction for this line (e.g. "wry and
      // relatable, then a flash of genuine nervousness on 'terrifying'"),
      // written by the script LLM since it's the one that knows the line's
      // intended tone. Fed into Qwen3-TTS's instruct param - see
      // AudioService._instructFor.
      emotion: { type: String, default: '' },
      // Real per-word timestamps from forced alignment (AudioService._alignCaptions),
      // null when alignment wasn't run or failed - see CaptionRenderer's estimated-pace fallback.
      captionTimestamps: { type: mongoose.Schema.Types.Mixed, default: null },
      // Segmented TTS pipeline (services/audio/pipeline): one entry per
      // narration segment - ids, original/spoken text, instruction, timing
      // inside this scene's track (startMs/endMs), cache result, status and
      // any user-safe error. Absent for scenes made by the legacy path.
      segments: { type: [mongoose.Schema.Types.Mixed], default: undefined },
      // Rollup for the scene: voice profile, TTS model, director/pronunciation
      // versions, cache hits/misses and the generation/processing/assembly times.
      ttsMeta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    },
  },
  { _id: false }
);

module.exports = sceneSchema;
