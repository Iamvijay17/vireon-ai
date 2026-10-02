/**
 * Consistent page-level header: title + optional description on the left,
 * actions (buttons) on the right.
 */
const PageHeader = ({ title, description, extra }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
    <div className="min-w-0">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
    </div>
    {extra && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{extra}</div>}
  </div>
);

export default PageHeader;
