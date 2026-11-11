const test = require("node:test");
const assert = require("node:assert/strict");
const { createGame, KINDS, ROUND_SECONDS } = require("../src/assets/orbit-catch/game.js");

function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}
function play(game, seconds, center = { x: 0, z: 0 }, catchers = []) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) events.push(...game.update(0.05, center, catchers));
  return events;
}

test("counts down before play and does not spawn during the countdown", () => {
  const game = createGame({ random: () => 0.5 });
  assert.equal(game.state, "countdown");
  play(game, 2.9);
  assert.equal(game.state, "countdown");
  assert.equal(game.objects.length, 0);
  const events = play(game, 0.2);
  assert.equal(game.state, "playing");
  assert.ok(events.some(e => e.type === "start"));
  assert.ok(game.timeLeft > ROUND_SECONDS - 0.2 && game.timeLeft <= ROUND_SECONDS);
});

test("spawns in a ring around the player's current position, above the floor", () => {
  const game = createGame({ random: () => 0.25, floorY: -1.5, spawnHeight: 2.2 });
  play(game, 3.1);
  play(game, 1.2, { x: 4, z: -2 });
  assert.equal(game.objects.length, 1);
  const o = game.objects[0];
  const distance = Math.hypot(o.x - 4, o.z + 2);
  assert.ok(distance >= 0.35 && distance <= 1.6, `distance ${distance}`);
  assert.ok(o.y > -1.5 + 2.2 - 1.2 && o.y <= -1.5 + 2.6);
});

test("a catcher touching an object scores its points and combos raise the multiplier", () => {
  const game = createGame({ random: () => 0 });
  play(game, 3.1);
  let total = 0;
  for (let i = 0; i < 4; i++) {
    game.objects.length = 0;
    game.objects.push({ id: 100 + i, kind: KINDS[2], x: 0, y: 1, z: -1, spin: 0, age: 0 });
    const events = game.update(0.01, { x: 0, z: 0 }, [{ x: 0, y: 1, z: -1.1, radius: 0.05 }]);
    const caught = events.find(e => e.type === "catch");
    assert.ok(caught, "object should be caught");
    total += caught.points;
  }
  // Star = 5 points: three catches at x1, the fourth at x2.
  assert.equal(total, 5 + 5 + 5 + 10);
  assert.equal(game.score, total);
  assert.equal(game.combo, 4);
  assert.equal(game.multiplier(), 2);
  assert.ok(game.effects.some(e => e.type === "catch"));
});

test("objects reaching the floor are misses and reset the combo", () => {
  const game = createGame({ random: () => 0 });
  play(game, 3.1);
  game.combo = 5;
  game.objects.length = 0;
  game.objects.push({ id: 1, kind: KINDS[0], x: 0, y: 0.1, z: -1, spin: 0, age: 0 });
  const events = game.update(0.05, { x: 0, z: 0 }, []);
  assert.ok(events.some(e => e.type === "miss"));
  assert.equal(game.missed, 1);
  assert.equal(game.combo, 0);
});

test("ignores catchers with invalid coordinates", () => {
  const game = createGame({ random: () => 0 });
  play(game, 3.1);
  game.objects.length = 0;
  game.objects.push({ id: 1, kind: KINDS[0], x: 0, y: 1, z: 0, spin: 0, age: 0 });
  game.update(0.01, { x: 0, z: 0 }, [{ x: NaN, y: 1, z: 0, radius: 1 }, null]);
  assert.equal(game.score, 0);
  assert.equal(game.objects.length, 1);
});

test("the round ends after the timer, clears objects and restart returns to the countdown", () => {
  const game = createGame({ random: sequence([0.1, 0.6, 0.3, 0.9]), roundSeconds: 5 });
  play(game, 3.1);
  const events = play(game, 5.2);
  assert.equal(game.state, "over");
  assert.equal(game.objects.length, 0);
  assert.ok(events.some(e => e.type === "over"));
  assert.ok(game.objects.length <= 12);
  game.restart();
  assert.equal(game.state, "countdown");
  assert.equal(game.score, 0);
  assert.equal(game.timeLeft, 5);
});

test("flat mode spawns in a single lane in front of the player", () => {
  const game = createGame({ random: () => 0.75, flat: true });
  play(game, 3.1);
  play(game, 1.2, { x: 0, z: 0 });
  assert.equal(game.objects.length, 1);
  assert.equal(game.objects[0].z, 0);
  assert.ok(Math.abs(game.objects[0].x) <= 0.9);
});

test("never keeps more than twelve objects in the air", () => {
  const game = createGame({ random: () => 0.5, spawnHeight: 1000 });
  play(game, 3.1);
  play(game, 30);
  assert.ok(game.objects.length <= 12);
});
