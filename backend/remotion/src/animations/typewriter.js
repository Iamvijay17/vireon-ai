import { useCurrentFrame, interpolate } from 'remotion';

/**
 * Typewriter animation helper
 * Reveals text character by character
 * @param {Object} options
 * @param {string} options.text - Full text to reveal
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.charPerFrame - Characters revealed per frame (default: 1)
 * @returns {Object} { visibleText: string, opacity: number }
 */
export const useTypewriter = ({ text = '', startAt = 0, charPerFrame = 1 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { visibleText: '', opacity: 0 };
  }

  const charsToShow = Math.floor(relativeFrame * charPerFrame);
  const visibleText = text.slice(0, Math.min(charsToShow, text.length));
  const isComplete = charsToShow >= text.length;

  return {
    visibleText,
    opacity: 1,
    isComplete,
  };
};

/**
 * Word-by-word reveal animation helper
 * @param {Object} options
 * @param {string} options.text - Full text to reveal
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.framesPerWord - Frames between each word reveal (default: 10)
 * @returns {Object} { visibleWords: string[], fullText: string, opacity: number }
 */
export const useWordReveal = ({ text = '', startAt = 0, framesPerWord = 10 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { visibleWords: [], fullText: text, opacity: 0 };
  }

  const words = text.split(' ');
  const wordsToShow = Math.min(
    Math.floor(relativeFrame / framesPerWord) + 1,
    words.length
  );
  const visibleWords = words.slice(0, wordsToShow);

  return {
    visibleWords,
    fullText: text,
    opacity: 1,
    progress: wordsToShow / words.length,
  };
};

/**
 * Character reveal animation helper
 * Characters appear one by one with a scale effect
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.framesPerChar - Frames between each character reveal (default: 3)
 * @returns {Object} { progress: number, getCharStyle: function }
 */
export const useCharReveal = ({ startAt = 0, framesPerChar = 3 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return {
      progress: 0,
      getCharStyle: () => ({ opacity: 0, transform: 'scale(0.5)' }),
    };
  }

  const charsRevealed = Math.max(0, Math.floor(relativeFrame / framesPerChar));

  const getCharStyle = (charIndex) => {
    if (charIndex < charsRevealed) {
      return { opacity: 1, transform: 'scale(1)' };
    }
    return { opacity: 0, transform: 'scale(0.5)' };
  };

  return {
    progress: charsRevealed,
    getCharStyle,
  };
};
