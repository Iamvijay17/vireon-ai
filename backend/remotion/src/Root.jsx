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

const templateDurations = {};

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