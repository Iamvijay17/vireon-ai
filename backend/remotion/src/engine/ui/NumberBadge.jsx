import React from 'react';

/** Two-digit numbered badge for `slot.numbered` (timeline scene component). */
export const NumberBadge = ({ index, stylePlan }) => (
  <span
    style={{
      display: 'inline-block', color: stylePlan.palette.accent, fontFamily: stylePlan.fonts.body,
      fontWeight: 700, fontSize: 22, marginRight: 12,
    }}
  >
    {String((index ?? 0) + 1).padStart(2, '0')}
  </span>
);
