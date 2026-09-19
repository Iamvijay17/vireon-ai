const config = require('../../config');
const PromptService = require('../common/PromptService');
const LMStudioService = require('../common/LMStudioService');
const LoggerService = require('../common/LoggerService');
const StoryStructureService = require('./StoryStructureService');

// Target size for a single chunk's LLM response, in tokens. Deliberately
// well under the old flat 32000-token ceiling - a local model reliably
// finishes generating a response this size instead of running out of
// steam mid-JSON, which is what silently turned a 195-scene podcast
// request into a 4-scene script (JsonRepairService salvaging only the
// last fully-closed scene from a truncated response). Chunk scene count
// is derived from this budget per video type/duration instead of being a
// single fixed number, since narration length per scene (and therefore
// tokens per scene) varies a lot between e.g. podcast turns (~1 line) and
// educational scenes (narration repeated once in scene_meta, once in
// audio.text).
const TARGET_CHUNK_TOKENS = 5000;
const MIN_CHUNK_SCENES = 3;
const MAX_CHUNK_SCENES = 30;

const CLOSING_INSTRUCTIONS = {
  // Podcast closing instruction needs the resolved host display name baked
  // in, so this one is a function instead of a plain string - see the
  // `typeof === 'function'` branches below wherever CLOSING_INSTRUCTIONS is
  // read.
  podcast: (hostName) => `the last scene is ${hostName}'s closing/outro line, wrapping up the whole conversation`,
  educational: 'End with a concise summary or key takeaway',
  marketing: 'End with a strong call-to-action and urgency',
  story: 'End with a satisfying resolution or thought-provoking conclusion',
  motivational: 'End with a memorable call-to-action that motivates immediate action',
  business: 'End with a concise summary or business call-to-action',
  youtube_shorts: 'End with a strong call-to-action encouraging likes, shares, and subscriptions',
};

const CONTINUING_INSTRUCTIONS = {
  podcast: 'do NOT include a closing/outro line yet - this is only part of a longer conversation, more turns continue right after this, so end this chunk naturally mid-conversation',
  default: 'Do NOT wrap up or conclude yet - this is only part of a longer script, more content continues right after this chunk, so end it naturally mid-content, not at a resolution',
};

/**
 * Generates a video's scene narration (any type) in bounded chunks,
 * anchored to the beat/style plan StoryStructureService already produced -
 * each chunk is told which beat's purpose/tone it's writing towards and
 * what shared motion vocabulary to draw from, instead of only inferring
 * continuity from a recap of the previous chunk's scenes.
 */
class ScenePlanningService {
  /**
   * Generate the scene array for the given total scene/word budget,
   * chunking generation when it would exceed a single chunk's token
   * budget. `structure` is the output of StoryStructureService.plan().
   * Returns `{ scenes }`, ready for VisualPlanningService.
   */
  static async generate({ videoType, topic, language, sceneCount, wordCount, wordsPerScene, hostName, guestName, jobId, structure, checkCancelled, onProgress }) {
    const narrationMultiplier = videoType === 'podcast' ? 1 : 2;
    const tokensPerScene = 80 + wordsPerScene * 1.4 * narrationMultiplier;
    const chunkSceneCount = Math.min(
      MAX_CHUNK_SCENES,
      Math.max(MIN_CHUNK_SCENES, Math.round(TARGET_CHUNK_TOKENS / tokensPerScene))
    );
    // Display names fed into the prompt so the Host/Guest can address each
    // other naturally - falls back to plain "Host"/"Guest" (matching the
    // pre-name-field behavior) whenever the job didn't set one.
    const resolvedHostName = hostName || 'Host';
    const resolvedGuestName = guestName || 'Guest';

    if (sceneCount <= chunkSceneCount) {
      const parsed = await this._generateSingleShot({ videoType, topic, language, sceneCount, wordCount, wordsPerScene, narrationMultiplier, hostName: resolvedHostName, guestName: resolvedGuestName, structure });
      return { scenes: parsed.scenes };
    }

    const chunkCount = Math.ceil(sceneCount / chunkSceneCount);
    const allScenes = [];

    for (let i = 0; i < chunkCount; i++) {
      if (checkCancelled) await checkCancelled();

      const startSceneNumber = i * chunkSceneCount + 1;
      const endSceneNumber = Math.min((i + 1) * chunkSceneCount, sceneCount);
      const thisChunkSceneCount = endSceneNumber - startSceneNumber + 1;
      const thisChunkWordCount = Math.round(wordsPerScene * thisChunkSceneCount);
      const isFirst = i === 0;
      const isLast = i === chunkCount - 1;
      const closingTemplate = CLOSING_INSTRUCTIONS[videoType] || CLOSING_INSTRUCTIONS.educational;
      const closingInstruction = isLast
        ? (typeof closingTemplate === 'function' ? closingTemplate(resolvedHostName) : closingTemplate)
        : (CONTINUING_INSTRUCTIONS[videoType] || CONTINUING_INSTRUCTIONS.default);

      const beat = StoryStructureService.beatForScene(structure.beats, startSceneNumber);

      LoggerService.info(`Generating script chunk ${i + 1}/${chunkCount}`, {
        jobId, videoType, startSceneNumber, endSceneNumber, beatIndex: beat?.beatIndex,
      });

      let chunkScenes;
      if (isFirst) {
        const prompt = PromptService.render(videoType, {
          topic,
          language,
          sceneCount: thisChunkSceneCount,
          wordCount: thisChunkWordCount,
          wordsPerScene,
          closingInstruction,
          hostName: resolvedHostName,
          guestName: resolvedGuestName,
          beatPurpose: beat?.purpose || '',
          toneNote: beat?.toneNote || structure.styleGuide.voiceTone,
          motionVocabulary: structure.styleGuide.motionVocabulary,
        });
        const parsed = await this._callChunk(prompt, thisChunkSceneCount, thisChunkWordCount, narrationMultiplier);
        chunkScenes = parsed.scenes;
      } else {
        const templateName = videoType === 'podcast' ? 'podcast-continuation' : 'generic-continuation';
        const prompt = PromptService.render(templateName, {
          topic,
          language,
          sceneCount: thisChunkSceneCount,
          wordCount: thisChunkWordCount,
          wordsPerScene,
          startSceneNumber,
          closingInstruction,
          hostName: resolvedHostName,
          guestName: resolvedGuestName,
          recap: this._buildRecap(videoType, allScenes, resolvedHostName, resolvedGuestName),
          beatPurpose: beat?.purpose || '',
          toneNote: beat?.toneNote || structure.styleGuide.voiceTone,
          motionVocabulary: structure.styleGuide.motionVocabulary,
        });
        const parsed = await this._callChunk(prompt, thisChunkSceneCount, thisChunkWordCount, narrationMultiplier);
        chunkScenes = parsed.scenes;
      }

      if (!Array.isArray(chunkScenes) || chunkScenes.length === 0) {
        throw new Error(`Script chunk ${i + 1}/${chunkCount} returned no scenes`);
      }

      if (chunkScenes.length < thisChunkSceneCount * 0.5) {
        LoggerService.warn('Script chunk came back shorter than requested - keeping the partial result', {
          jobId, videoType, chunk: i + 1, requested: thisChunkSceneCount, received: chunkScenes.length,
        });
      }

      allScenes.push(...chunkScenes);

      if (onProgress) await onProgress(i + 1, chunkCount, allScenes.length);
    }

    // Renumber sequentially regardless of what each chunk produced - chunk
    // boundaries are the source of truth, not the model's own counting.
    allScenes.forEach((scene, idx) => { scene.sceneNumber = idx + 1; });

    LoggerService.success('Script assembled from chunks', {
      jobId, videoType, requestedScenes: sceneCount, generatedScenes: allScenes.length, chunks: chunkCount,
    });

    return { scenes: allScenes };
  }

