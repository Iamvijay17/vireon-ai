const LoggerService = require('../common/LoggerService');
const { PURPOSES, STRATEGIES, LAYOUT_STRATEGY, CAMERA_MOTIONS, TRANSITIONS, LAYOUTS } = require('./vocabulary');
const { profileOf, semanticCues, estimateSeconds } = require('./layoutCompat');
const {
  planLayouts, planCameraMotions, planTransitions, mergeItems, densityOf, diversityReport, LAYOUT_ITEM_CAP,
} = require('./DiversityPlanner');
const { planAssets, AUDIENCE_BY_TYPE } = require('./AssetPlanner');
const { DirectorPlanSchema, formatIssues } = require('./schemas');
const StoryStructureService = require('./StoryStructureService');

/**
 * The deterministic half of the AI Director.
 *
 * The LLM proposes - it reads the script and suggests a purpose, a visual
 * strategy, a layout, a picture, a camera move and a transition for each scene
 * (StoryboardPlanningService, validated against schemas.js). This module decides:
 * it takes those proposals together with the whole video and settles every scene's
 * layout, camera, transition and picture prompt so that neighbours differ, text
 * stays readable and every choice is one the renderer actually has.
 *
 *   proposals ─▶ purpose + strategy ─▶ layouts (variety) ─▶ density guard
 *             ─▶ camera ─▶ transitions ─▶ image prompts ─▶ DirectorPlan
 *
 * Pure and deterministic - no LLM, no clock, no randomness - so it is testable
 * without a model and a re-plan never reshuffles an approved video. It also means
 * a video the LLM could not storyboard at all still gets a varied, readable plan.
 */

const MIN_SCENE_SECONDS = 2.5;

// Keywords in a beat's stated purpose, to recover a scene's purpose when the model gave none.
const BEAT_PURPOSE_HINTS = [
  [/call to action|cta|subscribe|enrol|sign up/i, 'cta'],
  [/hook|attention|surpris|grab/i, 'hook'],
  [/intro|welcome|overview|set(ting)? the scene/i, 'introduction'],
  [/example|case study|demo|anecdote|story of/i, 'example'],
  [/compar|versus|differen|contrast/i, 'comparison'],
  [/data|statistic|number|evidence|figure/i, 'data'],
  [/summar|recap|takeaway|key points/i, 'summary'],
  [/conclu|resolv|wrap|land the/i, 'conclusion'],
];

function inferPurpose({ index, total, beatPurpose, videoType, proposed }) {
  if (proposed && PURPOSES.includes(proposed)) return proposed;
  if (index === 0) return 'hook';
  if (index === total - 1) return ['marketing', 'motivational', 'youtube_shorts'].includes(videoType) ? 'cta' : 'conclusion';
  const hint = BEAT_PURPOSE_HINTS.find(([re]) => re.test(beatPurpose || ''));
  return hint ? hint[1] : 'explanation';
}

function defaultStrategy(profile, cues) {
  if (profile.sceneType === 'title') return 'title';
  if (profile.sceneType === 'image') return 'full-screen-visual';
  if (profile.hasImage) return 'split-visual';
  if (cues.stat) return 'statistics';
  if (profile.itemCount >= 2) return 'list';
  return 'text';
}

const oneOf = (value, allowed) => (allowed.includes(value) ? value : '');

/**
 * @param {object}   p
 * @param {object[]} p.scenes       scenes after the storyboard fold (StoryboardPlanningService.apply)
 *                                  and the motion pass - each carries `storyboard`
 * @param {object}   p.structure    { title, beats, styleGuide }
 * @param {string}   p.videoType
 * @param {string}   p.source       'director' | 'partial' | 'default' - how much the LLM answered
 * @param {number}   [p.repairs]
 * @param {number[]} [p.rejectedScenes]
 * @returns {{ scenes: object[], plan: object|null }}
 */
