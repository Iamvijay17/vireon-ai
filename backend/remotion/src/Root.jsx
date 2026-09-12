import "./index.css";
import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { Logo } from "./HelloWorld/Logo";
import { VideoComposition } from "./VideoComposition";
import { sampleScenes } from "./sampleData";
import { sampleGenerativeScenes } from "./engine/sampleGenerativeScenes";
import { calculateVideoMetadata } from "./calculateVideoMetadata";

// Each <Composition> is an entry in the sidebar!

/**
 * Helper to create a composition with sample scene data
 */
const createTemplateComposition = (templateId, durationInFrames = 240, width = 1920, height = 1080) => {
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
    width,
    height,
  };
};

const templateDurations = {};

// Reference templates reflowed for portrait/square (see the aspect-ratio
// plan) - previewed here at 1080x1920 and 1080x1080 alongside the default
// 1920x1080 preview above, since Remotion Studio has no way to resize an
// existing composition's canvas: without a dedicated composition per size,
// there was no way to visually check portrait/square output at all.
const ORIENTATION_PREVIEW_TEMPLATE_IDS = [
  '001-content',
  '002-content',
  '003-content',
  '004-content',
  '005-content',
  '006-content',
  '007-content',
  '008-content',
  '009-content',
  '010-content',
  '011-content',
  '012-content',
  '013-content',
  '014-content',
  '015-content',
  '001-contentwithimage',
  '001-title',
  '001-image',
  '001-podcast',
];

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

      {/* Template Preview Compositions - All 5 Templates */}
      {Object.keys(sampleScenes).map((templateId) => {
        const comp = createTemplateComposition(templateId, templateDurations[templateId] || 240);
        return (
          <Composition
            key={templateId}
            id={templateId}
            component={comp.component}
            durationInFrames={comp.durationInFrames}
            fps={comp.fps}
            width={comp.width}
            height={comp.height}
          />
        );
      })}

      {/* Portrait (1080x1920) and square (1080x1080) previews of the 5
          reference templates reflowed for aspect ratio. */}
      {ORIENTATION_PREVIEW_TEMPLATE_IDS.flatMap((templateId) => {
        const portrait = createTemplateComposition(templateId, templateDurations[templateId] || 240, 1080, 1920);
        const square = createTemplateComposition(templateId, templateDurations[templateId] || 240, 1080, 1080);
        return [
          <Composition
            key={`${templateId}-portrait`}
            id={`${templateId}-portrait`}
            component={portrait.component}
            durationInFrames={portrait.durationInFrames}
            fps={portrait.fps}
            width={portrait.width}
            height={portrait.height}
          />,
          <Composition
            key={`${templateId}-square`}
            id={`${templateId}-square`}
            component={square.component}
            durationInFrames={square.durationInFrames}
            fps={square.fps}
            width={square.width}
            height={square.height}
          />,
        ];
      })}

      {/* Generative Scene Engine preview - covers short title, long
          paragraph, 6-item list, and list+image content shapes (see the
          generative-engine plan's verification section). jobId is set to
          each sceneId (rather than one shared "preview" id) so every
          sample composition here still gets its own distinct generated
          style, standing in for "a different video" - in real usage every
          scene of the SAME video shares the SAME jobId, which is exactly
          what keeps a real video's look coherent scene-to-scene (see
          GeneratedScene.jsx's styleSeed). */}
      {Object.keys(sampleGenerativeScenes).map((sceneId) => (
        <Composition
          key={sceneId}
          id={sceneId}
          component={() => (
            <VideoComposition
              assets={{ title: sceneId, scenes: [{ ...sampleGenerativeScenes[sceneId], duration: 8 }] }}
              jobId={sceneId}
            />
          )}
          durationInFrames={240}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}

      {/* Style-coherence check: 3 generative scenes sharing ONE jobId,
          verifying every scene resolves to the same palette/font pairing
          (see GeneratedScene.jsx's styleSeed) instead of each scene
          picking its own. */}
      <Composition
        id="gen-style-coherence-check"
        component={() => (
          <VideoComposition
            assets={{
              title: 'coherence-check',
              scenes: [
                { ...sampleGenerativeScenes['gen-short-title'], sceneNumber: 1, duration: 6 },
                { ...sampleGenerativeScenes['gen-six-item-list'], sceneNumber: 2, duration: 6 },
                { ...sampleGenerativeScenes['gen-list-with-image'], sceneNumber: 3, duration: 6 },
              ],
            }}
            jobId="coherence-check-job"
          />
        )}
        durationInFrames={540}
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