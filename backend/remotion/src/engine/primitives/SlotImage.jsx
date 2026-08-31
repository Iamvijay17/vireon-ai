import React from 'react';
import { Img } from 'remotion';

/**
 * Renders the 'image' role layout slot, positioned per the Layout
 * Solver's geometry and chrome-styled from the generated StylePlan.
 * `slot.circle` (podcast-centered strategy) renders a circular avatar with
 * an accent glow ring, matching templates/001-podcast's host image treatment.
 * `slot.nameplateText` (podcast-split strategy) overlays a small pill badge
 * at the image's bottom-left, matching templates/002-podcast's nameplate.
 */
export const SlotImage = ({ slot, src, motionStyle, stylePlan }) => {
  const positionStyle = {
    position: 'absolute',
    left: `${slot.xPct * 100}%`,
    top: `${slot.yPct * 100}%`,
    width: `${slot.wPct * 100}%`,
    height: `${slot.hPct * 100}%`,
    overflow: 'hidden',
    ...(slot.circle
      ? { borderRadius: '50%', border: `3px solid ${stylePlan.palette.accent}`, boxShadow: `0 0 40px ${stylePlan.palette.accent}55` }
      : {}),
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
      {slot.nameplateText && (
        <div
          style={{
            position: 'absolute', left: 0, bottom: '18%',
            padding: '10px 24px',
            background: `${stylePlan.palette.accent}cc`,
            borderRadius: '0 8px 8px 0',
          }}
        >
          <span style={{ color: stylePlan.palette.bg, fontSize: 22, fontWeight: 800, fontFamily: stylePlan.fonts.body }}>
            {slot.nameplateText}
          </span>
        </div>
      )}
    </div>
  );
};
