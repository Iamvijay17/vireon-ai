// Split into audioService/{voiceCatalog,seeding,ttsClient,captionAlignment,
// sceneSynthesis,standaloneSynthesis}.js for maintainability - see
// audioService/index.js for how the pieces compose.
module.exports = require('./audioService/index');
