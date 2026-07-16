import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { styles } from './styles';
import { useTemplate002Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 002 - Question & Answer
 * Layout: Question card slides from left -> Pause -> Answer pops in
 *
 * JSON data format:
 * {
 *   templateId: "template-002",
 *   elements: {
 *     question: "string",
 *     answer: "string",
 *     questionIcon: "emoji or text" (optional),
 *     answerIcon: "emoji or text" (optional),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const Template002 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const question = elements.question || '';
  const answer = elements.answer || '';
  const questionIcon = elements.questionIcon || '❓';
  const answerIcon = elements.answerIcon || '💡';
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  // Timing: question appears first, answer appears after a pause
  const fps = 30;
  const questionDuration = Math.min(scene.duration || 8, 4); // question visible for up to 4 seconds
  const questionFrames = questionDuration * fps;
  const pauseFrames = 15; // 0.5 second pause
  const answerStart = questionFrames + pauseFrames;

  const anim = useTemplate002Animations({
    questionDelay: 0,
    answerDelay: answerStart,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.contentLayer}>
          {/* Question Sequence */}
          <Sequence from={0} durationInFrames={questionFrames + pauseFrames + fps * 2}>
            <div style={{ ...styles.questionCard, ...anim.questionStyle }}>
              {questionIcon && (
                <div style={styles.icon}>{questionIcon}</div>
              )}
              <h1 style={styles.questionText}>{question}</h1>
            </div>
          </Sequence>

          {/* Answer Sequence */}
          <Sequence from={answerStart}>
            <div style={{ ...styles.answerCard, ...anim.answerStyle }}>
              {answerIcon && (
                <div style={styles.icon}>{answerIcon}</div>
              )}
              <p style={styles.answerText}>{answer}</p>
            </div>
          </Sequence>
        </div>
      </div>

      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

Template002.displayName = 'Template002';

export default Template002;
