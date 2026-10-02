/**
 * Shared helpers every Background Component uses - factored out only so
 * they aren't retyped identically in all 8 files (same reasoning as
 * motion/shared.js's CLAMP).
 */

// Full-bleed, click-through layer every background renders into. Backgrounds
// sit behind the scene's content div (see GeneratedScene.jsx), so they must
// never intercept pointer events or affect layout.
export const layerStyle = (extra = {}) => ({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  ...extra,
});

// Keeps a caller-supplied intensity (nominally 0-1, from a VisualStyle
// preset possibly scaled down by content coverage - see chooseVisuals.js)
// inside a sane opacity range so a background never goes fully invisible or
// fully opaque regardless of what the caller passes in.
export const clampIntensity = (value, min = 0.05, max = 1) => Math.min(max, Math.max(min, value ?? 0.3));
