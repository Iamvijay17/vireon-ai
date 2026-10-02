/**
 * Content Analyzer - layer 1 of the generative scene engine.
 *
 * Pure function: turns a scene's raw `elements` into a ContentProfile the
 * Layout Solver reasons about. No styling or positioning decisions happen
 * here, only content shape - including normalizing the sceneType-specific
 * field names in `elements` (see each sceneType's shape below) into one
 * consistent vocabulary (title/subtitle/body/items/imageSrc/spokenCaption)
 * so the solver and renderer don't need per-sceneType branching themselves.
 */

// "image" scenes use `caption`/`label` as an on-screen headline/kicker
// overlaid on the image (see templates/001-image/index.jsx) - no template
// in this sceneType calls CaptionRenderer, so there is no spoken-caption
// text to preserve; the headline/kicker get remapped into title/subtitle.
const analyzeImageScene = (elements) => {
  const title = elements.caption || '';
  const subtitle = elements.label || '';
  return {
    title, titleLength: title.length,
    subtitle, body: '', bodyLength: 0,
    items: [], itemCount: 0, avgItemChars: 0, density: 'short',
    hasImage: Boolean(elements.image), hasHeadings: false, hostName: '',
    imageSrc: elements.image || '',
    spokenCaption: '', captionTimestamps: null,
  };
};

// "podcast" scenes use `hostImage`/`hostName` instead of `image`/`items`,
// but DO use `caption`/`captionTimestamps` as spoken word-timed captions
// (see templates/001-podcast, 002-podcast) - same as "content" scenes.
const analyzePodcastScene = (elements) => {
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  return {
    title, titleLength: title.length,
    subtitle, body: '', bodyLength: 0,
    items: [], itemCount: 0, avgItemChars: 0, density: 'short',
    hasImage: Boolean(elements.hostImage), hasHeadings: false,
    hostName: elements.hostName || '',
    imageSrc: elements.hostImage || '',
    spokenCaption: elements.caption || '', captionTimestamps: elements.captionTimestamps || null,
  };
};

const analyzeStandardScene = (elements) => {
  const title = elements.title || '';
  const items = Array.isArray(elements.items) ? elements.items : [];
  const body = elements.body || elements.text || '';
  const hasImage = Boolean(elements.image);

  const itemTextLengths = items.map((item) => (item.text || '').length + (item.heading || '').length);
  const totalItemChars = itemTextLengths.reduce((sum, n) => sum + n, 0);
  const avgItemChars = items.length ? totalItemChars / items.length : 0;

  // Density buckets drive the solver's macro composition choice - a
  // handful of short bullet phrases lays out very differently from 2-3
  // paragraph-length items sharing the same `items` array shape.
  const density = avgItemChars > 140 ? 'paragraph' : avgItemChars > 60 ? 'medium' : 'short';

  return {
    title, titleLength: title.length,
    subtitle: '', body, bodyLength: body.length,
    items, itemCount: items.length, avgItemChars, density,
    hasImage, hasHeadings: items.some((item) => Boolean(item.heading)), hostName: '',
    imageSrc: elements.image || '',
    spokenCaption: elements.caption || '', captionTimestamps: elements.captionTimestamps || null,
  };
};

export const analyzeContent = (scene) => {
  const elements = scene?.elements || {};
  const sceneType = scene?.sceneType || 'content';

  const shape = sceneType === 'image'
    ? analyzeImageScene(elements)
    : sceneType === 'podcast'
      ? analyzePodcastScene(elements)
      : analyzeStandardScene(elements);

  return { sceneType, ...shape };
};
