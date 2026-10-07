const config = require("../../../config");
const LoggerService = require("../../common/LoggerService");
const MetricsService = require("../../common/MetricsService");
const CacheService = require("../../common/CacheService");
const withTimeout = require("../../../utils/withTimeout");

// Fast path for repeat calls within this process only - the persistent
// Smart Cache lookup below is what survives across worker restarts/processes.
const transcriptCache = new Map();

/**
 * Get (and cache) a transcript for a reference audio file, used as the
 * clone's ref_text. Falls back to x-vector-only cloning if transcription
 * fails, rather than failing the whole scene. Checked in two layers: an
 * in-process Map (instant, but empty on every worker restart) backed by
 * CacheService's persistent Smart Cache (survives restarts, shared across
 * worker processes) - reference voices are a small fixed bundled set, so
 * this transcription is realistically a one-time cost per voice, ever.
 */
async function getReferenceText(client, filePath, cacheKey) {
  if (transcriptCache.has(cacheKey)) {
    return transcriptCache.get(cacheKey);
  }

  const cached = await CacheService.getReferenceTranscript(cacheKey);
  if (cached !== null) {
    transcriptCache.set(cacheKey, cached);
    return cached;
  }

  try {
    const fs = require("fs").promises;
    const audioBuffer = await fs.readFile(filePath);
    const mimeType = filePath.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    const result = await withTimeout(
      client.predict("/transcribe_audio", { audio: audioBlob }),
      config.tts.timeout,
      "TTS reference-audio transcription timed out"
    );
    const transcript = (result.data?.[0] || "").toString().trim();
    transcriptCache.set(cacheKey, transcript);
    await CacheService.putReferenceTranscript(cacheKey, transcript);
    return transcript;
  } catch (err) {
    LoggerService.warn(
      `Failed to transcribe reference voice "${cacheKey}", falling back to x-vector-only cloning`,
      { error: err.message },
    );
    // Not written to the persistent cache - a transcription failure here is
    // more likely transient (TTS server hiccup) than a permanent property
    // of the file, so let the next call retry instead of locking in "no
    // transcript" forever the way a persisted empty string would.
    transcriptCache.set(cacheKey, "");
    return "";
  }
}

// Qwen3-TTS's Gradio endpoints take a capitalised language name ("Auto" lets
// the model detect). Unknown values fall back to "Auto".
const QWEN_LANGUAGES = Object.freeze({
  auto: "Auto", english: "English", chinese: "Chinese", japanese: "Japanese", korean: "Korean",
  german: "German", french: "French", russian: "Russian", portuguese: "Portuguese", spanish: "Spanish", italian: "Italian",
});
const qwenLanguage = (language) => QWEN_LANGUAGES[String(language || "auto").toLowerCase()] || "Auto";

/**
 * Connects to the Gradio Qwen3-TTS server, starting it first if needed. A
 * job's scenes share one connection (see sceneSynthesis's clientHolder)
 * instead of paying Gradio's websocket handshake per scene.
 */
async function connect(signal = null) {
  const LocalAIService = require("../../localAI");
  await LocalAIService.tts.ensureRunning();
  const { Client } = require("@gradio/client");
  // A health check passing only proves the web server is up - Gradio's own
  // queue/session setup inside Client.connect() can still hang indefinitely
  // if that subsystem is wedged, with no error and no way to recover short
  // of killing the whole process. See withTimeout's doc comment.
  return withTimeout(
    Client.connect(config.tts.url.replace(/\/generate$/, "").replace(/\/$/, "")),
    config.tts.timeout,
    "Connecting to TTS server timed out",
    signal
  );
}

async function generateCustom(client, resolved, text, seed, instruct = "", fastMode = false, language = "Auto") {
  return client.predict("/generate_custom_voice", {
    text,
    language,
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
async function generateDesign(client, resolved, text, seed, instruct = "", fastMode = false, language = "Auto") {
  const voiceDescription = instruct ? `${resolved.description}. ${instruct}` : resolved.description;
  return client.predict("/generate_voice_design", {
    text,
    language,
    voice_description: voiceDescription,
    model_size: fastMode ? config.tts.fastModelSize : config.tts.modelSize,
    seed,
  });
}

async function generateClone(client, resolved, text, seed, fastMode = false, language = "Auto") {
  const fs = require("fs").promises;
  const refText = await getReferenceText(client, resolved.filePath, resolved.file);
  const refAudioBuffer = await fs.readFile(resolved.filePath);
  const refMimeType = resolved.file.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  const refAudioBlob = new Blob([refAudioBuffer], { type: refMimeType });

  return client.predict("/generate_voice_clone", {
    ref_audio: refAudioBlob,
    ref_text: refText,
    target_text: text,
    language,
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
async function generate(client, resolved, text, seed, instruct, fastMode, language = "auto") {
  const startedAt = Date.now();
  const lang = qwenLanguage(language);
  const result =
    resolved.mode === "clone"
      ? await generateClone(client, resolved, text, seed, fastMode, lang)
      : resolved.mode === "design"
        ? await generateDesign(client, resolved, text, seed, instruct, fastMode, lang)
        : await generateCustom(client, resolved, text, seed, instruct, fastMode, lang);
  MetricsService.recordDuration("tts.duration", Date.now() - startedAt);
  return result;
}

module.exports = { generate, connect, qwenLanguage, getReferenceText };
