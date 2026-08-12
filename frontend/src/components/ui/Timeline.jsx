import { cn } from "./cn";

const DOT_CLS = {
  neutral: "bg-text-tertiary",
  accent: "bg-accent",
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-danger-500",
};

/**
 * items: [{ title, timestamp, color? }], newest-first.
 */
export const Timeline = ({ items = [], className }) => (
  <ol className={cn("relative", className)}>
    {items.map((item, i) => (
      <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
        {i < items.length - 1 && (
          <span className="absolute left-[5px] top-3 h-full w-px bg-border-light" />
        )}
        <span className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface", DOT_CLS[item.color || "neutral"])} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-text-primary">{item.title}</p>
          {item.timestamp && <p className="mt-0.5 text-xs text-text-tertiary">{item.timestamp}</p>}
        </div>
      </li>
    ))}
  </ol>
);

export default Timeline;
