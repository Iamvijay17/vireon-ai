import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

/** Prev/next with "Page x of y". Renders nothing when everything fits on one page. */
export const Pagination = ({ page, pages, total, onChange, className }) => {
  if (!pages || pages <= 1) return null;
  return (
    <div className={className ?? "flex items-center justify-between gap-2 border-t border-border-light px-4 py-2.5"}>
      <span className="text-xs text-text-tertiary">{total !== undefined ? `${total} total` : ""}</span>
      <div className="flex items-center gap-2">
        <span className="tabular mr-1 text-xs text-text-tertiary">
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft className="size-4" />}
        />
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          icon={<ChevronRight className="size-4" />}
        />
      </div>
    </div>
  );
};

export default Pagination;
