import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { analyzeContent } from '../../engine/analyzeContent';
import { solveLayout } from '../../engine/solveLayout';
import { generateStyle } from '../../engine/generateStyle';
import { choreograph } from '../../engine/choreograph';
import { computeMotionStyle } from '../../engine/motion';
import { SlotText, SlotImage } from '../../engine/primitives';
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
const GeneratedScene = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  const scale = width / 1920;

  // Deterministic seed: the scene's stable sceneId (see sceneSchema.js -
  // independent of sceneNumber, which shifts on reorder) so the same scene
  // always resolves to the same generated layout/style/motion across
  // preview and final render. Falls back to templateId+title for sample
  // data that has no sceneId (e.g. Remotion Studio previews).
  const seed = scene?.sceneId || `${scene?.templateId || 'generative'}-${elements.title || ''}`;

  const profile = useMemo(() => analyzeContent(scene), [scene]);
  const layoutPlan = useMemo(() => solveLayout(profile, seed), [profile, seed]);
  const stylePlan = useMemo(() => generateStyle(seed), [seed]);
  const motionPlan = useMemo(() => choreograph(layoutPlan, seed), [layoutPlan, seed]);

  const bgColor = elements.backgroundColor || stylePlan.palette.bg;
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <AbsoluteFill style={{ background: stylePlan.palette.bgGradient }} />

      <div
        style={{
          position: 'relative', width: '100%', height: '100%',
          transform: `scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {layoutPlan.slots.map((slot) => {
          const motionStyle = computeMotionStyle(frame, motionPlan[slot.id]);

          if (slot.role === 'image') {
            return (
              <SlotImage key={slot.id} slot={slot} src={elements.image} motionStyle={motionStyle} stylePlan={stylePlan} />
            );
          }

          const overrideKey = slot.role === 'title' ? 'title' : slot.role === 'body' ? 'body' : null;
          const overrideStyle = overrideKey && overrides[overrideKey] ? mergeStyle({}, overrides[overrideKey]) : null;

          return (
            <SlotText key={slot.id} slot={slot} stylePlan={stylePlan} motionStyle={motionStyle} overrideStyle={overrideStyle} />
          );
        })}
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
