import { useState } from "react";
import { CheckCircle2, Copy, Check } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import StatusBadge from "../../components/StatusBadge";

const NEXT_STEPS = (values) => {
  if (!values.fastGeneration) {
    return ["The script is written first.", "You then approve it, generate the audio, and start the render yourself - each from the project page."];
  }
  if (values.autoApprove) {
    return ["The script, audio, images and render run one after another with no pauses.", "You will be notified here when it finishes or fails."];
  }
  return ["The script is written first and waits for your approval.", "Once you approve it, audio, images and the render run automatically."];
};

/** Confirmation once the job exists: its id, status and what happens next. */
export function JobCreated({ result, values, onViewProgress, onCreateAnother, onProjects }) {
  const [copied, setCopied] = useState(false);

  const copyJobId = async () => {
    if (!result?.jobId) return;
    try {
      await navigator.clipboard.writeText(result.jobId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure origin); the id is visible to copy by hand.
    }
  };

  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="flex flex-col items-center text-center animate-scale-in">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-success-500/10 text-success-500">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Video job created</h2>
        <p className="mt-1.5 text-[13px] text-text-secondary">It is queued for processing. You can follow it live.</p>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-bg p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-tertiary">Job ID</span>
          <button onClick={copyJobId} className="flex cursor-pointer items-center gap-1 text-xs font-medium text-text-secondary hover:text-accent-fg">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1 truncate font-mono text-[13px] text-text-primary">{result.jobId}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-text-tertiary">Status</span>
          <StatusBadge status={result.status} />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-text-secondary">What happens next</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-text-tertiary">
          {NEXT_STEPS(values).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onViewProgress}>
          View progress
        </Button>
        <Button variant="secondary" onClick={onCreateAnother}>
          Create another
        </Button>
        <Button variant="ghost" onClick={onProjects}>
          My projects
        </Button>
      </div>
    </Card>
  );
}
