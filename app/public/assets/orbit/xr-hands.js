// Direct hand manipulation without renderer dependencies or inferred tracking.
(function (root) {
  "use strict";
  const close = 0.022, open = 0.035;
  const finite = point => point && point.length === 3 && point.every(Number.isFinite);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function read(frame, inputs, space) {
    if (typeof frame.getJointPose !== "function") return [];
    const samples = [];
    for (const input of inputs) {
      if (!input.hand?.get) continue;
      const rejected = { missing: 0, emulated: 0, invalid: 0, error: 0 };
      const joint = name => {
        try {
          const source = input.hand.get(name);
          if (!source) { rejected.missing++; return null; }
          const pose = frame.getJointPose(source, space);
          if (!pose) { rejected.missing++; return null; }
          if (pose.emulatedPosition) { rejected.emulated++; return null; }
          const p = pose.transform.position, point = [p.x, p.y, p.z];
          if (!finite(point)) { rejected.invalid++; return null; }
          return point;
        } catch (_) { rejected.error++; return null; }
      };
      samples.push({ input, handedness: input.handedness, thumb: joint("thumb-tip"),
        index: joint("index-finger-tip"), middle: joint("middle-finger-tip"), rejected });
    }
    return samples;
  }
  function create() {
    const states = new Map();
    let grab = null;
    function reset() { states.clear(); grab = null; }
    function update(samples, objectPosition, elapsed) {
      const result = { position: null, changeShape: false };
      if (!finite(objectPosition) || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 0.25) {
        reset(); return result;
      }
      const valid = samples.filter(sample => finite(sample.thumb) && finite(sample.index));
      const active = new Set(valid.map(sample => sample.input));
      for (const input of states.keys()) if (!active.has(input)) states.delete(input);
      if (grab && !active.has(grab.input)) grab = null;
      for (const sample of valid) {
        let state = states.get(sample.input);
        if (!state) {
          state = { armed: false, pinched: false, shapeArmed: false, shapeAge: 0 };
          states.set(sample.input, state);
        }
        const gap = distance(sample.thumb, sample.index);
        const midpoint = sample.thumb.map((value, i) => (value + sample.index[i]) / 2);
        if (gap >= open) { state.armed = true; state.pinched = false; }
        if (gap <= close && !state.pinched) {
          state.pinched = true;
          if (!grab && state.armed && distance(midpoint, objectPosition) <= 0.95) {
            grab = { input: sample.input, offset: Array.from(objectPosition, (value, i) => value - midpoint[i]),
              previous: midpoint };
          }
          state.armed = false;
        }
        if (grab?.input === sample.input) {
          if (!state.pinched) grab = null;
          else if (distance(midpoint, grab.previous) > 0.5) {
            // A tracking correction must not teleport the sculpture.
            grab = null; state.armed = false;
          } else {
            result.position = midpoint.map((value, i) => value + grab.offset[i]);
            grab.previous = midpoint;
          }
        }
      }
      for (const sample of valid) {
        const state = states.get(sample.input);
        if (sample.handedness !== "left" || !finite(sample.middle)) {
          state.shapeAge = 0; state.shapeArmed = false; continue;
        }
        const middleGap = distance(sample.thumb, sample.middle);
        if (middleGap >= open) { state.shapeArmed = true; state.shapeAge = 0; }
        if (grab || distance(sample.thumb, sample.index) < 0.045) {
          state.shapeAge = 0;
          if (middleGap <= close) state.shapeArmed = false;
        } else if (middleGap <= close && state.shapeArmed) {
          state.shapeAge += Math.min(elapsed, 0.1);
          if (state.shapeAge >= 0.3) {
            result.changeShape = true; state.shapeArmed = false; state.shapeAge = 0;
          }
        } else if (middleGap > close) state.shapeAge = 0;
      }
      return result;
    }
    return { update, reset, get grabbing() { return Boolean(grab); },
      summary(samples, objectPosition) {
        const valid = samples.filter(sample => finite(sample.thumb) && finite(sample.index));
        return {
          sources: samples.length, validHands: valid.length,
          validShapeHands: valid.filter(sample => sample.handedness === "left" && finite(sample.middle)).length,
          nearbyHands: valid.filter(sample => finite(objectPosition) &&
            distance(sample.thumb.map((value, i) => (value + sample.index[i]) / 2), objectPosition) <= 0.95).length,
          pinchedHands: valid.filter(sample => distance(sample.thumb, sample.index) <= close).length,
          armedHands: Array.from(states.values()).filter(state => state.armed).length,
          missingJoints: samples.reduce((total, sample) => total + (sample.rejected?.missing || 0), 0),
          emulatedJoints: samples.reduce((total, sample) => total + (sample.rejected?.emulated || 0), 0),
          invalidJoints: samples.reduce((total, sample) => total + (sample.rejected?.invalid || 0), 0),
          failedJoints: samples.reduce((total, sample) => total + (sample.rejected?.error || 0), 0),
          grabbing: Boolean(grab)
        };
      }
    };
  }
  const api = { create, read };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitXRHands = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
