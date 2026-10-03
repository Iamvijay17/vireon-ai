const fs = require('fs');
const path = require('path');
const { fillWorkflow, placeholdersIn, firstOutputImage } = require('../../src/services/image/workflow');

describe('fillWorkflow', () => {
  it('keeps the type of a value that is only a placeholder (ComfyUI rejects a stringified seed)', () => {
    const out = fillWorkflow({ a: { seed: '{{seed}}', cfg: '{{cfg}}', name: '{{name}}' } }, { seed: 123456789012, cfg: 7.5, name: 'x' });
    expect(out.a).toEqual({ seed: 123456789012, cfg: 7.5, name: 'x' });
    expect(typeof out.a.seed).toBe('number');
  });

  it('interpolates a placeholder inside longer text', () => {
    expect(fillWorkflow({ t: 'a photo of {{prompt}}, high detail' }, { prompt: 'a cat' })).toEqual({ t: 'a photo of a cat, high detail' });
  });

  it('walks arrays (node links like ["4", 0]) without touching them', () => {
    const out = fillWorkflow({ n: { model: ['4', 0], list: ['{{x}}', 1] } }, { x: 'y' });
    expect(out.n.model).toEqual(['4', 0]);
    expect(out.n.list).toEqual(['y', 1]);
  });

  it('does not mutate the template, so it can be reused for every image', () => {
    const template = { a: '{{x}}' };
    fillWorkflow(template, { x: 1 });
    expect(template).toEqual({ a: '{{x}}' });
  });

  it('fails loudly on a placeholder with no value instead of sending a broken graph', () => {
    expect(() => fillWorkflow({ a: '{{typo}}' }, { x: 1 })).toThrow(/\{\{typo\}\}/);
    expect(() => fillWorkflow({ a: 'text {{typo}}' }, { x: 1 })).toThrow(/\{\{typo\}\}/);
    expect(() => fillWorkflow({ a: '{{x}}' }, { x: undefined })).toThrow(/\{\{x\}\}/);
  });

  it('does not re-interpret placeholders that appear inside a substituted value', () => {
    const out = fillWorkflow({ t: '{{prompt}}' }, { prompt: 'literal {{seed}} text' });
    expect(out.t).toBe('literal {{seed}} text');
  });
});

describe('placeholdersIn', () => {
  it('lists every distinct placeholder in a template', () => {
    expect([...placeholdersIn({ a: '{{x}}', b: ['{{y}} and {{x}}', { c: '{{z}}' }], d: 3 })].sort()).toEqual(['x', 'y', 'z']);
  });
});

describe('firstOutputImage', () => {
  it('prefers a saved output over a temp preview', () => {
    const entry = { outputs: { 5: { images: [{ filename: 'p.png', type: 'temp' }] }, 9: { images: [{ filename: 'o.png', type: 'output' }] } } };
    expect(firstOutputImage(entry).filename).toBe('o.png');
  });

  it('falls back to any image, and returns null when there is none', () => {
    expect(firstOutputImage({ outputs: { 5: { images: [{ filename: 'p.png', type: 'temp' }] } } }).filename).toBe('p.png');
    expect(firstOutputImage({ outputs: {} })).toBeNull();
    expect(firstOutputImage(undefined)).toBeNull();
  });
});

describe('the shipped txt2img workflow', () => {
  const template = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../workflows/txt2img.api.json'), 'utf8'));
  const params = {
    prompt: 'a lighthouse', negative: 'text', seed: 42, width: 1024, height: 576,
    steps: 25, cfg: 7, sampler: 'euler', scheduler: 'normal', checkpoint: 'model.safetensors',
  };

  it('only uses placeholders Vireon provides', () => {
    expect([...placeholdersIn(template)].sort()).toEqual(Object.keys(params).sort());
  });

  it('fills completely, with numeric inputs left numeric and a SaveImage output', () => {
    const graph = fillWorkflow(template, params);
    expect(JSON.stringify(graph)).not.toMatch(/\{\{/);
    expect(graph['3'].inputs).toMatchObject({ seed: 42, steps: 25, cfg: 7, sampler_name: 'euler', scheduler: 'normal' });
    expect(graph['5'].inputs).toMatchObject({ width: 1024, height: 576 });
    expect(graph['4'].inputs.ckpt_name).toBe('model.safetensors');
    expect(graph['6'].inputs.text).toBe('a lighthouse');
    expect(Object.values(graph).some((n) => n.class_type === 'SaveImage')).toBe(true);
  });
});
