import React from 'react';
import { layerStyle } from './shared';

export const id = 'solid';

/**
 * Cheapest possible background - a flat fill. Also the registry's fallback
 * for an unknown/missing background id (see index.js's renderBackground),
 * so it must never depend on anything that could throw.
 */
export const render = ({ palette } = {}) => (
  <div style={layerStyle({ backgroundColor: palette?.bg || '#111111' })} />
);
