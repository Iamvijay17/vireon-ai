import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Input, Label } from "../../components/ui/Input";
import { EmptyState, ErrorState } from "../../components";
import { useSocialPosts, useLivePosts } from "./usePromotion";
import { PlatformBadge, StatusBadge, PostProgress, RemoteLink, SkeletonRows } from "./shared";
import { PostActionButtons } from "./PostActions";
import { usePostActions } from "./usePostActions";
import { PostDetailModal } from "./PostDetailModal";
import { STATUS_FILTERS, PLATFORMS, platformLabel, statusMeta, formatInZone, mergeLive, FORMAT_LABEL } from "./format";

const PAGE_SIZE = 15;
const ALL = "";

const QUICK = [
  { key: "all", label: "All", filter: {} },
  { key: "scheduled", label: "Scheduled", filter: { status: "SCHEDULED" } },
  { key: "active", label: "In progress", filter: { finished: "false", exclude: "SCHEDULED" } },
  { key: "published", label: "Published", filter: { status: "COMPLETED" } },
  { key: "failed", label: "Failed", filter: { status: "FAILED" } },
];

/**
 * Every post to every destination, one row each: where it stands, when, the platform's own link, and (for a
 * failure) what went wrong and what to do. Filter by platform, status and date; open a row for the full record.
 */
export const PostsPanel = ({ accounts }) => {
  const [quick, setQuick] = useState("all");
  const [platform, setPlatform] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  const quickFilter = QUICK.find((q) => q.key === quick)?.filter || {};
  const params = useMemo(() => {
    const p = { page, limit: PAGE_SIZE };
    if (platform) p.platform = platform;
    if (accountId) p.accountId = accountId;
    const st = status || quickFilter.status;
    if (st) p.status = st;
    else if (quickFilter.finished) p.finished = quickFilter.finished;
    if (from) p.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) p.to = new Date(`${to}T23:59:59`).toISOString();
    return p;
  }, [page, platform, status, accountId, from, to, quickFilter.status, quickFilter.finished]);

  const { data, loading, error, refetch } = useSocialPosts(params);
  const live = useLivePosts();
  const actions = usePostActions();
  const posts = useMemo(() => (data?.posts || []).map((p) => mergeLive(p, live[p._id])).filter((p) => !(quickFilter.exclude && p.status === quickFilter.exclude)), [data, live, quickFilter.exclude]);
  const pagination = data?.pagination;

  const reset = (fn) => (v) => { fn(v); setPage(1); };

  const columns = [
    { key: "platform", title: "Platform", render: (p) => <div><PlatformBadge platform={p.platform} /><p className="mt-0.5 text-xs text-text-tertiary">{p.accountLabel}{p.accountHandle ? ` · @${p.accountHandle}` : ""}</p></div> },
    { key: "post", title: "Post", render: (p) => (
      <div className="max-w-xs">
        <p className="line-clamp-2 text-[13px] text-text-primary">{p.content?.caption || <span className="text-text-tertiary">(no text)</span>}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{FORMAT_LABEL[p.format]}</p>
      </div>
    ) },
    { key: "status", title: "Status", render: (p) => (
      <div className="space-y-1.5"><StatusBadge status={p.status} />
        {p.status === "FAILED" && p.error?.message && <p className="max-w-56 text-xs text-danger-500">{p.error.message}</p>}
        {p.status === "RETRYING" && <p className="text-xs text-text-tertiary">Attempt {p.attempts} of {p.maxAttempts}</p>}
      </div>
    ) },
    { key: "progress", title: "Progress", render: (p) => <PostProgress post={p} /> },
    { key: "when", title: "When", render: (p) => {
      const at = p.status === "SCHEDULED" ? p.scheduledFor : p.remote?.publishedAt || p.completedAt || p.createdAt;
      return <div className="text-[13px] text-text-secondary"><p>{formatInZone(at, p.status === "SCHEDULED" ? p.timezone || undefined : undefined)}</p>{p.status === "SCHEDULED" && p.timezone && <p className="text-xs text-text-tertiary">{p.timezone.replace(/_/g, " ")}</p>}</div>;
    } },
    { key: "link", title: "Link", render: (p) => <RemoteLink url={p.remote?.permalink}>Open</RemoteLink> },
    { key: "actions", title: "", align: "right", render: (p) => <div onClick={(e) => e.stopPropagation()}><PostActionButtons post={p} actions={actions} onEdit={() => setOpenId(p._id)} /></div> },
  ];

  const accountOptions = [{ value: ALL, label: "All accounts" }, ...accounts.map((a) => ({ value: a._id, label: `${platformLabel(a.platform)} · ${a.displayName}` }))];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Posts"
          subtitle="Every destination of every promotion is its own row, so a failure on one never hides a success on another."
          extra={(
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick filters">
              {QUICK.map((q) => (
                <Button key={q.key} size="xs" variant={quick === q.key ? "primary" : "secondary"} aria-pressed={quick === q.key} onClick={() => { setQuick(q.key); setStatus(ALL); setPage(1); }}>{q.label}</Button>
              ))}
            </div>
          )}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><Label>Platform</Label><Select value={platform} onChange={reset(setPlatform)} options={[{ value: ALL, label: "All platforms" }, ...PLATFORMS.map((p) => ({ value: p, label: platformLabel(p) }))]} /></div>
            <div><Label>Status</Label><Select value={status} onChange={reset((v) => { setStatus(v); setQuick("all"); })} options={[{ value: ALL, label: "Any status" }, ...STATUS_FILTERS.map((s) => ({ value: s, label: statusMeta(s).label }))]} /></div>
            <div><Label>Account</Label><Select value={accountId} onChange={reset(setAccountId)} options={accountOptions} /></div>
            <div><Label htmlFor="posts-from">From</Label><Input id="posts-from" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></div>
            <div><Label htmlFor="posts-to">To</Label><Input id="posts-to" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></div>
          </div>

          {error && <ErrorState message="Could not load posts" onRetry={refetch} />}
          {loading ? <SkeletonRows rows={4} /> : (
            <Table
              columns={columns} data={posts} rowKey="_id" onRowClick={(p) => setOpenId(p._id)}
              emptyContent={<EmptyState description={quick === "all" && !platform && !status && !from && !to ? "Nothing posted yet. Create a promotion to get started." : "No posts match these filters."} />}
            />
          )}

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between text-[13px] text-text-secondary">
              <span><Filter className="mr-1 inline size-3.5" />{pagination.total} post{pagination.total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-4" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" />
                <span>Page {pagination.page} of {pagination.pages}</span>
                <Button size="sm" variant="secondary" icon={<ChevronRight className="size-4" />} disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page" />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {openId && <PostDetailModal postId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default PostsPanel;
