/**
 * Races `promise` against a timeout, rejecting with a clear message if it
 * doesn't settle in time. @gradio/client's Client.connect()/client.predict()
 * calls have no built-in timeout - a wedged Gradio server (queue subsystem
 * stuck, not just the process being down) leaves the caller awaiting
 * forever with no error, no retry, and no way to recover short of killing
 * the whole Node process. Wrap any such call with this so a stuck remote
 * service surfaces as a normal, retryable error instead.
 */
async function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = withTimeout;
