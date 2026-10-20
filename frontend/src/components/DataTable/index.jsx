import { Card } from "../ui/Card";
import { Table } from "../ui/Table";
import { Pagination } from "../ui/Pagination";
import { Skeleton } from "../ui/Skeleton";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";

const SkeletonRows = ({ columns, rows }) => (
  <div aria-hidden="true" className="divide-y divide-border-light">
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="flex items-center gap-4 px-4 py-3.5">
        {columns.slice(0, 5).map((col, c) => (
          <Skeleton key={col.key} className={c === 0 ? "h-4 flex-[2]" : "h-4 flex-1"} />
        ))}
      </div>
    ))}
  </div>
);

/**
 * A list inside a card, with every state a list can be in: skeleton rows on
 * first load, an error with Retry, an empty state (callers pass one that says
 * why it is empty), then the table with optional sorting and pagination.
 *
 * `loading` is the first load only - pass useApiQuery's `loading`, not
 * `refreshing`, so a background refetch never blanks the rows on screen.
 */
const DataTable = ({
  columns,
  data,
  rowKey = "_id",
  loading = false,
  error = null,
  onRetry,
  empty,
  onRowClick,
  sort,
  onSort,
  pagination,
  header,
  className,
}) => {
  const hasData = data && data.length > 0;

  let body;
  if (loading && !hasData) {
    body = <SkeletonRows columns={columns} rows={6} />;
  } else if (error && !hasData) {
    body = (
      <div className="p-4">
        <ErrorState message="Could not load this list" description={error.friendlyMessage || error.message} onRetry={onRetry} />
      </div>
    );
  } else if (!hasData) {
    body = empty || <EmptyState compact title="Nothing to show" />;
  } else {
    body = <Table columns={columns} data={data} rowKey={rowKey} onRowClick={onRowClick} sort={sort} onSort={onSort} />;
  }

  return (
    <Card className={className ? `overflow-hidden ${className}` : "overflow-hidden"}>
      {header}
      {body}
      {pagination && hasData && (
        <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={pagination.onChange} />
      )}
    </Card>
  );
};

export default DataTable;
