import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LayoutDashboard, Link2, Wand2, ListChecks, CalendarDays, BarChart3 } from "lucide-react";
import { PageHeader } from "../../components";
import { Tabs } from "../../components/ui/Tabs";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toastBus";
import { useSocialCapabilities, useSocialAccounts } from "./usePromotion";
import { connectResultMessage } from "./format";
import { OverviewPanel } from "./OverviewPanel";
import { AccountsPanel } from "./AccountsPanel";
import { CreatePanel } from "./CreatePanel";
import { PostsPanel } from "./PostsPanel";
import { CalendarPanel } from "./CalendarPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";

const TABS = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="size-4" />, path: "/promotion" },
  { key: "accounts", label: "Accounts", icon: <Link2 className="size-4" />, path: "/promotion/accounts" },
  { key: "create", label: "Create promotion", icon: <Wand2 className="size-4" />, path: "/promotion/create" },
  { key: "posts", label: "Posts", icon: <ListChecks className="size-4" />, path: "/promotion/posts" },
  { key: "calendar", label: "Calendar", icon: <CalendarDays className="size-4" />, path: "/promotion/calendar" },
  { key: "analytics", label: "Analytics", icon: <BarChart3 className="size-4" />, path: "/promotion/analytics" },
];
const EMPTY = [];

const tabFromPath = (pathname) => {
  const seg = pathname.replace(/\/+$/, "").split("/")[2] || "overview";
  return TABS.some((t) => t.key === seg) ? seg : "overview";
};

/**
 * Promotion Studio: connect Facebook Pages, Instagram and Threads accounts, turn a Vireon video into
 * platform-specific posts, preview them, post or schedule them, and see what happened.
 *
 * Nothing on this page posts by itself. A post is created only by the confirmed publish button on the
 * Create tab, and shows as Published only after the platform has confirmed it.
 */
const PromotionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = tabFromPath(location.pathname);

  const { data: caps } = useSocialCapabilities();
  const { data: accountData, loading, error, refetch } = useSocialAccounts();
  const accounts = accountData?.accounts ?? EMPTY;

  const go = (key) => navigate(TABS.find((t) => t.key === key)?.path || "/promotion");

  // The platform sends the browser back here with ?connect=<result>&provider=<meta|threads>&count=<n>.
  const connectResult = params.get("connect");
  const announced = useRef(null); // the effect can run twice (StrictMode) before the param is cleared below
  useEffect(() => {
    if (!connectResult) {
      announced.current = null;
      return;
    }
    if (announced.current === connectResult) return;
    announced.current = connectResult;
    const msg = connectResultMessage(connectResult, params.get("provider"), Number(params.get("count")) || 0);
    toast[msg.type === "success" ? "success" : "error"](`${msg.title}. ${msg.message}`, 8000);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      ["connect", "provider", "count"].forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  }, [connectResult, params, setParams]);

  const attention = accounts.filter((a) => a.status !== "connected");

  return (
    <div>
      <PageHeader
        title="Promotion Studio"
        description="Turn your videos into posts for Facebook, Instagram and Threads - preview them, post or schedule them, and see the results."
        extra={<Button variant="primary" icon={<Wand2 className="size-4" />} onClick={() => go("create")}>Create promotion</Button>}
      />

      {attention.length > 0 && tab !== "accounts" && (
        <Alert
          type="warning" title="An account needs reconnecting" className="mb-4"
          action={<button type="button" className="cursor-pointer text-[13px] font-medium text-accent hover:underline" onClick={() => go("accounts")}>Go to Accounts</button>}
        >
          {attention.map((a) => a.displayName || a.externalId).join(", ")} can&apos;t be used for posting until you reconnect {attention.length === 1 ? "it" : "them"}.
        </Alert>
      )}

      <Tabs items={TABS} active={tab} onChange={go} className="mb-5" />

      {tab === "overview" && <OverviewPanel caps={caps} go={go} />}
      {tab === "accounts" && <AccountsPanel caps={caps} accounts={accounts} loading={loading} error={error} onRetry={refetch} />}
      {tab === "create" && <CreatePanel caps={caps} accounts={accounts} />}
      {tab === "posts" && <PostsPanel accounts={accounts} />}
      {tab === "calendar" && <CalendarPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
    </div>
  );
};

export default PromotionPage;
