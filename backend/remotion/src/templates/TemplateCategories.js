/**
 * Scene Type Categories
 *
 * Maps scene types (title, content, image, end) to their 
 * applicable Remotion template IDs. This is the PRIMARY categorization
 * that the LLM uses to select templates for each scene.
 *
 * Scene Types:
 * - "title": Introduction/title cards (opening scenes)
 * - "content": Main educational/promotional content
 * - "image": Image-focused scenes (AI-generated backgrounds)
 * - "end": Closing/summary/end cards
 */

import TemplateMetadata from './index.json';

export const SceneTypeCategories = {
  /**
   * Title scenes: Opening/intro scenes with titles, headlines, or hooks
   * Best for: First scene, chapter titles, section headers
   */
  title: [
    'template-001',  // Educational Card - Title + subtitle + image
    'template-002',  // Question Answer - Q&A format
    'template-010',  // Split Hero - Hero section split layout
    'template-019',  // Parallax Hero - Parallax scrolling effect
    'template-030',  // Report Summary - Report layout
    'template-041',  // Modern Minimal - Clean modern look
    'template-049',  // Tutorial - Tutorial layout
    'template-050',  // Gaming - Gaming style
    'template-051',  // Fitness - Energetic style
    'template-052',  // Cooking - How-to style
    'template-053',  // Travel - Travel/variety
    'template-042',  // Podcast - Dedicated podcast layout
    'template-059',  // Event - Event highlights
    'template-060',  // Comedy - Fun/entertaining
  ],

  /**
   * Content scenes: Main educational/promotional content delivery
   * Best for: Explanations, bullet points, steps, data, features
   */
  content: [
    'template-004',  // Timeline - Chronological flow
    'template-005',  // Comparison - Side-by-side comparison
    'template-006',  // Quote Testimonial - Quote-focused display
    'template-007',  // Stats Dashboard - Statistics/metrics
    'template-008',  // Pill Tags - Tag/chip display
    'template-009',  // Bullet List - Clear bullet points
    'template-011',  // Team Profiles - People/team display
    'template-012',  // Countdown - Countdown/timer
    'template-013',  // Steps How-To - Sequential steps
    'template-014',  // Bar Chart - Data visualization
    'template-015',  // Feature Grid - Grid of features
    'template-016',  // Image Collage Grid - Image grid layout
    'template-017',  // Story Image Text - Image + text narrative
    'template-018',  // Masonry Wall - Dynamic masonry layout
    'template-021',  // Vignette Story - Vignette style
    'template-022',  // Polaroid Collage - Collage style
    'template-023',  // Story Cards - Card sequence
    'template-024',  // Split Reveal - Split animation reveal
    'template-025',  // Curtain Reveal - Curtain-style reveal
    'template-026',  // Definition Glossary - Term definitions
    'template-027',  // Checklist Points - Checklist style
    'template-028',  // Comparison Table - Comparison table
    'template-029',  // Did You Know - Fact/insight display
    'template-031',  // Expert Quote - Expert citation
    'template-032',  // Step Guide - Numbered guide
    'template-033',  // Benefits Row - Benefits highlights
    'template-034',  // Learning Paths - Path/flow visualization
    'template-035',  // Tech Tags - Technology tags
    'template-036',  // Case Study - Case study layout
    'template-037',  // Milestones - Progress/achievement
    'template-038',  // Metrics Grid - Business metrics
    'template-039',  // Profile Spotlight - Speaker highlight
    'template-040',  // Skills Chips - Skills display
    'template-043',  // News - News-style layout
    'template-044',  // Social Media - Social media optimized
    'template-045',  // Cinematic - Cinematic layout
    'template-046',  // Tech Review - Review format
    'template-047',  // Motivational - Inspirational layout
    'template-048',  // Interview - Interview format
    'template-054',  // Educational - Dedicated educational
    'template-055',  // Corporate - Professional corporate
    'template-056',  // Music - Audio-focused
    'template-057',  // Science - Scientific layout
    'template-058',  // Storytelling - Storytelling focused
  ],

  /**
   * Image scenes: Image-focused scenes (used with AI-generated backgrounds)
   * Best for: Scenes with imagePrompt in the LLM JSON
   */
  image: [
    'template-003',  // Image Focus - Image-forward layout
    'template-016',  // Image Collage Grid - Image grid layout
    'template-017',  // Story Image Text - Image + text narrative
    'template-020',  // Image Card Story - Card-based story
    'template-022',  // Polaroid Collage - Collage style
    'template-024',  // Split Reveal - Split animation reveal
    'template-025',  // Curtain Reveal - Curtain-style reveal
    'template-045',  // Cinematic - Cinematic layout
  ],

  /**
   * End scenes: Closing/summary/end cards
   * Best for: Final scene, call-to-action, summary, credits
   */
  end: [
    'template-006',  // Quote Testimonial - Good for inspirational closing
    'template-012',  // Countdown - Good for countdown endings
    'template-030',  // Report Summary - Summary/recap
    'template-041',  // Modern Minimal - Clean closing
    'template-047',  // Motivational - Inspirational closing
    'template-059',  // Event - Good for event closing
  ],
};

