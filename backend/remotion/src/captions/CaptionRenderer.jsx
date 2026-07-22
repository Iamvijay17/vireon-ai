import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { captionAnimationRegistry } from './captionAnimations';

/**
 * Default caption style configuration.
 * Templates can override any of these values.
 */
export const defaultCaptionConfig = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontWeight: 700,
  fontSize: 48,
  textColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowBlur: 4,
  shadowOffsetY: 2,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  backgroundPadding: '12px 24px',
  borderRadius: 12,
  position: 'bottom', // 'top' | 'center' | 'bottom'
  lineWrapping: true,
  maxWidth: '80%',
  animation: 'fadeInUp', // key into captionAnimationRegistry
  animationConfig: {},   // per-animation options
  framesPerWord: 3,
  wordSpacing: '0.3em',
  letterSpacing: '0.02em',
};

/**
 * Computes the current "active word index" based on timestamps and current frame.
 * If timestamps are provided, it uses them for exact per-word sync.
 * If not, it falls back to steady-rate framesPerWord timing.
 *
 * @param {string[]} words - Array of words
 * @param {Array<{word: string, start: number, end: number}>} timestamps - Per-word timestamps in seconds
 * @param {number} fps - Frames per second
 * @param {number} currentFrame - Current frame in the sequence
 * @param {number} sceneStartFrame - Frame offset when this scene started
 * @returns {number} Active word index
 */
const computeActiveWordIndex = (words, timestamps, fps, currentFrame, sceneStartFrame) => {
  if (!timestamps || timestamps.length === 0) {
    // Fallback: estimate based on frame rate
    const framesPerWord = 3;
    return Math.min(Math.floor((currentFrame - sceneStartFrame) / framesPerWord), words.length - 1);
  }

  const currentTime = (currentFrame - sceneStartFrame) / fps;
  let activeIndex = words.length - 1;

  for (let i = 0; i < timestamps.length; i++) {
    if (currentTime < timestamps[i].start) {
      activeIndex = i - 1;
      break;
    }
  }

  return Math.max(0, activeIndex);
};

/**
 * CaptionRenderer
 *
 * A reusable component that renders animated captions word-by-word.
 * Supports multiple animation styles, configurable styling, and per-word timestamps.
 *
 * @param {Object} props
 * @param {string} props.text - The full caption text
 * @param {Object} props.styleConfig - Override default caption styles
 * @param {string} props.animation - Animation type key (e.g., 'fadeInUp', 'popScale')
 * @param {Object} props.animationConfig - Options passed to the animation hook
 * @param {Array} props.timestamps - Array of {word, start, end} for per-word timing
 * @param {number} props.sceneStartFrame - Frame offset when the scene started
 * @param {number} props.fps - Frames per second (default 30)
 */
export const CaptionRenderer = React.memo(
  ({
    text = '',
    styleConfig = {},
    animation = 'fadeInUp',
    animationConfig = {},
    timestamps = null,
    sceneStartFrame = 0,
    fps = 30,
  }) => {
    const frame = useCurrentFrame();

    // Merge default config with overrides
    const config = useMemo(() => ({
      ...defaultCaptionConfig,
      ...styleConfig,
    }), [styleConfig]);

    // Split text into words
    const words = useMemo(() => {
      if (!text) return [];
      return text.split(/\s+/).filter(Boolean);
    }, [text]);

    // Get the animation hook. This must be called directly in the component
    // body, not inside useMemo/useEffect - the hook factories themselves call
    // useCurrentFrame()/useVideoConfig(), and nesting a hook call inside
    // another hook's callback breaks React's hook-call bookkeeping (it
    // reliably crashed with "Cannot read properties of undefined (reading
    // 'length')" once this was actually re-rendered live, e.g. in the studio
    // preview or whenever `animation` changed on an already-mounted scene).
    if (!captionAnimationRegistry[animation]) {
      console.warn(`Unknown caption animation: "${animation}", falling back to fadeInUp`);
    }
    const hookFactory = captionAnimationRegistry[animation] || captionAnimationRegistry.fadeInUp;
    const animHook = hookFactory({
      framesPerWord: config.framesPerWord,
      ...animationConfig,
    });

    // Compute active word index
    const activeIndex = useMemo(
      () => computeActiveWordIndex(words, timestamps, fps, frame, sceneStartFrame),
      [words, timestamps, fps, frame, sceneStartFrame]
    );

    // Position style for the container
    const positionStyle = useMemo(() => {
      const positions = {
        top: { top: 60, bottom: 'auto', transform: 'translateX(-50%)' },
        center: { top: '50%', bottom: 'auto', transform: 'translate(-50%, -50%)' },
        bottom: { bottom: 60, top: 'auto', transform: 'translateX(-50%)' },
      };
      return positions[config.position] || positions.bottom;
    }, [config.position]);

    if (!text || words.length === 0) return null;

    return (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          ...positionStyle,
          width: 'auto',
          maxWidth: config.maxWidth,
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: config.lineWrapping ? 'wrap' : 'nowrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: config.wordSpacing,
            backgroundColor: config.backgroundColor,
            padding: config.backgroundPadding,
            borderRadius: config.borderRadius,
            backdropFilter: 'blur(4px)',
          }}
        >
          {words.map((word, index) => {
            const wordStyle = animHook.getWordStyle(index, activeIndex, word);

            return (
              <span
                key={`${word}-${index}`}
                style={{
                  fontFamily: config.fontFamily,
                  fontWeight: config.fontWeight,
                  fontSize: config.fontSize,
                  color: wordStyle.color || config.textColor,
                  letterSpacing: config.letterSpacing,
                  display: 'inline-block',
                  whiteSpace: 'nowrap',
                  opacity: wordStyle.opacity ?? 1,
                  transform: wordStyle.transform || 'none',
                  filter: wordStyle.filter || 'none',
                  clipPath: wordStyle.clipPath || 'none',
                  textShadow: wordStyle.textShadow
                    ? wordStyle.textShadow
                    : `${config.strokeColor} 0px 0px ${config.strokeWidth}px, ${config.shadowColor} 0px ${config.shadowOffsetY}px ${config.shadowBlur}px`,
                  transition: undefined, // Remotion handles per-frame updates
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
);

CaptionRenderer.displayName = 'CaptionRenderer';

export default CaptionRenderer;
