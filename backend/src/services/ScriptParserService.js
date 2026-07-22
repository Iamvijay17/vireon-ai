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
   * Valid scene types.
   * Each scene can be one of:
   *   - "intro":    Opening title card (text only, no image)
   *   - "content":  Informational/educational content (text only, no image)
   *   - "image":    Visual scene with image generation (requires imagePrompt)
   */
  static VALID_SCENE_TYPES = ['intro', 'content', 'image'];

  static validate(scriptData, videoType = 'educational', options = {}) {
    const { hostVoice = '', guestVoice = '' } = options;
    const errors = [];

    if (!scriptData.title || typeof scriptData.title !== 'string') {
      errors.push('Missing or invalid title');
    }

    if (!Array.isArray(scriptData.scenes) || scriptData.scenes.length === 0) {
      errors.push('Missing or empty scenes array');
    } else {
      scriptData.scenes.forEach((scene, index) => {
        if (!scene.sceneNumber) errors.push(`Scene ${index}: missing sceneNumber`);
        if (!scene.audio?.text) errors.push(`Scene ${index}: missing audio text`);

        // Normalize legacy scene types from old prompts
        if (scene.sceneType === 'title') scene.sceneType = 'intro';
        if (scene.sceneType === 'end') scene.sceneType = 'content';

        // Validate sceneType
        const sceneType = scene.sceneType || 'content';
        if (!ScriptParserService.VALID_SCENE_TYPES.includes(sceneType)) {
          errors.push(`Scene ${index}: invalid sceneType "${sceneType}". Must be one of: ${ScriptParserService.VALID_SCENE_TYPES.join(', ')}`);
        }

        // Only require imagePrompt for "image" scene type
        if (sceneType === 'image' && !scene.imagePrompt) {
          errors.push(`Scene ${index}: missing imagePrompt for sceneType "image"`);
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
    // doesn't reliably tag every single scene as sceneType "image" with a
    // repeated imagePrompt (observed: only the first couple of turns), so
    // enforce it here instead of trusting the model's discipline across a
    // long scene list.
    const podcastSharedImagePrompt = resolvedType === 'podcast'
      ? (scriptData.scenes.find((s) => s.imagePrompt)?.imagePrompt || 'warm studio lighting, abstract shapes, no readable text, no people\'s faces')
      : '';

    // Set defaults for missing optional fields
    scriptData.scenes = scriptData.scenes.map((scene) => {
      const sceneType = resolvedType === 'podcast' ? 'image' : (scene.sceneType || 'content');

      // If LLM didn't provide templateId, assign a default based on video type + scene type
      let templateId = scene.templateId || '';
      if (!templateId) {
        templateId = ScriptParserService._getDefaultTemplateForType(resolvedType, scene.sceneNumber, sceneType);
      }

      // Ensure elements structure matches the template
      let elements = scene.elements || null;
      if (templateId) {
        const defaultElements = ScriptParserService._createDefaultElements(templateId, scene);
        
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

      // Only keep imagePrompt for "image" scenes; clear for others to skip generation
      const imagePrompt = resolvedType === 'podcast'
        ? podcastSharedImagePrompt
        : (sceneType === 'image' ? (scene.imagePrompt || '') : '');

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
   * Get a default template ID for a video type and scene type.
   * Title scenes get intro-style templates.
   * Image scenes get image-heavy templates.
   * End scenes get outro/ending templates.
   */
  static _getDefaultTemplateForType(videoType, sceneNumber, sceneType = 'content') {
    // Podcast dialogue turns all share one continuous look (cover art +
    // waveform + captions) rather than rotating through the content pool.
    if (videoType === 'podcast') {
      return 'template-061';
    }

    // Full pool of content-appropriate templates (mirrors
    // SceneTypeCategories.content in templates/TemplateCategories.js).
    // Content scenes rotate through this whole pool regardless of
    // videoType so that longer scripts (more scenes) actually surface
    // more visual variety instead of repeating a handful of templates.
    const CONTENT_TEMPLATES = [
      'template-004', 'template-005', 'template-006', 'template-007', 'template-008',
      'template-009', 'template-011', 'template-012', 'template-013', 'template-014',
      'template-015', 'template-016', 'template-017', 'template-018', 'template-021',
      'template-022', 'template-023', 'template-024', 'template-025', 'template-026',
      'template-027', 'template-028', 'template-029', 'template-031', 'template-032',
      'template-033', 'template-034', 'template-035', 'template-036', 'template-037',
      'template-038', 'template-039', 'template-040', 'template-043', 'template-044',
      'template-045', 'template-046', 'template-047', 'template-048', 'template-054',
      'template-055', 'template-056', 'template-057', 'template-058',
    ];

    const templateMap = {
      educational: CONTENT_TEMPLATES,
      podcast: CONTENT_TEMPLATES,
      marketing: CONTENT_TEMPLATES,
      story: CONTENT_TEMPLATES,
      motivational: CONTENT_TEMPLATES,
      business: CONTENT_TEMPLATES,
      youtube_shorts: CONTENT_TEMPLATES,
    };

    // Scene-type-specific template overrides for better visual matching
    const sceneTypeOverrides = {
      // Title scenes: use intro/hero templates
      title: {
        educational: 'template-001',
        podcast: 'template-042',
        marketing: 'template-010',
        story: 'template-019',
        motivational: 'template-019',
        business: 'template-010',
        youtube_shorts: 'template-044',
      },
      // End scenes: use quote/milestone templates
      end: {
        educational: 'template-006',
        podcast: 'template-031',
        marketing: 'template-006',
        story: 'template-006',
        motivational: 'template-006',
        business: 'template-037',
        youtube_shorts: 'template-047',
      },
      // Image scenes: use image-focused templates
      image: {
        educational: 'template-003',
        podcast: 'template-003',
        marketing: 'template-003',
        story: 'template-017',
        motivational: 'template-003',
        business: 'template-036',
        youtube_shorts: 'template-016',
      },
    };

    // Check if there's a specific override for this scene type
    if (sceneTypeOverrides[sceneType] && sceneTypeOverrides[sceneType][videoType]) {
      return sceneTypeOverrides[sceneType][videoType];
    }

    const templates = templateMap[videoType] || ['template-001'];
    return templates[(sceneNumber - 1) % templates.length];
  }

  /**
   * Create default elements structure for a given template.
   * Ensures the template has the data it needs to render properly.
   */
  static _createDefaultElements(templateId, scene) {
    const base = {
      title: scene.title || '',
      subtitle: scene.subtitle || '',
    };

    // Each template has unique element field requirements
    const templateElements = {
      'template-001': { ...base, image: '' },
      'template-002': { question: scene.title || '', answer: scene.subtitle || '', questionIcon: '❓', answerIcon: '💡' },
      'template-003': { image: '', caption: scene.subtitle || '', label: 'Featured' },
      'template-004': { title: scene.title || '', items: [{ date: '', text: scene.subtitle || '' }] },
      'template-005': { header: scene.title || '', leftCard: { title: '', body: '' }, rightCard: { title: '', body: '' } },
      'template-006': { quote: scene.title || '', author: '', authorTitle: '' },
      'template-007': { title: scene.title || '', stats: [{ value: '', label: '' }] },
      'template-008': { title: scene.title || '', tags: [{ text: '', icon: '' }] },
      'template-009': { title: scene.title || '', items: [{ text: scene.subtitle || '', icon: '✅' }] },
      'template-010': { ...base, stats: [{ value: '', label: '' }] },
      'template-011': { title: scene.title || '', members: [{ name: '', role: '', bio: '' }] },
      'template-012': { title: scene.title || '', message: '', timeBlocks: [{ value: '', label: '' }] },
      'template-013': { title: scene.title || '', emoji: '🚀', steps: [{ title: '', description: '' }] },
      'template-014': { title: scene.title || '', bars: [{ label: '', value: '0' }] },
      'template-015': { title: scene.title || '', features: [{ icon: '', title: '', description: '' }] },
      'template-016': { images: [{ url: '' }], caption: scene.subtitle || '' },
      'template-017': { ...base, body: scene.subtitle || '', image: '', badge: '' },
      'template-018': { images: [{ url: '' }], caption: scene.subtitle || '' },
      'template-019': { ...base, image: '', cta: '' },
      'template-020': { ...base, body: scene.subtitle || '', image: '', label: '' },
      'template-021': { ...base, body: scene.subtitle || '', image: '' },
      'template-022': { title: scene.title || '', photos: [{ url: '', caption: '' }] },
      'template-023': { title: scene.title || '', cards: [{ image: '', title: '', description: '' }] },
      'template-024': { ...base, label: '', topImage: '', bottomImage: '' },
      'template-025': { ...base, body: scene.subtitle || '', image: '', tag: '' },
      'template-026': { term: '', title: scene.title || '', definition: scene.subtitle || '', example: '' },
      'template-027': { title: scene.title || '', points: [{ text: scene.subtitle || '', icon: '✓' }] },
      'template-028': { ...base, headers: ['Feature', 'Value'], rows: [{ cells: ['', ''] }] },
      'template-029': { title: scene.title || '', subtitle: scene.subtitle || '', facts: [{ icon: '', title: '', description: '' }] },
      'template-030': { badge: '', ...base, body: scene.subtitle || '', stats: [{ value: '', label: '' }] },
      'template-031': { title: scene.title || '', meta: '', quote: scene.subtitle || '', author: '', source: '' },
      'template-032': { ...base, steps: [{ num: 1, title: '', description: '' }] },
      'template-033': { ...base, items: [{ icon: '', title: '', description: '' }] },
      'template-034': { title: scene.title || '', items: [{ level: '', title: '', description: '', tags: [] }] },
      'template-035': { ...base, items: [{ text: '', icon: '' }] },
      'template-036': { label: '', ...base, body: scene.subtitle || '', image: '', stat: '' },
      'template-037': { title: scene.title || '', sub: '', items: [{ year: '', title: '', description: '' }] },
      'template-038': { title: scene.title || '', items: [{ icon: '', title: '', description: '' }] },
      'template-039': { name: scene.title || '', role: scene.subtitle || '', bio: '', image: '', stats: [{ value: '', label: '' }] },
      'template-040': { ...base, items: [{ text: '', icon: '' }] },
      'template-041': { ...base, caption: scene.subtitle || '', captionTimestamps: null },
      'template-042': { ...base, hostName: '', hostImage: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-043': { headline: scene.title || '', body: scene.subtitle || '', badge: '', image: '', caption: '', captionTimestamps: null },
      'template-044': { ...base, body: '', profileImage: '', username: '', likes: '0', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-045': { ...base, backgroundImage: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-046': { ...base, deviceImage: '', specs: [], caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-047': { quote: scene.title || '', author: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-048': { ...base, guestName: '', guestTitle: '', guestImage: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-049': { ...base, step: '', body: scene.subtitle || '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-050': { ...base, caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-051': { ...base, image: '', metric: '', metricLabel: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-052': { ...base, image: '', ingredients: [], caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-053': { ...base, location: '', image: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-054': { ...base, formula: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-055': { ...base, image: '', stats: [], caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-056': { ...base, caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-057': { ...base, image: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-058': { ...base, body: scene.subtitle || '', image: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-059': { ...base, image: '', date: '', caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-060': { ...base, caption: scene.audio?.text || scene.subtitle || '', captionTimestamps: null },
      'template-061': {
        caption: scene.audio?.text || scene.subtitle || '',
        captionTimestamps: null,
        speakerLabel: scene.speaker === 'guest' ? 'Guest' : 'Host',
      },
    };

    return templateElements[templateId] || base;
  }

  /**
   * Create elements from scene_meta.content when the LLM didn't provide explicit elements.
   * Maps content sentences to template-specific element structures.
   */
  static _createContentElementsFromMeta(templateId, contentItems, scene) {
    // Timeline templates: map contentItems to {date, text} pairs
    if (['template-004', 'template-037'].includes(templateId)) {
      return {
        title: scene.title || '',
        items: contentItems.map((text, i) => ({ date: '', text })),
      };
    }

    // For templates that use items/text arrays, populate from scene_meta.content
    const itemTemplates = [
      'template-009', 'template-013', 'template-027', 'template-032',
      'template-033', 'template-034', 'template-035', 'template-040'
    ];
    
    if (itemTemplates.includes(templateId)) {
      return {
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        items: contentItems.map(text => ({ text, icon: '' })),
      };
    }

    // For bullet/point-style templates
    if (['template-009', 'template-027'].includes(templateId)) {
      return {
        title: scene.title || '',
        items: contentItems.map(text => ({ text, icon: '✅' })),
      };
    }

    // For stats/cards templates
    if (['template-007', 'template-010', 'template-014'].includes(templateId)) {
      return {
        title: scene.title || '',
        stats: contentItems.map(text => ({ value: text, label: '' })),
      };
    }

    // For fact/feature templates
    if (['template-029', 'template-033', 'template-038'].includes(templateId)) {
      return {
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        items: contentItems.map(text => ({ text, description: '' })),
      };
    }

    // Hero/image card templates
    if (['template-001', 'template-003', 'template-017', 'template-019', 'template-020', 'template-024', 'template-025'].includes(templateId)) {
      return {
        title: scene.title || '',
        subtitle: scene.subtitle || contentItems.join(' '),
        image: '',
        body: contentItems.join(' '),
      };
    }

    // Comparison templates
    if (['template-005', 'template-028'].includes(templateId)) {
      return {
        header: scene.title || '',
        leftCard: { title: '', body: contentItems[0] || '' },
        rightCard: { title: '', body: contentItems[1] || '' },
      };
    }

    // Q&A / flashcard templates
    if (['template-002'].includes(templateId)) {
      return {
        question: scene.title || '',
        answer: contentItems.join(' '),
        questionIcon: '❓',
        answerIcon: '💡',
      };
    }

    // Quote/message templates
    if (['template-006', 'template-047'].includes(templateId)) {
      return {
        quote: contentItems[0] || scene.title || '',
        author: '',
        authorTitle: '',
      };
    };

    // Team/person templates
    if (['template-011', 'template-039', 'template-042', 'template-048'].includes(templateId)) {
      return {
        name: scene.title || '',
        role: scene.subtitle || '',
        bio: contentItems.join(' '),
        image: '',
        stats: contentItems.map(text => ({ value: text, label: '' })),
      };
    }

    // Gallery/photo templates
    if (['template-016', 'template-018', 'template-022'].includes(templateId)) {
      return {
        images: contentItems.map(() => ({ url: '' })),
        caption: scene.subtitle || '',
      };
    }

    // Card grid templates
    if (['template-023'].includes(templateId)) {
      return {
        cards: contentItems.map(text => ({ image: '', title: text, description: '' })),
      };
    }

    // Text/body templates
    if (['template-021', 'template-036', 'template-058'].includes(templateId)) {
      return {
        title: scene.title || '',
        body: contentItems.join(' '),
        image: '',
      };
    }

    // Caption/callout templates
    if (['template-041', 'template-050'].includes(templateId)) {
      return {
        title: scene.title || '',
        caption: contentItems.join(' '),
      };
    }

    // Definition/term templates
    if (['template-026', 'template-054'].includes(templateId)) {
      return {
        term: scene.title || '',
        title: scene.title || '',
        definition: contentItems.join(' '),
        example: '',
      };
    }

    // Social media templates
    if (['template-044'].includes(templateId)) {
      return {
        body: contentItems.join(' '),
        profileImage: '',
        username: '',
        likes: '0',
      };
    }

    // News/headline templates
    if (['template-043'].includes(templateId)) {
      return {
        headline: scene.title || '',
        body: contentItems.join(' '),
        badge: '',
        image: '',
      };
    }

    // Device/product templates
    if (['template-046'].includes(templateId)) {
      return {
        deviceImage: '',
        specs: contentItems,
      };
    }

    // Instruction/step templates
    if (['template-049', 'template-013', 'template-032'].includes(templateId)) {
      return {
        title: scene.title || '',
        step: '',
        body: contentItems.join(' '),
      };
    }

    // Metric templates
    if (['template-051', 'template-055'].includes(templateId)) {
      return {
        image: '',
        metric: contentItems[0] || '',
        metricLabel: contentItems[1] || '',
      };
    }

    // Recipe/ingredient templates
    if (['template-052'].includes(templateId)) {
      return {
        image: '',
        ingredients: contentItems,
      };
    }

    // Location/travel templates
    if (['template-053'].includes(templateId)) {
      return {
        location: scene.title || '',
        image: '',
      };
    }

    // Date/event templates
    if (['template-059'].includes(templateId)) {
      return {
        image: '',
        date: contentItems[0] || '',
      };
    }

    // Caption/joke templates
    if (['template-060'].includes(templateId)) {
      return {
        caption: contentItems.join(' '),
      };
    }

    // Countdown templates
    if (['template-012'].includes(templateId)) {
      return {
        title: scene.title || '',
        message: contentItems.join(' '),
        timeBlocks: contentItems.map(() => ({ value: '', label: '' })),
      };
    }

    // Tags/skills templates
    if (['template-008', 'template-034'].includes(templateId)) {
      return {
        title: scene.title || '',
        tags: contentItems.map(text => ({ text, icon: '' })),
      };
    }

    // Feature list templates
    if (['template-015'].includes(templateId)) {
      return {
        title: scene.title || '',
        features: contentItems.map(text => ({ icon: '', title: text, description: '' })),
      };
    }

    // Summary/cards templates
    if (['template-030'].includes(templateId)) {
      return {
        badge: '',
        title: scene.title || '',
        body: contentItems.join(' '),
        stats: contentItems.map(text => ({ value: text, label: '' })),
      };
    }

    // Milestones/year templates
    if (['template-031', 'template-037'].includes(templateId)) {
      return {
        title: scene.title || '',
        meta: '',
        items: contentItems.map(text => ({ year: '', title: text, description: '' })),
      };
    }

    // Background image templates
    if (['template-045'].includes(templateId)) {
      return {
        backgroundImage: '',
        caption: contentItems.join(' '),
      };
    }

    // Generic caption templates
    if (['template-056', 'template-057'].includes(templateId)) {
      return {
        caption: contentItems.join(' '),
        image: '',
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