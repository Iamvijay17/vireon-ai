import React, { Suspense } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
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

/**
 * Crossfades a scene (background + content together) in from the previous
 * scene over `fadeInFrames`, instead of popping in at full opacity.
 * The outgoing scene's Sequence is extended to overlap this window (see
 * VideoComposition below), so both scenes are visible and blend smoothly
 * instead of hard-cutting - which is what previously read as a "flicker".
 */
const SceneTransition = ({ children, backgroundColor, fadeInFrames = 0 }) => {
  const frame = useCurrentFrame();
  const opacity =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <AbsoluteFill style={{ opacity }}>
      <BackgroundLayer backgroundColor={backgroundColor} />
      <AbsoluteFill>{children}</AbsoluteFill>
    </AbsoluteFill>
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
  const MAX_TRANSITION_FRAMES = 15; // ~0.5s crossfade between consecutive scenes
  let currentFrame = 0;

  // Precompute each scene's frame span first, so the crossfade overlap at
  // each boundary can be sized against both neighbors' actual lengths.
  const layout = scenes.map((scene, index) => {
    const sceneDuration = scene.duration || 8; // seconds per scene, default 8
    const sceneFrames = Math.round(sceneDuration * fps);
    const sceneStart = currentFrame;
    currentFrame += sceneFrames;
    return { scene, index, sceneStart, sceneFrames };
  });

  return (
    <>
      {layout.map(({ scene, index, sceneStart, sceneFrames }) => {
        const prevFrames = layout[index - 1]?.sceneFrames;
        const nextFrames = layout[index + 1]?.sceneFrames;

        // Cap the overlap so a transition never eats more than a third of
        // either adjacent scene's own length (keeps very short scenes sane).
        const overlapWithNext =
          index < layout.length - 1
            ? Math.min(MAX_TRANSITION_FRAMES, Math.floor(sceneFrames / 3), Math.floor(nextFrames / 3))
            : 0;
        const overlapWithPrev =
          index > 0
            ? Math.min(MAX_TRANSITION_FRAMES, Math.floor(sceneFrames / 3), Math.floor(prevFrames / 3))
            : 0;

        const bgColor = scene.backgroundColor || "#1a1a2e";

        return (
          <Sequence
            key={scene.sceneNumber || index}
            from={sceneStart}
            // Extended past its natural end (except the last scene) so it
            // stays mounted underneath the next scene's fade-in.
            durationInFrames={sceneFrames + overlapWithNext}
          >
            <SceneTransition backgroundColor={bgColor} fadeInFrames={overlapWithPrev}>
              <Scene scene={scene} jobId={jobId} />
            </SceneTransition>
          </Sequence>
        );
      })}
    </>
  );
};
