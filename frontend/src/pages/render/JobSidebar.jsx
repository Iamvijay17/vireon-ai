import { useState } from "react";
import { Copy } from "lucide-react";
import { JobEventTimeline } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Timeline } from "../../components/ui/Timeline";
import { Badge } from "../../components/ui/Badge";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { Tabs } from "../../components/ui/Tabs";

/** Right column: the job's details (with a copyable id) and its event / activity history. */
export function JobSidebar({ job, jobEvents, eventsLoading, activityLog }) {
  const [copied, setCopied] = useState(false);
  const [historyTab, setHistoryTab] = useState("events");

  const copyJobId = async () => {
    await navigator.clipboard.writeText(job?._id || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const details = [
    {
      label: "Job ID",
      value: (
        <button onClick={copyJobId} className="flex items-center gap-1.5 font-mono text-xs hover:text-accent cursor-pointer">
          {job?._id}
          <Copy className="size-3" />
          {copied && <span className="text-[11px] text-accent">Copied</span>}
        </button>
      ),
    },
    { label: "Type", value: <Badge>{job?.type}</Badge> },
    { label: "Resolution", value: job?.resolution || "—" },
    { label: "Language", value: job?.language || "—" },
    { label: "Voice", value: job?.voice || "—" },
    { label: "Created", value: job?.createdAt ? new Date(job.createdAt).toLocaleString() : "—" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="h-fit animate-slide-up" style={{ "--stagger-index": 0.5 }}>
        <CardHeader title="Details" />
        <div className="p-5">
          <DescriptionList items={details} columns={1} />
        </div>
      </Card>

      <Card className="h-fit animate-slide-up" style={{ "--stagger-index": 1 }}>
        <CardHeader title="History" />
        <Tabs
          className="px-3"
          active={historyTab}
          onChange={setHistoryTab}
          items={[
            { key: "events", label: `Events${jobEvents.length ? ` (${jobEvents.length})` : ""}` },
            { key: "activity", label: "Activity Log" },
          ]}
        />
        <div className="h-[420px] overflow-y-auto p-5">
          {historyTab === "events" ? (
            <JobEventTimeline events={jobEvents} emptyText={eventsLoading ? "Loading events..." : "No events recorded yet"} />
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
