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
  title: ['001-title', '002-title', '003-title', '004-title', '005-title', '006-title', '007-title', '008-title', '009-title', '010-title'],
  content: ['001-content', '002-content', '003-content', '004-content', '005-content', '006-content', '007-content', '008-content', '009-content', '010-content', '011-content', '012-content', '013-content', '014-content', '015-content'],
  contentwithimage: ['001-contentwithimage', '002-contentwithimage', '003-contentwithimage', '004-contentwithimage', '005-contentwithimage', '006-contentwithimage', '007-contentwithimage', '008-contentwithimage', '009-contentwithimage'],
  image: ['001-image', '002-image', '003-image', '004-image', '005-image', '006-image', '007-image', '008-image', '009-image', '010-image'],
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
  '004-title': 'Title - Hook Opener (bold, heavy-weight high-impact hero)',
  '005-title': 'Title - Report Cover (editorial kicker + structured layout)',
  '006-title': 'Title - Split Screen (left image panel, right text panel)',
  '007-title': 'Title - Editorial Banner (top kicker ribbon + bottom-anchored title)',
  '008-title': 'Title - Energetic Diagonal (diagonal stripes + hype badge)',
  '009-title': 'Title - Duotone Split (diagonal two-color block background)',
  '010-title': 'Title - Framed Poster (bordered poster frame, image + centered title)',
  '001-content': 'Content - Bullet List (title + plain bullet rows)',
  '002-content': 'Content - Card Grid (title + 2-column cards)',
  '003-content': 'Content - Timeline (title + numbered vertical steps)',
  '004-content': 'Content - Checklist (title + checkmark rows)',
  '005-content': 'Content - Two-Column (title + items split into 2 columns)',
  '006-content': 'Content - Definition Glossary (term/definition rows with dividers)',
  '007-content': 'Content - Step Cards (horizontal row of numbered step cards)',
  '008-content': 'Content - Flow Path (horizontal connected process diagram)',
  '009-content': 'Content - Magazine Dek (headline + pull dek + numbered list)',
  '010-content': 'Content - Monogram Row (horizontal row of letter-tile items)',
  '011-content': 'Content - Quote Highlight (large pull quote + footnote list)',
  '012-content': 'Content - Versus (opposing two-side comparison with center divider)',
  '013-content': 'Content - Ribbon List (stacked full-width index ribbons)',
  '014-content': 'Content - Paragraph Slides (one paragraph item at a time, auto-advancing)',
  '015-content': 'Content - Paragraph Stack (single-column, generous spacing for paragraph-length items)',
  '001-contentwithimage': 'Content + Image (split image/text panel)',
  '002-contentwithimage': 'Content + Image - Image Card (badge overlaid on full-bleed image)',
  '003-contentwithimage': 'Content + Image - Cinematic (full-bleed image, bottom scrim, text anchored bottom)',
  '004-contentwithimage': 'Content + Image - Split Reveal (diagonal sliding text panel over image)',
  '005-contentwithimage': 'Content + Image - Top-Bottom Split (image top half, text bottom half)',
  '006-contentwithimage': 'Content + Image - Framed Inset (bordered thumbnail on solid background)',
  '007-contentwithimage': 'Content + Image - Duotone Overlay (color-wash image with centered text)',
  '008-contentwithimage': 'Content + Image - Circle Frame (circular image badge + centered text)',
  '009-contentwithimage': 'Content + Image - Corner Accent (diagonal corner image block)',
  '001-image': 'Image (full-bleed image with caption)',
  '002-image': 'Image - Cinematic Vignette (dramatic dark vignette overlay)',
  '003-image': 'Image - Layered Frame (bordered, layered single-image collage look)',
  '004-image': 'Image - Storytelling (parchment background, bordered inset frame, editorial caption)',
  '005-image': 'Image - Polaroid (white-bordered instant-photo card with slight rotation)',
  '006-image': 'Image - Side Caption Bar (image + solid vertical caption sidebar)',
  '007-image': 'Image - Duotone Wash (bold color-wash overlay, centered caption)',
  '008-image': 'Image - Bordered Grid Frame (thick accent border, caption below frame)',
  '009-image': 'Image - Split Color Block (half image, half solid color panel)',
  '010-image': 'Image - Kinetic Label (huge poster-style caption across the frame)',
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
  { templateId: '004-title', title: 'Title - Hook Opener', description: 'Big, heavy-weight left-aligned title with an uppercase kicker badge and a soft glow blob. Use for bold, high-impact opens.' },
  { templateId: '005-title', title: 'Title - Report Cover', description: 'Structured, editorial layout with a kicker label, thin frame, and divider above the subtitle. Use for a document/report-cover feel.' },
  { templateId: '006-title', title: 'Title - Split Screen', description: 'A hard vertical split: image fills the left half, title/subtitle sit in a solid right-hand panel. Use for a bold two-block composition.' },
  { templateId: '007-title', title: 'Title - Editorial Banner', description: 'A solid top ribbon with a kicker, a small corner thumbnail, and a huge bottom-anchored title/subtitle. Use for a news/editorial open.' },
  { templateId: '008-title', title: 'Title - Energetic Diagonal', description: 'Diagonal color stripes, a skewed hype badge, and condensed uppercase type. Use for high-energy, gaming/trailer-style opens.' },
  { templateId: '009-title', title: 'Title - Duotone Split', description: 'A diagonal two-color block background with the title anchored at the bottom and a circular image badge near the seam. Use for a bold color-blocking open.' },
  { templateId: '010-title', title: 'Title - Framed Poster', description: 'A full bordered frame with a large image "art" area on top and centered title/subtitle below. Use for a graphic, movie-poster feel.' },
  { templateId: '001-content', title: 'Content - Bullet List', description: 'Title with a plain vertical bullet list. Use for main explanatory content.' },
  { templateId: '002-content', title: 'Content - Card Grid', description: 'Title with a 2-column grid of cards. Use for parallel features/points.' },
  { templateId: '003-content', title: 'Content - Timeline', description: 'Title with a numbered vertical sequence. Use for step-by-step or ordered points.' },
  { templateId: '004-content', title: 'Content - Checklist', description: 'Title with a checkmark-badge list. Use for completed steps or to-do style points.' },
  { templateId: '005-content', title: 'Content - Two-Column', description: 'Title with items split into a left and right column. Use for longer item lists.' },
  { templateId: '006-content', title: 'Content - Definition Glossary', description: 'Title with term/definition rows separated by divider lines. Use for glossary or definition-style content.' },
  { templateId: '007-content', title: 'Content - Step Cards', description: 'Title with items rendered as a horizontal row of bordered cards, each with a numbered circle badge, heading, and text. Use for short step-by-step or feature sequences.' },
  { templateId: '008-content', title: 'Content - Flow Path', description: 'A horizontal process-flow diagram: a connecting line runs through circular numbered nodes, each with heading/text below. Use for pipelines or journeys.' },
  { templateId: '009-content', title: 'Content - Magazine Dek', description: 'A headline with the first item elevated into a large italic pull "dek", followed by the remaining items as a compact numbered list. Use for an editorial/magazine feel.' },
  { templateId: '010-content', title: 'Content - Monogram Row', description: 'A horizontal row of square monogram tiles (first letter of each heading) paired with heading/text underneath. Use for a compact icon-row feel.' },
  { templateId: '011-content', title: 'Content - Quote Highlight', description: 'The first item is rendered as a huge pull quote with attribution; remaining items show as a small footnote row. Use for testimonials or key statements.' },
  { templateId: '012-content', title: 'Content - Versus', description: 'Items split into two opposing sides (alternating by index) around a center divider with a "VS" badge. Use for comparisons or trade-offs.' },
  { templateId: '013-content', title: 'Content - Ribbon List', description: 'Items rendered as full-width stacked ribbons with giant faint index numerals. Use for a table-of-contents/magazine index feel.' },
  { templateId: '014-content', title: 'Content - Paragraph Slides', description: 'Shows one item at a time, full-width, cross-fading to the next partway through the scene. Use when each item.text is a full paragraph rather than a short phrase - avoids cramming long text into a static layout.' },
  { templateId: '015-content', title: 'Content - Paragraph Stack', description: 'A single wide column with generous line-height and no card chrome. Use for 2-3 items whose text is a full paragraph and should stay visible together rather than cycling.' },
  { templateId: '001-contentwithimage', title: 'Content + Image', description: 'Split layout: supporting image on one side, title/body text on the other.' },
  { templateId: '002-contentwithimage', title: 'Content + Image - Image Card', description: 'Full-bleed image with a floating badge and bottom title/body panel. Use for a photo-forward story card look.' },
  { templateId: '003-contentwithimage', title: 'Content + Image - Cinematic', description: 'Full-bleed image with a bottom gradient scrim and bottom-anchored badge/title/body text. Use for a cinematic, photo-forward look.' },
  { templateId: '004-contentwithimage', title: 'Content + Image - Split Reveal', description: 'Full-bleed image with a diagonal-edged text panel sliding in over it. Use for a dynamic, angled reveal composition.' },
  { templateId: '005-contentwithimage', title: 'Content + Image - Top-Bottom Split', description: 'Image fills the top half of the frame, badge/title/body text fills the bottom half. Use for a vertical stacked composition.' },
  { templateId: '006-contentwithimage', title: 'Content + Image - Framed Inset', description: 'A small bordered, drop-shadowed image inset on the left over a solid background, with text on the right. Use for an editorial gallery-plaque feel.' },
  { templateId: '007-contentwithimage', title: 'Content + Image - Duotone Overlay', description: 'Full-bleed image with a strong accent-color duotone wash and centered badge/title/body text. Use for a bold color-blocking look.' },
  { templateId: '008-contentwithimage', title: 'Content + Image - Circle Frame', description: 'A circular cropped image badge centered above the badge/title/body text. Use for a profile-card/avatar-forward composition.' },
  { templateId: '009-contentwithimage', title: 'Content + Image - Corner Accent', description: 'A large diagonally-clipped image block anchored to the top-right corner over a giant faint quote glyph, with text filling the lower-left. Use for a bold editorial corner composition.' },
  { templateId: '001-image', title: 'Image', description: 'Full-bleed image with a bottom caption/label. Use for image-forward scenes.' },
  { templateId: '002-image', title: 'Image - Cinematic Vignette', description: 'Full-bleed image with a dramatic dark radial vignette. Use for moody, cinematic image scenes.' },
  { templateId: '003-image', title: 'Image - Layered Frame', description: 'Bordered foreground frame layered over a blurred backdrop copy of the same image. Use for a collage/texture feel from a single image.' },
  { templateId: '004-image', title: 'Image - Storytelling', description: 'Bordered inset frame on a warm parchment background with an italic editorial caption. Use for a storytelling/scrapbook feel.' },
  { templateId: '005-image', title: 'Image - Polaroid', description: 'Single image inside a white-bordered, slightly rotated polaroid-style card. Use for a candid, instant-photo feel.' },
  { templateId: '006-image', title: 'Image - Side Caption Bar', description: 'Image fills most of the frame with a solid vertical caption sidebar on the right instead of a bottom overlay. Use for a clean editorial split.' },
  { templateId: '007-image', title: 'Image - Duotone Wash', description: 'A strong solid-color duotone gradient wash over the full-bleed image with centered caption. Use for a bold color-blocking poster look.' },
  { templateId: '008-image', title: 'Image - Bordered Grid Frame', description: 'A thick accent-colored border frames the image like a museum placard, with the caption set below the frame. Use for a gallery/placard feel.' },
  { templateId: '009-image', title: 'Image - Split Color Block', description: 'The image fills only the left half of the frame; the right half is a solid accent color block carrying the caption. Use for a geometric split composition.' },
  { templateId: '010-image', title: 'Image - Kinetic Label', description: 'Full-bleed image with huge poster-style caption type stamped across the middle of the frame. Use for a kinetic-typography editorial poster look.' },
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
