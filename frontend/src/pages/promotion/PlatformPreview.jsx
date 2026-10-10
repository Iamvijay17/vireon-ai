import { Heart, MessageCircle, Repeat2, Send as SendIcon, ThumbsUp, Share2, Bookmark } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../components/ui/cn";
import { resolveStoragePath, resolveThumbnailUrl } from "../../services/api";
import { PlatformTile } from "./shared";
import { platformLabel, FORMAT_LABEL } from "./format";
import { Counter } from "./CopyEditor";

/** Caption text with hashtags and links picked out, the way every platform highlights them. */
const RichText = ({ text }) => (
  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary">
    {String(text).split(/(\s+)/).map((part, i) => (
      /^(#[\p{L}\p{N}_]+|https?:\/\/\S+)$/u.test(part)
        ? <span key={i} className="text-info-600">{part}</span>
        : <span key={i}>{part}</span>
    ))}
  </p>
);

const MediaFrame = ({ media, thumbnail, format, platform }) => {
  if (!media) return null;
  const portrait = format === "reel" || (media.width && media.height && media.height > media.width);
  const ratio = platform === "instagram" && format === "image" ? "aspect-square" : portrait ? "aspect-[9/16] max-h-[420px]" : "aspect-video";
  const poster = thumbnail?.previewPath ? resolveStoragePath(thumbnail.previewPath) : "";
  const src = media.previewPath ? resolveStoragePath(media.previewPath) : "";
  return (
    <div className={cn("mx-auto w-full overflow-hidden rounded-lg bg-black", ratio)}>
      {media.kind === "image" ? (
        <img src={src} alt="Selected media" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <video src={src} poster={poster || undefined} controls preload="metadata" muted playsInline className="size-full object-contain" />
      )}
    </div>
  );
};

const Actions = ({ platform }) => {
  const cls = "size-4 text-text-tertiary";
  if (platform === "facebook") {
    return <div className="flex items-center justify-around border-t border-border-light pt-2 text-xs text-text-tertiary"><span className="inline-flex items-center gap-1"><ThumbsUp className={cls} />Like</span><span className="inline-flex items-center gap-1"><MessageCircle className={cls} />Comment</span><span className="inline-flex items-center gap-1"><Share2 className={cls} />Share</span></div>;
  }
  if (platform === "instagram") {
    return <div className="flex items-center gap-3"><Heart className={cls} /><MessageCircle className={cls} /><SendIcon className={cls} /><Bookmark className={cn(cls, "ml-auto")} /></div>;
  }
  return <div className="flex items-center gap-4"><Heart className={cls} /><MessageCircle className={cls} /><Repeat2 className={cls} /><SendIcon className={cls} /></div>;
};

/**
 * A rough picture of how ONE destination's post is composed: the account, the media, the exact text that will
 * be sent, the counters and the platform's restrictions. It is an approximation - the live platform may
 * crop, truncate or style it differently - and says so.
 *
 * `result` is one entry of the server's validation response ({ ok, format, composed, errors, warnings, ... }).
 */
export const PlatformPreview = ({ platform, account, campaign, result, checking }) => {
  const composed = result?.composed;
  const format = result?.format || (campaign?.media ? (campaign.media.kind === "image" ? "image" : "video") : "text");
  const handle = account?.username ? `@${account.username}` : account?.displayName || platformLabel(platform);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlatformTile platform={platform} size="sm" />
          <span className="text-[13px] font-semibold text-text-primary">{platformLabel(platform)} preview</span>
        </div>
        <div className="flex items-center gap-2">
          {result && <Badge variant="neutral">{FORMAT_LABEL[format] || format}</Badge>}
          {checking && <span className="text-xs text-text-tertiary">Checking…</span>}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-3.5" data-testid="platform-preview">
        <div className="flex items-center gap-2.5">
          {account?.thumbnailUrl
            ? <img src={resolveThumbnailUrl(account.thumbnailUrl)} alt="" className="size-9 rounded-full object-cover" referrerPolicy="no-referrer" />
            : <PlatformTile platform={platform} />}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-text-primary">{account?.displayName || "Choose an account"}</p>
            <p className="truncate text-[11px] text-text-tertiary">{handle}{platform === "facebook" ? " · Just now" : ""}</p>
          </div>
        </div>

        {platform !== "instagram" && composed?.text && <RichText text={composed.text} />}
        <MediaFrame media={campaign?.media} thumbnail={campaign?.thumbnail} format={format} platform={platform} />
        {platform === "instagram" && composed?.text && <RichText text={composed.text} />}
        {!composed?.text && !campaign?.media && <p className="py-6 text-center text-sm text-text-tertiary">Your post will appear here as you fill it in.</p>}
        <Actions platform={platform} />
      </div>

      {composed && (
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>{composed.hashtagCount} hashtag{composed.hashtagCount === 1 ? "" : "s"} · {composed.linkCount} link{composed.linkCount === 1 ? "" : "s"}</span>
          <Counter length={composed.length} limit={composed.limit} />
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-text-tertiary">
        This is an approximation of how the post is put together, not the live {platformLabel(platform)} interface - the platform may crop the media or shorten long text.
      </p>
    </div>
  );
};

export default PlatformPreview;
