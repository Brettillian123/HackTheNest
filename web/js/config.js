// Site configuration. API_MODE "mock" works with no server; "live" calls the real API
// (and falls back to mock data for any endpoint the server does not have yet).
// Default: "live" on a real host, "mock" on localhost, 127.0.0.1, [::1] and under node.
// Override in the address bar with ?mock=1 or ?live=1.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function modeFor(loc) {
  try {
    if (!loc || !loc.hostname) return "mock";
    const q = new URLSearchParams(loc.search || "");
    const forced = q.has("live") ? "live" : q.has("mock") ? "mock" : null;
    // An override lasts for the tab, so it survives clicking to the next page.
    let ss = null;
    try { ss = globalThis.sessionStorage || null; } catch { ss = null; }
    if (forced) {
      try { ss && ss.setItem("pd.mode", forced); } catch { /* storage blocked */ }
      return forced;
    }
    let kept = null;
    try { kept = ss && ss.getItem("pd.mode"); } catch { kept = null; }
    if (kept === "live" || kept === "mock") return kept;
    return LOCAL_HOSTS.has(loc.hostname) ? "mock" : "live";
  } catch {
    return "mock";
  }
}

export const API_MODE = modeFor(globalThis.location);

// Same origin by default. Set a full origin here if the API is hosted elsewhere.
export const API_BASE = "";
