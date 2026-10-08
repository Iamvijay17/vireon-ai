import React, { Suspense, useEffect, useRef, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import TemplateRegistry from "./templates/TemplateRegistry";
import DefaultTemplate from "./templates/DefaultTemplate";
import { applyFontPairing } from "./theme";
import { isHardCut, getTransitionStyle, resolveTransitionId } from "./transitions";
import { computeCameraTransform, cameraTransformToCss } from "./camera";
import { SpeechProvider } from "./speech/SpeechContext";

const Text = ({ children, style }) => <div style={style}>{children}</div>;

/**
 * Background layer that provides stable background during scene transitions
 * Prevents flickering by ensuring there's always a background visible
 */
const BackgroundLayer = ({ backgroundColor }) => (
  <AbsoluteFill style={{ backgroundColor: backgroundColor || "#1a1a2e" }} />
);

/**
 * Eases the incoming scene in over `frames` (0 -> 1), matching the interpolate
 * clamp behavior every transition variant below shares.
 */
const useEntranceProgress = (frames) => {
  const frame = useCurrentFrame();
  return frames > 0
    ? interpolate(frame, [0, frames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
};

/**
 * Renders one scene's entrance effect. The outgoing scene's Sequence is
 * extended to overlap this window (see VideoComposition below), so both
 * scenes are mounted simultaneously and this only has to style the incoming
 * one - the previous scene sits underneath, unstyled, at full opacity.
 */
const SceneTransition = ({ children, backgroundColor, fadeInFrames = 0, transitionType = "fade" }) => {
  const progress = useEntranceProgress(fadeInFrames);
  const style = getTransitionStyle(transitionType, progress);

  return (
    <AbsoluteFill style={style}>
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
//
// Templates are React.lazy chunks, so the first frame of a scene can be taken
// before its template has loaded. A video render never noticed (later frames
// are fine), but `remotion still` - the job thumbnail - captures one frame
// right away and got THIS placeholder: every new job's thumbnail was a flat
// #1a1a2e square. The fallback therefore holds the render open
// (delayRender) until it unmounts, i.e. until the real template has appeared.
const TemplateLoadingFallback = () => {
  const [handle] = useState(() => delayRender("Loading scene template"));
  useEffect(() => () => continueRender(handle), [handle]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a2e",
      }}
    />
  );
};

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
    console.warn(
      `Unknown template: "${templateId}" (normalized: "${normalizedId}") — using DefaultTemplate`,
    );
    return DefaultTemplate;
  }

  return Template;
};

/**
 * Slow whole-scene zoom/pan driven by `scene.cameraMotion` (see camera.js).
 * Inside a Sequence, useCurrentFrame/useVideoConfig are relative to that
 * scene's own span, so progress runs 0 -> 1 across the scene regardless of
 * where it sits in the video. A static/unknown motion adds no transform, so
 * those scenes render exactly as before.
 */
const CameraMotion = ({ motion, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const transform = cameraTransformToCss(
    computeCameraTransform(motion, durationInFrames > 1 ? frame / (durationInFrames - 1) : 0),
  );
  if (!transform) return <>{children}</>;

  return <AbsoluteFill style={{ transform, transformOrigin: "center center" }}>{children}</AbsoluteFill>;
};

// Scene component that dynamically selects and renders the correct template
// Each template handles its own audio rendering internally. `jobId` is
// passed through in addition to `scene` - every hand-coded template still
// only destructures `{ scene }` and ignores it, but GeneratedScene
// (templateId "generative") uses it as its Style Generator seed so every
// scene in the same job resolves to the same palette/font pairing instead
// of each scene picking its own (see GeneratedScene.jsx).
/**
 * Layout QC only (see qc/LayoutQc.jsx): marks the probe around a scene as ready
 * once the lazily-loaded template has actually mounted. It sits inside the
 * template's Suspense boundary, so its effect cannot run until the template has
 * resolved - which is exactly the signal the probe needs before measuring.
 */
const QcReadyMarker = () => {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.closest("[data-qc-probe]")?.setAttribute("data-qc-ready", "1");
  }, []);
  return <span ref={ref} style={{ display: "none" }} />;
};

const Scene = React.memo(({ scene, jobId, qc = false }) => {
  const templateId = scene?.templateId;
  const Template = resolveTemplate(templateId);

  return (
    <AbsoluteFill
      data-scene-frame="true"
      data-scene-number={scene?.sceneNumber ?? ""}
      style={{ overflow: "hidden" }}
    >
      {/* Speech-driven timing (ENABLE_SPEECH_DRIVEN_ANIMATION): the scene's canonical
          speech timeline, shared by captions and the speech-aware primitives. With the
          flag off the scene carries no timeline, the provider holds null, and nothing
          below changes. */}
      <SpeechProvider timeline={scene?.audio?.speech ?? null} timing={scene?.speechTiming ?? null}>
        <CameraMotion motion={scene?.cameraMotion}>
          <Suspense fallback={<TemplateLoadingFallback />}>
            <Template scene={scene} jobId={jobId} />
            {qc && <QcReadyMarker />}
          </Suspense>
        </CameraMotion>
      </SpeechProvider>
    </AbsoluteFill>
  );
});

Scene.displayName = "Scene";

export { Scene };

export const VideoComposition = ({ assets, jobId }) => {
  const { scenes, fontPairing } = assets || {};

  // Mutates the shared theme.js `typography` object once, before any scene
  // below renders - see applyFontPairing's doc comment for why this is safe
  // (one Remotion render process per video).
  applyFontPairing(fontPairing);

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

  // Precompute each scene's frame span first, so the transition overlap at
  // each boundary can be sized against both neighbors' actual lengths.
  const layout = scenes.map((scene, index) => {
    const sceneDuration = scene.duration || 8; // seconds per scene, default 8
    const sceneFrames = Math.round(sceneDuration * fps);
    const sceneStart = currentFrame;
    currentFrame += sceneFrames;
    return { scene, index, sceneStart, sceneFrames };
  });

  // A boundary's transition (fade/slide/wipe/zoom/cut...) is a property of
  // the incoming scene - "how does this scene arrive". Cut/none get zero
  // overlap so they land as a true hard cut instead of a hidden crossfade.
  const boundaryOverlap = (index) => {
    const incoming = layout[index]?.scene;
    const transitionType = resolveTransitionId(incoming, index);
    if (isHardCut(transitionType)) return 0;
    return Math.min(
      MAX_TRANSITION_FRAMES,
      Math.floor(layout[index - 1].sceneFrames / 3),
      Math.floor(layout[index].sceneFrames / 3),
    );
  };

  return (
    <>
      {layout.map(({ scene, index, sceneStart, sceneFrames }) => {
        const overlapWithNext = index < layout.length - 1 ? boundaryOverlap(index + 1) : 0;
        const overlapWithPrev = index > 0 ? boundaryOverlap(index) : 0;
        const transitionType = resolveTransitionId(scene, index);

        const bgColor = scene.backgroundColor || "#1a1a2e";

        return (
          <Sequence
            key={scene.sceneNumber || index}
            from={sceneStart}
            // Extended past its natural end (except the last scene) so it
            // stays mounted underneath the next scene's entrance effect.
            durationInFrames={sceneFrames + overlapWithNext}
          >
            <SceneTransition
              backgroundColor={bgColor}
              fadeInFrames={overlapWithPrev}
              transitionType={transitionType}
            >
              <Scene scene={scene} jobId={jobId} />
            </SceneTransition>
          </Sequence>
        );
      })}
    </>
  );
};
