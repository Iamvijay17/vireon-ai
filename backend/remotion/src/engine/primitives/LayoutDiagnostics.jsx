import React from 'react';

/**
 * Dev/preview overlay for the vertical layout (verticalLayout.js). Draws the
 * content group's bounds and a readout of the numbers behind it, in canvas px -
 * render it inside the scaled content layer. Off unless a scene opts in with
 * `scene.debug.layout` or `elements.styleConfig.layoutDebug`.
 */
export const LayoutDiagnostics = ({ diagnostics }) => {
  if (!diagnostics) return null;
  const {
    contentHeight, availableHeight, topPadding, bottomPadding, gap, overflow, layoutMode, verticalAlign, canvas,
  } = diagnostics;
  const color = overflow ? '#ff4d4f' : '#35d07f';

  const lines = [
    `Content Height: ${contentHeight}`,
    `Available Height: ${availableHeight} (canvas ${canvas.height})`,
    `Top / Bottom Padding: ${topPadding} / ${bottomPadding}`,
    `Gap: ${gap}`,
    `Vertical Alignment: ${verticalAlign} (${layoutMode})`,
    `Overflow: ${overflow}`,
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: topPadding, height: Math.max(canvas.height - topPadding - bottomPadding, 0),
          border: `2px dashed ${color}`, boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          position: 'absolute', right: 16, top: 16, padding: '8px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.75)',
          color, fontFamily: 'monospace', fontSize: 16, lineHeight: 1.4, whiteSpace: 'pre',
        }}
      >
        {lines.join('\n')}
      </div>
    </div>
  );
};
