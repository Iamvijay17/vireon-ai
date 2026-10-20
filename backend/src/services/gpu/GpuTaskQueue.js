/**
 * The ordering policy for GPU tasks waiting in one process. No timers, no
 * promises, no I/O: it only decides *which waiting task goes next*, so the
 * fairness rules can be tested by calling it.
 *
 * Order is by `score = enqueuedAt - priority * priorityWeightMs` (lowest
 * first). A higher priority is therefore a head start measured in waiting
 * time, not a lane of its own: interactive work jumps ahead of batch work, but
 * a batch task that has waited longer than the head start still goes first, so
 * nothing starves and no separate aging pass is needed.
 *
 * On top of that sits model affinity. Swapping the loaded model (Ollama <-> TTS
 * <-> ComfyUI) costs tens of seconds on a 6GB card, so a task for the model
 * that is already warm may jump the line - but only by `affinityWindowMs` of
 * queue age. Newer arrivals therefore can never overtake a task that has been
 * waiting longer than the window, which bounds the cost of the optimisation.
 */

/** Why a task cannot start right now, as reported by the caller's `check`. */
const BLOCK = Object.freeze({
  NONE: 'ok',
  /** Its own service is already running a task (a service is exclusive). */
  SERVICE_BUSY: 'service-busy',
  /** No slot or VRAM for it. Head-of-line: nothing behind it may take the room. */
  CAPACITY: 'capacity',
});

class GpuTaskQueue {
  constructor({ priorityWeightMs = 120_000, affinityWindowMs = 120_000 } = {}) {
    this.priorityWeightMs = priorityWeightMs;
    this.affinityWindowMs = affinityWindowMs;
    this._tasks = [];
  }

  get size() {
    return this._tasks.length;
  }

  score(task) {
    return task.enqueuedAt - (task.priority || 0) * this.priorityWeightMs;
  }

  /** Waiting tasks in the order they would run, ignoring capacity and affinity. */
  list() {
    return [...this._tasks].sort((a, b) => this.score(a) - this.score(b) || a.seq - b.seq);
  }

  add(task) {
    this._tasks.push(task);
  }

  remove(id) {
    const index = this._tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this._tasks.splice(index, 1);
    return true;
  }

  has(id) {
    return this._tasks.some((t) => t.id === id);
  }

  /**
   * The task that should start next, or null if none may. Does not remove it.
   *
   * `check(task)` returns a BLOCK value. `warm` is the set of services whose
   * model is currently loaded.
   */
  pick({ warm = new Set(), check = () => BLOCK.NONE } = {}) {
    const ordered = this.list();
    if (ordered.length === 0) return null;

    let head = null;
    for (const task of ordered) {
      const verdict = check(task);
      if (verdict === BLOCK.NONE) {
        head = task;
        break;
      }
      // Out of room for the first task in line: leave the room for it.
      if (verdict === BLOCK.CAPACITY) return null;
      // Its own service is busy - tasks for other services may go meanwhile.
    }
    if (!head) return null;
    if (this.affinityWindowMs <= 0 || warm.has(head.service)) return head;

    const limit = this.score(head) + this.affinityWindowMs;
    for (const task of ordered) {
      if (task === head || !warm.has(task.service)) continue;
      if (this.score(task) > limit) break; // ordered, so nothing later qualifies either
      if (check(task) === BLOCK.NONE) return task;
    }
    return head;
  }
}

module.exports = { GpuTaskQueue, BLOCK };
