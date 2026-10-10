import { useState } from "react";
import { Link2, Unplug, ShieldCheck, RefreshCw, Plug } from "lucide-react";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { RelativeTime } from "../../components/ui/RelativeTime";
import { confirmDialog } from "../../components/ui/confirmBus";
import { toast } from "../../components/ui/toastBus";
import { ErrorState } from "../../components";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { startSocialConnect, validateSocialAccount, disconnectSocialAccount } from "../../services/api";
import { useBusy } from "./usePromotion";
import { PlatformTile, SkeletonRows } from "./shared";

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

// One card per platform. Facebook and Instagram share one Meta sign-in (Instagram professional accounts are
// reached through their linked Facebook Page), so their buttons start the same flow with platform-specific advice.
const CARDS = [
  {
    key: "facebook", provider: "meta", platform: "facebook", title: "Facebook", noun: "Page", cta: "Connect Facebook",
    blurb: "Post text, photos, videos and Reels to the Facebook Pages you choose.",
    asks: [
      "See your Pages, and publish posts and Reels to the Pages you select",
      "Read post insights, so Analytics can show results",
    ],
    requirements: [
      "You must be able to create content on the Page.",
      "While your Meta app is in Development mode, only people with a role on the app can connect, and posts are real posts.",
    ],
  },
  {
    key: "threads", provider: "threads", platform: "threads", title: "Threads", noun: "profile", cta: "Connect Threads",
    blurb: "Post text, images and videos to your Threads profile.",
    asks: ["Read your Threads profile", "Publish text, image and video posts", "Read post insights"],
    requirements: [
      "Image and video posts need a public media URL on this server (text posts do not).",
      "Access lasts 60 days and Vireon renews it automatically while you keep using it.",
    ],
  },
];

// Instagram has two ways in. Instagram login (preferred, no Facebook Page) when the server has its app configured,
// otherwise the Facebook route through a linked Page.
const INSTAGRAM_LOGIN_CARD = {
  key: "instagram", provider: "instagram", platform: "instagram", title: "Instagram", noun: "account", cta: "Connect Instagram", via: "Instagram",
  blurb: "Post photos and Reels to your Instagram Business or Creator account. Sign in with Instagram - no Facebook Page needed.",
  asks: [
    "Read your Instagram profile",
    "Publish photos and Reels to your Instagram professional account",
    "Read post insights, so Analytics can show results",
  ],
  requirements: [
    "The account must be an Instagram Professional (Business or Creator) account. Personal accounts cannot post through the API.",
    "Instagram posts need a public media URL on this server (SOCIAL_PUBLIC_MEDIA_BASE_URL), for photos and for Reels.",
    "Access lasts 60 days and Vireon renews it automatically while you keep using it.",
    "While your Meta app is in Development mode, the Instagram account needs a tester role on the app, and posts are real posts.",
  ],
};
const INSTAGRAM_FACEBOOK_CARD = {
  key: "instagram", provider: "meta", platform: "instagram", title: "Instagram", noun: "account", cta: "Connect Instagram", via: "Meta",
  blurb: "Post photos and Reels to your Instagram Business or Creator account through its linked Facebook Page.",
  asks: [
    "Publish to the Instagram professional accounts linked to the Pages you select",
    "Read post insights, so Analytics can show results",
  ],
  requirements: [
    "Instagram must be a Professional (Business or Creator) account linked to a Facebook Page.",
    "Instagram signs in through Meta here, so you will see the same Meta sign-in as for Facebook; connecting either one connects both.",
    "While your Meta app is in Development mode, only people with a role on the app can connect, and posts are real posts.",
  ],
};

