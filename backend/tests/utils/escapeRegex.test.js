const { escapeRegex } = require('../../src/utils/escapeRegex');

describe('escapeRegex', () => {
  it('escapes every regex metacharacter so the text matches literally', () => {
    const text = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    const re = new RegExp(escapeRegex(text), 'i');
    expect(re.test(text)).toBe(true);
    expect(re.test('aXb')).toBe(false);
  });

  it('turns text that is an invalid pattern into a valid one', () => {
    const invalid = ['c', '+', '+'].join('');
    expect(() => new RegExp(invalid)).toThrow();
    expect(() => new RegExp(escapeRegex(invalid))).not.toThrow();
    expect(() => new RegExp(escapeRegex('('))).not.toThrow();
  });

  it('leaves ordinary words alone and coerces non-strings', () => {
    expect(escapeRegex('quantum computing')).toBe('quantum computing');
    expect(escapeRegex(42)).toBe('42');
  });
});
