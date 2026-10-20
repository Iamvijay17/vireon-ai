/**
 * Who is waiting decides how fast the card should get to them.
 *
 *   INTERACTIVE  a person is watching a spinner: Image Studio, voice preview
 *   NORMAL       a single video job
 *   BATCH        bulk work nobody is staring at: course videos
 *
 * Each level is a head start in queue age (config.gpu.scheduler.priorityWeightMs),
 * not an exclusive lane - see GpuTaskQueue.
 */
const PRIORITY = Object.freeze({ BATCH: 0, NORMAL: 1, INTERACTIVE: 2 });

module.exports = { PRIORITY };
