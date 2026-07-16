import "./index.css";
import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { Logo } from "./HelloWorld/Logo";
import { VideoComposition } from "./VideoComposition";

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

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        // You can take the "id" to render a video:
        // npx remotion render HelloWorld
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        // You can override these props for each render:
        // https://www.remotion.dev/docs/parametrized-rendering
        defaultProps={{
          titleText: "Welcome to Remotion",
          titleColor: "black",
        }}
      />
      {/* Mount any React component to make it show up in the sidebar and work on it individually! */}
      <Composition
        id="OnlyLogo"
        component={Logo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* Video Composition for Vireon AI */}
      <Composition
        id="VideoComposition"
        component={VideoComposition}
        calculateMetadata={calculateVideoMetadata}
        durationInFrames={30} // Will be overridden by calculateMetadata, but required as fallback
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          assets: {
            title: '',
            description: '',
            scenes: [],
          },
          jobId: '',
        }}
      />
    </>
  );
};
