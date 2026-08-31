const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { VIDEO_TYPES } = require('../../constants');

/**
 * Service for parsing, validating and saving generated scripts.
 * Single Responsibility: Script validation and file persistence.
 */
class ScriptParserService {
  /**
   * Valid scene types. Each maps to one or more numbered templateId values
   * in the Remotion template registry (see
   * remotion/src/templates/TemplateRegistry.js and this file's
   * SCENE_TYPE_TEMPLATE_IDS below) - a scene's sceneType is the stable,
   * semantic value; its templateId is the specific numbered visual variant
   * ("NNN-<sceneType>") picked to render it.
   * Each scene can be one of:
   *   - "title":            Opening/intro title card (text only, no image)
   *   - "content":          Informational/educational content (text only, no image)
   *   - "image":            Visual scene with image generation (requires imagePrompt)
   *   - "contentwithimage": Content delivery paired with a supporting image
   *                         (requires imagePrompt, same as "image")
   *   - "podcast":          Podcast/interview dialogue turn (host or guest)
   */
  static VALID_SCENE_TYPES = ['title', 'content', 'image', 'contentwithimage', 'podcast'];

  /**
   * sceneType -> numbered templateId(s), mirroring SceneTypeCategories in
   * remotion/src/templates/TemplateCategories.js (duplicated here since
   * backend/src is CommonJS and can't import that ESM package directly).
   * Every id sharing a sceneType renders the exact same `elements` data
   * structure - they're purely alternate visual layouts - so one is picked
   * at random per scene. Only "content" currently has more than one
   * (a plain bullet list, a card grid, and a numbered timeline).
   */
  static SCENE_TYPE_TEMPLATE_IDS = {
    title: ['001-title', '002-title', '003-title', '004-title', '005-title', '006-title', '007-title', '008-title', '009-title', '010-title'],
    content: ['001-content', '002-content', '003-content', '004-content', '005-content', '006-content', '007-content', '008-content', '009-content', '010-content', '011-content', '012-content', '013-content', '014-content', '015-content'],
    contentwithimage: ['001-contentwithimage', '002-contentwithimage', '003-contentwithimage', '004-contentwithimage', '005-contentwithimage', '006-contentwithimage', '007-contentwithimage', '008-contentwithimage', '009-contentwithimage'],
    image: ['001-image', '002-image', '003-image', '004-image', '005-image', '006-image', '007-image', '008-image', '009-image', '010-image'],
    podcast: ['001-podcast', '002-podcast'],
  };

  /**
   * templateId for the Generative Scene Engine (see
   * remotion/src/engine/*.js and
   * remotion/src/templates/generative/GeneratedScene.jsx), which computes
   * layout/style/motion procedurally from a scene's `elements` instead of
   * rendering one of the hand-coded SCENE_TYPE_TEMPLATE_IDS files.
   */
  static GENERATIVE_TEMPLATE_ID = 'generative';

  /**
   * sceneTypes the generative engine's Layout Solver handles: "title"
   * (title[+subtitle][+image]), "content" (title+items),
   * "contentwithimage" (title+body+image, via the split-image strategy),
   * "image" (caption/label headline+kicker, via the image-fullbleed
   * strategy - see analyzeContent's "image" branch for the field remap),
   * and "podcast" (hostName/hostImage, via the podcast-split strategy -
   * see analyzeContent's "podcast" branch). All five sceneTypes in
   * VALID_SCENE_TYPES are covered.
   */
  static GENERATIVE_SUPPORTED_SCENE_TYPES = ['title', 'content', 'contentwithimage', 'image', 'podcast'];

