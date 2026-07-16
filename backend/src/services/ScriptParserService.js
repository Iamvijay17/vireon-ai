const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const LoggerService = require('./LoggerService');
const { DEFAULT_SCENE_DURATION } = require('../constants');

/**
 * Service for parsing, validating and saving generated scripts.
 * Single Responsibility: Script validation and file persistence.
 */
class ScriptParserService {
  /**
   * Validate the structure of a generated script.
   */
  static validate(scriptData) {
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
        if (!scene.imagePrompt) errors.push(`Scene ${index}: missing imagePrompt`);
      });
    }

    if (errors.length > 0) {
      LoggerService.warn('Script validation failed', { errors });
      throw new Error(`Script validation failed: ${errors.join('; ')}`);
    }

    // Set defaults for missing optional fields
    scriptData.scenes = scriptData.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      title: scene.title || '',
      subtitle: scene.subtitle || '',
      duration: scene.duration || DEFAULT_SCENE_DURATION,
      backgroundColor: scene.backgroundColor || '#1a1a2e',
      transition: scene.transition || 'fade',
      imagePrompt: scene.imagePrompt || '',
      cameraMotion: scene.cameraMotion || 'static',
      animation: scene.animation || '',
      // Template-based rendering fields
      templateId: scene.templateId || '',
      elements: scene.elements || null,
      audio: {
        text: scene.audio?.text || '',
        file: '',
        duration: 0,
        voice: scene.audio?.voice || '',
      },
    }));

    return {
      title: scriptData.title,
      description: scriptData.description || '',
      tags: Array.isArray(scriptData.tags) ? scriptData.tags : [],
      thumbnailPrompt: scriptData.thumbnailPrompt || '',
      scenes: scriptData.scenes,
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
