/**
 * Turns a raw exception into a { friendly, detail } pair - `detail` keeps
 * the original message for logs/support, `friendly` is what gets stored on
 * the job and shown in the UI instead of raw subprocess/stack-trace text.
 *
 * Patterns below match the actual failure message shapes thrown by
 * LLMService, sceneSynthesis/standaloneSynthesis (TTS), avatarService,
 * and RemotionService - see each service's own retry loop for the
 * "X failed after N attempts: <cause>" wording this reads.
 */
function classifyError(err, step) {
  const detail = err?.message || String(err);
  const lower = detail.toLowerCase();

  if (/(lm studio|ollama|llm) failed/i.test(detail)) {
    return { friendly: 'Script generation failed - the AI model server did not respond in time. This is usually temporary.', detail };
  }
  if (/tts failed/i.test(detail)) {
    return { friendly: 'Voice generation failed - the text-to-speech service did not respond in time. This is usually temporary.', detail };
  }
  if (/avatar generation failed/i.test(detail)) {
    return { friendly: 'Avatar generation failed - the animation service did not respond in time. This is usually temporary.', detail };
  }
  if (/remotion rendering failed/i.test(detail)) {
    return { friendly: 'Video rendering failed - the render engine hit an error while assembling the video.', detail };
  }
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('etimedout') || lower.includes('econnreset')) {
    return { friendly: 'Could not reach an external service needed for this step. This is usually a temporary connectivity issue.', detail };
  }
  if (lower.includes('validationerror') || lower.includes('validation failed')) {
    return { friendly: 'This job\'s data failed validation and could not continue.', detail };
  }

  const label = step ? `${step} failed` : 'Job failed';
  return { friendly: `${label}: ${detail}`, detail };
}

module.exports = { classifyError };
