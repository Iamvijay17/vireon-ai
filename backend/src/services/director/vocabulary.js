const { LAYOUT_REGISTRY, CAMERA_REGISTRY, TRANSITION_REGISTRY } = require('../../ir/compositionRegistry');

/**
 * The closed vocabulary the AI Director chooses from. Everything here is an id
 * the renderer already has - the Director never invents a layout, a motion or a
 * transition, it picks among these, and its output is validated against them
 * (schemas.js) before anything downstream sees it.
 */

/** What a scene is FOR in the story. Every scene gets exactly one. */
const PURPOSES = Object.freeze([
  'hook', 'introduction', 'explanation', 'example', 'comparison', 'data', 'quote', 'summary', 'conclusion', 'cta', 'transition',
]);

/** How a scene communicates visually - the Director's choice, before it is mapped to a layout. */
const STRATEGIES = Object.freeze([
  'title',               // a bare title card
  'text',                // prose, large and readable
  'list',                // parallel points
  'timeline',            // an ordered process or history
  'quote',               // one memorable sentence
  'statistics',          // one striking number
  'comparison',          // exactly two things side by side
  'split-visual',        // a generated picture beside the text
  'visual-explanation',  // a picture that carries the explanation, text supports it
  'full-screen-visual',  // the picture is the scene
  'podcast',             // a conversation turn
]);

/** The layouts each strategy may resolve to, best first. The engine still checks content fit. */
const STRATEGY_LAYOUTS = Object.freeze({
  title: ['title-only'],
  text: ['paragraph-stack', 'quote-feature', 'stack-list'],
  list: ['stack-list', 'grid', 'paragraph-stack'],
  timeline: ['timeline', 'stack-list'],
  quote: ['quote-feature', 'paragraph-stack'],
  statistics: ['stat-highlight', 'stack-list'],
  comparison: ['comparison-split', 'grid', 'stack-list'],
  'split-visual': ['split-image'],
  'visual-explanation': ['split-image', 'image-fullbleed'],
  'full-screen-visual': ['image-fullbleed', 'split-image'],
  podcast: ['podcast-split', 'podcast-centered'],
});

/** The inverse, for describing a layout back as a strategy. */
const LAYOUT_STRATEGY = Object.freeze({
  'title-only': 'title',
  'paragraph-stack': 'text',
  'stack-list': 'list',
  grid: 'list',
  timeline: 'timeline',
  'quote-feature': 'quote',
  'stat-highlight': 'statistics',
  'comparison-split': 'comparison',
  'split-image': 'split-visual',
  'image-fullbleed': 'full-screen-visual',
  'podcast-split': 'podcast',
  'podcast-centered': 'podcast',
});

const IMAGE_STRATEGIES = Object.freeze(['split-visual', 'visual-explanation', 'full-screen-visual']);

/** Layouts that need a picture, and layouts that belong to podcasts only. */
const IMAGE_LAYOUTS = Object.freeze(['split-image', 'image-fullbleed']);
const PODCAST_LAYOUTS = Object.freeze(['podcast-split', 'podcast-centered']);

/**
 * Transitions grouped by how much they announce themselves. Within a beat the
 * story flows on (soft); at a beat boundary the video changes subject, so a
 * firmer transition helps the viewer notice (medium/strong).
 */
const TRANSITION_TIERS = Object.freeze({
  soft: ['fade', 'dissolve'],
  medium: ['slide', 'slideUp', 'wipe'],
  strong: ['irisWipe', 'zoom'],
});

module.exports = {
  PURPOSES,
  STRATEGIES,
  STRATEGY_LAYOUTS,
  LAYOUT_STRATEGY,
  IMAGE_STRATEGIES,
  IMAGE_LAYOUTS,
  PODCAST_LAYOUTS,
  TRANSITION_TIERS,
  LAYOUTS: LAYOUT_REGISTRY,
  CAMERA_MOTIONS: CAMERA_REGISTRY,
  TRANSITIONS: TRANSITION_REGISTRY,
};
