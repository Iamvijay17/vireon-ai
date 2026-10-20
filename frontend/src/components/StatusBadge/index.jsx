import { CheckCircle2, XCircle, Clock, Loader2, CircleSlash, Hourglass, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "../ui/Badge";
import { jobPhase } from "../../lib/jobStatus";
import { humanizeStatus } from "../../lib/format";

/**
 * One look for every status in the product. A badge says WHAT state something
 * is in (phase) and is the only place status colour is decided:
 *
 *   running   violet + spinner      queued   neutral + clock
 *   waiting   blue + hourglass      completed green + check
 *   failed    red + cross           cancelled neutral + slashed circle
 *
 * Quality verdicts (passed / passed-with-warnings / failed / skipped / unchecked)
 * share the component through `kind="quality"` so a green "Passed" cannot be
 * confused with a green "Completed".
 */
const PHASES = {
  running: { variant: "accent", Icon: Loader2, spin: true },
  queued: { variant: "neutral", Icon: Clock },
  waiting: { variant: "info", Icon: Hourglass },
  completed: { variant: "success", Icon: CheckCircle2 },
  failed: { variant: "danger", Icon: XCircle },
  cancelled: { variant: "neutral", Icon: CircleSlash },
};

const QUALITY = {
  passed: { variant: "success", Icon: ShieldCheck, label: "Passed" },
  "passed-with-warnings": { variant: "warning", Icon: ShieldAlert, label: "Warnings" },
  failed: { variant: "danger", Icon: ShieldAlert, label: "Failed" },
  skipped: { variant: "neutral", Icon: ShieldQuestion, label: "Skipped" },
  unchecked: { variant: "neutral", Icon: ShieldQuestion, label: "Not checked" },
};

export const StatusBadge = ({ status, label, kind = "job", className }) => {
  if (kind === "quality") {
    const q = QUALITY[status] || QUALITY.unchecked;
    return (
      <Badge variant={q.variant} icon={<q.Icon className="size-3" />} className={className}>
        {label || q.label}
      </Badge>
    );
  }
  const { variant, Icon, spin } = PHASES[jobPhase(status)];
  return (
    <Badge variant={variant} icon={<Icon className={spin ? "size-3 animate-spin" : "size-3"} />} className={className}>
      {label || humanizeStatus(status)}
    </Badge>
  );
};

export default StatusBadge;
