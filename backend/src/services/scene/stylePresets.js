const { sanitizeComposition } = require('../../ir/compositionRegistry');
const { isLayoutCompatible, profileOf } = require('../director/layoutCompat');

/**
 * Named looks a person can apply to one scene in a click ("make it more
 * cinematic"), expressed entirely in the renderer's existing vocabulary: a camera
 * move, a transition and the composable motion slots (ir/compositionRegistry.js).
 *
 * A preset is a *plan*, not a new renderer feature - it only picks ids the engine
 * already draws - so applying one is a layout/motion/transition change in the
 * dependency graph: composition and render are rebuilt, audio, captions and the
 * picture are reused.
 */

const PRESETS = Object.freeze({
  cinematic: {
    label: 'More cinematic',
    description: 'Slow push-in, soft fades, a glowing backdrop and gentle blur-in text. A picture slowly zooms.',
    // Text scenes get the push-in from the camera; a picture scene lets the picture do it.
    camera: { text: 'zoom-in', image: 'static' },
    transition: 'fade',
    composition: { background: 'glow', decoration: 'dots', textMotion: 'blurIn' },
    imageMotion: 'slowZoom',
  },
  minimal: {
    label: 'Calm and minimal',
    description: 'Still camera, plain gradient, no flourish: the words and the picture do the work.',
    camera: { text: 'static', image: 'static' },
    transition: 'fade',
    composition: { background: 'gradient', decoration: 'dots', textMotion: 'fadeIn' },
    imageMotion: 'none',
  },
  dynamic: {
    label: 'More dynamic',
    description: 'A slide in, lively backdrop and a confident entrance. Good for energy and short-form.',
    camera: { text: 'static', image: 'pan-left' },
    transition: 'slide',
    composition: { background: 'meshGradient', decoration: 'floatingShapes', textMotion: 'scaleIn' },
    imageMotion: 'none',
  },
});

/** What the Studio lists. */
const listPresets = () => Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, description: p.description }));

const hasPicture = (scene) => Boolean(scene?.imageUrl || scene?.imagePrompt);

/**
 * The field changes a preset makes to one scene, as a patch the caller applies.
 * Restraint rules from the Director still hold: dense text stays still, and a
 * picture only drifts when the camera is not already moving.
 */
function presetPatch(presetId, scene) {
  const preset = PRESETS[presetId];
  if (!preset) return null;

  const picture = hasPicture(scene);
  const profile = profileOf(scene, { hasImage: picture });
  const dense = profile.itemCount >= 5 || (profile.density === 'paragraph' && profile.itemCount >= 3);

  let cameraMotion = picture ? preset.camera.image : preset.camera.text;
  if (dense) cameraMotion = 'static';

  const composition = { ...preset.composition };
  if (dense) {
    composition.decoration = 'dots';
    if (!['fadeIn', 'fadeSlideUp', 'fadeSlideLeft', 'blurIn'].includes(composition.textMotion)) composition.textMotion = 'fadeIn';
  }
  if (picture) composition.imageMotion = cameraMotion !== 'static' ? 'none' : preset.imageMotion;

  const patch = {
    cameraMotion,
    transition: preset.transition,
    composition: sanitizeComposition({ ...(scene.composition || {}), ...composition }),
  };

  // A preset may also ask for a layout, but only one the content fits.
  const wanted = picture ? preset.preferredLayout?.image : preset.preferredLayout?.text;
  if (wanted && isLayoutCompatible(wanted, profile)) patch.layout = wanted;
  return patch;
}

module.exports = { PRESETS, listPresets, presetPatch };
