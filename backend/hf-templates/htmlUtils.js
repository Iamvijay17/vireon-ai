/**
 * Tiny helpers for building HTML/CSS strings server-side (no JSX/React
 * available in the HyperFrames port - templates return plain markup).
 */

const CSS_PROP_MAP = {
  // A handful of JS style keys used across the ported templates whose CSS
  // property name isn't just kebab-casing the JS key.
  WebkitBoxOrient: '-webkit-box-orient',
  WebkitLineClamp: '-webkit-line-clamp',
};

const toKebabCase = (key) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const UNITLESS = new Set(['zIndex', 'fontWeight', 'lineHeight', 'opacity']);

const cssValue = (key, value) => {
  if (typeof value === 'number' && !UNITLESS.has(key)) return `${value}px`;
  return value;
};

/** Converts a React-style JS style object into an inline `style="..."` value. */
export const styleToCss = (styleObj = {}) =>
  Object.entries(styleObj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => `${CSS_PROP_MAP[key] || toKebabCase(key)}: ${cssValue(key, value)};`)
    .join(' ');

export const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
