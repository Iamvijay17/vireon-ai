import React from 'react';

/**
 * Podcast host nameplate overlay for `slot.nameplateText` (podcastSplit
 * scene component) - extracted from SlotImage.jsx unchanged.
 */
export const Nameplate = ({ text, stylePlan }) => (
  <div
    style={{
      position: 'absolute', left: 0, bottom: '18%',
      padding: '10px 24px',
      background: `${stylePlan.palette.accent}cc`,
      borderRadius: '0 8px 8px 0',
    }}
  >
    <span style={{ color: stylePlan.palette.bg, fontSize: 22, fontWeight: 800, fontFamily: stylePlan.fonts.body }}>
      {text}
    </span>
  </div>
);
