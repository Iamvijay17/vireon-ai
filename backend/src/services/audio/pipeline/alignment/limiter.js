/**
 * Tiny FIFO concurrency limiter. The limit is read on every dispatch so a
 * config change (or a test) takes effect without rebuilding the limiter.
 *
 * Deliberately not a dependency: it is ~20 lines and the only thing the
 * alignment path needs is "at most N of these at once".
 */
function createLimiter(getLimit) {
  let active = 0;
  const waiting = [];

  const limit = () => Math.max(1, Number(typeof getLimit === 'function' ? getLimit() : getLimit) || 1);

  function next() {
    while (active < limit() && waiting.length > 0) {
      const { fn, resolve, reject } = waiting.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active--;
          next();
        });
    }
  }

  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        waiting.push({ fn, resolve, reject });
        next();
      });
    },
    get active() { return active; },
    get pending() { return waiting.length; },
  };
}

module.exports = { createLimiter };
