// World-locked scoreboard that the player can pick up and move. Pure logic for
// Node tests; catch.js supplies head and hand/controller positions.
//
// Optional `now` arguments are seconds on any monotonic clock (the XR frame
// time). Without them the board follows the hand 1:1 and drops it at once, which
// keeps the logic easy to test.
(function (root) {
  "use strict";
  const WIDTH = 0.5;
  const HEIGHT = 0.25;
  // A flat quad is hard to judge in depth, so the grab volume is generous.
  const MARGIN = 0.15;
  const DEPTH = 0.2;
  const PINCH_START = 0.03;
  const PINCH_END = 0.055;
  // Hand tracking drops out for a few frames now and then; keep holding.
  const LOST_GRACE = 0.3;
  // Adaptive smoothing: heavy while the hand is nearly still (kills jitter),
  // light while it moves (no lag).
  const SLOW_TAU = 0.15;
  const FAST_TAU = 0.02;
  const finite = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const timed = now => typeof now === "number" && Number.isFinite(now);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function createBoard() {
    const board = {
      position: null, yaw: 0, holder: null, offset: [0, 0, 0],
      pinching: new Map(), lost: new Map(), near: new Set(),
      anchor: null, raw: null, time: null,
    };

    // Place once, 1.2 m ahead of the horizontal gaze, slightly below eye level.
    function place(headMatrix) {
      const m = headMatrix;
      const l = Math.hypot(m[8], m[10]) || 1;
      board.position = [m[12] - (m[8] / l) * 1.2, m[13] - 0.15, m[14] - (m[10] / l) * 1.2];
      board.holder = null;
      face([m[12], m[13], m[14]]);
    }

    // Turn (yaw only) towards the player; the position stays where it was put.
    function face(head) {
      if (!board.position || !finite(head)) return;
      board.yaw = Math.atan2(head[0] - board.position[0], head[2] - board.position[2]);
    }

    function contains(point) {
      if (!board.position || !finite(point)) return false;
      const d = [point[0] - board.position[0], point[1] - board.position[1], point[2] - board.position[2]];
      const right = [Math.cos(board.yaw), 0, -Math.sin(board.yaw)];
      const normal = [Math.sin(board.yaw), 0, Math.cos(board.yaw)];
      const x = d[0] * right[0] + d[2] * right[2];
      const z = d[0] * normal[0] + d[2] * normal[2];
      return Math.abs(x) <= WIDTH / 2 + MARGIN && Math.abs(d[1]) <= HEIGHT / 2 + MARGIN && Math.abs(z) <= DEPTH;
    }

    // True while a free hand or controller is inside the grab volume.
    function hovering() {
      return board.holder === null && board.near.size > 0;
    }

    function note(id, point) {
      if (board.holder === null && contains(point)) board.near.add(id);
      else board.near.delete(id);
    }

    function follow(point, now) {
      if (!timed(now) || !board.anchor || board.time === null) {
        board.anchor = point.slice();
      } else {
        const dt = Math.min(Math.max(now - board.time, 0.001), 0.1);
        const speed = distance(point, board.raw) / dt;
        const tau = Math.min(SLOW_TAU, Math.max(FAST_TAU, SLOW_TAU - speed * 0.3));
        const alpha = 1 - Math.exp(-dt / tau);
        board.anchor = board.anchor.map((v, i) => v + (point[i] - v) * alpha);
      }
      board.raw = point.slice();
      board.time = timed(now) ? now : null;
    }

    function grab(id, point, now) {
      if (board.holder !== null || !contains(point)) return false;
      board.holder = id;
      board.near.clear();
      board.lost.delete(id);
      board.offset = [board.position[0] - point[0], board.position[1] - point[1], board.position[2] - point[2]];
      board.anchor = point.slice();
      board.raw = point.slice();
      board.time = timed(now) ? now : null;
      return true;
    }

    function move(id, point, now) {
      if (board.holder !== id || !finite(point)) return;
      follow(point, now);
      board.position = [board.anchor[0] + board.offset[0], board.anchor[1] + board.offset[1], board.anchor[2] + board.offset[2]];
    }

    function release(id) {
      if (board.holder === id) board.holder = null;
      board.lost.delete(id);
    }

    // Controller (or any single point): moves the board while it holds it,
    // otherwise only reports whether the point is within reach.
    function track(id, point, now) {
      if (board.holder === id) move(id, point, now);
      else note(id, point);
    }

    // Hand pinch with hysteresis. Returns true while this hand holds the board.
    function updatePinch(id, thumb, index, now) {
      if (!finite(thumb) || !finite(index)) {
        board.near.delete(id);
        if (board.holder !== id) {
          board.pinching.delete(id);
          return false;
        }
        if (timed(now)) {
          if (!board.lost.has(id)) board.lost.set(id, now);
          if (now - board.lost.get(id) < LOST_GRACE) return true;
        }
        board.pinching.delete(id);
        release(id);
        return false;
      }
      board.lost.delete(id);
      const gap = distance(thumb, index);
      const point = [(thumb[0] + index[0]) / 2, (thumb[1] + index[1]) / 2, (thumb[2] + index[2]) / 2];
      const was = board.pinching.get(id) || false;
      const pinching = was ? gap < PINCH_END : gap < PINCH_START;
      board.pinching.set(id, pinching);
      if (pinching && !was) grab(id, point, now);
      else if (pinching) move(id, point, now);
      else release(id);
      if (board.holder !== id) note(id, point);
      return board.holder === id;
    }

    // Forget hands and controllers that are no longer connected; a vanished
    // holder would otherwise keep the board "held" forever.
    function retain(active) {
      for (const map of [board.pinching, board.lost]) {
        for (const id of [...map.keys()]) if (!active.has(id)) map.delete(id);
      }
      for (const id of [...board.near]) if (!active.has(id)) board.near.delete(id);
      if (board.holder !== null && !active.has(board.holder)) release(board.holder);
    }

    function reset() {
      board.position = null;
      board.holder = null;
      board.anchor = null;
      board.raw = null;
      board.time = null;
      board.pinching.clear();
      board.lost.clear();
      board.near.clear();
    }

    return Object.assign(board, { place, face, contains, hovering, grab, move, release, track, updatePinch, retain, reset });
  }

  const api = { createBoard, WIDTH, HEIGHT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitCatchBoard = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
