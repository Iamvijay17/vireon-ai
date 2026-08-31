import React from 'react';
import { Img } from 'remotion';

/**
 * Renders the 'image' role layout slot, positioned per the Layout
 * Solver's geometry and chrome-styled from the generated StylePlan.
 */
export const SlotImage = ({ slot, src, motionStyle, stylePlan }) => {
  const positionStyle = {
    position: 'absolute',
    left: `${slot.xPct * 100}%`,
    top: `${slot.yPct * 100}%`,
    width: `${slot.wPct * 100}%`,
    height: `${slot.hPct * 100}%`,
    overflow: 'hidden',
  };

  if (!src) {
    return (
      <div style={{ ...positionStyle, ...motionStyle, backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, fontFamily: stylePlan.fonts.body }}>No Image</span>
      </div>
    );
  }

  return (
    <div style={{ ...positionStyle, ...motionStyle }}>
      <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
};
