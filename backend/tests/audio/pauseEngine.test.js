const { computePauses, isImportantStatement, pauseForEnding } = require('../../src/services/audio/pipeline/pauseEngine');

const pauses = { min: 0, max: 1500, comma: 120, sentence: 300, paragraph: 700, sceneTransition: 400 };
const seg = (text, extra = {}) => ({ text, ...extra });
const run = (segments, opts = {}) => computePauses(segments, { pauses, ...opts });

describe('pauseForEnding', () => {
  it('grades pauses by how a segment ends', () => {
    expect(pauseForEnding('Hello,', pauses)).toBe(120);
    expect(pauseForEnding('Hello', pauses)).toBe(120);
    expect(pauseForEnding('Hello.', pauses)).toBe(300);
    expect(pauseForEnding('Hello?"', pauses)).toBe(300);
    expect(pauseForEnding('Hello...', pauses)).toBeGreaterThan(300);
  });
});

describe('computePauses', () => {
  it('uses the scene-transition pause after the last segment, and a short one for the final scene', () => {
    expect(run([seg('One.')])[0].pauseAfterMs).toBe(400);
    expect(run([seg('One.')], { isLastScene: true })[0].pauseAfterMs).toBe(120);
  });

  it('puts a longer pause before a new paragraph', () => {
    const r = run([seg('One.'), seg('Two.', { paragraphBreakBefore: true })]);
    expect(r[0].pauseAfterMs).toBe(700);
  });

  it('adds a lead-in before an important statement', () => {
    const r = run([seg('We tried many things for a very long time and the results were mixed at best, honestly.'), seg('Remember this.')]);
    expect(r[1].pauseBeforeMs).toBeGreaterThan(300);
    expect(isImportantStatement('Here is a normal sentence about nothing in particular.', 'x')).toBe(false);
  });

  it('lets the Voice Director override defaults', () => {
    const r = run([seg('One.', { instruction: { pauseAfter: 900, pauseBefore: 250 } }), seg('Two.')]);
    expect(r[0].pauseAfterMs).toBe(900);
    expect(r[0].pauseBeforeMs).toBe(250);
  });

  it('honours an explicit zero override', () => {
    expect(run([seg('One.', { instruction: { pauseAfter: 0 } })])[0].pauseAfterMs).toBe(0);
  });

  it('clamps everything to the configured limits so there is never dead air', () => {
    const r = run([seg('One.', { instruction: { pauseAfter: 99999 } })]);
    expect(r[0].pauseAfterMs).toBe(1500);
    const tight = computePauses([seg('One.')], { pauses: { ...pauses, max: 200 } });
    expect(tight[0].pauseAfterMs).toBe(200);
  });

  it('stretches pauses for slow styles and tightens them for energetic ones', () => {
    const base = run([seg('A.'), seg('B.')], { style: 'professional' })[0].pauseAfterMs;
    expect(run([seg('A.'), seg('B.')], { style: 'cinematic' })[0].pauseAfterMs).toBeGreaterThan(base);
    expect(run([seg('A.'), seg('B.')], { style: 'energetic' })[0].pauseAfterMs).toBeLessThan(base);
  });
});
