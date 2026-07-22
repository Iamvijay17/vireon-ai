const axios = require('axios');
const config = require('../config');
const LoggerService = require('./LoggerService');

/**
 * Service for interacting with LM Studio (Gemma) API.
 * Single Responsibility: AI text generation via LM Studio.
 */
class LMStudioService {
  /**
   * Call LM Studio's chat-completions endpoint and parse a JSON object out
   * of the response, with retry + exponential backoff. Shared by
   * generateScript and generateCurriculum.
   */
  static async _callLLM(prompt, { maxTokens = 10000, timeout = config.lmStudio.timeout } = {}) {
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
            max_tokens: maxTokens,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout,
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

        return JSON.parse(cleaned);
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

  /**
   * Generate script by calling LM Studio API with the rendered prompt.
   */
  static async generateScript(prompt) {
    const parsed = await this._callLLM(prompt);

    LoggerService.lmstudio(`Script generated successfully`, {
      title: parsed.title,
      scenes: parsed.scenes?.length,
    });

    return parsed;
  }

  /**
   * Generate a full Udemy-style course curriculum: an ordered list of
   * lessons covering the topic from introduction through a practical
   * summary. Returns { lessons: [{ order, title, topic, description }] }.
   * Uses a longer timeout than a single script - curriculum responses are
   * larger (10-20 items) even though each item is short.
   */
  static async generateCurriculum(courseTitle, topic) {
    const prompt = `Design a complete Udemy-style course curriculum for a course titled "${courseTitle}" about "${topic}".

Return ONLY valid JSON with this structure:
{
  "lessons": [
    { "order": 1, "title": "Introduction", "topic": "Course overview and what students will learn", "description": "Short one-sentence summary" }
  ]
}

Rules:
- Produce 12-20 lessons, ordered logically like a real Udemy course: start with an intro/overview, cover fundamentals, then core concepts one at a time, then a practical/project lesson, then a course summary/next-steps lesson.
- "title" is the short lesson name shown in a course outline (e.g., "What is React?", "Components", "State").
- "topic" is 1-2 sentences describing exactly what that lesson's video should teach - this is used later to generate that lesson's script, so make it specific and actionable.
- "description" is a short one-sentence summary for display purposes.
- Return ONLY valid JSON, no markdown, no code blocks, no commentary.`;

    const parsed = await this._callLLM(prompt, {
      maxTokens: 6000,
      timeout: Math.max(config.lmStudio.timeout, 90000),
    });

    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];
    if (lessons.length === 0) {
      throw new Error('LM Studio returned no lessons for curriculum');
    }

    LoggerService.lmstudio('Curriculum generated successfully', {
      courseTitle,
      lessons: lessons.length,
    });

    return lessons;
  }
}

module.exports = LMStudioService;
