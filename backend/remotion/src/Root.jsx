import "./index.css";
import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { Logo } from "./HelloWorld/Logo";
import { VideoComposition } from "./VideoComposition";
import { sampleScenes } from "./sampleData";
import { calculateVideoMetadata } from "./calculateVideoMetadata";

// Each <Composition> is an entry in the sidebar!

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

// Template display names for the sidebar - All 60 templates
const templateNames = {
  'template-001': '001-Educational-Card',
  'template-002': '002-Question-Answer',
  'template-003': '003-Image-Focus',
  'template-004': '004-Timeline',
  'template-005': '005-Comparison',
  'template-006': '006-Quote-Testimonial',
  'template-007': '007-Stats-Dashboard',
  'template-008': '008-Pill-Tags',
  'template-009': '009-Bullet-List',
  'template-010': '010-Split-Hero',
  'template-011': '011-Team-Profiles',
  'template-012': '012-Countdown',
  'template-013': '013-Steps-HowTo',
  'template-014': '014-Bar-Chart',
  'template-015': '015-Feature-Grid',
  'template-016': '016-Image-Collage',
  'template-017': '017-Story-Image-Text',
  'template-018': '018-Masonry-Wall',
  'template-019': '019-Parallax-Hero',
  'template-020': '020-Image-Card-Story',
  'template-021': '021-Vignette-Story',
  'template-022': '022-Polaroid-Collage',
  'template-023': '023-Story-Cards',
  'template-024': '024-Split-Reveal',
  'template-025': '025-Curtain-Reveal',
  'template-026': '026-Definition-Glossary',
  'template-027': '027-Checklist-Points',
  'template-028': '028-Comparison-Table',
  'template-029': '029-Did-You-Know',
  'template-030': '030-Report-Summary',
  'template-031': '031-Expert-Quote',
  'template-032': '032-Step-Guide',
  'template-033': '033-Benefits-Row',
  'template-034': '034-Learning-Paths',
  'template-035': '035-Tech-Tags',
  'template-036': '036-Case-Study',
  'template-037': '037-Milestones',
  'template-038': '038-Metrics-Grid',
  'template-039': '039-Profile-Spotlight',
  'template-040': '040-Skills-Chips',
  'template-041': '041-Modern-Minimal',
  'template-042': '042-Podcast',
  'template-043': '043-News',
  'template-044': '044-Social-Media',
  'template-045': '045-Cinematic',
  'template-046': '046-Tech-Review',
  'template-047': '047-Motivational',
  'template-048': '048-Interview',
  'template-049': '049-Tutorial',
  'template-050': '050-Gaming',
  'template-051': '051-Fitness',
  'template-052': '052-Cooking',
  'template-053': '053-Travel',
  'template-054': '054-Educational',
  'template-055': '055-Corporate',
  'template-056': '056-Music',
  'template-057': '057-Science',
  'template-058': '058-Storytelling',
  'template-059': '059-Event',
  'template-060': '060-Comedy',
};

const templateDurations = {
  'template-009': 300,
  'template-012': 300,
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

      {/* Template Preview Compositions - All 60 Templates */}
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