/**
 * Video Type Categories (kept for backward compatibility)
 */
export const TemplateCategories = {
  educational: [
    'template-001',
    'template-009',
    'template-013',
    'template-026',
    'template-027',
    'template-032',
    'template-034',
    'template-049',
    'template-054',
    'template-041',
  ],
  podcast: [
    'template-042',
    'template-048',
    'template-056',
    'template-031',
    'template-039',
    'template-036',
  ],
  marketing: [
    'template-005',
    'template-007',
    'template-010',
    'template-015',
    'template-028',
    'template-033',
    'template-044',
    'template-055',
    'template-003',
  ],
  story: [
    'template-017',
    'template-020',
    'template-021',
    'template-022',
    'template-023',
    'template-045',
    'template-058',
    'template-024',
    'template-025',
  ],
  motivational: [
    'template-006',
    'template-029',
    'template-047',
    'template-037',
    'template-019',
    'template-004',
    'template-038',
  ],
  business: [
    'template-004',
    'template-011',
    'template-014',
    'template-030',
    'template-036',
    'template-038',
    'template-043',
    'template-055',
    'template-010',
  ],
  youtube_shorts: [
    'template-044',
    'template-050',
    'template-051',
    'template-052',
    'template-053',
    'template-059',
    'template-060',
    'template-016',
    'template-018',
  ],
  general: [
    'template-002',
    'template-008',
    'template-012',
    'template-035',
    'template-040',
    'template-046',
    'template-057',
  ],
};

/**
 * Get templates filtered by scene type.
 * Primary categorization for scene template selection.
 *
 * @param {string} sceneType - The scene type: "title", "content", "image", or "end"
 * @returns {string[]} Array of template IDs suitable for this scene type
 */
export const getTemplatesForSceneType = (sceneType) => {
  return SceneTypeCategories[sceneType] || SceneTypeCategories.content || [];
};

/**
 * Get templates filtered by video type (legacy support).
 *
 * @param {string} videoType - The video type (e.g., "podcast", "educational")
 * @returns {string[]} Array of template IDs
 */
export const getTemplatesForType = (videoType) => {
  return TemplateCategories[videoType] || TemplateCategories.general || [];
};

/**
 * Get all scene type keys.
 * @returns {string[]}
 */
export const getSceneTypes = () => {
  return Object.keys(SceneTypeCategories);
};

/**
 * Get all video type keys.
 * @returns {string[]}
 */
export const getVideoTypes = () => {
  return Object.keys(TemplateCategories);
};

/**
 * Get readable template names for LLM prompt.
 */
