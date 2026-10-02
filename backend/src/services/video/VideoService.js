// Split into videoService/{crud,statusUpdates,scenePipeline,lifecycle,
// resumeLogic}.js for maintainability - see videoService/index.js for how
// the pieces compose.
// NOTE: requires the explicit /index path - 'videoService' collides
// case-insensitively with this file's own name (VideoService.js) on
// Windows, which otherwise resolves back to this file instead of the
// subfolder and silently yields an empty object.
module.exports = require('./videoService/index');
