import { Spinner } from "../ui/Spinner";

/**
 * Consistent centered loading block, replacing the hand-rolled spinner +
 * margin-top div repeated across pages.
 */
const LoadingState = ({ label = "Loading...", minHeight = 240 }) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center" style={{ minHeight }}>
    <Spinner size="lg" />
    {label && <div className="text-sm text-text-secondary">{label}</div>}
  </div>
);

export default LoadingState;
