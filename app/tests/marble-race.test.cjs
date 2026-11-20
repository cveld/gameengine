"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Race = require(path.join(__dirname, "..", "src", "assets", "marble-race", "race.js"));

function settleAndStart(race) {
  for (let i = 0; i < 60; i++) Race.update(race, 1 / 60);
  Race.startCountdown(race);
}

function runToEnd(race, maxSeconds = 300) {
  const events = [];
  for (let frame = 0; frame < maxSeconds * 60 && race.state !== "finished"; frame++) {
    for (const event of Race.update(race, 1 / 60)) events.push(event);
  }
  return events;
}

test("course generation is deterministic per seed and varies between seeds", () => {
  const a = Race.buildCourse(42);
  const b = Race.buildCourse(42);
  const c = Race.buildCourse(43);
  assert.deepEqual(a.sections.map(s => s.type), b.sections.map(s => s.type));
  assert.equal(a.solids.length, b.solids.length);
  assert.equal(a.length, b.length);
  assert.notDeepEqual(a.sections.map(s => s.type).concat(a.length), c.sections.map(s => s.type).concat(c.length));
});

test("course starts with the gate, ends with the finish and uses unique obstacles", () => {
  const course = Race.buildCourse(7);
  const types = course.sections.map(s => s.type);
  assert.equal(types[0], "start");
  assert.equal(types[types.length - 1], "finish");
  const middle = types.slice(1, -1);
  assert.equal(middle.length, 6);
  assert.equal(new Set(middle).size, middle.length);
  for (const type of middle) assert.ok(Race.MODULE_TYPES.includes(type));
  assert.ok(course.finishProgress > 0 && course.finishProgress < course.length);
  assert.equal(course.slots.length, 12);
  for (const solid of course.solids) {
    for (const value of solid.c) assert.ok(Number.isFinite(value));
    assert.ok(solid.bound > 0);
  }
});

test("the course descends from start to finish", () => {
  const course = Race.buildCourse(11);
  assert.ok(course.path[course.path.length - 1][1] < course.path[0][1] - 10);
});

test("sphere-box collision pushes out along the face normal", () => {
  const course = Race.buildCourse(1);
  const floor = course.solids.find(s => s.floor);
  const top = [
    floor.c[0] + floor.m[3] * (floor.h[1] + Race.R * 0.5),
    floor.c[1] + floor.m[4] * (floor.h[1] + Race.R * 0.5),
    floor.c[2] + floor.m[5] * (floor.h[1] + Race.R * 0.5)
  ];
  const hit = Race.collide(floor, top, Race.R);
  assert.ok(hit);
  assert.ok(hit.n[1] > 0.9);
  assert.ok(Math.abs(hit.depth - Race.R * 0.5) < 1e-6);
  const above = [top[0], top[1] + 1, top[2]];
  assert.equal(Race.collide(floor, above, Race.R), null);
});

test("marbles wait behind the gate until the countdown ends", () => {
  const race = Race.createRace(Race.buildCourse(3), { seed: 5 });
  for (let i = 0; i < 120; i++) Race.update(race, 1 / 60);
  assert.equal(race.state, "ready");
  const start = race.course.sections[0];
  const behindGate = m => {
    const d = [0, 1, 2].map(k => m.p[k] - start.frame.S[k]);
    return d[0] * start.frame.t[0] + d[1] * start.frame.t[1] + d[2] * start.frame.t[2] < start.gateW - Race.R + 0.01;
  };
  Race.startCountdown(race);
  const counts = [];
  for (let i = 0; i < 170; i++) {
    for (const event of Race.update(race, 1 / 60)) if (event.type === "count") counts.push(event.value);
  }
  assert.equal(race.state, "countdown");
  assert.deepEqual(counts, [2, 1]);
  for (const m of race.marbles) assert.ok(behindGate(m), `${m.name} passed the closed gate`);
  for (let i = 0; i < 120; i++) Race.update(race, 1 / 60);
  assert.equal(race.state, "running");
  assert.ok(race.marbles.some(m => !behindGate(m)));
});

for (const seed of [1, 3, 6]) {
  test(`a full race on track ${seed} produces a winner and a complete ranking`, () => {
    const race = Race.createRace(Race.buildCourse(seed), { seed: seed * 13 });
    settleAndStart(race);
    const events = runToEnd(race);
    assert.equal(race.state, "finished");
    const finishes = events.filter(e => e.type === "finish");
    assert.ok(finishes.length >= 9, `only ${finishes.length} marbles finished`);
    assert.equal(finishes[0].place, 1);
    assert.ok(race.winnerTime > 15 && race.winnerTime < 120, `winner time ${race.winnerTime}`);
    const order = Race.standings(race);
    assert.equal(order[0].place, 1);
    assert.equal(new Set(order.map(m => m.id)).size, race.marbles.length);
    for (let i = 1; i < order.length; i++) {
      if (order[i].finished) assert.ok(order[i - 1].finished && order[i - 1].finishTime <= order[i].finishTime);
    }
    for (const m of race.marbles) for (const value of m.p) assert.ok(Number.isFinite(value));
  });
}

test("a marble that falls off the course is returned to its checkpoint", () => {
  const race = Race.createRace(Race.buildCourse(2), { seed: 9 });
  settleAndStart(race);
  for (let i = 0; i < 60 * 6; i++) Race.update(race, 1 / 60);
  const marble = race.marbles[0];
  marble.p = [marble.p[0] + 40, marble.p[1] - 30, marble.p[2]];
  const events = Race.update(race, 1 / 60);
  assert.ok(events.some(e => e.type === "respawn" && e.marble === marble.id));
  assert.equal(marble.respawns, 1);
  assert.ok(Race.projectProgress(race.course, marble.p, marble.pathIndex).distance < 2);
});
