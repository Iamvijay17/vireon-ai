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
  '002-contentwithimage',
  '003-contentwithimage',
  '004-contentwithimage',
  '005-contentwithimage',
  '006-contentwithimage',
  '007-contentwithimage',
  '008-contentwithimage',
  '009-contentwithimage',
  '001-title',
  '002-title',
  '003-title',
  '004-title',
  '005-title',
  '006-title',
  '007-title',
  '008-title',
  '009-title',
  '010-title',
  '001-image',
  '002-image',
  '003-image',
  '004-image',
  '005-image',
  '006-image',
  '007-image',
  '008-image',
  '009-image',
  '010-image',
  '001-podcast',
  '002-podcast',
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

      {/* Transition variety check: one boundary per named transition, so
          each of fade/slide/wipe/zoom/dissolve/cut can be eyeballed without
          rendering a full job (see the Phase 4 "real transition variety"
          work in VideoComposition's SceneTransition). */}
      <Composition
        id="transition-variety-check"
        component={() => (
          <VideoComposition
            assets={{
              title: "transition-variety-check",
              scenes: [
                { sceneNumber: 1, templateId: "001-title", elements: { title: "Fade" }, duration: 3, transition: "fade", backgroundColor: "#1a1a2e" },
                { sceneNumber: 2, templateId: "001-title", elements: { title: "Slide" }, duration: 3, transition: "slide", backgroundColor: "#2e1a1a" },
                { sceneNumber: 3, templateId: "001-title", elements: { title: "Wipe" }, duration: 3, transition: "wipe", backgroundColor: "#1a2e1a" },
                { sceneNumber: 4, templateId: "001-title", elements: { title: "Zoom" }, duration: 3, transition: "zoom", backgroundColor: "#2e2a1a" },
                { sceneNumber: 5, templateId: "001-title", elements: { title: "Dissolve" }, duration: 3, transition: "dissolve", backgroundColor: "#1a1a2e" },
                { sceneNumber: 6, templateId: "001-title", elements: { title: "Cut" }, duration: 3, transition: "none", backgroundColor: "#2e1a2e" },
              ],
            }}
            jobId="transition-variety-check"
          />
        )}
        durationInFrames={540}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* New-transition check: the 2 transitions added alongside the ported
          6 (see transitions/index.js) - kept separate from
          transition-variety-check above so that existing regression fixture
          stays untouched. */}
      <Composition
        id="new-transitions-check"
        component={() => (
          <VideoComposition
            assets={{
              title: "new-transitions-check",
              scenes: [
                { sceneNumber: 1, templateId: "001-title", elements: { title: "Slide Up" }, duration: 3, transition: "slideUp", backgroundColor: "#1a1a2e" },
                { sceneNumber: 2, templateId: "001-title", elements: { title: "Iris Wipe" }, duration: 3, transition: "irisWipe", backgroundColor: "#2e1a1a" },
              ],
            }}
            jobId="new-transitions-check"
          />
        )}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Phase 12 demo render: 6 scenes spanning title/paragraph/split-image/
          grid/comparison/stat strategies, mixing explicit transitions with
          the deterministic engine-chosen default (no `transition` field -
          see transitions/index.js's resolveTransitionId), plus a spoken
          caption exercising a named Caption Style. One render is enough to
          eyeball scene variety, motion, transitions and captions together. */}
      <Composition
        id="demo-phase12"
        component={() => (
          <VideoComposition
            assets={{
              title: 'demo-phase12',
              scenes: [
                { ...sampleGenerativeScenes['gen-short-title'], sceneNumber: 1, duration: 4, transition: 'fade' },
                { ...sampleGenerativeScenes['gen-long-paragraph'], sceneNumber: 2, duration: 5 },
                { ...sampleGenerativeScenes['gen-list-with-image'], sceneNumber: 3, duration: 5, transition: 'wipe' },
                { ...sampleGenerativeScenes['gen-six-item-list'], sceneNumber: 4, duration: 5 },
                { ...sampleGenerativeScenes['gen-comparison-split'], sceneNumber: 5, duration: 5, transition: 'zoom' },
                {
                  ...sampleGenerativeScenes['gen-caption-style-popPunch'],
                  sceneNumber: 6,
                  duration: 5,
                },
              ],
            }}
            jobId="demo-phase12-job"
          />
        )}
        durationInFrames={870}
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