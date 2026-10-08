import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { analyzeContent } from '../../engine/analyzeContent';
import { solveLayout } from '../../engine/solveLayout';
import { resolveCanvas } from '../../engine/scenes/shared';
import { generateStyle } from '../../engine/generateStyle';
import { choreograph } from '../../engine/choreograph';
import { computeMotionStyle } from '../../engine/motion';
import { renderBackground } from '../../engine/backgrounds';
import { renderDecoration } from '../../engine/decorations';
import { resolveVisualStyle } from '../../engine/visualStyle';
import { chooseBackground, chooseDecoration } from '../../engine/chooseVisuals';
import { SlotText, SlotImage, Waveform, LayoutDiagnostics } from '../../engine/primitives';
import { resolveComposition, applyTextMotion, imageMotionDamping } from '../../engine/composition';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { getCaptionStyle } from '../../captions/captionStyles';
import { mergeStyle } from '../../theme';
import { useSpeechTimeline } from '../../speech/SpeechContext';
import { applySpeechTimingToPlan } from '../../speech/speechTiming';

/**
 * GeneratedScene - the renderer layer of the generative scene engine.
 *
 * Unlike every other template (one hand-coded layout per file), this is
 * the single component for the `templateId: "generative"` entry in
 * TemplateRegistry.js. It computes its own layout/style/motion on every
 * render by running the scene's `elements` through the engine pipeline:
 * analyzeContent -> solveLayout -> generateStyle -> choreograph. All four
 * are pure functions of (content, seed), so recomputing them per render
 * (instead of persisting a precomputed result) is safe and always
 * produces identical output for the same scene.
 *
 * Data format: identical to every other template - { title, items, body,
 * image, backgroundColor, styleConfig } under scene.elements. No new
 * fields required, so any existing scene can point templateId at
 * "generative" and render through the engine unchanged.
 */
