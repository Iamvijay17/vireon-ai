import { useState, useCallback } from "react";
import { getVideoJobActivityLogs } from "../../services/api";

function formatActivityTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();

  const diffDays = Math.round((today - target) / 86400000);

  let label;
  if (diffDays === 0) {
    label = "today";
  } else if (diffDays === 1) {
    label = "yesterday";
  } else if (diffDays > 1 && target >= startOfWeek) {
    label = date.toLocaleDateString("en-US", { weekday: "long" });
  } else if (diffDays <= 7) {
    label = date.toLocaleDateString("en-US", { weekday: "long" });
  } else if (diffDays <= 14) {
    label = "last week";
  } else if (diffDays <= 60) {
    label = "last month";
  } else {
    label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return `${label} ${timeStr}`;
}

export function useActivityLog() {
  const [activityLog, setActivityLog] = useState([]);

  const fetchActivityLogs = useCallback(async (currentJobId) => {
    if (!currentJobId) return;
    try {
      const res = await getVideoJobActivityLogs(currentJobId);
      setActivityLog(
        (res.data.logs || []).map((log) => ({
          text: log.text,
          time: formatActivityTime(log.timestamp),
        }))
      );
    } catch {
      // Ignore errors fetching logs
    }
  }, []);

  return { activityLog, fetchActivityLogs };
}
