const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, profile } = require("../src/assets/orbit/xr-diagnostics.js");

test("Minimal AR requests only local tracking without changing VR or free-roam profiles", () => {
  assert.deepEqual(profile("ar", true), { optionalFeatures: [], spaces: ["local"], name: "minimal-local" });
  assert.deepEqual(profile("ar", false).optionalFeatures, ["local-floor", "hand-tracking"]);
  assert.deepEqual(profile("vr", true), profile("vr", false));
  assert.deepEqual(profile("ar-free", true), profile("ar-free", false));
  assert.deepEqual(profile("ar-free", false).spaces, ["unbounded", "local-floor", "local"]);
});
test("Minimal AR can add only hand tracking while preserving the no-feature baseline", () => {
  assert.deepEqual(profile("ar", true, true), {
    optionalFeatures: ["hand-tracking"], spaces: ["local"], name: "minimal-local-hands"
  });
  assert.deepEqual(profile("ar", true, false).optionalFeatures, []);
  for (const key of ["vr", "ar-free"]) assert.deepEqual(profile(key, true, true), profile(key, false));
  assert.deepEqual(profile("ar", false, true), profile("ar", false));
});
test("Requested features are never reported as granted without browser evidence", () => {
  const diagnostics = create({ support: {} });
  diagnostics.begin("immersive-ar", profile("ar", false));
  const attempt = JSON.parse(diagnostics.text()).attempt;
  assert.equal(attempt.enabledFeatures, null);
  assert.equal(attempt.referenceSpace, null);
  assert.equal(attempt.firstFrameRendered, false);
  assert.deepEqual(attempt.requestedFeatures, ["local-floor", "hand-tracking"]);
  diagnostics.update({ enabledFeatures: ["local"], referenceSpace: "local" });
  assert.deepEqual(JSON.parse(diagnostics.text()).attempt.enabledFeatures, ["local"]);
});
test("Diagnostics retain failure evidence after cleanup and start a fresh report on retry", () => {
  const diagnostics = create({});
  diagnostics.begin("immersive-ar", profile("ar", true));
  diagnostics.update({ state: "failed" });
  diagnostics.record("setup-failed", "NotAllowedError");
  diagnostics.finish();
  const report = JSON.parse(diagnostics.text());
  assert.equal(report.attempt.state, "failed");
  assert.equal(report.events.at(-1).event, "session-ended");
  diagnostics.begin("immersive-vr", profile("vr", false));
  assert.equal(JSON.parse(diagnostics.text()).events.length, 1);
  diagnostics.finish();
  assert.equal(JSON.parse(diagnostics.text()).attempt.state, "ended");
});
test("Event history and browser error strings are bounded", () => {
  const diagnostics = create({});
  for (let i = 0; i < 50; i++) diagnostics.record(String(i), "x".repeat(1000));
  const events = JSON.parse(diagnostics.text()).events;
  assert.equal(events.length, 24);
  assert.equal(events[0].event, "26");
  assert.equal(events.at(-1).detail.length, 200);
});
