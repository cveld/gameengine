// Column-major WebXR math, kept independent of the browser for deterministic tests.
(function (root) {
  "use strict";
  function multiply(a, b, out = new Float32Array(16)) {
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  }
  function anchorFromPose(matrix) {
    // Keep the sculpture upright and world-locked, even when entering VR while
    // looking down. Use the headset's initial horizontal forward direction.
    const length = Math.hypot(matrix[8], matrix[10]);
    return {
      origin: [matrix[12], matrix[13], matrix[14]],
      forward: length > 0.001 ? [-matrix[8] / length, 0, -matrix[10] / length] : [0, 0, -1]
    };
  }
  function position(anchor, distance, out = new Float32Array(3)) {
    for (let i = 0; i < 3; i++) out[i] = anchor.origin[i] + anchor.forward[i] * distance;
    return out;
  }
  function moveOffset(offset, heading, sideways, forward, up, dt) {
    // Move the object, never the viewer. Normalize diagonal input and cap travel
    // relative to initial placement: +/-3 m horizontally and +/-2 m vertically.
    const length = Math.max(1, Math.hypot(sideways, forward, up));
    const step = 0.6 * Math.min(0.1, Math.max(0, dt)) / length;
    const f = heading.forward;
    const delta = [-f[2] * sideways + f[0] * forward, up, f[0] * sideways + f[2] * forward];
    for (let i = 0; i < 3; i++) {
      const limit = i === 1 ? 2 : 3;
      offset[i] = Math.max(-limit, Math.min(limit, offset[i] + delta[i] * step));
    }
    return offset;
  }
  const api = { multiply, anchorFromPose, position, moveOffset };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitXRMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
