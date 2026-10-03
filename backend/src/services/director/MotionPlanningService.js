const DEFAULT_MOTIONS = ['static', 'zoom-in'];

/**
 * Assigns camera motion for scenes nobody chose one for, cycling through the
 * story's shared motion vocabulary instead of every unset scene defaulting to
 * the same static shot. A motion the script or the storyboard planner chose
 * explicitly - including a deliberate "static" from the planner - is kept.
 */
class MotionPlanningService {
  static apply(scenes, styleGuide = {}) {
    const motions = (styleGuide.motionVocabulary || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const vocabulary = motions.length > 0 ? motions : DEFAULT_MOTIONS;

    let cursor = 0;
    return scenes.map((scene) => {
      const plannerChoseMotion = Boolean(scene.storyboard?.cameraMotion);
      const hasExplicitMotion = scene.cameraMotion && scene.cameraMotion !== 'static';
      if (plannerChoseMotion || hasExplicitMotion) return scene;

      const cameraMotion = vocabulary[cursor % vocabulary.length];
      cursor += 1;
      return { ...scene, cameraMotion };
    });
  }
}

module.exports = MotionPlanningService;
