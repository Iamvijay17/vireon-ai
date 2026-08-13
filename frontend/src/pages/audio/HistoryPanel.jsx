import { Download, Trash2, Loader2, Mic2, RefreshCw } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { Spinner } from "../../components/ui/Spinner";
import { resolveMediaUrl } from "../../services/api";

// Progressive item list: while an item is COMPLETED it plays the single
// merged file as before; while it's still PENDING, any turns/chunks that
// have already arrived (pushed live over the socket - see pages/audio/index.jsx)
// get their own player each, so the user can start listening before the
// whole generation finishes instead of only after.
const PendingPieces = ({ pieces, label }) => {
  const ready = (pieces || []).filter((p) => p.file);
  if (ready.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {ready.map((p) => (
        <div key={p.order}>
          <p className="mb-1 text-[11px] text-text-tertiary">
            {label} {p.order + 1}
            {p.speaker ? `: ${p.speaker}` : ""}
          </p>
          <AudioPlayer src={resolveMediaUrl(p.file)} />
        </div>
      ))}
    </div>
  );
};

const HistoryItem = ({ item, deletingId, onDelete }) => {
  const isDialogue = item.mode === "dialogue";
  const pending = item.status === "PENDING";
  const pieces = isDialogue ? item.turns : item.chunks;

  return (
    <div className="rounded-xl border border-border-light p-3">
      {isDialogue ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Mic2 className="size-3.5 text-text-tertiary" />
          {(item.speakers || []).map((s) => (
            <Badge key={s.name} variant="neutral">{s.name}</Badge>
          ))}
        </div>
      ) : null}

      <p className="mb-2 line-clamp-2 text-[13px] text-text-secondary">{item.text}</p>
      {!isDialogue && item.emotion && (
        <p className="mb-2 text-[11px] italic text-text-tertiary">Delivery: {item.emotion}</p>
      )}

      {item.status === "COMPLETED" && item.audioUrl ? (
        <AudioPlayer src={resolveMediaUrl(item.audioUrl)} />
      ) : item.status === "FAILED" ? (
        <Badge variant="danger">Failed{item.error ? `: ${item.error}` : ""}</Badge>
      ) : (
        <>
          <PendingPieces pieces={pieces} label={isDialogue ? "Turn" : "Part"} />
          <Badge variant="neutral" icon={<Loader2 className="size-3 animate-spin" />}>
            {(() => {
              const total = pieces?.length || 0;
              const done = pieces?.filter((p) => p.file).length || 0;
              return total > 0
                ? `Generating ${isDialogue ? "turn" : "part"} ${Math.min(done + 1, total)} of ${total}`
                : "Pending";
            })()}
          </Badge>
        </>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-tertiary">
          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
        </span>
        <div className="flex items-center gap-1">
          {item.status === "COMPLETED" && item.audioUrl && (
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              aria-label="Download"
              icon={<Download className="size-3.5" />}
              href={resolveMediaUrl(item.audioUrl)}
              download
            />
          )}
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label="Delete"
            loading={deletingId === item._id}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => onDelete(item)}
          />
        </div>
      </div>
    </div>
  );
};

export const HistoryPanel = ({ history, historyLoading, historyError, fetchHistory, deletingId, onDelete }) => (
  <Card className="h-fit animate-slide-up" style={{ "--stagger-index": 0.5 }}>
    <CardHeader title="History" subtitle={`${history.length} generation${history.length === 1 ? "" : "s"}`} />
    <div className="max-h-[560px] overflow-y-auto p-5">
      {historyLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : historyError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-[13px] text-danger-500">{historyError}</p>
          <p className="text-xs text-text-tertiary">
            Your generations are safe on the server - this just couldn't load them.
          </p>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={fetchHistory}>
            Retry
          </Button>
        </div>
      ) : history.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">Generated audio will appear here.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {history.map((item) => (
            <HistoryItem key={item._id} item={item} deletingId={deletingId} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  </Card>
);

export default HistoryPanel;
