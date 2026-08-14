/**
 * Scene Type Categories
 *
 * There are exactly 5 templates, one per scene type, so each scene type
 * maps to a single-element array (its own templateId). This mirrors
 * TemplateRegistry.js 1:1 - the templateId and sceneType are always the
 * same value throughout the pipeline.
 *
 * Scene Types:
 * - "title": Introduction/title cards (opening scenes)
 * - "content": Main educational/promotional content (text-only)
 * - "contentwithimage": Content delivery paired with a supporting image
 * - "image": Image-focused scenes (AI-generated backgrounds)
 * - "podcast": Dedicated podcast/interview layout
 */

export const SceneTypeCategories = {
  title: ['title'],
  content: ['content'],
  contentwithimage: ['contentwithimage'],
  image: ['image'],
  podcast: ['podcast'],
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
  title: 'Title (title + subtitle + optional image)',
  content: 'Content (title + bullet list)',
  contentwithimage: 'Content + Image (split image/text panel)',
  image: 'Image (full-bleed image with caption)',
  podcast: 'Podcast (host image + waveform + captions)',
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
  { templateId: 'title', title: 'Title', description: 'Centered title, subtitle, and optional image. Use for opening/intro scenes.' },
  { templateId: 'content', title: 'Content', description: 'Title with a plain vertical bullet list. Use for main explanatory content.' },
  { templateId: 'contentwithimage', title: 'Content + Image', description: 'Split layout: supporting image on one side, title/body text on the other.' },
  { templateId: 'image', title: 'Image', description: 'Full-bleed image with a bottom caption/label. Use for image-forward scenes.' },
  { templateId: 'podcast', title: 'Podcast', description: 'Host image, show title, waveform, and animated captions. Use for podcast/interview turns.' },
];

/**
 * Get template metadata by template ID.
 * @param {string} templateId - The template ID (e.g., "content")
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
