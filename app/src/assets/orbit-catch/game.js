// Orbit Catch game rules, kept free of DOM/WebGL for deterministic Node tests.
(function (root) {
  "use strict";

  const KINDS = Object.freeze([
    Object.freeze({ id: "orb", points: 1, radius: 0.09, speed: 0.9, weight: 6 }),
    Object.freeze({ id: "cube", points: 2, radius: 0.08, speed: 1.15, weight: 3 }),
    Object.freeze({ id: "star", points: 5, radius: 0.07, speed: 1.5, weight: 1 })
  ]);

  const ROUND_SECONDS = 90;
  const COUNTDOWN = 3;
  const EFFECT_SECONDS = 0.6;
  const MAX_OBJECTS = 12;
  const TOTAL_WEIGHT = KINDS.reduce((sum, kind) => sum + kind.weight, 0);

  function createGame(options = {}) {
    const {
      random = Math.random,
      floorY: initialFloorY = 0,
      spawnHeight = 2.4,
      minDistance = 0.35,
      maxDistance = 1.6,
      roundSeconds = ROUND_SECONDS,
      flat = false
    } = options;

    let floorY = initialFloorY;
    let spawnAccumulator = 0;
    let nextId = 1;

    const game = {
      state: "countdown",
      score: 0,
      combo: 0,
      bestCombo: 0,
      caught: 0,
      missed: 0,
      timeLeft: roundSeconds,
      countdown: COUNTDOWN,
      objects: [],
      effects: [],
      setFloor,
      update,
      multiplier,
      restart
    };

    function setFloor(y) {
      floorY = y;
    }

    // Combo 1-3 => x1, 4-6 => x2, 7-9 => x3, 10+ => x4.
    function multiplier() {
      return Math.min(4, 1 + Math.floor(Math.max(0, game.combo - 1) / 3));
    }

    function restart() {
      game.state = "countdown";
      game.score = 0;
      game.combo = 0;
      game.bestCombo = 0;
      game.caught = 0;
      game.missed = 0;
      game.timeLeft = roundSeconds;
      game.countdown = COUNTDOWN;
      game.objects.length = 0;
      game.effects.length = 0;
      spawnAccumulator = 0;
      nextId = 1;
    }

    function pickKind() {
      let value = random() * TOTAL_WEIGHT;
      for (const kind of KINDS) {
        if (value < kind.weight) return kind;
        value -= kind.weight;
      }
      return KINDS[KINDS.length - 1];
    }

    function spawn(center) {
      const kind = pickKind();
      let x;
      let z;
      if (flat) {
        x = center.x + random() * 1.8 - 0.9;
        z = center.z;
      } else {
        // A ring around the player's current position: turn and walk to catch.
        const angle = random() * Math.PI * 2;
        const distance = minDistance + random() * (maxDistance - minDistance);
        x = center.x + Math.cos(angle) * distance;
        z = center.z + Math.sin(angle) * distance;
      }
      game.objects.push({ id: nextId++, kind, x, y: floorY + spawnHeight + random() * 0.4, z, spin: 0, age: 0 });
    }

    function addEffect(object, type, points) {
      game.effects.push({ x: object.x, y: object.y, z: object.z, kind: object.kind, type, age: 0, points });
    }

    function ageEffects(dt) {
      let write = 0;
      for (const effect of game.effects) {
        effect.age += dt;
        if (effect.age < EFFECT_SECONDS) game.effects[write++] = effect;
      }
      game.effects.length = write;
    }

    function isCaught(object, catchers) {
      for (const catcher of catchers) {
        if (!catcher || !Number.isFinite(catcher.x) || !Number.isFinite(catcher.y) ||
            !Number.isFinite(catcher.z) || !Number.isFinite(catcher.radius) || catcher.radius < 0) {
          continue;
        }
        const dx = object.x - catcher.x;
        const dy = object.y - catcher.y;
        const dz = object.z - catcher.z;
        const radius = object.kind.radius + catcher.radius;
        if (dx * dx + dy * dy + dz * dz <= radius * radius) return true;
      }
      return false;
    }

    function update(dt, center = { x: 0, z: 0 }, catchers = []) {
      dt = typeof dt === "number" && !Number.isNaN(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
      const events = [];
      ageEffects(dt);
      if (game.state === "over") return events;

      if (game.state === "countdown") {
        game.countdown = Math.max(0, game.countdown - dt);
        if (game.countdown <= 0) {
          game.state = "playing";
          events.push({ type: "start" });
        }
        return events;
      }

      game.timeLeft = Math.max(0, game.timeLeft - dt);
      if (game.timeLeft <= 0) {
        game.state = "over";
        game.objects.length = 0;
        events.push({ type: "over", score: game.score });
        return events;
      }

      // Spawning speeds up from every 1.1 s to every 0.45 s over the round.
      const progress = Math.max(0, Math.min(1, (roundSeconds - game.timeLeft) / roundSeconds));
      const spawnInterval = 1.1 + (0.45 - 1.1) * progress;
      spawnAccumulator += dt;
      while (spawnAccumulator >= spawnInterval) {
        spawnAccumulator -= spawnInterval;
        if (game.objects.length < MAX_OBJECTS) spawn(center);
      }

      let write = 0;
      for (const object of game.objects) {
        object.y -= object.kind.speed * dt;
        object.spin += 2.5 * dt;
        object.age += dt;
        if (isCaught(object, catchers)) {
          game.combo += 1;
          const points = object.kind.points * multiplier();
          game.score += points;
          game.caught += 1;
          game.bestCombo = Math.max(game.bestCombo, game.combo);
          addEffect(object, "catch", points);
          events.push({ type: "catch", points, kind: object.kind.id, x: object.x, y: object.y, z: object.z });
        } else if (object.y - object.kind.radius <= floorY) {
          game.missed += 1;
          game.combo = 0;
          addEffect(object, "miss", 0);
          events.push({ type: "miss", kind: object.kind.id, x: object.x, y: object.y, z: object.z });
        } else {
          game.objects[write++] = object;
        }
      }
      game.objects.length = write;
      return events;
    }

    return game;
  }

  const api = { createGame, KINDS, ROUND_SECONDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitCatchGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
