import { useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Textarea, Input, Label, FieldHint } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { LoadingState, ErrorState } from "../../components";
import { useInvalidate, useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { getSocialPost, editSocialPost } from "../../services/api";
import { StatusBadge, PlatformBadge, PostProgress, RemoteLink, ErrorNotice } from "./shared";
import { PostActionButtons } from "./PostActions";
import { usePostActions } from "./usePostActions";
import { formatInZone, timeZoneOptions, parseHashtagInput, hashtagsToInput, FORMAT_LABEL, browserTimeZone } from "./format";
import { useBusy } from "./usePromotion";

const LEVEL = { info: "text-text-secondary", warn: "text-warning-600", error: "text-danger-500" };

/** The editable part of a post that has not started (SCHEDULED, or FAILED before anything reached the platform). */
const EditForm = ({ post, onDone, onCancel }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [caption, setCaption] = useState(post.content.caption);
  const [tags, setTags] = useState(hashtagsToInput(post.content.hashtags));
  const [cta, setCta] = useState(post.content.cta);
  const [linkUrl, setLinkUrl] = useState(post.content.linkUrl);
  const reschedulable = post.actions?.canReschedule;
  const [timezone, setTimezone] = useState(post.timezone || browserTimeZone());
  const [when, setWhen] = useState(post.scheduledLocal || "");
  const [fieldErrors, setFieldErrors] = useState({});

  // The server's validation errors name the field; show them next to it as well as in the toast.
  const onSaveClick = async () => {
    const res = await run("edit", () => editSocialPost(post._id, { content: { caption, hashtags: parseHashtagInput(tags), cta, linkUrl }, ...(reschedulable && when ? { localDateTime: when, timezone } : {}) }), {
      success: "Saved",
      onError: (err) => {
        const list = err?.response?.data?.details || [];
        setFieldErrors(Object.fromEntries(list.map((e) => [e.field, e.message])));
      },
    });
    if (res) {
      invalidate(queryKeys.social.all);
      onDone(res.data.post);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="edit-caption">{post.platform === "threads" ? "Post text" : "Caption"}</Label>
        <Textarea id="edit-caption" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} error={Boolean(fieldErrors.caption)} />
        <FieldHint error={Boolean(fieldErrors.caption)}>{fieldErrors.caption}</FieldHint>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="edit-tags">Hashtags</Label><Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} /><FieldHint error>{fieldErrors.hashtags}</FieldHint></div>
        <div><Label htmlFor="edit-cta">Call to action</Label><Input id="edit-cta" value={cta} onChange={(e) => setCta(e.target.value)} /></div>
      </div>
      <div><Label htmlFor="edit-link">Destination URL</Label><Input id="edit-link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} error={Boolean(fieldErrors.linkUrl)} /><FieldHint error>{fieldErrors.linkUrl}</FieldHint></div>
      {reschedulable && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="edit-when">New date and time</Label><Input id="edit-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={Boolean(fieldErrors.scheduledFor)} /><FieldHint error>{fieldErrors.scheduledFor}</FieldHint></div>
          <div><Label>Time zone</Label><Select value={timezone} options={timeZoneOptions()} onChange={setTimezone} /></div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Back</Button>
        <Button variant="primary" loading={isBusy("edit")} onClick={onSaveClick}>Save changes</Button>
      </div>
    </div>
  );
};

/** Everything about one post: where it stands, why it failed and what can be done, its timeline, and editing. */
export const PostDetailModal = ({ postId, onClose }) => {
  const { data, loading, error, refetch } = useApiQuery(queryKeys.social.posts({ id: postId }), () => getSocialPost(postId), {
    enabled: Boolean(postId), errorMessage: "Failed to load the post",
  });
  const [editing, setEditing] = useState(false);
  const post = data?.post;
  const actions = usePostActions({ onChanged: () => setEditing(false) });

  return (
    <Modal open={Boolean(postId)} onClose={onClose} title="Post details" width="xl">
      {error && !post ? <ErrorState message="Could not load this post" onRetry={refetch} /> : loading || !post ? <LoadingState label="Loading post…" minHeight={180} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <PlatformBadge platform={post.platform} />
            <span className="text-[13px] text-text-secondary">{post.accountLabel}{post.accountHandle ? ` · @${post.accountHandle}` : ""}</span>
            <StatusBadge status={post.status} />
            <span className="text-xs text-text-tertiary">{FORMAT_LABEL[post.format] || post.format}</span>
          </div>

          {post.status === "SCHEDULED" && post.scheduledFor && (
            <p className="text-[13px] text-text-secondary">Scheduled for <strong className="text-text-primary">{formatInZone(post.scheduledFor, post.timezone || undefined)}</strong>{post.timezone ? ` (${post.timezone.replace(/_/g, " ")})` : ""}. It is sent by the server even if no browser is open.</p>
          )}
          {post.status === "RETRYING" && post.nextRetryAt && <p className="text-[13px] text-text-secondary">Next automatic try: {formatInZone(post.nextRetryAt)} (attempt {post.attempts} of {post.maxAttempts}).</p>}
          <PostProgress post={post} />
          {post.remote?.permalink && <RemoteLink url={post.remote.permalink}>Open the published post</RemoteLink>}
          <ErrorNotice error={post.error} />

          {editing ? <EditForm post={post} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} /> : (
            <>
              <div className="rounded-xl border border-border-light bg-surface-hover/40 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">What is sent</p>
                <p className="whitespace-pre-wrap break-words text-[13px] text-text-primary">{post.composedText || "—"}</p>
              </div>
              <PostActionButtons post={post} actions={actions} onEdit={() => setEditing(true)} size="md" />
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Timeline</p>
            <ol className="space-y-1.5">
              {[...(post.events || [])].reverse().map((e, i) => (
                <li key={i} className="flex gap-3 text-[13px]">
                  <span className="w-36 shrink-0 text-xs tabular-nums text-text-tertiary">{formatInZone(e.at, undefined, { dateStyle: "short", timeStyle: "medium" })}</span>
                  <span className={LEVEL[e.level] || LEVEL.info}>{e.message}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PostDetailModal;
