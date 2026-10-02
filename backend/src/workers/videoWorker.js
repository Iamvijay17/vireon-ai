// Split into videoWorker/{shared,scriptStep,audioStep,avatarStep,renderStep,
// uploadStep,processor,index}.js for maintainability - see
// videoWorker/index.js for the Worker setup and videoWorker/processor.js
// for the 9-step pipeline.
// NOTE: requires the explicit /index path - 'videoWorker' collides with
// this file's own name (videoWorker.js) since require() tries
// './videoWorker.js' before descending into the subfolder, which
// otherwise resolves back to this file instead.
module.exports = require('./videoWorker/index');
