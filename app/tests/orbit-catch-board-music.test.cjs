const test = require("node:test");
const assert = require("node:assert/strict");
const { createBoard } = require("../src/assets/orbit-catch/board.js");
const { pattern, BPM } = require("../src/assets/orbit-catch/music.js");

const head = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.6, 0, 1]; // looking along -Z

test("the scoreboard is placed once in front of the player and stays put", () => {
  const board = createBoard();
  board.place(head);
  assert.deepEqual(board.position.map(v => Math.round(v * 100) / 100), [0, 1.45, -1.2]);
  board.face([2, 1.6, 3]); // the player walks away: it turns but does not move
  assert.deepEqual(board.position.map(v => Math.round(v * 100) / 100), [0, 1.45, -1.2]);
  assert.ok(board.yaw > 0);
});

test("a pinch on the board picks it up, moves it with the hand and releases it", () => {
  const board = createBoard();
  board.place(head);
  const hand = {};
  const at = (x, y, z, gap) => board.updatePinch(hand, [x - gap / 2, y, z], [x + gap / 2, y, z]);
  assert.equal(at(0.1, 1.5, -1.2, 0.06), false); // open hand
  assert.equal(at(0.1, 1.5, -1.2, 0.01), true); // pinch on the board
  assert.equal(at(0.6, 1.7, -0.8, 0.03), true); // still within release hysteresis
  assert.deepEqual(board.position.map(v => Math.round(v * 100) / 100), [0.5, 1.65, -0.8]);
  assert.equal(at(0.6, 1.7, -0.8, 0.06), false); // open: released
  assert.equal(board.holder, null);
  at(2, 1.5, -1.2, 0.01); // pinching elsewhere does not grab
  assert.equal(board.holder, null);
});

test("a pinch that starts away from the board never jumps onto it", () => {
  const board = createBoard();
  board.place(head);
  const hand = {};
  board.updatePinch(hand, [0.9, 1.45, -1.2], [0.91, 1.45, -1.2]);
  board.updatePinch(hand, [0, 1.45, -1.2], [0.01, 1.45, -1.2]);
  assert.equal(board.holder, null);
});

test("only one hand or controller holds the board, and lost tracking releases it", () => {
  const board = createBoard();
  board.place(head);
  const controller = {}, other = {};
  assert.ok(board.grab(controller, [0, 1.45, -1.15]));
  assert.equal(board.grab(other, [0, 1.45, -1.15]), false);
  board.release(controller);
  const hand = {};
  board.updatePinch(hand, [0, 1.45, -1.2], [0.01, 1.45, -1.2]);
  assert.equal(board.holder, hand);
  board.updatePinch(hand, null, [0, 0, 0]);
  assert.equal(board.holder, null);
});

test("the grab volume is generous around the board", () => {
  const board = createBoard();
  board.place(head); // centre [0, 1.45, -1.2], facing +Z
  assert.ok(board.contains([0.38, 1.45, -1.2])); // 13 cm past the right edge
  assert.ok(board.contains([0, 1.45 + 0.27, -1.2])); // 14 cm above the top edge
  assert.ok(board.contains([0, 1.45, -1.2 + 0.18])); // 18 cm in front of it
  assert.equal(board.contains([0.5, 1.45, -1.2]), false);
  assert.equal(board.contains([0, 1.45, -1.2 + 0.3]), false);
});

test("a hand within reach highlights the board until it is picked up", () => {
  const board = createBoard();
  board.place(head);
  const hand = {};
  board.updatePinch(hand, [0.1, 1.5, -1.1], [0.15, 1.5, -1.1], 1);
  assert.equal(board.hovering(), true);
  board.updatePinch(hand, [0.1, 1.5, -1.1], [0.11, 1.5, -1.1], 1.01); // pinch
  assert.equal(board.holder, hand);
  assert.equal(board.hovering(), false);
  board.updatePinch(hand, [0.1, 1.5, -1.1], [0.2, 1.5, -1.1], 1.02); // open
  board.updatePinch(hand, [3, 1.5, -1.1], [3.05, 1.5, -1.1], 1.03); // far away
  assert.equal(board.hovering(), false);
});

test("hand jitter is filtered out while the hand is nearly still", () => {
  const board = createBoard();
  board.place(head);
  const hand = {};
  let t = 0;
  const at = (x, y) => board.updatePinch(hand, [x, y, -1.2], [x + 0.01, y, -1.2], t += 1 / 72);
  at(0.1, 1.5);
  const base = board.position.slice();
  for (let i = 0; i < 20; i++) at(0.1 + (i % 2 ? 0.004 : -0.004), 1.5 + (i % 2 ? -0.004 : 0.004));
  assert.ok(Math.hypot(board.position[0] - base[0], board.position[1] - base[1]) < 0.003);
  for (let i = 0; i < 30; i++) at(0.1 + 0.3, 1.5); // a real, fast move is followed
  assert.ok(Math.abs(board.position[0] - (base[0] + 0.3)) < 0.02);
});

test("a short tracking dropout keeps the board, a long one releases it", () => {
  const board = createBoard();
  board.place(head);
  const hand = {};
  board.updatePinch(hand, [0, 1.45, -1.2], [0.01, 1.45, -1.2], 1);
  assert.equal(board.holder, hand);
  assert.equal(board.updatePinch(hand, null, null, 1.1), true);
  assert.equal(board.holder, hand);
  board.updatePinch(hand, [0.2, 1.45, -1.2], [0.21, 1.45, -1.2], 1.2); // back, still pinching
  assert.equal(board.holder, hand);
  assert.equal(board.updatePinch(hand, null, null, 2), true); // lost again
  assert.equal(board.updatePinch(hand, null, null, 2.5), false);
  assert.equal(board.holder, null);
});

test("a hand or controller that disappears cannot keep the board held", () => {
  const board = createBoard();
  board.place(head);
  const controller = {}, other = {};
  assert.ok(board.grab(controller, [0, 1.45, -1.15]));
  board.retain(new Set([other]));
  assert.equal(board.holder, null);
  assert.ok(board.grab(other, [0, 1.45, -1.15]));
});

test("a controller track moves the board only while it holds it", () => {
  const board = createBoard();
  board.place(head);
  const controller = {};
  board.track(controller, [0, 1.45, -1.15]);
  assert.equal(board.hovering(), true);
  assert.ok(board.grab(controller, [0, 1.45, -1.15]));
  board.track(controller, [0.3, 1.45, -1.15]);
  assert.deepEqual(board.position.map(v => Math.round(v * 100) / 100), [0.3, 1.45, -1.2]);
});

test("techno pattern: four-on-the-floor kick, offbeat open hats, intro and breakdown", () => {
  assert.equal(BPM, 128);
  const kicks = bar => [...Array(16).keys()].filter(step => pattern(step, bar).kick);
  assert.deepEqual(kicks(0), []); // intro
  assert.deepEqual(kicks(1), [0, 4, 8, 12]);
  assert.deepEqual(kicks(14), []); // breakdown
  assert.deepEqual(kicks(16), [0, 4, 8, 12]);
  assert.deepEqual([...Array(16).keys()].filter(step => pattern(step, 3).openHat), [2, 6, 10, 14]);
  assert.equal(pattern(0, 3).bass, false);
  assert.equal(pattern(1, 3).bass, true);
  for (let bar = 0; bar < 32; bar++) {
    for (let step = 0; step < 16; step++) {
      const p = pattern(step, bar);
      assert.ok(p.cutoff >= 300 && p.cutoff <= 2000 && p.bassFreq > 40);
    }
  }
});
