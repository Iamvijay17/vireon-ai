import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate008Animations } from './animations';
import { backgroundColors, accentColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 008 - Pill Tags / Keywords
 * Layout: Floating pill/tag bubbles with staggered entrance
 */
const Template008 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || elements.tags || [];
  const bgColor = elements.backgroundColor || backgroundColors.slate;
  const overrides = elements.styleConfig || {};
  const pillColors = ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f472b6', '#fbbf24', '#22d3ee', '#f87171'];

  const anim = useTemplate008Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 data-style-role="title" style={mergeStyle({ ...styles.sectionTitle, ...anim.titleStyle, ...positionStyle(overrides.title?.position) }, overrides.title)}>{title}</h1>}
        <div style={styles.pillContainer}>
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                ...styles.pill,
                ...anim.getPillAnim(index),
                backgroundColor: `${pillColors[index % pillColors.length]}22`,
                border: `2px solid ${pillColors[index % pillColors.length]}55`,
                color: pillColors[index % pillColors.length],
              }}
            >
              {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
              {item.text || item.title || ''}
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template008.displayName = 'Template008';
export default Template008;