function refine({ scenes, structure, videoType, source = 'default', repairs = 0, rejectedScenes = [] }) {
  const total = scenes.length;
  const isPodcast = videoType === 'podcast';
  const styleGuide = structure?.styleGuide || {};
  const beats = structure?.beats || [];
  const motionPool = String(styleGuide.motionVocabulary || '').split(',').map((m) => m.trim()).filter(Boolean);

  const entries = scenes.map((scene, index) => {
    const sb = scene.storyboard || {};
    const hasImage = sb.visual?.kind === 'image';
    const profile = profileOf(scene, { hasImage });
    const cues = semanticCues(scene, profile);
    const beat = StoryStructureService.beatForScene(beats, scene.sceneNumber);
    const directorLayout = oneOf(sb.layout, LAYOUTS);
    return {
      sceneNumber: scene.sceneNumber,
      scene,
      isPodcast,
      hasImage,
      profile,
      cues,
      beat: beat?.beatIndex ?? null,
      beatPurpose: beat?.purpose || '',
      purpose: inferPurpose({ index, total, beatPurpose: beat?.purpose, videoType, proposed: sb.purpose }),
      strategy: oneOf(sb.strategy, STRATEGIES)
        || (directorLayout ? LAYOUT_STRATEGY[directorLayout] : '')
        || defaultStrategy(profile, cues),
      directorLayout,
      directorCamera: oneOf(sb.cameraMotion, CAMERA_MOTIONS) || null,
      directorTransition: oneOf(sb.transition, TRANSITIONS) || null,
      density: densityOf(profile),
      motionPool,
    };
  });

  const layouts = planLayouts(entries);
  const cameras = planCameraMotions(entries, layouts);
  const transitions = planTransitions(entries.map((e, i) => ({ ...e, layout: layouts[i] })));
  const assets = planAssets(
    entries.map((e, i) => ({
      sceneNumber: e.sceneNumber,
      hasImage: e.hasImage,
      scene: e.scene,
      purpose: e.purpose,
      strategy: LAYOUT_STRATEGY[layouts[i]] || e.strategy,
      previous: scenes[i - 1]?.title || '',
      next: scenes[i + 1]?.title || '',
    })),
    { styleGuide, videoType }
  );

  const warnings = [];
  const planScenes = [];

  const refined = scenes.map((scene, i) => {
    const e = entries[i];
    const layout = layouts[i];
    const sceneWarnings = [];

    // Density guard: more bullets than the layout can show without tiny text are
    // merged (narration untouched - only what is written on screen).
    let sceneMeta = scene.scene_meta;
    const cap = LAYOUT_ITEM_CAP[layout];
    const shownItems = cap === undefined ? e.profile.itemCount : Math.min(e.profile.itemCount, cap);
    if (cap !== undefined && e.profile.itemCount > cap && Array.isArray(scene.scene_meta?.content)) {
      sceneMeta = { ...scene.scene_meta, content: mergeItems(scene.scene_meta.content, cap) };
      sceneWarnings.push(`${e.profile.itemCount} on-screen points merged into ${cap} for readability`);
    }
    if (!layout && !isPodcast) sceneWarnings.push('no layout fits this content - the engine decides');

    const asset = assets[i];
    // An image-bearing scene must keep a prompt (ScriptParserService requires one), so the original stands if planning found none.
    const imagePrompt = e.hasImage && asset.needsImage ? asset.imagePrompt : scene.imagePrompt;
    const strategy = LAYOUT_STRATEGY[layout] || e.strategy;
    const estimatedDuration = Math.round(Math.max(MIN_SCENE_SECONDS, estimateSeconds(scene.audio?.text) * 1.05 + 0.4) * 10) / 10;

    planScenes.push({
      scene: {
        sceneNumber: scene.sceneNumber,
        beat: e.beat,
        purpose: e.purpose,
        intent: e.beatPurpose,
        strategy,
        estimatedDuration,
      },
      visual: {
        sceneNumber: scene.sceneNumber,
        layout,
        density: densityOf({ ...e.profile, itemCount: shownItems }),
        contentItems: shownItems,
        visual: { kind: e.hasImage && asset.needsImage ? 'image' : 'none', prompt: e.hasImage && asset.needsImage ? imagePrompt : '' },
      },
      motion: {
        sceneNumber: scene.sceneNumber,
        cameraMotion: cameras[i],
        transition: transitions[i],
        composition: {},
      },
      asset,
      source: scene.storyboard?.source === 'director' ? 'director' : 'default',
      warnings: sceneWarnings,
    });
    warnings.push(...sceneWarnings.map((w) => `scene ${scene.sceneNumber}: ${w}`));

    return {
      ...scene,
      scene_meta: sceneMeta,
      imagePrompt,
      cameraMotion: cameras[i],
      transition: transitions[i],
      storyboard: {
        ...scene.storyboard,
        purpose: e.purpose,
        strategy,
        layout,
        density: densityOf({ ...e.profile, itemCount: shownItems }),
        estimatedDuration,
        cameraMotion: cameras[i],
        transition: transitions[i],
        visual: scene.storyboard?.visual
          ? { ...scene.storyboard.visual, prompt: e.hasImage ? imagePrompt : scene.storyboard.visual.prompt }
          : scene.storyboard?.visual,
      },
    };
  });

  const diversity = diversityReport(layouts);
  const plan = {
    version: 1,
    source,
    story: {
      title: structure?.title || '',
      audience: AUDIENCE_BY_TYPE[videoType] || 'general viewers',
      beats,
      styleGuide: {
        visualPalette: styleGuide.visualPalette || '',
        motionVocabulary: styleGuide.motionVocabulary || '',
        voiceTone: styleGuide.voiceTone || '',
      },
    },
    scenes: planScenes,
    diversity: { ...diversity, warnings },
    validation: { repairs, rejectedScenes },
  };

  const parsed = DirectorPlanSchema.safeParse(plan);
  if (!parsed.success) {
    // Cannot happen with the deterministic planners above; if it ever does, the
    // scenes are still valid on their own (every choice came from the vocabulary)
    // so the video proceeds - only the stored explanation of it is lost.
    LoggerService.error('Director plan failed its own schema - storing none', { issues: formatIssues(parsed.error).slice(0, 8) });
    return { scenes: refined, plan: null };
  }
  return { scenes: refined, plan: parsed.data };
}

module.exports = { refine, inferPurpose, defaultStrategy };