  static validate(scriptData, videoType = 'educational', options = {}) {
    const { hostVoice = '', guestVoice = '', hostName = '', guestName = '', seed = '', disableCaptions = false } = options;
    const errors = [];

    if (!scriptData.title || typeof scriptData.title !== 'string') {
      errors.push('Missing or invalid title');
    }

    if (!Array.isArray(scriptData.scenes) || scriptData.scenes.length === 0) {
      errors.push('Missing or empty scenes array');
    } else {
      scriptData.scenes.forEach((scene, index) => {
        if (!scene.sceneNumber) errors.push(`Scene ${index}: missing sceneNumber`);
        else if (!Number.isInteger(scene.sceneNumber) || scene.sceneNumber < 1) {
          errors.push(`Scene ${index}: sceneNumber must be a positive integer`);
        }
        if (!scene.audio?.text) errors.push(`Scene ${index}: missing audio text`);

        // Normalize legacy scene types from old prompts. "title" is now a
        // valid sceneType in its own right (matches the "title" template),
        // so it no longer needs converting to "intro" - only the "end"
        // collapse (closing/summary scenes don't have their own template,
        // they render as a regular "content" scene) is still needed.
        if (scene.sceneType === 'end') scene.sceneType = 'content';

        // Validate sceneType
        const sceneType = scene.sceneType || 'content';
        if (!ScriptParserService.VALID_SCENE_TYPES.includes(sceneType)) {
          errors.push(`Scene ${index}: invalid sceneType "${sceneType}". Must be one of: ${ScriptParserService.VALID_SCENE_TYPES.join(', ')}`);
        }

        // Only require imagePrompt for "image"/"contentwithimage" scene
        // types - except podcast, where every scene is tagged "podcast" and
        // they all share ONE cover image (derived below from whichever
        // scene happens to carry it, defaulting if none do) rather than
        // each needing its own.
        if ((sceneType === 'image' || sceneType === 'contentwithimage') && !scene.imagePrompt && videoType !== 'podcast') {
          errors.push(`Scene ${index}: missing imagePrompt for sceneType "${sceneType}"`);
        }
      });
    }

    if (errors.length > 0) {
      LoggerService.warn('Script validation failed', { errors });
      throw new Error(`Script validation failed: ${errors.join('; ')}`);
    }

    // Use provided video type or fallback to scriptData.type
    const resolvedType = videoType || scriptData.type || 'educational';

    // Podcast episodes share ONE cover image across every turn - but the LLM
    // doesn't reliably tag every single scene with a repeated imagePrompt
    // (observed: only the first couple of turns), so enforce it here
    // instead of trusting the model's discipline across a long scene list.
    const podcastSharedImagePrompt = resolvedType === 'podcast'
      ? (scriptData.scenes.find((s) => s.imagePrompt)?.imagePrompt || 'warm studio lighting, abstract shapes, no readable text, no people\'s faces')
      : '';

    // Set defaults for missing optional fields
    scriptData.scenes = scriptData.scenes.map((scene) => {
      const sceneType = resolvedType === 'podcast' ? 'podcast' : (scene.sceneType || 'content');

      // templateId is always derived fresh from sceneType (randomly, when
      // the sceneType has multiple visual variants) rather than trusting
      // whatever the LLM/legacy data supplied, so a stale or unknown
      // template id can never leak into a freshly-validated script.
      const templateId = ScriptParserService._getDefaultTemplateForType(sceneType);

      // Ensure elements structure matches the template. Passed explicitly
      // rather than re-derived from templateId, since GENERATIVE_TEMPLATE_ID
      // is one shared id across multiple sceneTypes - it can't be reverse-
      // looked-up the way a numbered "NNN-<sceneType>" id can.
      let elements = scene.elements || null;
      if (templateId) {
        const defaultElements = ScriptParserService._createDefaultElements(templateId, scene, { hostName, guestName, disableCaptions }, sceneType);

        // Prefer scene_meta.content over empty defaults for content scenes
        if (sceneType === 'content' && scene.scene_meta?.content) {
          const contentItems = scene.scene_meta.content.filter(s => s.trim().length > 0);
          if (contentItems.length > 0) {
            elements = ScriptParserService._createContentElementsFromMeta(templateId, contentItems, scene, { disableCaptions }, sceneType);
          } else {
            elements = defaultElements;
          }
        } else if (!elements) {
          elements = defaultElements;
        }
      }

      // Only keep imagePrompt for "image"/"contentwithimage" scenes; clear for others to skip generation
      const imagePrompt = resolvedType === 'podcast'
        ? podcastSharedImagePrompt
        : ((sceneType === 'image' || sceneType === 'contentwithimage') ? (scene.imagePrompt || '') : '');

      // Build scene_meta for content scenes: preserve LLM output if valid, otherwise auto-generate
      let scene_meta = null;
      if (sceneType === 'content') {
        const hasValidLLMMeta = scene.scene_meta && Array.isArray(scene.scene_meta.content) && scene.scene_meta.content.length > 0;
        if (hasValidLLMMeta) {
          scene_meta = scene.scene_meta;
        } else {
          const audioText = scene.audio?.text || '';
          const sentences = audioText.match(/[^\.!\?]+[\.!\?]+/g) || [audioText].filter(Boolean);
          scene_meta = {
            content: sentences.map((s) => s.trim()).filter((s) => s.length > 0),
          };
        }
      }

      // Podcast dialogue turns: resolve the per-scene voice from the
      // "host"/"guest" speaker tag + the job's two chosen voices, instead of
      // relying on a single job-wide voice.
      const speaker = scene.speaker === 'guest' ? 'guest' : (scene.speaker === 'host' ? 'host' : '');
      const resolvedVoice = speaker && resolvedType === 'podcast'
        ? (speaker === 'guest' ? guestVoice : hostVoice) || scene.audio?.voice || ''
        : scene.audio?.voice || '';

      return {
        sceneNumber: scene.sceneNumber,
        sceneType,
        speaker,
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        duration: scene.duration || 0, // No default duration - will be set after audio generation
        backgroundColor: scene.backgroundColor || '#1a1a2e',
        transition: scene.transition || 'fade',
        imagePrompt,
        cameraMotion: scene.cameraMotion || 'static',
        animation: scene.animation || '',
        // Template-based rendering fields
        templateId,
        elements,
        scene_meta,
        audio: {
          text: scene.audio?.text || '',
          file: '',
          duration: 0, // No duration until audio is generated
          voice: resolvedVoice,
          emotion: scene.audio?.emotion || scene.emotion || '',
        },
      };
    });

    return {
      title: scriptData.title,
      description: scriptData.description || '',
      type: resolvedType,
      tags: Array.isArray(scriptData.tags) ? scriptData.tags : [],
      thumbnailPrompt: scriptData.thumbnailPrompt || '',
      scenes: scriptData.scenes,
    };
  }

