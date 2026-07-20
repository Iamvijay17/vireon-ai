import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { styles } from './styles';
import { useTemplate007Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 007 - Stats/Data Dashboard
 * Layout: Grid of stat cards with animated numbers and staggered entrance
 */
const Template007 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const contentItems = scene?.scene_meta?.content || [];
  const stats = elements.stats || contentItems.map(text => ({ value: text, label: '' }));
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  const anim = useTemplate007Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={styles.title}>{title}</h1>}
        <div style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <div key={index} style={{ ...styles.statCard, ...anim.getCardAnim(index) }}>
              {stat.icon && <div style={styles.statIcon}>{stat.icon}</div>}
              <div style={styles.statValue}>{stat.value}</div>
              <div style={styles.statLabel}>{stat.label}</div>
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
