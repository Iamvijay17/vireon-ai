import { CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "../ui/Badge";
import { classifyStatus } from "../../lib/statusTone";

const VARIANTS = {
  success: { variant: "success", Icon: CheckCircle2, spin: false },
  error: { variant: "danger", Icon: XCircle, spin: false },
  default: { variant: "neutral", Icon: Clock, spin: false },
  processing: { variant: "accent", Icon: RefreshCw, spin: true },
};

const formatLabel = (status) => (status || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

const StatusTag = ({ status, label }) => {
  const { variant, Icon, spin } = VARIANTS[classifyStatus(status)];
  return (
    <Badge variant={variant} icon={<Icon className={spin ? "size-3 animate-spin" : "size-3"} />}>
      {label || formatLabel(status)}
    </Badge>
  );
};

export default StatusTag;
