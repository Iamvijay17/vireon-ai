import { Tooltip } from "../../../components/ui/Tooltip";
import { STAGE_DOT_CLASSES } from "./constants";

export const StageDot = ({ label, status, error, icon: Icon }) => {
  const cls = STAGE_DOT_CLASSES[status] || STAGE_DOT_CLASSES.Pending;
  const tooltip = `${label}: ${status}${status === "Failed" && error?.message ? ` — ${error.message}` : ""}`;
  return (
    <Tooltip content={tooltip}>
      <span className={`flex size-6 items-center justify-center rounded-md border ${cls}`}>
        <Icon className="size-3.5" />
      </span>
    </Tooltip>
  );
};
