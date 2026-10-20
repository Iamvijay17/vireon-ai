import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { JobEventTimeline } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Timeline } from "../../components/ui/Timeline";
import { Tabs } from "../../components/ui/Tabs";
import { typeLabel } from "../../lib/projectModel";

const Row = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <dt className="shrink-0 text-xs text-text-tertiary">{label}</dt>
    <dd className="min-w-0 truncate text-right text-[13px] text-text-primary">{children}</dd>
  </div>
);

/** Right column: the job's details (with a copyable id) and its event / activity history. */
export function JobSidebar({ job, jobEvents, eventsLoading, activityLog }) {
  const [copied, setCopied] = useState(false);
  const [historyTab, setHistoryTab] = useState("events");

  const copyJobId = async () => {
    try {
      await navigator.clipboard.writeText(job?._id || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure origin): the id is selectable on screen.
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
      <Card>
        <CardHeader title="Details" />
        <dl className="divide-y divide-border-light px-4">
          <Row label="Job ID">
            <button onClick={copyJobId} className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-xs text-text-secondary hover:text-accent-fg" aria-label="Copy job ID">
              {job?._id}
              {copied ? <Check className="size-3 text-success-500" /> : <Copy className="size-3" />}
            </button>
          </Row>
          <Row label="Type">{typeLabel(job?.type) || "—"}</Row>
          <Row label="Format">{[job?.aspectRatio, job?.resolution].filter(Boolean).join(" · ") || "—"}</Row>
          <Row label="Quality">{job?.quality || "—"}</Row>
          <Row label="Language">{job?.language || "—"}</Row>
          <Row label="Voice">{job?.voice || "—"}</Row>
          <Row label="Created">{job?.createdAt ? new Date(job.createdAt).toLocaleString() : "—"}</Row>
        </dl>
      </Card>

      <Card>
        <CardHeader title="History" />
        <Tabs
          className="px-3"
          active={historyTab}
          onChange={setHistoryTab}
          items={[
            { key: "events", label: `Events${jobEvents.length ? ` (${jobEvents.length})` : ""}` },
            { key: "activity", label: "Activity log" },
          ]}
        />
        <div className="max-h-[26rem] overflow-y-auto p-4">
          {historyTab === "events" ? (
            <JobEventTimeline events={jobEvents} emptyText={eventsLoading ? "Loading events…" : "No events recorded yet"} />
          ) : activityLog.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">No activity yet</p>
          ) : (
            <Timeline items={activityLog.slice(0, 20).map((entry) => ({ title: entry.text, timestamp: entry.time }))} />
          )}
        </div>
      </Card>
    </div>
  );
}