const templateNames = {
  'template-001': 'Educational Card (title + subtitle + image)',
  'template-002': 'Question Answer (Q&A format)',
  'template-003': 'Image Focus (image-forward layout)',
  'template-004': 'Timeline (chronological flow)',
  'template-005': 'Comparison (side-by-side comparison)',
  'template-006': 'Quote Testimonial (quote-focused display)',
  'template-007': 'Stats Dashboard (statistics/metrics)',
  'template-008': 'Pill Tags (tag/chip display)',
  'template-009': 'Bullet List (clear bullet points)',
  'template-010': 'Split Hero (split hero layout)',
  'template-011': 'Team Profiles (people/team display)',
  'template-012': 'Countdown (countdown/timer)',
  'template-013': 'Steps How-To (sequential steps)',
  'template-014': 'Bar Chart (data visualization)',
  'template-015': 'Feature Grid (grid of features)',
  'template-016': 'Image Collage Grid (image grid layout)',
  'template-017': 'Story Image Text (image + text narrative)',
  'template-018': 'Masonry Wall (dynamic masonry layout)',
  'template-019': 'Parallax Hero (parallax scrolling effect)',
  'template-020': 'Image Card Story (card-based story)',
  'template-021': 'Vignette Story (vignette style)',
  'template-022': 'Polaroid Collage (collage style)',
  'template-023': 'Story Cards (card sequence)',
  'template-024': 'Split Reveal (split animation reveal)',
  'template-025': 'Curtain Reveal (curtain-style reveal)',
  'template-026': 'Definition Glossary (term definitions)',
  'template-027': 'Checklist Points (checklist style)',
  'template-028': 'Comparison Table (comparison table)',
  'template-029': 'Did You Know (fact/insight display)',
  'template-030': 'Report Summary (report layout)',
  'template-031': 'Expert Quote (expert citation)',
  'template-032': 'Step Guide (numbered guide)',
  'template-033': 'Benefits Row (benefits highlights)',
  'template-034': 'Learning Paths (path/flow visualization)',
  'template-035': 'Tech Tags (technology tags)',
  'template-036': 'Case Study (case study layout)',
  'template-037': 'Milestones (progress/achievement)',
  'template-038': 'Metrics Grid (business metrics)',
  'template-039': 'Profile Spotlight (speaker highlight)',
  'template-040': 'Skills Chips (skills display)',
  'template-041': 'Modern Minimal (clean modern look)',
  'template-042': 'Podcast (dedicated podcast layout)',
  'template-043': 'News (news-style layout)',
  'template-044': 'Social Media (social media optimized)',
  'template-045': 'Cinematic (cinematic layout)',
  'template-046': 'Tech Review (review format)',
  'template-047': 'Motivational (inspirational layout)',
  'template-048': 'Interview (interview format)',
  'template-049': 'Tutorial (tutorial layout)',
  'template-050': 'Gaming (gaming style)',
  'template-051': 'Fitness (energetic style)',
  'template-052': 'Cooking (how-to style)',
  'template-053': 'Travel (travel/variety)',
  'template-054': 'Educational (dedicated educational)',
  'template-055': 'Corporate (professional corporate)',
  'template-056': 'Music (audio-focused)',
  'template-057': 'Science (scientific layout)',
  'template-058': 'Storytelling (storytelling focused)',
  'template-059': 'Event (event highlights)',
  'template-060': 'Comedy (fun/entertaining)',
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
    image: 'Use ONLY when the scene has an AI-generated background image (imagePrompt provided)',
    end: 'Use for closing/summary scenes (final cards, call-to-action, credits)',
  };

  return Object.entries(SceneTypeCategories)
    .map(([sceneType, templateIds]) => {
      const templateList = templateIds.map((id) => `${id}: ${templateNames[id] || id}`).join('\n      ');
      return `Scene Type "${sceneType}" (${descriptions[sceneType]}):\n      ${templateList}`;
    })
    .join('\n\n');
};

/**
 * Template metadata accessor.
 * Loads template information from the index.json file.
 */

/**
 * Get template metadata by template ID.
 * @param {string} templateId - The template ID (e.g., "template-001")
 * @returns {object|null} Template metadata or null if not found
 */
export const getTemplateMetadata = (templateId) => {
  return TemplateMetadata.find(t => t.templateId === templateId) || null;
};

/**
 * Get all template metadata.
 * @returns {object[]} Array of all template metadata
 */
export const getAllTemplateMetadata = () => {
  return TemplateMetadata;
};

export default SceneTypeCategories;
