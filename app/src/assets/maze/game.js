(() => {
  "use strict";

  // ---------- config ----------
  const TILE = 40;
  const COLS = 19; // must be odd
  const ROWS = 15; // must be odd
  const ENEMY_MOVE_MS = 450;
  const PLAYER_MOVE_MS = 130;
  const INVULN_MS = 1200;

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
    "wall_fill", "border_top", "border_bottom", "border_left", "border_right",
    "floor_plain", "floor_pebbles", "floor_rocks", "floor_grass",
    "floor_cracked1", "floor_cracked2", "floor_skull",
    "door", "key", "rock_small", "rock_big", "bone", "skull", "torch", "grass",
  ];

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
            img.src = `sprites/${name}.png`;
            images[name] = img;
          })
      )
    );
  }

  // ---------- maze generation ----------
  function generateMaze() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));

    function carve(cx, cy) {
      grid[cy][cx] = FLOOR;
      const dirs = shuffle(Object.values(DIRS));
      for (const d of dirs) {
        const nx = cx + d.dx * 2;
        const ny = cy + d.dy * 2;
        if (nx > 0 && nx < COLS - 1 && ny > 0 && ny < ROWS - 1 && grid[ny][nx] === WALL) {
          grid[cy + d.dy][cx + d.dx] = FLOOR;
          carve(nx, ny);
        }
      }
    }
    carve(1, 1);

    // knock down a handful of extra walls to create loops (easier escape routes)
    let extra = Math.floor((COLS * ROWS) * 0.02);
    let guard = 2000;
    while (extra > 0 && guard-- > 0) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (grid[y][x] === WALL) {
        const horizFloor = grid[y][x - 1] === FLOOR && grid[y][x + 1] === FLOOR;
        const vertFloor = grid[y - 1][x] === FLOOR && grid[y + 1][x] === FLOOR;
        if (horizFloor || vertFloor) {
          grid[y][x] = FLOOR;
          extra--;
        }
      }
    }
    return grid;
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
    grid = generateMaze();
    usedCells = new Set();
    start = { x: 1, y: 1 };
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
    const decorCount = Math.min(14, allFloor.length);
    for (let i = 0; i < decorCount; i++) {
      const c = allFloor[i];
      decor[c.y][c.x] = DECOR_PROPS[Math.floor(Math.random() * DECOR_PROPS.length)];
    }

    // gems
    gems = [];
    const gemCandidates = allFloor.slice(decorCount, decorCount + 40);
    const gemCount = Math.min(12 + level, gemCandidates.length);
    for (let i = 0; i < gemCount; i++) {
      const c = gemCandidates[i];
      const type = pickWeighted(GEM_TYPES);
      gems.push({ x: c.x, y: c.y, type: type.name, value: type.value, collected: false });
      claim(c.x, c.y);
    }

    // enemies: spawn reasonably far from player
    enemies = [];
    const enemySpots = floorCells(dist, Math.floor(far.d * 0.3)).filter((c) => isFree(c.x, c.y));
    shuffle(enemySpots);
    const enemyCount = Math.min(2 + level, 6, enemySpots.length);
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

  function drawEdge(name, cx, cy, side) {
    const img = images[name];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    if (side === "top" || side === "bottom") {
      const thickness = TILE * (img.naturalHeight / img.naturalWidth);
      const dy = side === "top" ? cy : cy + TILE - thickness;
      ctx.drawImage(img, cx, dy, TILE, thickness);
    } else {
      const thickness = TILE * (img.naturalWidth / img.naturalHeight);
      const dx = side === "left" ? cx : cx + TILE - thickness;
      ctx.drawImage(img, dx, cy, thickness, TILE);
    }
  }

  function drawWallCell(x, y, cx, cy) {
    drawSprite("wall_fill", cx, cy, { fit: "cover" });
    // draw a lit stone border only on edges that face an open path, so
    // walls read as a connected rock face hugging the corridors instead
    // of a repeating isolated block.
    if (y > 0 && grid[y - 1][x] === FLOOR) drawEdge("border_top", cx, cy, "top");
    if (y < ROWS - 1 && grid[y + 1][x] === FLOOR) drawEdge("border_bottom", cx, cy, "bottom");
    if (x > 0 && grid[y][x - 1] === FLOOR) drawEdge("border_left", cx, cy, "left");
    if (x < COLS - 1 && grid[y][x + 1] === FLOOR) drawEdge("border_right", cx, cy, "right");
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
          drawWallCell(x, y, cx, cy);
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
