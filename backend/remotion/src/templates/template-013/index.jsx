import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate013Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 013 - Steps / How-To
 * Layout: Numbered steps list with title + description
 */
const Template013 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const emoji = elements.emoji || '📋';
  const steps = elements.steps || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.slate;

  const anim = useTemplate013Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && (
          <div style={{ ...styles.header, ...anim.headerStyle }}>
            {emoji && <span style={styles.emoji}>{emoji}</span>}
            <h1 style={styles.title}>{title}</h1>
          </div>
        )}
        <div style={styles.stepsContainer}>
          {steps.map((step, index) => (
            <div key={index} style={{ ...styles.stepRow, ...anim.getStepAnim(index) }}>
              <div style={styles.stepNumber}>{index + 1}</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>{step.title}</div>
                {step.description && <div style={styles.stepDesc}>{step.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template013.displayName = 'Template013';
export default Template013;
