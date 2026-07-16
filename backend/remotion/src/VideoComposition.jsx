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
 * The Remotion Audio component requires files to be accessible via HTTP.
 * We use the Express server's /public endpoint which serves the jobs directory,
 * since dynamically generated audio files are not available in the static webpack public dir.
 */
const getAudioSrc = (audioFile, jobId, sceneNumber) => {
  if (!audioFile) return null;

  // If it's already a URL (http:// or https://), return as-is
  // Newer assets use Express server URLs directly (e.g. http://localhost:3001/public/{jobId}/audio/scene{N}.mp3)
  if (audioFile.startsWith('http://') || audioFile.startsWith('https://')) {
    return audioFile;
  }

  // Determine the server port for the Express backend serving static files
  // The Express backend defaults to port 3000 (configurable via PORT env var)
  // In Studio mode (browser), use window.location.port so it works across different setups
  const getServerPort = () => {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.port || '3000';
    }
    return '3000';
  };

  const serverPort = getServerPort();

  // If it's an absolute Windows path, extract jobId and serve via Express HTTP
  const normalizedPath = audioFile.replace(/\\/g, '/');
  if (normalizedPath.match(/^[A-Za-z]:/)) {
    // Path structure: .../jobs/{jobId}/audio/scene{N}.mp3
    const pathParts = normalizedPath.split('/');
    const audioIndex = pathParts.indexOf('audio');
    if (audioIndex >= 0) {
      const extractedJobId = pathParts[audioIndex - 1];
      const sceneName = pathParts[audioIndex + 1];
      if (extractedJobId && sceneName) {
        return `http://localhost:${serverPort}/public/${extractedJobId}/audio/${sceneName}`;
      }
    }
    // Fallback to jobId from prop if available
    if (jobId) {
      return `http://localhost:${serverPort}/public/${jobId}/audio/scene${sceneNumber || 1}.mp3`;
    }
    return null;
  }

  // For relative paths, serve via Express HTTP with jobId prefix
  const cleanPath = audioFile.replace(/^\.\//, '');
  if (jobId) {
    return `http://localhost:${serverPort}/public/${jobId}/${cleanPath}`;
  }

  return `http://localhost:${serverPort}/public/${cleanPath}`;
};

// Scene component for individual scenes
const Scene = ({ scene, jobId }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor:  '#1a1a2e' }}>
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
          src={getAudioSrc(scene.audio.file, jobId, scene.sceneNumber)}
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

  // Calculate total duration based on actual scene durations
  const fps = 30;
  let currentFrame = 0;

  return (
    <>
      {scenes.map((scene, index) => {
        const sceneDuration = scene.duration || 8; // seconds per scene, default 8
        const sceneStart = currentFrame;
        const sceneEnd = currentFrame + sceneDuration * fps;
        currentFrame = sceneEnd;

        return (
          <Sequence
            key={scene.sceneNumber || index}
            from={sceneStart}
            durationInFrames={sceneDuration * fps}
          >
            <Scene scene={scene} jobId={jobId} />
          </Sequence>
        );
      })}
    </>
  );
};
