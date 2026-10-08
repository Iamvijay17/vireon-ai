const {
  STRATEGY_LAYOUTS, LAYOUT_STRATEGY, TRANSITION_TIERS, IMAGE_LAYOUTS, PODCAST_LAYOUTS, CAMERA_MOTIONS,
} = require('./vocabulary');
const { isLayoutCompatible } = require('./layoutCompat');

/**
 * Chooses, for the whole video at once, the layout, camera move and transition of
 * every scene - looking at the neighbours, so the result varies instead of
 * repeating:
 *
 *   bad     split-image · split-image · split-image · split-image
 *   better  title-only · split-image · stack-list · stat-highlight · comparison-split
 *
 * Deterministic: the same scenes always produce the same plan (no randomness, no
 * clock), so re-planning a script never reshuffles a video the user already liked.
 *
 * Variety is never bought with meaning. A layout is a candidate only if the
 * engine can show the scene's content in it (layoutCompat.isLayoutCompatible)
 * and, for the layouts that carry a specific meaning, only if the scene says
 * that thing (a timeline for ordered steps, a comparison for a contrast). The
 * Director's own explicit pick is always a candidate, as long as it fits.
 */

// Taste order when nothing else separates two candidates.
const BASE_ORDER = [
  'stack-list', 'grid', 'paragraph-stack', 'timeline', 'comparison-split', 'stat-highlight',
  'quote-feature', 'split-image', 'image-fullbleed', 'title-only',
];

// Layouts that feel alike when they follow each other.
const FAMILY = {
  'stack-list': 'text', 'paragraph-stack': 'text',
  grid: 'tiles', timeline: 'tiles', 'comparison-split': 'tiles',
  'split-image': 'visual', 'image-fullbleed': 'visual',
  'title-only': 'focal', 'quote-feature': 'focal', 'stat-highlight': 'focal',
};
const DENSE_FAMILIES = new Set(['text', 'tiles']);

/** How many bullets each layout can show before the text gets small. */
const LAYOUT_ITEM_CAP = Object.freeze({
  'stack-list': 5, grid: 6, timeline: 5, 'paragraph-stack': 3, 'comparison-split': 2, 'stat-highlight': 1,
});

const REPEAT_WINDOW = 4;
const MAX_BODY_FOR_FULLBLEED = 90;

const trailingRun = (history, value) => {
  let run = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === value; i -= 1) run += 1;
  return run;
};

/** Layouts this scene may use: fits the content, and means something here. */
function eligibleLayouts(entry) {
  const { profile, cues, directorLayout } = entry;

  if (profile.sceneType === 'title') return ['title-only'].filter((l) => isLayoutCompatible(l, profile));
  if (profile.sceneType === 'image') return ['image-fullbleed'];

  const candidates = BASE_ORDER.filter((layout) => {
    if (!isLayoutCompatible(layout, profile)) return false;
    // The Director's own call is honoured whenever it fits.
    if (layout === directorLayout) return true;
    switch (layout) {
      case 'timeline': return cues.sequential;
      case 'comparison-split': return cues.comparison;
      case 'stat-highlight': return cues.stat;
      case 'grid': return profile.itemCount >= 3;
      // The only layout that can show a body with no list; otherwise only the Director's own pick.
      case 'quote-feature': return profile.itemCount === 0;
      // Full-bleed shows only the kicker and headline over the picture, so a paragraph
      // beside the picture would silently disappear from the screen. Autonomous picks
      // use it only when there is next to no body text to lose.
      case 'image-fullbleed': return profile.body.length <= MAX_BODY_FOR_FULLBLEED;
      default: return true;
    }
  });
  return candidates;
}

