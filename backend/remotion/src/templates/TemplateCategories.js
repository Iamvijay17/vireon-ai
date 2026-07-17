/**
 * Template Categories
 *
 * Maps video types (educational, podcast, marketing, etc.) to their 
 * applicable Remotion template IDs. Each video type can have multiple
 * templates that vary in layout, animation style, and visual approach.
 *
 * The LLM prompt will include these mappings so it selects appropriate
 * templates for each scene based on the scene's content.
 */

const TemplateCategories = {
  /**
   * Educational: Clean, structured layouts with text emphasis
   * Best for: Explanations, tutorials, definitions, step-by-step guides
   */
  educational: [
    'template-001',  // Educational Card - Title + subtitle + image
    'template-009',  // Bullet List - Clear bullet points
    'template-013',  // Steps / How-To - Sequential steps
    'template-026',  // Definition / Glossary - Term definitions
    'template-027',  // Checklist Points - Checklist style
    'template-032',  // Step Guide - Numbered guide
    'template-034',  // Learning Paths - Path/flow visualization
    'template-049',  // Tutorial - Tutorial layout
    'template-054',  // Educational - Dedicated educational layout
    'template-041',  // Modern Minimal - Clean modern look
  ],

  /**
   * Podcast: Warm, conversational, studio-style layouts
   * Best for: Dialogues, interviews, discussions
   */
  podcast: [
    'template-042',  // Podcast - Dedicated podcast layout
    'template-048',  // Interview - Interview format
    'template-056',  // Music - Audio-focused
    'template-031',  // Expert Quote - Quote/testimonial focus
    'template-039',  // Profile Spotlight - Speaker highlight
    'template-036',  // Case Study - In-depth discussion
  ],

  /**
   * Marketing: Bold, promotional, conversion-focused layouts
   * Best for: Product launches, ads, promotional content
   */
  marketing: [
    'template-005',  // Comparison - Product comparisons
    'template-007',  // Stats Dashboard - Statistics/metrics
    'template-010',  // Split Hero - Hero section split layout
    'template-015',  // Feature Grid - Feature showcase
    'template-028',  // Comparison Table - Table comparisons
    'template-033',  // Benefits Row - Benefits highlights
    'template-044',  // Social Media - Social-style layout
    'template-055',  // Corporate - Professional corporate
    'template-003',  // Image Focus - Image-forward layout
  ],

  /**
   * Story: Narrative, emotional, visual storytelling layouts
   * Best for: Stories, narratives, emotional content
   */
  story: [
    'template-017',  // Story Image Text - Image + text narrative
    'template-020',  // Image Card Story - Card-based story
    'template-021',  // Vignette Story - Vignette style
    'template-022',  // Polaroid Collage - Collage style
    'template-023',  // Story Cards - Card sequence
    'template-045',  // Cinematic - Cinematic layout
    'template-058',  // Storytelling - Storytelling focused
    'template-024',  // Split Reveal - Reveal animations
    'template-025',  // Curtain Reveal - Curtain-style reveal
  ],

  /**
   * Motivational: Inspiring, energetic, quote-focused layouts
   * Best for: Motivational content, quotes, inspiration
   */
  motivational: [
    'template-006',  // Quote Testimonial - Quote focused
    'template-029',  // Did You Know - Fact/insight display
    'template-047',  // Motivational - Dedicated motivational
    'template-037',  // Milestones - Progress/achievement
    'template-019',  // Parallax Hero - Parallax scrolling effect
    'template-004',  // Timeline - Journey/timeline
    'template-038',  // Metrics Grid - Achievement metrics
  ],

  /**
   * Business: Professional, data-driven, corporate layouts
   * Best for: Business reports, data presentation, professional content
   */
  business: [
    'template-004',  // Timeline - Business timelines
    'template-011',  // Team Profiles - Team/people
    'template-014',  // Bar Chart - Data visualization
    'template-030',  // Report Summary - Report layout
    'template-036',  // Case Study - Business cases
    'template-038',  // Metrics Grid - Business metrics
    'template-043',  // News - News-style layout
    'template-055',  // Corporate - Corporate branding
    'template-010',  // Split Hero - Executive summary
  ],

  /**
   * YouTube Shorts / Social: Vertical, engaging, fast-paced layouts
   * Best for: Short-form content, social media
   */
  youtube_shorts: [
    'template-044',  // Social Media - Social optimized
    'template-050',  // Gaming - Gaming style
    'template-051',  // Fitness - Energetic style
    'template-052',  // Cooking - How-to style
    'template-053',  // Travel - Travel/variety
    'template-059',  // Event - Event highlights
    'template-060',  // Comedy - Fun/entertaining
    'template-016',  // Image Collage Grid - Collage
    'template-018',  // Masonry Wall - Dynamic layout
  ],

  /**
   * General / Default: Versatile templates that work for any type
   */
  general: [
    'template-002',  // Question Answer - Q&A format
    'template-008',  // Pill Tags - Tag/chip display
    'template-012',  // Countdown - Countdown/timer
    'template-035',  // Tech Tags - Technology tags
    'template-040',  // Skills Chips - Skills display
    'template-046',  // Tech Review - Review format
    'template-057',  // Science - Scientific layout
  ],
};

/**
 * Get the list of template IDs for a given video type.
 * Falls back to "general" templates if the type is not found.
 *
 * @param {string} videoType - The video type key (e.g., "podcast", "educational")
 * @returns {string[]} Array of template IDs
 */
export const getTemplatesForType = (videoType) => {
  return TemplateCategories[videoType] || TemplateCategories.general || [];
};

/**
 * Get all video type keys that have template mappings.
 *
 * @returns {string[]} Array of video type keys
 */
export const getVideoTypes = () => {
  return Object.keys(TemplateCategories);
};

/**
 * Get the template IDs and their human-readable names for a video type.
 * Useful for sending to the LLM so it can pick appropriate templates.
 *
 * @param {string} videoType - The video type key
 * @returns {string} Formatted string listing templates for the prompt
 */
export const getTemplatePromptHint = (videoType) => {
  const templateIds = getTemplatesForType(videoType);

  // Readable names for templates from Root.jsx
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

  return templateIds
    .map((id) => `  - "${id}": ${templateNames[id] || id}`)
    .join('\n');
};

export default TemplateCategories;