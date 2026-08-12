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
              className={cn(
                "border-b border-border-light last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-surface-hover"
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
