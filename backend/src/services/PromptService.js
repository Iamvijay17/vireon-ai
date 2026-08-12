const path = require('path');
const fs = require('fs');
const LoggerService = require('./LoggerService');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

/**
 * Service responsible for loading and rendering prompt templates.
 * Single Responsibility: Template management and placeholder replacement.
 */
class PromptService {
  static #cache = new Map();

  /**
   * Load a template by video type name. Cached per type, but invalidated
   * against the file's mtime - templates are meant to be hand-edited while
   * a long-running worker process is up (this was found the hard way: an
   * edited podcast.json silently kept serving the pre-edit prompt for the
   * rest of the process's life), so a stale in-memory copy would otherwise
   * survive indefinitely.
   */
  static loadTemplate(type) {
    const filePath = path.join(TEMPLATES_DIR, `${type}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template not found for type: ${type}`);
    }

    const mtimeMs = fs.statSync(filePath).mtimeMs;
    const cached = this.#cache.get(type);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.template;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const template = JSON.parse(raw);
    this.#cache.set(type, { template, mtimeMs });
    return template;
  }

  /**
   * Render a template by replacing placeholders with actual values.
   */
  static render(type, variables) {
    const template = this.loadTemplate(type);
    let prompt = template.prompt;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      prompt = prompt.replace(placeholder, value);
    }

    LoggerService.debug('Prompt rendered', { type, variables });
    return prompt;
  }

  /**
   * Get all available template types.
   */
  static getAvailableTypes() {
    const files = fs.readdirSync(TEMPLATES_DIR);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  }

  /**
   * Clear template cache (useful in development).
   */
  static clearCache() {
    this.#cache.clear();
  }
}

module.exports = PromptService;
