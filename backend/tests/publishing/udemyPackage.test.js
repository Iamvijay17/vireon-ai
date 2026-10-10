jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { buildCoursePlan, validateCoursePlan, GUIDELINES, slug } = require('../../src/services/publishing/udemy/coursePlan');
const { buildManifest, renderChecklist, NOTICE } = require('../../src/services/publishing/udemy/manifest');
const { buildPackage } = require('../../src/services/publishing/udemy/buildPackage');
const { UDEMY_CAPABILITIES } = require('../../src/services/publishing/udemy/capabilities');

const render = (id) => `http://127.0.0.1:9000/vireon-video/${id}/final.mp4`;
const words = (text) => text.split(' ').map((word, i) => ({ word, start: i * 0.4, end: i * 0.4 + 0.35 }));

const course = { _id: 'cou-aaaaaaaa', title: 'Learn JavaScript Properly', description: 'Fallback description', language: 'english', category: 'Web Development' };
const video = (n, over = {}) => ({
  _id: `vid-0000000${n}`, courseId: course._id, title: `Lesson ${n}: Topic`, order: n, topic: `Topic ${n}`,
  renderUrl: render(`vid-0000000${n}`), videoStatus: 'Completed', status: 'Completed', audioDuration: 360,
  script: { description: `About lesson ${n}`, scenes: [{ duration: 4, audio: { text: 'Hello there world.', captionTimestamps: words('Hello there world.') } }] },
  ...over,
});
const longText = Array.from({ length: 220 }, (_, i) => `word${i}`).join(' ');
const goodProfile = {
  subtitle: 'From zero to confident', description: longText, level: 'Beginner',
  learningObjectives: ['One', 'Two', 'Three', 'Four'], prerequisites: ['A computer'], intendedAudience: ['Beginners'],
  sections: [
    { title: 'Getting started', description: '', lessonIds: ['vid-00000001', 'vid-00000002'] },
    { title: 'Going deeper', description: '', lessonIds: ['vid-00000003', 'vid-00000004', 'vid-00000005'] },
  ],
};
const videos = () => [1, 2, 3, 4, 5].map((n) => video(n)).concat([video(9, { isPromo: true, order: 0, title: 'Trailer' })]);

describe('course plan', () => {
  it('groups lessons into the profile\'s sections, in order, and pulls the promo out', () => {
    const plan = buildCoursePlan({ course, profile: goodProfile, videos: videos() });
    expect(plan.sections.map((s) => [s.title, s.lectures.map((l) => l.index)])).toEqual([['Getting started', [1, 2]], ['Going deeper', [1, 2, 3]]]);
    expect(plan.promo).toMatchObject({ title: 'Trailer' });
    expect(plan.sections[0].lectures[0].video.path).toBe('videos/01-01-lesson-1-topic.mp4');
    expect(plan.sections[1].lectures[0].video.path).toBe('videos/02-01-lesson-3-topic.mp4');
    expect(plan.course.description).toBe(longText); // profile wins over the course's short description
  });

  it('falls back to a single section, and parks lessons the sections forgot', () => {
    expect(buildCoursePlan({ course, profile: {}, videos: videos() }).sections.map((s) => s.title)).toEqual(['Course content']);
    const partial = buildCoursePlan({ course, profile: { sections: [{ title: 'Only', lessonIds: ['vid-00000001'] }] }, videos: videos() });
    expect(partial.sections.map((s) => s.title)).toEqual(['Only', 'Unassigned lessons']);
    expect(partial.sections[1].lectures).toHaveLength(4);
  });

  it('slugs file names safely (no path tricks, no empty names)', () => {
    expect(slug('../../Évil / Title?!')).toBe('evil-title');
    expect(slug('???', 'lesson')).toBe('lesson');
  });
});

