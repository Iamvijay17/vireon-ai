const JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  SCRIPT_GENERATION: 'SCRIPT_GENERATION',
  SCRIPT_COMPLETED: 'SCRIPT_COMPLETED',
  GENERATING_AUDIO: 'GENERATING_AUDIO',
  AUDIO_COMPLETED: 'AUDIO_COMPLETED',
  GENERATING_IMAGES: 'GENERATING_IMAGES',
  IMAGE_COMPLETED: 'IMAGE_COMPLETED',
  PREPARING_ASSETS: 'PREPARING_ASSETS',
  RENDERING: 'RENDERING',
  UPLOADING: 'UPLOADING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const COURSE_STATUS = Object.freeze({
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
});

const VIDEO_STATUS = Object.freeze({
  DRAFT: 'Draft',
  GENERATING_SCRIPT: 'Generating Script',
  SCRIPT_GENERATED: 'Script Generated',
  WAITING_FOR_APPROVAL: 'Waiting for Approval',
  APPROVED: 'Approved',
  GENERATING_AUDIO: 'Generating Audio',
  AUDIO_GENERATED: 'Audio Generated',
  GENERATING_SCENES: 'Generating Scenes',
  SCENES_GENERATED: 'Scenes Generated',
  GENERATING_IMAGES: 'Generating Images',
  IMAGES_GENERATED: 'Images Generated',
  RENDERING_VIDEO: 'Rendering Video',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
});

const JOB_STEPS = Object.freeze({
  [JOB_STATUS.SCRIPT_GENERATION]: { progress: 10, order: 1 },
  [JOB_STATUS.SCRIPT_COMPLETED]: { progress: 20, order: 2 },
  [JOB_STATUS.GENERATING_AUDIO]: { progress: 40, order: 3 },
  [JOB_STATUS.AUDIO_COMPLETED]: { progress: 50, order: 4 },
  [JOB_STATUS.GENERATING_IMAGES]: { progress: 55, order: 5 },
  [JOB_STATUS.IMAGE_COMPLETED]: { progress: 60, order: 6 },
  [JOB_STATUS.PREPARING_ASSETS]: { progress: 70, order: 7 },
  [JOB_STATUS.RENDERING]: { progress: 85, order: 8 },
  [JOB_STATUS.UPLOADING]: { progress: 95, order: 9 },
  [JOB_STATUS.COMPLETED]: { progress: 100, order: 10 },
  [JOB_STATUS.FAILED]: { progress: 0, order: 99 },
});

const VIDEO_TYPES = Object.freeze([
  'educational',
  'marketing',
  'story',
  'youtube_shorts',
  'podcast',
  'motivational',
  'business',
]);

const VIDEO_TYPES_LABEL = Object.freeze({
  educational: 'Educational',
  marketing: 'Marketing',
  story: 'Story',
  youtube_shorts: 'YouTube Shorts',
  podcast: 'Podcast',
  motivational: 'Motivational',
  business: 'Business',
});

const RESOLUTIONS = Object.freeze([
  '1920x1080',
  '1080x1920',
  '1280x720',
  '720x1280',
  '3840x2160',
  '2160x3840',
]);

const ASPECT_RATIOS = Object.freeze([
  '16:9',
  '9:16',
  '4:3',
  '1:1',
  '21:9',
]);

const VOICES = Object.freeze([
  'male-1',
  'male-2',
  'female-1',
  'female-2',
  'neutral-1',
]);

const LANGUAGES = Object.freeze([
  'english',
  'hindi',
  'spanish',
  'french',
  'german',
  'japanese',
  'korean',
]);

const TRANSITIONS = Object.freeze([
  'fade',
  'slide',
  'zoom',
  'dissolve',
  'wipe',
  'none',
]);

const CAMERA_MOTIONS = Object.freeze([
  'static',
  'pan-left',
  'pan-right',
  'zoom-in',
  'zoom-out',
  'tracking',
]);

const SOCKET_EVENTS = Object.freeze({
  JOB_CREATED: 'jobCreated',
  JOB_PROGRESS: 'jobProgress',
  JOB_COMPLETED: 'jobCompleted',
  JOB_FAILED: 'jobFailed',
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN: 'join',
  LEAVE: 'leave',
  // Course events
  COURSE_UPDATED: 'courseUpdated',
  COURSE_DELETED: 'courseDeleted',
  COURSE_VIDEO_CREATED: 'courseVideoCreated',
  COURSE_VIDEO_UPDATED: 'courseVideoUpdated',
  COURSE_VIDEO_DELETED: 'courseVideoDeleted',
  COURSE_VIDEO_PROGRESS: 'courseVideoProgress',
  COURSE_VIDEO_SCRIPT_READY: 'courseVideoScriptReady',
  COURSE_VIDEO_AUDIO_READY: 'courseVideoAudioReady',
  COURSE_VIDEO_RENDER_READY: 'courseVideoRenderReady',
});

const DEFAULT_SCENE_DURATION = 8;

const VIDEO_DURATIONS = Object.freeze([5, 10, 15]);

const CATEGORIES = Object.freeze([
  'Web Development',
  'Mobile Development',
  'Data Science',
  'Machine Learning',
  'DevOps',
  'Design',
  'Business',
  'Marketing',
  'Other',
]);

const DIFFICULTIES = Object.freeze([
  'Beginner',
  'Intermediate',
  'Advanced',
]);

module.exports = {
  JOB_STATUS,
  COURSE_STATUS,
  VIDEO_STATUS,
  JOB_STEPS,
  VIDEO_TYPES,
  VIDEO_TYPES_LABEL,
  RESOLUTIONS,
  ASPECT_RATIOS,
  VOICES,
  LANGUAGES,
  TRANSITIONS,
  CAMERA_MOTIONS,
  SOCKET_EVENTS,
  DEFAULT_SCENE_DURATION,
  VIDEO_DURATIONS,
  CATEGORIES,
  DIFFICULTIES,
};