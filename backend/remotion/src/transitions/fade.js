export const id = 'fade';
export const hardCut = false;

/** Also registered as `dissolve` (VideoComposition's existing alias). */
export const style = (progress) => ({ opacity: progress });