  /**
   * Get the default template ID for a scene type. When the Generative
   * Scene Engine is enabled (config.generativeEngine.enabled, default on)
   * and the sceneType is one the solver handles
   * (GENERATIVE_SUPPORTED_SCENE_TYPES), every new script routes through it
   * instead of the ~46 hand-coded templates. Falls back to the legacy
   * random pick from SCENE_TYPE_TEMPLATE_IDS[sceneType] otherwise - either
   * because the engine is disabled (GENERATIVE_ENGINE_ENABLED=false) or the
   * sceneType ("image"/"podcast") isn't supported by the solver yet.
   */
  static _getDefaultTemplateForType(sceneType = 'content') {
    if (config.generativeEngine.enabled && ScriptParserService.GENERATIVE_SUPPORTED_SCENE_TYPES.includes(sceneType)) {
      return ScriptParserService.GENERATIVE_TEMPLATE_ID;
    }

    const variants = ScriptParserService.SCENE_TYPE_TEMPLATE_IDS[sceneType]
      || ScriptParserService.SCENE_TYPE_TEMPLATE_IDS.content;
    return variants[Math.floor(Math.random() * variants.length)];
  }

  /**
   * Create default elements structure for a given template.
   * Ensures the template has the data it needs to render properly.
   */
  static _createDefaultElements(templateId, scene, names = {}, explicitSceneType = null) {
    const { hostName = '', guestName = '', disableCaptions = false } = names;
    const base = {
      title: scene.title || '',
      subtitle: scene.subtitle || '',
    };
    const caption = disableCaptions ? '' : (scene.audio?.text || scene.subtitle || '');

    // One branch per sceneType, matching the elements shape its templates
    // actually read (see each template's own JSDoc header in
    // remotion/src/templates/<id>/index.jsx). All templates sharing a
    // sceneType (see SCENE_TYPE_TEMPLATE_IDS) read the exact same shape -
    // they only differ in how they render it - so keying on sceneType
    // rather than templateId keeps this correct automatically as variants
    // are added/removed.
    const contentDefault = { title: scene.title || '', items: [{ heading: '', text: scene.subtitle || '' }], caption, captionTimestamps: null };
    const sceneTypeElements = {
      title: { ...base, image: '' },
      content: contentDefault,
      contentwithimage: { title: scene.title || '', body: scene.subtitle || '', image: '', badge: '' },
      image: { image: '', caption: scene.subtitle || '', label: 'Featured' },
      podcast: {
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        hostName: (scene.speaker === 'guest' ? guestName : hostName) || 'Host',
        hostImage: '',
        caption,
        captionTimestamps: null,
      },
    };
    // GENERATIVE_TEMPLATE_ID is one shared id across multiple sceneTypes,
    // so it can't be reverse-looked-up from SCENE_TYPE_TEMPLATE_IDS the way
    // a numbered "NNN-<sceneType>" id can - callers that already know the
    // sceneType (ScriptParserService.validate) pass it explicitly instead.
    const sceneType = explicitSceneType
      || Object.keys(ScriptParserService.SCENE_TYPE_TEMPLATE_IDS)
        .find((type) => ScriptParserService.SCENE_TYPE_TEMPLATE_IDS[type].includes(templateId));

    return sceneTypeElements[sceneType] || base;
  }

