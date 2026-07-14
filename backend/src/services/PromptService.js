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
   * Load a template by video type name.
   */
  static loadTemplate(type) {
    if (this.#cache.has(type)) {
      return this.#cache.get(type);
    }

    const filePath = path.join(TEMPLATES_DIR, `${type}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template not found for type: ${type}`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const template = JSON.parse(raw);
    this.#cache.set(type, template);
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
