import { cn } from "./cn";

// `overflow-x-auto` + `shrink-0` on each tab: in a narrow container (e.g. a
// sidebar inspector panel) more tabs can need more width than the container
// has. Without this, the flex row simply overflows its box and the tail end
// of the tabs renders on top of whatever sits next to the container instead
// of staying contained - this makes it scroll horizontally in that case
// instead, with no visual change when everything already fits.
export const Tabs = ({ items = [], active, onChange, className }) => (
  <div className={cn("flex items-center gap-1 overflow-x-auto border-b border-border-light", className)}>
    {items.map((item) => (
      <button
        key={item.key}
        type="button"
        onClick={() => onChange?.(item.key)}
        className={cn(
          "relative flex shrink-0 items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
          active === item.key ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
        )}
      >
        {item.icon}
        {item.label}
        {active === item.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
      </button>
    ))}
  </div>
);

export default Tabs;
