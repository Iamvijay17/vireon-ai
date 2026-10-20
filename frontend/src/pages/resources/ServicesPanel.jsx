import { useState } from "react";
import { MoreHorizontal, Play, RotateCw, Square } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import { Dropdown, DropdownItem } from "../../components/ui/Dropdown";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import ErrorState from "../../components/ErrorState";
import { controlAiService } from "../../services/api";
import { cn } from "../../components/ui/cn";
import { SERVICE_LABELS, serviceState } from "./resourceFormat";

const ACTIONS = {
  start: { label: "Start", icon: <Play />, past: "started", warn: "Starts it now, outside the GPU scheduler. If another service holds the card it may not fit in VRAM." },
  stop: { label: "Stop", icon: <Square />, past: "stopped", warn: "Stops it and frees its VRAM. A job that is using it right now will fail and may retry." },
  restart: { label: "Restart", icon: <RotateCw />, past: "restarted", warn: "Stops it, then starts it again. A job using it right now will fail and may retry." },
};

// The renderer is a per-job process, not a managed server: there is nothing to start or stop.
const CONTROLLABLE = new Set(["llm", "tts", "comfyui"]);

const ServiceRow = ({ id, service, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const meta = SERVICE_LABELS[id] || { name: id, detail: "" };
  const state = serviceState(service?.status);
  const error = service?.lastError;

  const run = async (action) => {
    const spec = ACTIONS[action];
    const ok = await confirmDialog({
      title: `${spec.label} ${meta.name.toLowerCase()}?`,
      content: spec.warn,
      confirmText: spec.label,
      danger: action !== "start",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await controlAiService(id, action);
      toast.success(`${meta.name} ${spec.past}`);
    } catch (err) {
      toast.error(err.friendlyMessage || `Could not ${action} ${meta.name.toLowerCase()}`);
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{meta.name}</span>
          <Badge variant={state.variant} dot>
            {busy ? "Working…" : state.label}
          </Badge>
          {id === "remotion" && service?.active > 0 && <Badge variant="accent">{service.active} render{service.active === 1 ? "" : "s"} in this process</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-text-tertiary">{meta.detail}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{state.note}</p>
        {error && (
          <p className="mt-1 line-clamp-2 text-xs text-danger-500" title={String(error)}>
            Last error: {String(error)}
          </p>
        )}
      </div>
      {CONTROLLABLE.has(id) && (
        <Dropdown
          align="end"
          trigger={({ toggle, open, id: menuId }) => (
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              aria-label={`Manage ${meta.name}`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40",
                open && "bg-surface-hover text-text-primary"
              )}
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
        >
          {({ close }) =>
            Object.entries(ACTIONS).map(([action, spec]) => (
              <DropdownItem
                key={action}
                icon={spec.icon}
                danger={action === "stop"}
                disabled={(action === "start" && service?.status === "ready") || (action === "stop" && service?.status === "stopped")}
                onClick={() => {
                  close();
                  run(action);
                }}
              >
                {spec.label}
              </DropdownItem>
            ))
          }
        </Dropdown>
      )}
    </div>
  );
};

/** The local AI services and what state each is in, with manual start / stop / restart. */
const ServicesPanel = ({ services }) => {
  const { data, loading, error, refetch } = services;
  const order = ["llm", "tts", "comfyui", "remotion"];

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Local AI services" subtitle="They start on demand and are unloaded to free VRAM for the next job" />
      {loading ? (
        <div className="space-y-4 p-4" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <div className="p-4">
          <ErrorState message="Service status unavailable" description={error.friendlyMessage || error.message} onRetry={refetch} />
        </div>
      ) : (
        <div className="divide-y divide-border-light">
          {order.map((id) => (
            <ServiceRow key={id} id={id} service={data?.services?.[id]} onChanged={refetch} />
          ))}
        </div>
      )}
    </Card>
  );
};

export default ServicesPanel;
