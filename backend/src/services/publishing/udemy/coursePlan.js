const { VIDEO_STATUS, STAGE_STATUS } = require('../../../constants');

/**
 * Turns a course + its publishing profile + its lessons into one ordered,
 * Udemy-shaped plan (sections -> lectures), and checks that plan.
 *
 * Pure functions over plain data - no database, no storage - so the same code
 * serves the live "validation report" endpoint, the package builder and the
 * tests.
 *
 * The thresholds below are Udemy's published course-quality guidance as it was
 * understood when this was written. Udemy changes them, so they are ADVISORY
 * warnings here and never block an export; only structural problems (a lesson
 * with no video, no title, nothing to export) are errors.
 */

const GUIDELINES = Object.freeze({
  titleMaxChars: 60,
  subtitleMaxChars: 120,
  descriptionMinWords: 200,
  minLearningObjectives: 4,
  minLectures: 5,
  minVideoMinutes: 30,
});

const UNASSIGNED_SECTION = 'Unassigned lessons';
const DEFAULT_SECTION = 'Course content';

const slug = (text, fallback = 'item') =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;

const pad = (n) => String(n).padStart(2, '0');
const wordCount = (text) => (String(text || '').trim().match(/\S+/g) || []).length;

const hasRender = (video) =>
  Boolean(video.renderUrl) && (video.videoStatus === STAGE_STATUS.COMPLETED || video.status === VIDEO_STATUS.COMPLETED);

function lessonFromVideo(video, { sectionIndex, index }) {
  const available = hasRender(video);
  const base = `${pad(sectionIndex)}-${pad(index)}-${slug(video.title, 'lesson')}`;
  return {
    id: String(video._id),
    index,
    title: String(video.title || '').trim(),
    description: String(video.script?.description || video.topic || '').trim(),
    durationSeconds: video.audioDuration > 0 ? Math.round(video.audioDuration) : null,
    hasCaptions: Array.isArray(video.script?.scenes) && video.script.scenes.some((s) => s?.audio?.captionTimestamps?.length),
    video: {
      available,
      renderUrl: available ? video.renderUrl : '',
      path: available ? `videos/${base}.mp4` : null,
      captionPath: `captions/${base}.srt`,
    },
  };
}

/**
 * @param {object} p
 * @param {object} p.course   { _id, title, description, category, language, difficulty }
 * @param {object} [p.profile] CoursePublishingProfile (plain)
 * @param {object[]} p.videos CourseVideo documents (plain), any order
 */
