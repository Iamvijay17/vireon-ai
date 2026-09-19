/**
 * Deterministic post-pass over generated scenes that keeps imagery visually
 * consistent with the story's shared style guide. No extra LLM call - the
 * local-model/GPU-sequential setup (see scriptStep.js) makes an extra pass
 * per scene too expensive for what's just a consistency nudge.
 */
class VisualPlanningService {
  static apply(scenes, styleGuide = {}) {
    const palette = styleGuide.visualPalette || '';

    return scenes.map((scene) => {
      const needsImage = scene.sceneType === 'image' || scene.sceneType === 'contentwithimage' || scene.sceneType === 'podcast';

      let imagePrompt = scene.imagePrompt || '';
      if (needsImage && palette && imagePrompt && !imagePrompt.toLowerCase().includes(palette.toLowerCase())) {
        imagePrompt = `${imagePrompt}, ${palette}`;
      }

      return { ...scene, imagePrompt };
    });
  }
}

module.exports = VisualPlanningService;
