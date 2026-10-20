/**
 * Consistent page-level header: title + optional description (and a `meta`
 * row for badges / live indicators) on the left, actions on the right.
 * The breadcrumb trail lives in the top bar, so headers stay compact.
 */
const PageHeader = ({ title, description, meta, extra }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {meta}
      </div>
      {description && <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-text-secondary">{description}</p>}
    </div>
    {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
  </div>
);

export default PageHeader;
