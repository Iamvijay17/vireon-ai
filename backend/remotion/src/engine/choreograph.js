import { createSeededRng, pick } from './seedRandom';

/**
 * Choreographer - layer 4 of the generative scene engine.
 *
 * Assigns each layout slot an entrance animation type + stagger delay,
 * purely by role lookup + reading-order index. No new animation math -
 * this is only a scheduling/assignment policy over what computeMotionStyle
 * (motion.js) already knows how to render.
 */
const ROLE_MOTION_POOL = {
  title: ['fadeSlideUp', 'fadeIn'],
  listItem: ['fadeSlideUp', 'fadeSlideLeft'],
  body: ['fadeIn', 'fadeSlideUp'],
  image: ['scaleIn', 'fadeIn'],
};

export const choreograph = (layoutPlan, seedInput) => {
  const rng = createSeededRng(`${seedInput}-motion`);
  const plan = {};
  layoutPlan.slots.forEach((slot, index) => {
    const pool = ROLE_MOTION_POOL[slot.role] || ROLE_MOTION_POOL.body;
    plan[slot.id] = {
      type: pick(rng, pool),
      delay: 6 + index * 6,
      duration: 22,
    };
  });
  return plan;
};
