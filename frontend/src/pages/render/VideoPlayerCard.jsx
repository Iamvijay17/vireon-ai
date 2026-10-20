import { Download, ExternalLink } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import VideoPreview from "../../components/media/VideoPreview";
import { resolveMediaUrl } from "../../services/api";
import { isPortraitResolution } from "../../shared/resolution";

/**
 * The finished video. The player only fetches the file's header until you
 * press play (VideoPreview), and says so if the file cannot be loaded.
 * job.videoUrl / thumbnailUrl are stored MinIO URLs that can point at a
 * loopback host; VideoPreview and resolveMediaUrl re-home them to the page's
 * own origin so they play from any device.
 */
export const VideoPlayerCard = ({ job, videoRef }) => {
  const videoUrl = resolveMediaUrl(job?.videoUrl);
  const portrait = isPortraitResolution(job?.resolution);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Output video"
        subtitle={[job.resolution, job.duration ? `${job.duration} min target` : null].filter(Boolean).join(" · ") || undefined}
        extra={
          <>
            <Button href={videoUrl} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary" icon={<ExternalLink className="size-3.5" />}>
              Open
            </Button>
            <Button href={videoUrl} target="_blank" rel="noopener noreferrer" download size="sm" variant="secondary" icon={<Download className="size-3.5" />}>
              Download
            </Button>
          </>
        }
      />
      <div className="flex justify-center bg-black p-3">
        <VideoPreview
          src={job.videoUrl}
          poster={job.thumbnailUrl}
          portrait={portrait}
          videoRef={videoRef}
          className={portrait ? "w-full max-w-xs" : "w-full max-w-3xl"}
        />
      </div>
    </Card>
  );
};
