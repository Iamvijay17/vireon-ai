import React from 'react';
import { Img } from 'remotion';
import { Nameplate } from '../ui';
import { computeImageTransform, imageTransformToCss } from '../imageMotion';

/**
 * Renders the 'image' role layout slot, positioned per the Layout
 * Solver's geometry and chrome-styled from the generated StylePlan.
 * `slot.circle` (podcast-centered strategy) renders a circular avatar with
 * an accent glow ring, matching templates/001-podcast's host image treatment.
 * `slot.nameplateText` (podcast-split strategy) overlays a small pill badge
 * at the image's bottom-left, matching templates/002-podcast's nameplate.
 *
 * `imageMotion` (an id from engine/imageMotion.js) drifts the picture inside its
 * frame over the scene: `progress` is 0 -> 1 across the scene and `damping` (0-1)
 * softens the move when the camera is moving as well. Left unset, the picture is
 * static exactly as before.
 */
export const SlotImage = ({ slot, src, motionStyle, stylePlan, imageMotion, progress = 0, damping = 1 }) => {
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

  const drift = imageMotion ? imageTransformToCss(computeImageTransform(imageMotion, progress, damping)) : undefined;

  return (
    <div style={{ ...positionStyle, ...motionStyle }}>
      <Img
        src={src}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          ...(drift ? { transform: drift, transformOrigin: 'center center' } : {}),
        }}
      />
      {slot.nameplateText && <Nameplate text={slot.nameplateText} stylePlan={stylePlan} />}
    </div>
  );
};
