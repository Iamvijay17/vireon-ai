const alignmentService = require('./alignmentService');
const timelineBuilder = require('./timelineBuilder');
const renderProps = require('./renderProps');
const schemas = require('./schemas');
const events = require('./events');

/**
 * Speech alignment + the canonical speech timeline. See docs/speech-alignment.md.
 *
 *   alignmentService  engine-independent alignment (alignAudio / alignClips)
 *   timelineBuilder   segments + alignments -> AudioTimeline
 *   renderProps       what Remotion receives (behind ENABLE_SPEECH_DRIVEN_ANIMATION)
 *   schemas           zod schemas + validateTimeline invariants
 *   events            job-level progress events (tts:start ... render:complete)
 */
module.exports = { ...alignmentService, ...timelineBuilder, ...renderProps, ...schemas, ...events };
