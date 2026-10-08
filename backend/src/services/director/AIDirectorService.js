const StoryStructureService = require('./StoryStructureService');
const ScenePlanningService = require('./ScenePlanningService');
const StoryboardPlanningService = require('./StoryboardPlanningService');
const VoicePlanningService = require('./VoicePlanningService');
const MotionPlanningService = require('./MotionPlanningService');
const DirectorPlanner = require('./DirectorPlanner');
const { scriptKey } = require('../cache/cacheKeys');
const config = require('../../config');

// Bumped when the Director's planning rules change in a way that changes output.
const DIRECTOR_VERSION = 2;

/**
 * Orchestrates the full script-generation pipeline:
 *
 *   1. StoryStructureService   - narrative arc + shared style guide (the "brief")
 *   2. ScenePlanningService    - scene narration, anchored to that plan
 *   3. StoryboardPlanningService - per scene: purpose, visual strategy,
 *      composition, image (and what it shows), camera motion, transition -
 *      validated against Zod schemas (and repaired once), never trusted blindly
 *   4. Voice / motion passes   - deterministic consistency fill-ins
 *   5. DirectorPlanner         - settles layout / camera / transition / image
 *      prompts across the WHOLE video so neighbours differ and text stays
 *      readable; produces the DirectorPlan stored on the brief
 *
 * Returns the `{title, description, tags, thumbnailPrompt, scenes}` shape the
 * old single-call generator produced, plus the `brief`, with each scene now
 * carrying its `storyboard` - so ScriptParserService.validate and everything
 * downstream keeps working, and the pipeline can see *why* a scene looks the
 * way it does.
 *
 * `extraInstructions` carries per-video requirements the shared prompt
 * templates don't know (e.g. "this is one lesson of a larger course").
 * `titleOverride` pins the title when the caller already has one (a course
 * lesson keeps its curriculum title).
 */
class AIDirectorService {
  static async direct({
    videoType, topic, language, sceneCount, wordCount, wordsPerScene, hostName, guestName,
    hostVoice, guestVoice, durationMinutes, extraInstructions, titleOverride,
    jobId, checkCancelled, onProgress,
  }) {
    const structure = await StoryStructureService.plan({
      videoType, topic, language, sceneCount, durationMinutes, extraInstructions, jobId,
    });

    if (checkCancelled) await checkCancelled();

    const { scenes } = await ScenePlanningService.generate({
      videoType, topic, language, sceneCount, wordCount, wordsPerScene,
      hostName, guestName, jobId, structure, extraInstructions, checkCancelled, onProgress,
    });

    if (checkCancelled) await checkCancelled();

    const imageBudget = StoryboardPlanningService.imageBudget({ sceneCount: scenes.length, videoType });
    const { entries, source, repairs: storyboardRepairs = 0, rejected: rejectedScenes = [] } = await StoryboardPlanningService.plan({
      scenes, structure, videoType, topic, language, imageBudget, jobId, checkCancelled,
    });
    const storyboarded = StoryboardPlanningService.apply(scenes, entries, { structure, imageBudget, videoType });

    const voicedScenes = storyboarded.map((scene) => ({
      ...scene,
      ...VoicePlanningService.resolve(scene, { hostVoice, guestVoice, videoType }),
    }));
    const motioned = MotionPlanningService.apply(voicedScenes, structure.styleGuide);

    // Deterministic, so it also gives a video the LLM could not storyboard a varied,
    // readable plan rather than the engine's unplanned defaults.
    const { scenes: planned, plan: directorPlan } = DirectorPlanner.refine({
      scenes: motioned,
      structure,
      videoType,
      source,
      repairs: storyboardRepairs + (structure.repairs || 0),
      rejectedScenes,
    });
    const finalScenes = StoryboardPlanningService.finalize(planned);

    return {
      title: titleOverride || structure.title,
      description: structure.description,
      tags: structure.tags,
      thumbnailPrompt: structure.thumbnailPrompt,
      brief: {
        ...StoryboardPlanningService.buildBrief({ structure, imageBudget, source, videoType, extraInstructions }),
        // Recorded so a scene's provenance can say which model and which planning rules made it.
        llmModel: config.ollama.model,
        directorVersion: DIRECTOR_VERSION,
        // What this script was made from (never used to serve a cached script - sampling is
        // creative on purpose - only to recognise two videos made from the same inputs).
        inputKey: scriptKey({ topic, videoType, language, durationMinutes, llmModel: config.ollama.model, directorVersion: DIRECTOR_VERSION }),
        directorPlan,
      },
      scenes: finalScenes,
    };
  }
}

module.exports = AIDirectorService;
