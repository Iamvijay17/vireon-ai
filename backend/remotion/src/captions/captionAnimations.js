/**
 * Caption Animation Hooks
 *
 * Provides per-word animation hooks for caption rendering.
 * Each hook returns a getWordStyle(wordIndex, activeIndex, frame) function
 * that produces inline styles for each word at the current frame.
 *
 * All animations target 60 FPS via Remotion's native interpolation.
 */
import { spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Fade In + Up animation
 * Words fade in and slide up slightly as they appear.
 */
export const useFadeInUpAnimation = ({ framesPerWord = 3, slideDistance = 20 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, transform: `translateY(${slideDistance}px)` };

    const opacity = interpolate(localFrame, [0, 8], [0, 1], {
      extrapolateRight: 'clamp',
    });
    const translateY = interpolate(localFrame, [0, 10], [slideDistance, 0], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      transform: `translateY(${translateY}px)`,
    };
  };

  return { getWordStyle };
};

/**
 * Pop Scale animation
 * Words scale from 0 to 1 with a spring-like pop effect.
 */
export const usePopScaleAnimation = ({ framesPerWord = 3 } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, transform: 'scale(0.3)' };

    const scale = spring({
      frame: localFrame,
      fps,
      config: {
        damping: 12,
        mass: 0.5,
        stiffness: 200,
      },
    });

    const opacity = interpolate(localFrame, [0, 5], [0, 1], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      transform: `scale(${scale})`,
    };
  };

  return { getWordStyle };
};

/**
 * Slide Left animation
 * Words slide in from the right side.
 */
export const useSlideLeftAnimation = ({ framesPerWord = 3, slideDistance = 60 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, transform: `translateX(${slideDistance}px)` };

    const opacity = interpolate(localFrame, [0, 6], [0, 1], {
      extrapolateRight: 'clamp',
    });
    const translateX = interpolate(localFrame, [0, 8], [slideDistance, 0], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      transform: `translateX(${translateX}px)`,
    };
  };

  return { getWordStyle };
};

/**
 * Slide Right animation
 * Words slide in from the left side.
 */
export const useSlideRightAnimation = ({ framesPerWord = 3, slideDistance = 60 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, transform: `translateX(-${slideDistance}px)` };

    const opacity = interpolate(localFrame, [0, 6], [0, 1], {
      extrapolateRight: 'clamp',
    });
    const translateX = interpolate(localFrame, [0, 8], [-slideDistance, 0], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      transform: `translateX(${translateX}px)`,
    };
  };

  return { getWordStyle };
};

/**
 * Bounce animation
 * Words bounce into place with a spring effect.
 */
export const useBounceAnimation = ({ framesPerWord = 4 } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, transform: 'translateY(40px) scale(0.8)' };

    const translateY = spring({
      frame: localFrame,
      fps,
      config: {
        damping: 8,
        mass: 0.6,
        stiffness: 150,
      },
    });

    const bounceY = 40 * (1 - translateY);

    const opacity = interpolate(localFrame, [0, 6], [0, 1], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      transform: `translateY(${bounceY}px)`,
    };
  };

  return { getWordStyle };
};

/**
 * Typewriter animation
 * Characters appear one at a time within each word.
 */
export const useTypewriterAnimation = ({ charsPerFrame = 2 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex, wordText) => {
    if (!wordText) return { opacity: 0 };
    const wordLen = wordText.length;
    const charsAvailable = Math.max(0, Math.floor((frame - wordIndex * 2) * charsPerFrame));
    const charsForThisWord = Math.max(
      0,
      Math.min(charsAvailable - wordText.length * wordIndex, wordLen)
    );
    const visibleRatio = charsForThisWord / wordLen;

    return {
      opacity: visibleRatio,
      clipPath: `inset(0 ${100 - visibleRatio * 100}% 0 0)`,
    };
  };

  return { getWordStyle };
};

/**
 * Highlight Current Word
 * The currently spoken word gets a highlight color/glow,
 * while previous words remain visible and future words are dimmed.
 */
export const useHighlightCurrentAnimation = ({ dimOpacity = 0.35, highlightColor = '#fbbf24' } = {}) => {
  const getWordStyle = (wordIndex, activeIndex) => {
    if (wordIndex < activeIndex) {
      // Already spoken — visible but dim
      return {
        opacity: 0.7,
        color: '#d1d5db',
      };
    }
    if (wordIndex === activeIndex) {
      // Currently spoken — highlighted
      return {
        opacity: 1,
        color: highlightColor,
        transform: 'scale(1.08)',
        textShadow: `0 0 20px ${highlightColor}40, 0 0 40px ${highlightColor}20`,
      };
    }
    // Future words — dim
    return {
      opacity: dimOpacity,
    };
  };

  return { getWordStyle };
};

/**
 * Glow on Active Word
 * The active word pulses with a glow effect.
 */
export const useGlowActiveAnimation = ({ glowColor = '#60a5fa', framesPerWord = 3 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (wordIndex < activeIndex) {
      return { opacity: 0.8 };
    }
    if (wordIndex === activeIndex) {
      const glowIntensity = interpolate(
        Math.sin(localFrame * 0.15),
        [-1, 1],
        [0.3, 1]
      );
      return {
        opacity: 1,
        color: '#ffffff',
        textShadow: `0 0 ${10 * glowIntensity}px ${glowColor}, 0 0 ${20 * glowIntensity}px ${glowColor}`,
        transform: `scale(${1 + 0.03 * glowIntensity})`,
      };
    }
    return { opacity: 0.2 };
  };

  return { getWordStyle };
};

/**
 * Zoom In/Out animation
 * Words zoom in as they appear.
 */
export const useZoomAnimation = ({ framesPerWord = 3, zoomFrom = 0.5, zoomTo = 1 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, transform: `scale(${zoomFrom})` };

    const scale = interpolate(localFrame, [0, 10], [zoomFrom, zoomTo], {
      extrapolateRight: 'clamp',
    });
    const opacity = interpolate(localFrame, [0, 5], [0, 1], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      transform: `scale(${scale})`,
    };
  };

  return { getWordStyle };
};

/**
 * Blur to Sharp animation
 * Words start blurred and become sharp.
 */
export const useBlurToSharpAnimation = ({ framesPerWord = 3 } = {}) => {
  const frame = useCurrentFrame();

  const getWordStyle = (wordIndex, activeIndex) => {
    const wordFrame = wordIndex * framesPerWord;
    const localFrame = frame - wordFrame;

    if (localFrame < 0) return { opacity: 0, filter: 'blur(15px)' };

    const blur = interpolate(localFrame, [0, 10], [15, 0], {
      extrapolateRight: 'clamp',
    });
    const opacity = interpolate(localFrame, [0, 4], [0, 1], {
      extrapolateRight: 'clamp',
    });

    return {
      opacity,
      filter: `blur(${blur}px)`,
    };
  };

  return { getWordStyle };
};

/**
 * Caption Animation Registry
 * Maps animation type strings to their hook functions.
 */
export const captionAnimationRegistry = {
  fadeInUp: useFadeInUpAnimation,
  popScale: usePopScaleAnimation,
  slideLeft: useSlideLeftAnimation,
  slideRight: useSlideRightAnimation,
  bounce: useBounceAnimation,
  typewriter: useTypewriterAnimation,
  highlightCurrent: useHighlightCurrentAnimation,
  glowActive: useGlowActiveAnimation,
  zoom: useZoomAnimation,
  blurToSharp: useBlurToSharpAnimation,
};
