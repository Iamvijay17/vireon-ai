const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const LoggerService = require('./LoggerService');
const { DEFAULT_SCENE_DURATION, VIDEO_TYPES } = require('../constants');

/**
 * Service for parsing, validating and saving generated scripts.
 * Single Responsibility: Script validation and file persistence.
 */
class ScriptParserService {
  /**
   * Validate the structure of a generated script.
   */
  /**
   * Valid scene types.
   * Each scene can be one of:
   *   - "title":    Opening title card (text only, no image)
   *   - "content":  Informational/educational content (text only, no image)
   *   - "image":    Visual scene with image generation (requires imagePrompt)
   *   - "end":      Closing/ending scene (text only, no image)
   */
  static VALID_SCENE_TYPES = ['title', 'content', 'image', 'end'];

  static validate(scriptData, videoType = 'educational') {
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

    // Set defaults for missing optional fields
    scriptData.scenes = scriptData.scenes.map((scene) => {
      const sceneType = scene.sceneType || 'content';

      // If LLM didn't provide templateId, assign a default based on video type + scene type
      let templateId = scene.templateId || '';
      if (!templateId) {
        templateId = ScriptParserService._getDefaultTemplateForType(resolvedType, scene.sceneNumber, sceneType);
      }

      // Ensure elements structure matches the template
      let elements = scene.elements || null;
      if (!elements && templateId) {
        elements = ScriptParserService._createDefaultElements(templateId, scene);
      }

      // Only keep imagePrompt for "image" scenes; clear for others to skip generation
      const imagePrompt = sceneType === 'image' ? (scene.imagePrompt || '') : '';

      return {
        sceneNumber: scene.sceneNumber,
        sceneType,
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        duration: scene.duration || DEFAULT_SCENE_DURATION,
        backgroundColor: scene.backgroundColor || '#1a1a2e',
        transition: scene.transition || 'fade',
        imagePrompt,
        cameraMotion: scene.cameraMotion || 'static',
        animation: scene.animation || '',
        // Template-based rendering fields
        templateId,
        elements,
        audio: {
          text: scene.audio?.text || '',
          file: '',
          duration: 0,
          voice: scene.audio?.voice || '',
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
    const templateMap = {
      educational: ['template-001', 'template-009', 'template-013', 'template-026', 'template-027', 'template-032', 'template-041', 'template-054'],
      podcast: ['template-042', 'template-048', 'template-031', 'template-036'],
      marketing: ['template-005', 'template-007', 'template-010', 'template-015', 'template-028', 'template-033', 'template-003'],
      story: ['template-017', 'template-020', 'template-021', 'template-022', 'template-023', 'template-045', 'template-058'],
      motivational: ['template-006', 'template-029', 'template-047', 'template-004', 'template-019'],
      business: ['template-004', 'template-011', 'template-014', 'template-030', 'template-036', 'template-038', 'template-055'],
      youtube_shorts: ['template-044', 'template-050', 'template-051', 'template-052', 'template-053', 'template-016'],
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
    };

    return templateElements[templateId] || base;
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
