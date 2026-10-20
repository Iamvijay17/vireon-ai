import { RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";

/**
 * The row above a list: search first (it grows), then filters, then
 * trailing controls pushed to the right. Wraps on small screens with every
 * control keeping a usable width. `onRefresh` adds the standard refresh
 * button, spinning while `refreshing`.
 */
const FilterBar = ({ search, children, trailing, onRefresh, refreshing = false, refreshLabel = "Refresh", className }) => (
  <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
    {search && <div className="min-w-52 flex-1 sm:max-w-sm">{search}</div>}
    {children}
    <div className="ml-auto flex items-center gap-2">
      {trailing}
      {onRefresh && (
        <Button
          variant="secondary"
          iconOnly
          aria-label={refreshLabel}
          title={refreshLabel}
          loading={refreshing}
          icon={<RefreshCw className="size-4" />}
          onClick={onRefresh}
        />
      )}
    </div>
  </div>
);

export default FilterBar;
