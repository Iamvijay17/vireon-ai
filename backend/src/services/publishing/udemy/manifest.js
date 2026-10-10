const { INSTRUCTOR_URL, HELP_URL, DOCS_URL } = require('./capabilities');

/**
 * The machine-readable course manifest and the human checklist that go into
 * the Udemy package. Both describe the SAME plan the validation report was
 * produced from, so what the instructor reads and what a script could parse
 * never disagree.
 */

const SCHEMA = 'vireon.udemy-course-package';
const SCHEMA_VERSION = 1;

const NOTICE =
  'This package was prepared by Vireon AI for manual upload. It does NOT create, upload to, or publish anything on Udemy - Udemy offers no public API for that. Follow PUBLISHING-CHECKLIST.md to create the course in Udemy\'s own instructor interface.';

/**
 * @param {object} plan        from buildCoursePlan
 * @param {object} validation  from validateCoursePlan
 * @param {object} [media]     path -> { sizeBytes, sha256 } for files actually in the package
 */
function buildManifest(plan, validation, { media = {}, generatedAt = new Date(), generator = {} } = {}) {
  const mediaFor = (file) => {
    if (!file?.path) return null;
    const m = media[file.path];
    return m ? { path: file.path, contentType: 'video/mp4', sizeBytes: m.sizeBytes, sha256: m.sha256 } : { path: file.path, contentType: 'video/mp4', included: false };
  };

  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date(generatedAt).toISOString(),
    generator: { name: 'Vireon AI', ...generator },
    notice: NOTICE,
    target: { platform: 'udemy', publishing: 'manual', instructorUrl: INSTRUCTOR_URL },
    course: plan.course,
    curriculum: {
      sections: plan.sections.map((section) => ({
        index: section.index,
        title: section.title,
        description: section.description,
        lectures: section.lectures.map((lec) => ({
          index: lec.index,
          id: lec.id,
          title: lec.title,
          description: lec.description,
          durationSeconds: lec.durationSeconds,
          video: lec.video.available ? mediaFor(lec.video) : null,
          captions: media[lec.video.captionPath] ? { path: lec.video.captionPath, format: 'srt', language: plan.course.language } : null,
        })),
      })),
    },
    promoVideo: plan.promo
      ? { id: plan.promo.id, title: plan.promo.title, durationSeconds: plan.promo.durationSeconds, video: plan.promo.video.available ? mediaFor(plan.promo.video) : null }
      : null,
    totals: validation.totals,
    validation: {
      ok: validation.ok,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
      report: 'validation-report.json',
    },
  };
}

/** The slice of the manifest that is purely course-level, as its own file. */
function buildCourseMetadata(plan) {
  return { schema: `${SCHEMA}/course`, schemaVersion: SCHEMA_VERSION, ...plan.course, promoVideoTitle: plan.promo?.title || null };
}

function renderChecklist(plan, validation) {
  const l = [];
  const blocking = validation.errors.length;
  l.push(`# Publishing "${plan.course.title || 'your course'}" on Udemy`);
  l.push('');
  l.push(`> ${NOTICE}`);
  l.push('');
  if (blocking) {
    l.push(`**This package is incomplete:** ${blocking} problem(s) in \`validation-report.json\` should be fixed first (missing lesson videos, metadata). It was exported anyway because you chose to.`);
    l.push('');
  }
  l.push('## Before you start');
  l.push(`- [ ] You have a Udemy instructor account: ${INSTRUCTOR_URL}`);
  l.push('- [ ] You own the content and the rights to everything in the videos (voice, images, music).');
  l.push('- [ ] Open `validation-report.json` - fix errors, read the warnings (Udemy\'s course-quality rules apply when you submit).');
  l.push('- [ ] Udemy\'s Help Center explains the current course requirements: ' + HELP_URL);
  l.push('');
  l.push('## 1. Create the course');
  l.push(`- [ ] In the instructor dashboard (${INSTRUCTOR_URL}) choose to create a new course and pick the course type.`);
  l.push('- [ ] Enter the **title**, **subtitle**, **description**, **language**, **level** and **category** from `course-metadata.json`.');
  l.push('- [ ] Add the **learning objectives**, **prerequisites** and **intended audience** from `course-metadata.json`.');
  l.push('');
  l.push('## 2. Build the curriculum');
  l.push('Create these sections and lectures in this order (the numbers match the file names):');
  l.push('');
  for (const section of plan.sections) {
    l.push(`- [ ] **Section ${section.index}: ${section.title}**`);
    for (const lec of section.lectures) {
      const state = lec.video.available ? `\`${lec.video.path}\`` : '_(video missing - render it first)_';
      l.push(`  - [ ] Lecture ${lec.index}: ${lec.title || '(untitled)'} - ${state}`);
    }
  }
  l.push('');
  l.push('## 3. Upload the media');
  l.push('- [ ] Upload each lecture\'s video from the `videos/` folder to the matching lecture.');
  l.push('- [ ] If the package has a `captions/` folder, add each `.srt` file as that lecture\'s captions.');
  if (plan.promo?.video.available) l.push('- [ ] Upload `promo/promo-video.mp4` as the course promotional video.');
  l.push('- [ ] Add a course image (and promo video, if you have one) on the course landing page.');
  l.push('');
  l.push('## 4. Review and submit');
  l.push('- [ ] Complete Udemy\'s pricing and messages pages.');
  l.push('- [ ] Use Udemy\'s own "Submit for review" step. Udemy reviews the course; Vireon cannot do this for you.');
  l.push('');
  l.push(`Reference: Udemy Instructor API docs (read-only API, no course creation): ${DOCS_URL}`);
  l.push('');
  return l.join('\n');
}

module.exports = { buildManifest, buildCourseMetadata, renderChecklist, NOTICE, SCHEMA, SCHEMA_VERSION };
