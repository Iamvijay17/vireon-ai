const PromptService = require('../common/PromptService');
const LLMService = require('../common/LLMService');
const LoggerService = require('../common/LoggerService');
const config = require('../../config');
const { StoryPlanSchema } = require('./schemas');
const { validateObjectWithRepair } = require('./llmValidation');

/**
 * Plans a video's narrative arc and shared style guide BEFORE any scene
 * narration is written - one small, cheap LLM call that gives
 * ScenePlanningService's chunks a shared plan to stay consistent with,
 * instead of each chunk only seeing a recap of whatever the previous chunk
 * happened to write.
 */
class StoryStructureService {
  static async plan({ videoType, topic, language, sceneCount, durationMinutes, extraInstructions, jobId }) {
    const prompt = PromptService.render('story-structure', {
      videoType,
      topic,
      language,
      sceneCount,
      durationMinutes,
    });

    const fullPrompt = PromptService.withExtraInstructions(prompt, extraInstructions);
    const raw = await LLMService.generateScript(fullPrompt, { maxTokens: 3000 });

    // Detect → ask once for a correction → re-validate. What cannot be fixed falls
    // back to a one-beat plan below; malformed output never reaches the scenes.
    const checked = await validateObjectWithRepair({
      raw,
      schema: StoryPlanSchema,
      maxRepairs: config.director.maxRepairs,
      label: 'Story structure',
      logContext: { jobId, videoType },
      repair: (issues, previous) => LLMService.generateScript(
        `${fullPrompt}\n\nYour previous answer had problems:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nYour previous answer was:\n${JSON.stringify(previous)}\n\nReturn ONLY the corrected, complete JSON in the same format.`,
        { maxTokens: 3000 }
      ),
    });
    const plan = checked.data;

    const beats = plan?.beats || [{ beatIndex: 1, purpose: `Cover ${topic} start to finish`, sceneRange: [1, sceneCount], toneNote: '' }];

    const result = {
      title: plan?.title || (typeof raw?.title === 'string' && raw.title.trim()) || topic,
      description: plan?.description ?? (typeof raw?.description === 'string' ? raw.description : ''),
      tags: plan?.tags ?? (Array.isArray(raw?.tags) ? raw.tags.filter((t) => typeof t === 'string') : []),
      thumbnailPrompt: plan?.thumbnailPrompt ?? (typeof raw?.thumbnailPrompt === 'string' ? raw.thumbnailPrompt : ''),
      beats,
      // The style guide is only trusted from a validated plan; a rejected one
      // yields no palette, so every scene falls back to the defaults.
      styleGuide: plan?.styleGuide || { visualPalette: '', motionVocabulary: '', voiceTone: '' },
      validated: Boolean(plan),
      repairs: checked.repairs,
    };

    LoggerService.info('Story structure planned', {
      jobId, videoType, beats: beats.length, title: result.title, validated: result.validated, repairs: checked.repairs,
    });

    return result;
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
