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
 * The Remotion Audio component requires files to be accessible via HTTP or from the public directory.
 * We use staticFile() to reference files in the public directory.
 */
const getAudioSrc = (audioFile, jobId, sceneNumber) => {
  if (!audioFile) return null;

  // If it's already a URL (http:// or https://), return as-is
  if (audioFile.startsWith('http://') || audioFile.startsWith('https://')) {
    return audioFile;
  }

  // If it's an absolute Windows path, extract the path relative to the jobs folder (public dir)
  // The path will be like C:/.../jobs/{jobId}/audio/scene1.mp3
  // We want just {jobId}/audio/scene1.mp3 for staticFile
  const normalizedPath = audioFile.replace(/\\/g, '/');
  if (normalizedPath.match(/^[A-Za-z]:/)) {
    // Extract the jobId from path - it's the folder before 'audio'
    // Path structure: .../jobs/{jobId}/audio/scene{N}.mp3
    const pathParts = normalizedPath.split('/');
    const audioIndex = pathParts.indexOf('audio');
    if (audioIndex >= 0) {
      const extractedJobId = pathParts[audioIndex - 1];
      const sceneName = pathParts[audioIndex + 1];
      if (extractedJobId && sceneName) {
        return staticFile(`${extractedJobId}/audio/${sceneName}`);
      }
    }
    // Fallback to jobId from prop if available
    if (jobId) {
      return staticFile(`${jobId}/audio/scene${sceneNumber || 1}.mp3`);
    }
    return null;
  }

  // For relative paths, strip ./ prefix and use staticFile with jobId prefix
  const cleanPath = audioFile.replace(/^\.\//, '');
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
