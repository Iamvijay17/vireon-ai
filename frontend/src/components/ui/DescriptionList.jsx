import { cn } from "./cn";

/**
 * items: [{ label, value }]. Ant `Descriptions` replacement.
 */
export const DescriptionList = ({ items = [], columns = 2, className }) => (
  <dl
    className={cn("grid gap-x-6 gap-y-3.5", className)}
    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
  >
    {items.map((item, i) => (
      <div key={i} className="min-w-0">
        <dt className="text-xs font-medium text-text-tertiary">{item.label}</dt>
        <dd className="mt-1 truncate text-[13px] font-medium text-text-primary">{item.value}</dd>
      </div>
    ))}
  </dl>
);

export default DescriptionList;
