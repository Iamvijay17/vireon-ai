import { Label } from "../../components/ui/Input";

export const Field = ({ label, children }) => (
  <div>
    <Label>{label}</Label>
    {children}
  </div>
);

export const SectionLabel = ({ icon: Icon, children }) => (
  <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
    <Icon className="size-3.5 text-text-tertiary" />
    {children}
  </div>
);