  /**
   * Create elements from scene_meta.content when the LLM didn't provide explicit elements.
   * Maps content sentences to template-specific element structures. Only
   * the 4 "content" variants and "contentwithimage" actually care about
   * structured content items (bullet/grid/timeline/stats rows vs. a single
   * body paragraph) - the other 3 (title/image/podcast) don't render
   * scene_meta.content at all, so this only needs 2 branches.
   */
  static _createContentElementsFromMeta(templateId, contentItems, scene, options = {}, explicitSceneType = null) {
    const { disableCaptions = false } = options;
    // GENERATIVE_TEMPLATE_ID can't be reverse-looked-up from
    // SCENE_TYPE_TEMPLATE_IDS (see _createDefaultElements) - callers that
    // already know the sceneType pass it explicitly instead.
    const isContentShape = explicitSceneType === 'content' || ScriptParserService.SCENE_TYPE_TEMPLATE_IDS.content.includes(templateId);
    const isContentWithImageShape = explicitSceneType === 'contentwithimage' || ScriptParserService.SCENE_TYPE_TEMPLATE_IDS.contentwithimage.includes(templateId);

    // Content variants: plain items array, one row per content sentence -
    // each variant's component decides how to lay the rows out.
    if (isContentShape) {
      return {
        title: scene.title || '',
        items: contentItems.map((text) => ({ heading: '', text })),
        caption: disableCaptions ? '' : (scene.audio?.text || scene.subtitle || ''),
        captionTimestamps: null,
      };
    }

    // Content + image: a single body paragraph alongside the image, not a
    // bulleted list (the split image/text panel has room for prose, not rows).
    if (isContentWithImageShape) {
      return {
        title: scene.title || '',
        body: contentItems.join(' '),
        image: '',
        badge: '',
      };
    }

    // Generic fallback: use as body/subtitle text
    return {
      title: scene.title || '',
      subtitle: scene.subtitle || contentItems.join(' '),
    };
  }

  /**
   * Save script JSON to disk.
   */
  static async saveScript(jobId, script) {
    const jobDir = path.resolve(__dirname, '../../../jobs', jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const scriptPath = path.join(jobDir, 'script.json');
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf-8');

    LoggerService.info('Script saved to disk', { jobId, path: scriptPath });
    return scriptPath;
  }

  /**
   * Read script from disk.
   */
  static async readScript(jobId) {
    const scriptPath = path.resolve(__dirname, '../../../jobs', jobId, 'script.json');
    const data = await fs.readFile(scriptPath, 'utf-8');
    return JSON.parse(data);
  }
}

module.exports = ScriptParserService;