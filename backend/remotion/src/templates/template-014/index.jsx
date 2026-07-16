import React, { useMemo } from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate014Animations } from './animations';
import { backgroundColors, accentColors } from '../../styles';

/**
 * Template 014 - Bar Chart
 * Layout: Horizontal bar chart with animated fill and labels
 */
const Template014 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const bars = elements.bars || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const barColors = ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f472b6', '#fbbf24'];

  const anim = useTemplate014Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.barChart}>
          {bars.map((bar, index) => {
            const value = parseInt(bar.value) || 0;
            const color = barColors[index % barColors.length];
            const barScale = anim.barFillAnim(index, value);
            return (
              <div key={index} style={{ ...styles.barRow, ...anim.getBarAnim(index) }}>
                <div style={styles.barLabelRow}>
                  <span style={styles.barLabel}>
                    {bar.icon && <span style={styles.barIcon}>{bar.icon}</span>}
                    {bar.label}
                  </span>
                  <span style={{ ...styles.barValue, color }}>{bar.value}%</span>
                </div>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      backgroundColor: color,
                      width: `${value}%`,
                      transform: `scaleX(${barScale.transform ? 1 : 1})`,
                      opacity: barScale.opacity !== undefined ? barScale.opacity : 1,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template014.displayName = 'Template014';
export default Template014;
