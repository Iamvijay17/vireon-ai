jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const { z } = require('zod');
const { validateWithRepair, validateObjectWithRepair } = require('../../src/services/director/llmValidation');

const Item = z.object({ id: z.coerce.number().int(), color: z.enum(['red', 'blue']) });
const idOf = (raw) => Number(raw?.id);

describe('validateWithRepair', () => {
  it('passes valid items straight through and never calls repair', async () => {
    const repair = jest.fn();
    const out = await validateWithRepair({ candidates: [{ id: 1, color: 'red' }, { id: 2, color: 'blue' }], schema: Item, idOf, repair });
    expect(out.valid).toEqual([{ id: 1, color: 'red' }, { id: 2, color: 'blue' }]);
    expect(out.rejected).toEqual([]);
    expect(out.repairs).toBe(0);
    expect(repair).not.toHaveBeenCalled();
  });

  it('asks for a correction of ONLY the invalid items, telling the model what was wrong', async () => {
    const repair = jest.fn().mockResolvedValue([{ id: 2, color: 'blue' }]);
    const out = await validateWithRepair({
      candidates: [{ id: 1, color: 'red' }, { id: 2, color: 'green' }], schema: Item, idOf, repair,
    });

    expect(repair).toHaveBeenCalledTimes(1);
    const sent = repair.mock.calls[0][0];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id: 2, raw: { id: 2, color: 'green' } });
    expect(sent[0].issues.join()).toMatch(/color/);
    expect(out.valid.map((v) => v.id).sort()).toEqual([1, 2]);
    expect(out.rejected).toEqual([]);
    expect(out.repairs).toBe(1);
  });

  it('validates the correction again: a still-invalid answer is rejected, not trusted', async () => {
    const repair = jest.fn().mockResolvedValue([{ id: 2, color: 'purple' }]);
    const out = await validateWithRepair({ candidates: [{ id: 2, color: 'green' }], schema: Item, idOf, repair });
    expect(out.valid).toEqual([]);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].id).toBe(2);
    expect(out.rejected[0].issues.join()).toMatch(/color/);
  });

  it('does not keep asking forever: stops after maxRepairs', async () => {
    const repair = jest.fn().mockResolvedValue([{ id: 1, color: 'nope' }]);
    await validateWithRepair({ candidates: [{ id: 1, color: 'x' }], schema: Item, idOf, repair, maxRepairs: 2 });
    expect(repair).toHaveBeenCalledTimes(2);
  });

  it('maxRepairs 0 disables correction', async () => {
    const repair = jest.fn();
    const out = await validateWithRepair({ candidates: [{ id: 1, color: 'x' }], schema: Item, idOf, repair, maxRepairs: 0 });
    expect(repair).not.toHaveBeenCalled();
    expect(out.rejected).toHaveLength(1);
  });

  it('ignores a correction for something that was never rejected', async () => {
    const repair = jest.fn().mockResolvedValue([{ id: 99, color: 'red' }, { id: 1, color: 'red' }]);
    const out = await validateWithRepair({ candidates: [{ id: 1, color: 'x' }], schema: Item, idOf, repair });
    expect(out.valid.map((v) => v.id)).toEqual([1]);
  });

  it('keeps items the model did not answer for as rejected', async () => {
    const repair = jest.fn().mockResolvedValue([{ id: 1, color: 'red' }]);
    const out = await validateWithRepair({ candidates: [{ id: 1, color: 'x' }, { id: 2, color: 'y' }], schema: Item, idOf, repair });
    expect(out.valid.map((v) => v.id)).toEqual([1]);
    expect(out.rejected.map((r) => r.id)).toEqual([2]);
  });

  it('treats a failing repair call as "still rejected" instead of throwing', async () => {
    const repair = jest.fn().mockRejectedValue(new Error('model down'));
    const out = await validateWithRepair({ candidates: [{ id: 1, color: 'x' }], schema: Item, idOf, repair });
    expect(out.rejected).toHaveLength(1);
    expect(out.valid).toEqual([]);
  });

  it('lets cancellation through', async () => {
    const stop = Object.assign(new Error('stopped'), { cancelled: true });
    await expect(validateWithRepair({ candidates: [{ id: 1, color: 'x' }], schema: Item, idOf, repair: async () => { throw stop; } })).rejects.toBe(stop);
  });

  it('copes with a non-array candidate list and a throwing idOf', async () => {
    expect((await validateWithRepair({ candidates: 'nope', schema: Item, idOf })).valid).toEqual([]);
    const out = await validateWithRepair({ candidates: [null], schema: Item, idOf: () => { throw new Error('x'); } });
    expect(out.rejected).toHaveLength(1);
  });
});

describe('validateObjectWithRepair', () => {
  const Plan = z.object({ title: z.string().min(1), count: z.number().int() });

  it('returns valid data without repairing', async () => {
    const repair = jest.fn();
    const out = await validateObjectWithRepair({ raw: { title: 'a', count: 1 }, schema: Plan, repair });
    expect(out).toMatchObject({ data: { title: 'a', count: 1 }, repairs: 0 });
    expect(repair).not.toHaveBeenCalled();
  });

  it('repairs once with the issues and the previous answer, then re-validates', async () => {
    const repair = jest.fn().mockResolvedValue({ title: 'fixed', count: 2 });
    const out = await validateObjectWithRepair({ raw: { title: '', count: 'x' }, schema: Plan, repair });
    expect(repair).toHaveBeenCalledWith(expect.arrayContaining([expect.stringMatching(/title/)]), { title: '', count: 'x' });
    expect(out.data).toEqual({ title: 'fixed', count: 2 });
    expect(out.repairs).toBe(1);
  });

  it('gives up gracefully (data: null) when the correction is still invalid', async () => {
    const repair = jest.fn().mockResolvedValue({ title: '' });
    const out = await validateObjectWithRepair({ raw: {}, schema: Plan, repair });
    expect(out.data).toBeNull();
    expect(out.issues.length).toBeGreaterThan(0);
  });

  it('gives up gracefully when the repair call throws, and when there is no repair', async () => {
    expect((await validateObjectWithRepair({ raw: {}, schema: Plan, repair: async () => { throw new Error('x'); } })).data).toBeNull();
    expect((await validateObjectWithRepair({ raw: null, schema: Plan })).data).toBeNull();
  });

  it('lets cancellation through', async () => {
    const stop = Object.assign(new Error('stopped'), { cancelled: true });
    await expect(validateObjectWithRepair({ raw: {}, schema: Plan, repair: async () => { throw stop; } })).rejects.toBe(stop);
  });
});
