/**
 * Scene Type Categories
 *
 * Maps each scene type to the template ID(s) that render it. Template IDs
 * use a numbered "NNN-<sceneType>" scheme (e.g. "001-title", "002-content")
 * so multiple visual variants can exist per scene type - only "content"
 * currently has more than one (3 variants: plain bullet list / card grid /
 * numbered timeline), so content-heavy scripts don't all look identical.
 * Every variant of a scene type shares the exact same
 * `elements` data structure - they just render it differently - so picking
 * between them is a pure visual choice (see
 * ScriptParserService._getDefaultTemplateForType). This mirrors
 * TemplateRegistry.js's keys 1:1.
 *
 * Scene Types:
 * - "title": Introduction/title cards (opening scenes)
 * - "content": Main educational/promotional content (text-only)
 * - "contentwithimage": Content delivery paired with a supporting image
 * - "image": Image-focused scenes (AI-generated backgrounds)
 * - "podcast": Dedicated podcast/interview layout
 */

export const SceneTypeCategories = {
  title: ['001-title', '002-title', '003-title'],
  content: ['001-content', '002-content', '003-content', '004-content', '005-content'],
  contentwithimage: ['001-contentwithimage', '002-contentwithimage'],
  image: ['001-image', '002-image', '003-image'],
  podcast: ['001-podcast', '002-podcast'],
};

/**
 * Get templates filtered by scene type.
 * Primary categorization for scene template selection.
 *
 * @param {string} sceneType - The scene type: "title", "content", "contentwithimage", "image", or "podcast"
 * @returns {string[]} Array of template IDs suitable for this scene type
 */
export const getTemplatesForSceneType = (sceneType) => {
  return SceneTypeCategories[sceneType] || SceneTypeCategories.content || [];
};

/**
 * Get all scene type keys.
 * @returns {string[]}
 */
export const getSceneTypes = () => {
  return Object.keys(SceneTypeCategories);
};

/**
 * Readable template names, shared between the LLM prompt hints and the
 * frontend/Studio template pickers.
 */
export const templateNames = {
  '001-title': 'Title (title + subtitle + optional image)',
  '002-title': 'Title - Parallax Hero (full-bleed image with parallax zoom)',
  '003-title': 'Title - Modern Minimal (thin type + single accent line)',
  '001-content': 'Content - Bullet List (title + plain bullet rows)',
  '002-content': 'Content - Card Grid (title + 2-column cards)',
  '003-content': 'Content - Timeline (title + numbered vertical steps)',
  '004-content': 'Content - Checklist (title + checkmark rows)',
  '005-content': 'Content - Two-Column (title + items split into 2 columns)',
  '001-contentwithimage': 'Content + Image (split image/text panel)',
  '002-contentwithimage': 'Content + Image - Image Card (badge overlaid on full-bleed image)',
  '001-image': 'Image (full-bleed image with caption)',
  '002-image': 'Image - Cinematic Vignette (dramatic dark vignette overlay)',
  '003-image': 'Image - Layered Frame (bordered, layered single-image collage look)',
  '001-podcast': 'Podcast (host image + waveform + captions)',
  '002-podcast': 'Podcast - Interview (split-screen host panel + nameplate)',
};

/**
 * Get template prompt hint for scene type categorization.
 * Used in LLM prompts to help select appropriate templates.
 */
export const getSceneTypePromptHint = (sceneType) => {
  const templateIds = getTemplatesForSceneType(sceneType);

  return templateIds
    .map((id) => `  - "${id}": ${templateNames[id] || id}`)
    .join('\n');
};

/**
 * Get all scene type hints for the LLM prompt.
 * Includes descriptions of when to use each scene type.
 */
export const getAllSceneTypeHints = () => {
  const descriptions = {
    title: 'Use for introduction/title scenes (opening cards, chapter headers)',
    content: 'Use for main content scenes (explanations, bullet points, steps, data)',
    contentwithimage: 'Use for content scenes that should show a supporting image alongside the text (split image/text layout, requires imagePrompt)',
    image: 'Use ONLY when the scene has an AI-generated background image (imagePrompt provided)',
    podcast: 'Use for podcast/interview dialogue turns (host + guest conversation)',
  };

  return Object.entries(SceneTypeCategories)
    .map(([sceneType, templateIds]) => {
      const templateList = templateIds.map((id) => `${id}: ${templateNames[id] || id}`).join('\n      ');
      return `Scene Type "${sceneType}" (${descriptions[sceneType]}):\n      ${templateList}`;
    })
    .join('\n\n');
};

/**
 * Small inline metadata array (replaces the old templates/index.json, which
 * only existed to describe the 60+ numeric templates for the LLM/editor).
 */
const TEMPLATE_METADATA = [
  { templateId: '001-title', title: 'Title', description: 'Centered title, subtitle, and optional image. Use for opening/intro scenes.' },
  { templateId: '002-title', title: 'Title - Parallax Hero', description: 'Full-bleed image with a slow parallax zoom and bottom-anchored title/subtitle. Use for cinematic opening scenes.' },
  { templateId: '003-title', title: 'Title - Modern Minimal', description: 'Thin-weight centered typography with a single accent line under the title. Use for understated, minimal intros.' },
  { templateId: '001-content', title: 'Content - Bullet List', description: 'Title with a plain vertical bullet list. Use for main explanatory content.' },
  { templateId: '002-content', title: 'Content - Card Grid', description: 'Title with a 2-column grid of cards. Use for parallel features/points.' },
  { templateId: '003-content', title: 'Content - Timeline', description: 'Title with a numbered vertical sequence. Use for step-by-step or ordered points.' },
  { templateId: '004-content', title: 'Content - Checklist', description: 'Title with a checkmark-badge list. Use for completed steps or to-do style points.' },
  { templateId: '005-content', title: 'Content - Two-Column', description: 'Title with items split into a left and right column. Use for longer item lists.' },
  { templateId: '001-contentwithimage', title: 'Content + Image', description: 'Split layout: supporting image on one side, title/body text on the other.' },
  { templateId: '002-contentwithimage', title: 'Content + Image - Image Card', description: 'Full-bleed image with a floating badge and bottom title/body panel. Use for a photo-forward story card look.' },
  { templateId: '001-image', title: 'Image', description: 'Full-bleed image with a bottom caption/label. Use for image-forward scenes.' },
  { templateId: '002-image', title: 'Image - Cinematic Vignette', description: 'Full-bleed image with a dramatic dark radial vignette. Use for moody, cinematic image scenes.' },
  { templateId: '003-image', title: 'Image - Layered Frame', description: 'Bordered foreground frame layered over a blurred backdrop copy of the same image. Use for a collage/texture feel from a single image.' },
  { templateId: '001-podcast', title: 'Podcast', description: 'Host image, show title, waveform, and animated captions. Use for podcast/interview turns.' },
  { templateId: '002-podcast', title: 'Podcast - Interview', description: 'Split-screen host panel with a lower-third nameplate, title/subtitle, and waveform. Use for an interview-style layout.' },
];

/**
 * Get template metadata by template ID.
 * @param {string} templateId - The template ID (e.g., "001-content")
 * @returns {object|null} Template metadata or null if not found
 */
export const getTemplateMetadata = (templateId) => {
  return TEMPLATE_METADATA.find((t) => t.templateId === templateId) || null;
};

/**
 * Get all template metadata.
 * @returns {object[]} Array of all template metadata
 */
export const getAllTemplateMetadata = () => {
  return TEMPLATE_METADATA;
};

export default SceneTypeCategories;
