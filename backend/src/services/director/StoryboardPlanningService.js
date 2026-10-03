const config = require('../../config');
const PromptService = require('../common/PromptService');
const LLMService = require('../common/LLMService');
const LoggerService = require('../common/LoggerService');
const { LAYOUT_IDS } = require('../../ir/templateRegistry');
const StoryStructureService = require('./StoryStructureService');
const VisualPlanningService = require('./VisualPlanningService');

// Scenes planned per LLM call. Each entry is ~60 tokens of JSON, so a chunk is
// a small, quickly-finished response - a long script never rides on one call.
const CHUNK_SCENES = 12;

const CAMERA_MOTIONS = ['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'];
// Transition ids the renderer's registry knows (remotion/src/transitions).
const TRANSITIONS = ['fade', 'dissolve', 'cut', 'none', 'slide', 'slideUp', 'wipe', 'irisWipe', 'zoom'];

const IMAGE_LAYOUTS = new Set(['split-image', 'image-fullbleed']);
const PODCAST_LAYOUTS = new Set(['podcast-split', 'podcast-centered']);
const IMAGE_BEARING_TYPES = new Set(['image', 'contentwithimage']);

const MAX_IMAGE_PROMPT_CHARS = 400;
const MIN_IMAGE_PROMPT_CHARS = 8;
const DIGEST_NARRATION_CHARS = 220;

const oneOf = (value, allowed) => {
  const v = String(value || '').trim();
  return allowed.includes(v) ? v : '';
};

/**
 * Layer between "the script is written" and "the renderer draws it": decides,
 * per scene, the composition, whether it carries a generated image (and what
 * the image shows), camera motion and transition, and records the result on
 * the scene as `scene.storyboard` (see models/schemas/sceneSchema.js).
 *
 * One LLM call per chunk of scenes, but the model only *proposes* - everything
 * it returns is validated here against the ids the renderer actually has, the
 * image budget, and the scene's own type. A failed or garbled response never
 * fails the job: the affected scenes simply keep what the script already said.
 */
class StoryboardPlanningService {
  /**
   * How many scenes may carry a generated image. 0 when image generation is
   * off, so the planner is told not to ask for pictures that can't be made.
   * Podcasts share one cover image and are budgeted separately (not counted).
   */
  static imageBudget({ sceneCount, videoType }) {
    if (!config.imageGen.enabled || videoType === 'podcast') return 0;
    return Math.min(config.imageGen.maxPerVideo, Math.max(1, Math.floor(sceneCount / 3)));
  }

  static _digest(scenes) {
    return JSON.stringify(
      scenes.map((scene) => {
        const narration = String(scene.audio?.text || '').replace(/\s+/g, ' ').trim();
        return {
          sceneNumber: scene.sceneNumber,
          sceneType: scene.sceneType || 'content',
          title: scene.title || '',
          narration: narration.length > DIGEST_NARRATION_CHARS ? `${narration.slice(0, DIGEST_NARRATION_CHARS)}...` : narration,
          listItems: Array.isArray(scene.scene_meta?.content) ? scene.scene_meta.content.length : 0,
          mentionsNumbers: /\d/.test(narration),
        };
      }),
      null,
      1
    );
  }

  /**
   * Ask the LLM for storyboard entries. Returns `{ entries: Map, source }`
   * where `source` is 'director' (every chunk answered), 'partial' (some did)
   * or 'default' (none did, or there was nothing to ask about). Only
   * cancellation propagates; any other failure just means defaults.
   */
  static async plan({ scenes, structure, videoType, topic, language, imageBudget, jobId, checkCancelled }) {
    const entries = new Map();

    // Podcast turns have one fixed composition and a single shared cover image;
    // there is nothing for the planner to decide.
    if (videoType === 'podcast' || !Array.isArray(scenes) || scenes.length === 0) {
      return { entries, source: 'default' };
    }

    let answered = 0;
    let chunks = 0;
    for (let start = 0; start < scenes.length; start += CHUNK_SCENES) {
      if (checkCancelled) await checkCancelled();
      chunks += 1;
      const chunk = scenes.slice(start, start + CHUNK_SCENES);

      try {
        const prompt = PromptService.render('storyboard', {
          videoType,
          topic,
          language,
          visualPalette: structure?.styleGuide?.visualPalette || 'consistent, clean and modern',
          voiceTone: structure?.styleGuide?.voiceTone || 'clear and engaging',
          maxImages: Math.max(0, Math.ceil((imageBudget * chunk.length) / scenes.length)),
          sceneDigest: this._digest(chunk),
        });
        const parsed = await LLMService.generateScript(prompt, {
          maxTokens: Math.min(6000, 700 + chunk.length * 140),
        });

        const returned = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
        let accepted = 0;
        for (const entry of returned) {
          const sceneNumber = Number(entry?.sceneNumber);
          if (chunk.some((s) => s.sceneNumber === sceneNumber) && !entries.has(sceneNumber)) {
            entries.set(sceneNumber, entry);
            accepted += 1;
          }
        }
        if (accepted > 0) answered += 1;
      } catch (err) {
        if (err.cancelled) throw err;
        LoggerService.warn('Storyboard planning failed for a chunk - those scenes keep the script defaults', {
          jobId, videoType, chunkStart: start + 1, error: err.message,
        });
      }
    }

    const source = answered === 0 ? 'default' : answered === chunks ? 'director' : 'partial';
    LoggerService.info('Storyboard planned', { jobId, scenes: scenes.length, entries: entries.size, source, imageBudget });
    return { entries, source };
  }

