const LoggerService = require('../common/LoggerService');
const { SOCIAL_PLATFORM } = require('../../constants');
const { normalizeHashtags, measureLength } = require('./contentRules');
const { LIMITS } = require('./constants');

/**
 * Per-platform promotional copy from the local LLM (Ollama, via LLMService) -
 * no paid API. The model is asked for ONE JSON object holding a differently
 * written variant per platform, and everything it returns is treated as
 * untrusted text: hashtags are re-normalised, lengths are trimmed to what the
 * platform allows, and an unusable answer is an error (the UI then lets the
 * user write the copy by hand) rather than a half-filled post.
 */

const STYLE = {
  [SOCIAL_PLATFORM.FACEBOOK]: 'Facebook Page post: conversational, 2-4 short paragraphs or lines, may use a few emoji, ends with a clear call to action. 2-5 hashtags at most.',
  [SOCIAL_PLATFORM.INSTAGRAM]: 'Instagram caption for a Reel: a strong first line (it is what shows before "more"), short punchy lines, a few emoji, a call to action, and 5-12 relevant hashtags. Never include a raw URL (links are not clickable).',
  [SOCIAL_PLATFORM.THREADS]: 'Threads post: under 300 characters of text, one idea, conversational and human, at most one hashtag. No hashtag spam.',
};

const TONE_GUIDE = {
  professional: 'professional, credible and clear',
  educational: 'educational, helpful, explains the value of learning this',
  entertaining: 'entertaining, playful, with personality',
  promotional: 'promotional, benefit-led and persuasive without sounding spammy',
  casual: 'casual, friendly, like a person talking',
};

class CaptionUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'CaptionUnavailableError';
    this.status = 503;
    this.code = 'AI_UNAVAILABLE';
    if (cause) this.cause = cause;
  }
}

function buildPrompt({ platforms, tone, video, brief }) {
  const lines = [
    'You write social media promotion copy for an AI-generated video. Write each platform\'s copy DIFFERENTLY - do not reuse the same caption.',
    '',
    `Video title: ${video.title || '(untitled)'}`,
    video.description ? `Video description: ${video.description}` : '',
    video.excerpt ? `Narration excerpt: ${video.excerpt}` : '',
    brief.topic ? `Topic: ${brief.topic}` : '',
    brief.goal ? `Campaign goal: ${brief.goal}` : '',
    brief.audience ? `Target audience: ${brief.audience}` : '',
    brief.cta ? `Call to action to use: ${brief.cta}` : 'Call to action: invite viewers to watch the video.',
    `Tone: ${TONE_GUIDE[tone] || TONE_GUIDE.casual}.`,
    '',
    'Platforms to write for:',
    ...platforms.map((p) => `- ${p}: ${STYLE[p]}`),
    '',
    'Rules:',
    '- Only state things the video information above supports. Do not invent statistics, prices, guarantees or claims.',
    '- "hashtags" are words without the # sign and without spaces.',
    '- "cta" is one short sentence (it may already be part of the caption; keep it separate and brief).',
    '- Return ONLY valid JSON, no markdown, no commentary, in exactly this shape:',
    `{ ${platforms.map((p) => `"${p}": { "caption": "...", "hashtags": ["..."], "cta": "..." }`).join(', ')} }`,
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/** Trim `text` to at most `max` characters on a sentence/word boundary. */
function trimTo(text, max, platform) {
  if (measureLength(platform, text) <= max) return text;
  const chars = [...text];
  let cut = chars.slice(0, max).join('');
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  if (sentence > max * 0.5) cut = cut.slice(0, sentence + 1);
  else {
    const word = cut.lastIndexOf(' ');
    if (word > max * 0.5) cut = cut.slice(0, word);
  }
  return cut.trim();
}

/** Turn one raw model variant into a safe, platform-fitting {caption, hashtags, cta}. */
function sanitizeVariant(platform, raw, { destinationUrl = '' } = {}) {
  const caption = String(raw?.caption ?? '').replace(/\r/g, '').trim();
  const cta = String(raw?.cta ?? '').trim().slice(0, 200);
  let hashtags = normalizeHashtags(raw?.hashtags);
  if (platform === SOCIAL_PLATFORM.THREADS) hashtags = hashtags.slice(0, 1);
  if (platform === SOCIAL_PLATFORM.INSTAGRAM) hashtags = hashtags.slice(0, LIMITS.instagram.maxHashtags);
  if (platform === SOCIAL_PLATFORM.FACEBOOK) hashtags = hashtags.slice(0, 8);

  let body = caption;
  if (platform === SOCIAL_PLATFORM.INSTAGRAM) body = trimTo(body, 1500, platform);
  if (platform === SOCIAL_PLATFORM.THREADS) {
    // Leave room for the cta/hashtag/link that composeText() appends, inside Threads' 500.
    const reserved = (cta ? measureLength(platform, cta) + 2 : 0) + hashtags.join(' ').length + 2 + (destinationUrl ? destinationUrl.length + 2 : 0);
    body = trimTo(body, Math.max(80, LIMITS.threads.maxText - reserved), platform);
  }
  return { caption: body, hashtags, cta, linkUrl: platform === SOCIAL_PLATFORM.INSTAGRAM ? '' : destinationUrl, origin: 'ai' };
}

class CaptionService {
  /** @param {{ llm?: { _callLLM: Function } }} deps injectable for tests */
  constructor({ llm } = {}) {
    this._llm = llm;
  }

  get llm() {
    return this._llm || require('../common/LLMService');
  }

  /**
   * @param {object} p
   * @param {string[]} p.platforms subset of SOCIAL_PLATFORM
   * @param {string} p.tone
   * @param {{title,description,excerpt}} p.video
   * @param {object} p.brief campaign brief
   * @returns {Promise<Record<string, {caption,hashtags,cta,linkUrl,origin}>>} only the platforms that came back usable
   */
  async generate({ platforms, tone = 'casual', video, brief = {} }) {
    const wanted = platforms.filter((p) => STYLE[p]);
    if (!wanted.length) return {};

    let parsed;
    try {
      parsed = await this.llm._callLLM(buildPrompt({ platforms: wanted, tone, video, brief }), { maxTokens: 1800, timeout: 120000 });
    } catch (err) {
      LoggerService.warn('Caption generation failed', { error: err.message });
      throw new CaptionUnavailableError('The local AI could not write captions right now. You can write them by hand and generate again later.', err);
    }

    const out = {};
    for (const platform of wanted) {
      const raw = parsed?.[platform];
      if (!raw || typeof raw.caption !== 'string' || !raw.caption.trim()) continue;
      out[platform] = sanitizeVariant(platform, raw, { destinationUrl: brief.destinationUrl || '' });
    }
    if (!Object.keys(out).length) {
      throw new CaptionUnavailableError('The local AI returned no usable captions. Try again, or write them by hand.');
    }
    return out;
  }
}

module.exports = CaptionService;
module.exports.CaptionUnavailableError = CaptionUnavailableError;
module.exports.sanitizeVariant = sanitizeVariant;
module.exports.buildPrompt = buildPrompt;
