/**
 * Read-only check that the Control Center's aggregation pipelines are understood by the
 * connected MongoDB server. Runs each against inline synthetic documents ($documents,
 * MongoDB 5.1+), so nothing is read from or written to any collection, and autoIndex /
 * autoCreate are off so it cannot create indexes either.
 *
 *   node scripts/verifyControlCenter.js
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const { pipelines } = require('../src/services/common/ControlCenterService');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const since = new Date(Date.now() - 30 * 86400000);
const at = new Date();
const jobs = [
  { createdAt: at, status: 'COMPLETED', stages: { audio: { status: 'completed', durationMs: 1000, attempt: 1, reused: false }, images: { status: 'completed', durationMs: 0, attempt: 1, reused: true } } },
  { createdAt: at, status: 'FAILED', error: { code: 'RENDER_FAILED' }, statusHistory: [{ from: 'QUEUED', to: 'RETRY_SCHEDULED' }] },
  { createdAt: at, status: 'COMPLETED' },
];
const events = [
  { type: 'stageUpdate', at, data: { stage: 'audio', status: 'running', attempt: 2 } },
  { type: 'stageUpdate', at, data: { stage: 'audio', status: 'failed', attempt: 1, error: { code: 'TTS_FAILED', message: 'x', retryable: true } } },
];

(async () => {
  await mongoose.connect(config.mongodb.uri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  const run = (docs, pipeline) => mongoose.connection.db.aggregate([{ $documents: docs }, ...pipeline]).toArray();
  const checks = [
    ['stage timing', jobs, pipelines.stageTimingPipeline(since)],
    ['stage coverage', jobs, pipelines.jobsWithStageDataPipeline(since)],
    ['failed job errors', jobs, pipelines.failedJobErrorPipeline(since)],
    ['retries', jobs, pipelines.retryPipeline(since)],
    ['stage events', events, pipelines.stageEventPipeline(since)],
    ['top errors', events, pipelines.topErrorPipeline(since)],
  ];
  for (const [name, docs, pipeline] of checks) {
    const rows = await run(docs, pipeline);
    console.log(`ok  ${name}: ${rows.length} row(s)`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
