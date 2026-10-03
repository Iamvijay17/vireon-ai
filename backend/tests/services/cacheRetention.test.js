jest.mock('../../src/services/common/LoggerService', () => ({ info: jest.fn(), warn: jest.fn() }));

const { applyCacheRetention, RULE_ID } = require('../../src/services/storage/cacheRetention');

const makeClient = (existing) => ({
  getBucketLifecycle: jest.fn(existing === undefined ? () => Promise.reject(new Error('NoSuchLifecycleConfiguration')) : () => Promise.resolve(existing)),
  setBucketLifecycle: jest.fn().mockResolvedValue(),
  removeBucketLifecycle: jest.fn().mockResolvedValue(),
});

const ours = (days) => ({ ID: RULE_ID, Status: 'Enabled', Filter: { Prefix: '' }, Expiration: { Days: days } });

describe('applyCacheRetention', () => {
  it('sets an expiry rule when retention is on and none exists', async () => {
    const client = makeClient(undefined);
    await applyCacheRetention(client, 'vireon-cache', 90);
    expect(client.setBucketLifecycle).toHaveBeenCalledWith('vireon-cache', { Rule: [ours(90)] });
  });

  it('does nothing when the rule is already current', async () => {
    const client = makeClient({ Rule: [ours(90)] });
    await applyCacheRetention(client, 'vireon-cache', 90);
    expect(client.setBucketLifecycle).not.toHaveBeenCalled();
  });

  it('updates the rule when the number of days changes, keeping other rules', async () => {
    const other = { ID: 'someone-else', Status: 'Enabled', Filter: { Prefix: 'x/' }, Expiration: { Days: 5 } };
    const client = makeClient({ Rule: [other, ours(30)] });
    await applyCacheRetention(client, 'vireon-cache', 60);
    expect(client.setBucketLifecycle).toHaveBeenCalledWith('vireon-cache', { Rule: [other, ours(60)] });
  });

  it('does nothing when retention is off and no rule of ours exists (default)', async () => {
    const client = makeClient(undefined);
    await applyCacheRetention(client, 'vireon-cache', 0);
    expect(client.setBucketLifecycle).not.toHaveBeenCalled();
    expect(client.removeBucketLifecycle).not.toHaveBeenCalled();
  });

  it('removes only our rule when retention is turned off', async () => {
    const other = { ID: 'someone-else', Status: 'Enabled', Filter: { Prefix: 'x/' }, Expiration: { Days: 5 } };
    const both = makeClient({ Rule: [other, ours(30)] });
    await applyCacheRetention(both, 'vireon-cache', 0);
    expect(both.setBucketLifecycle).toHaveBeenCalledWith('vireon-cache', { Rule: [other] });

    const alone = makeClient({ Rule: ours(30) });
    await applyCacheRetention(alone, 'vireon-cache', 0);
    expect(alone.removeBucketLifecycle).toHaveBeenCalledWith('vireon-cache');
  });

  it('never throws when MinIO refuses', async () => {
    const client = makeClient(undefined);
    client.setBucketLifecycle.mockRejectedValue(new Error('denied'));
    await expect(applyCacheRetention(client, 'vireon-cache', 30)).resolves.toBeUndefined();
  });
});
