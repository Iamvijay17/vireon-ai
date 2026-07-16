import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate012Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 012 - Countdown / Timer
 * Layout: Large countdown timer with days/hours/minutes/seconds blocks
 */
const Template012 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const message = elements.message || '';
  const timeBlocks = elements.timeBlocks || elements.items || [
    { value: '07', label: 'Days' },
    { value: '12', label: 'Hours' },
    { value: '45', label: 'Minutes' },
    { value: '30', label: 'Seconds' },
  ];
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate012Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.countdownContainer}>
          {timeBlocks.map((block, index) => (
            <React.Fragment key={index}>
              <div style={{ ...styles.timeBlock, ...anim.getBlockAnim(index) }}>
                <div style={styles.timeNumber}>{block.value}</div>
                <div style={styles.timeLabel}>{block.label}</div>
              </div>
              {index < timeBlocks.length - 1 && (
                <div style={styles.separator}>:</div>
              )}
            </React.Fragment>
          ))}
        </div>
        {message && <div style={{ ...styles.message, ...anim.msgStyle }}>{message}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template012.displayName = 'Template012';
export default Template012;
