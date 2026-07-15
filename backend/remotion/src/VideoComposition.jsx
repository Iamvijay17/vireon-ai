import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
} from 'remotion';

const Text = ({ children, style }) => (
  <div style={style}>
    {children}
  </div>
);

/**
 * Get the audio source path for Remotion Audio component.
 * Handles absolute Windows paths, HTTP URLs, and relative paths.
 * For relative paths, uses jobId to construct proper path relative to public dir.
 */
const getAudioSrc = (audioFile, jobId) => {
  if (!audioFile) return null;

  // If it's already a URL (http:// or https://), return as-is
  if (audioFile.startsWith('http://') || audioFile.startsWith('https://')) {
    return audioFile;
  }

  // If it's an absolute Windows path (e.g., C:/...), convert to file:// URL
  const normalizedPath = audioFile.replace(/\\/g, '/');
  if (normalizedPath.match(/^[A-Za-z]:/)) {
    const encodedPath = normalizedPath.replace(/ /g, '%20');
    return `file:///${encodedPath}`;
  }

  // For relative paths, strip ./ prefix
  // staticFile requires paths like "audio/sceneX.mp3" or "jobId/audio/sceneX.mp3"
  const cleanPath = audioFile.replace(/^\.\//, '');

  // If jobId is available, prepend it to the path for proper public dir resolution
  if (jobId) {
    return staticFile(`${jobId}/${cleanPath}`);
  }

  return staticFile(cleanPath);
};

// Scene component for individual scenes
const Scene = ({ scene, jobId }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: scene?.backgroundColor || '#1a1a2e' }}>
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
        {scene?.title && (
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
        {scene?.subtitle && (
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
        {(!scene?.title && !scene?.subtitle) && (
          <Text
            style={{
              color: '#888',
              fontSize: 48,
              fontStyle: 'italic',
            }}
          >
            Scene {scene?.sceneNumber}
          </Text>
        )}
      </div>
      {scene?.audio?.file && (
        <Audio
          src={getAudioSrc(scene.audio.file, jobId)}
        />
      )}
    </AbsoluteFill>
  );
};

export const VideoComposition = ({ assets, jobId }) => {
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
          <Scene scene={scene} jobId={jobId} />
        </Sequence>
      ))}
    </>
  );
};
