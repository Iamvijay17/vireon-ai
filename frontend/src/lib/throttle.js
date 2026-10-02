/**
 * Leading + trailing throttle with `cancel` and `flush`.
 *
 * The first call runs immediately (so the UI reacts without delay); further
 * calls inside the window are collapsed into ONE trailing call with the
 * latest arguments when the window ends. `cancel()` drops any pending call
 * (use it on unmount); `flush(...args)` runs now and resets the window (use
 * it for events that must never be delayed, e.g. "job completed").
 */
export function createThrottle(fn, windowMs) {
  let timer = null;
  let pendingArgs = null;

  const endWindow = () => {
    timer = null;
    if (pendingArgs) {
      const args = pendingArgs;
      pendingArgs = null;
      throttled(...args); // runs the trailing call and opens a new window
    }
  };

  function throttled(...args) {
    if (timer === null) {
      timer = setTimeout(endWindow, windowMs);
      fn(...args);
    } else {
      pendingArgs = args;
    }
  }

  throttled.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  throttled.flush = (...args) => {
    throttled.cancel();
    fn(...args);
  };

  return throttled;
}
