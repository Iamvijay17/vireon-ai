/**
 * Shared helpers every Decoration Component uses - kept as this folder's
 * own copy (not imported from backgrounds/shared.js) so each engine
 * subfolder stays self-contained, matching the project's existing
 * per-folder shared.js convention (motion/shared.js, scenes/shared.js).
 */

export const layerStyle = (extra = {}) => ({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  ...extra,
});

// Decorations get their intensity scaled down further than backgrounds by
// chooseVisuals.js (they must never compete with content), so the floor/
// ceiling here are lower than backgrounds/shared.js's.
export const clampIntensity = (value, min = 0.03, max = 0.8) => Math.min(max, Math.max(min, value ?? 0.25));
