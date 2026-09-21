import { createSeededRng, pick, range } from './seedRandom';

/**
 * Choreographer - layer 4 of the generative scene engine.
 *
 * Assigns each layout slot an entrance animation type + stagger delay,
 * purely by role lookup + reading-order index. No new animation math -
 * this is only a scheduling/assignment policy over what computeMotionStyle
 * (motion.js) already knows how to render.
 */
const ROLE_MOTION_POOL = {
  title: ['fadeSlideUp', 'fadeIn', 'bounceIn', 'typewriterReveal'],
  listItem: ['fadeSlideUp', 'fadeSlideLeft', 'blurIn'],
  body: ['fadeIn', 'fadeSlideUp', 'blurIn'],
  image: ['scaleIn', 'fadeIn', 'popIn', 'blurIn', 'maskWipe'],
  label: ['fadeIn', 'fadeSlideUp', 'rotateIn'],
};

export const choreograph = (layoutPlan, seedInput) => {
  const rng = createSeededRng(`${seedInput}-motion`);
  const plan = {};
  layoutPlan.slots.forEach((slot, index) => {
    const pool = ROLE_MOTION_POOL[slot.role] || ROLE_MOTION_POOL.body;
    // Stagger delay and duration were a fixed formula (6 + index*6, 22
    // frames), so every scene shared the exact same entrance rhythm and
    // only the animation *type* varied. A seeded jitter per slot keeps
    // reading-order stagger intact (still increases with index) while
    // making the pacing itself part of what differs between renders.
    plan[slot.id] = {
      type: pick(rng, pool),
      delay: Math.round(6 + index * 6 + range(rng, -3, 4)),
      duration: Math.round(range(rng, 18, 28)),
    };
  });
  return plan;
};
