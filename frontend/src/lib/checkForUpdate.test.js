import { compareBuild } from "./checkForUpdate";

const FULL = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

describe("compareBuild", () => {
  it("is current when the served commit starts with this tab's short commit", () => {
    expect(compareBuild("a1b2c3d", { commit: FULL })).toBe("current");
  });
  it("is outdated when the commits differ", () => {
    expect(compareBuild("a1b2c3d", { commit: "ffffffff" + FULL.slice(8) })).toBe("outdated");
  });
  it("is dev for unstamped local builds", () => {
    expect(compareBuild("", { commit: FULL })).toBe("dev");
  });
  it("is unknown when the server gave no stamp", () => {
    expect(compareBuild("a1b2c3d", null)).toBe("unknown");
    expect(compareBuild("a1b2c3d", {})).toBe("unknown");
  });
});
