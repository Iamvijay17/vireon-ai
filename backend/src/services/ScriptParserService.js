const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const LoggerService = require('./LoggerService');
const { VIDEO_TYPES } = require('../constants');

/**
 * Service for parsing, validating and saving generated scripts.
 * Single Responsibility: Script validation and file persistence.
 */
class ScriptParserService {
  /**
   * Validate the structure of a generated script.
   *
   * Valid scene types - these are also the only 5 templateId values in the
   * Remotion template registry (see remotion/src/templates/TemplateRegistry.js),
   * so a scene's sceneType and templateId are always the same string.
   * Each scene can be one of:
   *   - "title":            Opening/intro title card (text only, no image)
   *   - "content":          Informational/educational content (text only, no image)
   *   - "image":            Visual scene with image generation (requires imagePrompt)
   *   - "contentwithimage": Content delivery paired with a supporting image
   *                         (requires imagePrompt, same as "image")
   *   - "podcast":          Podcast/interview dialogue turn (host or guest)
   */
  static VALID_SCENE_TYPES = ['title', 'content', 'image', 'contentwithimage', 'podcast'];

  static validate(scriptData, videoType = 'educational', options = {}) {
    const { hostVoice = '', guestVoice = '', hostName = '', guestName = '', seed = '' } = options;
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

      // With exactly 5 templates (one per scene type), templateId always
      // equals sceneType - no more per-video-type/per-position template
      // selection or rotation needed. Any templateId the LLM/legacy data
      // supplied is ignored in favor of the current sceneType so an old
      // numeric template id can never leak into a freshly-validated script.
      const templateId = ScriptParserService._getDefaultTemplateForType(sceneType);

      // Ensure elements structure matches the template
      let elements = scene.elements || null;
      if (templateId) {
        const defaultElements = ScriptParserService._createDefaultElements(templateId, scene, { hostName, guestName });
        
        // Prefer scene_meta.content over empty defaults for content scenes
        if (sceneType === 'content' && scene.scene_meta?.content) {
          const contentItems = scene.scene_meta.content.filter(s => s.trim().length > 0);
          if (contentItems.length > 0) {
            elements = ScriptParserService._createContentElementsFromMeta(templateId, contentItems, scene);
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
   * Get the default template ID for a scene type. There are exactly 5
   * templates now, one per scene type (see remotion/src/templates/
   * TemplateRegistry.js), so this is just an identity mapping - kept as a
   * named method (rather than inlining `sceneType` directly) so the
   * "templateId comes from sceneType" relationship stays a single,
   * greppable seam instead of being implicit at every call site. Previously
   * this picked from a large per-videoType/per-position rotation pool
   * across 60+ numeric templates; that pool no longer exists.
   */
  static _getDefaultTemplateForType(sceneType = 'content') {
    return ScriptParserService.VALID_SCENE_TYPES.includes(sceneType) ? sceneType : 'content';
  }

  /**
   * Create default elements structure for a given template.
   * Ensures the template has the data it needs to render properly.
   */
  static _createDefaultElements(templateId, scene, names = {}) {
    const { hostName = '', guestName = '' } = names;
    const base = {
      title: scene.title || '',
      subtitle: scene.subtitle || '',
    };
    const caption = scene.audio?.text || scene.subtitle || '';

    // Exactly 5 templates now - one branch per templateId, matching the
    // elements shape each template component actually reads (see each
    // template's own JSDoc header in remotion/src/templates/<id>/index.jsx).
    const templateElements = {
      title: { ...base, image: '' },
      content: { title: scene.title || '', items: [{ heading: '', text: scene.subtitle || '' }], caption, captionTimestamps: null },
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

    return templateElements[templateId] || base;
  }

  /**
   * Create elements from scene_meta.content when the LLM didn't provide explicit elements.
   * Maps content sentences to template-specific element structures. Of the 5
   * templates, only "content" and "contentwithimage" actually care about
   * structured content items (bullet list vs. a single body paragraph) -
   * the other 3 (title/image/podcast) don't render scene_meta.content at
   * all, so this only needs 2 branches now instead of ~25.
   */
  static _createContentElementsFromMeta(templateId, contentItems, scene) {
    // Content: plain bullet list, one row per content sentence.
    if (templateId === 'content') {
      return {
        title: scene.title || '',
        items: contentItems.map((text) => ({ heading: '', text })),
        caption: scene.audio?.text || scene.subtitle || '',
        captionTimestamps: null,
      };
    }

    // Content + image: a single body paragraph alongside the image, not a
    // bulleted list (the split image/text panel has room for prose, not rows).
    if (templateId === 'contentwithimage') {
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
    const jobDir = path.resolve(__dirname, '../../jobs', jobId);
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
    const scriptPath = path.resolve(__dirname, '../../jobs', jobId, 'script.json');
    const data = await fs.readFile(scriptPath, 'utf-8');
    return JSON.parse(data);
  }
}

module.exports = ScriptParserService;