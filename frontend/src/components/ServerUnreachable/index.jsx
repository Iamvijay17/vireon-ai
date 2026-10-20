import { useEffect, useState } from "react";
import { RotateCw, ServerOff, WifiOff } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";

/** Re-renders once a second while `running`, returning the current time (ms epoch). */
const useNow = (running) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
};

/** Whole seconds until `at` (ms epoch), or null before the first check is scheduled. */
const useCountdown = (at, running) => {
  const now = useNow(running);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
};

/** "45s", "3m 05s" - how long the outage has lasted. */
const useElapsed = (since) => {
  const now = useNow(Boolean(since));
  if (!since) return null;
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
};

const COPY = {
  unreachable: {
    title: "Can’t reach the Vireon server",
    body: "The app isn’t getting any answer from the server. It may be stopped, restarting, or your connection dropped.",
  },
  restarting: {
    title: "The Vireon server is restarting",
    body: "The web page is up but the server behind it isn’t answering yet. This usually clears within a minute.",
  },
};

const Tips = () => {
  const items = import.meta.env.PROD
    ? [
        <>On the Vireon PC, <code>docker compose ps</code> should show <code>backend</code> as healthy.</>,
        <>If it is stopped, <code>docker compose up -d</code> brings it back; <code>docker compose logs backend</code> says why it died.</>,
        <>Using Tailscale? Check this device is still connected to your tailnet.</>,
      ]
    : [
        <>From the repo root run <code>npm run dev</code> (or <code>npm run dev:api</code> for just the backend).</>,
        <>Check the API terminal for a crash. MongoDB or Redis being down stops it from starting.</>,
        <>Nothing is lost: running jobs continue in the workers and the page reconnects on its own.</>,
      ];
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-text-secondary [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11.5px] [&_code]:text-text-primary">
      {items.map((tip, i) => (
        <li key={i}>{tip}</li>
      ))}
    </ul>
  );
};

/**
 * Full-area screen shown over the page when the API stops answering. The page
 * underneath stays mounted (see layout/AppShell) so unsaved edits survive the
 * outage; this just stops the user clicking around a dead app. `onDismiss`
 * lets them look at the last-loaded data anyway.
 */
export const ServerUnreachable = ({ kind = "unreachable", checking, nextCheckAt, downSince, failures, onRetry, onDismiss }) => {
  const copy = COPY[kind] || COPY.unreachable;
  const seconds = useCountdown(nextCheckAt, !checking);
  const elapsed = useElapsed(downSince);
  const Icon = kind === "restarting" ? ServerOff : WifiOff;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="server-down-title"
      aria-describedby="server-down-body"
      className="absolute inset-0 z-20 flex items-start justify-center bg-bg/85 px-4 pt-[10vh] backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-md animate-scale-in rounded-2xl border border-border bg-surface p-7 text-center shadow-xl">
        <div className="relative mx-auto mb-5 flex size-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-danger-500/10 [animation-duration:2.4s] motion-reduce:animate-none" />
          <span className="relative flex size-14 items-center justify-center rounded-full border border-danger-500/25 bg-danger-500/10">
            <Icon className="size-6 text-danger-500" aria-hidden="true" />
          </span>
        </div>

        <h2 id="server-down-title" className="text-lg font-semibold tracking-tight text-text-primary">
          {copy.title}
        </h2>
        <p id="server-down-body" className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-text-secondary">
          {copy.body}
        </p>

        <div
          role="status"
          aria-live="polite"
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-hover px-3 py-1.5 text-[13px] text-text-secondary tabular-nums"
        >
          <span
            className={cn("size-2 rounded-full", checking ? "animate-pulse bg-accent-fg" : "bg-danger-500")}
            aria-hidden="true"
          />
          {checking ? "Checking now…" : seconds == null ? "Waiting…" : `Trying again in ${seconds}s`}
        </div>
        <p className="mt-1.5 text-xs text-text-tertiary tabular-nums">
          {elapsed ? `Offline for ${elapsed}` : "Offline"}
          {failures > 0 && ` · ${failures} failed ${failures === 1 ? "check" : "checks"}`}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="md" icon={<RotateCw className="size-4" />} loading={checking} onClick={onRetry}>
            Retry now
          </Button>
          {onDismiss && (
            <Button variant="ghost" size="md" onClick={onDismiss}>
              View last loaded data
            </Button>
          )}
        </div>

        <details className="group mt-5 border-t border-border pt-3.5 text-left">
          <summary className="cursor-pointer list-none text-center text-[13px] font-medium text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
            Troubleshooting
          </summary>
          <Tips />
        </details>
      </div>
    </div>
  );
};

/** Slim strip shown instead of the full screen once the user chose to keep looking at old data. */
export const ServerUnreachableBanner = ({ checking, nextCheckAt, onRetry }) => {
  const seconds = useCountdown(nextCheckAt, !checking);
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-danger-500/25 bg-danger-500/8 px-3 py-2 text-[13px] text-text-secondary"
    >
      <WifiOff className="size-4 shrink-0 text-danger-500" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-text-primary">Server unreachable.</span> Showing the last loaded data; changes won’t save
        until it’s back.
      </span>
      <span className="tabular-nums text-text-tertiary">{checking ? "Checking…" : seconds == null ? "" : `Retrying in ${seconds}s`}</span>
      <Button size="xs" variant="secondary" onClick={onRetry} disabled={checking}>
        Retry now
      </Button>
    </div>
  );
};

export default ServerUnreachable;
