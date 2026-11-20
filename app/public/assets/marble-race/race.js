// Marble Race: course generation and physics, kept free of DOM/WebGL so it
// can be tested deterministically in Node.
(function (root) {
  "use strict";

  const R = 0.3;            // marble radius (m)
  const W = 4.2;            // lane width between walls
  const WT = 0.3;           // wall thickness
  const WALL_H = 1.1;       // wall height above the floor
  const FT = 0.4;           // floor thickness
  const G = 9.81;
  const DT = 1 / 240;       // physics step
  const MAX_SPEED = 13;
  const ROLL_DRAG = 0.08;   // rolling resistance (m/s^2) while in contact
  const AIR_DRAG = 0.04;    // fraction of speed lost per second
  const FINISH_GRACE = 30;  // seconds after the winner before the race closes
  const RACE_LIMIT = 240;   // hard limit in seconds
  const LAVA_DEPTH = 2.6;   // lava river surface below the track (lava world)
  const CAVE_HEIGHT = 9;    // cave ceiling above the track (lava world)
  const MAX_ROCKS = 6;      // falling rocks in the air or rolling at once

  const MARBLES = Object.freeze([
    { name: "Ruby", color: [0.86, 0.12, 0.18], accent: [1.0, 0.82, 0.85] },
    { name: "Blizzard", color: [0.55, 0.82, 1.0], accent: [1.0, 1.0, 1.0] },
    { name: "Mango", color: [1.0, 0.58, 0.1], accent: [1.0, 0.9, 0.35] },
    { name: "Limelight", color: [0.45, 0.85, 0.15], accent: [0.9, 1.0, 0.6] },
    { name: "Nebula", color: [0.45, 0.2, 0.8], accent: [0.95, 0.55, 1.0] },
    { name: "Goldie", color: [0.95, 0.75, 0.15], accent: [1.0, 0.98, 0.8] },
    { name: "Shadow", color: [0.12, 0.12, 0.16], accent: [0.55, 0.6, 0.7] },
    { name: "Bubblegum", color: [1.0, 0.45, 0.75], accent: [1.0, 0.9, 0.95] },
    { name: "Tornado", color: [0.55, 0.58, 0.62], accent: [0.15, 0.2, 0.3] },
    { name: "Ocean", color: [0.05, 0.4, 0.85], accent: [0.3, 0.95, 0.9] },
    { name: "Comet", color: [0.95, 0.95, 0.98], accent: [1.0, 0.35, 0.1] },
    { name: "Jade", color: [0.05, 0.6, 0.45], accent: [0.7, 1.0, 0.85] }
  ].map(Object.freeze));

  const MODULE_TYPES = Object.freeze([
    "pegs", "spinners", "hammers", "pushers", "bumpers", "washboard", "drop", "funnel", "split"
  ]);

  // Worlds: the same obstacles, a different look and pace. Lava is steeper and
  // faster, and has boulders on the route.
  const WORLDS = Object.freeze({
    meadow: Object.freeze({ id: "meadow", label: "Meadow", slopeScale: 1, maxSpeed: 13 }),
    lava: Object.freeze({ id: "lava", label: "Lava cave", slopeScale: 2.5, maxSpeed: 24 })
  });

  const MODULE_LABELS = Object.freeze({
    start: "Starting gate",
    boulders: "Boulder field",
    pegs: "Peg forest",
    spinners: "Windmills",
    hammers: "Hammer alley",
    pushers: "Pushers",
    bumpers: "Bumper garden",
    washboard: "Washboard",
    drop: "Big drop",
    funnel: "Bottleneck",
    split: "Split path",
    finish: "Home straight"
  });

  // ---------- small vector helpers (arrays of 3) ----------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const UP = Object.freeze([0, 1, 0]);

  // Column-major 3x3 rotation from three orthonormal axes, kept right-handed.
  function basis(x, y, z) {
    if (dot(cross(x, y), z) < 0) x = scale(x, -1);
    return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  }

  function createRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // A lane frame: origin S on the floor's top surface, horizontal heading f,
  // descending `slope` metres per horizontal metre. Local coordinates are
  // u (sideways), v (floor normal) and w (distance along the slope).
  function makeFrame(S, f, slope) {
    f = norm([f[0], 0, f[2]]);
    const r = [-f[2], 0, f[0]];
    const t = norm([f[0], -slope, f[2]]);
    const n = norm(cross(r, t));
    const sec = Math.sqrt(1 + slope * slope);
    return {
      S, f, r, t, n, slope, sec,
      at(u, v, w) {
        return [
          S[0] + r[0] * u + n[0] * v + t[0] * w,
          S[1] + r[1] * u + n[1] * v + t[1] * w,
          S[2] + r[2] * u + n[2] * v + t[2] * w
        ];
      }
    };
  }

  // ---------- course building ----------
  function buildCourse(seed, options = {}) {
    const random = createRng(seed);
    const world = WORLDS[options.world] || WORLDS.meadow;
    const lava = world.id === "lava";
    // Separate stream for the lava extras, so meadow tracks stay exactly as before.
    const extra = createRng((seed * 7919 + 17) >>> 0);
    const moduleCount = options.moduleCount || 6;
    const solids = [];
    const deco = [];
    const path = [];
    const checkpoints = [];
    const sections = [];
    const pads = [];
    let moduleIndex = 0;

    function push(solid) {
      solid.module = moduleIndex;
      solid.e = solid.e === undefined ? 0.3 : solid.e;
      solid.tag = solid.tag || "wall";
      solid.kinematic = typeof solid.update === "function";
      if (solid.type === "box") {
        solid.bound = len(solid.h);
        solid.prevC = solid.c.slice();
        solid.prevM = solid.m.slice();
      } else {
        solid.c = scale(add(solid.a, solid.b), 0.5);
        solid.bound = len(sub(solid.b, solid.a)) / 2 + solid.r;
      }
      solids.push(solid);
      return solid;
    }

    function box(F, u, v, w, hu, hv, hw, opts = {}) {
      return push(Object.assign({
        type: "box",
        c: F.at(u, v, w),
        m: basis(F.r, F.n, F.t),
        h: [hu, hv, hw]
      }, opts));
    }

    // Box rotated about the frame's floor normal by `yaw` radians.
    function yawAxes(F, yaw) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return {
        x: add(scale(F.r, c), scale(F.t, s)),
        z: sub(scale(F.t, c), scale(F.r, s))
      };
    }
    function yawBox(F, u, v, w, hu, hv, hw, yaw, opts = {}) {
      const ax = yawAxes(F, yaw);
      return push(Object.assign({
        type: "box",
        c: F.at(u, v, w),
        m: basis(ax.x, F.n, ax.z),
        h: [hu, hv, hw]
      }, opts));
    }

    // A boulder resting on the floor (a sphere, rendered as a rough rock).
    function rock(F, u, w, radius) {
      const c = F.at(u, radius * 0.55, w);
      return push({ type: "capsule", a: c, b: c.slice(), r: radius, color: lava ? [0.4, 0.33, 0.3] : [0.5, 0.47, 0.43], e: 0.35, tag: "rock", rock: true });
    }

    function post(F, u, w, radius, height, opts = {}) {
      return push(Object.assign({
        type: "capsule",
        a: F.at(u, -0.1, w),
        b: F.at(u, height, w),
        r: radius
      }, opts));
    }

    // Horizontal rounded rail across the lane (from u0 to u1), half sunk in the floor.
    function rail(F, w, radius, v, opts = {}, u0 = -W / 2, u1 = W / 2) {
      return push(Object.assign({ type: "capsule", a: F.at(u0, v, w), b: F.at(u1, v, w), r: radius }, opts));
    }

    const palette = [
      [0.95, 0.42, 0.32], [0.98, 0.76, 0.28], [0.36, 0.72, 0.95], [0.55, 0.85, 0.45],
      [0.75, 0.55, 0.95], [0.98, 0.55, 0.75], [0.35, 0.85, 0.8], [0.95, 0.6, 0.25]
    ];
    const lavaPalette = [
      [1.0, 0.42, 0.1], [0.95, 0.25, 0.12], [1.0, 0.62, 0.18], [0.85, 0.2, 0.25], [1.0, 0.5, 0.3]
    ];
    function sectionColors(i) {
      if (lava) {
        const accent = lavaPalette[i % lavaPalette.length];
        return { floor: [0.46, 0.42, 0.4], wall: [0.3, 0.25, 0.24], accent };
      }
      const accent = palette[i % palette.length];
      return { floor: [0.9, 0.9, 0.93], wall: accent, accent };
    }

    function floorAndWalls(F, from, to, colors, wallHeight = WALL_H) {
      const mid = (from + to) / 2, half = (to - from) / 2;
      box(F, 0, -FT / 2, mid, W / 2 + WT, FT / 2, half, { color: colors.floor, kind: 1, floor: true, e: 0.25 });
      walls(F, from, to, colors, wallHeight);
    }
    function walls(F, from, to, colors, wallHeight = WALL_H, floorDrop = 0) {
      const mid = (from + to) / 2, half = (to - from) / 2;
      const vCenter = (wallHeight - FT - floorDrop) / 2;
      const hv = (wallHeight + FT + floorDrop) / 2;
      for (const side of [-1, 1]) {
        box(F, side * (W / 2 + WT / 2), vCenter, mid, WT / 2, hv, half, { color: colors.wall, e: 0.35 });
      }
    }

    function addPath(p) {
      const last = path[path.length - 1];
      if (!last || len(sub(p, last)) > 0.05) path.push(p);
    }

    function lift(p, h) { return [p[0], p[1] + h, p[2]]; }

    // ----- modules (each returns its exit point on the floor centre line) -----
    const modules = {
      start(F, colors) {
        const Lh = 9, Ls = Lh * F.sec;
        floorAndWalls(F, -WT, Ls, colors);
        box(F, 0, (WALL_H - FT) / 2, -WT / 2, W / 2 + WT, (WALL_H + FT) / 2, WT / 2, { color: colors.wall });
        const gateW = 3.0;
        const gateBase = F.at(0, 0.5, gateW);
        const gate = box(F, 0, 0.5, gateW, W / 2, 0.5, 0.08, { color: [0.9, 0.15, 0.15], tag: "gate", e: 0.1 });
        gate.update = (time, race) => {
          const open = race && race.state !== "ready" && race.state !== "countdown";
          const since = open ? race.time - race.startTime : 0;
          const rise = open ? Math.min(2.2, since * 6) : 0;
          gate.c = madd(gateBase, F.n, rise);
        };
        gate.kinematic = true;
        const slots = [];
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++) {
            slots.push(F.at(-1.35 + col * 0.9, R + 0.01, 0.55 + row * 0.8));
          }
        }
        return { exit: F.at(0, 0, Ls), Ls, slots, gateW: gateW - 0.08 };
      },

      pegs(F, colors) {
        const Lh = 16, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        // Gaps of at least 0.75 m between posts and to the walls, so no marble can wedge.
        let row = 0;
        for (let w = 2.2; w < Ls - 1.8; w += 1.35, row++) {
          const columns = row % 2 ? [-0.6, 0.6] : [-1.2, 0, 1.2];
          for (const u of columns) {
            post(F, u, w, 0.15, 0.85, { color: colors.accent, e: 0.45, tag: "peg" });
          }
        }
        return { exit: F.at(0, 0, Ls), Ls };
      },

      spinners(F, colors, rnd) {
        const Lh = 15, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        [3.6, 7.6, 11.6].forEach((w, i) => {
          const omega = (i % 2 ? -1 : 1) * (1.8 + rnd() * 0.8);
          const phase = rnd() * Math.PI;
          const center = F.at(0, 0.34, w);
          const bar = push({ type: "box", c: center, m: basis(F.r, F.n, F.t), h: [1.25, 0.3, 0.1], color: colors.accent, e: 0.5, tag: "spinner" });
          bar.update = time => {
            const ax = yawAxes(F, phase + omega * time);
            bar.m = basis(ax.x, F.n, ax.z);
          };
          bar.kinematic = true;
          post(F, 0, w, 0.16, 0.9, { color: [0.3, 0.3, 0.35], e: 0.4 });
        });
        return { exit: F.at(0, 0, Ls), Ls };
      },

      hammers(F, colors, rnd) {
        const Lh = 15, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        const pivotH = 3.6, arm = 3.1, amp = 0.95;
        [3.8, 7.8, 11.8].forEach((w, i) => {
          const pivot = F.at(0, pivotH, w);
          const speed = 2.6 + rnd() * 0.6;
          const phase = i * 2.1 + rnd() * 1.5;
          const head = push({ type: "box", c: pivot, m: basis(F.r, F.n, F.t), h: [0.36, 0.34, 0.32], color: colors.accent, e: 0.7, tag: "hammer" });
          const stick = push({ type: "box", c: pivot, m: basis(F.r, F.n, F.t), h: [0.06, arm / 2, 0.06], color: [0.35, 0.32, 0.3], e: 0.4 });
          head.update = time => {
            const phi = amp * Math.sin(speed * time + phase);
            const c = Math.cos(phi), s = Math.sin(phi);
            const down = add(scale(F.n, -c), scale(F.r, s));
            const side = add(scale(F.r, c), scale(F.n, s));
            const m = basis(side, scale(down, -1), F.t);
            head.c = madd(pivot, down, arm);
            head.m = m;
            stick.c = madd(pivot, down, arm / 2);
            stick.m = m;
          };
          head.kinematic = true;
          // The head's update moves the stick too; mark it kinematic for velocity tracking.
          stick.update = () => {};
          stick.kinematic = true;
          // Gantry above the lane.
          deco.push({ type: "box", c: F.at(0, pivotH + 0.12, w), m: basis(F.r, F.n, F.t), h: [W / 2 + WT, 0.12, 0.12], color: [0.35, 0.32, 0.3] });
          for (const side of [-1, 1]) {
            deco.push({ type: "box", c: F.at(side * (W / 2 + WT / 2), (pivotH + WALL_H) / 2, w), m: basis(F.r, F.n, F.t), h: [WT / 2, (pivotH - WALL_H) / 2 + 0.12, 0.12], color: [0.35, 0.32, 0.3] });
          }
        });
        return { exit: F.at(0, 0, Ls), Ls };
      },

      pushers(F, colors, rnd) {
        const Lh = 15, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        [2.8, 5.8, 8.8, 11.8].forEach((w, i) => {
          const side = i % 2 ? 1 : -1;
          const speed = 1.6 + rnd() * 0.7;
          const phase = rnd() * Math.PI * 2;
          const hu = 0.9;
          const pusher = push({ type: "box", c: F.at(side * (W / 2 + hu), 0.36, w), m: basis(F.r, F.n, F.t), h: [hu, 0.34, 0.45], color: colors.accent, e: 0.6, tag: "pusher" });
          pusher.update = time => {
            const p = (1 - Math.cos(speed * time + phase)) / 2;
            pusher.c = F.at(side * (W / 2 + hu - p * 2.0), 0.36, w);
          };
          pusher.kinematic = true;
        });
        return { exit: F.at(0, 0, Ls), Ls };
      },

      bumpers(F, colors) {
        const Lh = 15, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        const spots = [[-0.95, 3.2], [0.95, 3.2], [0, 6.6], [-0.95, 10], [0.95, 10], [0, 13.2]];
        for (const [u, w] of spots) {
          post(F, u, w, 0.42, 0.7, { color: [0.98, 0.3, 0.55], e: 0.6, tag: "bumper", kick: 1.2 });
        }
        return { exit: F.at(0, 0, Ls), Ls };
      },

      washboard(F, colors) {
        const Lh = 14, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        // Rounded rails across the lane make the marbles hop.
        for (let w = 1.8; w < Ls - 1.4; w += 1.6) {
          rail(F, w, 0.075, 0.0, { color: colors.accent, e: 0.3, tag: "bump" });
        }
        return { exit: F.at(0, 0, Ls), Ls };
      },

      drop(F, colors) {
        const Lh = 15, Ls = Lh * F.sec;
        const depth = 1.7;
        const upperEnd = 8.2;
        const F2 = makeFrame(lift(F.S, -depth), F.f, F.slope);
        // Upper deck and kicker ramp.
        box(F, 0, -FT / 2, upperEnd / 2, W / 2 + WT, FT / 2, upperEnd / 2, { color: colors.floor, kind: 1, floor: true, e: 0.25 });
        const K = makeFrame(F.at(0, 0, upperEnd - 1.3), F.f, -0.32);
        box(K, 0, -FT / 2, 0.75, W / 2, FT / 2, 0.75, { color: colors.accent, floor: true, e: 0.2 });
        // Lower landing deck, starting beneath the kicker so every marble lands.
        const lowerStart = upperEnd - 2.6;
        box(F2, 0, -FT / 2, (lowerStart + Ls) / 2, W / 2 + WT, FT / 2, (Ls - lowerStart) / 2, { color: colors.floor, kind: 1, floor: true, e: 0.2 });
        box(F2, 0, (depth - FT) / 2, lowerStart - WT / 2, W / 2 + WT, (depth + FT) / 2 - 0.02, WT / 2, { color: colors.wall });
        // Tall side walls over both decks keep airborne marbles in.
        walls(F2, 0, Ls, colors, depth + WALL_H + 1.0);
        addPath(lift(F.at(0, 0, upperEnd + 0.6), R));
        addPath(lift(F2.at(0, 0, upperEnd + 2.4), R));
        return { exit: F2.at(0, 0, Ls), Ls };
      },

      funnel(F, colors) {
        const Lh = 14, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        const gap = 0.75; // half opening at the throat
        const start = 3, throat = 7.5, end = 11.5;
        for (const side of [-1, 1]) {
          for (const [w0, w1] of [[start, throat], [throat, end]]) {
            const u0 = side * (w0 === start ? W / 2 : gap);
            const u1 = side * (w1 === end ? W / 2 : gap);
            const du = u1 - u0, dw = w1 - w0;
            const length = Math.hypot(du, dw);
            const yaw = -Math.atan2(du, dw);
            const out = side * (WT / 2);
            yawBox(F, (u0 + u1) / 2 + out * Math.cos(yaw), (WALL_H - FT) / 2, (w0 + w1) / 2, WT / 2, (WALL_H + FT) / 2, length / 2 + 0.05, yaw,
              { color: colors.accent, e: 0.3, tag: "wall" });
          }
        }
        return { exit: F.at(0, 0, Ls), Ls };
      },

      split(F, colors) {
        const Lh = 15, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        const from = 3.2, to = 12.2;
        box(F, 0, (WALL_H - FT) / 2, (from + to) / 2, 0.15, (WALL_H + FT) / 2, (to - from) / 2, { color: colors.accent });
        yawBox(F, 0, (WALL_H - FT) / 2, from, 0.21, (WALL_H + FT) / 2, 0.21, Math.PI / 4, { color: colors.accent });
        yawBox(F, 0, (WALL_H - FT) / 2, to, 0.21, (WALL_H + FT) / 2, 0.21, Math.PI / 4, { color: colors.accent });
        const laneCenter = (W / 2 + 0.15) / 2;
        for (let w = from + 1.6; w < to - 0.8; w += 2.0) {
          post(F, -laneCenter, w, 0.15, 0.85, { color: [0.3, 0.3, 0.35], e: 0.45, tag: "peg" });
        }
        for (let w = from + 1.2; w < to - 0.4; w += 1.6) {
          rail(F, w, 0.075, 0.0, { color: [0.3, 0.3, 0.35], e: 0.3, tag: "bump" }, 0.15, W / 2);
        }
        return { exit: F.at(0, 0, Ls), Ls };
      },

      // Boulders scattered down a steep lane. Gaps to the walls and between
      // boulders are at least ~0.75 m so no marble can wedge.
      boulders(F, colors, rnd) {
        const Lh = 16, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        let row = 0;
        for (let w = 2.4; w < Ls - 1.6; w += 2.1, row++) {
          const jitter = () => (rnd() - 0.5) * 0.16;
          if (row % 2) rock(F, jitter(), w, 0.44 + rnd() * 0.06);
          else for (const u of [-0.95, 0.95]) rock(F, u + jitter(), w + jitter(), 0.36 + rnd() * 0.06);
        }
        return { exit: F.at(0, 0, Ls), Ls };
      },

      finish(F, colors) {
        const Lh = 20, Ls = Lh * F.sec;
        floorAndWalls(F, 0, Ls, colors);
        box(F, 0, (WALL_H - FT) / 2, Ls + WT / 2, W / 2 + WT, (WALL_H + FT) / 2, WT / 2, { color: colors.wall, e: 0.15 });
        const finishW = 12;
        // Checkered banner and posts (decoration only).
        deco.push({ type: "box", c: F.at(0, 3.0, finishW), m: basis(F.r, F.n, F.t), h: [W / 2 + WT + 0.2, 0.35, 0.06], color: [1, 1, 1], kind: 2 });
        for (const side of [-1, 1]) {
          deco.push({ type: "box", c: F.at(side * (W / 2 + WT + 0.1), 1.5, finishW), m: basis(F.r, F.n, F.t), h: [0.1, 1.8, 0.1], color: [0.9, 0.9, 0.9] });
        }
        deco.push({ type: "box", c: F.at(0, 0.005, finishW), m: basis(F.r, F.n, F.t), h: [W / 2, 0.006, 0.25], color: [1, 1, 1], kind: 2 });
        return { exit: F.at(0, 0, Ls), Ls, finishW };
      }
    };

    // Lanes in the cave are stone bridges: posts on the parapets and piers
    // down into the lava (drawn only; the renderer ends piers at the lava).
    function bridgeDecor(F, Ls, type) {
      const stone = [0.36, 0.31, 0.29];
      for (let w = 1.0; w < Ls - 0.5; w += 2.3) {
        for (const side of [-1, 1]) {
          deco.push({ type: "box", c: F.at(side * (W / 2 + WT / 2), WALL_H + 0.16, w), m: basis(F.r, F.n, F.t), h: [WT / 2 + 0.04, 0.16, 0.14], color: stone });
        }
      }
      if (type === "drop") return; // its lower deck would cut through piers
      for (let w = 3; w < Ls - 1.5; w += 5.5) deco.push({ type: "pillar", c: F.at(0, -FT * 0.5, w), r: 0.32, color: stone });
    }

    // Corner pad: turns the heading by 90 degrees towards turn (+1 right, -1 left).
    function corner(E, f, turn, colors) {
      const f2 = scale([-f[2], 0, f[0]], turn);
      const tanB = 0.13;
      const C = add(E, scale(f, W / 2));
      C[1] = E[1] - (W / 2) * tanB - 0.03;
      const P = makeFrame(C, f2, tanB);
      const s = dot(f, P.r) > 0 ? 1 : -1;
      const half = W / 2 + WT;
      box(P, 0, -FT / 2, 0, half, FT / 2, half * P.sec, { color: colors.floor, kind: 1, floor: true, e: 0.25 });
      const vC = (WALL_H - FT) / 2, hv = (WALL_H + FT) / 2;
      box(P, s * (W / 2 + WT / 2), vC, 0, WT / 2, hv, half, { color: colors.wall, e: 0.3 });
      box(P, 0, vC, -(W / 2 + WT / 2) * P.sec, half, hv, WT / 2, { color: colors.wall, e: 0.3 });
      // Diagonal deflector across the outer corner, like a banked turn.
      const diag = Math.SQRT2 * W / 2;
      yawBox(P, s * (W / 4 + WT * 0.35), vC, -(W / 4 + WT * 0.35), WT / 2, hv, diag / 2, -s * Math.PI / 4, { color: colors.accent, e: 0.2, tag: "wall" });
      // Support pillar to the ground (decoration).
      deco.push({ type: "pillar", c: C, color: [0.75, 0.72, 0.68] });
      pads.push(P);
      const exit = P.at(0, 0, (W / 2) * P.sec);
      exit[1] -= 0.02;
      return { center: C, exit, heading: f2 };
    }

    // Choose modules.
    const chosen = shuffle(MODULE_TYPES, random).slice(0, Math.min(moduleCount, MODULE_TYPES.length));
    if (lava) chosen.splice(1 + Math.floor(extra() * (chosen.length - 1)), 1, "boulders");
    const sequence = ["start"].concat(chosen, ["finish"]);
    const baseSlopes = { start: 0.14, pegs: 0.2, spinners: 0.18, hammers: 0.17, pushers: 0.17, bumpers: 0.19, washboard: 0.22, drop: 0.16, funnel: 0.17, split: 0.18, boulders: 0.2, finish: 0.08 };
    const slopes = {};
    for (const key of Object.keys(baseSlopes)) slopes[key] = baseSlopes[key] * (key === "start" ? 1 : world.slopeScale);

    let S = [0, 0, 0];
    let heading = [0, 0, 1];
    let turn = random() < 0.5 ? 1 : -1;
    let slots = null, finish = null;
    sequence.forEach((type, i) => {
      moduleIndex = i;
      const F = makeFrame(S, heading, slopes[type]);
      const colors = sectionColors(i);
      const pathStart = path.length;
      addPath(lift(F.at(0, 0, type === "start" ? 0.5 : 0), R));
      const result = modules[type](F, colors, type === "boulders" ? extra : random);
      if (lava) bridgeDecor(F, result.Ls, type);
      if (lava && type !== "start" && type !== "boulders") {
        // A boulder where each lane begins, before its obstacles, on a random side.
        rock(F, (extra() < 0.5 ? -1 : 1) * 0.92, 1.1, 0.34);
        if (type === "finish") {
          rock(F, (extra() < 0.5 ? -1 : 1) * 0.92, 4.4, 0.36);
          rock(F, 0, 7.6, 0.4);
        }
      }
      addPath(lift(result.exit, R));
      checkpoints.push({ module: i, position: lift(F.at(0, 0, type === "start" ? 4 : 1.2), R + 0.05), pathIndex: pathStart });
      sections.push({ type, label: MODULE_LABELS[type], pathIndex: pathStart, frame: F, colors });
      if (type === "start") { slots = result.slots; sections[0].gateW = result.gateW; }
      if (type === "finish") {
        finish = { frame: F, w: result.finishW, point: F.at(0, 0, result.finishW) };
        return;
      }
      const pad = corner(result.exit, heading, turn, colors);
      addPath(lift(pad.center, R));
      S = pad.exit;
      heading = pad.heading;
      turn = -turn;
    });

    // Cumulative distances along the centre line.
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + len(sub(path[i], path[i - 1])));

    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const s of solids) {
      for (let k = 0; k < 3; k++) {
        bounds.min[k] = Math.min(bounds.min[k], s.c[k] - s.bound);
        bounds.max[k] = Math.max(bounds.max[k], s.c[k] + s.bound);
      }
    }

    const course = {
      seed, world: world.id, maxSpeed: world.maxSpeed, solids, deco, path, cum, checkpoints, sections, pads, slots, bounds,
      length: cum[cum.length - 1],
      finish
    };
    course.finishProgress = projectProgress(course, lift(finish.point, R)).progress;
    course.groundY = bounds.min[1] - 6;
    if (lava) {
      course.caveField = (x, z) => caveField(course, x, z);
      course.lavaHeight = (x, z) => caveField(course, x, z).h - LAVA_DEPTH;
      course.ceilingHeight = (x, z) => {
        const f = caveField(course, x, z);
        const t = smoothstep(13, 30, f.d);
        return f.h + CAVE_HEIGHT * (1 - t) - (LAVA_DEPTH + 0.6) * t;
      };
    }
    return course;
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Lava world: smoothed height of the track near (x, z), the horizontal
  // distance to its centre line and the downhill direction. The lava river and
  // the cave ceiling follow the track down.
  function caveField(course, x, z) {
    const path = course.path;
    const hits = [];
    let dmin = Infinity;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const abx = b[0] - a[0], abz = b[2] - a[2];
      const l2 = abx * abx + abz * abz;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[2]) * abz) / l2)) : 0;
      const qx = a[0] + abx * t, qz = a[2] + abz * t;
      const d = Math.hypot(x - qx, z - qz);
      const l = Math.sqrt(l2) || 1;
      hits.push({ d, h: a[1] + (b[1] - a[1]) * t - R, fx: abx / l, fz: abz / l });
      if (d < dmin) dmin = d;
    }
    let ws = 0, h = 0, fx = 0, fz = 0;
    for (const hit of hits) {
      const w = Math.exp(-(hit.d - dmin) / 2);
      ws += w; h += hit.h * w; fx += hit.fx * w; fz += hit.fz * w;
    }
    const fl = Math.hypot(fx, fz) || 1;
    return { h: h / ws, d: dmin, fx: fx / fl, fz: fz / fl };
  }

  // Point and horizontal heading at a distance along the centre line.
  function pointAt(course, progress) {
    const { path, cum } = course;
    let i = 0;
    while (i + 2 < path.length && cum[i + 1] < progress) i++;
    const a = path[i], b = path[i + 1];
    const t = Math.max(0, Math.min(1, (progress - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
    const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dir: [dx / l, 0, dz / l] };
  }

  // Distance along the course centre line closest to p, searching around hint.
  function projectProgress(course, p, hint) {
    const path = course.path;
    let best = null;
    const from = hint === undefined ? 0 : Math.max(0, hint - 2);
    const to = hint === undefined ? path.length - 1 : Math.min(path.length - 1, hint + 3);
    for (let i = from; i < to; i++) {
      const a = path[i], b = path[i + 1];
      const ab = sub(b, a);
      const l2 = dot(ab, ab) || 1;
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
      const q = madd(a, ab, t);
      const d = len(sub(p, q));
      if (!best || d < best.distance) best = { distance: d, index: i, progress: course.cum[i] + t * Math.sqrt(l2) };
    }
    return best || { distance: 0, index: 0, progress: 0 };
  }

  // ---------- collision ----------
  // Returns penetration depth and outward normal of the sphere against a solid, or null.
  function collide(solid, p, r) {
    const dx = p[0] - solid.c[0], dy = p[1] - solid.c[1], dz = p[2] - solid.c[2];
    const bound = solid.bound + r;
    if (dx * dx + dy * dy + dz * dz > bound * bound) return null;
    if (solid.type === "capsule") {
      const a = solid.a, ab = sub(solid.b, a);
      const l2 = dot(ab, ab);
      // A zero-length capsule (a boulder) is a sphere.
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
      const q = madd(a, ab, t);
      const d = sub(p, q);
      const dist = len(d);
      const reach = r + solid.r;
      if (dist >= reach) return null;
      const n = dist > 1e-6 ? scale(d, 1 / dist) : [0, 1, 0];
      return { n, depth: reach - dist };
    }
    const m = solid.m, h = solid.h;
    const lx = dx * m[0] + dy * m[1] + dz * m[2];
    const ly = dx * m[3] + dy * m[4] + dz * m[5];
    const lz = dx * m[6] + dy * m[7] + dz * m[8];
    const cx = Math.max(-h[0], Math.min(h[0], lx));
    const cy = Math.max(-h[1], Math.min(h[1], ly));
    const cz = Math.max(-h[2], Math.min(h[2], lz));
    let n, depth;
    if (cx === lx && cy === ly && cz === lz) {
      // Centre inside the box: push out along the nearest face.
      const fx = h[0] - Math.abs(lx), fy = h[1] - Math.abs(ly), fz = h[2] - Math.abs(lz);
      let ln;
      if (fx <= fy && fx <= fz) { ln = [Math.sign(lx) || 1, 0, 0]; depth = fx + r; }
      else if (fy <= fz) { ln = [0, Math.sign(ly) || 1, 0]; depth = fy + r; }
      else { ln = [0, 0, Math.sign(lz) || 1]; depth = fz + r; }
      n = [m[0] * ln[0] + m[3] * ln[1] + m[6] * ln[2], m[1] * ln[0] + m[4] * ln[1] + m[7] * ln[2], m[2] * ln[0] + m[5] * ln[1] + m[8] * ln[2]];
    } else {
      const ox = lx - cx, oy = ly - cy, oz = lz - cz;
      const dist = Math.hypot(ox, oy, oz);
      if (dist >= r) return null;
      depth = r - dist;
      const ln = [ox / dist, oy / dist, oz / dist];
      n = [m[0] * ln[0] + m[3] * ln[1] + m[6] * ln[2], m[1] * ln[0] + m[4] * ln[1] + m[7] * ln[2], m[2] * ln[0] + m[5] * ln[1] + m[8] * ln[2]];
    }
    return { n, depth };
  }

  // Velocity of a kinematic solid's surface at world point p over the last step.
  function surfaceVelocity(solid, p, dt) {
    if (!solid.kinematic) return [0, 0, 0];
    const m = solid.m, pm = solid.prevM, c = solid.c, pc = solid.prevC;
    const d = sub(p, c);
    const l = [d[0] * m[0] + d[1] * m[1] + d[2] * m[2], d[0] * m[3] + d[1] * m[4] + d[2] * m[5], d[0] * m[6] + d[1] * m[7] + d[2] * m[8]];
    const prev = [
      pc[0] + pm[0] * l[0] + pm[3] * l[1] + pm[6] * l[2],
      pc[1] + pm[1] * l[0] + pm[4] * l[1] + pm[7] * l[2],
      pc[2] + pm[2] * l[0] + pm[5] * l[1] + pm[8] * l[2]
    ];
    const v = scale(sub(p, prev), 1 / dt);
    const s = len(v);
    return s > 20 ? scale(v, 20 / s) : v;
  }

  // Ray straight down from p; returns the highest floor hit below p (for shadows).
  function floorBelow(course, p, maxDistance = 30) {
    let best = null;
    for (const s of course.solids) {
      if (!s.floor) continue;
      const m = s.m, h = s.h;
      const d = sub(p, s.c);
      const o = [dot(d, [m[0], m[1], m[2]]), dot(d, [m[3], m[4], m[5]]), dot(d, [m[6], m[7], m[8]])];
      const dir = [-m[1], -m[4], -m[7]];
      let tMin = 0, tMax = maxDistance, ok = true, axis = -1;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(dir[k]) < 1e-9) {
          if (Math.abs(o[k]) > h[k]) ok = false;
          continue;
        }
        let t1 = (-h[k] - o[k]) / dir[k], t2 = (h[k] - o[k]) / dir[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > tMin) { tMin = t1; axis = k; }
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) ok = false;
      }
      if (!ok || axis < 0) continue;
      if (!best || tMin < best.distance) {
        best = { distance: tMin, normal: [m[3], m[4], m[5]], y: p[1] - tMin };
      }
    }
    return best;
  }

  // ---------- race ----------
  function createRace(course, options = {}) {
    const random = createRng(options.seed || 1);
    const count = Math.min(options.count || MARBLES.length, MARBLES.length, course.slots.length);
    const slotOrder = shuffle(course.slots.map((_, i) => i), random);
    const marbles = [];
    for (let i = 0; i < count; i++) {
      const slot = course.slots[slotOrder[i]];
      marbles.push({
        id: i,
        name: MARBLES[i].name,
        color: MARBLES[i].color,
        accent: MARBLES[i].accent,
        p: slot.slice(),
        v: [(random() - 0.5) * 0.05, 0, (random() - 0.5) * 0.05],
        q: [0, 0, 0, 1],
        spin: [0, 0, 0],
        pathIndex: 0,
        progress: 0,
        bestProgress: 0,
        finished: false,
        finishTime: null,
        place: null,
        respawns: 0,
        stuckTimer: 0,
        stuckRef: 0,
        checkpoint: 0,
        grounded: false
      });
    }
    const race = {
      course, marbles,
      state: "ready",
      time: 0,
      startTime: 0,
      countdown: 3,
      finishOrder: [],
      winnerTime: null,
      leader: null,
      events: [],
      rocks: [],
      nextRockAt: 3,
      random
    };
    for (const m of marbles) updateProgress(race, m);
    return race;
  }

  function startCountdown(race) {
    if (race.state === "ready") {
      race.state = "countdown";
      race.countdown = 3;
    }
  }

  function updateProgress(race, m) {
    const hit = projectProgress(race.course, m.p, m.pathIndex);
    m.pathIndex = hit.index;
    m.progress = hit.progress;
    if (m.progress > m.bestProgress) m.bestProgress = m.progress;
    const cps = race.course.checkpoints;
    while (m.checkpoint + 1 < cps.length && m.pathIndex >= cps[m.checkpoint + 1].pathIndex && m.progress > race.course.cum[cps[m.checkpoint + 1].pathIndex] + 1.5) {
      m.checkpoint++;
    }
  }

  function respawn(race, m, reason) {
    const cp = race.course.checkpoints[m.checkpoint];
    m.p = madd(cp.position, [1, 0, 0], 0);
    m.p[0] += (race.random() - 0.5) * 1.2;
    m.v = [0, 0, 0];
    m.spin = [0, 0, 0];
    m.pathIndex = cp.pathIndex;
    m.respawns++;
    m.stuckTimer = 0;
    m.stuckRef = m.progress;
    race.events.push({ type: "respawn", marble: m.id, reason });
  }

  function stepSolids(race, time, dt) {
    for (const s of race.course.solids) {
      if (!s.kinematic) continue;
      s.prevC = s.c.slice();
      s.prevM = s.m.slice();
    }
    for (const s of race.course.solids) {
      if (s.update) s.update(time, race);
    }
  }

  function physicsStep(race, dt) {
    const { course, marbles } = race;
    race.time += dt;
    stepSolids(race, race.time, dt);
    const solids = course.solids;
    for (const m of marbles) {
      if (m.parked) continue;
      m.v[1] -= G * dt;
      const sp = len(m.v);
      const cap = course.maxSpeed || MAX_SPEED;
      if (sp > cap) m.v = scale(m.v, cap / sp);
      m.v = scale(m.v, 1 - AIR_DRAG * dt);
      m.p = madd(m.p, m.v, dt);
      m.grounded = false;
      let groundNormal = null;
      for (let k = 0; k < solids.length; k++) {
        const s = solids[k];
        const hit = collide(s, m.p, R);
        if (!hit) continue;
        m.p = madd(m.p, hit.n, hit.depth);
        const sv = surfaceVelocity(s, m.p, dt);
        const rel = sub(m.v, sv);
        const vn = dot(rel, hit.n);
        if (vn < 0) {
          let e = s.e;
          if (-vn < 0.5 && e < 1) e = 0;
          let newRel = madd(rel, hit.n, -(1 + e) * vn);
          if (s.kick && -vn > 1) {
            newRel = madd(newRel, hit.n, s.kick);
            s.lastHit = race.time;
          }
          m.v = add(newRel, sv);
          if (-vn > 1.2) race.events.push({ type: "hit", tag: s.tag, speed: -vn, marble: m.id });
        }
        if (hit.n[1] > 0.5) {
          m.grounded = true;
          groundNormal = hit.n;
          // Rolling resistance along the surface.
          const relNow = sub(m.v, sv);
          const tang = madd(relNow, hit.n, -dot(relNow, hit.n));
          const ts = len(tang);
          if (ts > 1e-4) {
            const dec = Math.min(ts, ROLL_DRAG * dt);
            m.v = madd(m.v, tang, -dec / ts);
          }
        }
      }
      if (groundNormal) {
        // Rolling without slipping: spin axis = n x v / R.
        m.spin = scale(cross(groundNormal, m.v), 1 / R);
      }
      integrateRotation(m, dt);
    }
    if (race.rocks.length) stepRocks(race, dt);
    // Marble-marble collisions.
    for (let i = 0; i < marbles.length; i++) {
      const a = marbles[i];
      if (a.parked) continue;
      for (let j = i + 1; j < marbles.length; j++) {
        const b = marbles[j];
        if (b.parked) continue;
        const d = sub(a.p, b.p);
        const dist2 = dot(d, d);
        if (dist2 >= 4 * R * R || dist2 === 0) continue;
        const dist = Math.sqrt(dist2);
        const n = scale(d, 1 / dist);
        const push = (2 * R - dist) / 2;
        a.p = madd(a.p, n, push);
        b.p = madd(b.p, n, -push);
        const vn = dot(sub(a.v, b.v), n);
        if (vn < 0) {
          const impulse = -(1 + 0.85) * vn / 2;
          a.v = madd(a.v, n, impulse);
          b.v = madd(b.v, n, -impulse);
          if (-vn > 0.8) race.events.push({ type: "clack", speed: -vn, marble: a.id, other: b.id });
        }
      }
    }
  }

  // Falling rocks: spheres that drop from the cave ceiling, bounce, roll down
  // the track and push marbles out of the way (they are much heavier).
  function stepRocks(race, dt) {
    const { course, marbles } = race;
    const solids = course.solids;
    for (const rock of race.rocks) {
      rock.v[1] -= G * dt;
      const sp = len(rock.v);
      if (sp > 20) rock.v = scale(rock.v, 20 / sp);
      rock.p = madd(rock.p, rock.v, dt);
      let groundNormal = null;
      for (let k = 0; k < solids.length; k++) {
        const s = solids[k];
        const hit = collide(s, rock.p, rock.r);
        if (!hit) continue;
        rock.p = madd(rock.p, hit.n, hit.depth);
        const sv = surfaceVelocity(s, rock.p, dt);
        const rel = sub(rock.v, sv);
        const vn = dot(rel, hit.n);
        if (vn < 0) {
          const e = -vn < 0.8 ? 0 : Math.min(0.3, s.e);
          rock.v = add(madd(rel, hit.n, -(1 + e) * vn), sv);
          if (!rock.landed && hit.n[1] > 0.5) {
            rock.landed = true;
            race.events.push({ type: "rockland", speed: -vn, p: rock.p.slice() });
          }
        }
        if (hit.n[1] > 0.5) {
          groundNormal = hit.n;
          const tang = madd(rock.v, hit.n, -dot(rock.v, hit.n));
          const ts = len(tang);
          if (ts > 1e-4) rock.v = madd(rock.v, tang, -Math.min(ts, 0.6 * dt) / ts);
        }
      }
      if (groundNormal) rock.spin = scale(cross(groundNormal, rock.v), 1 / rock.r);
      integrateRotation(rock, dt);
      // Rock against marbles: the rock is several times heavier.
      for (const m of marbles) {
        const d = sub(m.p, rock.p);
        const reach = R + rock.r;
        const dist2 = dot(d, d);
        if (dist2 >= reach * reach || dist2 === 0) continue;
        const dist = Math.sqrt(dist2);
        const n = scale(d, 1 / dist);
        const mr = rock.mass, mm = 1, total = mr + mm;
        const overlap = reach - dist;
        m.p = madd(m.p, n, overlap * mr / total);
        rock.p = madd(rock.p, n, -overlap * mm / total);
        const vn = dot(sub(m.v, rock.v), n);
        if (vn < 0) {
          const j = -(1 + 0.4) * vn / (1 / mm + 1 / mr);
          m.v = madd(m.v, n, j / mm);
          rock.v = madd(rock.v, n, -j / mr);
          if (-vn > 2.5 && !rock.hit.has(m.id)) {
            rock.hit.add(m.id);
            race.events.push({ type: "rockhit", marble: m.id, speed: -vn });
          }
        }
      }
    }
  }

  function spawnRock(race) {
    const course = race.course;
    const candidates = race.marbles.filter(m => !m.finished);
    if (!candidates.length) return;
    const target = candidates[Math.floor(race.random() * candidates.length)];
    const progress = Math.max(5, Math.min(course.finishProgress - 4, target.progress + 7 + race.random() * 12));
    const at = pointAt(course, progress);
    const right = [-at.dir[2], 0, at.dir[0]];
    const p = madd(at.p, right, (race.random() - 0.5) * 2.4);
    p[1] = course.ceilingHeight(p[0], p[2]) - 0.8;
    const r = 0.32 + race.random() * 0.14;
    race.rocks.push({
      id: ++race.rockCount || (race.rockCount = 1), p, v: [0, -1, 0], r, mass: 6 * Math.pow(r / 0.4, 3),
      q: [0, 0, 0, 1], spin: [0, 0, 0], age: 0, still: 0, landed: false, hit: new Set()
    });
    race.events.push({ type: "rockfall", p: p.slice(), r });
  }

  // Spawns and retires falling rocks (lava world only).
  function updateRocks(race, frameDt) {
    const course = race.course;
    if (!course.lavaHeight) return;
    const elapsed = race.time - race.startTime;
    if (race.state === "running" && elapsed > race.nextRockAt) {
      race.nextRockAt = elapsed + 1.8 + race.random() * 2.2;
      if (race.rocks.length < MAX_ROCKS) spawnRock(race);
    }
    race.rocks = race.rocks.filter(rock => {
      rock.age += frameDt;
      if (rock.p[1] < course.lavaHeight(rock.p[0], rock.p[2]) + 0.1) {
        race.events.push({ type: "rocksink", p: rock.p.slice() });
        return false;
      }
      rock.still = rock.landed && len(rock.v) < 0.4 ? rock.still + frameDt : 0;
      if (rock.age > 14 || rock.still > 2) {
        race.events.push({ type: "rockcrumble", p: rock.p.slice(), r: rock.r });
        return false;
      }
      return true;
    });
  }

  function integrateRotation(m, dt) {
    const w = m.spin;
    const angle = len(w) * dt;
    if (angle < 1e-7) return;
    const axis = norm(w);
    const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
    const dq = [axis[0] * s, axis[1] * s, axis[2] * s, c];
    const q = m.q;
    const out = [
      dq[3] * q[0] + dq[0] * q[3] + dq[1] * q[2] - dq[2] * q[1],
      dq[3] * q[1] - dq[0] * q[2] + dq[1] * q[3] + dq[2] * q[0],
      dq[3] * q[2] + dq[0] * q[1] - dq[1] * q[0] + dq[2] * q[3],
      dq[3] * q[3] - dq[0] * q[0] - dq[1] * q[1] - dq[2] * q[2]
    ];
    const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    m.q = out.map(x => x / l);
  }

  function standings(race) {
    return race.marbles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  // Advance the race by a frame time (seconds). Returns events since last call.
  function update(race, frameDt) {
    race.events = [];
    if (race.state === "ready") {
      // Let marbles settle behind the gate.
      race._acc = (race._acc || 0) + Math.min(frameDt, 0.1);
      while (race._acc >= DT) { race._acc -= DT; physicsStep(race, DT); }
      race.time = 0;
      for (const m of race.marbles) updateProgress(race, m);
      return race.events;
    }
    if (race.state === "countdown") {
      const before = Math.ceil(race.countdown);
      race.countdown -= frameDt;
      const after = Math.ceil(race.countdown);
      if (after !== before && after > 0) race.events.push({ type: "count", value: after });
      if (race.countdown <= 0) {
        race.state = "running";
        race.startTime = race.time;
        race.events.push({ type: "go" });
      }
    }
    if (race.state === "finished") return race.events;
    race._acc = (race._acc || 0) + Math.min(frameDt, 0.25);
    while (race._acc >= DT) {
      race._acc -= DT;
      physicsStep(race, DT);
    }
    const course = race.course;
    const elapsed = race.time - race.startTime;
    updateRocks(race, frameDt);
    for (const m of race.marbles) {
      if (m.parked) continue;
      updateProgress(race, m);
      if (race.state !== "running") continue;
      if (!m.finished && m.progress >= course.finishProgress) {
        m.finished = true;
        m.finishTime = elapsed;
        race.finishOrder.push(m.id);
        m.place = race.finishOrder.length;
        if (m.place === 1) race.winnerTime = elapsed;
        race.events.push({ type: "finish", marble: m.id, place: m.place, time: elapsed });
      }
      if (m.finished) continue;
      // Into the lava river?
      if (course.lavaHeight && m.p[1] < course.lavaHeight(m.p[0], m.p[2]) + 0.15) {
        respawn(race, m, "lava");
        continue;
      }
      // Fell off the course?
      const cp = course.checkpoints[m.checkpoint];
      const hit = projectProgress(course, m.p, m.pathIndex);
      if (m.p[1] < cp.position[1] - 12 || hit.distance > 9) {
        respawn(race, m, "fell");
        continue;
      }
      // Stuck detection.
      m.stuckTimer += frameDt;
      if (m.progress > m.stuckRef + 0.4) {
        m.stuckRef = m.progress;
        m.stuckTimer = 0;
      } else if (m.stuckTimer > 10) {
        respawn(race, m, "stuck");
      } else if (m.stuckTimer > 4 && len(m.v) < 0.6 && !m.kicked) {
        const ahead = course.path[Math.min(course.path.length - 1, m.pathIndex + 1)];
        const dir = norm(sub(ahead, m.p));
        m.v = add(m.v, [dir[0] * 2.5 + (race.random() - 0.5) * 1.5, 1.5, dir[2] * 2.5 + (race.random() - 0.5) * 1.5]);
        m.kicked = true;
        race.events.push({ type: "nudge", marble: m.id });
      }
      if (m.stuckTimer < 1) m.kicked = false;
    }
    if (race.state === "running") {
      const order = standings(race);
      const lead = order[0];
      if (lead && race.leader !== lead.id) {
        if (race.leader !== null && !lead.finished && elapsed > 2) race.events.push({ type: "lead", marble: lead.id });
        race.leader = lead.id;
      }
      const allDone = race.finishOrder.length === race.marbles.length;
      const graceOver = race.winnerTime !== null && elapsed - race.winnerTime > FINISH_GRACE;
      if (allDone || graceOver || elapsed > RACE_LIMIT) {
        race.state = "finished";
        race.endTime = elapsed;
        race.events.push({ type: "end" });
      }
    }
    return race.events;
  }

  const api = {
    R, W, DT, MARBLES, MODULE_TYPES, MODULE_LABELS, WORLDS,
    createRng, buildCourse, createRace, startCountdown, update, standings,
    projectProgress, collide, floorBelow, makeFrame, pointAt, LAVA_DEPTH, CAVE_HEIGHT
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MarbleRace = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
