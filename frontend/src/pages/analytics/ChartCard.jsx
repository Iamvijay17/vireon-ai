import { Card, CardHeader } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";

/**
 * The dashboard's standard panel: a card that slides in at its place in the
 * page order (`stagger`), an icon + title header, and padded content.
 */
export function ChartCard({ icon: Icon, title, subtitle, extra, stagger, className, bodyClassName = "p-3", children }) {
  return (
    <Card className={cn("animate-slide-up rounded-2xl shadow-sm", className)} style={{ "--stagger-index": stagger }}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-text-tertiary" /> {title}
          </span>
        }
        subtitle={subtitle}
        extra={extra}
      />
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
