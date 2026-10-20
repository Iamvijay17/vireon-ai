import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { DescriptionList } from "../../components/ui/DescriptionList";
import StatusBadge from "../../components/StatusBadge";
import { QualityReportCard } from "../render/QualityReportCard";
import { formatBytes, formatDuration } from "../../lib/format";

// What the checker measured (report.media - see VideoQualityService). Only
// values that were actually measured are listed.
const mediaItems = (media = {}) => {
  const items = [];
  if (Number.isFinite(media.durationSec)) items.push({ label: "Measured length", value: `${media.durationSec.toFixed(1)} s` });
  if (Number.isFinite(media.expectedSec)) items.push({ label: "Expected length", value: `${media.expectedSec.toFixed(1)} s` });
  if (media.width && media.height) items.push({ label: "Frame size", value: `${media.width}×${media.height}` });
  if (Number.isFinite(media.fps)) items.push({ label: "Frame rate", value: `${media.fps} fps` });
  if (media.videoCodec) items.push({ label: "Video codec", value: media.videoCodec });
  if (media.audioCodec) items.push({ label: "Audio codec", value: media.audioCodec });
  if (Number.isFinite(media.sizeBytes)) items.push({ label: "File size", value: formatBytes(media.sizeBytes) });
  return items;
};

/** One video's full report: verdict, every check, every finding, and what was measured. */
export function QualityDetailModal({ row, onClose }) {
  const media = mediaItems(row.report?.media);

  return (
    <Modal
      open
      onClose={onClose}
      title={row.title}
      description={row.report ? `Checked ${new Date(row.report.checkedAt).toLocaleString()} in ${row.mode} mode` : "No quality report is stored for this video."}
      width="xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Link to={`/render?id=${row.id}`} onClick={onClose}>
            <Button variant="primary" size="sm" icon={<ExternalLink className="size-3.5" />}>
              Open project
            </Button>
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <StatusBadge kind="quality" status={row.verdict} />
          {row.report && <span className="text-xs text-text-tertiary">Check run took {formatDuration(row.report.durationMs)}</span>}
        </div>

        {row.report ? (
          <>
            <QualityReportCard report={row.report} />
            {media.length > 0 && (
              <DescriptionList columns={4} items={media} />
            )}
            {row.report.status === "skipped" && (
              <p className="text-xs leading-relaxed text-text-tertiary">
                The checker could not run{row.report.skippedReason ? `: ${row.report.skippedReason}` : ""}. A skipped check is not a pass - the video is simply unverified.
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-text-secondary">
            This video finished rendering without a quality report - it predates the checks, or checks were switched off when it rendered. It is not counted as passed. Open the project and
            render it again to run the checks.
          </p>
        )}
      </div>
    </Modal>
  );
}
