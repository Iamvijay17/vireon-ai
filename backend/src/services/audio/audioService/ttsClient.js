const config = require("../../../config");
const LoggerService = require("../../common/LoggerService");
const MetricsService = require("../../common/MetricsService");

const transcriptCache = new Map();

/**
 * Get (and cache) a transcript for a reference audio file, used as the
 * clone's ref_text. Falls back to x-vector-only cloning if transcription
 * fails, rather than failing the whole scene.
 */
async function getReferenceText(client, filePath, cacheKey) {
  if (transcriptCache.has(cacheKey)) {
    return transcriptCache.get(cacheKey);
  }

  try {
    const fs = require("fs").promises;
    const audioBuffer = await fs.readFile(filePath);
    const mimeType = filePath.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    const result = await client.predict("/transcribe_audio", {
      audio: audioBlob,
    });
    const transcript = (result.data?.[0] || "").toString().trim();
    transcriptCache.set(cacheKey, transcript);
    return transcript;
  } catch (err) {
    LoggerService.warn(
      `Failed to transcribe reference voice "${cacheKey}", falling back to x-vector-only cloning`,
      { error: err.message },
    );
    transcriptCache.set(cacheKey, "");
    return "";
  }
}

async function generateCustom(client, resolved, text, seed, instruct = "", fastMode = false) {
  return client.predict("/generate_custom_voice", {
    text,
    language: "Auto",
    speaker: resolved.speaker,
    instruct,
    model_size: fastMode ? config.tts.fastModelSize : config.tts.modelSize,
    seed,
  });
}

/**
 * A designed voice has no reference audio to anchor it - identity comes
 * entirely from `resolved.description` (see voiceCatalog.resolveVoice's
 * "design:" mode), so per-turn delivery is folded into that same
 * description string rather than a separate instruct param (the endpoint
 * doesn't have one - see the Voice Design tab's single "Voice Description"
 * field). Keeping the base description's wording stable across calls with
 * the same seed is what keeps the identity from drifting turn to turn;
 * only the appended delivery clause should vary.
 */
async function generateDesign(client, resolved, text, seed, instruct = "", fastMode = false) {
  const voiceDescription = instruct ? `${resolved.description}. ${instruct}` : resolved.description;
  return client.predict("/generate_voice_design", {
    text,
    language: "Auto",
    voice_description: voiceDescription,
    model_size: fastMode ? config.tts.fastModelSize : config.tts.modelSize,
    seed,
  });
}

async function generateClone(client, resolved, text, seed, fastMode = false) {
  const fs = require("fs").promises;
  const refText = await getReferenceText(client, resolved.filePath, resolved.file);
  const refAudioBuffer = await fs.readFile(resolved.filePath);
  const refMimeType = resolved.file.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  const refAudioBlob = new Blob([refAudioBuffer], { type: refMimeType });

  return client.predict("/generate_voice_clone", {
    ref_audio: refAudioBlob,
    ref_text: refText,
    target_text: text,
    language: "Auto",
    use_xvector_only: !refText,
    model_size: fastMode ? config.tts.fastModelSize : config.tts.modelSize,
    max_chunk_chars: 200,
    chunk_gap: 0,
    seed,
  });
}

/**
 * Dispatch to the right Gradio endpoint for the resolved voice mode.
 * Does not manage the client's connection lifecycle - a job's scenes share
 * one connection (see sceneSynthesis.js's clientHolder), so closing it here
 * would kill it out from under the next scene. The caller that owns the
 * connection is responsible for closing it.
 */
async function generate(client, resolved, text, seed, instruct, fastMode) {
  const startedAt = Date.now();
  const result =
    resolved.mode === "clone"
      ? await generateClone(client, resolved, text, seed, fastMode)
      : resolved.mode === "design"
        ? await generateDesign(client, resolved, text, seed, instruct, fastMode)
        : await generateCustom(client, resolved, text, seed, instruct, fastMode);
  MetricsService.recordDuration("tts.duration", Date.now() - startedAt);
  return result;
}

module.exports = { generate, getReferenceText };
