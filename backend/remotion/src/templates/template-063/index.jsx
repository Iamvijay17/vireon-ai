import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * Template 063 - Title + Two-Column
 *
 * Canonical "PPT slide" layout for comparisons/explanations: title, accent
 * line, then a plain two-column body (text/text, or image/text when the
 * first column carries an image). No card backgrounds, no borders beyond a
 * single hairline divider - matches template-062's un-decorated style.
 *
 * Data format:
 * {
 *   templateId: "template-063",
 *   elements: {
 *     title: "string",
 *     columns: [{ heading?, body, image? }, { heading?, body, image? }],
 *     backgroundColor: "#hex",
 *     styleConfig: { title: {...}, subtitle: {...}, accentColor: "#hex" }
 *   }
 * }
 */
const Template063 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  const scale = width / 1920;

  const title = elements.title || '';
  const bgColor = elements.backgroundColor || palette.clean;
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const columns = elements.columns?.length ? elements.columns : [{}, {}];

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 56, marginBottom: 16, ...positionStyle(overrides.title?.position) }, overrides.title);
  const headingStyle = mergeStyle({ ...typography.subtitle, color: palette.accentSolid, textAlign: 'left', fontWeight: 600 }, overrides.heading);
  const bodyStyle = mergeStyle({ ...typography.body, textAlign: 'left' }, overrides.body);
  const accentColor = overrides.accentColor;

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });
  const lineScaleX = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.background, background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 60%, #0d1117 100%)` }} />

      <div style={{ ...styles.content, transform: `scale(${scale})`, transformOrigin: 'center center', width: `${100 / scale}%`, height: `${100 / scale}%` }}>
        {title && (
          <h1 style={{ ...titleStyle, opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
            {title}
          </h1>
        )}

        <div
          style={{
            ...styles.accentLine,
            ...(accentColor ? { background: accentColor } : {}),
            transform: `scaleX(${lineScaleX})`,
            transformOrigin: 'center center',
            opacity: titleOpacity,
          }}
        />

        <div style={styles.columns}>
          {columns.map((col, index) => {
            const colOpacity = interpolate(frame, [20 + index * 10, 40 + index * 10], [0, 1], { extrapolateRight: 'clamp' });
            const colX = interpolate(frame, [20 + index * 10, 45 + index * 10], [index === 0 ? -30 : 30, 0], { extrapolateRight: 'clamp' });
            return (
              <React.Fragment key={index}>
                {index > 0 && <div style={styles.divider} />}
                <div style={{ ...styles.column, opacity: colOpacity, transform: `translateX(${colX}px)` }}>
                  {col.image && (
                    <div style={styles.imageWrapper}>
                      <Img src={col.image} style={{ width: '100%', display: 'block' }} />
                    </div>
                  )}
                  {col.heading && <div style={{ ...headingStyle, ...styles.columnHeading }}>{col.heading}</div>}
                  {col.body && <div style={bodyStyle}>{col.body}</div>}
                </div>
              </React.Fragment>
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

Template063.displayName = 'Template063';
export default Template063;
