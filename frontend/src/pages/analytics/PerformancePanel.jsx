import { useState } from "react";
import { SlidersHorizontal, GitCompareArrows } from "lucide-react";
import { getBenchmarks, compareBenchmarks, getPerfProfile } from "../../services/api";
import { LoadingState, EmptyState } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Table } from "../../components/ui/Table";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { formatDuration } from "./format";
import { showDuration, showMb, describeDelta, deltaTone } from "./controlCenterFormat";

const PROFILE_LABELS = { "low-memory": "Low memory", balanced: "Balanced", throughput: "Throughput", preview: "Preview" };
const profileLabel = (name) => PROFILE_LABELS[name] || name;

const knobSource = (source) => {
  if (!source) return "";
  if (source === "remotion-default") return "Remotion's own default";
  if (source.startsWith("profile:")) return `set by the ${profileLabel(source.slice(8))} profile`;
  return `set by ${source}`;
};

function ProfileCard() {
  const { data, loading } = useApiQuery(queryKeys.analytics.perfProfile, getPerfProfile, {
    errorMessage: "Failed to load the performance profile",
  });
  if (loading && !data) return <LoadingState label="Loading performance profile..." />;
  if (!data) return null;
  const { active, recommendation, profiles } = data;
  const suggestsChange = recommendation.profile !== active.name;

  return (
    <div className="p-4" data-testid="perf-profile">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-text-primary">Active profile: {profileLabel(active.name)}</p>
        {!active.recognised && <Badge variant="warning">"{active.requested}" is not a profile - using Balanced</Badge>}
        {suggestsChange && <Badge variant="warning">Suggested now: {profileLabel(recommendation.profile)}</Badge>}
      </div>
      <p className="mt-1 text-xs text-text-secondary">{active.description}</p>
      <p className="mt-1 text-xs text-text-tertiary">
        Render tabs: {active.knobs.remotionConcurrency ?? "default"} ({knobSource(active.source.remotionConcurrency)}). Set with PERF_PROFILE in .env; nothing changes automatically.
      </p>
      {suggestsChange && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-text-secondary" data-testid="perf-recommendation">
          {recommendation.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {profiles.map((p) => (
          <div key={p.name} className={`rounded-xl border p-3 ${p.active ? "border-accent-500" : "border-border-light"}`}>
            <p className="text-[13px] font-semibold text-text-primary">{profileLabel(p.name)}</p>
            <p className="mt-0.5 text-xs text-text-secondary">{p.description}</p>
            {Object.values(p.evidence).map((e) => <p key={e} className="mt-1 text-[11px] text-text-tertiary">Evidence: {e}</p>)}
            {p.unmeasured.length > 0 && <p className="mt-1 text-[11px] text-text-tertiary">Not measured yet: {p.unmeasured.join(", ")}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

const rankSummary = (run) => {
  const top = run.ranking?.[0];
  return top ? `${top.key} (${top.sharePct}%)` : "—";
};

function Comparison({ beforeId, afterId }) {
  const { data, loading } = useApiQuery(
    queryKeys.analytics.benchmarkCompare(beforeId, afterId),
    () => compareBenchmarks(beforeId, afterId),
    { errorMessage: "Failed to compare the runs" }
  );
  if (loading && !data) return <LoadingState label="Comparing..." />;
  if (!data) return null;
  const { before, after, comparison } = data;
  const rows = comparison.rows.filter((r) => r.beforeMs !== null || r.afterMs !== null);

  return (
    <div className="border-t border-border-light p-4" data-testid="benchmark-compare">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-text-primary">{before.label || "Before"} → {after.label || "After"}</p>
        <Badge variant={deltaTone(comparison.totalDeltaPct)}>Total: {describeDelta(comparison.totalDeltaPct)}</Badge>
        <Badge variant={deltaTone(comparison.perSceneDeltaPct)}>Per scene: {describeDelta(comparison.perSceneDeltaPct)}</Badge>
      </div>
      {comparison.caveat && <p className="mt-2 text-xs text-warning-600 dark:text-warning-500" data-testid="compare-caveat">{comparison.caveat}</p>}
      <p className="mt-1 text-[11px] text-text-tertiary">
        One run of each is not a benchmark: the script differs every time, so changes under 5% are within noise.
      </p>
      <Table
        rowKey="key"
        className="mt-3"
        data={rows}
        columns={[
          { key: "label", title: "Stage", render: (r) => <span className="font-medium text-text-primary">{r.label}</span> },
          { key: "b", title: "Before", align: "right", render: (r) => showDuration(r.beforeMs) },
          { key: "a", title: "After", align: "right", render: (r) => showDuration(r.afterMs) },
          { key: "d", title: "Change", align: "right", render: (r) => describeDelta(r.deltaPct) },
          { key: "ps", title: "Per scene", align: "right", render: (r) => `${showDuration(r.beforePerSceneMs)} → ${showDuration(r.afterPerSceneMs)}` },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-text-secondary">
        {[["Before", before], ["After", after]].map(([name, run]) => (
          <div key={name}>
            <p className="font-medium text-text-primary">{name}: peak memory</p>
            <p>VRAM {showMb(run.peak.vram?.peakUsedMb)} of {showMb(run.peak.vram?.totalMb)}{run.peak.vram ? ` (${run.peak.vram.stage})` : ""}</p>
            <p>RAM {showMb(run.peak.ram?.peakUsedMb)}{run.peak.ram ? ` (${run.peak.ram.stage})` : ""}</p>
            {run.validation && <p>Output check: {run.validation.status ?? "—"}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Performance: the active profile with the evidence behind it, and the stored benchmark runs
 * (scripts/benchPipeline.js) with a before/after comparison. Real backend data only; a figure
 * that was not measured is "—".
 */
export function PerformancePanel() {
  const { data, loading } = useApiQuery(queryKeys.analytics.benchmarks, () => getBenchmarks(20), {
    errorMessage: "Failed to load benchmark history",
  });
  const [beforeId, setBeforeId] = useState(null);
  const [afterId, setAfterId] = useState(null);
  const runs = data?.runs || [];

  const columns = [
    { key: "label", title: "Run", render: (r) => <span className="font-medium text-text-primary">{r.label || r.id.slice(-6)}</span> },
    { key: "when", title: "Finished", render: (r) => new Date(r.finishedAt).toLocaleString() },
    { key: "status", title: "Result", render: (r) => <Badge variant={r.status === "COMPLETED" ? "success" : "danger"}>{r.status === "COMPLETED" ? "completed" : r.status.toLowerCase()}</Badge> },
    { key: "total", title: "Total", align: "right", render: (r) => formatDuration(r.totalMs) },
    { key: "scenes", title: "Scenes", align: "right", render: (r) => r.workload?.scenes ?? "—" },
    { key: "slow", title: "Slowest stage", render: rankSummary },
    { key: "pick", title: "Compare", align: "right", render: (r) => (
      <span className="inline-flex gap-1">
        <Button size="sm" variant={beforeId === r.id ? "primary" : "secondary"} onClick={() => setBeforeId(beforeId === r.id ? null : r.id)} aria-label={`Use ${r.label || r.id} as before`}>Before</Button>
        <Button size="sm" variant={afterId === r.id ? "primary" : "secondary"} onClick={() => setAfterId(afterId === r.id ? null : r.id)} aria-label={`Use ${r.label || r.id} as after`}>After</Button>
      </span>
    ) },
  ];

  return (
    <div className="mt-4 space-y-4" data-testid="performance-panel">
      <Card className="overflow-hidden">
        <CardHeader title={<span className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-text-tertiary" /> Performance profile</span>} subtitle="Runtime settings for this machine, and what each one is based on" />
        <ProfileCard />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={<span className="flex items-center gap-2"><GitCompareArrows className="size-4 text-text-tertiary" /> Benchmarks</span>} subtitle="Real runs recorded by scripts/benchPipeline.js; pick a Before and an After" />
        {loading && !data ? (
          <LoadingState label="Loading benchmarks..." />
        ) : runs.length === 0 ? (
          <EmptyState description="No benchmark runs stored yet. Run: node scripts/benchPipeline.js --label baseline" />
        ) : (
          <Table rowKey="id" data={runs} columns={columns} />
        )}
        {beforeId && afterId && beforeId !== afterId && <Comparison beforeId={beforeId} afterId={afterId} />}
        {beforeId && afterId && beforeId === afterId && <p className="border-t border-border-light p-4 text-xs text-text-tertiary">Pick two different runs to compare.</p>}
      </Card>
    </div>
  );
}
