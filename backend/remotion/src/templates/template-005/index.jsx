import React, { useMemo } from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate005Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 005 - Comparison
 * Layout: Left Card | VS | Right Card animated separately
 *
 * JSON data format:
 * {
 *   templateId: "template-005",
 *   elements: {
 *     header: "string" (optional),
 *     leftCard: {
 *       title: "string",
 *       body: "string",
 *       icon: "emoji or text" (optional)
 *     },
 *     rightCard: {
 *       title: "string",
 *       body: "string",
 *       icon: "emoji or text" (optional)
 *     },
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const Template005 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const header = elements.header || '';
  const leftCard = elements.leftCard || {};
  const rightCard = elements.rightCard || {};
  const bgColor = elements.backgroundColor || backgroundColors.warm;

  const anim = useTemplate005Animations({ leftDelay: 0, vsDelay: 20, rightDelay: 25 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.contentLayer}>
          {/* Left Card */}
          <div style={{ ...styles.card, ...anim.leftStyle }}>
            {leftCard.icon && (
              <div style={styles.cardIcon}>{leftCard.icon}</div>
            )}
            {leftCard.title && (
              <h2 style={styles.cardTitle}>{leftCard.title}</h2>
            )}
            {leftCard.body && (
              <p style={styles.cardBody}>{leftCard.body}</p>
            )}
          </div>

          {/* VS Badge */}
          <div style={{ ...styles.vsBadge, ...anim.vsStyle }}>
            VS
          </div>

          {/* Right Card */}
          <div style={{ ...styles.card, ...anim.rightStyle }}>
            {rightCard.icon && (
              <div style={styles.cardIcon}>{rightCard.icon}</div>
            )}
            {rightCard.title && (
              <h2 style={styles.cardTitle}>{rightCard.title}</h2>
            )}
            {rightCard.body && (
              <p style={styles.cardBody}>{rightCard.body}</p>
            )}
          </div>
        </div>
      </div>

      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

Template005.displayName = 'Template005';

export default Template005;
