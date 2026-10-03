/**
 * Keeps generated imagery visually consistent with the story's shared style
 * guide. Deterministic - no LLM call - since the storyboard planner has
 * already decided *whether* a scene gets an image and what it shows; this only
 * makes every image prompt carry the video's shared look.
 */
class VisualPlanningService {
  /**
   * Append the style guide's visual palette to an image prompt unless it is
   * already in there. Idempotent, so planning a prompt twice never doubles it.
   */
  static styledPrompt(prompt, styleGuide = {}) {
    const base = String(prompt || '').trim();
    const palette = String(styleGuide.visualPalette || '').trim();
    if (!base || !palette) return base;
    return base.toLowerCase().includes(palette.toLowerCase()) ? base : `${base}, ${palette}`;
  }
}

module.exports = VisualPlanningService;
