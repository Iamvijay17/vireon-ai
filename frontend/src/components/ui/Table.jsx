import { cn } from "./cn";
import { Spinner } from "./Spinner";

const hasLabel = (col) => typeof col.title === "string" && col.title.length > 0;

/**
 * Minimal data table. columns: [{ key, title, render?(record), width?, align? }]
 *
 * Below `md` (unless `stack={false}`) each row collapses into a labelled
 * card instead of scrolling sideways: the header row is hidden and every
 * cell shows its column title inline. Pure CSS (`max-md:` variants), so
 * callers need no changes. Columns with a non-text or empty title
 * (checkboxes, action menus) render without a label.
 */
export const Table = ({
  columns = [],
  data = [],
  rowKey = "_id",
  loading = false,
  onRowClick,
  className,
  emptyContent = "No data",
  stack = true,
}) => (
  <div className={cn("overflow-x-auto", className)}>
    <table className={cn("w-full border-collapse text-left text-sm", stack && "max-md:block")}>
      <thead className={cn(stack && "max-md:hidden")}>
        <tr className="border-b border-border-light">
          {columns.map((col) => (
            <th
              key={col.key}
              style={{ width: col.width }}
              className={cn(
                "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary",
                col.align === "right" && "text-right"
              )}
            >
              {col.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={cn(stack && "max-md:block")}>
        {loading ? (
          <tr className={cn(stack && "max-md:block")}>
            <td colSpan={columns.length} className={cn("py-10 text-center", stack && "max-md:block")}>
              <Spinner className="mx-auto" />
            </td>
          </tr>
        ) : data.length === 0 ? (
          <tr className={cn(stack && "max-md:block")}>
            <td colSpan={columns.length} className={cn("py-10 text-center text-sm text-text-tertiary", stack && "max-md:block")}>
              {emptyContent}
            </td>
          </tr>
        ) : (
          data.map((record, i) => (
            <tr
              key={record[rowKey] ?? i}
              onClick={() => onRowClick?.(record)}
              // A clickable row needs to be reachable and activatable
              // without a mouse. Without these, keyboard users could not
              // open a row's detail view at all - the row was a click
              // handler on a non-interactive element, invisible to Tab and
              // to screen readers.
              //
              // Applied only when onRowClick exists: adding tabIndex to
              // every row of a read-only table would bury real controls
              // under dozens of meaningless tab stops.
              {...(onRowClick && {
                tabIndex: 0,
                role: "button",
                onKeyDown: (e) => {
                  // Enter and Space are what a native button responds to.
                  if (e.key !== "Enter" && e.key !== " ") return;
                  // Let a control *inside* the row (a checkbox, an action
                  // menu) handle its own key press instead of the row
                  // swallowing it and opening the detail view.
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault(); // Space would otherwise scroll
                  onRowClick(record);
                },
              })}
              className={cn(
                "border-b border-border-light last:border-0 transition-colors",
                stack && "max-md:flex max-md:flex-wrap max-md:items-center max-md:px-4 max-md:py-3",
                onRowClick &&
                  "cursor-pointer hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-text-secondary",
                    col.align === "right" && "text-right",
                    // Labelled cells fill a card row. Unlabelled ones (select
                    // checkbox, action menu) share the first line instead of
                    // each costing a row of their own.
                    stack &&
                      (hasLabel(col)
                        ? "max-md:flex max-md:w-full max-md:items-center max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1.5"
                        : "max-md:order-first max-md:px-0 max-md:py-1"),
                    stack && !hasLabel(col) && col.align === "right" && "max-md:ml-auto"
                  )}
                >
                  {stack && hasLabel(col) && (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary md:hidden">
                      {col.title}
                    </span>
                  )}
                  {stack ? (
                    // `contents` on md+ so the wrapper adds no box to the table layout.
                    <div className="min-w-0 max-md:text-right md:contents">
                      {col.render ? col.render(record) : record[col.key]}
                    </div>
                  ) : col.render ? (
                    col.render(record)
                  ) : (
                    record[col.key]
                  )}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default Table;