const GeneratedScene = React.memo(({ scene, jobId }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const { timeline: speechTimeline, timing: speechTiming } = useSpeechTimeline();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  // The layout is solved on a reference canvas with the render's own aspect ratio
  // (1920x1080 landscape, 1080 wide for portrait/square), then scaled to the real
  // render size - so a 9:16 or 1:1 video gets a layout built for that shape.
  const canvas = useMemo(() => resolveCanvas(width, height), [width, height]);
  const scale = width / canvas.width;

  // Deterministic seed: the scene's stable sceneId (see sceneSchema.js -
  // independent of sceneNumber, which shifts on reorder) so the same scene
  // always resolves to the same generated layout/motion across preview and
  // final render. Falls back to templateId+title for sample data that has
  // no sceneId (e.g. Remotion Studio previews).
  const seed = scene?.sceneId || `${scene?.templateId || 'generative'}-${elements.title || ''}`;

  // Style uses a separate, job-level seed (falling back to the per-scene
  // seed when no jobId is available, e.g. a standalone scene render) so
  // every scene in the same video resolves to the same palette/font
  // pairing - layout and motion still vary per scene via `seed` above,
  // only the look stays consistent across the whole job.
  const styleSeed = jobId || seed;

  const profile = useMemo(() => analyzeContent(scene), [scene]);
  const layoutPlan = useMemo(() => solveLayout(profile, seed, { canvas }), [profile, seed, canvas]);
  const stylePlan = useMemo(() => generateStyle(styleSeed), [styleSeed]);
  // Composition overrides (composable scene system, see engine/composition.js):
  // background / decoration / text motion / image motion the Director chose.
  // Unset slots keep the deterministic picks below, so a scene without a
  // composition renders exactly as before.
  const composition = useMemo(() => resolveComposition(scene), [scene]);
  const choreographedPlan = useMemo(() => choreograph(layoutPlan, seed), [layoutPlan, seed]);
  const baseMotionPlan = useMemo(
    () => applyTextMotion(choreographedPlan, layoutPlan.slots, composition.textMotion),
    [choreographedPlan, layoutPlan, composition.textMotion],
  );
  // Speech-driven scenes ({ timingMode: 'speech', trigger, ... }) enter their
  // targeted slots on the narration cue, through the same Motion Design System
  // animations. Any other timing mode - or a cue not found in the speech - returns
  // the choreographed plan untouched.
  const motionPlan = useMemo(
    () => applySpeechTimingToPlan(baseMotionPlan, layoutPlan.slots, speechTiming, speechTimeline, fps),
    [baseMotionPlan, layoutPlan, speechTiming, speechTimeline, fps],
  );

  // Visual style (Phase 5): a small curated mood enum, not part of
  // generateStyle.js's continuous palette/font system - see visualStyle.js's
  // doc comment. Never LLM-generated: either an explicit override or a
  // deterministic per-job pick, so a whole video keeps one consistent mood.
  const visualStyleOverride = overrides.visualStyle || scene?.theme?.visualStyle;
  const visualStyle = useMemo(
    () => resolveVisualStyle(visualStyleOverride, styleSeed),
    [visualStyleOverride, styleSeed],
  );
  // Background/Decoration selection (Phase 6) - pure functions of the
  // layout strategy, visual style and per-scene seed, so the same scene
  // always resolves to the same environment/accents.
  const backgroundPick = useMemo(
    () => chooseBackground({ layoutPlan, style: visualStyle, seed }),
    [layoutPlan, visualStyle, seed],
  );
  const decorationPick = useMemo(
    () => chooseDecoration({ layoutPlan, style: visualStyle, seed }),
    [layoutPlan, visualStyle, seed],
  );

  // generateStyle stays a pure function (see its doc comment), so the actual
  // Google Font registration - a side effect - happens here instead, once
  // per resolved styleSeed.
  stylePlan.fonts.load();

  // A Director-chosen background / decoration replaces the id but keeps the
  // intensity the engine computed from how much of the canvas the content fills.
  const backgroundId = composition.background || backgroundPick.id;
  const decorationId = composition.decoration || decorationPick.id;
  const sceneProgress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const imageDamping = imageMotionDamping(scene?.cameraMotion);

  const bgColor = elements.backgroundColor || stylePlan.palette.bg;
  // Spoken word-timed captions only exist for "content"/"podcast" shapes
  // (see analyzeContent's per-sceneType branches) - "image" scenes' own
  // `elements.caption` is an on-screen headline instead, already folded
  // into layoutPlan's title/label slots, not the bottom CaptionRenderer.
  const caption = profile.spokenCaption;
  const captionTimestamps = profile.captionTimestamps;
  // Only resolved when a scene actually opts into one of the 4 named
  // Caption Styles (`elements.styleConfig.captionStyle` or
  // `scene.theme.captionStyle`) - otherwise this stays null and the
  // CaptionRenderer props below fall back to their pre-existing inline
  // defaults unchanged, so a scene with no caption config keeps looking
  // exactly as it did before caption styles existed.
  const captionStyleId = overrides.captionStyle || scene?.theme?.captionStyle;
  const captionStylePreset = captionStyleId ? getCaptionStyle(captionStyleId) : null;

  const renderSlot = (slot) => {
    const motionStyle = computeMotionStyle(frame, motionPlan[slot.id]);

    if (slot.role === 'image') {
      return (
        <SlotImage
          key={slot.id}
          slot={slot}
          src={profile.imageSrc}
          motionStyle={motionStyle}
          stylePlan={stylePlan}
          imageMotion={composition.imageMotion}
          progress={sceneProgress}
          damping={imageDamping}
        />
      );
    }

    const overrideKey = slot.role === 'title' ? 'title' : slot.role === 'body' ? 'body' : null;
    const overrideStyle = overrideKey && overrides[overrideKey] ? mergeStyle({}, overrides[overrideKey]) : null;

    return (
      <SlotText key={slot.id} slot={slot} stylePlan={stylePlan} motionStyle={motionStyle} overrideStyle={overrideStyle} />
    );
  };

  // Image slots render first (bottom of the stack), then an optional scrim
  // for legibility over arbitrary imagery (see solveLayout's
  // SCRIM_STRATEGIES), then every other slot on top - plain DOM order since
  // none of these carry an explicit z-index.
  const imageSlots = layoutPlan.slots.filter((slot) => slot.role === 'image');
  const otherSlots = layoutPlan.slots.filter((slot) => slot.role !== 'image');

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <AbsoluteFill style={{ background: stylePlan.palette.bgGradient }} />
      {renderBackground(backgroundId, {
        frame, palette: stylePlan.palette, intensity: backgroundPick.intensity, seed,
      })}
      {renderDecoration(decorationId, {
        frame, palette: stylePlan.palette, intensity: decorationPick.intensity, seed,
      })}

      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: canvas.width, height: canvas.height,
          transform: `scale(${scale})`, transformOrigin: 'top left',
        }}
      >
        {imageSlots.map(renderSlot)}
        {layoutPlan.scrim && (
          <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 45%, transparent 70%)' }} />
        )}
        {otherSlots.map(renderSlot)}
        <Waveform waveform={layoutPlan.waveform} stylePlan={stylePlan} />
        {(scene?.debug?.layout || overrides.layoutDebug) && <LayoutDiagnostics diagnostics={layoutPlan.diagnostics} />}
      </div>

      <CaptionRenderer
        text={caption}
        animation={scene?.theme?.captionAnimation || captionStylePreset?.animation || 'fadeInUp'}
        animationConfig={{ slideDistance: 15, ...captionStylePreset?.animationConfig }}
        styleConfig={{
          position: 'bottom',
          fontFamily: stylePlan.fonts.title,
          fontWeight: 500,
          fontSize: 36,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backgroundPadding: '10px 20px',
          borderRadius: 8,
          framesPerWord: 3,
          maxWidth: '75%',
          ...captionStylePreset?.styleConfig,
          ...overrides.captions,
        }}
        timestamps={captionTimestamps}
        fps={30}
      />

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

GeneratedScene.displayName = 'GeneratedScene';
export default GeneratedScene;
