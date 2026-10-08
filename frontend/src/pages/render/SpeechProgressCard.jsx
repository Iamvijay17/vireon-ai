import { Check, Circle, Loader2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";
import { describeSpeechStages } from "../../lib/speechStages";

/**
 * The speech-timing steps in plain language:
 *   Generating voice... / Voice generated -> Analyzing speech timing... -> ...
 * Renders nothing for jobs that don't use speech alignment. Counters and the
 * raw event names stay out of sight - they are for the developer preview.
 */
export const SpeechProgressCard = ({ events }) => {
  const rows = describeSpeechStages(events);
  if (rows.length === 0) return null;

  return (
    <Card className="animate-slide-up p-4 sm:p-5" aria-label="Voice and timing progress">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className={cn(
              "flex items-center gap-2.5 text-sm",
              row.state === "done" && "text-text-secondary",
              row.state === "active" && "font-medium text-text-primary",
              row.state === "pending" && "text-text-tertiary"
            )}
          >
            {row.state === "done" && <Check className="size-4 text-success-600" />}
            {row.state === "active" && <Loader2 className="size-4 animate-spin text-accent" />}
            {row.state === "pending" && <Circle className="size-4" />}
            <span>{row.label}</span>
            {row.detail && <span className="text-xs text-text-tertiary">{row.detail}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
};
