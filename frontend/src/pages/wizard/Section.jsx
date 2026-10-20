import { Card } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";

// A titled panel for one group of settings. Must live at module level:
// defining it inside the page remounts its children (and drops input focus)
// on every render.
export const Section = ({ title, description, className, children }) => (
  <Card className={cn("p-5", className)}>
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
    </div>
    {children}
  </Card>
);