  static async _generateSingleShot({ videoType, topic, language, sceneCount, wordCount, wordsPerScene, narrationMultiplier, hostName, guestName, structure }) {
    const closingTemplate = CLOSING_INSTRUCTIONS[videoType] || CLOSING_INSTRUCTIONS.educational;
    const beat = StoryStructureService.beatForScene(structure.beats, 1);
    const prompt = PromptService.render(videoType, {
      topic,
      language,
      sceneCount,
      wordCount,
      wordsPerScene,
      closingInstruction: typeof closingTemplate === 'function' ? closingTemplate(hostName || 'Host') : closingTemplate,
      hostName: hostName || 'Host',
      guestName: guestName || 'Guest',
      beatPurpose: beat?.purpose || '',
      toneNote: beat?.toneNote || structure.styleGuide.voiceTone,
      motionVocabulary: structure.styleGuide.motionVocabulary,
    });
    return this._callChunk(prompt, sceneCount, wordCount, narrationMultiplier);
  }

  /**
   * Recap of the last few generated scenes, fed back to the model as
   * continuity context for the next chunk. Podcast turns recap as
   * speaker-tagged dialogue lines; other types recap narration plus the
   * formatting (background color/transition/camera motion) so the next
   * chunk can visually match without needing the full style-guidance
   * paragraph repeated.
   */
  static _buildRecap(videoType, allScenes, hostName = 'Host', guestName = 'Guest') {
    const recent = allScenes.slice(-4);
    if (videoType === 'podcast') {
      return recent
        .map((s) => `${s.speaker === 'guest' ? guestName : hostName}: "${s.audio?.text || ''}"`)
        .join('\n');
    }
    return recent
      .map((s) => `Scene ${s.sceneNumber} (${s.sceneType || 'content'}, bg:${s.backgroundColor || ''}, transition:${s.transition || ''}, camera:${s.cameraMotion || ''}): "${s.audio?.text || ''}"`)
      .join('\n');
  }

  /**
   * Token/timeout estimate mirrors videoWorker.js's original single-shot
   * math (~80 tokens/scene of JSON structure + narration at ~1.4
   * tokens/word, doubled for non-podcast types since they repeat narration
   * in scene_meta, 25% buffer), just scoped to one chunk's smaller budget
   * instead of the whole script's.
   */
  static async _callChunk(prompt, chunkSceneCount, chunkWordCount, narrationMultiplier) {
    const estimatedTokens = Math.round((chunkSceneCount * 80 + chunkWordCount * 1.4 * narrationMultiplier) * 1.25);
    const maxTokens = Math.min(32000, Math.max(3000, estimatedTokens));
    const timeout = Math.max(config.lmStudio.timeout, Math.min(600000, maxTokens * 50));

    return LMStudioService.generateScript(prompt, { maxTokens, timeout });
  }
}

module.exports = ScenePlanningService;
