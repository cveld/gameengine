const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, read } = require("../src/assets/orbit/xr-hands.js");
const object = [0, 1.6, -1.8];
test("Hand summaries distinguish sources, valid poses and proximity without exporting coordinates", () => {
  const hands = create(), input = { handedness: "left" };
  const near = sample(input), far = sample(input, [0, 1.6, -5]);
  hands.update([near], object, 0);
  const summary = hands.summary([near, far, { input, rejected: { emulated: 3 } }], object);
  assert.equal(summary.sources, 3);
  assert.equal(summary.validHands, 2);
  assert.equal(summary.nearbyHands, 1);
  assert.equal(summary.emulatedJoints, 3);
  assert.equal(summary.armedHands, 1);
  assert.equal(JSON.stringify(summary).includes('"position"'), false);
  assert.equal(JSON.stringify(summary).includes('"thumb"'), false);
});
function sample(input, center = object, indexGap = 0.08, middleGap = 0.08) {
  const thumb = [center[0] - indexGap / 2, center[1], center[2]];
  return { input, handedness: input.handedness, thumb,
    index: [center[0] + indexGap / 2, center[1], center[2]],
    middle: [thumb[0] + middleGap, thumb[1], thumb[2]] };
}
function start(hands, input, center = object) {
  hands.update([sample(input, center)], object, 0);
  return hands.update([sample(input, center, 0.01)], object, 0.016);
}
test("Either hand grabs nearby geometry without snapping its center to the fingers", () => {
  for (const handedness of ["left", "right"]) {
    const hands = create(), input = { handedness };
    assert.deepEqual(start(hands, input, [0.4, 1.6, -1.8]).position, object);
    assert.equal(hands.grabbing, true);
    const moved = hands.update([sample(input, [0.6, 1.8, -1.6], 0.01)], object, 0.016);
    moved.position.forEach((value, i) => assert.ok(Math.abs(value - [0.2, 1.8, -1.6][i]) < 1e-10));
  }
});
test("A pinch must start after an observed open hand and near the object", () => {
  const hands = create(), input = { handedness: "right" };
  assert.equal(hands.update([sample(input, object, 0.01)], object, 0).position, null);
  hands.reset();
  start(hands, input, [3, 1.6, -1.8]);
  assert.equal(hands.grabbing, false);
  assert.equal(hands.update([sample(input, object, 0.01)], object, 0.016).position, null);
});
test("Renderer Float32 positions retain exact placement on the initial grab", () => {
  const hands = create(), input = { handedness: "right" }, position = new Float32Array(object);
  hands.update([sample(input, [0.4, 1.6, -1.8])], position, 0);
  assert.deepEqual(hands.update([sample(input, [0.4, 1.6, -1.8], 0.01)], position, 0.016).position,
    Array.from(position));
});
test("Pinch hysteresis retains the grab until a deliberate release", () => {
  const hands = create(), input = { handedness: "right" };
  start(hands, input);
  assert.ok(hands.update([sample(input, object, 0.03)], object, 0.016).position);
  assert.equal(hands.update([sample(input, object, 0.04)], object, 0.016).position, null);
  assert.equal(hands.grabbing, false);
});
test("Only one hand owns a grab; the other must release and pinch again to take over", () => {
  const hands = create(), left = { handedness: "left" }, right = { handedness: "right" };
  hands.update([sample(left), sample(right)], object, 0);
  hands.update([sample(left, object, 0.01), sample(right, object, 0.01)], object, 0.016);
  const result = hands.update([sample(left, [0.1, 1.6, -1.8], 0.01),
    sample(right, [-0.1, 1.6, -1.8], 0.01)], object, 0.016);
  assert.ok(Math.abs(result.position[0] - 0.1) < 1e-10);
  hands.update([sample(left), sample(right, object, 0.01)], result.position, 0.016);
  assert.equal(hands.grabbing, false);
});
for (const reason of ["missing", "invalid", "delay", "jump", "reset"]) {
  test(`Hand tracking ${reason} releases safely and requires reopening`, () => {
    const hands = create(), input = { handedness: "right" };
    start(hands, input);
    if (reason === "reset") hands.reset();
    else {
      let samples = [sample(input, object, 0.01)], elapsed = 0.016;
      if (reason === "missing") samples = [];
      if (reason === "invalid") samples[0].thumb[0] = NaN;
      if (reason === "delay") elapsed = 0.5;
      if (reason === "jump") samples = [sample(input, [1, 1.6, -1.8], 0.01)];
      assert.equal(hands.update(samples, object, elapsed).position, null);
    }
    assert.equal(hands.grabbing, false);
    assert.equal(hands.update([sample(input, object, 0.01)], object, 0.016).position, null);
    assert.ok(start(hands, input).position);
  });
}
test("Left thumb-middle pinch changes the shape once after a dwell and only after release can repeat", () => {
  const hands = create(), input = { handedness: "left" };
  hands.update([sample(input)], object, 0);
  assert.equal(hands.update([sample(input, object, 0.08, 0.01)], object, 0.1).changeShape, false);
  assert.equal(hands.update([sample(input, object, 0.08, 0.01)], object, 0.1).changeShape, false);
  assert.equal(hands.update([sample(input, object, 0.08, 0.01)], object, 0.1).changeShape, true);
  assert.equal(hands.update([sample(input, object, 0.08, 0.01)], object, 0.1).changeShape, false);
  hands.update([sample(input)], object, 0.1);
  for (let i = 0; i < 2; i++) hands.update([sample(input, object, 0.08, 0.01)], object, 0.1);
  assert.equal(hands.update([sample(input, object, 0.08, 0.01)], object, 0.1).changeShape, true);
});
test("Shape gesture is not available to the right hand, an index pinch, or while either hand grabs", () => {
  for (const scenario of ["right", "index", "grab"]) {
    const hands = create(), left = { handedness: "left" }, right = { handedness: "right" };
    const input = scenario === "right" ? right : left;
    hands.update([sample(input), sample(right)], object, 0);
    if (scenario === "grab") start(hands, right);
    for (let i = 0; i < 10; i++) {
      const samples = [sample(input, object, scenario === "index" ? 0.01 : 0.08, 0.01)];
      if (scenario === "grab") samples.push(sample(right, object, 0.01));
      assert.equal(hands.update(samples, object, 0.1).changeShape, false);
    }
  }
});
test("Joint sampling uses the active reference space and ignores missing, emulated, invalid or denied poses", () => {
  const space = {}, input = { handedness: "left", hand: new Map([
    ["thumb-tip", { name: "thumb" }], ["index-finger-tip", { name: "index" }]
  ]) };
  const frame = { getJointPose(joint, base) {
    assert.equal(base, space);
    return { transform: { position: { x: 0, y: 1, z: 2 } }, emulatedPosition: joint.name === "index" };
  } };
  const samples = read(frame, [input, { gamepad: {} }], space);
  assert.equal(samples.length, 1);
  assert.deepEqual(samples[0].thumb, [0, 1, 2]);
  assert.equal(samples[0].index, null);
  assert.equal(samples[0].middle, null);
  assert.deepEqual(read({}, [input], space), []);
  frame.getJointPose = () => { throw new Error("No permission"); };
  assert.equal(read(frame, [input], space)[0].thumb, null);
  frame.getJointPose = () => ({ transform: { position: { x: NaN, y: 1, z: 2 } } });
  assert.equal(read(frame, [input], space)[0].thumb, null);
});
