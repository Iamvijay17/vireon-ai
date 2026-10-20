import { Inbox } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * Consistent "nothing here" state. Say why it is empty and what to do next:
 * `title` names the situation, `description` explains it, and the actions are
 * the way forward (never a dead end). `compact` is for inside a card or panel.
 */
const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
}) => (
  <div className={compact ? "flex flex-col items-center gap-2 px-4 py-8 text-center" : "flex flex-col items-center gap-2.5 px-6 py-14 text-center"}>
    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-hover text-text-tertiary">
      <Icon className="size-5" />
    </div>
    {title && <p className="mt-1 text-sm font-medium text-text-primary">{title}</p>}
    {description && <p className="max-w-sm text-[13px] leading-relaxed text-text-tertiary">{description}</p>}
    {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {actionLabel && onAction && (
          <Button variant="primary" size="sm" icon={actionIcon} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button variant="secondary" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
      </div>
    ) : null}
  </div>
);

export default EmptyState;
