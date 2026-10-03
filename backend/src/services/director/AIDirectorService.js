const StoryStructureService = require('./StoryStructureService');
const ScenePlanningService = require('./ScenePlanningService');
const StoryboardPlanningService = require('./StoryboardPlanningService');
const VoicePlanningService = require('./VoicePlanningService');
const MotionPlanningService = require('./MotionPlanningService');

/**
 * Orchestrates the full script-generation pipeline:
 *
 *   1. StoryStructureService   - narrative arc + shared style guide (the "brief")
 *   2. ScenePlanningService    - scene narration, anchored to that plan
 *   3. StoryboardPlanningService - per scene: composition, image (and what it
 *      shows), camera motion, transition - validated, never trusted blindly
 *   4. Voice / motion passes   - deterministic consistency fill-ins
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
    const { entries, source } = await StoryboardPlanningService.plan({
      scenes, structure, videoType, topic, language, imageBudget, jobId, checkCancelled,
    });
    const storyboarded = StoryboardPlanningService.apply(scenes, entries, { structure, imageBudget, videoType });

    const voicedScenes = storyboarded.map((scene) => ({
      ...scene,
      ...VoicePlanningService.resolve(scene, { hostVoice, guestVoice, videoType }),
    }));
    const finalScenes = StoryboardPlanningService.finalize(
      MotionPlanningService.apply(voicedScenes, structure.styleGuide)
    );

    return {
      title: titleOverride || structure.title,
      description: structure.description,
      tags: structure.tags,
      thumbnailPrompt: structure.thumbnailPrompt,
      brief: StoryboardPlanningService.buildBrief({ structure, imageBudget, source, videoType, extraInstructions }),
      scenes: finalScenes,
    };
  }
}

module.exports = AIDirectorService;
