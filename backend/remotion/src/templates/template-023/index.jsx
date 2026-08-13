import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate023Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 023 - Story Cards Carousel
 * Layout: Horizontal card deck sliding in from left, like a story/carousel
 */
const Template023 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const cards = elements.cards || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.slate;
  const overrides = elements.styleConfig || {};

  const anim = useTemplate023Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && (
          <h1 data-style-role="title" style={mergeStyle({ ...styles.title, ...anim.titleStyle, ...positionStyle(overrides.title?.position) }, overrides.title)}>
            {title}
          </h1>
        )}
        <div style={styles.carouselTrack}>
          {cards.map((card, index) => (
            <div key={index} style={{ ...styles.carouselCard, ...anim.getCardAnim(index) }}>
              {card.image && <Img src={card.image} style={styles.cardImage} />}
              <div style={styles.cardContent}>
                <div style={styles.cardTitle}>{card.title}</div>
                {card.description && <div style={styles.cardDesc}>{card.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template023.displayName = 'Template023';
export default Template023;
