/**
 * Generation time is the worker's working time, not wall-clock time: a job
 * that waited days for approval or a retry backoff must not average in as
 * days of "generation".
 */
jest.mock('../../src/queues/videoQueue', () => ({ getJobCounts: jest.fn() }));

const { activeProcessingMs, buildStageDurations } = require('../../src/services/common/AnalyticsService');

const step = (from, to, durationMs) => ({ from, to, durationMs });

describe('activeProcessingMs', () => {
  const history = [
    step(null, 'QUEUED', null),
    step('QUEUED', 'SCRIPT_GENERATION', 5_000),            // queue wait - not counted
    step('SCRIPT_GENERATION', 'AWAITING_APPROVAL', 60_000),
    step('AWAITING_APPROVAL', 'GENERATING_AUDIO', 3 * 86_400_000), // three days waiting for a person
    step('GENERATING_AUDIO', 'RETRY_SCHEDULED', 120_000),
    step('RETRY_SCHEDULED', 'GENERATING_AUDIO', 21 * 86_400_000),  // stranded retry
    step('GENERATING_AUDIO', 'AUDIO_COMPLETED', 240_000),
    step('AUDIO_COMPLETED', 'RENDERING', 1_000),
    step('RENDERING', 'UPLOADING', 600_000),
    step('UPLOADING', 'COMPLETED', 10_000),
  ];

  it('counts only time in statuses where the worker is working', () => {
    expect(activeProcessingMs(history)).toBe(60_000 + 120_000 + 240_000 + 600_000 + 10_000);
  });

  it('equals the sum of the per-stage columns shown next to it', () => {
    const stagesTotal = buildStageDurations(history).reduce((s, st) => s + st.durationMs, 0);
    expect(activeProcessingMs(history)).toBe(stagesTotal);
  });

  it('is zero for a job with no recorded history', () => {
    expect(activeProcessingMs(undefined)).toBe(0);
    expect(activeProcessingMs([])).toBe(0);
  });
});
