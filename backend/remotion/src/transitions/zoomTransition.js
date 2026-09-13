export const id = 'zoom';
export const hardCut = false;

export const style = (progress) => ({
  opacity: progress,
  transform: `scale(${0.85 + progress * 0.15})`,
});
