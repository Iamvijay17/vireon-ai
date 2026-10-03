jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
  llm: jest.fn(), tts: jest.fn(), render: jest.fn(), upload: jest.fn(),
}));
const PromptService = require('../../src/services/common/PromptService');

describe('PromptService.render', () => {
  it('does not treat $ patterns inside a value as replacement tokens', () => {
    // "$&" / "$1" in a string replacement would splice in the match instead of the text.
    const prompt = PromptService.render('story-structure', {
      videoType: 'educational', topic: 'Save $& earn $1 on {{x}}', language: 'english', sceneCount: 3, durationMinutes: 1,
    });
    expect(prompt).toContain('Save $& earn $1 on {{x}}');
  });
});

describe('PromptService.withExtraInstructions', () => {
  const base = 'Intro rules.\n- rule one\n\nRequired JSON format:\n{ "a": 1 }';

  it('returns the prompt unchanged when there is nothing to add', () => {
    expect(PromptService.withExtraInstructions(base, '')).toBe(base);
    expect(PromptService.withExtraInstructions(base, '   ')).toBe(base);
    expect(PromptService.withExtraInstructions(base, undefined)).toBe(base);
  });

  it('places the requirements before the JSON format block so they read as rules', () => {
    const out = PromptService.withExtraInstructions(base, '- be brief');
    expect(out.indexOf('- be brief')).toBeGreaterThan(out.indexOf('- rule one'));
    expect(out.indexOf('- be brief')).toBeLessThan(out.indexOf('Required JSON format'));
    expect(out.endsWith('{ "a": 1 }')).toBe(true);
  });

  it('appends at the end when the template has no JSON format block', () => {
    const out = PromptService.withExtraInstructions('Plain prompt', '- be brief');
    expect(out.startsWith('Plain prompt')).toBe(true);
    expect(out.endsWith('- be brief')).toBe(true);
  });
});

describe('storyboard prompt template', () => {
  it('renders with every placeholder filled and the JSON contract intact', () => {
    const prompt = PromptService.render('storyboard', {
      videoType: 'educational', topic: 'tides', language: 'english', visualPalette: 'warm teal', voiceTone: 'calm',
      maxImages: 2, sceneDigest: '[{"sceneNumber":1}]',
    });
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    expect(prompt).toContain('Required JSON format');
    expect(prompt).toContain('"sceneNumber": 1');
    for (const layout of ['timeline', 'grid', 'comparison-split', 'stat-highlight', 'quote-feature']) {
      expect(prompt).toContain(layout);
    }
  });
});
