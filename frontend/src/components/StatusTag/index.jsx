import { Tag } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";

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
  success: { color: "success", icon: <CheckCircleOutlined /> },
  error: { color: "error", icon: <CloseCircleOutlined /> },
  default: { color: "default", icon: <ClockCircleOutlined /> },
  processing: { color: "processing", icon: <SyncOutlined spin /> },
};

const formatLabel = (status) =>
  (status || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

const StatusTag = ({ status, label }) => {
  const variant = VARIANTS[classify(status)];
  return (
    <Tag color={variant.color} icon={variant.icon}>
      {label || formatLabel(status)}
    </Tag>
  );
};

export default StatusTag;
