/**
 * Content Analyzer - layer 1 of the generative scene engine.
 *
 * Pure function: turns a scene's raw `elements` (the same shape every
 * hand-coded template already reads - see templates/001-content/index.jsx's
 * JSDoc header) into a ContentProfile the Layout Solver reasons about. No
 * styling or positioning decisions happen here, only content shape.
 */
export const analyzeContent = (scene) => {
  const elements = scene?.elements || {};
  const sceneType = scene?.sceneType || 'content';
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
    sceneType,
    title,
    titleLength: title.length,
    body,
    bodyLength: body.length,
    items,
    itemCount: items.length,
    avgItemChars,
    density,
    hasImage,
    hasHeadings: items.some((item) => Boolean(item.heading)),
  };
};
