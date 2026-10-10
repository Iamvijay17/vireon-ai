import { useState } from "react";
import { Link2, Unplug, ShieldCheck, RefreshCw, Plug } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { RelativeTime } from "../../components/ui/RelativeTime";
import { confirmDialog } from "../../components/ui/confirmBus";
import { toast } from "../../components/ui/toastBus";
import { EmptyState, ErrorState } from "../../components";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { startSocialConnect, validateSocialAccount, disconnectSocialAccount } from "../../services/api";
import { useBusy } from "./usePromotion";
import { PlatformTile, SkeletonRows } from "./shared";
import { platformLabel } from "./format";

const PERMISSION_LABEL = {
  pages_show_list: "See your Pages",
  pages_manage_posts: "Publish to Pages",
  pages_read_engagement: "Read Page engagement",
  read_insights: "Read Page insights",
  instagram_basic: "Instagram profile",
  instagram_content_publish: "Publish to Instagram",
  instagram_manage_insights: "Instagram insights",
  threads_basic: "Threads profile",
  threads_content_publish: "Publish to Threads",
  threads_manage_insights: "Threads insights",
};

const PROVIDERS = {
  meta: {
    title: "Facebook Pages & Instagram",
    cta: "Connect Facebook / Instagram",
    blurb: "One Meta sign-in connects the Facebook Pages you choose and the Instagram professional accounts linked to them.",
    asks: [
      "See your Pages, and publish posts and Reels to the Pages you select",
      "Publish to the Instagram professional accounts linked to those Pages",
      "Read post insights, so Analytics can show results",
    ],
    requirements: [
      "You must be able to create content on the Page.",
      "Instagram must be a Professional (Business or Creator) account linked to that Facebook Page.",
      "While your Meta app is in Development mode, only people with a role on the app can connect, and posts are real posts.",
    ],
  },
  threads: {
    title: "Threads",
    cta: "Connect Threads",
    blurb: "A separate Threads sign-in for your profile.",
    asks: ["Read your Threads profile", "Publish text, image and video posts", "Read post insights"],
    requirements: [
      "Image and video posts need a public media URL on this server (text posts do not).",
      "Access lasts 60 days and Vireon renews it automatically while you keep using it.",
    ],
  },
};

const ConnectDialog = ({ provider, open, onClose, onContinue, busy }) => {
  const info = PROVIDERS[provider];
  if (!info) return null;
  return (
    <Modal
      open={open} onClose={onClose} title={info.cta} description={info.blurb} width="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Plug className="size-4" />} loading={busy} onClick={onContinue}>Continue to {provider === "threads" ? "Threads" : "Meta"}</Button>
        </>
      )}
    >
      <div className="space-y-4 text-[13px]">
        <div>
          <p className="mb-1.5 font-semibold text-text-primary">Vireon will ask for permission to</p>
          <ul className="list-disc space-y-1 pl-5 text-text-secondary">{info.asks.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1.5 font-semibold text-text-primary">Before you continue</p>
          <ul className="list-disc space-y-1 pl-5 text-text-secondary">{info.requirements.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
        <p className="flex items-start gap-1.5 rounded-lg bg-surface-hover p-3 text-text-secondary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-600" />
          You sign in on the platform&apos;s own page; Vireon never sees your password. Access tokens are encrypted on the server and never sent to this browser.
        </p>
      </div>
    </Modal>
  );
};

const AccountCard = ({ account, busy, onValidate, onReconnect, onDisconnect }) => {
  const ok = account.status === "connected";
  const provider = account.platform === "threads" ? "threads" : "meta";
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border-light p-4">
      {account.thumbnailUrl ? (
        <img src={account.thumbnailUrl} alt="" className="size-11 shrink-0 rounded-full bg-surface-hover object-cover" referrerPolicy="no-referrer" />
      ) : <PlatformTile platform={account.platform} size="lg" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-semibold text-text-primary">{account.displayName || account.externalId}</p>
          <Badge variant="neutral">{platformLabel(account.platform)}</Badge>
          <Badge variant={ok ? "success" : "warning"} dot>{ok ? "Connected" : "Needs reconnecting"}</Badge>
        </div>
        {account.username && <p className="mt-0.5 text-[13px] text-text-secondary">@{account.username}</p>}
        {account.meta?.pageName && account.platform === "instagram" && <p className="text-xs text-text-tertiary">Linked Page: {account.meta.pageName}</p>}
        {!ok && account.statusReason && <p className="mt-2 text-[13px] text-text-secondary">{account.statusReason}</p>}
        <p className="mt-2 text-xs text-text-tertiary">
          Connected <RelativeTime value={account.connectedAt} />
          {account.lastValidatedAt ? <> · checked <RelativeTime value={account.lastValidatedAt} /></> : null}
          {account.tokenExpiresInDays !== undefined && ok ? ` · access renews automatically (${account.tokenExpiresInDays} days left)` : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(account.scopes || []).map((s) => <Badge key={s} variant="neutral">{PERMISSION_LABEL[s] || s}</Badge>)}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {ok && <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} loading={busy(`validate:${account._id}`)} onClick={() => onValidate(account)}>Check</Button>}
        {!ok && <Button size="sm" variant="primary" icon={<Link2 className="size-4" />} onClick={() => onReconnect(provider)}>Reconnect</Button>}
        <Button size="sm" variant="secondary" icon={<Unplug className="size-4" />} loading={busy(`disconnect:${account._id}`)} onClick={() => onDisconnect(account)}>Disconnect</Button>
      </div>
    </div>
  );
};

