import { useState } from "react";
import { CheckCircle2, Rocket, Copy, Check } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";

/** Confirmation shown once the job is created, with its id and next steps. */
export function JobCreated({ result, onViewProgress, onCreateAnother, onHome }) {
  const [copied, setCopied] = useState(false);

  const copyJobId = async () => {
    if (!result?.jobId) return;
    await navigator.clipboard.writeText(result.jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="p-8">
      <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center animate-scale-in">
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-success-500/10 text-success-500">
          <CheckCircle2 className="size-7" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Video Job Created!</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Your video has been queued for processing. You can monitor its progress in real-time.
        </p>

        <div className="mt-6 w-full rounded-xl border border-border bg-bg p-4 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-tertiary">Job ID</span>
            <button
              onClick={copyJobId}
              className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-accent cursor-pointer"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 truncate font-mono text-[13px] text-text-primary">{result.jobId}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-medium text-text-tertiary">Status</span>
            <Badge variant="accent" icon={<Rocket className="size-3" />}>
              {result.status}
            </Badge>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onViewProgress}>
            View Progress
          </Button>
          <Button
            variant="secondary"
            onClick={onCreateAnother}
          >
            Create Another
          </Button>
          <Button variant="ghost" onClick={onHome}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </Card>
  );
}
