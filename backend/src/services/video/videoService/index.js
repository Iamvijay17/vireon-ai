const crud = require('./crud');
const statusUpdates = require('./statusUpdates');
const { regenerateSceneAudio } = require('./scenePipeline');
const lifecycle = require('./lifecycle');
const resumeLogic = require('./resumeLogic');

/**
 * Service for managing video jobs.
 * Single Responsibility: Video job CRUD and lifecycle management.
 *
 * Split across crud.js (CRUD), statusUpdates.js (per-field job updates),
 * scenePipeline.js (single-scene audio regen), lifecycle.js (stop/restart/
 * approve/rerender/regenerate) and resumeLogic.js (resume-step mapping) -
 * this file composes their exports into the one object every caller
 * requires as VideoService.
 */
module.exports = {
  ...crud,
  ...statusUpdates,
  regenerateSceneAudio,
  ...lifecycle,
  ...resumeLogic,
};
