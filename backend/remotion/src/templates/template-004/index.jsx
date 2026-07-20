import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { styles } from './styles';
import { getTimelineItemAnimations } from './animations';
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
  const bgColor = elements.backgroundColor || backgroundColors.slate;
  const contentItems = scene?.scene_meta?.content || [];

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const secondsPerItem = 3;
  const totalCardFrames = contentItems.length * secondsPerItem * fps;

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

            {contentItems.map((text, index) => {
              const itemStart = index * secondsPerItem * fps;
              const { dotStyle, cardAnim } = getTimelineItemAnimations(frame, fps, index);
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
                      <p style={styles.cardText}>{text}</p>
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
