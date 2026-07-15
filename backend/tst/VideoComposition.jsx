import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Text,
  Audio,
} from 'remotion';

export const VideoComposition = ({ assets }) => {
  const { title, scenes, resolution = '1920x1080', aspectRatio = '16:9' } = assets || {};
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate current scene based on duration (8 seconds per scene by default)
  const sceneDuration = 8; // seconds per scene
  const totalDuration = (scenes?.length || 1) * sceneDuration * fps;
  const currentSceneIndex = Math.min(
    Math.floor(frame / (sceneDuration * fps)),
    (scenes?.length || 1) - 1
  );
  const scene = scenes?.[currentSceneIndex];

  if (!scene) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
        <Text style={{ color: '#fff', fontSize: 80 }}>No scenes available</Text>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: scene.backgroundColor || '#1a1a2e' }}>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 60,
        }}
      >
        {scene.title && (
          <Text
            style={{
              color: '#fff',
              fontSize: 64,
              fontWeight: 'bold',
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            {scene.title}
          </Text>
        )}
        {scene.subtitle && (
          <Text
            style={{
              color: '#ccc',
              fontSize: 32,
              marginBottom: 40,
              textAlign: 'center',
            }}
          >
            {scene.subtitle}
          </Text>
        )}
        {!scene.title && !scene.subtitle && (
          <Text
            style={{
              color: '#888',
              fontSize: 48,
              fontStyle: 'italic',
            }}
          >
            Scene {scene.sceneNumber}
          </Text>
        )}
      </div>
      {scene.audio?.file && (
        <Audio src={`file:///${scene.audio.file.replace(/\\/g, '/').replace(/^/, '/')}`} />
      )}
    </AbsoluteFill>
  );
};