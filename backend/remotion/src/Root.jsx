import "./index.css";
import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { Logo } from "./HelloWorld/Logo";
import { VideoComposition } from "./VideoComposition";
import { sampleScenes } from "./sampleData";

// Each <Composition> is an entry in the sidebar!

/**
 * Dynamically calculate the duration of the video based on the scenes provided via props.
 * This ensures the composition's durationInFrames matches the actual total scene duration.
 */
const calculateVideoMetadata = ({ props }) => {
  const { assets } = props;
  const scenes = assets?.scenes || [];
  const fps = 30;

  // Calculate total duration from all scenes (default 8 seconds per scene)
  const totalDurationSeconds = scenes.reduce(
    (sum, scene) => sum + (scene.duration || 8),
    scenes.length > 0 ? 0 : 8 // default 8 seconds if no scenes
  );

  const durationInFrames = Math.max(Math.round(totalDurationSeconds * fps), 30); // minimum 1 second (30 frames)

  return {
    durationInFrames,
    fps,
  };
};

// Wrapper that renders a single template scene as a full composition (no sequences)
const SingleSceneWrapper = ({ scene }) => {
  const { VideoComposition: VC } = require("./VideoComposition");
  return <VC assets={{ title: "", scenes: [scene] }} jobId="preview" />;
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          titleText: "Welcome to Remotion",
          titleColor: "black",
        }}
      />
      <Composition
        id="OnlyLogo"
        component={Logo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Template Preview Compositions */}
      <Composition
        id="Template-001-Educational-Card"
        component={() => (
          <VideoComposition
            assets={{
              title: "Template 001 Preview",
              scenes: [sampleScenes["template-001"]],
            }}
            jobId="preview"
          />
        )}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="Template-002-Question-Answer"
        component={() => (
          <VideoComposition
            assets={{
              title: "Template 002 Preview",
              scenes: [sampleScenes["template-002"]],
            }}
            jobId="preview"
          />
        )}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="Template-003-Image-Focus"
        component={() => (
          <VideoComposition
            assets={{
              title: "Template 003 Preview",
              scenes: [sampleScenes["template-003"]],
            }}
            jobId="preview"
          />
        )}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="Template-004-Timeline"
        component={() => (
          <VideoComposition
            assets={{
              title: "Template 004 Preview",
              scenes: [sampleScenes["template-004"]],
            }}
            jobId="preview"
          />
        )}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="Template-005-Comparison"
        component={() => (
          <VideoComposition
            assets={{
              title: "Template 005 Preview",
              scenes: [sampleScenes["template-005"]],
            }}
            jobId="preview"
          />
        )}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Video Composition for Vireon AI (used for rendering) */}
      <Composition
        id="VideoComposition"
        component={VideoComposition}
        calculateMetadata={calculateVideoMetadata}
        durationInFrames={30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          assets: {
            title: "",
            description: "",
            scenes: [],
          },
          jobId: "",
        }}
      />
    </>
  );
};
