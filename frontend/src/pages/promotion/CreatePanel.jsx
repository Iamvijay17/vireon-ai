import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData } from "@tanstack/react-query";
import { Send, CalendarClock, RotateCcw, Check, Lock } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Input, Label } from "../../components/ui/Input";
import { Tabs } from "../../components/ui/Tabs";
import { Select } from "../../components/ui/Select";
import { confirmDialog } from "../../components/ui/confirmBus";
import { toast } from "../../components/ui/toastBus";
import { EmptyState } from "../../components";
import { cn } from "../../components/ui/cn";
import { useApiQuery, useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import {
  createCampaign, updateCampaign, uploadCampaignMedia, generateCampaignCopy, validateCampaign, publishCampaign,
} from "../../services/api";
import { useBusy, useCampaign, useDebounced, useLivePosts } from "./usePromotion";
import { MediaSelector } from "./MediaSelector";
import { CopyEditor, AiCaptionGenerator } from "./CopyEditor";
import { PlatformPreview } from "./PlatformPreview";
import { ValidationList } from "./ValidationList";
import { SchedulePicker } from "./SchedulePicker";
import { PostActionButtons } from "./PostActions";
import { usePostActions } from "./usePostActions";
import { PlatformTile, StatusBadge, PostProgress, RemoteLink, ErrorNotice } from "./shared";
import {
  PLATFORMS, platformLabel, TONES, browserTimeZone, defaultScheduleInput, mergeLive, formatInZone, zonedToUtc, FORMAT_LABEL,
} from "./format";

const EMPTY_BRIEF = { goal: "", topic: "", audience: "", cta: "", tone: "casual", destinationUrl: "" };
const EMPTY = [];

// Mirrors the server's starting copy (title + description), so what the editor shows is what would be sent.
const starterVariant = (campaign, brief, platform) => {
  const title = campaign?.source?.title || campaign?.title || "";
  const description = campaign?.source?.description || "";
  return {
    caption: [title, description && description !== title ? description : ""].filter(Boolean).join("\n\n"),
    hashtags: [], cta: brief.cta || "", linkUrl: platform === "instagram" ? "" : brief.destinationUrl || "", origin: "manual",
  };
};

const StepCard = ({ n, title, subtitle, done, children, extra }) => (
  <Card>
    <CardHeader
      title={<span className="flex items-center gap-2"><span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-bold", done ? "bg-success-500 text-white" : "bg-surface-active text-text-secondary")}>{done ? <Check className="size-3.5" /> : n}</span>{title}</span>}
      subtitle={subtitle} extra={extra}
    />
    <CardBody>{children}</CardBody>
  </Card>
);

/** One account as a selectable card. A disconnected / expired one is shown but cannot be chosen. */
const AccountChoice = ({ account, checked, onToggle, fbFormat, onFormat, isVideo }) => {
  const ok = account.status === "connected";
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", checked ? "border-accent bg-accent-subtle/40" : "border-border-light", !ok && "opacity-70")}>
      <label className={cn("flex items-center gap-3", ok ? "cursor-pointer" : "cursor-not-allowed")}>
        <input type="checkbox" className="size-4 accent-[var(--color-accent-500)]" checked={checked} disabled={!ok} onChange={() => onToggle(account._id)} aria-label={`Post to ${account.displayName}`} />
        <PlatformTile platform={account.platform} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text-primary">{account.displayName || account.externalId}</p>
          <p className="truncate text-xs text-text-tertiary">{platformLabel(account.platform)}{account.username ? ` · @${account.username}` : ""}</p>
        </div>
        {!ok && <Badge variant="warning" icon={<Lock className="size-3" />}>Reconnect</Badge>}
      </label>
      {!ok && account.statusReason && <p className="mt-2 text-xs text-text-secondary">{account.statusReason}</p>}
      {checked && account.platform === "facebook" && isVideo && (
        <div className="mt-2.5 flex items-center gap-2 pl-7 text-xs text-text-secondary">
          <span>Post as</span>
          <Select
            className="w-44" value={fbFormat || ""} onChange={onFormat}
            options={[{ value: "", label: "Automatic" }, { value: "reel", label: "Reel (9:16, 3-90 s)" }, { value: "video", label: "Regular video" }]}
          />
        </div>
      )}
    </div>
  );
};

export const CreatePanel = ({ caps, accounts }) => {
  const [params, setParams] = useSearchParams();
  const campaignId = params.get("campaign") || "";
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const live = useLivePosts();

  const { data: cdata } = useCampaign(campaignId);
  const campaign = cdata?.campaign;
  const posts = useMemo(() => (cdata?.posts || EMPTY).map((p) => mergeLive(p, live[p._id])), [cdata, live]);

  // ── local, editable state ──
  const [brief, setBrief] = useState(EMPTY_BRIEF);
  const [variants, setVariants] = useState({});
  const [selected, setSelected] = useState(EMPTY);
  const [fbFormat, setFbFormat] = useState({});
  const [active, setActive] = useState("");
  const [mode, setMode] = useState("now");
  const [schedule, setSchedule] = useState(() => ({ timezone: browserTimeZone(), localDateTime: defaultScheduleInput(browserTimeZone()) }));
  const [aiError, setAiError] = useState("");
  const [genKey, setGenKey] = useState(0);
  const [results, setResults] = useState(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [saveState, setSaveState] = useState("idle"); // idle | dirty | saving | saved
  const [hydratedFor, setHydratedFor] = useState("");
  // What the server already has (JSON of brief + copy); null until the campaign has been read.
  const [savedJson, setSavedJson] = useState(null);

  // Take the saved brief / copy from the server once per campaign (adjusting state while rendering, not in an effect).
  if (campaign && hydratedFor !== campaign._id) {
    const nextBrief = { ...EMPTY_BRIEF, ...(campaign.brief || {}) };
    const nextVariants = campaign.variants || {};
    setHydratedFor(campaign._id);
    setBrief(nextBrief);
    setVariants(nextVariants);
    setSavedJson(JSON.stringify({ brief: nextBrief, variants: nextVariants }));
  }

  const connected = useMemo(() => accounts.filter((a) => a.status === "connected"), [accounts]);
  const selectedAccounts = useMemo(() => selected.map((id) => accounts.find((a) => a._id === id)).filter(Boolean), [selected, accounts]);
  const selectedPlatforms = useMemo(() => PLATFORMS.filter((p) => selectedAccounts.some((a) => a.platform === p)), [selectedAccounts]);
  const activePlatform = selectedPlatforms.includes(active) ? active : selectedPlatforms[0] || "";
  const isVideo = campaign?.media?.kind === "video";

  const variantFor = useCallback((platform) => variants[platform] || starterVariant(campaign, brief, platform), [variants, campaign, brief]);
  const contentFor = useCallback((platform) => {
    const v = variantFor(platform);
    return { caption: v.caption, hashtags: v.hashtags, cta: v.cta, linkUrl: v.linkUrl };
  }, [variantFor]);

  // ── autosave of the brief and the copy the person has touched ──
  const payload = useMemo(() => JSON.stringify({ brief, variants }), [brief, variants]);

  const save = useCallback(async () => {
    if (!campaignId) return;
    const current = JSON.stringify({ brief, variants });
    if (current === savedJson) return;
    setSaveState("saving");
    try {
      await updateCampaign(campaignId, { brief, variants: Object.fromEntries(Object.entries(variants).map(([p, v]) => [p, { caption: v.caption, hashtags: v.hashtags, cta: v.cta, linkUrl: v.linkUrl }])) });
      setSavedJson(current);
      setSaveState("saved");
    } catch (err) {
      setSaveState("dirty");
      toast.error(err?.friendlyMessage || "Could not save your changes");
    }
  }, [campaignId, brief, variants, savedJson]);

  // Save shortly after the person stops typing (the timer, not the effect body, does the state updates).
  useEffect(() => {
    if (!campaignId || hydratedFor !== campaignId || savedJson === null || payload === savedJson) return undefined;
    const timer = setTimeout(() => { save(); }, 900);
    return () => clearTimeout(timer);
  }, [payload, savedJson, campaignId, hydratedFor, save]);

  // ── media ──
  const ensureCampaign = async (extra = {}) => {
    if (campaignId) return campaignId;
    const res = await createCampaign({ brief: { ...brief }, ...extra });
    const id = res.data.campaign._id;
    setParams((prev) => { const next = new URLSearchParams(prev); next.set("campaign", id); return next; }, { replace: true });
    return id;
  };

  const pickSource = async (source) => {
    const res = await run("media", async () => {
      if (!campaignId) return createCampaign({ ...source, brief: { ...brief } });
      return updateCampaign(campaignId, source);
    });
    if (!res) return;
    const next = res.data.campaign;
    if (!campaignId) setParams((prev) => { const p = new URLSearchParams(prev); p.set("campaign", next._id); return p; }, { replace: true });
    setHydratedFor(""); // re-read the brief the server derived from the video
    invalidate(queryKeys.social.campaign(next._id));
  };

  const upload = async (file) => {
    setUploadPercent(1);
    const res = await run("media", async () => {
      const id = await ensureCampaign({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) });
      return uploadCampaignMedia(id, file, (e) => e.total && setUploadPercent(Math.max(1, Math.round((e.loaded / e.total) * 100))));
    }, { success: "Uploaded" });
    setUploadPercent(0);
    if (res) invalidate(queryKeys.social.campaign(res.data.campaign._id));
  };

  const clearMedia = async () => {
    const res = await run("media", () => updateCampaign(campaignId, { clearMedia: true }));
    if (res) invalidate(queryKeys.social.campaign(campaignId));
  };

  // ── AI copy ──
  const generate = async (platforms) => {
    setAiError("");
    try {
      const id = await ensureCampaign();
      await save();
      const res = await run("ai", () => generateCampaignCopy(id, { platforms, tone: brief.tone }), { onError: (err) => setAiError(err?.friendlyMessage || "The local AI is unavailable.") });
      if (!res) return;
      const nextVariants = { ...variants, ...Object.fromEntries(res.data.generated.map((p) => [p, res.data.campaign.variants[p]])) };
      setVariants(nextVariants);
      setSavedJson(JSON.stringify({ brief, variants: nextVariants })); // the server already has the generated copy
      setGenKey((k) => k + 1);
      if (res.data.missing?.length) toast.info(`No usable copy came back for ${res.data.missing.map(platformLabel).join(", ")} - write it by hand or try again.`);
      else toast.success("Captions written - read and edit them before posting");
    } catch (err) {
      setAiError(err?.friendlyMessage || "The local AI is unavailable.");
    }
  };

  // ── checking what would be posted ──
  const destinations = useMemo(() => selectedAccounts.map((a) => ({
    accountId: a._id,
    ...(a.platform === "facebook" && fbFormat[a._id] ? { format: fbFormat[a._id] } : {}),
    content: contentFor(a.platform),
  })), [selectedAccounts, fbFormat, contentFor]);

  const checkRequest = useMemo(() => ({
    destinations, mode,
    ...(mode === "schedule" ? { localDateTime: schedule.localDateTime, timezone: schedule.timezone } : {}),
  }), [destinations, mode, schedule]);
  const checkJson = JSON.stringify(checkRequest);
  const debouncedCheck = useDebounced(checkJson, 500);
  const checkEnabled = Boolean(campaignId && destinations.length && campaign);
  const { data: validation, refreshing: checkingBg, loading: checkingFirst } = useApiQuery(
    queryKeys.social.posts({ validate: campaignId, req: debouncedCheck }),
    () => validateCampaign(campaignId, JSON.parse(debouncedCheck)),
    { enabled: checkEnabled, placeholderData: keepPreviousData, errorMessage: "Could not check the post" }
  );
  const checking = checkEnabled && (checkingFirst || checkingBg || debouncedCheck !== checkJson);
  const results4 = validation?.results || EMPTY;
  const previewResult = results4.find((r) => r.platform === activePlatform);
  const previewAccount = selectedAccounts.find((a) => a.platform === activePlatform);
  const ready = checkEnabled && !checking && validation?.ok && campaign?.media !== undefined;
  const scheduleError = validation?.schedule?.[0]?.message;

  // ── publishing ──
  const actions = usePostActions();
  const submit = async ({ onlyAccountId = null, allowRepeat = false } = {}) => {
    const chosen = onlyAccountId ? destinations.filter((d) => d.accountId === onlyAccountId) : destinations;
    const names = chosen.map((d) => accounts.find((a) => a._id === d.accountId)).filter(Boolean).map((a) => `${platformLabel(a.platform)} · ${a.displayName}`);
    const when = mode === "schedule" ? `on ${formatInZone(zonedToUtc(schedule.localDateTime, schedule.timezone), schedule.timezone)} (${schedule.timezone.replace(/_/g, " ")})` : "now";
    const yes = await confirmDialog({
      title: mode === "schedule" ? "Schedule this promotion?" : "Post this promotion now?",
      content: `${allowRepeat ? "This posts the same media to an account that already has it. " : ""}It will go to ${names.join(", ")} ${when}. Each account is handled separately, so one failing never stops the others.`,
      confirmText: mode === "schedule" ? "Schedule" : "Post now",
    });
    if (!yes) return;
    await save();
    const res = await run("publish", () => publishCampaign(campaignId, { ...checkRequest, destinations: chosen, allowRepeat }));
    if (!res) return;
    const { created, failed, results: rows } = res.data;
    setResults((prev) => (onlyAccountId && prev ? prev.map((r) => (r.accountId === onlyAccountId ? rows[0] : r)) : rows));
    if (created && !failed) toast.success(mode === "schedule" ? `Scheduled ${created} post${created === 1 ? "" : "s"}` : `Sent ${created} post${created === 1 ? "" : "s"} to the queue`);
    else if (created) toast.info(`${created} created, ${failed} not created - see the results below`);
    else toast.error("Nothing was posted - see why below");
    invalidate(queryKeys.social.all);
  };

  const startOver = () => {
    setParams((prev) => { const next = new URLSearchParams(prev); next.delete("campaign"); return next; }, { replace: true });
    setBrief(EMPTY_BRIEF); setVariants({}); setSelected(EMPTY); setResults(null); setHydratedFor(""); setAiError(""); setSavedJson(null);
  };

  const toggleAccount = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setBriefField = (k) => (e) => setBrief((b) => ({ ...b, [k]: e.target.value }));
  const noAccounts = accounts.length === 0;
  const platformCaps = caps?.platforms || {};

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        {noAccounts && (
          <Alert type="warning" title="Connect an account first">Promotions are posted through the accounts you connect. Open the Accounts tab to connect Facebook, Instagram or Threads.</Alert>
        )}

        <StepCard
          n={1} title="Choose what to promote" done={Boolean(campaign?.media)}
          subtitle="A finished Vireon video or lesson, or an image / video you upload."
          extra={campaignId && <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={startOver}>Start a new promotion</Button>}
        >
          <MediaSelector
            campaign={campaign} caps={caps} busy={isBusy("media")} uploadPercent={uploadPercent}
            onPickVideo={(v) => pickSource({ videoJobId: v.videoJobId })} onPickLesson={(l) => pickSource({ courseVideoId: l.courseVideoId })}
            onUpload={upload} onClear={clearMedia}
          />
        </StepCard>

        <StepCard n={2} title="Goal and audience" subtitle="Used to write the captions. All optional.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="b-goal">Campaign goal</Label><Input id="b-goal" value={brief.goal} maxLength={500} placeholder="Get more people to take the course" onChange={setBriefField("goal")} /></div>
            <div><Label htmlFor="b-topic">Topic</Label><Input id="b-topic" value={brief.topic} maxLength={500} onChange={setBriefField("topic")} /></div>
            <div><Label htmlFor="b-audience">Audience</Label><Input id="b-audience" value={brief.audience} maxLength={300} placeholder="Beginners learning to code" onChange={setBriefField("audience")} /></div>
            <div><Label htmlFor="b-cta">Call to action</Label><Input id="b-cta" value={brief.cta} maxLength={200} placeholder="Watch the full lesson" onChange={setBriefField("cta")} /></div>
            <div><Label htmlFor="b-url">Destination URL</Label><Input id="b-url" type="url" value={brief.destinationUrl} maxLength={2000} placeholder="https://…" onChange={setBriefField("destinationUrl")} /></div>
            <div><Label>Tone</Label><Select value={brief.tone} onChange={(tone) => setBrief((b) => ({ ...b, tone }))} options={TONES} /></div>
          </div>
          {saveState !== "idle" && <p className="mt-3 text-xs text-text-tertiary" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : "Unsaved changes"}</p>}
        </StepCard>

        <StepCard n={3} title="Where to post" done={selected.length > 0} subtitle="Pick one or more connected accounts. Each gets its own post and its own result.">
          {accounts.length === 0 ? <EmptyState description="No accounts connected yet." /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.map((a) => (
                <AccountChoice
                  key={a._id} account={a} checked={selected.includes(a._id)} onToggle={toggleAccount} isVideo={isVideo}
                  fbFormat={fbFormat[a._id]} onFormat={(v) => setFbFormat((f) => ({ ...f, [a._id]: v }))}
                />
              ))}
            </div>
          )}
          {connected.length < accounts.length && <p className="mt-3 text-xs text-text-tertiary">Accounts that need reconnecting cannot be chosen until you reconnect them on the Accounts tab.</p>}
        </StepCard>

        <StepCard n={4} title="Write the post" subtitle="A different version for each platform. Edit anything before it goes out.">
          {selectedPlatforms.length === 0 ? (
            <EmptyState description="Choose at least one account above to write its post." />
          ) : (
            <div className="space-y-4">
              <AiCaptionGenerator
                tone={brief.tone} onTone={(tone) => setBrief((b) => ({ ...b, tone }))} selectedPlatforms={selectedPlatforms}
                onGenerate={generate} generating={isBusy("ai")} error={aiError} disabled={isBusy("media")}
              />
              <Tabs active={activePlatform} onChange={setActive} items={selectedPlatforms.map((p) => ({ key: p, label: platformLabel(p) }))} />
              <CopyEditor
                key={`${activePlatform}-${genKey}-${hydratedFor}`} platform={activePlatform}
                value={variantFor(activePlatform)} composed={previewResult?.composed}
                onChange={(v) => setVariants((prev) => ({ ...prev, [activePlatform]: v }))}
              />
            </div>
          )}
        </StepCard>

        <StepCard n={5} title="Check and publish" subtitle="Nothing is posted until you press the button below.">
          <div className="space-y-4">
            <ValidationList results={results4} schedule={validation?.schedule} checking={checking} onSkip={toggleAccount} />
            <SchedulePicker
              mode={mode} onMode={setMode} value={schedule} onChange={setSchedule} error={scheduleError}
              minLeadMinutes={caps?.scheduling?.minLeadMinutes} maxAheadDays={caps?.scheduling?.maxAheadDays}
            />
            {platformCaps.threads && selectedPlatforms.includes("instagram") && !caps?.publicMedia?.configured && (
              <Alert type="info" title="Instagram video upload path">No public media URL is configured, so the Instagram video uploads straight from this server using Meta&apos;s resumable upload. If Meta refuses it for your app, the post fails with a clear message - see docs/social-promotion.md.</Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-tertiary">
                {!campaign?.media && selectedPlatforms.some((p) => p === "instagram") ? "Instagram needs an image or video." : checking ? "Checking…" : ready ? "Ready to go." : "Fix the items above to continue."}
              </p>
              <Button
                variant="primary" size="lg" loading={isBusy("publish")} disabled={!ready || isBusy("publish")} onClick={() => submit()}
                icon={mode === "schedule" ? <CalendarClock className="size-4" /> : <Send className="size-4" />}
              >
                {mode === "schedule" ? `Schedule ${selected.length} post${selected.length === 1 ? "" : "s"}` : `Post to ${selected.length} account${selected.length === 1 ? "" : "s"} now`}
              </Button>
            </div>
          </div>
        </StepCard>

        {(results || posts.length > 0) && (
          <Card>
            <CardHeader title="Results" subtitle="Each account is separate. A post is Published only after the platform confirmed it." />
            <CardBody className="space-y-3">
              {(results || []).filter((r) => !r.ok).map((r) => (
                <div key={r.accountId} className="rounded-xl border border-danger-500/20 bg-danger-500/8 p-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.platform && <PlatformTile platform={r.platform} size="sm" />}
                    <span className="font-semibold text-text-primary">{accounts.find((a) => a._id === r.accountId)?.displayName || r.accountId}</span>
                    <Badge variant="danger">Not created</Badge>
                  </div>
                  <p className="mt-1.5 text-text-secondary">{r.message}</p>
                  {r.code === "DUPLICATE" && r.existingPostId && posts.find((p) => p._id === r.existingPostId)?.status === "COMPLETED" && (
                    <Button className="mt-2" size="sm" variant="secondary" onClick={() => submit({ onlyAccountId: r.accountId, allowRepeat: true })}>Post again anyway</Button>
                  )}
                </div>
              ))}
              {posts.map((p) => (
                <div key={p._id} className="rounded-xl border border-border-light p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformTile platform={p.platform} size="sm" />
                    <span className="text-[13px] font-semibold text-text-primary">{p.accountLabel}</span>
                    <span className="text-xs text-text-tertiary">{FORMAT_LABEL[p.format]}</span>
                    <StatusBadge status={p.status} />
                    <span className="ml-auto"><RemoteLink url={p.remote?.permalink}>View post</RemoteLink></span>
                  </div>
                  {p.status === "SCHEDULED" && <p className="mt-1.5 text-xs text-text-secondary">Scheduled for {formatInZone(p.scheduledFor, p.timezone || undefined)}</p>}
                  {["QUEUED", "VALIDATING", "UPLOADING", "PROCESSING", "RETRYING"].includes(p.status) && <div className="mt-2"><PostProgress post={p} /></div>}
                  {p.status === "RETRYING" && p.nextRetryAt && <p className="mt-1.5 text-xs text-text-secondary">Trying again at {formatInZone(p.nextRetryAt)} (attempt {p.attempts} of {p.maxAttempts}).</p>}
                  <ErrorNotice error={p.error} className="mt-2" />
                  <div className="mt-2.5"><PostActionButtons post={p} actions={actions} /></div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardBody className="space-y-3">
            {selectedPlatforms.length > 1 && (
              <Tabs active={activePlatform} onChange={setActive} items={selectedPlatforms.map((p) => ({ key: p, label: platformLabel(p) }))} />
            )}
            {activePlatform ? (
              <PlatformPreview platform={activePlatform} account={previewAccount} campaign={campaign} result={previewResult} checking={checking} />
            ) : (
              <p className="py-10 text-center text-sm text-text-tertiary">Choose an account to see a preview of its post.</p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
};

export default CreatePanel;
