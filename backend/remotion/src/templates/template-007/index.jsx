import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate007Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 007 - Stats Dashboard
 * Layout: Plain list of stat rows (value + label, hairline divider) with
 * staggered entrance - no glassmorphism cards, no icon badges.
 */
const Template007 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const stats = elements.stats || [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const anim = useTemplate007Animations({ frameOffset: 0 });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const valueStyle = mergeStyle(styles.statValue, overrides.accentColor ? { color: overrides.accentColor } : {});

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 data-style-role="title" style={titleStyle}>{title}</h1>}
        <div style={styles.statList}>
          {stats.map((stat, index) => (
            <div key={index} style={{ ...styles.statRow, ...anim.getCardAnim(index) }}>
              <div style={styles.statLabel}>{stat.label}</div>
              <div style={valueStyle}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template007.displayName = 'Template007';
export default Template007;