function buildCoursePlan({ course, profile = {}, videos = [] }) {
  const ordered = [...videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const promo = ordered.find((v) => v.isPromo) || null;
  const lessonVideos = ordered.filter((v) => !v.isPromo);
  const byId = new Map(lessonVideos.map((v) => [String(v._id), v]));
  const unknownLessonIds = [];

  let groups;
  if (Array.isArray(profile.sections) && profile.sections.length) {
    const placed = new Set();
    groups = profile.sections.map((section) => {
      const items = [];
      for (const id of section.lessonIds || []) {
        const video = byId.get(String(id));
        if (!video) unknownLessonIds.push(String(id));
        else if (!placed.has(String(id))) {
          placed.add(String(id));
          items.push(video);
        }
      }
      return { title: section.title, description: section.description || '', videos: items };
    });
    const leftover = lessonVideos.filter((v) => !placed.has(String(v._id)));
    if (leftover.length) groups.push({ title: UNASSIGNED_SECTION, description: '', videos: leftover, synthetic: true });
  } else {
    groups = [{ title: DEFAULT_SECTION, description: '', videos: lessonVideos, synthetic: true }];
  }

  const sections = groups.map((group, s) => ({
    index: s + 1,
    title: group.title,
    description: group.description,
    synthetic: Boolean(group.synthetic),
    lectures: group.videos.map((video, i) => lessonFromVideo(video, { sectionIndex: s + 1, index: i + 1 })),
  }));

  const promoLesson = promo
    ? {
        id: String(promo._id),
        title: String(promo.title || 'Promo video').trim(),
        durationSeconds: promo.audioDuration > 0 ? Math.round(promo.audioDuration) : null,
        video: hasRender(promo)
          ? { available: true, renderUrl: promo.renderUrl, path: 'promo/promo-video.mp4' }
          : { available: false, renderUrl: '', path: null },
      }
    : null;

  return {
    course: {
      id: String(course._id),
      title: String(course.title || '').trim(),
      subtitle: String(profile.subtitle || '').trim(),
      description: String(profile.description || course.description || '').trim(),
      language: course.language || 'english',
      category: course.category || '',
      level: profile.level || 'All Levels',
      learningObjectives: (profile.learningObjectives || []).map((s) => String(s).trim()).filter(Boolean),
      prerequisites: (profile.prerequisites || []).map((s) => String(s).trim()).filter(Boolean),
      intendedAudience: (profile.intendedAudience || []).map((s) => String(s).trim()).filter(Boolean),
    },
    sections,
    promo: promoLesson,
    unknownLessonIds,
  };
}

const issue = (severity, code, message, where = null) => ({ severity, code, message, ...(where ? { where } : {}) });

/** Everything wrong with (or worth knowing about) a plan: { ok, errors[], warnings[], info[] }. */
function validateCoursePlan(plan) {
  const out = [];
  const { course, sections } = plan;
  const lectures = sections.flatMap((s) => s.lectures.map((l) => ({ ...l, section: s.title })));

  // ── structural errors: the package cannot be used as-is ──
  if (!course.title) out.push(issue('error', 'COURSE_TITLE_MISSING', 'The course has no title.'));
  if (!course.description) out.push(issue('error', 'COURSE_DESCRIPTION_MISSING', 'Add a course description - Udemy requires one.', 'course.description'));
  if (!course.subtitle) out.push(issue('error', 'COURSE_SUBTITLE_MISSING', 'Add a course subtitle (headline) - Udemy requires one.', 'course.subtitle'));
  if (!lectures.length) out.push(issue('error', 'NO_LESSONS', 'The course has no lessons to export.'));
  if (!course.learningObjectives.length) out.push(issue('error', 'OBJECTIVES_MISSING', 'Add at least one learning objective.', 'course.learningObjectives'));

  for (const lec of lectures) {
    const where = `${lec.section} > ${lec.title || `lesson ${lec.index}`}`;
    if (!lec.title) out.push(issue('error', 'LESSON_TITLE_MISSING', 'A lesson has no title.', where));
    if (!lec.video.available) out.push(issue('error', 'LESSON_VIDEO_MISSING', 'This lesson has no rendered video yet. Render it first.', where));
  }
  for (const id of plan.unknownLessonIds) {
    out.push(issue('warning', 'SECTION_REFERENCES_MISSING_LESSON', `A section refers to lesson ${id}, which no longer exists. It was skipped.`));
  }
  for (const section of sections) {
    if (!section.lectures.length && !section.synthetic) {
      out.push(issue('warning', 'SECTION_EMPTY', 'This section has no lessons and will be left empty in the package.', section.title));
    }
  }

  // ── Udemy course-quality guidance: advisory only ──
  if (course.title.length > GUIDELINES.titleMaxChars) {
    out.push(issue('warning', 'TITLE_TOO_LONG', `Udemy limits course titles to about ${GUIDELINES.titleMaxChars} characters (this one is ${course.title.length}).`, 'course.title'));
  }
  if (course.subtitle.length > GUIDELINES.subtitleMaxChars) {
    out.push(issue('warning', 'SUBTITLE_TOO_LONG', `Udemy limits subtitles to about ${GUIDELINES.subtitleMaxChars} characters (this one is ${course.subtitle.length}).`, 'course.subtitle'));
  }
  const words = wordCount(course.description);
  if (course.description && words < GUIDELINES.descriptionMinWords) {
    out.push(issue('warning', 'DESCRIPTION_SHORT', `Udemy recommends at least ${GUIDELINES.descriptionMinWords} words in the description (this one has ${words}).`, 'course.description'));
  }
  if (course.learningObjectives.length && course.learningObjectives.length < GUIDELINES.minLearningObjectives) {
    out.push(issue('warning', 'FEW_OBJECTIVES', `Udemy asks for at least ${GUIDELINES.minLearningObjectives} learning objectives (you have ${course.learningObjectives.length}).`, 'course.learningObjectives'));
  }
  const totalMinutes = lectures.reduce((sum, l) => sum + (l.durationSeconds || 0), 0) / 60;
  if (lectures.length && lectures.length < GUIDELINES.minLectures) {
    out.push(issue('warning', 'FEW_LECTURES', `Udemy expects at least ${GUIDELINES.minLectures} lectures to publish (you have ${lectures.length}).`));
  }
  if (lectures.length && totalMinutes < GUIDELINES.minVideoMinutes) {
    out.push(issue('warning', 'SHORT_COURSE', `Udemy expects at least ${GUIDELINES.minVideoMinutes} minutes of video to publish (about ${Math.round(totalMinutes)} here).`));
  }

  // ── nice-to-haves ──
  if (!course.prerequisites.length) out.push(issue('info', 'PREREQUISITES_EMPTY', 'No prerequisites listed - Udemy asks for them on the course page.', 'course.prerequisites'));
  if (!course.intendedAudience.length) out.push(issue('info', 'AUDIENCE_EMPTY', 'No intended audience listed - Udemy asks for it on the course page.', 'course.intendedAudience'));
  if (!plan.promo) out.push(issue('info', 'NO_PROMO', 'No promo video. Udemy lets you add one on the course landing page.'));
  else if (!plan.promo.video.available) out.push(issue('warning', 'PROMO_NOT_RENDERED', 'The promo video has not been rendered, so it is left out of the package.'));
  const undescribed = lectures.filter((l) => !l.description).length;
  if (undescribed) out.push(issue('info', 'LESSON_DESCRIPTIONS_MISSING', `${undescribed} lesson(s) have no description.`));
  const uncaptioned = lectures.filter((l) => l.video.available && !l.hasCaptions).length;
  if (uncaptioned) out.push(issue('info', 'CAPTIONS_UNAVAILABLE', `${uncaptioned} lesson(s) have no timed captions, so no .srt file can be generated for them.`));

  const errors = out.filter((i) => i.severity === 'error');
  return {
    ok: errors.length === 0,
    errors,
    warnings: out.filter((i) => i.severity === 'warning'),
    info: out.filter((i) => i.severity === 'info'),
    totals: {
      sections: sections.length,
      lectures: lectures.length,
      lecturesWithVideo: lectures.filter((l) => l.video.available).length,
      totalMinutes: Math.round(totalMinutes * 10) / 10,
    },
  };
}

module.exports = { buildCoursePlan, validateCoursePlan, GUIDELINES, slug, wordCount, UNASSIGNED_SECTION, DEFAULT_SECTION };
