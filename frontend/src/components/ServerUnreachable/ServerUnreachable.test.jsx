// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServerUnreachable, ServerUnreachableBanner } from "./index";

globalThis.React = React;

const base = { checking: false, nextCheckAt: Date.now() + 8_000, downSince: Date.now() - 65_000, failures: 3 };

describe("ServerUnreachable", () => {
  it("explains an unreachable server and counts down to the next check", () => {
    render(<ServerUnreachable {...base} kind="unreachable" onRetry={() => {}} />);
    expect(screen.getByText("Can’t reach the Vireon server")).toBeTruthy();
    expect(screen.getByText(/Trying again in \d+s/)).toBeTruthy();
    expect(screen.getByText(/Offline for 1m/)).toBeTruthy();
    expect(screen.getByText(/3 failed checks/)).toBeTruthy();
  });

  it("words a gateway error as a restart", () => {
    render(<ServerUnreachable {...base} kind="restarting" onRetry={() => {}} />);
    expect(screen.getByText("The Vireon server is restarting")).toBeTruthy();
  });

  it("retries and dismisses on request", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<ServerUnreachable {...base} onRetry={onRetry} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Retry now"));
    fireEvent.click(screen.getByText("View last loaded data"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("says it is checking while a check is in flight", () => {
    render(<ServerUnreachable {...base} checking onRetry={() => {}} />);
    expect(screen.getByText("Checking now…")).toBeTruthy();
  });

  it("offers troubleshooting steps", () => {
    render(<ServerUnreachable {...base} onRetry={() => {}} />);
    expect(screen.getByText("Troubleshooting")).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });
});

describe("ServerUnreachableBanner", () => {
  it("keeps the retry control in reach once the full screen is dismissed", () => {
    const onRetry = vi.fn();
    render(<ServerUnreachableBanner checking={false} nextCheckAt={Date.now() + 5_000} onRetry={onRetry} />);
    expect(screen.getByText(/Server unreachable/)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry now"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
