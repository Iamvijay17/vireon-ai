import React from 'react';
import { cardStyle, NumberBadge, BulletDot } from '../ui';

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
    case 'label':
      return {
        color: palette.accent, fontFamily: fonts.body, fontWeight: 600,
        fontSize: slot.fontSize, letterSpacing: '0.08em', textTransform: 'uppercase',
        textAlign: slot.textAlign || 'left', margin: 0,
      };
    case 'listItem':
    default:
      return {
        color: palette.textMuted, fontFamily: fonts.body, fontWeight: 400,
        fontSize: slot.fontSize, lineHeight: 1.4, textAlign: slot.textAlign || 'left', margin: 0,
      };
  }
};

// title/body slots carry an hPct sized to their actual measured text height
// (solveLayout's titleSlot/fitTextToBox), capped at a sane ceiling for
// pathologically long text. Clamping the rendered box to that same height
// means an edge case that still needs more room than its geometry accounted
// for (e.g. split-image/podcast-* place the next slot at a fixed yPct gap
// rather than deriving it from the title's real height) truncates cleanly
// instead of visibly overlapping the slot below it.
const CLAMPABLE_ROLES = new Set(['title', 'body']);

export const SlotText = ({ slot, stylePlan, motionStyle, overrideStyle }) => {
  if (!slot.text) return null;

  const positionStyle = {
    position: 'absolute',
    left: `${slot.xPct * 100}%`,
    top: `${slot.yPct * 100}%`,
    width: `${slot.wPct * 100}%`,
  };

  const clampStyle = CLAMPABLE_ROLES.has(slot.role) && !slot.card && slot.hPct
    ? { height: `${slot.hPct * 100}%`, overflow: 'hidden' }
    : {};

  const chromeStyle = slot.card ? cardStyle(slot, stylePlan) : {};

  return (
    <div
      data-slot-role={slot.role}
      style={{ ...positionStyle, ...clampStyle, ...chromeStyle, ...motionStyle }}
    >
      {slot.numbered && <NumberBadge index={slot.index} stylePlan={stylePlan} />}
      {slot.bullet && <BulletDot stylePlan={stylePlan} />}
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
