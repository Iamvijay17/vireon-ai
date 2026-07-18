import React, { Suspense } from "react";
import {
  AbsoluteFill,
  Sequence,
} from "remotion";
import TemplateRegistry from "./templates/TemplateRegistry";
import DefaultTemplate from "./templates/DefaultTemplate";

const Text = ({ children, style }) => <div style={style}>{children}</div>;

/**
 * Background layer that provides stable background during scene transitions
 * Prevents flickering by ensuring there's always a background visible
 */
const BackgroundLayer = ({ backgroundColor }) => (
  <AbsoluteFill style={{ backgroundColor: backgroundColor || "#1a1a2e" }} />
);

const SceneTransition = ({ children, backgroundColor }) => {
  // Simple wrapper that provides stable background without conflicting animations
  // Templates handle their own internal animations
  return (
    <>
      <BackgroundLayer backgroundColor={backgroundColor} />
      <AbsoluteFill>{children}</AbsoluteFill>
    </>
  );
};

/**
 * Get the audio source path for Remotion Audio component.
 * The Remotion Audio component requires files to be accessible via HTTP.
 * We use the Express server's /public endpoint which serves the jobs directory,
 * since dynamically generated audio files are not available in the static webpack public dir.
 */
const getAudioSrc = (audioFile, jobId, sceneNumber) => {
  if (!audioFile) return null;

  // If it's already a URL (http:// or https://), return as-is
  if (audioFile.startsWith("http://") || audioFile.startsWith("https://")) {
    return audioFile;
  }

  // Determine the server port for the Express backend serving static files
  const getServerPort = () => {
    if (typeof window !== "undefined" && window.location) {
      return window.location.port || "3000";
    }
    return "3000";
  };

  const serverPort = getServerPort();

  // If it's an absolute Windows path, extract jobId and serve via Express HTTP
  const normalizedPath = audioFile.replace(/\\/g, "/");
  if (normalizedPath.match(/^[A-Za-z]:/)) {
    const pathParts = normalizedPath.split("/");
    const audioIndex = pathParts.indexOf("audio");
    if (audioIndex >= 0) {
      const extractedJobId = pathParts[audioIndex - 1];
      const sceneName = pathParts[audioIndex + 1];
      if (extractedJobId && sceneName) {
        return `http://localhost:${serverPort}/public/${extractedJobId}/audio/${sceneName}`;
      }
    }
    if (jobId) {
      return `http://localhost:${serverPort}/public/${jobId}/audio/scene${sceneNumber || 1}.mp3`;
    }
    return null;
  }

  // For relative paths, serve via Express HTTP with jobId prefix
  const cleanPath = audioFile.replace(/^\.\//, "");
  if (jobId) {
    return `http://localhost:${serverPort}/public/${jobId}/${cleanPath}`;
  }

  return `http://localhost:${serverPort}/public/${cleanPath}`;
};

/**
 * Loading fallback component shown while a template is being lazy-loaded
 */
const TemplateLoadingFallback = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#1a1a2e",
    }}
  />
);

/**
 * Resolves the correct template component from the registry based on templateId.
 * Falls back to DefaultTemplate if templateId is missing or unknown.
 *
 * @param {string} templateId - The template identifier from scene JSON
 * @returns {React.Component} The matching template component or DefaultTemplate
 */
const resolveTemplate = (templateId) => {
  if (!templateId) {
    console.warn("No templateId provided in scene — using DefaultTemplate");
    return DefaultTemplate;
  }

  // Normalize templateId: trim whitespace and lowercase for case-insensitive matching
  const normalizedId = String(templateId).trim().toLowerCase();
  const Template = TemplateRegistry[normalizedId];
  if (!Template) {
    console.warn(`Unknown template: "${templateId}" (normalized: "${normalizedId}") — using DefaultTemplate`);
    return DefaultTemplate;
  }

  return Template;
};

// Scene component that dynamically selects and renders the correct template
// Each template handles its own audio rendering internally
const Scene = React.memo(({ scene, jobId }) => {
  const templateId = scene?.templateId;
  const Template = resolveTemplate(templateId);

  return (
    <AbsoluteFill>
      <Suspense fallback={<TemplateLoadingFallback />}>
        <Template scene={scene} />
      </Suspense>
    </AbsoluteFill>
  );
});

Scene.displayName = "Scene";

export const VideoComposition = ({ assets, jobId }) => {
  const { scenes } = assets || {};

  if (!scenes || scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#1a1a2e" }}>
        <Text style={{ color: "#fff", fontSize: 80 }}>No scenes available</Text>
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
        currentFrame += sceneDuration * fps;

        const bgColor = scene.backgroundColor || "#1a1a2e";
        
        return (
          <Sequence
            key={scene.sceneNumber || index}
            from={sceneStart}
            durationInFrames={sceneDuration * fps}
          >
            <SceneTransition backgroundColor={bgColor}>
              <Scene scene={scene} jobId={jobId} />
            </SceneTransition>
          </Sequence>
        );
      })}
    </>
  );
};
