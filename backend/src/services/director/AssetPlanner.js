const { MAX_IMAGE_PROMPT_CHARS, MIN_IMAGE_PROMPT_CHARS } = require('./schemas');

/**
 * Plans the generated pictures: which scenes get one and the dedicated prompt
 * each is generated from.
 *
 * The prompt is built from the scene's purpose, its narration, the video's shared
 * visual style, the audience, and what the neighbouring scenes are about - not
 * pasted from whatever the script LLM wrote on its first pass. All deterministic:
 * the same scene and context always give the same prompt, which is what lets the
 * image cache (keyed on the prompt) recognise a picture it has already made.
 *
 * Idempotent: running it again on its own output changes nothing.
 */

/** Who the picture is for, per video type. Derived - a job has no audience field. */
const AUDIENCE_BY_TYPE = Object.freeze({
  educational: 'clear, instructional look for curious learners',
  business: 'clean, credible look for busy professionals',
  marketing: 'vibrant, aspirational look for prospective customers',
  story: 'cinematic, emotional look for story lovers',
  motivational: 'uplifting, energetic look for people seeking motivation',
  youtube_shorts: 'bold, high-contrast, eye-catching look for short-form viewers',
  podcast: 'warm, inviting studio feel',
});

/** How the shot is framed, per what the scene is for. */
const FRAMING_BY_PURPOSE = Object.freeze({
  hook: 'dramatic, attention-grabbing composition',
  introduction: 'welcoming establishing shot',
  explanation: 'clear, illustrative composition',
  example: 'concrete real-world scene',
  comparison: 'balanced, symmetrical composition',
  data: 'clean, minimal, symbolic composition',
  quote: 'contemplative, atmospheric composition',
  summary: 'calm, resolved composition',
  conclusion: 'calm, resolved composition',
  cta: 'energetic, inviting composition',
  transition: 'soft, atmospheric composition',
});

const norm = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const tokens = (text) => new Set(norm(text).split(/[^a-z0-9]+/).filter((t) => t.length > 2));

/** Share of words two prompts have in common (0-1). */
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => { if (tb.has(t)) shared += 1; });
  return shared / (ta.size + tb.size - shared);
}

const leadSentence = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const first = clean.match(/^.{12,}?[.!?](\s|$)/);
  return (first ? first[0] : clean).trim().slice(0, 140);
};

/** Add each part only if the prompt does not already say it, so re-running is a no-op. */
function joinParts(parts) {
  let prompt = '';
  for (const part of parts.map((p) => String(p || '').trim().replace(/[,;.\s]+$/, '')).filter(Boolean)) {
    if (!norm(prompt).includes(norm(part))) prompt = prompt ? `${prompt}, ${part}` : part;
  }
  return prompt;
}

/**
 * @param {object} p
 * @param {string} p.base          the prompt so far (the Director's, or the script's) - may be ''
 * @param {object} p.scene
 * @param {string} p.purpose
 * @param {object} p.styleGuide    { visualPalette }
 * @param {string} p.videoType
 */
function composeImagePrompt({ base, scene, purpose, styleGuide = {}, videoType }) {
  const subject = String(base || '').trim()
    || [scene?.title, leadSentence(scene?.audio?.text)].filter(Boolean).join(': ');
  // Framing and style describe HOW to draw something; with nothing to draw there is no picture.
  if (!subject) return '';
  const prompt = joinParts([
    subject,
    FRAMING_BY_PURPOSE[purpose],
    AUDIENCE_BY_TYPE[videoType],
    styleGuide.visualPalette,
  ]);
  return prompt.length > MAX_IMAGE_PROMPT_CHARS ? prompt.slice(0, MAX_IMAGE_PROMPT_CHARS).replace(/[,\s]+\S*$/, '') : prompt;
}

const ROLE_BY_STRATEGY = Object.freeze({ 'full-screen-visual': 'hero', 'visual-explanation': 'hero' });
const ALT_FRAMING = ['wide establishing view', 'close-up detail', 'low-angle perspective', 'overhead view'];

/**
 * @param {Array<{ sceneNumber:number, hasImage:boolean, scene:object, purpose:string, strategy:string, previous:string, next:string }>} items
 * @param {{ styleGuide:object, videoType:string }} ctx
 * @returns {Array<object>} one AssetPlan per item (see schemas.AssetPlanSchema)
 */
function planAssets(items, { styleGuide, videoType }) {
  const made = [];
  return items.map((item) => {
    if (!item.hasImage) {
      return { sceneNumber: item.sceneNumber, needsImage: false, imagePrompt: '', role: 'none', status: 'none', context: { previous: item.previous, next: item.next } };
    }

    let imagePrompt = composeImagePrompt({
      base: item.scene.imagePrompt || item.scene.storyboard?.visual?.prompt,
      scene: item.scene,
      purpose: item.purpose,
      styleGuide,
      videoType,
    });

    // Two scenes asking for nearly the same picture would show the same picture
    // twice (and the cache would serve it): give the later one a different shot.
    // Podcast turns share one cover on purpose, so they are left alone.
    if (videoType !== 'podcast') {
      const clash = made.filter((m) => similarity(m, imagePrompt) >= 0.8).length;
      if (clash > 0) {
        imagePrompt = joinParts([imagePrompt, ALT_FRAMING[(clash - 1) % ALT_FRAMING.length]]);
      }
      made.push(imagePrompt);
    }

    if (imagePrompt.length < MIN_IMAGE_PROMPT_CHARS) {
      return { sceneNumber: item.sceneNumber, needsImage: false, imagePrompt: '', role: 'none', status: 'none', context: { previous: item.previous, next: item.next } };
    }
    return {
      sceneNumber: item.sceneNumber,
      needsImage: true,
      imagePrompt,
      role: ROLE_BY_STRATEGY[item.strategy] || 'supporting',
      status: 'pending',
      context: { previous: item.previous, next: item.next },
    };
  });
}

module.exports = { planAssets, composeImagePrompt, similarity, AUDIENCE_BY_TYPE, FRAMING_BY_PURPOSE };