  /**
   * Fold validated storyboard entries into the scenes. Pure and deterministic.
   * Also reconciles the scene with its storyboard where they must agree:
   * a scene that gets an image becomes an image-bearing sceneType, and one
   * that doesn't can't stay one (ScriptParserService.validate requires an
   * imagePrompt for those types).
   */
  static apply(scenes, entries, { structure, imageBudget = 0, videoType = '' } = {}) {
    const styleGuide = structure?.styleGuide || {};
    const isPodcast = videoType === 'podcast';
    const imagesAllowed = config.imageGen.enabled;
    let imagesUsed = 0;

    return scenes.map((scene) => {
      const entry = entries?.get(scene.sceneNumber) || null;
      const beat = StoryStructureService.beatForScene(structure?.beats || [], scene.sceneNumber);

      // --- visual ---------------------------------------------------------
      // The planner's call wins when it made one; otherwise the script's own
      // imagePrompt (the LLM already wrote it for image-bearing types) stands.
      const proposedPrompt = entry
        ? String(entry.visual?.prompt || '').trim()
        : String(scene.imagePrompt || '').trim();
      const proposedKind = entry
        ? (entry.visual?.kind === 'image' ? 'image' : 'none')
        : (proposedPrompt ? 'image' : 'none');

      // Title cards can't carry a generated image (ScriptParserService.validate
      // drops an imagePrompt from any sceneType that isn't image-bearing), so
      // only content and image-bearing scenes - and podcast turns - qualify.
      const canCarryImage = isPodcast || ['content', ...IMAGE_BEARING_TYPES].includes(scene.sceneType || 'content');

      let kind = 'none';
      if (
        proposedKind === 'image' &&
        imagesAllowed &&
        canCarryImage &&
        proposedPrompt.length >= MIN_IMAGE_PROMPT_CHARS
      ) {
        if (isPodcast) {
          kind = 'image'; // one shared cover image, dedup'd by prompt at generation time
        } else if (imagesUsed < imageBudget) {
          kind = 'image';
          imagesUsed += 1;
        }
      }
      const prompt = kind === 'image'
        ? VisualPlanningService.styledPrompt(proposedPrompt.slice(0, MAX_IMAGE_PROMPT_CHARS), styleGuide)
        : '';

      // --- sceneType reconciliation (not for podcasts: every turn is "podcast")
      let sceneType = scene.sceneType || 'content';
      let subtitle = scene.subtitle || '';
      if (!isPodcast) {
        if (kind === 'image' && sceneType === 'content') {
          sceneType = 'contentwithimage';
          // contentwithimage shows a body paragraph, not the sentence list.
          if (!subtitle) subtitle = this._leadSentence(scene.audio?.text);
        } else if (kind === 'none' && IMAGE_BEARING_TYPES.has(sceneType)) {
          sceneType = 'content';
        }
      }

      // --- layout ---------------------------------------------------------
      let layout = entry ? oneOf(entry.layout, LAYOUT_IDS) : '';
      if (isPodcast || PODCAST_LAYOUTS.has(layout)) layout = '';
      if (IMAGE_LAYOUTS.has(layout) && kind !== 'image') layout = '';

      const cameraMotion = entry ? oneOf(entry.cameraMotion, CAMERA_MOTIONS) : '';
      const transition = entry ? oneOf(entry.transition, TRANSITIONS) : '';

      return {
        ...scene,
        sceneType,
        subtitle,
        imagePrompt: prompt,
        transition: transition || scene.transition,
        // Explicit planner choice only; MotionPlanningService fills the rest, and
        // finalize() writes the end result back into the storyboard.
        cameraMotion: cameraMotion || scene.cameraMotion,
        storyboard: {
          beat: beat?.beatIndex ?? null,
          intent: beat?.purpose || '',
          layout,
          visual: { kind, prompt, status: kind === 'image' ? 'pending' : 'none' },
          cameraMotion: cameraMotion || null,
          transition: transition || null,
          source: entry ? 'director' : 'default',
        },
      };
    });
  }

  /** After the motion pass: make the storyboard say what the scene will really do. */
  static finalize(scenes) {
    return scenes.map((scene) => ({
      ...scene,
      storyboard: {
        ...scene.storyboard,
        cameraMotion: scene.cameraMotion || 'static',
        transition: scene.transition || 'fade',
      },
    }));
  }

  /** The video-level half of the storyboard, stored on the script as `brief`. */
  static buildBrief({ structure, imageBudget, source, videoType, extraInstructions }) {
    return {
      videoType,
      beats: structure?.beats || [],
      styleGuide: structure?.styleGuide || {},
      imageBudget,
      storyboardSource: source,
      ...(extraInstructions ? { extraInstructions: String(extraInstructions).slice(0, 2000) } : {}),
    };
  }

  static _leadSentence(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const first = clean.match(/^.{20,}?[.!?](\s|$)/);
    const sentence = (first ? first[0] : clean).trim();
    return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
  }
}

StoryboardPlanningService.CAMERA_MOTIONS = CAMERA_MOTIONS;
StoryboardPlanningService.TRANSITIONS = TRANSITIONS;

module.exports = StoryboardPlanningService;
