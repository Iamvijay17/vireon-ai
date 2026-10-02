import { clsx } from "clsx";

/**
 * Tailwind-friendly class joiner.
 *
 * Lives in its own module rather than beside the primitives so those files
 * export components only - React Fast Refresh silently stops working for a
 * file that mixes component and non-component exports.
 */
export const cx = (...args) => clsx(args);

export default cx;
