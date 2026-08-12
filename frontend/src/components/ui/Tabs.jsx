import { cn } from "./cn";

export const Tabs = ({ items = [], active, onChange, className }) => (
  <div className={cn("flex items-center gap-1 border-b border-border-light", className)}>
    {items.map((item) => (
      <button
        key={item.key}
        type="button"
        onClick={() => onChange?.(item.key)}
        className={cn(
          "relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
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
