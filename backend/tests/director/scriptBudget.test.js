const { planScriptBudget } = require('../../src/services/director/scriptBudget');

describe('planScriptBudget', () => {
  it('sizes a standard video: ~2 scenes/min, 130 wpm with a 1.5x undershoot buffer', () => {
    expect(planScriptBudget({ type: 'educational', durationMinutes: 5 })).toEqual({
      durationMinutes: 5,
      sceneCount: 10,
      wordCount: 975, // 5 * 130 * 1.5
      wordsPerScene: 98, // round(975 / 10)
    });
  });

  it('floors the scene count at 3 for very short videos', () => {
    expect(planScriptBudget({ type: 'story', durationMinutes: 1 }).sceneCount).toBe(3);
  });

  it('scales a podcast by adding turns (~20 words each) instead of lengthening scenes', () => {
    const budget = planScriptBudget({ type: 'podcast', durationMinutes: 3 });
    expect(budget.sceneCount).toBe(20); // round(390 / 20)
    expect(budget.wordsPerScene).toBe(Math.round(585 / 20));
  });

  it('derives scene count from the unbuffered word count so podcasts do not balloon', () => {
    expect(planScriptBudget({ type: 'podcast', durationMinutes: 30 }).sceneCount).toBe(195);
  });

  it('falls back to 5 minutes for a missing or invalid duration', () => {
    expect(planScriptBudget({ type: 'educational' }).durationMinutes).toBe(5);
    expect(planScriptBudget({ type: 'educational', durationMinutes: -2 }).durationMinutes).toBe(5);
  });
});
