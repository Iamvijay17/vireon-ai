jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
  llm: jest.fn(), tts: jest.fn(), render: jest.fn(), upload: jest.fn(),
}));
jest.mock('../../src/services/common/SocketService', () => ({}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn() }));
jest.mock('../../src/services/localAI', () => ({ gpu: { withGPU: (_name, fn) => fn() } }));

const { buildDirectorBrief } = require('../../src/services/course/courseVideo/scriptPipeline');

describe('buildDirectorBrief (course lessons through the Director)', () => {
  it('writes a lesson as its own style, scoped to its topic', () => {
    const { videoType, extraInstructions } = buildDirectorBrief({ title: 'Props', style: 'educational', isPromo: false });
    expect(videoType).toBe('educational');
    expect(extraInstructions).toContain('ONE lesson video from a larger course');
    expect(extraInstructions).toContain('Cover ONLY the specific topic');
    expect(extraInstructions.split('\n').every((line) => line.startsWith('- '))).toBe(true);
  });

  it('writes the promo trailer as marketing and tells the model to sell, not teach', () => {
    const { videoType, extraInstructions } = buildDirectorBrief({ title: 'React Basics', style: 'educational', isPromo: true });
    expect(videoType).toBe('marketing');
    expect(extraInstructions).toContain('PROMOTIONAL TRAILER');
    expect(extraInstructions).toContain('"React Basics"');
    expect(extraInstructions).toContain('call to action to enroll');
  });

  it('never lets a course video become a podcast (needs host/guest voices) or an unknown type', () => {
    expect(buildDirectorBrief({ style: 'podcast' }).videoType).toBe('educational');
    expect(buildDirectorBrief({ style: 'mystery' }).videoType).toBe('educational');
    expect(buildDirectorBrief({}).videoType).toBe('educational');
  });

  it('keeps another valid video type for a lesson', () => {
    expect(buildDirectorBrief({ style: 'business' }).videoType).toBe('business');
  });

  it('appends the instructor\'s additional instructions', () => {
    const { extraInstructions } = buildDirectorBrief({ style: 'educational', additionalInstructions: 'Use cooking analogies' });
    expect(extraInstructions).toContain('- Additional: Use cooking analogies');
  });
});
