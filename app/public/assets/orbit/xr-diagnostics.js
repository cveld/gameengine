(function (root) {
  "use strict";
  function profile(key, minimal, minimalHands = false) {
    if (key === "ar" && minimal) return {
      optionalFeatures: minimalHands ? ["hand-tracking"] : [],
      spaces: ["local"], name: minimalHands ? "minimal-local-hands" : "minimal-local"
    };
    if (key === "ar-free") return {
      optionalFeatures: ["unbounded", "local-floor", "hand-tracking"],
      spaces: ["unbounded", "local-floor", "local"], name: "free-roam"
    };
    return { optionalFeatures: ["local-floor", "hand-tracking"], spaces: ["local-floor", "local"], name: "standard" };
  }
  function create(environment) {
    let attempt = null;
    const events = [];
    function record(event, detail = "") {
      events.push({ event: String(event).slice(0, 64), detail: String(detail).slice(0, 200) });
      if (events.length > 24) events.shift();
    }
    return {
      begin(mode, selected) {
        events.length = 0;
        attempt = {
          mode, profile: selected.name, requestedFeatures: [...selected.optionalFeatures],
          enabledFeatures: null, referenceSpace: null, environmentBlendMode: null,
          state: "requesting", firstFrameRendered: false, inputs: []
        };
        record("request-session");
      },
      update(value) {
        if (attempt) Object.assign(attempt, value);
      },
      finish() {
        if (attempt && attempt.state !== "failed") attempt.state = "ended";
        record("session-ended");
      },
      record,
      text() {
        // Deliberately omit room/head/hand poses, device IDs, URLs and storage.
        return JSON.stringify({
          report: "Orbit XR diagnostics v1", environment,
          attempt, events,
          note: "Requested features are not proof of enabled features. null means not reported or not yet known. No WebXR Guardian switch is assumed."
        }, null, 2);
      }
    };
  }
  const api = { profile, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitXRDiagnostics = api;
})(typeof window !== "undefined" ? window : globalThis);