describe('validation report', () => {
  const report = (profile, vids = videos()) => validateCoursePlan(buildCoursePlan({ course, profile, videos: vids }));

  it('passes a complete course with no errors or warnings', () => {
    const r = report(goodProfile);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.totals).toMatchObject({ sections: 2, lectures: 5, lecturesWithVideo: 5, totalMinutes: 30 });
  });

  it('flags missing required metadata as errors', () => {
    const r = report({});
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['COURSE_SUBTITLE_MISSING', 'OBJECTIVES_MISSING']));
    expect(r.errors.map((e) => e.code)).not.toContain('COURSE_DESCRIPTION_MISSING'); // falls back to the course description
  });

  it('names every lesson that has no rendered video, with where it is', () => {
    const vids = videos();
    vids[1] = video(2, { renderUrl: '', videoStatus: 'Pending', status: 'Draft' });
    const r = report(goodProfile, vids);
    const missing = r.errors.filter((e) => e.code === 'LESSON_VIDEO_MISSING');
    expect(r.ok).toBe(false);
    expect(missing).toHaveLength(1);
    expect(missing[0].where).toBe('Getting started > Lesson 2: Topic');
    expect(r.totals.lecturesWithVideo).toBe(4);
  });

  it('reports an empty course', () => {
    const r = report(goodProfile, []);
    expect(r.errors.map((e) => e.code)).toContain('NO_LESSONS');
  });

  it('keeps Udemy\'s quality guidance as advisory warnings, never blockers', () => {
    const r = report({ ...goodProfile, subtitle: 'x'.repeat(GUIDELINES.subtitleMaxChars + 1), description: 'too short', learningObjectives: ['One'] });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['SUBTITLE_TOO_LONG', 'DESCRIPTION_SHORT', 'FEW_OBJECTIVES']));
  });

  it('warns about too few / too short lectures and long titles', () => {
    const r = validateCoursePlan(buildCoursePlan({ course: { ...course, title: 'T'.repeat(80) }, profile: goodProfile, videos: [video(1, { audioDuration: 60 })] }));
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['TITLE_TOO_LONG', 'FEW_LECTURES', 'SHORT_COURSE']));
  });

  it('warns when a section references a lesson that no longer exists', () => {
    const r = report({ ...goodProfile, sections: [{ title: 'S', lessonIds: ['vid-00000001', 'vid-99999999'] }] });
    expect(r.warnings.map((w) => w.code)).toContain('SECTION_REFERENCES_MISSING_LESSON');
  });

  it('notes lessons without captions or descriptions as information', () => {
    const vids = videos();
    vids[0] = video(1, { script: { description: '', scenes: [{ duration: 4, audio: { text: 'x' } }] }, topic: '' });
    const r = report(goodProfile, vids);
    expect(r.info.map((i) => i.code)).toEqual(expect.arrayContaining(['CAPTIONS_UNAVAILABLE', 'LESSON_DESCRIPTIONS_MISSING']));
  });
});

describe('manifest and checklist', () => {
  const plan = buildCoursePlan({ course, profile: goodProfile, videos: videos() });
  const validation = validateCoursePlan(plan);

  it('is machine-readable and states plainly that nothing is published', () => {
    const manifest = buildManifest(plan, validation, { generatedAt: new Date('2026-10-10T00:00:00Z') });
    expect(manifest).toMatchObject({ schema: 'vireon.udemy-course-package', schemaVersion: 1, generatedAt: '2026-10-10T00:00:00.000Z', target: { platform: 'udemy', publishing: 'manual' } });
    expect(manifest.notice).toBe(NOTICE);
    expect(manifest.notice).toMatch(/does NOT create, upload to, or publish anything on Udemy/);
    expect(manifest.curriculum.sections[0].lectures[0]).toMatchObject({ index: 1, id: 'vid-00000001', title: 'Lesson 1: Topic', durationSeconds: 360 });
    expect(manifest.validation).toMatchObject({ ok: true, errors: 0, report: 'validation-report.json' });
    expect(JSON.stringify(manifest)).not.toMatch(/127\.0\.0\.1|renderUrl|vireon-video/); // no internal storage locations
  });

  it('gives a manual checklist that links to Udemy\'s own instructor interface', () => {
    const md = renderChecklist(plan, validation);
    expect(md).toContain('https://www.udemy.com/instructor/');
    expect(md).toContain('does NOT create');
    expect(md).toContain('Lecture 1: Lesson 1: Topic');
    expect(md).toContain('videos/01-01-lesson-1-topic.mp4');
    expect(md).toMatch(/Submit for review/);
  });

  it('warns on the checklist when exported with problems', () => {
    const bad = buildCoursePlan({ course, profile: {}, videos: videos() });
    expect(renderChecklist(bad, validateCoursePlan(bad))).toMatch(/This package is incomplete/);
  });
});

describe('capabilities', () => {
  it('states the verified Udemy position without inventing endpoints', () => {
    expect(UDEMY_CAPABILITIES.directPublishing).toBe(false);
    expect(UDEMY_CAPABILITIES.requiresCredentials).toBe(false);
    expect(UDEMY_CAPABILITIES.officialApi.docsUrl).toBe('https://www.udemy.com/developers/instructor/');
    expect(UDEMY_CAPABILITIES.officialApi.documentedCapabilities.join(' ')).toMatch(/Read/);
    expect(UDEMY_CAPABILITIES.summary).toMatch(/does not create or publish anything on Udemy/);
    expect(Object.isFrozen(UDEMY_CAPABILITIES)).toBe(true);
  });
});

