const config = require('../../../../config');

/**
 * Job-level progress events for the speech-timing pipeline. One Socket.IO
 * channel (`speechStage`) carries them all; the `event` field is the stage:
 *
 *   tts:start  tts:complete
 *   alignment:start  alignment:progress  alignment:complete
 *   timeline:complete
 *   render:start  render:complete
 *
 * Normal users only ever see the friendly labels below; the raw event names
 * and counters are for developers.
 */
const SPEECH_EVENTS = Object.freeze({
  TTS_START: 'tts:start',
  TTS_COMPLETE: 'tts:complete',
  ALIGNMENT_START: 'alignment:start',
  ALIGNMENT_PROGRESS: 'alignment:progress',
  ALIGNMENT_COMPLETE: 'alignment:complete',
  TIMELINE_COMPLETE: 'timeline:complete',
  RENDER_START: 'render:start',
  RENDER_COMPLETE: 'render:complete',
});

const SPEECH_EVENT_LABELS = Object.freeze({
  'tts:start': 'Generating voice...',
  'tts:complete': 'Voice generated',
  'alignment:start': 'Analyzing speech timing...',
  'alignment:progress': 'Analyzing speech timing...',
  'alignment:complete': 'Speech timing analyzed',
  'timeline:complete': 'Timeline ready',
  'render:start': 'Rendering video...',
  'render:complete': 'Video rendered',
});

/** Off means off: with speech alignment disabled nothing here is emitted, so the UI is unchanged. */
const speechEventsEnabled = () => config.speech.alignmentEnabled;

/**
 * Emits a speech stage event through the existing Socket.IO service (direct in
 * the API process, over Redis from the worker). Never throws - progress is a
 * courtesy and must not be able to fail a job.
 *
 * @param {object} SocketService the socket service (injected to avoid an import cycle)
 */
function emitSpeechStage(SocketService, jobId, event, extra = {}) {
  if (!speechEventsEnabled() || !SocketService?.emitSpeechStage) return;
  try {
    SocketService.emitSpeechStage({ jobId, event, label: SPEECH_EVENT_LABELS[event] || null, ...extra });
  } catch {
    /* swallowed on purpose - see above */
  }
}

module.exports = { SPEECH_EVENTS, SPEECH_EVENT_LABELS, emitSpeechStage, speechEventsEnabled };
