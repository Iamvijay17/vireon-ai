import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate006Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 006 - Quote/Testimonial
 * Layout: Large pull quote with author badge, decorative line
 */
const Template006 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const quote = elements.quote || scene?.scene_meta?.content?.[0] || '';
  const author = elements.author || '';
  const authorTitle = elements.authorTitle || '';
  const authorImage = elements.authorImage || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate006Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        <div style={styles.contentLayer}>
          <div style={{ ...styles.quoteMark, ...anim.quoteStyle }}>"</div>
          {quoteText && (
            <p style={{ ...styles.quoteText, ...anim.quoteStyle }}>{quoteText}</p>
          )}
          <div style={{ ...styles.decorativeLine, ...anim.lineStyle }} />
          {(authorName || authorImage) && (
            <div style={{ ...styles.authorRow, ...anim.authorStyle }}>
              {authorImage && (
                <Img src={authorImage} style={styles.authorImage} />
              )}
              <div style={styles.authorInfo}>
                <span style={styles.authorName}>{authorName}</span>
                {authorTitle && (
                  <span style={styles.authorTitle}>{authorTitle}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

Template006.displayName = 'Template006';

export default Template006;
