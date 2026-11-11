// World-locked scoreboard that the player can pick up and move. Pure logic for
// Node tests; catch.js supplies head and hand/controller positions.
(function (root) {
  "use strict";
  const WIDTH = 0.5;
  const HEIGHT = 0.25;
  const MARGIN = 0.07;
  const DEPTH = 0.09;
  const PINCH_START = 0.025;
  const PINCH_END = 0.045;
  const finite = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

  function createBoard() {
    const board = { position: null, yaw: 0, holder: null, offset: [0, 0, 0], pinching: new Map() };

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

    function grab(id, point) {
      if (board.holder !== null || !contains(point)) return false;
      board.holder = id;
      board.offset = [board.position[0] - point[0], board.position[1] - point[1], board.position[2] - point[2]];
      return true;
    }

    function move(id, point) {
      if (board.holder !== id || !finite(point)) return;
      board.position = [point[0] + board.offset[0], point[1] + board.offset[1], point[2] + board.offset[2]];
    }

    function release(id) {
      if (board.holder === id) board.holder = null;
    }

    // Hand pinch with hysteresis. Returns true while this hand holds the board.
    function updatePinch(id, thumb, index) {
      if (!finite(thumb) || !finite(index)) {
        board.pinching.delete(id);
        release(id);
        return false;
      }
      const gap = Math.hypot(thumb[0] - index[0], thumb[1] - index[1], thumb[2] - index[2]);
      const point = [(thumb[0] + index[0]) / 2, (thumb[1] + index[1]) / 2, (thumb[2] + index[2]) / 2];
      const was = board.pinching.get(id) || false;
      const now = was ? gap < PINCH_END : gap < PINCH_START;
      board.pinching.set(id, now);
      if (now && !was) grab(id, point);
      else if (now) move(id, point);
      else release(id);
      return board.holder === id;
    }

    function reset() {
      board.position = null;
      board.holder = null;
      board.pinching.clear();
    }

    return Object.assign(board, { place, face, contains, grab, move, release, updatePinch, reset });
  }

  const api = { createBoard, WIDTH, HEIGHT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitCatchBoard = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
