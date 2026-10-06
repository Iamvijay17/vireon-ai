/**
 * Where each long-running stage sits on its pipeline's 0-100 progress scale.
 * A stage reports its own 0..1 fraction (scenes done, Remotion frames, ...)
 * and mapToBand() places it inside the stage's [start, end] band, so every
 * emitter agrees on the numbers instead of repeating `40 + round(x * 9)`.
 *
 * The video-job and course-video pipelines are separate scales (see
 * constants JOB_STEPS for the job checkpoints these bands sit between), so
 * they keep separate band tables.
 */
const PROGRESS_BANDS = Object.freeze({
  job: Object.freeze({
    audio: Object.freeze([40, 49]),
    images: Object.freeze([56, 59]),
    render: Object.freeze([85, 94]),
  }),
  course: Object.freeze({
    audio: Object.freeze([40, 49]),
    images: Object.freeze([61, 64]),
    render: Object.freeze([80, 89]),
  }),
});

function mapToBand([start, end], fraction) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return start + Math.round(clamped * (end - start));
}

module.exports = { PROGRESS_BANDS, mapToBand };
