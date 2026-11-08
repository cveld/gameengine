const { test } = require("node:test");
const assert = require("node:assert/strict");
const { multiply, anchorFromPose, position } = require("../src/assets/orbit/xr-math.js");
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} differs from ${b}`);

test("view-projection multiplication uses column-major order and a reusable output", () => {
  const projection = identity();
  projection[0] = 2; projection[5] = 3; projection[10] = 4;
  const view = identity();
  view[12] = -1; view[13] = -2; view[14] = -3;
  const out = new Float32Array(16);
  assert.equal(multiply(projection, view, out), out);
  assert.deepEqual(Array.from(out).slice(12), [-2, -6, -12, 1]);
  assert.deepEqual(multiply(identity(), view), view);
});

test("initial placement is 1.8 meters ahead at the viewer's height", () => {
  const transform = identity();
  transform[12] = 2; transform[13] = 1.6; transform[14] = 3;
  const anchor = anchorFromPose(transform);
  const p = position(anchor, 1.8);
  near(p[0], 2); near(p[1], 1.6); near(p[2], 1.2);
});

test("placement follows the initial horizontal heading, not headset tilt", () => {
  const transform = identity();
  transform[8] = -0.5; transform[9] = 0.8; transform[10] = 0;
  const anchor = anchorFromPose(transform);
  assert.deepEqual(anchor.forward, [1, 0, -0]);
  const output = new Float32Array(3);
  assert.equal(position(anchor, 2, output), output);
  assert.deepEqual(Array.from(output), [2, 0, 0]);
});

test("vertical gaze has a stable finite forward fallback", () => {
  const transform = identity();
  transform[8] = 0; transform[9] = 1; transform[10] = 0;
  assert.deepEqual(anchorFromPose(transform).forward, [0, 0, -1]);
  assert.ok(position(anchorFromPose(transform), 0.85).every(Number.isFinite));
});
