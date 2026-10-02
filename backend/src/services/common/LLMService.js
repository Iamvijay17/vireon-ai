const axios = require('axios');
const config = require('../../config');
const LoggerService = require('./LoggerService');
const JsonRepairService = require('./JsonRepairService');
const LocalAIService = require('../localAI');

const PROVIDER_LABEL = { lmstudio: 'LM Studio', ollama: 'Ollama' };

/**
 * Service for interacting with the local LLM - LM Studio or Ollama, picked
 * by LLM_PROVIDER (config.llm.provider).
 * Single Responsibility: AI text generation via the local LLM server.
 */
class LLMService {
  static get providerLabel() {
    return PROVIDER_LABEL[config.llm.provider] || config.llm.provider;
  }

  static get model() {
    return config.llm.provider === 'ollama' ? config.ollama.model : config.lmStudio.model;
  }

  /** LM Studio: OpenAI-compatible chat-completions. Returns the raw text. */
  static async _requestLMStudio(prompt, { maxTokens, timeout }) {
    const response = await axios.post(
      config.lmStudio.url,
      {
        model: config.lmStudio.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout }
    );
    return response.data?.choices?.[0]?.message?.content;
  }

  /**
   * Ollama: native /api/chat - see config.ollama for why not /v1. format:
   * 'json' constrains decoding to valid JSON, so JsonRepairService below
   * should rarely have anything to do on this path. num_ctx is kept fixed
   * (config.ollama.numCtx) rather than sized per request: changing it makes
   * Ollama reload the model, which on this 6GB card costs more than the
   * extra context does.
   */
  static async _requestOllama(prompt, { maxTokens, timeout }) {
    const { url, model, numCtx, think, keepAlive } = config.ollama;

    // ~3.5 chars/token is a rough English estimate - only used to warn,
    // never to decide anything.
    const estimatedPromptTokens = Math.ceil(prompt.length / 3.5);
    if (estimatedPromptTokens + maxTokens > numCtx) {
      LoggerService.warn('Ollama request may exceed num_ctx - raise OLLAMA_NUM_CTX if responses come back truncated', {
        numCtx,
        estimatedPromptTokens,
        maxTokens,
      });
    }

    const response = await axios.post(
      `${url}/api/chat`,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        think,
        keep_alive: keepAlive,
        options: {
          temperature: 0.7,
          num_ctx: numCtx,
          num_predict: maxTokens,
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout }
    );

    if (response.data?.done_reason === 'length') {
      LoggerService.warn('Ollama stopped at the token limit - response may be truncated', {
        numCtx,
        maxTokens,
        evalCount: response.data?.eval_count,
      });
    }
    return response.data?.message?.content;
  }

