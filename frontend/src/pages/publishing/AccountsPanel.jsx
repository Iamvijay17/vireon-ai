import { Link2, Unplug, ShieldCheck, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Progress } from "../../components/ui/Progress";
import { RelativeTime } from "../../components/ui/RelativeTime";
import { confirmDialog } from "../../components/ui/confirmBus";
import { EmptyState, ErrorState, LoadingState } from "../../components";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { startYouTubeConnect, disconnectPublishingAccount } from "../../services/api";
import { useBusy } from "./usePublishing";

const SCOPE_LABEL = {
  "https://www.googleapis.com/auth/youtube.upload": "Upload videos",
  "https://www.googleapis.com/auth/youtube.readonly": "View channel & video status",
};

const AccountCard = ({ account, busy, onReconnect, onDisconnect }) => {
  const ok = account.status === "connected";
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border-light p-4">
      {account.thumbnailUrl ? (
        <img src={account.thumbnailUrl} alt="" className="size-11 shrink-0 rounded-full bg-surface-hover object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-text-secondary">
          {(account.displayName || "?").slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-semibold text-text-primary">{account.displayName || account.externalId}</p>
          <Badge variant={ok ? "success" : "warning"} dot>{ok ? "Connected" : "Needs reconnecting"}</Badge>
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">{account.externalId}</p>
        {!ok && account.statusReason && <p className="mt-2 text-[13px] text-text-secondary">{account.statusReason}</p>}
        <p className="mt-2 text-xs text-text-tertiary">
          Connected <RelativeTime value={account.connectedAt} />
          {account.lastUsedAt ? <> · last used <RelativeTime value={account.lastUsedAt} /></> : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(account.scopes || []).map((s) => <Badge key={s} variant="neutral">{SCOPE_LABEL[s] || s}</Badge>)}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {!ok && <Button size="sm" variant="primary" icon={<RefreshCw className="size-4" />} loading={busy("connect")} onClick={onReconnect}>Reconnect</Button>}
        <Button size="sm" variant="secondary" icon={<Unplug className="size-4" />} loading={busy(`disconnect:${account._id}`)} onClick={() => onDisconnect(account)}>Disconnect</Button>
      </div>
    </div>
  );
};

/** Connected YouTube channels, connection status, and the day's upload allowance. */
export const AccountsPanel = ({ accounts, loading, error, onRetry, caps }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const yt = caps?.youtube;

  const connect = async () => {
    const res = await run("connect", () => startYouTubeConnect("/publishing"));
    // Hand the whole tab to Google's consent screen; it comes back to /publishing?connect=<result>.
    if (res?.data?.authUrl) window.location.assign(res.data.authUrl);
  };

  const disconnect = async (account) => {
    const yes = await confirmDialog({
      title: `Disconnect ${account.displayName || "this account"}?`,
      content: "Vireon revokes its access at Google and deletes the stored credential. Videos already on YouTube are not affected. Queued uploads for this channel will fail until it is connected again.",
      danger: true, confirmText: "Disconnect",
    });
    if (!yes) return;
    const res = await run(`disconnect:${account._id}`, () => disconnectPublishingAccount(account._id), {
      success: (r) => (r.data.revoked ? "Disconnected and access revoked at Google" : "Disconnected (Google could not be reached to revoke - remove Vireon in your Google account's security settings)"),
    });
    if (res) invalidate(queryKeys.publishing.all);
  };

  const used = yt?.uploadsToday ?? 0;
  const limit = yt?.dailyUploadLimit ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="YouTube channels"
          subtitle="Vireon asks Google for two permissions only: upload videos, and view your channel (to show which channel it is and confirm processing)."
          extra={<Button variant="primary" size="sm" icon={<Link2 className="size-4" />} loading={isBusy("connect")} disabled={!yt?.configured} onClick={connect}>Connect YouTube account</Button>}
        />
        <CardBody className="space-y-3">
          {!yt?.configured && (
            <Alert type="warning" title="Google OAuth is not configured">
              Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REDIRECT_URI</code> and <code>PUBLISHING_TOKEN_ENCRYPTION_KEY</code> in <code>backend/.env</code> and restart. See <code>docs/publishing.md</code> for the Google Cloud steps.
            </Alert>
          )}
          {loading && <LoadingState label="Loading accounts..." minHeight={120} />}
          {error && <ErrorState message="Could not load accounts" onRetry={onRetry} />}
          {!loading && !error && accounts.length === 0 && (
            <EmptyState description="No channel connected yet. Your tokens are encrypted on the server and never sent to the browser." />
          )}
          {accounts.map((a) => <AccountCard key={a._id} account={a} busy={isBusy} onReconnect={connect} onDisconnect={disconnect} />)}
        </CardBody>
      </Card>

      {yt?.configured && (
        <Card>
          <CardHeader title="Upload allowance" subtitle="Counted locally so Vireon stops before YouTube does. Resets at midnight Pacific time." />
          <CardBody className="space-y-3">
            <div>
              <div className="mb-1.5 flex justify-between text-[13px]">
                <span className="text-text-secondary">Uploads started today</span>
                <span className="font-medium text-text-primary">{used} of {limit}</span>
              </div>
              <Progress percent={limit ? (used / limit) * 100 : 0} showLabel={false} status={used >= limit ? "error" : "active"} />
              <p className="mt-1.5 text-xs text-text-tertiary">Resets {new Date(yt.quotaResetsAt).toLocaleString()}. Check your project's real figure in Google Cloud Console → APIs &amp; Services → Quotas.</p>
            </div>
            {(yt.restrictions || []).map((r) => (
              <Alert key={r} type="info" title="Visibility is limited"><span className="flex items-start gap-1.5"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />{r}</span></Alert>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default AccountsPanel;
