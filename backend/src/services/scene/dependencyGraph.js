const { STAGES, STAGE_ORDER } = require('../pipeline/stages');

/**
 * The dependency graph of one scene's parts, and the planner that answers
 * "I changed X - what has to be rebuilt, and what can I keep?".
 *
 *   script ─▶ audio ─▶ captions ─┐
 *   script ──────────────────────┤
 *   image ───────────────────────┼─▶ scene-composition ─▶ render
 *   layout ──────────────────────┤
 *   motion ──────────────────────┤
 *   transition ──────────────────┘
 *
 * Pure data + functions, no I/O - it is the single place that knows what depends
 * on what, so the Studio's regenerate buttons, the version recorder (which
 * diffs fingerprints) and the worker (which maps the plan onto stages) cannot
 * disagree. Adding a part means adding it here.
 *
 * Node names are the ones used across the API and docs: `scene-composition` is
 * the scene's resolved props for Remotion, `render` the final encode.
 */

const NODES = Object.freeze([
  'script', 'audio', 'captions', 'image', 'layout', 'motion', 'transition', 'scene-composition', 'render',
]);

const DEPENDS_ON = Object.freeze({
  script: [],
  audio: ['script'],
  captions: ['audio'],
  image: [],
  layout: [],
  motion: [],
  transition: [],
  // The script feeds the composition directly too: its on-screen text is drawn
  // from it, not only its timing from the narration.
  'scene-composition': ['script', 'captions', 'image', 'layout', 'motion', 'transition'],
  render: ['scene-composition'],
});

/** Parts a model produces (as opposed to a decision a person or the Director makes). */
const GENERATED = Object.freeze(['audio', 'captions', 'image']);

/** Which worker stage rebuilds each node. `script` is edited text, so it has none. */
const NODE_STAGE = Object.freeze({
  audio: STAGES.AUDIO,
  captions: STAGES.AUDIO, // forced alignment runs inside the TTS stage
  image: STAGES.IMAGES,
  'scene-composition': STAGES.ASSETS,
  render: STAGES.RENDER,
});

/**
 * What each kind of change touches directly. These are the *source* nodes whose
 * inputs changed; everything downstream is derived.
 */
const CHANGE_TYPES = Object.freeze({
  script: ['script'],
  voice: ['audio'],
  image: ['image'],
  layout: ['layout'],
  motion: ['motion'],
  transition: ['transition'],
  // "Make it more cinematic": camera, transition and composition style together.
  style: ['layout', 'motion', 'transition'],
  // Regenerate the scene: a fresh take of its voice and its picture. The script
  // text and the layout are decisions, not generated, so they are kept.
  scene: ['audio', 'image'],
});

const dependents = (() => {
  const map = Object.fromEntries(NODES.map((n) => [n, []]));
  for (const [node, deps] of Object.entries(DEPENDS_ON)) for (const d of deps) map[d].push(node);
  return Object.freeze(map);
})();

/** Everything that (transitively) depends on any of `nodes`, excluding `nodes` themselves. */
function downstreamOf(nodes) {
  const seen = new Set();
  const queue = [...nodes];
  while (queue.length) {
    for (const next of dependents[queue.pop()] || []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  nodes.forEach((n) => seen.delete(n));
  return seen;
}

const inGraphOrder = (set) => NODES.filter((n) => set.has(n));

/**
 * @param {string} sceneId
 * @param {keyof typeof CHANGE_TYPES} changeType
 * @param {object} [opts]
 * @param {string[]} [opts.changed]   override the change type's source nodes
 *                                    (the version recorder passes the nodes it
 *                                    found different by fingerprint)
 * @param {string[]} [opts.supplied]  nodes whose new value the caller already has
 *                                    (e.g. an uploaded image) - they are not
 *                                    produced again
 * @returns {{
 *   sceneId: string, changeType: string,
 *   changed: string[],     the parts whose inputs changed
 *   regenerate: string[],  parts downstream of them that must be rebuilt
 *   reusable: string[],    parts that are untouched and must NOT be redone
 *   produce: string[],     the model-generated parts that need real generation work
 *   stages: string[],      worker stages that have to run, in pipeline order
 * }}
 */
function getRegenerationPlan(sceneId, changeType, { changed, supplied = [] } = {}) {
  const sources = changed || CHANGE_TYPES[changeType];
  if (!sources) {
    throw new Error(`Unknown change type "${changeType}". Expected one of: ${Object.keys(CHANGE_TYPES).join(', ')}`);
  }
  const unknown = sources.filter((n) => !NODES.includes(n));
  if (unknown.length) throw new Error(`Unknown scene part(s): ${unknown.join(', ')}`);

  const changedSet = new Set(sources);
  const downstream = downstreamOf(sources);
  const stale = new Set([...changedSet, ...downstream]);

  const stages = new Set();
  for (const node of stale) {
    if (NODE_STAGE[node]) stages.add(NODE_STAGE[node]);
  }
  // The render is only useful once uploaded.
  if (stages.has(STAGES.RENDER)) stages.add(STAGES.UPLOAD);

  return {
    sceneId,
    changeType: changeType || 'custom',
    changed: inGraphOrder(changedSet),
    regenerate: inGraphOrder(downstream),
    reusable: NODES.filter((n) => !stale.has(n)),
    produce: inGraphOrder(stale).filter((n) => GENERATED.includes(n) && !supplied.includes(n)),
    stages: STAGE_ORDER.filter((s) => stages.has(s)),
  };
}

/**
 * The plan after restoring a scene from a recorded version. The restored state is
 * internally consistent - its audio, captions and image come back with it - so
 * nothing is produced; only the composition and the render are rebuilt from it.
 * Nothing differing means nothing to do.
 */
function restorePlan(sceneId, changedParts) {
  const moved = changedParts.length > 0;
  const stale = new Set(moved ? ['scene-composition', 'render'] : []);
  return {
    sceneId,
    changeType: 'revert',
    changed: NODES.filter((n) => changedParts.includes(n)),
    regenerate: inGraphOrder(stale),
    reusable: NODES.filter((n) => !stale.has(n) && !changedParts.includes(n)),
    produce: [],
    stages: moved ? [STAGES.ASSETS, STAGES.RENDER, STAGES.UPLOAD] : [],
  };
}

/** The change type whose source nodes are exactly `nodes`, if there is one. */
function changeTypeFor(nodes) {
  const key = [...nodes].sort().join(',');
  return Object.keys(CHANGE_TYPES).find((type) => [...CHANGE_TYPES[type]].sort().join(',') === key) || null;
}

module.exports = {
  NODES,
  DEPENDS_ON,
  GENERATED,
  NODE_STAGE,
  CHANGE_TYPES,
  getRegenerationPlan,
  restorePlan,
  downstreamOf,
  changeTypeFor,
};
