const { processText, captionTokens, PRONUNCIATION_VERSION } = require('../../src/services/audio/pipeline/pronunciation');

const spoken = (t, o) => processText(t, { enabled: true, ...o }).spokenText;

describe('processText', () => {
  it('never mutates the original and returns it alongside the spoken text', () => {
    const r = processText('React is used with Node.js.', { enabled: true });
    expect(r.originalText).toBe('React is used with Node.js.');
    expect(r.spokenText).toBe('React is used with Node JS.');
    expect(r.changed).toBe(true);
    expect(r.version).toBe(PRONUNCIATION_VERSION);
  });

  it('is an identity transform when disabled', () => {
    const r = processText('Node.js and MongoDB', { enabled: false });
    expect(r.spokenText).toBe('Node.js and MongoDB');
    expect(r.changed).toBe(false);
  });

  it('rewrites technical terms, whole words only', () => {
    expect(spoken('We use MongoDB and GraphQL.')).toBe('We use Mongo D B and Graph Q L.');
    expect(spoken('The SQLAlchemy docs')).toBe('The SQLAlchemy docs');
    expect(spoken('Use TypeScript, not JavaScript!')).toBe('Use Type Script, not Java Script!');
  });

  it('handles acronym plurals', () => {
    expect(spoken('Several APIs and GPUs')).toBe('Several A P Is and G P Us');
  });

  it('spells out URLs and keeps trailing sentence punctuation', () => {
    expect(spoken('Visit https://example.com/docs-intro.')).toBe('Visit example dot com slash docs dash intro.');
    expect(spoken('Email me at dev@vireon.ai please')).toBe('Email me at dev at vireon dot ai please');
  });

  it('speaks numbers and symbols', () => {
    expect(spoken('Growth hit 50% in 2024.')).toBe('Growth hit 50 percent in 2024.');
    expect(spoken('It costs $5M or $1,200.')).toBe('It costs 5 million dollars or 1200 dollars.');
    expect(spoken('Pages 10-20 cover v2.1')).toBe('Pages 10 to 20 cover version 2 point 1');
    expect(spoken('Fast & simple, A + B')).toBe('Fast and simple, A plus B');
    expect(spoken('Takes ~5 minutes')).toBe('Takes about 5 minutes');
  });

  it('keeps the space after an amount that has no magnitude suffix', () => {
    expect(spoken('It costs $5 per hour and $2.50 each.')).toBe('It costs 5 dollars per hour and 2.50 dollars each.');
    expect(spoken('A $5 M fee')).toBe('A 5 million dollars fee');
  });

  it('leaves ISO dates alone', () => {
    expect(spoken('On 2024-10-07 we shipped.')).toBe('On 2024-10-07 we shipped.');
  });

  it('splits identifiers but not brand names', () => {
    expect(spoken('Call useState and get_user_name.')).toBe('Call use State and get user name.');
    expect(spoken('My iPhone and eBay')).toBe('My iPhone and eBay');
  });

  it('applies per-request overrides before the built-in dictionary', () => {
    expect(spoken('Vireon uses Node.js', { extraTerms: { Vireon: 'Veer ee on', 'Node.js': 'Node' } })).toBe('Veer ee on uses Node');
  });

  it('strips inline-code backticks', () => {
    expect(spoken('Run `npm install` now')).toBe('Run N P M install now');
  });
});

describe('wordMap', () => {
  it('maps every caption word to the spoken words it became', () => {
    const r = processText('Use MongoDB with Node.js.', { enabled: true });
    // original words: Use | MongoDB | with | Node.js.
    // spoken words:   Use | Mongo D B | with | Node JS.
    expect(r.spokenText).toBe('Use Mongo D B with Node JS.');
    expect(r.wordMap.map((w) => [w.text, w.spokenStart, w.spokenEnd])).toEqual([
      ['Use', 0, 0], ['MongoDB', 1, 3], ['with', 4, 4], ['Node.js.', 5, 6],
    ]);
    expect(r.spokenWordCount).toBe(7);
  });

  it('is one-to-one when nothing changes', () => {
    const r = processText('Plain words only', { enabled: true });
    expect(r.wordMap.map((w) => [w.spokenStart, w.spokenEnd])).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('maps a word that disappears to null', () => {
    const r = processText('Hello ` world', { enabled: true });
    expect(r.wordMap[1].text).toBe('`');
    expect(r.wordMap[1].spokenStart).toBeNull();
  });
});

describe('captionTokens', () => {
  it('splits like CaptionRenderer: whitespace, plus a break after a glued em/en dash', () => {
    expect(captionTokens('I was craving—our favourite  food').map((t) => t.text)).toEqual(['I', 'was', 'craving—', 'our', 'favourite', 'food']);
    expect(captionTokens('2020–2024 is a range').map((t) => t.text)).toEqual(['2020–', '2024', 'is', 'a', 'range']);
  });

  it('reports ranges into the original string', () => {
    const text = 'a  bc';
    for (const t of captionTokens(text)) expect(text.slice(t.start, t.end)).toBe(t.text);
  });
});
