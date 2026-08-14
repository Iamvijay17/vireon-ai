import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 014-content template ("Paragraph Slides" variant of the "content" scene type)
 *
 * Built for items whose `text` is a full paragraph, not a short phrase -
 * every other content variant lays all items out on screen at once, which
 * gets cramped/unreadable once `text` runs to a few sentences. This variant
 * instead shows ONE item at a time, full-width and full-height, and
 * automatically cross-fades to the next item partway through the scene's
 * total duration - like a tiny slideshow inside a single scene, giving each
 * paragraph its own moment instead of competing for space with the others.
 *
 * Same elements shape as every other content variant -
 * { title, items: [{heading?, text}] } - just paced across time instead of
 * laid out in one static composition. `scene.duration` (seconds) is read to
 * size the per-item time slice; falls back to an even split of a nominal
 * 8s scene if not provided.
 */
const Content014 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  const scale = width / 1920;

  const title = elements.title || '';
  const bgColor = elements.backgroundColor || palette.clean;
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const accentColor = overrides.accentColor;

  const items = useMemo(() => {
    return (elements.items || []).map((item) => ({ heading: item.heading || '', text: item.text || '' }));
  }, [elements.items]);

  const totalFrames = Math.max(1, Math.round((scene?.duration || 8) * fps));
  const sliceFrames = Math.max(1, Math.floor(totalFrames / Math.max(1, items.length)));
  const CROSSFADE = Math.min(12, Math.floor(sliceFrames / 3));

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 40, textAlign: 'left', marginBottom: spacing.xl, opacity: 0.75, ...positionStyle(overrides.title?.position) }, overrides.title);
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.background, background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 60%, #0d1117 100%)` }} />

      <div style={{ ...styles.content, transform: `scale(${scale})`, transformOrigin: 'center center', width: `${100 / scale}%`, height: `${100 / scale}%` }}>
        {title && (
          <h1 data-style-role="title" style={{ ...titleStyle, opacity: titleOpacity }}>
            {title}
          </h1>
        )}

        <div style={styles.slideStage}>
          {items.map((item, index) => {
            const start = index * sliceFrames;
            const end = start + sliceFrames;
            const opacity = interpolate(
              frame,
              [start, start + CROSSFADE, end - CROSSFADE, end],
              [0, 1, 1, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            );
            if (opacity <= 0) return null;
            return (
              <div key={index} style={{ ...styles.slide, opacity }}>
                <div style={{ ...styles.slideIndex, ...(accentColor ? { color: accentColor } : {}) }}>
                  {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
                </div>
                {item.heading && <p style={styles.slideHeading}>{item.heading}</p>}
                {item.text && <p style={styles.slideText}>{item.text}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <CaptionRenderer
        text={caption}
        animation="fadeInUp"
        animationConfig={{ slideDistance: 15 }}
        styleConfig={{
          position: 'bottom',
          fontFamily: typography.title.fontFamily,
          fontWeight: 500,
          fontSize: 36,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backgroundPadding: '10px 20px',
          borderRadius: 8,
          framesPerWord: 3,
          maxWidth: '75%',
          ...overrides.captions,
        }}
        timestamps={captionTimestamps}
        fps={fps}
      />

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Content014.displayName = 'Content014';
export default Content014;
