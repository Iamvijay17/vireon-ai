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

/**
 * Helper to create a composition with sample scene data
 */
const createTemplateComposition = (templateId, durationInFrames = 240) => {
  const scene = sampleScenes[templateId];
  const sceneDuration = scene?.duration || 8;
  return {
    component: () => (
      <VideoComposition
        assets={{
          title: templateId,
          scenes: [scene],
        }}
        jobId="preview"
      />
    ),
    durationInFrames: Math.max(durationInFrames, sceneDuration * 30),
    fps: 30,
    width: 1920,
    height: 1080,
  };
};

// Template display names for the sidebar
const templateNames = {
  'template-001': 'Template-001-Educational-Card',
  'template-002': 'Template-002-Question-Answer',
  'template-003': 'Template-003-Image-Focus',
  'template-004': 'Template-004-Timeline',
  'template-005': 'Template-005-Comparison',
  'template-006': 'Template-006-Quote-Testimonial',
  'template-007': 'Template-007-Stats-Dashboard',
  'template-008': 'Template-008-Pill-Tags',
  'template-009': 'Template-009-Bullet-List',
  'template-010': 'Template-010-Split-Hero',
  'template-011': 'Template-011-Team-Profiles',
  'template-012': 'Template-012-Countdown',
  'template-013': 'Template-013-Steps-HowTo',
  'template-014': 'Template-014-Bar-Chart',
  'template-015': 'Template-015-Feature-Grid',
};

const templateDurations = {
  'template-004': 360,
  'template-009': 300,
  'template-013': 300,
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

      {/* Template Preview Compositions - All 15 Templates */}
      {Object.keys(sampleScenes).map((templateId) => {
        const comp = createTemplateComposition(templateId, templateDurations[templateId] || 240);
        return (
          <Composition
            key={templateId}
            id={templateNames[templateId]}
            component={comp.component}
            durationInFrames={comp.durationInFrames}
            fps={comp.fps}
            width={comp.width}
            height={comp.height}
          />
        );
      })}

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
