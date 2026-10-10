const { customAlphabet } = require('nanoid');

// Vireon resource id format: <prefix>-<lowercase-alphanumeric-id>, e.g.
// aud-btclnx2w. The suffix is [a-z0-9] only, so ids are safe as URL segments,
// MongoDB _id strings, Redis/BullMQ keys, MinIO object keys and file/directory
// names (backend/jobs/<id>) without any escaping.
//
// nanoid's customAlphabet draws from crypto.randomBytes, so this is a CSPRNG,
// not Math.random().
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 8;
const nanoid8 = customAlphabet(ALPHABET, ID_LENGTH);

// 36^8 (~2.8 trillion) possible suffixes per prefix - collisions are
// astronomically unlikely at this app's scale, so unlike a distributed
// system we don't retry on the rare theoretical clash; Mongo's unique _id
// index would simply reject the insert and surface as a normal error.

// Resource name -> id prefix. Every generator below goes through this map.
// Only resources that actually own an id are listed; add a row here (and
// document it in README "Resource IDs") when a new persisted resource needs one.
// Prefixes are the ones already in use - they were not renamed, so a given
// resource keeps a single prefix across old (uppercase) and new (lowercase) ids.
const PREFIXES = Object.freeze({
  audio: 'aud', // standalone audio generation (Audio Studio)
  image: 'img', // standalone image generation (Image Studio)
  job: 'job', // video job (VideoJob / Project)
  video: 'vid', // course video
  scene: 'sce', // scene
  course: 'cou', // course
  curriculum: 'crc', // course curriculum
  favoriteVoice: 'fav', // favourite voice
  platformAccount: 'pac', // connected publishing account (YouTube channel)
  publishingJob: 'pub', // publishing job (YouTube upload / Udemy package)
});

const PREFIX_VALUES = new Set(Object.values(PREFIXES));

/**
 * The one place new resource ids are made.
 * @param {string} prefix a prefix from PREFIXES, e.g. "aud"
 * @returns {string} e.g. "aud-btclnx2w"
 */
const generateId = (prefix) => {
  if (!PREFIX_VALUES.has(prefix)) throw new Error(`Unknown id prefix: ${prefix}`);
  return `${prefix}-${nanoid8()}`;
};

const generateCourseId = () => generateId(PREFIXES.course);
const generateVideoJobId = () => generateId(PREFIXES.job);
const generateCourseVideoId = () => generateId(PREFIXES.video);
const generateSceneId = () => generateId(PREFIXES.scene);
const generateFavoriteVoiceId = () => generateId(PREFIXES.favoriteVoice);
const generateAudioGenerationId = () => generateId(PREFIXES.audio);
const generateCourseCurriculumId = () => generateId(PREFIXES.curriculum);
const generateImageGenerationId = () => generateId(PREFIXES.image);
const generatePlatformAccountId = () => generateId(PREFIXES.platformAccount);
const generatePublishingJobId = () => generateId(PREFIXES.publishingJob);

// Ids minted before the lowercase switch were uppercase ("aud-BTCLNX2W") and
// are still stored in Mongo, MinIO keys, URLs and the frontend. They are NOT
// migrated and must keep working, so every validator accepts both shapes.
// A suffix is either all-lowercase or all-uppercase - mixed case is rejected
// so a typo can't silently address a different resource.
const SUFFIX = `(?:[0-9a-z]{${ID_LENGTH}}|[0-9A-Z]{${ID_LENGTH}})`;

// Matches any id produced above (new lowercase or legacy uppercase). Also used
// to tell "already migrated" ids apart from legacy MongoDB ObjectId strings
// during the one-time id migration, and to vet socket room names.
const ID_PATTERN = new RegExp(`^[a-z]{3}-${SUFFIX}$`);

// Strict: only what generateId produces today. Use in tests / when asserting
// freshly generated ids - NOT for validating request input (see ID_PATTERN).
const NEW_ID_PATTERN = new RegExp(`^[a-z]{3}-[0-9a-z]{${ID_LENGTH}}$`);

// Prefix-scoped matcher for request validation, e.g. idPatternFor('aud')
// accepts "aud-btclnx2w" and the legacy "aud-BTCLNX2W".
const idPatternFor = (prefix) => {
  if (!PREFIX_VALUES.has(prefix)) throw new Error(`Unknown id prefix: ${prefix}`);
  return new RegExp(`^${prefix}-${SUFFIX}$`);
};

const isValidId = (value, prefix) =>
  typeof value === 'string' && (prefix ? idPatternFor(prefix) : ID_PATTERN).test(value);

// True for pre-lowercase ids that contain uppercase letters.
const isLegacyId = (value) => typeof value === 'string' && ID_PATTERN.test(value) && value !== value.toLowerCase();

module.exports = {
  PREFIXES,
  generateId,
  generateCourseId,
  generateVideoJobId,
  generateCourseVideoId,
  generateSceneId,
  generateFavoriteVoiceId,
  generateAudioGenerationId,
  generateCourseCurriculumId,
  generateImageGenerationId,
  generatePlatformAccountId,
  generatePublishingJobId,
  ID_PATTERN,
  NEW_ID_PATTERN,
  idPatternFor,
  isValidId,
  isLegacyId,
};
