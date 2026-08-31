import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { analyzeContent } from '../../engine/analyzeContent';
import { solveLayout } from '../../engine/solveLayout';
import { generateStyle } from '../../engine/generateStyle';
import { choreograph } from '../../engine/choreograph';
import { computeMotionStyle } from '../../engine/motion';
import { SlotText, SlotImage, Waveform } from '../../engine/primitives';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { mergeStyle, typography } from '../../theme';

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
  const { width } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  const scale = width / 1920;

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
  const layoutPlan = useMemo(() => solveLayout(profile, seed), [profile, seed]);
  const stylePlan = useMemo(() => generateStyle(styleSeed), [styleSeed]);
  const motionPlan = useMemo(() => choreograph(layoutPlan, seed), [layoutPlan, seed]);

  const bgColor = elements.backgroundColor || stylePlan.palette.bg;
  // Spoken word-timed captions only exist for "content"/"podcast" shapes
  // (see analyzeContent's per-sceneType branches) - "image" scenes' own
  // `elements.caption` is an on-screen headline instead, already folded
  // into layoutPlan's title/label slots, not the bottom CaptionRenderer.
  const caption = profile.spokenCaption;
  const captionTimestamps = profile.captionTimestamps;

  const renderSlot = (slot) => {
    const motionStyle = computeMotionStyle(frame, motionPlan[slot.id]);

    if (slot.role === 'image') {
      return (
        <SlotImage key={slot.id} slot={slot} src={profile.imageSrc} motionStyle={motionStyle} stylePlan={stylePlan} />
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

      <div
        style={{
          position: 'relative', width: '100%', height: '100%',
          transform: `scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {imageSlots.map(renderSlot)}
        {layoutPlan.scrim && (
          <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 45%, transparent 70%)' }} />
        )}
        {otherSlots.map(renderSlot)}
        <Waveform waveform={layoutPlan.waveform} stylePlan={stylePlan} />
      </div>

      <CaptionRenderer
        text={caption}
        animation="fadeInUp"
        animationConfig={{ slideDistance: 15 }}
        styleConfig={{
          position: 'bottom',
          fontFamily: typography.title.fontFamily,
          fontWeight: 500,
          fontSize: 36,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backgroundPadding: '10px 20px',
          borderRadius: 8,
          framesPerWord: 3,
          maxWidth: '75%',
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
