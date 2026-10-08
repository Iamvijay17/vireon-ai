const { sanitizeComposition } = require('../../ir/compositionRegistry');

/**
 * Chooses the composable motion slots of every scene - background, decoration,
 * text motion, image motion - from the renderer's existing registries.
 *
 * The engine already picks a background and decoration per scene from the layout
 * and the job's visual style, but each pick is independent: nothing stops three
 * neighbouring scenes landing on the same background. Planning them together
 * lets the Director vary them across neighbours and match them to what the scene
 * is for, while staying inside the same pools the engine would have drawn from.
 *
 * Restraint is part of the plan ("avoid excessive motion"): dense text gets only
 * the quiet entrances and the plainest decoration; the loud entrances (pop,
 * bounce) are kept for hooks and calls to action; a picture only drifts when the
 * camera is still, since both moving at once is more motion than either intends.
 *
 * Deterministic, like the rest of the Director: same scenes in, same slots out.
 */

// The engine's own mood pools (remotion/src/engine/chooseVisuals.js), per layout "tag".
const BACKGROUND_POOLS = {
  title: ['gradient', 'glow', 'aurora'],
  content: ['gradient', 'grid', 'blobs'],
  technical: ['grid', 'glow'],
  quote: ['gradient', 'glow'],
  stat: ['glow', 'meshGradient'],
  image: ['gradient', 'glow'],
};

const DECORATION_POOLS = {
  title: ['dots', 'geometric'],
  content: ['dots', 'geometric', 'floatingShapes'],
  technical: ['connectingLines', 'geometric'],
  quote: ['geometric', 'dots'],
  stat: ['orbit', 'dots'],
  image: ['dots'],
};

const LAYOUT_TAG = {
  'title-only': 'title',
  'quote-feature': 'quote',
  'stat-highlight': 'stat',
  timeline: 'technical',
  'comparison-split': 'technical',
  'split-image': 'image',
  'image-fullbleed': 'image',
};
const tagFor = (layout) => LAYOUT_TAG[layout] || 'content';

// What each kind of scene enters with. First is the default; later ones are the rotation.
const TEXT_MOTION_BY_PURPOSE = {
  hook: ['fadeSlideUp', 'popIn', 'scaleIn'],
  introduction: ['fadeSlideUp', 'fadeIn'],
  explanation: ['fadeSlideUp', 'fadeSlideLeft', 'blurIn'],
  example: ['fadeSlideLeft', 'fadeIn', 'blurIn'],
  comparison: ['fadeSlideLeft', 'fadeSlideUp'],
  data: ['scaleIn', 'fadeIn'],
  quote: ['blurIn', 'fadeIn'],
  summary: ['fadeSlideUp', 'fadeIn'],
  conclusion: ['fadeIn', 'fadeSlideUp'],
  cta: ['fadeSlideUp', 'popIn', 'scaleIn'],
  transition: ['fadeIn'],
};
const QUIET_TEXT_MOTIONS = new Set(['fadeIn', 'fadeSlideUp', 'fadeSlideLeft', 'blurIn']);
const IMAGE_DRIFTS = ['slowZoom', 'slowPan', 'driftUp'];

/**
 * The first option that is not what the previous scenes just used; if every option
 * was, the least recently used one. `recent` is newest-last.
 */
function rotate(options, recent) {
  const lastTwo = recent.slice(-2);
  return options.find((o) => !lastTwo.includes(o))
    || options.find((o) => o !== recent[recent.length - 1])
    || options[0];
}

/**
 * @param {Array<{ isPodcast:boolean, hasImage:boolean, purpose:string, density:string }>} entries
 * @param {string[]} layouts   the planned layout per scene
 * @param {string[]} cameras   the planned camera move per scene
 * @returns {Array<object>}    one sanitized composition per scene ({} when there is nothing to set)
 */
function planComposition(entries, layouts, cameras) {
  const history = { background: [], decoration: [], textMotion: [], imageMotion: [] };

  return entries.map((entry, i) => {
    // Podcast turns have one fixed look.
    if (entry.isPodcast) return {};

    const tag = tagFor(layouts[i]);
    const dense = entry.density === 'dense';

    const background = rotate(BACKGROUND_POOLS[tag], history.background);
    const decoration = dense ? 'dots' : rotate(DECORATION_POOLS[tag], history.decoration);

    let textPool = TEXT_MOTION_BY_PURPOSE[entry.purpose] || TEXT_MOTION_BY_PURPOSE.explanation;
    if (dense) textPool = textPool.filter((m) => QUIET_TEXT_MOTIONS.has(m));
    const textMotion = rotate(textPool.length ? textPool : ['fadeIn'], history.textMotion);

    const composition = { background, decoration, textMotion };

    if (entry.hasImage) {
      // A moving camera already animates the picture; let it.
      composition.imageMotion = cameras[i] && cameras[i] !== 'static' ? 'none' : rotate(IMAGE_DRIFTS, history.imageMotion);
    }

    history.background.push(background);
    history.decoration.push(decoration);
    history.textMotion.push(textMotion);
    if (composition.imageMotion && composition.imageMotion !== 'none') history.imageMotion.push(composition.imageMotion);

    return sanitizeComposition(composition);
  });
}

module.exports = { planComposition, BACKGROUND_POOLS, DECORATION_POOLS, TEXT_MOTION_BY_PURPOSE, IMAGE_DRIFTS };
