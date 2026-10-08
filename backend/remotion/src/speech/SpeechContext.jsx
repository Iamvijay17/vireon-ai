import React, { createContext, useContext, useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  getCurrentWordIndex,
  getPauseAtTime,
  getPhraseAtTime,
  getSegmentAtTime,
  getSpeechProgress,
  getWordAtTime,
  isSpeaking,
  normalizeSpeechTimeline,
} from './timeline';

/**
 * Hands a scene's canonical speech timeline (and its optional speech timing
 * config) to everything rendered inside it, without prop-drilling through the
 * 50 templates. VideoComposition wraps each scene in a provider; with
 * ENABLE_SPEECH_DRIVEN_ANIMATION off, the scene has no timeline, the provider
 * holds null, and every consumer takes its original code path.
 */
const SpeechContext = createContext({ timeline: null, timing: null });

export const SpeechProvider = ({ timeline = null, timing = null, children }) => {
  const normalized = useMemo(() => normalizeSpeechTimeline(timeline), [timeline]);
  const value = useMemo(() => ({ timeline: normalized, timing }), [normalized, timing]);
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
};

/** The scene's normalised speech timeline and speech timing config (both null when absent). */
export const useSpeechTimeline = () => useContext(SpeechContext);

/**
 * Everything a component wants to know about the speech *right now*,
 * recomputed each frame from the scene-relative frame. Neutral values when
 * the scene has no speech timeline.
 */
export const useSpeech = () => {
  const { timeline, timing } = useContext(SpeechContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  if (!timeline) {
    return { enabled: false, timeline: null, timing, t, fps, word: null, phrase: null, segment: null, pause: null, speaking: false, progress: 0, wordIndex: -1 };
  }

  return {
    enabled: true,
    timeline,
    timing,
    t,
    fps,
    word: getWordAtTime(timeline, t),
    phrase: getPhraseAtTime(timeline, t),
    segment: getSegmentAtTime(timeline, t),
    pause: getPauseAtTime(timeline, t),
    speaking: isSpeaking(timeline, t),
    progress: getSpeechProgress(timeline, t),
    wordIndex: getCurrentWordIndex(timeline, t),
  };
};
