(() => {
  "use strict";

  // ---------- config ----------
  const TILE = 34;
  const ENEMY_MOVE_MS = 450;
  const PLAYER_MOVE_MS = 130;
  const INVULN_MS = 1200;

  // room-grid layout: the map is a grid of "slots", each slot hosts one
  // rectangular room. Rooms are connected to their N/S/E/W neighbours
  // through short corridors so that "kamers grenzen aan elkaar".
  const RG_COLS = 4;
  const RG_ROWS = 3;
  const SLOT_W = 7; // interior tile width of a slot
  const SLOT_H = 6; // interior tile height of a slot
  const EXTRA_CONNECTION_CHANCE = 0.4; // chance a non-tree edge also gets a doorway (loops, extra exits)

  const COLS = RG_COLS * (SLOT_W + 1) + 1;
  const ROWS = RG_ROWS * (SLOT_H + 1) + 1;

  const WALL = 0;
  const FLOOR = 1;

  const DIRS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  const GEM_TYPES = [
    { name: "gem_blue", value: 10, weight: 30 },
    { name: "gem_green", value: 15, weight: 25 },
    { name: "gem_orange", value: 20, weight: 20 },
    { name: "gem_red", value: 25, weight: 15 },
    { name: "gem_white", value: 35, weight: 7 },
    { name: "gem_pink", value: 50, weight: 3 },
  ];

  const FLOOR_VARIANTS = [
    { name: "floor_plain", weight: 40 },
    { name: "floor_pebbles", weight: 20 },
    { name: "floor_rocks", weight: 15 },
    { name: "floor_grass", weight: 12 },
    { name: "floor_cracked1", weight: 6 },
    { name: "floor_cracked2", weight: 6 },
    { name: "floor_skull", weight: 1 },
  ];

  const DECOR_PROPS = ["torch", "skull", "bone", "rock_small", "rock_big", "grass"];

  const SPRITE_NAMES = [
    "hero_down", "hero_left", "hero_up", "hero_right",
    "hero_down_walk", "hero_left_walk", "hero_up_walk", "hero_right_walk",
    "devil_down", "devil_left", "devil_up", "devil_right",
    "devil_down_walk", "devil_left_walk", "devil_up_walk", "devil_right_walk",
    "gem_blue", "gem_green", "gem_red", "gem_orange", "gem_white", "gem_pink",
    "wall_block",
    "floor_plain", "floor_pebbles", "floor_rocks", "floor_grass",
    "floor_cracked1", "floor_cracked2", "floor_skull",
    "door", "key", "rock_small", "rock_big", "bone", "skull", "torch", "grass",
  ];

  // sprites live in the original maze's assets, no need to duplicate them
  const SPRITE_BASE = "../maze/sprites/";

  // ---------- helpers ----------
  function pickWeighted(list) {
    const total = list.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of list) {
      if (r < item.weight) return item;
      r -= item.weight;
    }
    return list[list.length - 1];
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function key2(x, y) { return `${x},${y}`; }

  // ---------- asset loading ----------
  const images = {};
  function loadImages(names) {
    return Promise.all(
      names.map(
        (name) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = `${SPRITE_BASE}${name}.png`;
            images[name] = img;
          })
      )
    );
  }

  // ---------- room-based maze generation ----------
  function slotX0(rx) { return 1 + rx * (SLOT_W + 1); }
  function slotX1(rx) { return slotX0(rx) + SLOT_W - 1; }
  function slotY0(ry) { return 1 + ry * (SLOT_H + 1); }
  function slotY1(ry) { return slotY0(ry) + SLOT_H - 1; }
  function centerCol(rx) { return slotX0(rx) + Math.floor((SLOT_W - 1) / 2); }
  function centerRow(ry) { return slotY0(ry) + Math.floor((SLOT_H - 1) / 2); }

  // a room is a fairly open rectangle, randomly sized, but always
  // containing its slot's center row/column so neighbouring rooms can
  // always be joined by a straight corridor at that row/column.
  function makeRoomRect(rx, ry) {
    const sx0 = slotX0(rx), sx1 = slotX1(rx);
    const sy0 = slotY0(ry), sy1 = slotY1(ry);
    const cc = centerCol(rx), cr = centerRow(ry);

    const w = 3 + Math.floor(Math.random() * 3); // 3..5
    const h = 3 + Math.floor(Math.random() * 2); // 3..4

    let x0 = cc - Math.floor(Math.random() * w);
    x0 = Math.max(sx0, Math.min(x0, sx1 - w + 1));
    let x1 = Math.min(sx1, x0 + w - 1);
    if (cc < x0) x0 = cc;
    if (cc > x1) x1 = cc;

    let y0 = cr - Math.floor(Math.random() * h);
    y0 = Math.max(sy0, Math.min(y0, sy1 - h + 1));
    let y1 = Math.min(sy1, y0 + h - 1);
    if (cr < y0) y0 = cr;
    if (cr > y1) y1 = cr;

    return { x0, y0, x1, y1, rx, ry, exits: [] };
  }

  function generateMaze() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));

    const rooms = [];
    for (let ry = 0; ry < RG_ROWS; ry++) {
      const row = [];
      for (let rx = 0; rx < RG_COLS; rx++) row.push(makeRoomRect(rx, ry));
      rooms.push(row);
    }

    for (const row of rooms) {
      for (const r of row) {
        for (let y = r.y0; y <= r.y1; y++) {
          for (let x = r.x0; x <= r.x1; x++) grid[y][x] = FLOOR;
        }
      }
    }

    // union-find over the room grid, to guarantee full connectivity
    const n = RG_COLS * RG_ROWS;
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function union(a, b) { const ra = find(a), rb = find(b); if (ra === rb) return false; parent[ra] = rb; return true; }
    function idOf(rx, ry) { return ry * RG_COLS + rx; }

    const edges = [];
    for (let ry = 0; ry < RG_ROWS; ry++) {
      for (let rx = 0; rx < RG_COLS; rx++) {
        if (rx < RG_COLS - 1) edges.push({ a: { rx, ry }, b: { rx: rx + 1, ry }, axis: "h" });
        if (ry < RG_ROWS - 1) edges.push({ a: { rx, ry }, b: { rx, ry: ry + 1 }, axis: "v" });
      }
    }
    shuffle(edges);

    const connections = [];
    const leftover = [];
    for (const e of edges) {
      if (union(idOf(e.a.rx, e.a.ry), idOf(e.b.rx, e.b.ry))) connections.push(e);
      else leftover.push(e);
    }

    // a handful of extra doorways: loops and rooms with more than one exit
    shuffle(leftover);
    const extraCount = Math.floor(leftover.length * EXTRA_CONNECTION_CHANCE);
    for (let i = 0; i < extraCount; i++) connections.push(leftover[i]);

    for (const e of connections) {
      const roomA = rooms[e.a.ry][e.a.rx];
      const roomB = rooms[e.b.ry][e.b.rx];
      if (e.axis === "h") {
        const row = centerRow(e.a.ry);
        for (let x = roomA.x1 + 1; x <= roomB.x0 - 1; x++) grid[row][x] = FLOOR;
        roomA.exits.push("east");
        roomB.exits.push("west");
      } else {
        const col = centerCol(e.a.rx);
        for (let y = roomA.y1 + 1; y <= roomB.y0 - 1; y++) grid[y][col] = FLOOR;
        roomA.exits.push("south");
        roomB.exits.push("north");
      }
    }

    const start = { x: centerCol(0), y: centerRow(0) };
    return { grid, start };
  }

  function bfs(grid, sx, sy) {
    const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    dist[sy][sx] = 0;
    const queue = [[sx, sy]];
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      for (const d of Object.values(DIRS)) {
        const nx = cx + d.dx;
        const ny = cy + d.dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (grid[ny][nx] !== FLOOR) continue;
        if (dist[ny][nx] !== -1) continue;
        dist[ny][nx] = dist[cy][cx] + 1;
        queue.push([nx, ny]);
      }
    }
    return dist;
  }

  // ---------- game state ----------
  let canvas, ctx;
  let grid, floorVariant, decor;
  let start, door, keyItem, gems, enemies;
  let player;
  let score = 0, lives = 3, level = 1;
  let gameOver = false, won = false;
  let lastEnemyTick = 0;
  let usedCells;

  function farthestCell(dist) {
    let best = { x: 1, y: 1, d: -1 };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (dist[y][x] > best.d) best = { x, y, d: dist[y][x] };
      }
    }
    return best;
  }

  function floorCells(dist, minDist = 0) {
    const cells = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (dist[y][x] >= minDist) cells.push({ x, y, d: dist[y][x] });
      }
    }
    return cells;
  }

  function claim(x, y) {
    usedCells.add(key2(x, y));
  }
  function isFree(x, y) {
    return !usedCells.has(key2(x, y));
  }

  function newLevel(carryScore) {
    const generated = generateMaze();
    grid = generated.grid;
    start = generated.start;
    usedCells = new Set();
    claim(start.x, start.y);

    const dist = bfs(grid, start.x, start.y);
    const far = farthestCell(dist);
    door = { x: far.x, y: far.y, locked: true };
    claim(door.x, door.y);

    // key: somewhere between 40%-75% of max distance from start
    const candidates = floorCells(dist, Math.floor(far.d * 0.4)).filter(
      (c) => c.d <= far.d * 0.8 && isFree(c.x, c.y)
    );
    const keyCell = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : { x: start.x, y: start.y };
    keyItem = { x: keyCell.x, y: keyCell.y, collected: false };
    claim(keyItem.x, keyItem.y);

    // floor texture + decorations per cell
    floorVariant = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    decor = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] === FLOOR) {
          floorVariant[y][x] = pickWeighted(FLOOR_VARIANTS).name;
        }
      }
    }
    const allFloor = floorCells(dist).filter((c) => isFree(c.x, c.y));
    shuffle(allFloor);
    const decorCount = Math.min(30, allFloor.length);
    for (let i = 0; i < decorCount; i++) {
      const c = allFloor[i];
      decor[c.y][c.x] = DECOR_PROPS[Math.floor(Math.random() * DECOR_PROPS.length)];
    }

    // gems (diamanten), spread across the rooms
    gems = [];
    const gemCandidates = allFloor.slice(decorCount, decorCount + 70);
    const gemCount = Math.min(18 + level * 2, gemCandidates.length);
    for (let i = 0; i < gemCount; i++) {
      const c = gemCandidates[i];
      const type = pickWeighted(GEM_TYPES);
      gems.push({ x: c.x, y: c.y, type: type.name, value: type.value, collected: false });
      claim(c.x, c.y);
    }

    // devils: spawn reasonably far from the player
    enemies = [];
    const enemySpots = floorCells(dist, Math.floor(far.d * 0.3)).filter((c) => isFree(c.x, c.y));
    shuffle(enemySpots);
    const enemyCount = Math.min(3 + level, 10, enemySpots.length);
    for (let i = 0; i < enemyCount; i++) {
      const c = enemySpots[i];
      enemies.push({
        x: c.x, y: c.y,
        px: c.x * TILE, py: c.y * TILE,
        facing: "down", moving: false, moveStart: 0, from: { x: c.x, y: c.y },
      });
    }

    player = {
      x: start.x, y: start.y,
      px: start.x * TILE, py: start.y * TILE,
      facing: "down", moving: false, moveStart: 0, from: { x: start.x, y: start.y },
      invulnUntil: 0,
      hasKey: false,
    };

    score = carryScore ?? score;
    gameOver = false;
    won = false;
    hideOverlay();
    updateHud();

    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
  }

  // ---------- rendering ----------
  function drawSprite(name, cx, cy, opts = {}) {
    const img = images[name];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const fit = opts.fit || "contain-bottom";
    const scale = opts.scale || 1;
    if (fit === "cover") {
      ctx.drawImage(img, cx, cy, TILE, TILE);
      return;
    }
    const targetW = TILE * scale;
    const ratio = img.naturalHeight / img.naturalWidth;
    const w = targetW;
    const h = targetW * ratio;
    const dx = cx + (TILE - w) / 2;
    let dy;
    if (fit === "contain-bottom") dy = cy + TILE - h;
    else dy = cy + (TILE - h) / 2;
    ctx.drawImage(img, dx, dy, w, h);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // floor + walls
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cx = x * TILE, cy = y * TILE;
        if (grid[y][x] === FLOOR) {
          drawSprite(floorVariant[y][x], cx, cy, { fit: "cover" });
        } else {
          drawSprite("wall_block", cx, cy, { fit: "cover" });
        }
      }
    }

    // decorations (flush on floor, no bottom anchor needed for small props)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (decor[y][x]) {
          drawSprite(decor[y][x], x * TILE, y * TILE, { fit: "contain-center", scale: 0.7 });
        }
      }
    }

    // key + door
    if (!keyItem.collected) drawSprite("key", keyItem.x * TILE, keyItem.y * TILE, { scale: 0.7 });
    drawSprite("door", door.x * TILE, door.y * TILE, { scale: 0.95 });

    // gems
    for (const g of gems) {
      if (!g.collected) drawSprite(g.type, g.x * TILE, g.y * TILE, { scale: 0.65 });
    }

    // entities sorted by row for pseudo depth
    const entities = [
      ...enemies.map((e) => ({ ...e, kind: "devil" })),
      { ...player, kind: "hero" },
    ].sort((a, b) => a.py - b.py);

    for (const e of entities) {
      const walkFrame = e.moving && Math.floor(performance.now() / 150) % 2 === 0 ? "_walk" : "";
      const blink = e.kind === "hero" && player.invulnUntil > performance.now() && Math.floor(performance.now() / 100) % 2 === 0;
      if (blink) continue;
      const sprite = `${e.kind === "hero" ? "hero" : "devil"}_${e.facing}${walkFrame}`;
      drawSpritePixel(sprite, e.px, e.py);
    }
  }

  function drawSpritePixel(name, px, py) {
    const img = images[name];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const w = TILE;
    const ratio = img.naturalHeight / img.naturalWidth;
    const h = w * ratio;
    const dx = px;
    const dy = py + TILE - h;
    ctx.drawImage(img, dx, dy, w, h);
  }

  // ---------- movement ----------
  function tryMove(entity, dir) {
    if (entity.moving) return false;
    const d = DIRS[dir];
    const nx = entity.x + d.dx;
    const ny = entity.y + d.dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false;
    if (grid[ny][nx] !== FLOOR) return false;
    entity.facing = dir;
    entity.from = { x: entity.x, y: entity.y };
    entity.x = nx;
    entity.y = ny;
    entity.moving = true;
    entity.moveStart = performance.now();
    return true;
  }

  function updateMovement(entity, durationMs, now) {
    if (!entity.moving) return;
    const t = Math.min(1, (now - entity.moveStart) / durationMs);
    entity.px = entity.from.x * TILE + (entity.x - entity.from.x) * TILE * t;
    entity.py = entity.from.y * TILE + (entity.y - entity.from.y) * TILE * t;
    if (t >= 1) {
      entity.moving = false;
      entity.px = entity.x * TILE;
      entity.py = entity.y * TILE;
    }
  }

  function enemyStep(enemy) {
    const dist = bfs(grid, player.x, player.y);
    const d = dist[enemy.y][enemy.x];
    let dir = null;
    if (d !== -1 && d <= 9 && Math.random() < 0.7) {
      // step toward player: find neighbor with smaller distance
      let best = null, bestD = d;
      for (const [name, vec] of Object.entries(DIRS)) {
        const nx = enemy.x + vec.dx, ny = enemy.y + vec.dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (grid[ny][nx] !== FLOOR) continue;
        if (dist[ny][nx] !== -1 && dist[ny][nx] < bestD) {
          bestD = dist[ny][nx];
          best = name;
        }
      }
      dir = best;
    }
    if (!dir) {
      const options = Object.keys(DIRS).filter((name) => {
        const vec = DIRS[name];
        const nx = enemy.x + vec.dx, ny = enemy.y + vec.dy;
        return nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grid[ny][nx] === FLOOR;
      });
      if (options.length) dir = options[Math.floor(Math.random() * options.length)];
    }
    if (dir) tryMove(enemy, dir);
  }

  function checkCollisions() {
    if (!keyItem.collected && player.x === keyItem.x && player.y === keyItem.y) {
      keyItem.collected = true;
      player.hasKey = true;
      updateHud();
    }
    for (const g of gems) {
      if (!g.collected && player.x === g.x && player.y === g.y) {
        g.collected = true;
        score += g.value;
        updateHud();
      }
    }
    if (player.x === door.x && player.y === door.y) {
      if (player.hasKey) {
        won = true;
        showOverlay("Level voltooid!", `Je hebt de deur bereikt met ${score} punten.`, "Volgende level");
      }
    }
    if (player.invulnUntil <= performance.now()) {
      for (const e of enemies) {
        if (e.x === player.x && e.y === player.y) {
          hitPlayer();
          break;
        }
      }
    }
  }

  function hitPlayer() {
    lives -= 1;
    player.invulnUntil = performance.now() + INVULN_MS;
    updateHud();
    if (lives <= 0) {
      gameOver = true;
      showOverlay("Game Over", `Je werd gepakt door een duivel. Score: ${score}`, "Opnieuw beginnen");
    } else {
      player.x = start.x;
      player.y = start.y;
      player.px = start.x * TILE;
      player.py = start.y * TILE;
      player.moving = false;
    }
  }

  // ---------- hud / overlay ----------
  function updateHud() {
    document.getElementById("stat-score").textContent = `⭐ ${score}`;
    document.getElementById("key-state").textContent = player && player.hasKey ? "✔" : "?";
    document.getElementById("lives-state").textContent = String(Math.max(0, lives));
    document.getElementById("stat-level").textContent = `🏰 ${level}`;
  }

  function showOverlay(title, text, btnLabel) {
    document.getElementById("overlay-title").textContent = title;
    document.getElementById("overlay-text").textContent = text;
    document.getElementById("overlay-btn").textContent = btnLabel;
    document.getElementById("overlay").classList.remove("hidden");
  }
  function hideOverlay() {
    document.getElementById("overlay").classList.add("hidden");
  }

  // ---------- input ----------
  const KEY_DIR = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };
  let queuedDir = null;

  function handleDir(dir) {
    if (gameOver || won) return;
    queuedDir = dir;
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        handleDir(dir);
      }
    });
    for (const btn of document.querySelectorAll("#dpad button")) {
      const dir = btn.dataset.dir;
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); handleDir(dir); }, { passive: false });
      btn.addEventListener("mousedown", () => handleDir(dir));
    }
    document.getElementById("btn-new").addEventListener("click", () => {
      level = 1;
      score = 0;
      lives = 3;
      newLevel(0);
    });
    document.getElementById("overlay-btn").addEventListener("click", () => {
      if (won) {
        level += 1;
        newLevel(score);
      } else {
        level = 1;
        score = 0;
        lives = 3;
        newLevel(0);
      }
    });
  }

  // ---------- main loop ----------
  function loop(now) {
    if (!gameOver && !won) {
      if (queuedDir && !player.moving) {
        tryMove(player, queuedDir);
        queuedDir = null;
      }
      updateMovement(player, PLAYER_MOVE_MS, now);
      for (const e of enemies) updateMovement(e, ENEMY_MOVE_MS * 0.9, now);

      if (now - lastEnemyTick > ENEMY_MOVE_MS) {
        lastEnemyTick = now;
        for (const e of enemies) {
          if (!e.moving) enemyStep(e);
        }
      }
      checkCollisions();
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---------- boot ----------
  async function main() {
    canvas = document.getElementById("canvas");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    setupInput();
    await loadImages(SPRITE_NAMES);
    newLevel(0);
    requestAnimationFrame(loop);
  }

  main();
})();
