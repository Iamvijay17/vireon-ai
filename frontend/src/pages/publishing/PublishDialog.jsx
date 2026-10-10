import { useMemo, useState } from "react";
import { Send, Save, Trash2, Info } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Label, FieldHint } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { Alert } from "../../components/ui/Alert";
import { confirmDialog } from "../../components/ui/confirmBus";
import { toast } from "../../components/ui/toastBus";
import { LoadingState, ErrorState } from "../../components";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { resolveMediaUrl, updatePublishingJob, submitPublishingJob, retryPublishingJob, deletePublishingJob } from "../../services/api";
import {
  metadataToForm, formToMetadata, validateMetadataForm, parseTags, utf8Bytes, tagsLength, LIMITS,
} from "./format";
import { usePublishingJob, usePublishingLessons, useBusy } from "./usePublishing";
import { ErrorNotice } from "./shared";

const PRIVACY_LABELS = {
  private: { label: "Private", description: "only you" },
  unlisted: { label: "Unlisted", description: "anyone with the link" },
  public: { label: "Public", description: "everyone" },
};

const Counter = ({ value, max, unit = "" }) => (
  <span className={value > max ? "text-danger-500" : "text-text-tertiary"}>
    {value}/{max}
    {unit}
  </span>
);

const Toggle = ({ checked, onChange, title, children }) => (
  <div className="flex items-start justify-between gap-4 rounded-xl border border-border-light p-3">
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-text-primary">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{children}</p>
    </div>
    <Switch checked={checked} onChange={onChange} />
  </div>
);

