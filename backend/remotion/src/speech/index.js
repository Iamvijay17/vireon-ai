/**
 * Speech-driven timing for Remotion. See docs/speech-alignment.md.
 *
 *   timeline.js      pure queries over the canonical speech timeline
 *   speechTiming.js  scene-level triggers -> the existing Motion Design System
 *   captionSync.js   captions on the same timeline
 *   speechMath.js    the gentle envelopes behind the primitives
 *   SpeechContext    SpeechProvider / useSpeech
 *   primitives       SpeechHighlight, SpeechScale, SpeechPop, SpeechReveal,
 *                    SpeechEmphasis, SpeechWordHighlight, SpeechPhraseTransition
 */
export * from './timeline';
export * from './speechTiming';
export * from './captionSync';
export * from './speechMath';
export { SpeechProvider, useSpeech, useSpeechTimeline } from './SpeechContext';
export {
  SpeechHighlight,
  SpeechScale,
  SpeechPop,
  SpeechReveal,
  SpeechEmphasis,
  SpeechWordHighlight,
  SpeechPhraseTransition,
} from './primitives';
