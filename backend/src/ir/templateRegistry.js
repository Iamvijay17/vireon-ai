const { z } = require('zod');

/**
 * Backend-side registry of what the Remotion templates can draw and what
 * `elements` shape each family reads.
 *
 * The ids mirror remotion/src/templates/TemplateCategories.js (backend/src
 * is CommonJS and can't import that ESM package). Every id within a family
 * renders the exact same elements shape - they're alternate layouts, not
 * alternate contracts - so the props schema is keyed by family, and a
 * templateId resolves to its family first.
 *
 * Shapes come from each template's own JSDoc header and from
 * ScriptParserService._createDefaultElements, which is what populates them.
 * Fields are optional and type-checked rather than required: every template
 * reads with `elements.x || ''`, so a missing key renders fine, while a
 * wrong type (items as a string, image as an object) is what actually
 * breaks inside headless Chrome.
 */

const SCENE_TYPES = ['title', 'content', 'image', 'contentwithimage', 'podcast'];

const SCENE_TYPE_TEMPLATE_IDS = {
  title: ['001-title', '002-title', '003-title', '004-title', '005-title', '006-title', '007-title', '008-title', '009-title', '010-title'],
  content: ['001-content', '002-content', '003-content', '004-content', '005-content', '006-content', '007-content', '008-content', '009-content', '010-content', '011-content', '012-content', '013-content', '014-content', '015-content'],
  contentwithimage: ['001-contentwithimage', '002-contentwithimage', '003-contentwithimage', '004-contentwithimage', '005-contentwithimage', '006-contentwithimage', '007-contentwithimage', '008-contentwithimage', '009-contentwithimage'],
  image: ['001-image', '002-image', '003-image', '004-image', '005-image', '006-image', '007-image', '008-image', '009-image', '010-image'],
  podcast: ['001-podcast', '002-podcast'],
};

// One shared id across every family - the Generative Scene Engine reads the
// same per-family elements shape and computes layout from it.
const GENERATIVE_TEMPLATE_ID = 'generative';
const GENERATIVE_SUPPORTED_SCENE_TYPES = [...SCENE_TYPES];

// Present on every family: per-scene style overrides the Studio editor
// writes, plus CaptionRenderer's spoken-caption inputs.
const commonElements = {
  backgroundColor: z.string().optional(),
  styleConfig: z.record(z.any()).optional(),
  caption: z.string().optional(),
  captionTimestamps: z.any().nullable().optional(),
};

const ELEMENTS_SCHEMAS = {
  title: z.object({
    ...commonElements,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    image: z.string().optional(),
  }).passthrough(),

  content: z.object({
    ...commonElements,
    title: z.string().optional(),
    items: z.array(z.object({
      heading: z.string().optional(),
      text: z.string(),
    }).passthrough()).optional(),
  }).passthrough(),

  contentwithimage: z.object({
    ...commonElements,
    title: z.string().optional(),
    body: z.string().optional(),
    image: z.string().optional(),
    badge: z.string().optional(),
  }).passthrough(),

  image: z.object({
    ...commonElements,
    image: z.string().optional(),
    // On-screen headline over the image - unrelated to spoken captions.
    caption: z.string().optional(),
    label: z.string().optional(),
  }).passthrough(),

  podcast: z.object({
    ...commonElements,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    hostName: z.string().optional(),
    hostImage: z.string().optional(),
  }).passthrough(),
};

const TEMPLATE_FAMILY = new Map();
for (const [sceneType, ids] of Object.entries(SCENE_TYPE_TEMPLATE_IDS)) {
  for (const id of ids) TEMPLATE_FAMILY.set(id, sceneType);
}

/**
 * Resolve a templateId to what it can render, or null if Remotion would
 * fall through to DefaultTemplate for it.
 *
 * 'generative' has no single family - the caller's sceneType decides which
 * elements shape applies, so it's passed in for that case.
 */
function resolveTemplate(templateId, sceneType) {
  if (templateId === GENERATIVE_TEMPLATE_ID) {
    if (!GENERATIVE_SUPPORTED_SCENE_TYPES.includes(sceneType)) return null;
    return { templateId, sceneType, elements: ELEMENTS_SCHEMAS[sceneType] };
  }
  const family = TEMPLATE_FAMILY.get(templateId);
  if (!family) return null;
  return { templateId, sceneType: family, elements: ELEMENTS_SCHEMAS[family] };
}

function isRegistered(templateId) {
  return templateId === GENERATIVE_TEMPLATE_ID || TEMPLATE_FAMILY.has(templateId);
}

module.exports = {
  SCENE_TYPES,
  SCENE_TYPE_TEMPLATE_IDS,
  GENERATIVE_TEMPLATE_ID,
  GENERATIVE_SUPPORTED_SCENE_TYPES,
  ELEMENTS_SCHEMAS,
  resolveTemplate,
  isRegistered,
};
