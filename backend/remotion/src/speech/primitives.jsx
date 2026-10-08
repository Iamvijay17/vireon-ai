import React, { useMemo } from 'react';
import { useSpeech } from './SpeechContext';
import { buildCaptionModel } from './captionSync';
import { getCurrentWordIndex, getPhraseAtTime, resolveTarget } from './timeline';
import { phraseTransitionState, popState, pulseEnvelope, revealProgress, scaleFromEnvelope } from './speechMath';

/**
 * Speech-aware animation primitives. Thin React wrappers over the pure
 * envelopes in speechMath.js, driven by the canonical speech timeline.
 *
 * Rules every primitive follows:
 *  - subtle by default (a few percent of scale, a short fade) - these are for
 *    emphasis, not decoration, and are meant to be used sparingly;
 *  - NEVER hide or distort content just because speech timing is missing: with
 *    no timeline, or a target that is not in the speech, the child renders in
 *    its normal resting state;
 *  - a `target` says what to react to: { phrase: 'text' } | { word: 'text' } |
 *    { wordId } | { phraseId } | { segmentId } | { start, end } (see resolveTarget).
 */

const useTarget = (target) => {
  const { timeline, t, enabled } = useSpeech();
  const interval = useMemo(() => (enabled ? resolveTarget(timeline, target) : null), [enabled, timeline, target]);
  return { interval, t };
};

/** Colours the child while the target is being spoken. */
export const SpeechHighlight = ({ target, children, activeColor = '#ffd166', idleColor, style, as: Tag = 'span' }) => {
  const { interval, t } = useTarget(target);
  const active = interval ? t >= interval.start && t < interval.end : false;
  return <Tag style={{ ...style, color: active ? activeColor : idleColor ?? style?.color, transition: undefined }}>{children}</Tag>;
};

/** Grows slightly while the target is spoken, then settles back. */
export const SpeechScale = ({ target, peak = 1.08, attack = 0.12, release = 0.2, children, style, as: Tag = 'span' }) => {
  const { interval, t } = useTarget(target);
  const scale = interval ? scaleFromEnvelope(pulseEnvelope(t, interval.start, interval.end, { attack, release }), peak) : 1;
  return <Tag style={{ display: 'inline-block', ...style, transform: scale === 1 ? style?.transform : `scale(${scale})`, transformOrigin: 'center' }}>{children}</Tag>;
};

/** A single quick pop when the target starts. Resting (visible) when there is no speech to key off. */
export const SpeechPop = ({ target, children, style, as: Tag = 'div', ...opts }) => {
  const { interval, t } = useTarget(target);
  if (!interval) return <Tag style={style}>{children}</Tag>;
  const { scale, opacity } = popState(t, interval.start, opts);
  return <Tag style={{ ...style, opacity, transform: `scale(${scale})`, transformOrigin: 'center' }}>{children}</Tag>;
};

/** Fades/slides the child in when the target is spoken. Visible from the start when there is no speech to key off. */
export const SpeechReveal = ({ target, children, direction = 'up', distance = 16, duration = 0.45, hiddenOpacity = 0, style, as: Tag = 'div' }) => {
  const { interval, t } = useTarget(target);
  if (!interval) return <Tag style={style}>{children}</Tag>;
  const p = revealProgress(t, interval.start, { duration });
  const offset = (1 - p) * distance;
  const axis = direction === 'left' ? `translateX(${-offset}px)` : direction === 'right' ? `translateX(${offset}px)` : direction === 'down' ? `translateY(${-offset}px)` : `translateY(${offset}px)`;
  return <Tag style={{ ...style, opacity: hiddenOpacity + (1 - hiddenOpacity) * p, transform: axis }}>{children}</Tag>;
};

/**
 * Emphasis for what the Voice Director marked important. With no `target` it
 * reacts to whichever phrase is being spoken that carries `emphasis`; with a
 * target it reacts to that. A gentle scale (+4%) and optional colour.
 */
export const SpeechEmphasis = ({ target, peak = 1.04, color, children, style, as: Tag = 'span' }) => {
  const { timeline, t, enabled } = useSpeech();
  let envelope = 0;
  if (enabled) {
    if (target) {
      const interval = resolveTarget(timeline, target);
      if (interval) envelope = pulseEnvelope(t, interval.start, interval.end);
    } else {
      const phrase = getPhraseAtTime(timeline, t);
      if (phrase?.emphasis) envelope = pulseEnvelope(t, phrase.start, phrase.end);
    }
  }
  return (
    <Tag style={{ display: 'inline-block', ...style, transform: envelope > 0 ? `scale(${scaleFromEnvelope(envelope, peak)})` : style?.transform, color: envelope > 0.5 && color ? color : style?.color }}>
      {children}
    </Tag>
  );
};

/**
 * Renders `text` word by word and lights the word currently being spoken.
 * Only active when `text` is (a section of) the narration the timeline
 * describes; otherwise it renders plain text. `highlight="phrase"` lights the
 * whole current phrase instead of a single word.
 */
export const SpeechWordHighlight = ({ text, activeColor = '#ffd166', idleColor, spokenColor, highlight = 'word', style }) => {
  const { timeline, t, enabled } = useSpeech();
  const words = useMemo(() => String(text || '').split(/\s+/).filter(Boolean), [text]);
  const model = useMemo(() => (enabled ? buildCaptionModel(timeline, words) : null), [enabled, timeline, words]);

  if (!model) return <span style={style}>{text}</span>;

  const idx = getCurrentWordIndex(timeline, t);
  const current = idx >= 0 ? timeline.words[idx] : null;
  const phrase = highlight === 'phrase' ? getPhraseAtTime(timeline, t) : null;
  const activeStart = phrase ? timeline.words.find((w) => w.wordId === phrase.firstWordId)?.captionIndex : current?.captionIndex;
  const activeEnd = phrase ? timeline.words.find((w) => w.wordId === phrase.lastWordId)?.captionIndex : current?.captionIndex;
  const speaking = current ? t < current.end || Boolean(phrase) : false;

  return (
    <span style={style}>
      {words.map((word, i) => {
        const active = speaking && activeStart !== undefined && i >= activeStart && i <= activeEnd;
        const spoken = current && i < (activeStart ?? 0);
        return (
          <span key={`${word}-${i}`} style={{ color: active ? activeColor : spoken && spokenColor ? spokenColor : idleColor }}>
            {word}{i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
};

/**
 * Phrase by phrase transition: each phrase fades/slides in as it starts and
 * holds after it ends, until the next phrase takes over. Children is a render
 * function `(phrase, { enter, state }) => node`, or omit it to show the phrase text.
 * Before the first phrase (or without a timeline) nothing / `fallback` is shown.
 */
export const SpeechPhraseTransition = ({ children, distance = 14, inDuration = 0.25, fallback = null, style }) => {
  const { timeline, t, enabled } = useSpeech();
  if (!enabled || !timeline.phrases.length) return fallback;

  const { phrase, enter, state } = phraseTransitionState(timeline.phrases, t, { inDuration });
  if (!phrase) return null;

  return (
    <div key={phrase.phraseId} style={{ ...style, opacity: enter, transform: `translateY(${(1 - enter) * distance}px)` }}>
      {typeof children === 'function' ? children(phrase, { enter, state }) : phrase.text}
    </div>
  );
};
