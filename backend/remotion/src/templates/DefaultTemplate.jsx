import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors, textStyles } from '../styles';

/**
 * DefaultTemplate
 *
 * Rendered when a scene's templateId does not match any registered template.
 * Provides a graceful fallback without crashing the rendering pipeline.
 * Shows a warning and displays the available scene data.
 */
const DefaultTemplate = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || scene?.title || '';
  const subtitle = elements.subtitle || scene?.subtitle || '';
  const sceneNumber = scene?.sceneNumber || '';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: backgroundColors.dark,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
      }}
    >
      {sceneNumber && (
        <p style={{ ...textStyles.label, marginBottom: 20 }}>
          Scene {sceneNumber}
        </p>
      )}
      {title && (
        <h1 style={textStyles.title}>{title}</h1>
      )}
      {subtitle && (
        <p style={{ ...textStyles.subtitle, marginTop: 20 }}>
          {subtitle}
        </p>
      )}
      {!title && !subtitle && (
        <p style={{ ...textStyles.subtitle, fontStyle: 'italic' }}>
          Template: {scene?.templateId || 'unknown'} — Loading scene data...
        </p>
      )}
      <p
        style={{
          ...textStyles.body,
          marginTop: 40,
          color: '#f59e0b',
          fontSize: 18,
        }}
      >
        Using default template
      </p>

      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

DefaultTemplate.displayName = 'DefaultTemplate';

export default DefaultTemplate;