function scoreLayout(layout, entry, history) {
  let score = 0;
  const previous = history[history.length - 1];

  if (layout === entry.directorLayout) score += 4;
  const preferred = STRATEGY_LAYOUTS[entry.strategy] || [];
  const rank = preferred.indexOf(layout);
  if (rank >= 0) score += 2 - Math.min(rank, 2);

  // Content that suits a layout well.
  if (layout === 'timeline' && entry.cues.sequential) score += 2;
  if (layout === 'comparison-split' && entry.cues.comparison) score += 2;
  if (layout === 'stat-highlight' && entry.cues.stat) score += 3;
  if (layout === 'paragraph-stack' && entry.profile.density === 'paragraph') score += 2;
  if (layout === 'grid' && entry.profile.itemCount >= 4) score += 1;

  // Too many bullets for this layout means small text.
  const cap = LAYOUT_ITEM_CAP[layout];
  if (cap !== undefined && entry.profile.itemCount > cap) score -= 3;

  // Repetition, against the neighbours. A repeat has to cost more than the
  // Director's own preference is worth, or an explicit pick could never be varied.
  if (layout === previous) score -= 8;
  if (layout === previous && trailingRun(history, layout) >= 2) score -= 10;
  const recent = history.slice(-REPEAT_WINDOW);
  score -= 2 * recent.filter((l) => l === layout).length;
  if (previous && layout !== previous && FAMILY[layout] === FAMILY[previous]) score -= 1;

  // After a stretch of dense text, a breather is worth more than another list.
  const lastThree = history.slice(-3);
  if (lastThree.length === 3 && lastThree.every((l) => DENSE_FAMILIES.has(FAMILY[l])) && FAMILY[layout] === 'focal') score += 1.5;

  return score;
}

/**
 * @param {Array<{
 *   isPodcast:boolean, profile:object, cues:object, strategy:string, directorLayout:string
 * }>} entries
 * @returns {string[]} one layout per entry; '' leaves the choice to the engine
 */
function planLayouts(entries) {
  const history = [];
  return entries.map((entry) => {
    if (entry.isPodcast) {
      history.push('');
      return '';
    }
    const eligible = eligibleLayouts(entry);
    if (eligible.length === 0) {
      history.push('');
      return '';
    }
    let best = null;
    for (const layout of eligible) {
      const score = scoreLayout(layout, entry, history);
      if (!best || score > best.score || (score === best.score && BASE_ORDER.indexOf(layout) < BASE_ORDER.indexOf(best.layout))) {
        best = { layout, score };
      }
    }
    history.push(best.layout);
    return best.layout;
  });
}

// ---- Camera ---------------------------------------------------------------------

const isMoving = (motion) => Boolean(motion) && motion !== 'static';

const trailingMoving = (motions) => {
  let run = 0;
  for (let i = motions.length - 1; i >= 0 && isMoving(motions[i]); i -= 1) run += 1;
  return run;
};

function cameraPreference(entry, layout) {
  const family = FAMILY[layout];
  if (entry.density === 'dense') return ['static'];
  if (entry.hasImage) return ['pan-left', 'pan-right', 'zoom-in', 'zoom-out'];
  if (family === 'focal') return ['zoom-in', 'static'];
  return ['static', 'zoom-in', 'zoom-out'];
}

/**
 * One camera move per scene: still where there is a lot to read, a slow move
 * where there is a picture or a single idea, never the same move twice in a row,
 * never more than two moving scenes in a row (a breather follows), and a pan
 * always turns the other way from the last one.
 */
function planCameraMotions(entries, layouts) {
  const chosen = [];
  entries.forEach((entry, i) => {
    const pool = (entry.motionPool || []).filter((m) => CAMERA_MOTIONS.includes(m));
    const previous = chosen[i - 1];
    const movingRun = trailingMoving(chosen);

    // The same move twice in a row is never wanted ('static' may repeat: stillness is the rest).
    const allowed = (motion) => {
      if (motion === previous && isMoving(motion)) return false;
      if (isMoving(motion) && movingRun >= 2) return false;
      return true;
    };

    const suits = cameraPreference(entry, layouts[i]);
    // The story's own motion vocabulary ranks ahead of the generic preference when it overlaps what suits the scene.
    const inVocabulary = pool.length ? suits.filter((m) => pool.includes(m)) : [];
    // An explicit pick by the Director comes first - unless the scene is dense text, which stays still.
    const explicit = entry.directorCamera && entry.density !== 'dense' ? [entry.directorCamera] : [];
    // 'static' last: the one move that is always allowed, so there is always an answer.
    const candidates = [...new Set([...explicit, ...inVocabulary, ...suits, 'static'])];

    chosen.push(candidates.find(allowed) || 'static');
  });
  return chosen;
}

