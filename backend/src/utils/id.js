const { customAlphabet } = require('nanoid');

// Uppercase alphanumeric random suffix, Stripe/Clerk-style ("prefix-RANDOM"),
// e.g. cou-A7K9P2XQ. Safe as a URL segment and as a backend/jobs/<id>
// directory name (only letters, digits, one hyphen).
const nanoid8 = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

// 36^8 (~2.8 trillion) possible suffixes per prefix - collisions are
// astronomically unlikely at this app's scale, so unlike a distributed
// system we don't retry on the rare theoretical clash; Mongo's unique _id
// index would simply reject the insert and surface as a normal error.
const withPrefix = (prefix) => `${prefix}-${nanoid8()}`;

// Three-letter prefix from each entity's own name - "cou"rse, "vid"eo,
// "job" (already 3 letters).
const generateCourseId = () => withPrefix('cou');
const generateVideoJobId = () => withPrefix('job');
const generateCourseVideoId = () => withPrefix('vid');

// Matches any id produced above - used to tell "already migrated" ids apart
// from legacy MongoDB ObjectId strings (and from earlier id styles used
// before this one) during the one-time id migration.
const ID_PATTERN = /^[a-z]{3}-[0-9A-Z]{8}$/;

module.exports = {
  generateCourseId,
  generateVideoJobId,
  generateCourseVideoId,
  ID_PATTERN,
};
