import { CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "../ui/Badge";

/**
 * Single status -> color/icon/label mapping, used everywhere a job/course/
 * video status is rendered, instead of each page keeping its own ad hoc
 * STATUS_MAP or hardcoded hex colors.
 *
 * Works across the pipeline's current mixed status vocabularies (SCREAMING_
 * CASE machine tokens and "Title Case" human strings) via keyword matching,
 * so it doesn't need to change when the backend's enums get unified.
 */
const classify = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("fail")) return "error";
  if (s.includes("complete") || s.includes("done") || s.includes("approved")) return "success";
  if (s.includes("queue") || s.includes("draft") || s.includes("waiting")) return "default";
  return "processing"; // generating / rendering / preparing / uploading / in-progress
};

const VARIANTS = {
  success: { variant: "success", Icon: CheckCircle2, spin: false },
  error: { variant: "danger", Icon: XCircle, spin: false },
  default: { variant: "neutral", Icon: Clock, spin: false },
  processing: { variant: "accent", Icon: RefreshCw, spin: true },
};

const formatLabel = (status) => (status || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

const StatusTag = ({ status, label }) => {
  const { variant, Icon, spin } = VARIANTS[classify(status)];
  return (
    <Badge variant={variant} icon={<Icon className={spin ? "size-3 animate-spin" : "size-3"} />}>
      {label || formatLabel(status)}
    </Badge>
  );
};

export default StatusTag;
