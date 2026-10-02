/**
 * Shared clamp config every animation component's interpolate() call uses -
 * factored out only so it isn't retyped identically in all 10 files.
 */
export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
