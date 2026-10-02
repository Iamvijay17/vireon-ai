const StoryStructureService = require('./StoryStructureService');
const ScenePlanningService = require('./ScenePlanningService');
const VisualPlanningService = require('./VisualPlanningService');
const VoicePlanningService = require('./VoicePlanningService');
const MotionPlanningService = require('./MotionPlanningService');

/**
 * Orchestrates the full script-generation pipeline: plan the narrative arc
 * and style guide first (StoryStructureService), then write scene narration
 * anchored to that plan (ScenePlanningService), then layer in visual/voice/
 * motion consistency passes. Returns the same
 * `{title, description, tags, thumbnailPrompt, scenes}` shape the old
 * single-call ChunkedScriptService.generate() produced, so
 * ScriptParserService.validate and everything downstream is unchanged.
 */
class AIDirectorService {
  static async direct({ videoType, topic, language, sceneCount, wordCount, wordsPerScene, hostName, guestName, hostVoice, guestVoice, durationMinutes, jobId, checkCancelled, onProgress }) {
    const structure = await StoryStructureService.plan({
      videoType, topic, language, sceneCount, durationMinutes, jobId,
    });

    if (checkCancelled) await checkCancelled();

    const { scenes } = await ScenePlanningService.generate({
      videoType, topic, language, sceneCount, wordCount, wordsPerScene,
      hostName, guestName, jobId, structure, checkCancelled, onProgress,
    });

    const visualScenes = VisualPlanningService.apply(scenes, structure.styleGuide);
    const voicedScenes = visualScenes.map((scene) => ({
      ...scene,
      ...VoicePlanningService.resolve(scene, { hostVoice, guestVoice, videoType }),
    }));
    const finalScenes = MotionPlanningService.apply(voicedScenes, structure.styleGuide);

    return {
      title: structure.title,
      description: structure.description,
      tags: structure.tags,
      thumbnailPrompt: structure.thumbnailPrompt,
      scenes: finalScenes,
    };
  }
}

module.exports = AIDirectorService;
