import { useEffect, useRef, useState } from "react";

// A drop at least this big is a real reset (a retry restarting a step, a restart
// from the beginning). Smaller drops are almost always a stale response arriving
// after a newer socket event (e.g. REST says 86 after the socket said 88), and
// must not make the bar flicker backwards.
export const REAL_DROP_POINTS = 5;

// How far past the last real value the bar may creep while a job is running.
const TRICKLE_HEADROOM = 4;

/**
 * The value a progress bar/ring should DISPLAY for a reported `percent`.
 *
 * - Increases snap forward immediately.
 * - While `trickle` is on (only for a job that is genuinely running) the value
 *   creeps a little past the last real update so a long step doesn't look dead.
 * - When `trickle` turns off (the job finished, failed, was stopped, or is now
 *   waiting) the creep is dropped and the real value is shown - previously a
 *   failed job's ring stayed at its invented 98%.
 * - Large drops follow the real value, so a retried job's bar goes back to
 *   where the job actually is instead of sitting at the old high-water mark.
 */
export function useDisplayedProgress(percent, { trickle = false } = {}) {
  const target = Math.min(100, Math.max(0, percent));
  const [display, setDisplay] = useState(target);
  const ceilingRef = useRef(Math.min(99, target + TRICKLE_HEADROOM));
  const lastTargetRef = useRef(target);
  const wasTricklingRef = useRef(trickle);

  useEffect(() => {
    const previousTarget = lastTargetRef.current;
    lastTargetRef.current = target;
    ceilingRef.current = Math.min(99, target + TRICKLE_HEADROOM);
    setDisplay((prev) => {
      if (target > prev) return target;
      return previousTarget - target >= REAL_DROP_POINTS ? target : prev;
    });
  }, [target]);

  useEffect(() => {
    if (wasTricklingRef.current && !trickle) setDisplay(target);
    wasTricklingRef.current = trickle;
  }, [trickle, target]);

  useEffect(() => {
    if (!trickle || target >= 100) return undefined;
    const id = setInterval(() => {
      setDisplay((prev) => Math.min(ceilingRef.current, prev + 0.3));
    }, 400);
    return () => clearInterval(id);
  }, [trickle, target]);

  return display;
}

export default useDisplayedProgress;
