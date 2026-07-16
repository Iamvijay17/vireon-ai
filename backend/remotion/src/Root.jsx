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
  'template-016': 'Template-016-Image-Collage-Grid',
  'template-017': 'Template-017-Story-Image-Text',
  'template-018': 'Template-018-Masonry-Wall',
  'template-019': 'Template-019-Parallax-Hero',
  'template-020': 'Template-020-Image-Card-Story',
  'template-021': 'Template-021-Vignette-Story',
  'template-022': 'Template-022-Polaroid-Collage',
  'template-023': 'Template-023-Story-Cards',
  'template-024': 'Template-024-Split-Reveal',
  'template-025': 'Template-025-Curtain-Reveal',
  'template-026': 'Template-026-Definition-Glossary',
  'template-027': 'Template-027-Checklist-Points',
  'template-028': 'Template-028-Comparison-Table',
  'template-029': 'Template-029-Did-You-Know',
  'template-030': 'Template-030-Report-Summary',
  'template-031': 'Template-031-Expert-Quote',
  'template-032': 'Template-032-Step-Guide',
  'template-033': 'Template-033-Benefits-Row',
  'template-034': 'Template-034-Learning-Paths',
  'template-035': 'Template-035-Tech-Tags',
  'template-036': 'Template-036-Case-Study',
  'template-037': 'Template-037-Milestones',
  'template-038': 'Template-038-Metrics-Grid',
  'template-039': 'Template-039-Profile-Spotlight',
  'template-040': 'Template-040-Skills-Chips',
  'template-041': 'Template-041-Modern-Minimal',
  'template-042': 'Template-042-Podcast',
  'template-043': 'Template-043-News',
  'template-044': 'Template-044-Social-Media',
  'template-045': 'Template-045-Cinematic',
  'template-046': 'Template-046-Tech-Review',
  'template-047': 'Template-047-Motivational',
  'template-048': 'Template-048-Interview',
  'template-049': 'Template-049-Tutorial',
  'template-050': 'Template-050-Gaming',
  'template-051': 'Template-051-Fitness',
  'template-052': 'Template-052-Cooking',
  'template-053': 'Template-053-Travel',
  'template-054': 'Template-054-Educational',
  'template-055': 'Template-055-Corporate',
  'template-056': 'Template-056-Music',
  'template-057': 'Template-057-Science',
  'template-058': 'Template-058-Storytelling',
  'template-059': 'Template-059-Event',
  'template-060': 'Template-060-Comedy',
};

const templateDurations = {
  'template-004': 360,
  'template-009': 300,
  'template-013': 300,
  'template-028': 300,
  'template-032': 300,
  'template-037': 300,
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
