import { Card } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";

// Section card with an icon header, always expanded. Must live at module level:
// defining it inside Wizard remounts its children (and drops input focus) on every render.
export const Section = ({ icon: Icon, title, description, className, children }) => (
  <Card className={cn("p-6 sm:p-8", className)}>
    <div className="mb-6 flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
        <Icon className="size-4.5" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
      </div>
    </div>
    {children}
  </Card>
);
