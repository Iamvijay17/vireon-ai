import { CheckCircle2, Square, Trash2 } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { BULK_ACTIONS } from "./constants";
import { videoCanApprove, ACTION_GATES } from "./helpers";

/**
 * Shown while lessons are selected. Each step's button is disabled unless at
 * least one selected lesson is eligible for it (see helpers.ACTION_GATES).
 */
export function BulkActionBar({ videos, actions }) {
  const { selectedIds, bulkActionLoading, clearSelection, runGenerateAction, handleBulkApprove, handleBulkStop, handleBulkDelete } = actions;
  if (selectedIds.size === 0) return null;

  const selectedVideos = videos.filter((v) => selectedIds.has(v._id));
  const canApproveSelected = selectedVideos.some(videoCanApprove);
  const ids = () => Array.from(selectedIds);

  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-text-primary">{selectedIds.size} selected</span>
        <Button variant="ghost" size="sm" onClick={clearSelection}>
          Clear
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckCircle2 className="size-3.5" />}
            loading={bulkActionLoading === "approve-script"}
            disabled={!canApproveSelected}
            title={!canApproveSelected ? "None of the selected lessons have a script ready to approve" : undefined}
            onClick={() => handleBulkApprove(ids())}
          >
            Approve Scripts
          </Button>
          {BULK_ACTIONS.map(({ action, label, icon: Icon }) => {
            const eligible = selectedVideos.some(ACTION_GATES[action].eligible);
            return (
              <Button
                key={action}
                variant="secondary"
                size="sm"
                icon={<Icon className="size-3.5" />}
                loading={bulkActionLoading === action}
                disabled={!eligible}
                title={!eligible ? "None of the selected lessons are eligible for this step" : undefined}
                onClick={() => runGenerateAction(ids(), action, { bulk: true })}
              >
                {label}
              </Button>
            );
          })}
          <Button
            variant="danger"
            size="sm"
            icon={<Square className="size-3.5" />}
            loading={bulkActionLoading === "bulk-stop"}
            onClick={() => handleBulkStop(ids())}
          >
            Stop
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="size-3.5" />}
            loading={bulkActionLoading === "bulk-delete"}
            onClick={() => handleBulkDelete(ids())}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
