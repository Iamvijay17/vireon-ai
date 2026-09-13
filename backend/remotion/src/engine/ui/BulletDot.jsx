import React from 'react';

/** Bullet dot for `slot.bullet` (stackList scene component). */
export const BulletDot = ({ stylePlan }) => (
  <span
    style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: stylePlan.palette.accent, marginRight: 12, verticalAlign: 'middle',
    }}
  />
);
