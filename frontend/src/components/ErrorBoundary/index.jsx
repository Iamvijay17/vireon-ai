import { Component } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/**
 * Catches render-time crashes so one broken component doesn't blank the
 * whole app.
 *
 * Two failure modes are worth distinguishing, because the useful action
 * differs:
 *
 * 1. A genuine render error - show it, let the user retry the subtree
 *    (`reset`) without losing the rest of the app.
 * 2. A dynamic import failing - every route here is `lazy()`ed
 *    (see layout/index.jsx), so after a redeploy the browser can hold a
 *    stale index referencing chunk files that no longer exist. Retrying
 *    the same subtree can't fix that; only a reload fetches a fresh
 *    index. Before this existed, that case was a permanent white screen.
 *
 * A class component on purpose - `componentDidCatch` has no hook
 * equivalent.
 */

/** Vite/Rollup chunk-load failures don't share one error type, so match on message. */
const isChunkLoadError = (error) => {
  const message = `${error?.name || ""} ${error?.message || ""}`;
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console.error rather than routed anywhere: there is no
    // client-side error reporting backend, and swallowing this silently
    // would make a crash harder to diagnose than it already is.
    console.error("Unhandled render error", error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps) {
    // A navigation away from the broken screen should clear the error -
    // otherwise the boundary keeps showing a crash for a route the user
    // already left. `resetKey` is the route path (see layout/index.jsx).
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  reload = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset, reload: this.reload });
    }

    const staleBuild = isChunkLoadError(error);

    return (
      <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-danger-500/10">
          <AlertTriangle className="size-5 text-danger-500" />
        </div>

        <h2 className="text-[15px] font-semibold text-text-primary">
          {staleBuild ? "This page is out of date" : "Something went wrong"}
        </h2>

        <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-secondary">
          {staleBuild
            ? "The app was updated while this tab was open, so part of it could not be loaded. Reloading picks up the new version."
            : "This section failed to render. The rest of the app is still usable."}
        </p>

        {!staleBuild && (
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-hover p-3 text-left text-[11px] text-text-tertiary">
            {error?.message || String(error)}
          </pre>
        )}

        <div className="mt-5 flex items-center justify-center gap-2">
          {staleBuild ? (
            <Button variant="primary" size="sm" icon={<RefreshCw className="size-4" />} onClick={this.reload}>
              Reload
            </Button>
          ) : (
            <>
              <Button variant="primary" size="sm" icon={<RotateCcw className="size-4" />} onClick={this.reset}>
                Try again
              </Button>
              <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={this.reload}>
                Reload page
              </Button>
            </>
          )}
        </div>
      </Card>
    );
  }
}

export default ErrorBoundary;
