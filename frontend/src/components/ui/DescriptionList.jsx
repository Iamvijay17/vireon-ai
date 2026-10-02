import { cn } from "./cn";

// `columns` is the column count at full width; wider layouts fold down to
// two columns on phones so values aren't truncated to a few characters.
// Literal class names so Tailwind can see them.
const COLS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

/**
 * items: [{ label, value }]. Ant `Descriptions` replacement.
 */
export const DescriptionList = ({ items = [], columns = 2, className }) => (
  <dl className={cn("grid gap-x-6 gap-y-3.5", COLS[columns] ?? COLS[2], className)}>
    {items.map((item, i) => (
      <div key={i} className="min-w-0">
        <dt className="text-xs font-medium text-text-tertiary">{item.label}</dt>
        <dd className="mt-1 truncate text-[13px] font-medium text-text-primary">{item.value}</dd>
      </div>
    ))}
  </dl>
);

export default DescriptionList;
