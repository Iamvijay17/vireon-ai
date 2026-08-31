import React from 'react';

/**
 * Renders one text-role layout slot (title / body / listItem), styled from
 * the generated StylePlan and positioned absolutely per the Layout
 * Solver's computed geometry. A single generic component instead of a
 * per-template h1/p - the solver already decided font size, position, and
 * whether this slot is a card/numbered row, this just paints it.
 */
const roleBaseStyle = (slot, stylePlan) => {
  const { palette, fonts, titleWeight } = stylePlan;
  switch (slot.role) {
    case 'title':
      return {
        color: palette.text, fontFamily: fonts.title, fontWeight: titleWeight,
        fontSize: slot.fontSize, lineHeight: 1.15, letterSpacing: '-0.02em',
        textAlign: slot.textAlign || 'left', margin: 0,
      };
    case 'body':
      return {
        color: palette.textMuted, fontFamily: fonts.body, fontWeight: 400,
        fontSize: slot.fontSize, lineHeight: 1.5, textAlign: slot.textAlign || 'left', margin: 0,
      };
    case 'listItem':
    default:
      return {
        color: palette.textMuted, fontFamily: fonts.body, fontWeight: 400,
        fontSize: slot.fontSize, lineHeight: 1.4, textAlign: slot.textAlign || 'left', margin: 0,
      };
  }
};

export const SlotText = ({ slot, stylePlan, motionStyle, overrideStyle }) => {
  if (!slot.text) return null;

  const positionStyle = {
    position: 'absolute',
    left: `${slot.xPct * 100}%`,
    top: `${slot.yPct * 100}%`,
    width: `${slot.wPct * 100}%`,
  };

  const chromeStyle = slot.card
    ? {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: stylePlan.shape.radius,
        boxShadow: stylePlan.shape.shadow,
        padding: 28,
        boxSizing: 'border-box',
        height: `${slot.hPct * 100}%`,
      }
    : {};

  return (
    <div
      data-slot-role={slot.role}
      style={{ ...positionStyle, ...chromeStyle, ...motionStyle }}
    >
      {slot.numbered && (
        <span style={{ display: 'inline-block', color: stylePlan.palette.accent, fontFamily: stylePlan.fonts.body, fontWeight: 700, fontSize: 22, marginRight: 12 }}>
          {String((slot.index ?? 0) + 1).padStart(2, '0')}
        </span>
      )}
      {slot.bullet && (
        <span
          style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: stylePlan.palette.accent, marginRight: 12, verticalAlign: 'middle',
          }}
        />
      )}
      {slot.heading && (
        <span style={{ fontWeight: 600, marginRight: 8, color: stylePlan.palette.text, fontFamily: stylePlan.fonts.body }}>
          {slot.heading}
        </span>
      )}
      <span style={{ ...roleBaseStyle(slot, stylePlan), ...overrideStyle, display: 'inline' }}>
        {slot.text}
      </span>
    </div>
  );
};
