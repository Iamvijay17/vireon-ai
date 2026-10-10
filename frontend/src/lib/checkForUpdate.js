// Ask the server which frontend build it is serving right now and compare it
// with the build this tab loaded. /version.json is written at image build time
// (frontend/Dockerfile) and nginx serves it `no-store`, so unlike /api/version
// this tests the files users actually download.

/**
 * @param {string} localCommit  short commit this tab was built from ("" for dev builds)
 * @param {{commit?: string, version?: string} | null} remote  parsed /version.json
 * @returns {"dev" | "unknown" | "current" | "outdated"}
 */
export function compareBuild(localCommit, remote) {
  if (!localCommit) return "dev";
  if (!remote?.commit) return "unknown";
  return remote.commit.startsWith(localCommit) || localCommit.startsWith(remote.commit) ? "current" : "outdated";
}

/** Fetch the live build stamp; resolves null if it is missing or not JSON (e.g. dev server). */
export async function fetchLatestBuild() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}
