import { useState, useCallback } from "react";
import { getCourseVideoActivityLogs } from "../../../services/api";

function formatActivityTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Format time like "6:21 pm"
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
    // Within the current week (but not today/yesterday)
    label = date.toLocaleDateString("en-US", { weekday: "long" });
  } else if (diffDays <= 7) {
    // Within the last 7 days but previous week
    label = date.toLocaleDateString("en-US", { weekday: "long" });
  } else if (diffDays <= 14) {
    label = "last week";
  } else if (diffDays <= 60) {
    label = "last month";
  } else {
    // For older entries, show date
    label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return `${label} ${timeStr}`;
}

/**
 * Owns the pipeline activity log's state: the durable server-backed log
 * (fetchActivityLogs) plus optimistic local entries appended immediately
 * on user/socket actions (addActivity) so the timeline feels instant
 * rather than waiting for the next fetch.
 */
export function useActivityLog(videoId) {
  const [activityLog, setActivityLog] = useState([]);

  const fetchActivityLogs = useCallback(async () => {
    try {
      const res = await getCourseVideoActivityLogs(videoId);
      setActivityLog(
        (res.data.logs || []).map((log) => ({
          text: log.text,
          time: formatActivityTime(log.timestamp),
        }))
      );
    } catch {
      // Ignore errors fetching logs
    }
  }, [videoId]);

  const addActivity = useCallback((text, timestamp) => {
    setActivityLog((prev) => [
      { text, time: timestamp ? formatActivityTime(timestamp) : formatActivityTime(new Date().toISOString()) },
      ...prev,
    ]);
  }, []);

  return { activityLog, fetchActivityLogs, addActivity };
}
