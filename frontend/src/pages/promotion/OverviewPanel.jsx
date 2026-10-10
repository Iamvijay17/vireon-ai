import { Link2, Wand2, CalendarClock, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { ErrorState, EmptyState } from "../../components";
import { useSocialOverview } from "./usePromotion";
import { PlatformBadge, StatusBadge, SkeletonRows, ErrorNotice } from "./shared";
import { formatInZone, describeDistance } from "./format";

const Tile = ({ label, value, tone }) => (
  <div className="rounded-xl border border-border-light p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
    <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone || "text-text-primary"}`}>{value}</p>
  </div>
);

/** Where things stand: accounts needing attention, what is about to go out, what failed recently. */
export const OverviewPanel = ({ caps, go }) => {
  const { data, loading, error, refetch } = useSocialOverview();
  const unconfigured = caps && !caps.platforms?.facebook?.configured && !caps.platforms?.threads?.configured;

  return (
    <div className="space-y-4">
      {unconfigured && (
        <Alert type="warning" title="Promotion Studio is not set up yet" action={<Button size="sm" variant="secondary" onClick={() => go("accounts")}>Open Accounts</Button>}>
          Add your Meta and/or Threads app credentials to <code>backend/.env</code> to connect accounts. Nothing is ever posted until you connect an account and press the publish button. See <code>docs/social-promotion.md</code>.
        </Alert>
      )}
      {error && <ErrorState message="Could not load the overview" onRetry={refetch} />}
      {loading ? <SkeletonRows rows={3} /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Connected accounts" value={data.accounts.total} />
            <Tile label="Scheduled" value={data.scheduledTotal} />
            <Tile label="Published (7 days)" value={data.last7Days.published} tone="text-success-600" />
            <Tile label="In progress" value={data.last7Days.inFlight} />
            <Tile label="Failed (7 days)" value={data.last7Days.failed} tone={data.last7Days.failed ? "text-danger-500" : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Coming up" extra={<Button size="sm" variant="ghost" icon={<CalendarClock className="size-4" />} onClick={() => go("calendar")}>Calendar</Button>} />
              <CardBody className="space-y-3">
                {data.upcoming.length === 0 && <EmptyState description="Nothing scheduled." actionLabel="Create a promotion" actionIcon={<Wand2 className="size-4" />} onAction={() => go("create")} />}
                {data.upcoming.map((p) => (
                  <div key={p._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-light p-3">
                    <PlatformBadge platform={p.platform} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-text-primary">{p.content?.caption || "(no text)"}</p>
                      <p className="text-xs text-text-tertiary">{formatInZone(p.scheduledFor, p.timezone || undefined)} · {describeDistance(p.scheduledFor)}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Needs attention" extra={<Button size="sm" variant="ghost" onClick={() => go("posts")}>All posts</Button>} />
              <CardBody className="space-y-3">
                {data.needsAttention.length === 0 && <p className="py-6 text-center text-sm text-text-tertiary">No failed posts.</p>}
                {data.needsAttention.map((p) => (
                  <div key={p._id} className="space-y-2 rounded-xl border border-border-light p-3">
                    <div className="flex flex-wrap items-center gap-2"><PlatformBadge platform={p.platform} /><StatusBadge status={p.status} /></div>
                    <ErrorNotice error={p.error} />
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          {data.accounts.total === 0 && (
            <Card><CardBody><EmptyState description="Connect a Facebook Page, Instagram account or Threads profile to start promoting your videos." actionLabel="Connect an account" actionIcon={<Link2 className="size-4" />} onAction={() => go("accounts")} /></CardBody></Card>
          )}
          <p className="flex items-center gap-1.5 text-xs text-text-tertiary"><TriangleAlert className="size-3.5" />Posts made through connected accounts are real posts. Meta offers no publishing sandbox.</p>
        </>
      )}
    </div>
  );
};

export default OverviewPanel;