/** Minimal ZIP reader (central directory) so the test can look inside the real archive. */
function readZip(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const entries = {};
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(p + 10);
    const compSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + compSize);
    entries[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe('package ZIP', () => {
  let dir;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-udemy-test-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const contentOf = (url) => Buffer.from(`MP4-BYTES-FOR-${url}`.repeat(50));
  const storage = {
    parsePublicUrl: (url) => ({ bucket: 'b', key: url }),
    getObjectStream: jest.fn(async (_b, key) => Readable.from([contentOf(key)])),
  };

  const build = async (over = {}) => {
    const vids = videos();
    const plan = buildCoursePlan({ course, profile: goodProfile, videos: vids });
    const validation = validateCoursePlan(plan);
    const outFile = path.join(dir, `pkg-${Math.random().toString(36).slice(2)}.zip`);
    const result = await buildPackage({ plan, validation, videos: vids, storage, outFile, generator: { version: 'test' }, ...over });
    return { plan, validation, result, zip: readZip(fs.readFileSync(outFile)), outFile };
  };

  it('contains the manifest, metadata, report, checklist and organised media with correct hashes', async () => {
    const { zip, result } = await build();
    const names = Object.keys(zip);
    expect(names).toEqual(expect.arrayContaining([
      'manifest.json', 'course-metadata.json', 'validation-report.json', 'PUBLISHING-CHECKLIST.md', 'README.txt',
      'promo/promo-video.mp4', 'videos/01-01-lesson-1-topic.mp4', 'videos/02-03-lesson-5-topic.mp4',
      'captions/01-01-lesson-1-topic.srt',
    ]));
    expect(names.filter((n) => n.startsWith('videos/') && n.endsWith('.mp4'))).toHaveLength(5);

    const manifest = JSON.parse(zip['manifest.json'].toString());
    const first = manifest.curriculum.sections[0].lectures[0];
    const expected = crypto.createHash('sha256').update(contentOf(render('vid-00000001'))).digest('hex');
    expect(first.video).toMatchObject({ path: 'videos/01-01-lesson-1-topic.mp4', sha256: expected, sizeBytes: contentOf(render('vid-00000001')).length });
    expect(zip['videos/01-01-lesson-1-topic.mp4'].equals(contentOf(render('vid-00000001')))).toBe(true);
    expect(first.captions.path).toBe('captions/01-01-lesson-1-topic.srt');
    expect(zip['captions/01-01-lesson-1-topic.srt'].toString()).toMatch(/Hello there world\./);
    expect(manifest.notice).toMatch(/does NOT create/);
    expect(zip['README.txt'].toString()).toMatch(/does NOT create/);
    expect(JSON.parse(zip['validation-report.json'].toString())).toMatchObject({ ok: true });
    expect(result.manifest.generatedAt).toBe(manifest.generatedAt);
  });

  it('can leave the media out (manifest-only package)', async () => {
    const { zip } = await build({ includeMedia: false });
    expect(Object.keys(zip).some((n) => n.endsWith('.mp4'))).toBe(false);
    const manifest = JSON.parse(zip['manifest.json'].toString());
    expect(manifest.curriculum.sections[0].lectures[0].video).toMatchObject({ path: 'videos/01-01-lesson-1-topic.mp4', included: false });
  });

  it('omits captions that are not voice-aligned rather than shipping wrong timing', async () => {
    const { zip } = await build({ includeCaptions: false });
    expect(Object.keys(zip).some((n) => n.endsWith('.srt'))).toBe(false);
  });

  it('stops and cleans up when cancelled', async () => {
    const outFile = path.join(dir, 'cancelled.zip');
    const plan = buildCoursePlan({ course, profile: goodProfile, videos: videos() });
    await expect(buildPackage({
      plan, validation: validateCoursePlan(plan), videos: videos(), storage, outFile, isCancelled: async () => true,
    })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it('cleans up the partial file when storage fails mid-way', async () => {
    const outFile = path.join(dir, 'broken.zip');
    const plan = buildCoursePlan({ course, profile: goodProfile, videos: videos() });
    const broken = { ...storage, getObjectStream: jest.fn(async () => { throw new Error('minio down'); }) };
    await expect(buildPackage({ plan, validation: validateCoursePlan(plan), videos: videos(), storage: broken, outFile })).rejects.toThrow('minio down');
    expect(fs.existsSync(outFile)).toBe(false);
  });
});
