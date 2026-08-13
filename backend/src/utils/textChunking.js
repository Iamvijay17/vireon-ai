// Splits long single-voice text into sentence-boundary chunks for
// progressive synthesis (see AudioService.generateStandaloneAudioChunk) -
// mirrors the dialogue pipeline's per-turn synthesis so long text can be
// played piece by piece instead of waiting for one long TTS call to finish.
// Short text (the common case) isn't chunked at all - see chunkText's
// maxChars guard in audioController.generate.

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/**
 * Greedily pack sentences into chunks under `maxChars`, so chunk boundaries
 * land on natural pauses rather than mid-sentence. A single sentence longer
 * than `maxChars` becomes its own (oversized) chunk rather than being cut
 * mid-word.
 */
function chunkText(text, maxChars = 400) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const sentences = trimmed.split(SENTENCE_SPLIT).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

module.exports = { chunkText };
