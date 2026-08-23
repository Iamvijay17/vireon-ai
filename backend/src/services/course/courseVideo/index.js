const { CourseVideoCancelledError, bailIfCancelled } = require('./shared');
const crud = require('./crud');
const scriptPipeline = require('./scriptPipeline');
const audioPipeline = require('./audioPipeline');
const renderPipeline = require('./renderPipeline');
const { retryStep } = require('./retry');

/**
 * Service for managing course videos.
 * Single Responsibility: Course video CRUD and generation pipeline.
 *
 * Split across crud.js (management), scriptPipeline.js, audioPipeline.js
 * and renderPipeline.js (the three generation stages), and retry.js (the
 * cross-stage retry dispatcher) - this file just composes their exports
 * into the one object every caller (controllers, workers, CourseService)
 * requires as CourseVideoService.
 */
module.exports = {
  ...crud,
  ...scriptPipeline,
  ...audioPipeline,
  ...renderPipeline,
  retryStep,
  CourseVideoCancelledError,
  bailIfCancelled,
};
