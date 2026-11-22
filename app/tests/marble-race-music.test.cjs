"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Music = require(path.join(__dirname, "..", "public", "assets", "marble-race", "music.js"));

const bar = (b, section) => Array.from({ length: 16 }, (_, step) => Music.pattern(step, b, section));
const steps = (b, section, voice) => bar(b, section).flatMap((p, i) => (p[voice] ? [i] : []));

test("the race groove: four-on-the-floor kick, claps on 2 and 4, rolling bass between kicks", () => {
  assert.equal(Music.BPM, 132);
  assert.deepEqual(steps(0, "race", "kick"), [0, 4, 8, 12]);
  assert.deepEqual(steps(0, "race", "clap"), [4, 12]);
  assert.deepEqual(steps(0, "race", "bass"), [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]);
  assert.equal(steps(0, "race", "closedHat").length, 16);
});

test("every 16 race bars end with a two-bar breakdown and a snare fill before it", () => {
  for (const b of [14, 15, 30, 31]) {
    assert.deepEqual(steps(b, "race", "kick"), [], `bar ${b} should have no kick`);
    assert.deepEqual(steps(b, "race", "bass"), []);
  }
  assert.deepEqual(steps(13, "race", "snareFill"), [12, 13, 14, 15]);
  assert.deepEqual(steps(16, "race", "kick"), [0, 4, 8, 12]);
  assert.ok(steps(15, "race", "stab").length > 0);
});

test("the acid line comes in on the second half of each 8-bar phrase", () => {
  assert.deepEqual(steps(0, "race", "acid"), []);
  assert.ok(steps(4, "race", "acid").length >= 10);
  for (const p of bar(4, "race")) if (p.acid) assert.equal(typeof p.acidNote, "number");
});

test("the countdown builds up: kicks double each bar under a noise riser", () => {
  assert.deepEqual(steps(0, "build", "buildKick"), [0, 4, 8, 12]);
  assert.equal(steps(1, "build", "buildKick").length, 8);
  assert.equal(steps(2, "build", "buildKick").length, 16);
  assert.ok(bar(0, "build").every(p => p.riser));
  assert.deepEqual(steps(0, "build", "kick"), []);
});

test("lobby and outro are calmer: no claps, acid or rides in the lobby", () => {
  assert.deepEqual(steps(0, "lobby", "kick"), [0, 4, 8, 12]);
  for (const voice of ["clap", "acid", "ride", "stab"]) assert.deepEqual(steps(4, "lobby", voice), []);
  assert.deepEqual(steps(0, "outro", "bass"), []);
});
