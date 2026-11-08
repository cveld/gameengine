const { test } = require("node:test");
const assert = require("node:assert/strict");
const { multiply, anchorFromPose, position, moveOffset } = require("../src/assets/orbit/xr-math.js");
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

test("object translation uses horizontal heading, separate height and normalized diagonal speed", () => {
  const heading = anchorFromPose(identity()), offset = new Float32Array(3);
  assert.equal(moveOffset(offset, heading, 1, 0, 0, 0.1), offset);
  near(offset[0], 0.06); near(offset[1], 0); near(offset[2], 0);
  moveOffset(offset, heading, 0, 1, 1, 0.1);
  near(offset[1], 0.06 / Math.sqrt(2)); near(offset[2], -0.06 / Math.sqrt(2));
  const diagonal = moveOffset(new Float32Array(3), heading, 1, 1, 0, 0.1);
  near(Math.hypot(...diagonal), 0.06);
  const facingRight = identity(); facingRight[8] = -1; facingRight[10] = 0;
  const turned = moveOffset(new Float32Array(3), anchorFromPose(facingRight), 0, 1, 0, 0.1);
  near(turned[0], 0.06); near(turned[1], 0); near(turned[2], 0);
});

test("object translation has bounded travel and no catch-up jump after a delayed frame", () => {
  const heading = anchorFromPose(identity()), offset = new Float32Array([2.99, 1.99, -2.99]);
  moveOffset(offset, heading, 1, 1, 1, 0.1);
  assert.deepEqual(Array.from(offset), [3, 2, -3]);
  for (let i = 0; i < 200; i++) moveOffset(offset, heading, -1, -1, -1, 0.1);
  assert.deepEqual(Array.from(offset), [-3, -2, 3]);
  const late = moveOffset(new Float32Array(3), heading, 1, 0, 0, 10);
  near(late[0], 0.06);
  assert.deepEqual(moveOffset(late, heading, 0, 0, 0, 0.1), late);
});