// ---- Transitions ------------------------------------------------------------------

const tierOf = (transition) => Object.keys(TRANSITION_TIERS).find((tier) => TRANSITION_TIERS[tier].includes(transition)) || 'soft';

/**
 * Soft transitions carry the story on inside a beat; a firmer one marks the
 * change of subject at a beat boundary. The same firm transition never twice in
 * a row, and the strongest ones are rationed so they stay an event.
 */
function planTransitions(entries) {
  const chosen = [];
  let mediumTurn = 0;
  entries.forEach((entry, i) => {
    if (i === 0) {
      chosen.push(entry.directorTransition || 'fade');
      return;
    }
    const previous = chosen[i - 1];
    const boundary = entry.beat !== entries[i - 1].beat;
    const lastStrong = chosen.slice(-6).some((t) => tierOf(t) === 'strong');

    let pick;
    const director = entry.directorTransition;
    const repeatsFirm = (t) => t === previous && tierOf(t) !== 'soft';

    if (director && !repeatsFirm(director) && !(tierOf(director) === 'strong' && lastStrong) && !(director === 'cut' && previous === 'cut')) {
      pick = director;
    } else if (boundary) {
      if (['conclusion', 'cta'].includes(entry.purpose) && !lastStrong) {
        pick = 'zoom';
      } else {
        const options = TRANSITION_TIERS.medium.filter((t) => t !== previous);
        pick = options[mediumTurn % options.length];
        mediumTurn += 1;
      }
    } else {
      pick = 'fade';
    }
    chosen.push(pick);
  });
  return chosen;
}

// ---- Content density ----------------------------------------------------------------

/** Merge adjacent items (shortest pair first) until at most `cap` remain. Order and text are kept. */
function mergeItems(items, cap) {
  const merged = items.map((i) => (typeof i === 'string' ? i : String(i?.text ?? i ?? ''))).filter(Boolean);
  while (cap > 0 && merged.length > cap) {
    let at = 0;
    let shortest = Infinity;
    for (let i = 0; i < merged.length - 1; i += 1) {
      const length = merged[i].length + merged[i + 1].length;
      if (length < shortest) {
        shortest = length;
        at = i;
      }
    }
    const left = merged[at].trim();
    const joiner = /[.!?…]$/.test(left) ? ' ' : '; ';
    merged.splice(at, 2, `${left}${joiner}${merged[at + 1].trim()}`);
  }
  return merged;
}

/** 'light' | 'balanced' | 'dense' - how much there is to read on screen. */
function densityOf(profile) {
  if (profile.hasImage) return profile.body.length > 240 ? 'dense' : 'balanced';
  if (profile.itemCount >= 5 || (profile.density === 'paragraph' && profile.itemCount >= 3)) return 'dense';
  if (profile.itemCount <= 1) return 'light';
  return 'balanced';
}

/** How alike the layouts are, as a 0-1 score: 1 means no neighbours repeat and the video uses many layouts. */
function diversityReport(layouts) {
  const used = layouts.filter(Boolean);
  const counts = {};
  used.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
  let maxRun = 0;
  let run = 0;
  used.forEach((l, i) => {
    run = i > 0 && used[i - 1] === l ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  });
  const adjacentRepeats = used.filter((l, i) => i > 0 && used[i - 1] === l).length;
  const distinct = Object.keys(counts).length;
  const variety = used.length ? distinct / Math.min(used.length, 6) : 1;
  const repeatPenalty = used.length > 1 ? adjacentRepeats / (used.length - 1) : 0;
  const score = Math.max(0, Math.min(1, variety * 0.6 + (1 - repeatPenalty) * 0.4));
  return { score: Math.round(score * 100) / 100, maxLayoutRun: maxRun, layoutCounts: counts };
}

module.exports = {
  planLayouts,
  planCameraMotions,
  planTransitions,
  eligibleLayouts,
  scoreLayout,
  mergeItems,
  densityOf,
  diversityReport,
  tierOf,
  LAYOUT_ITEM_CAP,
  FAMILY,
  BASE_ORDER,
  LAYOUT_STRATEGY,
  IMAGE_LAYOUTS,
  PODCAST_LAYOUTS,
};
