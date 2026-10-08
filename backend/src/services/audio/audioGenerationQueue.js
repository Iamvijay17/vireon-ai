// Serial, in-process queue for Audio Studio generations. TTS runs on a single
// GPU-bound server, so concurrent requests would only fight over it - instead
// the controller responds as soon as a record is created and the work runs
// here one generation at a time, in submission order.
//
// In-memory on purpose (single-user app, single server process): anything
// still queued or running when the process dies is swept to FAILED on boot
// by startup/recovery.js, same as the old synchronous behavior.
let tail = Promise.resolve();
let waiting = 0;

/**
 * Runs `task` after every previously enqueued task has settled. `task` owns
 * its own error handling - a rejection is swallowed here so one failure can't
 * block the generations queued behind it.
 */
function enqueue(task) {
  waiting += 1;
  tail = tail
    .then(task)
    .catch(() => {})
    .finally(() => {
      waiting -= 1;
    });
  return tail;
}

/** Tasks queued or running right now. */
function size() {
  return waiting;
}

module.exports = { enqueue, size };
