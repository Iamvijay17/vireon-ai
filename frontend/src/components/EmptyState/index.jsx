import { Inbox } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * Consistent "no data" state + an optional call-to-action button,
 * replacing each page's ad hoc empty block.
 */
const EmptyState = ({ description, actionLabel, actionIcon, onAction }) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
    <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-hover text-text-tertiary">
      <Inbox className="size-6" />
    </div>
    <p className="max-w-xs text-sm text-text-tertiary">{description}</p>
    {actionLabel && onAction && (
      <Button variant="primary" size="sm" icon={actionIcon} onClick={onAction} className="mt-1">
        {actionLabel}
      </Button>
    )}
  </div>
);

export default EmptyState;
