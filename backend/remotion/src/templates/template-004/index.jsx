import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { styles } from './styles';
import { useTimelineItemAnimations } from './animations';
import { backgroundColors, textStyles } from '../../styles';

/**
 * Template 004 - Timeline
 * Layout: Animated timeline with cards appearing one by one
 *
 * JSON data format:
 * {
 *   templateId: "template-004",
 *   elements: {
 *     title: "string",
 *     items: [
 *       { date: "string", text: "string" },
 *       { date: "string", text: "string" }
 *     ],
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const Template004 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.slate;

  const itemAnimations = useMemo(
    () => items.map((_, index) => useTimelineItemAnimations(index)),
    [items.length]
  );

  const fps = 30;
  const secondsPerItem = 3;
  const totalCardFrames = items.length * secondsPerItem * fps;

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.contentLayer}>
          {/* Title */}
          {title && (
            <h1 style={styles.title}>{title}</h1>
          )}

          {/* Timeline */}
          <div style={styles.timelineContainer}>
            {/* Timeline line */}
            <div style={styles.timelineLine} />

            {items.map((item, index) => {
              const itemStart = index * secondsPerItem * fps;
              const { dotStyle, cardAnim } = itemAnimations[index];
              const isLeft = index % 2 === 0;

              return (
                <Sequence key={index} from={itemStart} durationInFrames={totalCardFrames - itemStart}>
                  <div style={{
                    ...styles.cardRow,
                    ...(isLeft ? {} : styles.cardRowRight),
                  }}>
                    {/* Dot */}
                    <div style={{ ...styles.dot, ...dotStyle }} />

                    {/* Card */}
                    <div style={{ ...styles.card, ...cardAnim }}>
                      {item.date && (
                        <p style={styles.cardDate}>{item.date}</p>
                      )}
                      <p style={styles.cardText}>{item.text}</p>
                    </div>
                  </div>
                </Sequence>
              );
            })}
          </div>
        </div>
      </div>

      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

Template004.displayName = 'Template004';

export default Template004;
