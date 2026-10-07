const crypto = require('crypto');

/**
 * Stable content hash of a plain object: keys are sorted so property order
 * never changes the result. Only the top level is sorted - callers pass
 * nested values in a fixed shape. Shared by CacheService (TTS/image keys)
 * and the segmented narration pipeline's cache keys.
 */
function hashInputs(inputs) {
  const sorted = Object.keys(inputs)
    .sort()
    .reduce((acc, key) => {
      acc[key] = inputs[key];
      return acc;
    }, {});
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

module.exports = hashInputs;
