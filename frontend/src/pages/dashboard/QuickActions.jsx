import { Link } from "react-router-dom";
import { AudioLines, ImagePlus, Images, LayoutTemplate, PlusCircle, ShieldCheck } from "lucide-react";

const ACTIONS = [
  { to: "/wizard", label: "Create Video", hint: "Topic to finished video", icon: PlusCircle, primary: true },
  { to: "/templates", label: "Templates", hint: "Browse scene layouts", icon: LayoutTemplate },
  { to: "/audio", label: "Voice Studio", hint: "Preview narration voices", icon: AudioLines },
  { to: "/images", label: "Image Studio", hint: "Generate scene images", icon: ImagePlus },
  { to: "/media", label: "Media Library", hint: "Browse stored files", icon: Images },
  { to: "/quality", label: "Quality Control", hint: "Review output checks", icon: ShieldCheck },
];

/** Shortcuts to the common workflows. */
const QuickActions = () => (
  <section aria-label="Quick actions">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {ACTIONS.map(({ to, label, hint, icon: Icon, primary }) => (
        <Link
          key={to}
          to={to}
          className={
            primary
              ? "group flex items-start gap-3 rounded-xl border border-accent/50 bg-accent-subtle p-3 outline-none transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              : "hover-lift group flex items-start gap-3 rounded-xl border border-border bg-surface p-3 outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          }
        >
          <Icon className={primary ? "mt-0.5 size-[18px] shrink-0 text-accent-fg" : "mt-0.5 size-[18px] shrink-0 text-text-tertiary group-hover:text-text-secondary"} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-text-primary">{label}</span>
            <span className="block truncate text-[11px] text-text-tertiary">{hint}</span>
          </span>
        </Link>
      ))}
    </div>
  </section>
);

export default QuickActions;
