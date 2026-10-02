/**
 * READ-ONLY preview of what migrating VideoJob/CourseVideo into
 * Project/Render (Phase 5 scaffolding, see src/models/Project.js) would
 * actually produce - never writes anything, never calls .save()/.create()
 * on any model. Builds the equivalent Project+Render documents in memory,
 * validates them against the new schemas with .validateSync() (no DB
 * round-trip), and reports what maps cleanly vs. what a real migration
 * script would need to handle.
 *
 * This is the evidence-gathering step before committing to the Project/
 * Render shape for real - same role scripts/graphShadowRun.js played for
 * Phase 3's step graph.
 *
 * Usage: node scripts/projectRenderMigrationPreview.js [limit=25]
 */
const { connectDatabase } = require('../src/config/database');
const VideoJob = require('../src/models/VideoJob');
const CourseVideo = require('../src/models/CourseVideo');
const Project = require('../src/models/Project');
const Render = require('../src/models/Render');

function videoJobToProject(job) {
  return new Project({
    _id: job._id,
    kind: 'standalone',
    topic: job.topic,
    title: job.script?.title || '',
    type: job.type,
    language: job.language,
    voice: job.voice,
    hostVoice: job.hostVoice,
    guestVoice: job.guestVoice,
    hostName: job.hostName,
    guestName: job.guestName,
    duration: job.duration,
    resolution: job.resolution,
    quality: job.quality,
    aspectRatio: job.aspectRatio,
    fontPairing: job.fontPairing,
    captionAnimation: job.captionAnimation,
    fastGeneration: job.fastGeneration,
    fastAudio: job.fastAudio,
    avatarEnabled: job.avatarEnabled,
    avatarPosition: job.avatarPosition,
    script: job.script,
  });
}

function videoJobToRender(job) {
  return new Render({
    projectId: job._id,
    attemptNumber: 1,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    currentScene: job.currentScene,
    videoUrl: job.videoUrl,
    thumbnailUrl: job.thumbnailUrl,
    avatarVideoUrl: job.avatarVideoUrl,
    audioUrls: job.audioUrls,
    error: job.error,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    nextRetryAt: job.nextRetryAt,
    statusHistory: job.statusHistory,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    lastTransitionAt: job.lastTransitionAt,
  });
}

function courseVideoToProject(video) {
  return new Project({
    _id: video._id,
    kind: 'course-lesson',
    courseId: video.courseId,
    order: video.order,
    isPromo: video.isPromo,
    topic: video.topic,
    title: video.title,
    type: video.style,
    voice: video.voice,
    duration: video.duration,
    resolution: video.resolution,
    quality: video.quality,
    additionalInstructions: video.additionalInstructions,
    fastAudio: video.fastAudio,
    avatarEnabled: video.avatarEnabled,
    avatarPosition: video.avatarPosition,
    script: video.script,
  });
}

// CourseVideo has no single `status`/`progress`/`currentStep` field the
// way VideoJob does - it tracks three independent stage statuses
// (scriptStatus/audioStatus/videoStatus) plus a legacy combined `status`.
// Render's schema assumes one `status` string, so this is the first real
// "doesn't map cleanly" finding the preview surfaces on purpose rather
// than silently picking one field and dropping the other two.
function courseVideoToRender(video) {
  return new Render({
    projectId: video._id,
    attemptNumber: 1,
    status: video.status,
    progress: video.renderProgress,
    videoUrl: video.renderUrl,
    thumbnailUrl: '',
    avatarVideoUrl: video.avatarVideoUrl,
    audioUrls: video.audioUrl ? [video.audioUrl] : [],
    error: video.error,
    retryCount: video.retryCount,
    maxRetries: video.maxRetries,
    nextRetryAt: video.nextRetryAt,
    startedAt: video.scriptGeneratedAt,
    completedAt: video.renderedAt,
    failedAt: video.error?.failedAt || null,
  });
}

function validate(doc, label, issues) {
  const err = doc.validateSync();
  if (err) {
    for (const [field, e] of Object.entries(err.errors)) {
      issues.push(`${label}: ${field} - ${e.message}`);
    }
    return false;
  }
  return true;
}

async function main() {
  const limit = parseInt(process.argv[2], 10) || 25;

  const jobs = await VideoJob.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  const lessons = await CourseVideo.find({}).sort({ createdAt: -1 }).limit(limit).lean();

  console.log(`\nProject/Render migration preview (READ-ONLY - nothing is written)\n`);
  console.log(`Scanning ${jobs.length} VideoJob(s) and ${lessons.length} CourseVideo(s)\n`);

  const issues = [];
  let jobsOk = 0, lessonsOk = 0;
  // CourseVideo has three independent stage statuses that don't fold into
  // Render's single `status` field cleanly - counted separately since it's
  // the one structural gap this preview exists to surface, not a per-doc
  // validation failure.
  let lessonsWithDivergentStageStatus = 0;

  for (const job of jobs) {
    const project = videoJobToProject(job);
    const render = videoJobToRender(job);
    const projectOk = validate(project, `VideoJob ${job._id} -> Project`, issues);
    const renderOk = validate(render, `VideoJob ${job._id} -> Render`, issues);
    if (projectOk && renderOk) jobsOk++;
  }

  for (const video of lessons) {
    const project = courseVideoToProject(video);
    const render = courseVideoToRender(video);
    const projectOk = validate(project, `CourseVideo ${video._id} -> Project`, issues);
    const renderOk = validate(render, `CourseVideo ${video._id} -> Render`, issues);
    if (projectOk && renderOk) lessonsOk++;

    const stageStatuses = new Set([video.scriptStatus, video.audioStatus, video.videoStatus].filter(Boolean));
    if (stageStatuses.size > 1) lessonsWithDivergentStageStatus++;
  }

  console.log(`VideoJob -> Project+Render:    ${jobsOk}/${jobs.length} validate cleanly`);
  console.log(`CourseVideo -> Project+Render: ${lessonsOk}/${lessons.length} validate cleanly`);
  console.log(`CourseVideo docs whose 3 stage statuses disagree (script/audio/video status is lossy on a single Render.status): ${lessonsWithDivergentStageStatus}/${lessons.length}`);

  if (issues.length > 0) {
    console.log(`\n${issues.length} validation issue(s):`);
    for (const issue of issues.slice(0, 30)) console.log(`  ${issue}`);
    if (issues.length > 30) console.log(`  ... and ${issues.length - 30} more`);
  }

  if (jobs.length > 0) {
    console.log('\nSample VideoJob conversion (first result):');
    console.log(JSON.stringify(videoJobToProject(jobs[0]).toJSON(), null, 2).slice(0, 800) + '\n...(truncated)');
  }

  console.log('\nNothing was written to the database. Re-run anytime with a higher limit to check more history.\n');
  process.exit(0);
}

connectDatabase().then(main).catch((err) => {
  console.error('Preview failed:', err);
  process.exit(1);
});
