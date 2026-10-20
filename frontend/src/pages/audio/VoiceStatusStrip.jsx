import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAiServices, getTtsStats } from "../../services/api";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Card } from "../../components/ui/Card";
import { queryKeys } from "../../lib/queryClient";
import { serviceState } from "../resources/resourceFormat";

const Item = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-text-primary">{children}</div>
  </div>
);

/**
 * What the narration engine can do right now, before you spend time on a
 * script: is the model available, is audio post-processing available, how
 * many voices are installed. Each part says "unavailable" when it could not be
 * read rather than implying everything is fine.
 */
const VoiceStatusStrip = ({ voiceCount }) => {
  const services = useQuery({
    queryKey: queryKeys.system.aiServices,
    queryFn: async () => (await getAiServices()).data,
    retry: false,
    staleTime: 15_000,
  });
  const stats = useQuery({
    queryKey: ["tts", "stats"],
    queryFn: async () => (await getTtsStats()).data,
    retry: false,
    staleTime: 30_000,
  });

  const tts = services.data?.services?.tts;
  const state = serviceState(tts?.status);
  const broken = tts && ["failed", "unhealthy"].includes(tts.status);
  const ffmpeg = stats.data?.ffmpeg;

  return (
    <div className="mb-4 space-y-3">
      {broken && (
        <Alert type={tts.status === "failed" ? "error" : "warning"} title={`The narration model is ${state.label.toLowerCase()}`}>
          {state.note}
          {tts.lastError ? ` Last error: ${String(tts.lastError)}.` : ""} Generating audio may fail until it is restarted from{" "}
          <Link to="/resources" className="underline">
            GPU &amp; Resources
          </Link>
          .
        </Alert>
      )}
      {ffmpeg && ffmpeg.available === false && (
        <Alert type="warning" title="Audio post-processing is unavailable">
          ffmpeg was not found, so speed changes and loudness processing are skipped. Narration still generates.
        </Alert>
      )}
      <Card className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-4">
        <Item label="Narration engine">
          {services.isLoading ? (
            <span className="text-text-tertiary">Checking…</span>
          ) : services.error ? (
            <span className="text-text-tertiary">Unavailable</span>
          ) : (
            <Badge variant={state.variant} dot title={state.note}>
              {state.label}
            </Badge>
          )}
        </Item>
        <Item label="Voices installed">
          <span className="tabular font-medium">{voiceCount > 0 ? voiceCount : "—"}</span>
        </Item>
        <Item label="Narration pipeline">
          {stats.isLoading ? (
            <span className="text-text-tertiary">Checking…</span>
          ) : stats.error ? (
            <span className="text-text-tertiary">Unavailable</span>
          ) : (
            <Badge variant={stats.data?.segmentedPipeline ? "accent" : "neutral"}>{stats.data?.segmentedPipeline ? "Directed, segmented" : "Whole-scene"}</Badge>
          )}
        </Item>
        <Item label="Audio processing">
          {stats.isLoading ? (
            <span className="text-text-tertiary">Checking…</span>
          ) : stats.error || !ffmpeg ? (
            <span className="text-text-tertiary">Unavailable</span>
          ) : (
            <Badge variant={ffmpeg.available ? "success" : "warning"} dot title={ffmpeg.reason}>
              {ffmpeg.available ? "ffmpeg ready" : "ffmpeg missing"}
            </Badge>
          )}
        </Item>
      </Card>
    </div>
  );
};

export default VoiceStatusStrip;
