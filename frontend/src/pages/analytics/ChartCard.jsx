import { Card, CardHeader } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";

/**
 * The analytics standard panel: an icon + title header and padded content.
 * (`stagger` is accepted for old call sites and ignored - panels no longer
 * animate in.)
 */
// eslint-disable-next-line no-unused-vars
export function ChartCard({ icon: Icon, title, subtitle, extra, stagger, className, bodyClassName = "p-4", children }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
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
