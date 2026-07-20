/**
 * Consistent page-level header: title + optional description on the left,
 * actions (buttons) on the right.
 */
const PageHeader = ({ title, description, extra }) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
    </div>
    {extra && <div className="flex items-center gap-3">{extra}</div>}
  </div>
);

export default PageHeader;
