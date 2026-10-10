import { useMemo } from "react";
import { Send, CalendarClock } from "lucide-react";
import { Input, Label, FieldHint } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { cn } from "../../components/ui/cn";
import { timeZoneOptions, zonedToUtc, describeDistance, formatInZone } from "./format";

/**
 * Post now, or pick a date, time and time zone. The time is entered as a wall clock in the chosen zone and
 * stored by the server in UTC; the line under the fields shows exactly which instant that is.
 * Scheduled posts are sent by the server's worker - this browser does not need to stay open.
 */
export const SchedulePicker = ({ mode, onMode, value, onChange, minLeadMinutes = 2, maxAheadDays = 180, error }) => {
  const zones = useMemo(() => timeZoneOptions(), []);
  const at = mode === "schedule" ? zonedToUtc(value.localDateTime, value.timezone) : null;

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="When to post">
        {[{ key: "now", label: "Post now", icon: Send }, { key: "schedule", label: "Schedule", icon: CalendarClock }].map(({ key, label, icon: Icon }) => (
          <button
            key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => onMode(key)}
            className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", mode === key ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
          >
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {mode === "schedule" && (
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="schedule-when">Date and time</Label>
              <Input id="schedule-when" type="datetime-local" value={value.localDateTime} error={Boolean(error)} onChange={(e) => onChange({ ...value, localDateTime: e.target.value })} />
            </div>
            <div>
              <Label>Time zone</Label>
              <Select value={value.timezone} options={zones} onChange={(timezone) => onChange({ ...value, timezone })} />
            </div>
          </div>
          {error ? (
            <FieldHint error>{error}</FieldHint>
          ) : at ? (
            <FieldHint>
              {formatInZone(at, value.timezone)} ({value.timezone.replace(/_/g, " ")}) · {at.toISOString().replace(".000Z", "Z")} UTC · {describeDistance(at)}
            </FieldHint>
          ) : (
            <FieldHint error>Choose a valid date and time.</FieldHint>
          )}
          <FieldHint>At least {minLeadMinutes} minutes from now and within {maxAheadDays} days. The server sends it at that time even if this tab is closed.</FieldHint>
        </div>
      )}
    </div>
  );
};

export default SchedulePicker;
