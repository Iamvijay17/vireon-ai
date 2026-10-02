import { PlayCircle, Download } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { resolveMediaUrl } from "../../services/api";
import { isPortraitResolution } from "../../shared/resolution";

export const VideoPlayerCard = ({ job, videoRef }) => {
  // job.videoUrl / job.thumbnailUrl are stored MinIO URLs that may point at a
  // loopback host (127.0.0.1:9000) - fine on the backend machine, unreachable
  // from any other LAN device. resolveMediaUrl re-homes them to the host the
  // page was loaded from.
  const videoUrl = resolveMediaUrl(job?.videoUrl);
  const thumbnailUrl = resolveMediaUrl(job?.thumbnailUrl);

  return (
    <Card className="animate-slide-up p-6" style={{ "--stagger-index": 2 }}>
      <h3 className="mb-5 flex items-center gap-2 text-[15px] font-semibold text-text-primary">
        <PlayCircle className="size-[18px] text-accent" /> Output Video
      </h3>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-xl bg-black shadow-lg">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          poster={thumbnailUrl || undefined}
          className="block w-full object-contain"
          style={{ aspectRatio: isPortraitResolution(job?.resolution) ? "9/16" : "16/9" }}
        >
          Your browser does not support the video tag.
        </video>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-[13px] text-text-secondary">
          {job.resolution && (
            <span>
              Resolution: <span className="font-semibold text-text-primary">{job.resolution}</span>
            </span>
          )}
          {job.duration && (
            <span>
              Duration: <span className="font-semibold text-text-primary">{job.duration}s</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button href={videoUrl} target="_blank" rel="noopener noreferrer" variant="primary" icon={<PlayCircle className="size-4" />}>
            Open in new tab
          </Button>
          <Button href={videoUrl} target="_blank" rel="noopener noreferrer" download variant="secondary" icon={<Download className="size-4" />}>
            Download
          </Button>
        </div>
      </div>
    </Card>
  );
};
