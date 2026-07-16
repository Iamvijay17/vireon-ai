import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate010Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 010 - Split Screen / Hero
 * Layout: Left text panel + Right stats panel with diagonal split
 */
const Template010 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const stats = elements.stats || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate010Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {/* Diagonal split overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '55%',
          height: '100%',
          background: 'linear-gradient(135deg, rgba(96,165,250,0.08) 0%, rgba(96,165,250,0.02) 100%)',
          clipPath: 'polygon(30% 0, 100% 0, 100% 100%, 0% 100%)',
          zIndex: 0,
        }} />

        {/* Left Panel */}
        <div style={{ ...styles.leftPanel, ...anim.leftStyle }}>
          <div style={styles.accentBar} />
          {title && <h1 style={styles.title}>{title}</h1>}
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </div>

        {/* Right Panel */}
        <div style={{ ...styles.rightPanel, ...anim.rightStyle }}>
          <div style={styles.statsRow}>
            {stats.map((stat, index) => (
              <div key={index} style={{ ...styles.statItem, ...(index === 0 ? anim.statStyle : {}) }}>
                <div style={styles.statNumber}>{stat.value}</div>
                <div style={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template010.displayName = 'Template010';
export default Template010;
