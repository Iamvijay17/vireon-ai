/**
 * Thin re-export so existing imports of `../../engine/motion` keep working
 * unchanged - the actual 10 Animation Components now live in `engine/motion/`
 * (see its index.js doc comment).
 */
export { computeMotionStyle, MOTION_REGISTRY, MOTION_IDS } from './motion/index';
