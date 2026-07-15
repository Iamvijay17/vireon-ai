import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Text,
  Audio,
  Sequence,
} from 'remotion';

// Scene component for individual scenes
const Scene = ({ scene, fps, totalScenes }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

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
              width: '100%',
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
              width: '100%',
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
        <Audio
          src={scene.audio.file.startsWith('file://')
            ? scene.audio.file
            : `file:///${scene.audio.file.replace(/\\/g, '/')}`
          }
        />
      )}
    </AbsoluteFill>
  );
};

export const VideoComposition = ({ assets }) => {
  const { title, scenes } = assets || {};

  if (!scenes || scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
        <Text style={{ color: '#fff', fontSize: 80 }}>No scenes available</Text>
      </AbsoluteFill>
    );
  }

  // Calculate total duration (8 seconds per scene by default)
  const sceneDuration = 8; // seconds per scene
  const fps = 30;

  return (
    <>
      {scenes.map((scene, index) => (
        <Sequence
          key={scene.sceneNumber || index}
          from={index * sceneDuration * fps}
          durationInFrames={sceneDuration * fps}
        >
          <Scene scene={scene} fps={fps} totalScenes={scenes.length} />
        </Sequence>
      ))}
    </>
  );
};