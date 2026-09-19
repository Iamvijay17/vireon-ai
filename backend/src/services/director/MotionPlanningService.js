const DEFAULT_MOTIONS = ['static', 'zoom-in'];

/**
 * Assigns camera motion for scenes the model left blank/static, cycling
 * through the story's shared motion vocabulary instead of every unset scene
 * defaulting to the same static shot.
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
      const hasExplicitMotion = scene.cameraMotion && scene.cameraMotion !== 'static';
      if (hasExplicitMotion) return scene;

      const cameraMotion = vocabulary[cursor % vocabulary.length];
      cursor += 1;
      return { ...scene, cameraMotion };
    });
  }
}

module.exports = MotionPlanningService;
