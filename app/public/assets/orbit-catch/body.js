// Virtual arm and hand skeleton for Orbit Catch. WebXR only tracks the head and
// the hands/controllers, so shoulders and elbows are estimated here.
(function (root) {
  "use strict";
  const FINGERS = ["index-finger", "middle-finger", "ring-finger", "pinky-finger"];
  // Bones as [from, to] joint-name pairs, following the WebXR Hand Input joint list.
  const HAND_BONES = Object.freeze([
    ["wrist", "thumb-metacarpal"], ["thumb-metacarpal", "thumb-phalanx-proximal"],
    ["thumb-phalanx-proximal", "thumb-phalanx-distal"], ["thumb-phalanx-distal", "thumb-tip"],
    ...FINGERS.flatMap(f => [
      ["wrist", `${f}-metacarpal`], [`${f}-metacarpal`, `${f}-phalanx-proximal`],
      [`${f}-phalanx-proximal`, `${f}-phalanx-intermediate`],
      [`${f}-phalanx-intermediate`, `${f}-phalanx-distal`], [`${f}-phalanx-distal`, `${f}-tip`]
    ]),
    // Knuckle line, so the hand reads as one shape.
    ["index-finger-phalanx-proximal", "middle-finger-phalanx-proximal"],
    ["middle-finger-phalanx-proximal", "ring-finger-phalanx-proximal"],
    ["ring-finger-phalanx-proximal", "pinky-finger-phalanx-proximal"]
  ].map(Object.freeze));
  // Closed outline of the palm, drawn as a triangle fan around its centroid.
  const PALM_OUTLINE = Object.freeze(["wrist", "thumb-metacarpal", "thumb-phalanx-proximal",
    "index-finger-phalanx-proximal", "middle-finger-phalanx-proximal", "ring-finger-phalanx-proximal",
    "pinky-finger-phalanx-proximal", "pinky-finger-metacarpal"]);

  const UPPER_ARM = 0.30;
  const FOREARM = 0.27;

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length = a => Math.hypot(a[0], a[1], a[2]);
  const finite = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  function normalize(a, fallback = [0, -1, 0]) {
    const l = length(a);
    return l > 1e-6 ? [a[0] / l, a[1] / l, a[2] / l] : fallback.slice();
  }

  // Shoulder estimate from the column-major head matrix, using only the head's
  // yaw so looking up/down does not swing the shoulders. side: -1 left, 1 right.
  function shoulder(headMatrix, side) {
    const m = headMatrix;
    const forward = normalize([-m[8], 0, -m[10]], [0, 0, -1]);
    const right = [-forward[2], 0, forward[0]];
    return [m[12] + right[0] * 0.18 * side - forward[0] * 0.06, m[13] - 0.24, m[14] + right[2] * 0.18 * side - forward[2] * 0.06];
  }

  // Two-bone IK: elbow such that |shoulder-elbow| = upper and |elbow-wrist| = fore
  // whenever the wrist is reachable, bent towards `pole`.
  function elbow(shoulderPos, wrist, pole, upper = UPPER_ARM, fore = FOREARM) {
    const toWrist = sub(wrist, shoulderPos);
    const dir = normalize(toWrist, [0, -1, 0]);
    const d = Math.max(Math.abs(upper - fore) + 1e-4, Math.min(upper + fore - 1e-4, length(toWrist)));
    const along = (upper * upper - fore * fore + d * d) / (2 * d);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    let bend = sub(pole, dir.map(v => v * dot(pole, dir)));
    if (length(bend) < 1e-4) bend = sub([0, -1, 0], dir.map(v => v * -dir[1]));
    bend = normalize(bend, [1, 0, 0]);
    return add(add(shoulderPos, dir, along), bend, height);
  }

  // Estimate one arm. `back` is a unit direction from the wrist towards the
  // elbow (palm-to-wrist for hands, grip +Z for controllers).
  function arm(headMatrix, wrist, back, side) {
    if (!finite(wrist)) return null;
    const s = shoulder(headMatrix, side);
    const hint = add(wrist, normalize(finite(back) ? back : [0, -1, 0]), FOREARM);
    // Prefer the forearm direction, but keep elbows hanging down and slightly outwards.
    const pole = add(sub(hint, s), [0, -0.35, 0]);
    const e = elbow(s, wrist, pole);
    return { shoulder: s, elbow: e, wrist: wrist.slice() };
  }

  // -1 for left, 1 for right; untracked handedness picks the side the hand is on.
  function sideOf(handedness, headMatrix, wrist) {
    if (handedness === "left") return -1;
    if (handedness === "right") return 1;
    const forward = normalize([-headMatrix[8], 0, -headMatrix[10]], [0, 0, -1]);
    const offset = sub(wrist, [headMatrix[12], headMatrix[13], headMatrix[14]]);
    return offset[0] * -forward[2] + offset[2] * forward[0] >= 0 ? 1 : -1;
  }

  const api = { HAND_BONES, PALM_OUTLINE, UPPER_ARM, FOREARM, shoulder, elbow, arm, sideOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitCatchBody = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
