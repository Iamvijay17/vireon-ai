const courseQueue = require('../queues/courseQueue');

/**
 * Guards routes that enqueue course-video jobs. BullMQ happily accepts
 * jobs into Redis with no worker listening - they'd just sit "Queued"
 * forever with no feedback, and silently start processing whenever a
 * worker eventually comes online (surprising if the user didn't mean to
 * trigger that). Reject upfront instead so the frontend can show a clear
 * error and the user has to explicitly retry once the worker is up.
 */
const requireCourseWorker = async (req, res, next) => {
  try {
    const workers = await courseQueue.getWorkers();
    if (workers.length === 0) {
      return res.status(503).json({
        error: 'Course worker is not running. Start the course worker, then try again.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requireCourseWorker;
