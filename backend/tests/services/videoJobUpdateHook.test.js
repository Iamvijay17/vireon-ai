const VideoJob = require('../../src/models/VideoJob');

// Runs the schema's pre('findOneAndUpdate') hooks against a stand-in query, so
// what the hook leaves in the update is observable without a database.
function runUpdateHook(update, currentStatus) {
  let current = update;
  const query = {
    getUpdate: () => current,
    setUpdate: (next) => { current = next; },
    getQuery: () => ({ _id: 'job-1' }),
    model: { findOne: () => ({ select: () => ({ lean: async () => ({ status: currentStatus, createdAt: new Date() }) }) }) },
  };
  // Only this schema's own hook - Mongoose's built-in timestamps hook needs a real query.
  const hook = VideoJob.schema.s.hooks._pres.get('findOneAndUpdate').find(({ fn }) => String(fn).includes('plainKeys'));
  return hook.fn.call(query, () => {}).then(() => current);
}

describe('VideoJob pre(findOneAndUpdate) hook', () => {
  const scenes = [{ sceneNumber: 1, sceneType: 'contentwithimage' }];

  it('keeps plain fields when the status is not changing (Studio save during SCRIPT_COMPLETED)', async () => {
    const update = await runUpdateHook({ 'script.scenes': scenes, status: 'SCRIPT_COMPLETED', progress: 20 }, 'SCRIPT_COMPLETED');
    expect(update.$set).toMatchObject({ 'script.scenes': scenes, status: 'SCRIPT_COMPLETED', progress: 20 });
    expect(update.$push).toBeUndefined();
  });

  it('keeps plain fields when the update carries no status at all', async () => {
    const update = await runUpdateHook({ progress: 55 }, 'RENDERING');
    expect(update.$set).toEqual({ progress: 55 });
  });

  it('keeps plain fields and records the transition when the status changes', async () => {
    const update = await runUpdateHook({ 'script.scenes': scenes, status: 'SCRIPT_COMPLETED' }, 'AWAITING_APPROVAL');
    expect(update.$set).toMatchObject({ 'script.scenes': scenes, status: 'SCRIPT_COMPLETED' });
    expect(update.$set.lastTransitionAt).toBeInstanceOf(Date);
    expect(update.$push.statusHistory).toMatchObject({ from: 'AWAITING_APPROVAL', to: 'SCRIPT_COMPLETED' });
  });

  it('leaves operator-style updates intact', async () => {
    const update = await runUpdateHook({ $set: { progress: 10 }, $unset: { nextRetryAt: 1 } }, 'RENDERING');
    expect(update.$set).toEqual({ progress: 10 });
    expect(update.$unset).toEqual({ nextRetryAt: 1 });
  });
});
