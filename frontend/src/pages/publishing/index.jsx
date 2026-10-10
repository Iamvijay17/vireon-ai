import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, ListChecks, Link2, GraduationCap } from "lucide-react";
import { PageHeader } from "../../components";
import { Tabs } from "../../components/ui/Tabs";
import { Alert } from "../../components/ui/Alert";
import { toast } from "../../components/ui/toastBus";
import { usePublishingCapabilities, usePublishingAccounts } from "./usePublishing";
import { connectResultMessage } from "./format";
import { PublishPanel } from "./PublishPanel";
import { QueuePanel } from "./QueuePanel";
import { AccountsPanel } from "./AccountsPanel";
import { UdemyPanel } from "./UdemyPanel";
import { PublishDialog } from "./PublishDialog";

const TABS = [
  { key: "publish", label: "Publish", icon: <Send className="size-4" /> },
  { key: "queue", label: "Queue & history", icon: <ListChecks className="size-4" /> },
  { key: "accounts", label: "Accounts", icon: <Link2 className="size-4" /> },
  { key: "udemy", label: "Udemy", icon: <GraduationCap className="size-4" /> },
];
const VALID = new Set(TABS.map((t) => t.key));
const EMPTY = [];

/**
 * Publishing: YouTube uploads (real, via the official Data API) and Udemy
 * course packages (export + manual upload - Udemy offers no publishing API).
 *
 * Nothing on this page publishes by itself. Every YouTube upload goes
 * draft -> review -> explicit confirmation, and finished videos are never
 * uploaded as a side effect of being generated.
 */
const PublishingPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = VALID.has(params.get("tab")) ? params.get("tab") : "publish";
  const [reviewing, setReviewing] = useState(null); // a draft opened from the queue

  const { data: caps } = usePublishingCapabilities();
  const { data: accountData, loading: loadingAccounts, error: accountsError, refetch: refetchAccounts } = usePublishingAccounts();
  const accounts = accountData?.accounts ?? EMPTY;

  const setTab = (key) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", key);
    next.delete("connect");
    return next;
  }, { replace: true });

  // Google sends the browser back here with ?connect=<result> (see backend googleCallback).
  const connectResult = params.get("connect");
  const announced = useRef(null); // the effect can run twice (StrictMode) before the param is cleared below
  useEffect(() => {
    if (!connectResult) {
      announced.current = null;
      return;
    }
    if (announced.current === connectResult) return;
    announced.current = connectResult;
    const msg = connectResultMessage(connectResult);
    toast[msg.type === "success" ? "success" : "error"](`${msg.title}. ${msg.message}`, 8000);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("connect");
      next.set("tab", "accounts");
      return next;
    }, { replace: true });
  }, [connectResult, setParams]);

  const attention = accounts.filter((a) => a.status !== "connected");

  return (
    <div>
      <PageHeader title="Publishing" description="Publish finished lessons to YouTube, and prepare whole courses for Udemy." />

      {attention.length > 0 && tab !== "accounts" && (
        <Alert type="warning" title="A YouTube account needs reconnecting" className="mb-4"
          action={<button type="button" className="cursor-pointer text-[13px] font-medium text-accent hover:underline" onClick={() => setTab("accounts")}>Go to Accounts</button>}>
          {attention.map((a) => a.displayName || a.externalId).join(", ")} can't be used for uploads until you reconnect it.
        </Alert>
      )}

      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-5" />

      {tab === "publish" && <PublishPanel caps={caps} accounts={accounts} onViewQueue={() => setTab("queue")} />}
      {tab === "queue" && <QueuePanel caps={caps} accounts={accounts} onReview={(job) => setReviewing(job)} />}
      {tab === "accounts" && <AccountsPanel caps={caps} accounts={accounts} loading={loadingAccounts} error={accountsError} onRetry={refetchAccounts} />}
      {tab === "udemy" && <UdemyPanel />}

      {reviewing && (
        <PublishDialog jobId={reviewing._id} lesson={{ title: reviewing.lessonTitle }} accounts={accounts} caps={caps}
          onClose={() => setReviewing(null)} onSubmitted={() => setReviewing(null)} />
      )}
    </div>
  );
};

export default PublishingPage;