/** Connected Facebook Pages, Instagram accounts and Threads profiles: connect, check, reconnect, disconnect. */
export const AccountsPanel = ({ caps, accounts, loading, error, onRetry }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [dialog, setDialog] = useState(null); // 'meta' | 'threads'

  const platforms = caps?.platforms || {};
  const metaReady = Boolean(platforms.facebook?.configured);
  const threadsReady = Boolean(platforms.threads?.configured);

  const proceed = async () => {
    const res = await run("connect", () => startSocialConnect(dialog));
    // Hand the whole tab to the platform's consent screen; it comes back to /promotion/accounts?connect=<result>.
    if (res?.data?.authUrl) window.location.assign(res.data.authUrl);
  };

  const validate = async (account) => {
    const res = await run(`validate:${account._id}`, () => validateSocialAccount(account._id));
    if (!res) return;
    if (res.data.ok) toast.success(`${account.displayName || "Account"} is connected and working`);
    else toast.error(`${res.data.message || "The platform no longer accepts this account"}${res.data.action ? ` ${res.data.action}` : ""}`);
    invalidate(queryKeys.social.accounts, queryKeys.social.overview);
  };

  const disconnect = async (account) => {
    const yes = await confirmDialog({
      title: `Disconnect ${account.displayName || "this account"}?`,
      content: "Vireon deletes the stored credential and cancels posts still waiting to go out through this account. Posts already published stay on the platform and in your history. To fully revoke Vireon's access, also remove the app in your Facebook / Instagram / Threads settings.",
      danger: true, confirmText: "Disconnect",
    });
    if (!yes) return;
    const res = await run(`disconnect:${account._id}`, () => disconnectSocialAccount(account._id), {
      success: (r) => (r.data.cancelledPosts ? `Disconnected. ${r.data.cancelledPosts} waiting post(s) were cancelled.` : "Disconnected"),
    });
    if (res) invalidate(queryKeys.social.all);
  };

  const meta = accounts.filter((a) => a.platform !== "threads");
  const threads = accounts.filter((a) => a.platform === "threads");

  const Section = ({ provider, list, ready }) => (
    <Card>
      <CardHeader
        title={PROVIDERS[provider].title}
        subtitle={PROVIDERS[provider].blurb}
        extra={<Button variant="primary" size="sm" icon={<Link2 className="size-4" />} disabled={!ready} onClick={() => setDialog(provider)}>{list.length ? "Connect another" : PROVIDERS[provider].cta}</Button>}
      />
      <CardBody className="space-y-3">
        {!ready && (
          <Alert type="warning" title={`${provider === "threads" ? "Threads" : "Meta"} is not configured`}>
            {provider === "threads"
              ? <>Set <code>THREADS_APP_ID</code>, <code>THREADS_APP_SECRET</code>, <code>THREADS_REDIRECT_URI</code> and <code>PUBLISHING_TOKEN_ENCRYPTION_KEY</code> in <code>backend/.env</code> and restart.</>
              : <>Set <code>META_APP_ID</code>, <code>META_APP_SECRET</code>, <code>META_REDIRECT_URI</code> and <code>PUBLISHING_TOKEN_ENCRYPTION_KEY</code> in <code>backend/.env</code> and restart.</>}
            {" "}See <code>docs/social-promotion.md</code> for the app setup.
          </Alert>
        )}
        {loading && <SkeletonRows rows={2} />}
        {error && <ErrorState message="Could not load accounts" onRetry={onRetry} />}
        {!loading && !error && list.length === 0 && (
          <EmptyState description="Nothing connected yet. Your tokens are encrypted on the server and never sent to the browser." />
        )}
        {list.map((a) => (
          <AccountCard key={a._id} account={a} busy={isBusy} onValidate={validate} onReconnect={setDialog} onDisconnect={disconnect} />
        ))}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-4">
      {(caps?.restrictions || []).map((r) => <Alert key={r} type="info" title="Media delivery"><span>{r}</span></Alert>)}
      {Section({ provider: "meta", list: meta, ready: metaReady })}
      {Section({ provider: "threads", list: threads, ready: threadsReady })}
      <ConnectDialog provider={dialog} open={Boolean(dialog)} onClose={() => setDialog(null)} onContinue={proceed} busy={isBusy("connect")} />
    </div>
  );
};

export default AccountsPanel;
