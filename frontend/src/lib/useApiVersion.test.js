import { describe, it, expect } from "vitest";
import { isStaleBuild } from "./useApiVersion";

describe("isStaleBuild", () => {
  it("is stale when the API runs a different stamped build", () => {
    expect(isStaleBuild("1.0.26", "1.0.25")).toBe(true);
  });
  it("is fresh when they match", () => {
    expect(isStaleBuild("1.0.25", "1.0.25")).toBe(false);
  });
  it("never flags unstamped dev builds", () => {
    expect(isStaleBuild("1.0.0-dev", "1.0.25")).toBe(false);
    expect(isStaleBuild("1.0.25", "1.0.0-dev")).toBe(false);
  });
  it("is fresh until the API has answered", () => {
    expect(isStaleBuild(undefined, "1.0.25")).toBe(false);
  });
});
