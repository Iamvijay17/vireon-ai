const PromptService = require('../common/PromptService');
const LMStudioService = require('../common/LMStudioService');
const LoggerService = require('../common/LoggerService');

/**
 * Plans a video's narrative arc and shared style guide BEFORE any scene
 * narration is written - one small, cheap LLM call that gives
 * ScenePlanningService's chunks a shared plan to stay consistent with,
 * instead of each chunk only seeing a recap of whatever the previous chunk
 * happened to write.
 */
class StoryStructureService {
  static async plan({ videoType, topic, language, sceneCount, durationMinutes, jobId }) {
    const prompt = PromptService.render('story-structure', {
      videoType,
      topic,
      language,
      sceneCount,
      durationMinutes,
    });

    const parsed = await LMStudioService.generateScript(prompt, { maxTokens: 3000 });

    const beats = Array.isArray(parsed?.beats) && parsed.beats.length > 0
      ? parsed.beats
      : [{ beatIndex: 1, purpose: `Cover ${topic} start to finish`, sceneRange: [1, sceneCount], toneNote: '' }];

    const styleGuide = {
      visualPalette: parsed?.styleGuide?.visualPalette || '',
      motionVocabulary: parsed?.styleGuide?.motionVocabulary || '',
      voiceTone: parsed?.styleGuide?.voiceTone || '',
    };

    LoggerService.info('Story structure planned', {
      jobId, videoType, beats: beats.length, title: parsed?.title,
    });

    return {
      title: parsed?.title || topic,
      description: parsed?.description || '',
      tags: Array.isArray(parsed?.tags) ? parsed.tags : [],
      thumbnailPrompt: parsed?.thumbnailPrompt || '',
      beats,
      styleGuide,
    };
  }

  /**
   * Find the beat whose sceneRange covers a given scene number, falling
   * back to the last beat if the model's ranges didn't cleanly cover it.
   */
  static beatForScene(beats, sceneNumber) {
    return beats.find(
      (b) => Array.isArray(b.sceneRange) && sceneNumber >= b.sceneRange[0] && sceneNumber <= b.sceneRange[1]
    ) || beats[beats.length - 1];
  }
}

module.exports = StoryStructureService;
