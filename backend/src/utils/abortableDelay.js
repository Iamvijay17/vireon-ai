/**
 * Standard fetch()/DOMException-shaped abort error, so callers can tell an
 * intentional cancellation apart from a real failure the same way they
 * already do for fetch's own AbortError (`err.name === 'AbortError'`).
 */
function makeAbortError() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * setTimeout that resolves early with an AbortError the moment `signal`
 * aborts, instead of always waiting out the full delay. Used for retry
 * backoff waits (TTS, render) so a Stop request doesn't sit through a
 * pointless multi-second sleep before the next cancellation checkpoint.
 */
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort() {
      cleanup();
      reject(makeAbortError());
    }

    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

module.exports = { abortableDelay, makeAbortError };
