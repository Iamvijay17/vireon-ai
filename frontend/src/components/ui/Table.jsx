import { cn } from "./cn";
import { Spinner } from "./Spinner";

/**
 * Minimal data table. columns: [{ key, title, render?(record), width?, align? }]
 */
export const Table = ({ columns = [], data = [], rowKey = "_id", loading = false, onRowClick, className, emptyContent = "No data" }) => (
  <div className={cn("overflow-x-auto", className)}>
    <table className="w-full border-collapse text-left text-sm">
      <thead>
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
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={columns.length} className="py-10 text-center">
              <Spinner className="mx-auto" />
            </td>
          </tr>
        ) : data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-10 text-center text-sm text-text-tertiary">
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
                onRowClick &&
                  "cursor-pointer hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3 text-text-secondary", col.align === "right" && "text-right")}>
                  {col.render ? col.render(record) : record[col.key]}
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
