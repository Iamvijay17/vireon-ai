import { Card } from "../ui/Card";
import { Label, FieldHint } from "../ui/Input";

/**
 * A settings group: a titled card whose children are SettingsRows. `id` makes
 * it a scroll target for the Settings side navigation.
 */
export const SettingsSection = ({ id, title, description, action, children }) => (
  <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-20">
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light px-4 py-3">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold text-text-primary">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
        </div>
        {action}
      </div>
      <div className="divide-y divide-border-light px-4">{children}</div>
    </Card>
  </section>
);

/** One label/hint on the left and its control on the right (stacked on small screens). */
export const SettingsRow = ({ label, hint, htmlFor, children }) => (
  <div className="grid grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:gap-6">
    <div className="min-w-0">
      <Label htmlFor={htmlFor} className="mb-0 text-[13px] text-text-primary">
        {label}
      </Label>
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
    <div className="sm:justify-self-end sm:w-64">{children}</div>
  </div>
);

export default SettingsSection;
