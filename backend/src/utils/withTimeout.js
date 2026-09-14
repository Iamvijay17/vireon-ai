const { makeAbortError } = require('./abortableDelay');

/**
 * Races `promise` against a timeout, rejecting with a clear message if it
 * doesn't settle in time. @gradio/client's Client.connect()/client.predict()
 * calls have no built-in timeout - a wedged Gradio server (queue subsystem
 * stuck, not just the process being down) leaves the caller awaiting
 * forever with no error, no retry, and no way to recover short of killing
 * the whole Node process. Wrap any such call with this so a stuck remote
 * service surfaces as a normal, retryable error instead.
 *
 * An optional `signal` additionally races an AbortSignal alongside the
 * timer, rejecting immediately (AbortError) the moment it fires instead of
 * waiting out the rest of `ms`. This is what lets a user's Stop click
 * interrupt a TTS/render call that's already in flight - the remote
 * call itself may keep running (Gradio/the render CLI have no cancel API this
 * reaches), but the worker stops waiting on it right away and can move on
 * to noticing the job is cancelled.
 */
async function withTimeout(promise, ms, message, signal) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Timed out after ${ms}ms`)), ms);
  });

  const racers = [promise, timeout];
  let onAbort;
  if (signal) {
    if (signal.aborted) throw makeAbortError();
    racers.push(new Promise((_, reject) => {
      onAbort = () => reject(makeAbortError());
      signal.addEventListener('abort', onAbort, { once: true });
    }));
  }

  try {
    return await Promise.race(racers);
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

module.exports = withTimeout;