  /**
   * Call the configured LLM and parse a JSON object out of the response,
   * with retry + exponential backoff. Shared by generateScript and
   * generateCurriculum.
   */
  static async _callLLM(prompt, { maxTokens = 10000, timeout = config.llm.timeout } = {}) {
    // Auto-start the LLM server (and load the configured model) instead of
    // requiring the user to have opened it by hand first. Cheap to call on
    // every request - it's just a health check once the server is already up.
    await LocalAIService.llm.ensureRunning();

    const label = this.providerLabel;
    const request = config.llm.provider === 'ollama' ? this._requestOllama : this._requestLMStudio;
    let lastError = null;

    for (let attempt = 1; attempt <= config.llm.maxRetries; attempt++) {
      try {
        LoggerService.lmstudio(`Attempt ${attempt}/${config.llm.maxRetries}`, {
          provider: config.llm.provider,
          model: this.model,
        });

        const content = await request.call(this, prompt, { maxTokens, timeout });
        if (!content) {
          throw new Error(`Empty response from ${label}`);
        }

        // Clean response - remove markdown code blocks if present
        const cleaned = content
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        try {
          return JSON.parse(cleaned);
        } catch (parseErr) {
          // Local models frequently produce near-valid JSON on larger
          // responses - a literal newline left inside a narration string
          // ("Expected property name or '}'"), a trailing comma, or
          // generation stopping mid-structure ("Unexpected end of JSON
          // input"). Try to repair before burning a whole attempt (and
          // several more minutes of generation) over a fixable slip.
          const repaired = JsonRepairService.parse(cleaned);
          LoggerService.warn(`${label} response needed JSON repair before parsing`, {
            originalError: parseErr.message,
          });
          return repaired;
        }
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.llm.maxRetries;

        LoggerService.warn(
          `${label} attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`,
          {
            // LM Studio nests the message under error.message, Ollama
            // returns { error: "..." } directly.
            error: err.response?.data?.error?.message || err.response?.data?.error || err.message,
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

    // "<Provider> failed after N attempts" - utils/errorMessages.js matches
    // this wording to show a friendly message.
    throw new Error(`${label} failed after ${config.llm.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Generate script by calling the local LLM with the rendered prompt.
   * `options` (maxTokens/timeout) should scale with the requested script
   * size - see videoWorker.js's estimate. The 10000-token default only
   * covers short scripts; longer ones get cut off mid-JSON ("Unexpected end
   * of JSON input") if the caller doesn't raise it.
   */
  static async generateScript(prompt, options = {}) {
    const parsed = await this._callLLM(prompt, options);

    LoggerService.lmstudio(`Script generated successfully`, {
      title: parsed.title,
      scenes: parsed.scenes?.length,
    });

    return parsed;
  }

  /**
   * Generate a full Udemy-style course curriculum: a course subtitle, a
   * course-level promotional trailer pitch (NOT a lesson - it's rendered
   * separately as the course's single trailer video), and an ordered list
   * of lessons covering the topic from introduction through a practical
   * summary. Returns { subtitle, promo: { title, topic, description }, lessons }.
   * Uses a longer timeout than a single script - curriculum responses are
   * larger (10-20 items) even though each item is short.
   */
  static async generateCurriculum(courseTitle, topic) {
    const prompt = `Design a complete Udemy-style course curriculum for a course titled "${courseTitle}" about "${topic}".

Return ONLY valid JSON with this structure:
{
  "subtitle": "A short, catchy one-line course tagline (under 15 words)",
  "description": "A compelling 2-4 paragraph landing-page description of the course - what it covers, how it's taught, and the outcome a student walks away with",
  "learningObjectives": ["4-8 short bullet points, each starting with a verb, describing a concrete skill or outcome the student will have after finishing"],
  "requirements": ["2-5 short bullet points listing what a student needs before starting (prior knowledge, software, hardware) - use \\"No prior experience needed\\" style entries if the course is truly beginner-friendly"],
  "targetAudience": ["3-5 short bullet points describing who this course is for, e.g. specific roles, skill levels, or goals"],
  "welcomeMessage": "A short, encouraging 2-3 sentence message automatically sent to a student the moment they enroll - welcome them, set expectations, and point them at lesson 1",
  "congratulationsMessage": "A short, encouraging 2-3 sentence message automatically sent to a student the moment they complete every lesson - congratulate them and suggest a next step",
  "promo": { "title": "Course Trailer", "topic": "A short, energetic promotional pitch for the whole course - who it's for, what they'll be able to do after finishing, and why they should enroll now", "description": "Course promo/trailer video" },
  "lessons": [
    { "order": 1, "title": "Welcome to the Course", "topic": "A short welcome that introduces the instructor and names the topics covered ahead, without teaching any of them yet", "description": "Short one-sentence summary" }
  ]
}

Rules:
- "promo" is COURSE-LEVEL, not a lesson - it is the pitch for one standalone trailer video for the whole course, separate from the lesson list. It must NOT teach any technical content, only sell the course itself (who it's for, what they'll be able to do after finishing, why enroll now).
- Produce 12-20 regular lessons (order 1, 2, 3, ...), ordered logically like a real Udemy course: start with a short welcome/orientation lesson, cover fundamentals, then core concepts one at a time, then a practical/project lesson, then a course summary/next-steps lesson.
- "title" is the short lesson name shown in a course outline (e.g., "What is React?", "Components", "State").
- "topic" is 1-2 sentences describing exactly what THAT ONE lesson's video should teach - this is used later to generate that lesson's script IN ISOLATION, with no knowledge of the other lessons, so it must be narrow and self-contained.
- Each lesson's "topic" must cover ONLY that lesson's own slice of the subject. Do not let one lesson's topic summarize, preview, or teach content assigned to other lessons.
- The first lesson's (order 1) "topic" must be a brief welcome/orientation only (who this course is for, what topics are ahead) - it must NOT preview or teach any actual technical content, since that belongs to the later lessons.
- "description" (per-lesson) is a short one-sentence summary for display purposes.
- "subtitle", the course-level "description", "learningObjectives", "requirements", "targetAudience", "welcomeMessage", and "congratulationsMessage" are all course-level, not per-lesson - each appears exactly once for the whole course.
- Return ONLY valid JSON, no markdown, no code blocks, no commentary.`;

    const parsed = await this._callLLM(prompt, {
      maxTokens: 6000,
      timeout: Math.max(config.llm.timeout, 90000),
    });

    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];
    if (lessons.length === 0) {
      throw new Error(`${this.providerLabel} returned no lessons for curriculum`);
    }

    const subtitle = typeof parsed?.subtitle === 'string' ? parsed.subtitle : '';
    const description = typeof parsed?.description === 'string' ? parsed.description : '';
    const welcomeMessage = typeof parsed?.welcomeMessage === 'string' ? parsed.welcomeMessage : '';
    const congratulationsMessage =
      typeof parsed?.congratulationsMessage === 'string' ? parsed.congratulationsMessage : '';

    const asStringList = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []);
    const learningObjectives = asStringList(parsed?.learningObjectives);
    const requirements = asStringList(parsed?.requirements);
    const targetAudience = asStringList(parsed?.targetAudience);

    // Fall back to a generic pitch if the model omitted "promo" entirely,
    // so the course always gets a trailer video option.
    const promo = parsed?.promo && typeof parsed.promo === 'object'
      ? {
          title: parsed.promo.title || 'Course Trailer',
          topic: parsed.promo.topic || '',
          description: parsed.promo.description || 'Course promo/trailer video',
        }
      : {
          title: 'Course Trailer',
          topic: `A short, energetic promotional pitch for the course "${courseTitle}" about "${topic}" - who it's for, what they'll be able to do after finishing, and why they should enroll now.`,
          description: 'Course promo/trailer video',
        };

    LoggerService.lmstudio('Curriculum generated successfully', {
      courseTitle,
      lessons: lessons.length,
    });

    return {
      subtitle,
      description,
      learningObjectives,
      requirements,
      targetAudience,
      welcomeMessage,
      congratulationsMessage,
      promo,
      lessons,
    };
  }
}

module.exports = LLMService;
