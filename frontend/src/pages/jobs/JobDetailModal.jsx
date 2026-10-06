import { LoadingState, StatusTag, JobEventTimeline } from "../../components";
import { useJobDetail } from "../../lib/useJobs";
import { useJobEvents } from "../../shared/useJobEvents";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { TYPE_BADGE, ROUTE_FOR } from "./constants";

/**
 * Drill-down for one job: its lessons (courses), its event timeline (video
 * jobs) or its activity log (everything else). `job` is the clicked row, or
 * null when closed.
 */
export function JobDetailModal({ job, onClose, navigate }) {
  // Fetched by the drawer's own query rather than an imperative loader, so
  // a socket event for this job refreshes the open drawer too - the old
  // version only ever showed what was true when it was opened.
  const { detail: fetchedDetail, loading: detailLoading } = useJobDetail(job?.type, job?.id, { enabled: Boolean(job) });

  // Render the clicked row immediately while its full record loads, which
  // is what the old openDetail's optimistic setDetail was doing.
  const detail = fetchedDetail || (job ? { job, logs: [], lessons: [] } : null);

  // Only the video pipeline records JobEvents today; other types fall back
  // to the human-readable activity log below.
  const detailHasEvents = detail?.job?.type === "video";
  const { events: detailEvents, loading: detailEventsLoading } = useJobEvents(
    detail?.job?.type,
    detail?.job?.id,
    { enabled: detailHasEvents }
  );

  return (
    <Modal open={!!job} onClose={onClose} title={detail?.job?.title} width="lg">
      {detailLoading ? (
        <LoadingState label="Loading details..." />
      ) : detail ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={TYPE_BADGE[detail.job.type].variant}>{TYPE_BADGE[detail.job.type].label}</Badge>
            <StatusTag status={detail.job.status} />
            {detail.job.error && <span className="text-xs text-danger-500">{detail.job.error}</span>}
          </div>

          {detail.job.type === "course" ? (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold text-text-primary">Lessons</h4>
              {detail.lessons.length === 0 ? (
                <p className="text-sm text-text-tertiary">No lessons yet.</p>
              ) : (
                <div className="max-h-80 divide-y divide-border-light overflow-y-auto">
                  {detail.lessons.map((lesson) => (
                    <div key={lesson._id} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-sm text-text-secondary">{lesson.title}</span>
                      <StatusTag status={lesson.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : detailHasEvents ? (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold text-text-primary">Events</h4>
              <div className="max-h-80 overflow-y-auto pr-1">
                <JobEventTimeline
                  events={detailEvents}
                  emptyText={detailEventsLoading ? "Loading events..." : "No events recorded yet"}
                />
              </div>
            </div>
          ) : detail.logs.length > 0 ? (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold text-text-primary">Activity</h4>
              <div className="max-h-80 divide-y divide-border-light overflow-y-auto">
                {detail.logs.map((log) => (
                  <div key={log._id} className="py-2">
                    <p className="text-sm text-text-secondary">{log.text}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{new Date(log.timestamp).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No activity recorded yet.</p>
          )}

          <div className="flex justify-end border-t border-border-light pt-3">
            <Button variant="secondary" size="sm" onClick={() => navigate(ROUTE_FOR[detail.job.type](detail.job.id))}>
              Open
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
