import { useState } from "react";
import { cancelJob, retryJob, bulkJobAction } from "../../services/api";
import { useInvalidateJobs } from "../../lib/useJobs";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { rowKeyOf } from "./constants";

/**
 * Cancel / retry / delete for one row or for the selection. Each asks for
 * confirmation first and invalidates every jobs query after, so the list and
 * an open detail modal both refresh. `rowActionKey` is the row whose action
 * is in flight (its menu button shows a spinner).
 */
export function useJobActions({ selectedJobs, clearSelection }) {
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rowActionKey, setRowActionKey] = useState(null);
  const invalidateJobs = useInvalidateJobs();

  const runRowAction = async (job, { confirm, run, success, failure }) => {
    const ok = await confirmDialog(confirm);
    if (!ok) return;
    setRowActionKey(rowKeyOf(job));
    try {
      await run();
      toast.success(success);
      invalidateJobs();
    } catch (err) {
      toast.error(err.friendlyMessage || failure);
    } finally {
      setRowActionKey(null);
    }
  };

  const handleCancel = (job) =>
    runRowAction(job, {
      confirm: { title: "Cancel this job?", content: `"${job.title}" will be marked cancelled.`, confirmText: "Cancel Job", danger: true },
      run: () => cancelJob(job.type, job.id),
      success: `Cancelled "${job.title}"`,
      failure: "Failed to cancel job",
    });

  const handleRetry = (job) =>
    runRowAction(job, {
      confirm: { title: "Retry this job?", content: `"${job.title}" will be re-queued from where it left off.`, confirmText: "Retry" },
      run: () => retryJob(job.type, job.id),
      success: `Retried "${job.title}"`,
      failure: "Failed to retry job",
    });

  const handleDelete = (job) =>
    runRowAction(job, {
      confirm: { title: `Delete "${job.title}"?`, content: "This can't be undone.", confirmText: "Delete", danger: true },
      run: () => bulkJobAction([{ type: job.type, id: job.id }], "delete"),
      success: `Deleted "${job.title}"`,
      failure: "Failed to delete job",
    });

  const handleBulkAction = async (action) => {
    const items = selectedJobs.map((j) => ({ type: j.type, id: j.id }));
    if (items.length === 0) return;

    const label = { cancel: "Cancel", retry: "Retry", delete: "Delete" }[action];
    const ok = await confirmDialog({
      title: `${label} ${items.length} selected job${items.length === 1 ? "" : "s"}?`,
      content:
        action === "delete"
          ? "This can't be undone. Jobs that don't support this action will be skipped."
          : "Jobs that don't support this action will be skipped.",
      confirmText: label,
      danger: action !== "retry",
    });
    if (!ok) return;

    setBulkLoading(true);
    try {
      const res = await bulkJobAction(items, action);
      const { succeeded = [], failed = [] } = res.data;
      if (failed.length === 0) {
        toast.success(`${label}d ${succeeded.length}/${items.length} job${items.length === 1 ? "" : "s"}`);
      } else {
        toast.error(`${label}d ${succeeded.length}/${items.length} jobs - ${failed.length} skipped/failed`);
      }
      invalidateJobs();
      clearSelection();
    } catch (err) {
      toast.error(err.friendlyMessage || `Failed to ${action} jobs`);
    } finally {
      setBulkLoading(false);
    }
  };

  return { bulkLoading, rowActionKey, handleCancel, handleRetry, handleDelete, handleBulkAction };
}
