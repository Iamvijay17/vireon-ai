const { z } = require('zod');
const Course = require('../../../models/Course');
const CourseVideo = require('../../../models/CourseVideo');
const CoursePublishingProfile = require('../../../models/CoursePublishingProfile');
const { NotFoundError, SchemaValidationError } = require('../../../utils/errors');
const { CATEGORY_IDS } = require('../youtube/metadata');
const { idPatternFor } = require('../../../utils/id');

const lines = (max, label) =>
  z.array(z.string().trim().min(1).max(300)).max(max, `At most ${max} ${label}`).default([]);

const profileInputSchema = z.object({
  subtitle: z.string().trim().max(300).default(''),
  description: z.string().trim().max(10000).default(''),
  level: z.enum(['All Levels', 'Beginner', 'Intermediate', 'Expert']).default('All Levels'),
  learningObjectives: lines(30, 'learning objectives'),
  prerequisites: lines(30, 'prerequisites'),
  intendedAudience: lines(30, 'audience entries'),
  sections: z.array(z.object({
    title: z.string().trim().min(1, 'A section needs a title').max(200),
    description: z.string().trim().max(1000).default(''),
    lessonIds: z.array(z.string().regex(idPatternFor('vid'), 'Invalid lesson id')).max(500).default([]),
  })).max(60, 'At most 60 sections').default([]),
  youtubeDefaults: z.object({
    categoryId: z.string().refine((v) => CATEGORY_IDS.includes(v), 'Unknown category').default('27'),
    language: z.string().trim().regex(/^([a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*)?$/).default(''),
    tags: z.array(z.string().trim().min(1).max(100)).max(40).default([]),
    privacyStatus: z.enum(['private', 'unlisted', 'public']).default('private'),
    madeForKids: z.boolean().default(false),
  }).default({}),
});

async function getCourse(courseId) {
  const course = await Course.findById(courseId).lean();
  if (!course) throw new NotFoundError('Course not found');
  return course;
}

/** Course + profile + lessons as plain objects - the input of buildCoursePlan. */
async function loadCourseData(ownerId, courseId) {
  const course = await getCourse(courseId);
  const [profile, videos] = await Promise.all([
    CoursePublishingProfile.findOne({ _id: courseId, ownerId }).lean(),
    CourseVideo.find({ courseId }).sort({ order: 1 }).lean(),
  ]);
  return { course, profile: profile || null, videos };
}

async function saveProfile(ownerId, courseId, input) {
  const parsed = profileInputSchema.safeParse(input || {});
  if (!parsed.success) {
    throw new SchemaValidationError(parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  }
  await getCourse(courseId);
  const data = parsed.data;

  // A lesson may appear in one section only, and only if it belongs to this course.
  const valid = new Set((await CourseVideo.find({ courseId }).select('_id').lean()).map((v) => String(v._id)));
  const seen = new Set();
  const problems = [];
  data.sections.forEach((section, s) => {
    section.lessonIds.forEach((id) => {
      if (!valid.has(id)) problems.push({ field: `sections.${s}.lessonIds`, message: `Lesson ${id} is not part of this course` });
      else if (seen.has(id)) problems.push({ field: `sections.${s}.lessonIds`, message: `Lesson ${id} is in more than one section` });
      seen.add(id);
    });
  });
  if (problems.length) throw new SchemaValidationError(problems);

  return CoursePublishingProfile.findOneAndUpdate(
    { _id: courseId, ownerId },
    { $set: { ...data, ownerId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { loadCourseData, saveProfile, profileInputSchema, getCourse };
