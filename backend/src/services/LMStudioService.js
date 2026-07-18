const axios = require('axios');
const config = require('../config');
const LoggerService = require('./LoggerService');

/**
 * Service for interacting with LM Studio (Gemma) API.
 * Single Responsibility: AI text generation via LM Studio.
 */
class LMStudioService {
  /**
   * Generate script by calling LM Studio API with the rendered prompt.
   * Implements retry logic with exponential backoff.
   */
  static async generateScript(prompt) {
    let lastError = null;

    for (let attempt = 1; attempt <= config.lmStudio.maxRetries; attempt++) {
      try {
        LoggerService.lmstudio(`Attempt ${attempt}/${config.lmStudio.maxRetries}`, {
          model: config.lmStudio.model,
        });

        const response = await axios.post(
          config.lmStudio.url,
          {
            model: config.lmStudio.model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 10000,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: config.lmStudio.timeout,
          }
        );

        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from LM Studio');
        }

        // Clean response - remove markdown code blocks if present
        const cleaned = content
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        const parsed = JSON.parse(cleaned);

        LoggerService.lmstudio(`Script generated successfully`, {
          title: parsed.title,
          scenes: parsed.scenes?.length,
        });

        return parsed;
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.lmStudio.maxRetries;

        LoggerService.warn(
          `LM Studio attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`,
          {
            error: err.response?.data?.error?.message || err.message,
            status: err.response?.status,
          }
        );

        if (!isLastAttempt) {
          // Exponential backoff: 2s, 4s, 8s...
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`LM Studio failed after ${config.lmStudio.maxRetries} attempts: ${lastError.message}`);
  }
}

module.exports = LMStudioService;