const ConnectDialog = ({ card, open, onClose, onContinue, busy }) => {
  if (!card) return null;
  return (
    <Modal
      open={open} onClose={onClose} title={card.cta} description={card.blurb} width="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Plug className="size-4" />} loading={busy} onClick={onContinue}>Continue to {card.via || (card.provider === "threads" ? "Threads" : "Meta")}</Button>
        </>
      )}
    >
      <div className="space-y-4 text-[13px]">
        <div>
          <p className="mb-1.5 font-semibold text-text-primary">Vireon will ask for permission to</p>
          <ul className="list-disc space-y-1 pl-5 text-text-secondary">{card.asks.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1.5 font-semibold text-text-primary">Before you continue</p>
          <ul className="list-disc space-y-1 pl-5 text-text-secondary">{card.requirements.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
        <p className="flex items-start gap-1.5 rounded-lg bg-surface-hover p-3 text-text-secondary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-600" />
          You sign in on the platform&apos;s own page; Vireon never sees your password. Access tokens are encrypted on the server and never sent to this browser.
        </p>
      </div>
    </Modal>
  );
};

const AccountRow = ({ account, card, busy, onValidate, onReconnect, onDisconnect }) => {
  const ok = account.status === "connected";
  return (
    <li className="rounded-lg border border-border-light p-3">
      <div className="flex items-start gap-3">
        {account.thumbnailUrl ? (
          <img src={account.thumbnailUrl} alt="" className="size-10 shrink-0 rounded-full bg-surface-hover object-cover" referrerPolicy="no-referrer" />
        ) : <PlatformTile platform={account.platform} size="lg" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-text-primary">{account.displayName || account.externalId}</p>
          {account.username && <p className="truncate text-[13px] text-text-secondary">@{account.username}</p>}
          {account.meta?.pageName && account.platform === "instagram" && <p className="truncate text-xs text-text-tertiary">Linked Page: {account.meta.pageName}</p>}
          <div className="mt-1"><Badge variant={ok ? "success" : "warning"} dot>{ok ? "Connected" : "Needs reconnecting"}</Badge></div>
        </div>
      </div>
      {!ok && account.statusReason && <p className="mt-2 text-[13px] text-text-secondary">{account.statusReason}</p>}
      <p className="mt-2 text-xs text-text-tertiary">
        Connected <RelativeTime value={account.connectedAt} />
        {account.lastValidatedAt ? <> · checked <RelativeTime value={account.lastValidatedAt} /></> : null}
        {account.tokenExpiresInDays !== undefined && ok ? ` · renews automatically (${account.tokenExpiresInDays} days left)` : null}
      </p>
      {(account.scopes || []).length > 0 && (
        <details className="mt-2 text-xs text-text-tertiary">
          <summary className="cursor-pointer select-none hover:text-text-secondary">Permissions ({account.scopes.length})</summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {account.scopes.map((s) => <Badge key={s} variant="neutral">{PERMISSION_LABEL[s] || s}</Badge>)}
          </div>
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {ok && <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} loading={busy(`validate:${account._id}`)} onClick={() => onValidate(account)}>Check</Button>}
        {!ok && <Button size="sm" variant="primary" icon={<Link2 className="size-4" />} onClick={() => onReconnect(card)}>Reconnect</Button>}
        <Button size="sm" variant="secondary" icon={<Unplug className="size-4" />} loading={busy(`disconnect:${account._id}`)} onClick={() => onDisconnect(account)}>Disconnect</Button>
      </div>
    </li>
  );
};

/** One card per platform (Facebook, Instagram, Threads): its connected accounts and a Connect button. */
export const AccountsPanel = ({ caps, accounts, loading, error, onRetry }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [dialog, setDialog] = useState(null); // the CARDS entry whose consent dialog is open

  const platforms = caps?.platforms || {};
  const metaReady = Boolean(platforms.facebook?.configured);
  const threadsReady = Boolean(platforms.threads?.configured);
  // Instagram: sign in with Instagram when the server has that app, else through a Facebook Page (needs Meta).
  const instagramLoginReady = Boolean(platforms.instagram?.login?.instagram);
  const ready = { meta: metaReady, threads: threadsReady, instagram: instagramLoginReady };
  const cards = [CARDS[0], instagramLoginReady ? INSTAGRAM_LOGIN_CARD : INSTAGRAM_FACEBOOK_CARD, CARDS[1]];

  const proceed = async () => {
    const res = await run("connect", () => startSocialConnect(dialog.provider));
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

  const renderCard = (card) => {
    const list = accounts.filter((a) => a.platform === card.platform);
    const isReady = ready[card.provider];
    const hasAttention = list.some((a) => a.status !== "connected");
    return (
      <Card key={card.key} className="flex flex-col">
        <CardBody className="flex flex-1 flex-col gap-4">
          <div className="flex items-start gap-3">
            <PlatformTile platform={card.platform} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-text-primary">{card.title}</h3>
                {!loading && !error && (
                  list.length === 0
                    ? <Badge variant="neutral">Not connected</Badge>
                    : <Badge variant={hasAttention ? "warning" : "success"} dot>{hasAttention ? "Needs attention" : `${list.length} connected`}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-text-secondary">{card.blurb}</p>
            </div>
          </div>

          {loading && <SkeletonRows rows={1} />}
          {error && <ErrorState message="Could not load accounts" onRetry={onRetry} />}
          {!loading && !error && list.length > 0 && (
            <ul className="space-y-2">
              {list.map((a) => (
                <AccountRow key={a._id} account={a} card={card} busy={isBusy} onValidate={validate} onReconnect={(c) => setDialog(c.platform === "instagram" && a.meta?.login === "instagram" ? INSTAGRAM_LOGIN_CARD : c)} onDisconnect={disconnect} />
              ))}
            </ul>
          )}
          {!loading && !error && list.length === 0 && (
            <p className="text-[13px] text-text-tertiary">
              {card.platform === "instagram" && card.provider === "meta" && accounts.some((a) => a.platform === "facebook")
                ? "No Instagram account found. Link an Instagram Business or Creator account to your Facebook Page, then connect again."
                : `No ${card.title} ${card.noun} connected yet.`}
            </p>
          )}

          <div className="mt-auto pt-1">
            <Button variant={list.length ? "secondary" : "primary"} className="w-full" icon={<Link2 className="size-4" />} disabled={!isReady} onClick={() => setDialog(card)}>
              {list.length ? `Connect another ${card.title} ${card.noun}` : card.cta}
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {(caps?.restrictions || []).map((r) => <Alert key={r} type="info" title="Media delivery"><span>{r}</span></Alert>)}
      {caps && !metaReady && (
        <Alert type="warning" title="Meta is not configured">
          Facebook {instagramLoginReady ? "needs" : "and Instagram need"} <code>META_APP_ID</code>, <code>META_APP_SECRET</code>, <code>META_REDIRECT_URI</code> and <code>PUBLISHING_TOKEN_ENCRYPTION_KEY</code> in <code>backend/.env</code>. Restart after setting them. See <code>docs/social-promotion.md</code> for the app setup.
        </Alert>
      )}
      {caps && !metaReady && !instagramLoginReady && (
        <Alert type="info" title="Instagram can also sign in directly">
          To connect Instagram without a Facebook Page, set <code>INSTAGRAM_APP_ID</code>, <code>INSTAGRAM_APP_SECRET</code> and <code>INSTAGRAM_REDIRECT_URI</code> in <code>backend/.env</code> and restart. See <code>docs/social-promotion.md</code>.
        </Alert>
      )}
      {caps && !threadsReady && (
        <Alert type="warning" title="Threads is not configured">
          Set <code>THREADS_APP_ID</code>, <code>THREADS_APP_SECRET</code>, <code>THREADS_REDIRECT_URI</code> and <code>PUBLISHING_TOKEN_ENCRYPTION_KEY</code> in <code>backend/.env</code> and restart. See <code>docs/social-promotion.md</code> for the app setup.
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-3">{cards.map(renderCard)}</div>
      <ConnectDialog card={dialog} open={Boolean(dialog)} onClose={() => setDialog(null)} onContinue={proceed} busy={isBusy("connect")} />
    </div>
  );
};

export default AccountsPanel;
