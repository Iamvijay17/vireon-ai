import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate026Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 026 - Definition / Glossary
 * Layout: Term label, title, definition paragraph, example box
 */
const Template026 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const term = elements.term || '';
  const title = elements.title || '';
  const definition = elements.definition || elements.body || '';
  const example = elements.example || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  const anim = useTemplate026Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {term && <div style={{ ...styles.term, ...anim.termStyle }}>{term}</div>}
        <div style={{ ...styles.divider, ...anim.dividerStyle }} />
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        {definition && <p style={{ ...styles.definition, ...anim.defStyle }}>{definition}</p>}
        {example && (
          <div style={{ ...styles.example, ...anim.exStyle }}>
            <div style={styles.exampleLabel}>Example</div>
            <div style={styles.exampleText}>{example}</div>
          </div>
        )}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template026.displayName = 'Template026';
export default Template026;
