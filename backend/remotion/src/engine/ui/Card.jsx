import React from 'react';

/**
 * Card chrome for a `slot.card` text slot (buildGrid, comparisonSplit) -
 * extracted from SlotText.jsx's inline `chromeStyle` object, same values.
 */
export const cardStyle = (slot, stylePlan) => ({
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: stylePlan.shape.radius,
  boxShadow: stylePlan.shape.shadow,
  padding: 28,
  boxSizing: 'border-box',
  height: `${slot.hPct * 100}%`,
});
