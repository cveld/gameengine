const test = require("node:test");
const assert = require("node:assert/strict");
const Body = require("../src/assets/orbit-catch/body.js");

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function head(x, y, z, yaw = 0) {
  // Column-major head pose rotated by yaw around +Y; looks along -Z at yaw 0.
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1];
}

test("hand bones cover all 25 WebXR joints and the palm outline", () => {
  const names = new Set(Body.HAND_BONES.flat());
  assert.equal(names.size, 25);
  for (const name of Body.PALM_OUTLINE) assert.ok(names.has(name), name);
});

test("shoulders sit below the head on the correct side and follow head yaw", () => {
  const left = Body.shoulder(head(0, 1.6, 0), -1), right = Body.shoulder(head(0, 1.6, 0), 1);
  assert.ok(left[0] < 0 && right[0] > 0);
  assert.ok(Math.abs(left[1] - 1.36) < 1e-9);
  // Turned 90 degrees left (looking along -X): the right shoulder moves to -Z.
  const turned = Body.shoulder(head(0, 1.6, 0, Math.PI / 2), 1);
  assert.ok(turned[2] < -0.1, JSON.stringify(turned));
});

test("the elbow keeps both arm segments at their lengths for a reachable wrist", () => {
  const s = [0.18, 1.36, 0.06], w = [0.25, 1.1, -0.35];
  const e = Body.elbow(s, w, [0, -1, 0]);
  assert.ok(Math.abs(dist(s, e) - Body.UPPER_ARM) < 1e-6);
  assert.ok(Math.abs(dist(e, w) - Body.FOREARM) < 1e-6);
  assert.ok(e[1] < (s[1] + w[1]) / 2, "elbow bends downwards");
});

test("out-of-reach and degenerate wrists still give finite arms", () => {
  const far = Body.arm(head(0, 1.6, 0), [0.2, 1.4, -2], [0, 0, 1], 1);
  assert.ok([...far.shoulder, ...far.elbow, ...far.wrist].every(Number.isFinite));
  assert.ok(Math.abs(dist(far.shoulder, far.elbow) - Body.UPPER_ARM) < 1e-6);
  const onShoulder = Body.arm(head(0, 1.6, 0), Body.shoulder(head(0, 1.6, 0), 1), null, 1);
  assert.ok(onShoulder.elbow.every(Number.isFinite));
  assert.equal(Body.arm(head(0, 1.6, 0), [NaN, 0, 0], null, 1), null);
});

test("side follows handedness, or the hand's position when unknown", () => {
  const h = head(0, 1.6, 0);
  assert.equal(Body.sideOf("left", h, [1, 1, 0]), -1);
  assert.equal(Body.sideOf("right", h, [-1, 1, 0]), 1);
  assert.equal(Body.sideOf("none", h, [-0.3, 1.2, -0.3]), -1);
  assert.equal(Body.sideOf("none", h, [0.3, 1.2, -0.3]), 1);
});