/** The editable form. Mounted only once the job has loaded, so its initial state comes straight from the server. */
const PublishForm = ({ job, lesson, account, caps, onClose, onSubmitted }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [form, setForm] = useState(() => metadataToForm(job.metadata));
  const [touched, setTouched] = useState(false);

  const yt = caps?.youtube || {};
  const privacyOptions = useMemo(() => yt.privacyOptions || ["private"], [yt.privacyOptions]);
  const errors = useMemo(
    () => validateMetadataForm(form, { privacyOptions, schedulingAvailable: Boolean(yt.schedulingAvailable) }),
    [form, privacyOptions, yt.schedulingAvailable]
  );
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  const on = (key) => (e) => set(key)(e.target.value);
  const err = (key) => (touched ? errors[key] : undefined);
  const editable = job.actions?.canEdit;

  const refresh = () => invalidate(queryKeys.publishing.all);

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return false;
    const ok = await run("save", () => updatePublishingJob(job._id, formToMetadata(form)), { success: "Draft saved" });
    if (ok) refresh();
    return Boolean(ok);
  };

  const publish = async () => {
    setTouched(true);
    if (Object.keys(errors).length) {
      toast.error("Fix the highlighted fields first");
      return;
    }
    const meta = formToMetadata(form);
    const where = meta.publishAt
      ? `scheduled to go public on ${new Date(meta.publishAt).toLocaleString()}`
      : `${PRIVACY_LABELS[meta.privacyStatus]?.label.toLowerCase()} (${PRIVACY_LABELS[meta.privacyStatus]?.description})`;
    const yes = await confirmDialog({
      title: "Upload to YouTube?",
      content: `“${meta.title}” will be uploaded to ${account?.displayName || "your channel"} as ${where}. Vireon never publishes without this confirmation. After the upload you manage the video in YouTube Studio.`,
      confirmText: "Upload now",
    });
    if (!yes) return;

    if (editable && !(await save())) return;
    // A DRAFT is approved with submit; a FAILED job (edited to fix the problem) goes back through retry.
    const start = job.status === "FAILED" ? retryPublishingJob : submitPublishingJob;
    const result = await run("submit", () => start(job._id), {
      success: (res) => (res.data.enqueued ? "Queued - the upload starts shortly" : "Saved and queued - waiting for the worker queue to come back"),
    });
    if (result) {
      refresh();
      onSubmitted?.(result.data.job);
    }
  };

  const discard = async () => {
    if (!(await confirmDialog({ title: "Delete this draft?", content: "Nothing has been uploaded. You can create a new draft any time.", danger: true, confirmText: "Delete draft" }))) return;
    const ok = await run("discard", () => deletePublishingJob(job._id), { success: "Draft deleted" });
    if (ok) {
      refresh();
      onClose();
    }
  };

  const tags = parseTags(form.tags);

  return (
    <>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          {lesson?.renderUrl ? (
            // The exact stored file that will be uploaded - nothing is regenerated for publishing.
            <video src={resolveMediaUrl(lesson.renderUrl)} controls preload="metadata" className="aspect-video max-h-64 w-full" />
          ) : (
            <div className="flex aspect-video max-h-64 items-center justify-center text-sm text-white/60">No preview available</div>
          )}
        </div>

        {!yt.apiVerified && (
          <Alert type="info" title="Private uploads only">
            Your Google API project is not marked verified, and YouTube locks videos from unverified projects to Private. You can change visibility in YouTube Studio afterwards.
          </Alert>
        )}
        <ErrorNotice error={job.error} />
        {!editable && <Alert type="warning">This job can no longer be edited.</Alert>}

        <div>
          <div className="flex items-baseline justify-between">
            <Label required>Title</Label>
            <span className="text-xs"><Counter value={form.title.trim().length} max={LIMITS.title} /></span>
          </div>
          <Input value={form.title} onChange={on("title")} error={Boolean(err("title"))} disabled={!editable} maxLength={200} />
          <FieldHint error>{err("title")}</FieldHint>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label>Description</Label>
            <span className="text-xs"><Counter value={utf8Bytes(form.description)} max={LIMITS.descriptionBytes} unit=" B" /></span>
          </div>
          <Textarea value={form.description} onChange={on("description")} error={Boolean(err("description"))} disabled={!editable} rows={5} />
          <FieldHint error>{err("description")}</FieldHint>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label>Tags</Label>
            <span className="text-xs"><Counter value={tagsLength(tags)} max={LIMITS.tagsChars} /></span>
          </div>
          <Input value={form.tags} onChange={on("tags")} error={Boolean(err("tags"))} disabled={!editable} placeholder="javascript, closures, tutorial" />
          <FieldHint error={Boolean(err("tags"))}>{err("tags") || "Separate with commas."}</FieldHint>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <Select
              value={form.categoryId}
              onChange={set("categoryId")}
              disabled={!editable}
              options={(yt.categories || []).map((c) => ({ value: c.id, label: c.title }))}
            />
          </div>
          <div>
            <Label>Language</Label>
            <Input value={form.language} onChange={on("language")} error={Boolean(err("language"))} disabled={!editable} placeholder="en" />
            <FieldHint error={Boolean(err("language"))}>{err("language") || "Spoken language, e.g. en, hi, pt-BR."}</FieldHint>
          </div>
          <div>
            <Label>Visibility</Label>
            <Select
              value={form.publishAt ? "private" : form.privacyStatus}
              onChange={set("privacyStatus")}
              disabled={!editable || Boolean(form.publishAt)}
              error={Boolean(err("privacyStatus"))}
              options={["private", "unlisted", "public"].map((v) => ({
                value: v,
                label: PRIVACY_LABELS[v].label,
                description: privacyOptions.includes(v) ? PRIVACY_LABELS[v].description : "needs a verified API project",
              }))}
            />
            <FieldHint error>{err("privacyStatus")}</FieldHint>
          </div>
          <div>
            <Label>Schedule (optional)</Label>
            <Input
              type="datetime-local"
              value={form.publishAt}
              onChange={on("publishAt")}
              error={Boolean(err("publishAt"))}
              disabled={!editable || !yt.schedulingAvailable}
            />
            <FieldHint error={Boolean(err("publishAt"))}>
              {err("publishAt") || (yt.schedulingAvailable ? "Uploaded as Private; YouTube makes it public at this time." : "Scheduling needs a verified API project.")}
            </FieldHint>
          </div>
        </div>

        <div className="space-y-2.5">
          <Toggle checked={form.madeForKids} onChange={editable ? set("madeForKids") : undefined} title="Made for kids">
            YouTube requires this answer for every upload. Turn on only if the video is directed at children.
          </Toggle>
          <Toggle checked={form.containsSyntheticMedia} onChange={editable ? set("containsSyntheticMedia") : undefined} title="Contains AI-generated or altered content">
            Vireon videos use synthetic narration and visuals. Leave this on unless you are sure YouTube's disclosure rules do not apply.
          </Toggle>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-text-tertiary">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          You are responsible for having the rights to everything in the video and for following YouTube's Terms and Community Guidelines.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-4">
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} loading={isBusy("discard")} disabled={!job.actions?.canDiscard} onClick={discard}>
          Delete draft
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<Save className="size-4" />} loading={isBusy("save")} disabled={!editable} onClick={save}>
            Save draft
          </Button>
          <Button variant="primary" icon={<Send className="size-4" />} loading={isBusy("submit")} disabled={!job.actions?.canSubmit && !job.actions?.canRetry} onClick={publish}>
            {job.status === "FAILED" ? "Retry upload" : "Publish to YouTube"}
          </Button>
        </div>
      </div>
    </>
  );
};

/**
 * Review + approve one lesson's YouTube upload. Opening this never uploads:
 * the draft only exists to be edited, and "Publish" asks for confirmation first.
 */
export const PublishDialog = ({ jobId, lesson: lessonProp, accounts, caps, onClose, onSubmitted }) => {
  const { data: job, loading, error, refetch } = usePublishingJob(jobId);
  const account = accounts.find((a) => a._id === job?.accountId);
  // Opened from the queue we only know the job; fetch its course's lessons to get the stored video to preview.
  const needsLesson = Boolean(job) && !lessonProp?.renderUrl;
  const { data: lessonsData } = usePublishingLessons(needsLesson ? job.courseId : null);
  const lesson = lessonProp?.renderUrl ? lessonProp : lessonsData?.lessons?.find((l) => l._id === job?.courseVideoId) || lessonProp;

  return (
    <Modal open={Boolean(jobId)} onClose={onClose} width="xl" title={job?.lessonTitle || lesson?.title || "Publish to YouTube"} description={account ? `Channel: ${account.displayName}` : undefined}>
      {loading && <LoadingState label="Loading draft..." minHeight={160} />}
      {!loading && error && <ErrorState message="Could not load this draft" onRetry={refetch} />}
      {job && <PublishForm key={job._id} job={job} lesson={lesson} account={account} caps={caps} onClose={onClose} onSubmitted={onSubmitted} />}
    </Modal>
  );
};

export default PublishDialog;
