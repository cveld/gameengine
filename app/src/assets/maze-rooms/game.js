(() => {
  "use strict";

  // ---------- config ----------
  const TILE = 40;
  const ENEMY_MOVE_MS = 450;
  const PLAYER_MOVE_MS = 130;
  const INVULN_MS = 1200;

  // each room fills the whole screen; walking off the edge of the screen
  // through an exit takes you to the neighbouring room in that direction.
  const COLS = 19; // tiles per room, full screen width
  const ROWS = 13; // tiles per room, full screen height
  const RG_COLS = 4; // rooms across the world
  const RG_ROWS = 3; // rooms down the world
  const DOOR_WIDTH = 3; // width (in tiles) of an exit opening
  const EXTRA_CONNECTION_CHANCE = 0.4; // chance a non-tree edge also becomes an exit (loops, extra exits)

  const WALL = 0;
  const FLOOR = 1;

  // 4-directional: used for enemy pathing/AI, which only has 4-way sprites
  const DIRS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  // the player can also move diagonally; these are only looked up by
  // tryMove(), never fed into bfs()/enemyStep() which stay 4-directional
  const DIAGONAL_DIRS = {
    "up-left": { dx: -1, dy: -1 },
    "up-right": { dx: 1, dy: -1 },
    "down-left": { dx: -1, dy: 1 },
    "down-right": { dx: 1, dy: 1 },
  };
  const ALL_DIRS = { ...DIRS, ...DIAGONAL_DIRS };

  // the sprite sheet only has down/left/up/right poses, so a diagonal move
  // faces (and animates) as a horizontal run in the matching direction
  const DIAGONAL_FACING = {
    "up-left": "left", "down-left": "left",
    "up-right": "right", "down-right": "right",
  };

  // the source sheet's "walk" row is 4 frames of a rightward run cycle;
  // mirror them for left, and fall back to the static pose for up/down.
  const HERO_RUN_FRAMES = ["hero_run0", "hero_run1", "hero_run2", "hero_run3"];
  const HERO_RUN_FRAME_MS = 110;

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
    "hero_run0", "hero_run1", "hero_run2", "hero_run3",
    "devil_down", "devil_left", "devil_up", "devil_right",
    "devil_down_walk", "devil_left_walk", "devil_up_walk", "devil_right_walk",
    "gem_blue", "gem_green", "gem_red", "gem_orange", "gem_white", "gem_pink",
    "wall_fill",
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

  function randInt(minInclusive, maxInclusive) {
    return minInclusive + Math.floor(Math.random() * (maxInclusive - minInclusive + 1));
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

  // ---------- room-graph (which rooms connect to which, and where) ----------
  function buildRoomGraph() {
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

    // exits[ry][rx] = { north, south, east, west }, each either null or a
    // [start, end] tile range on that wall where the room is open.
    const exits = Array.from({ length: RG_ROWS }, () =>
      Array.from({ length: RG_COLS }, () => ({ north: null, south: null, east: null, west: null }))
    );

    for (const e of connections) {
      if (e.axis === "h") {
        const rowStart = randInt(1, ROWS - 1 - DOOR_WIDTH);
        const range = [rowStart, rowStart + DOOR_WIDTH - 1];
        exits[e.a.ry][e.a.rx].east = range;
        exits[e.b.ry][e.b.rx].west = range;
      } else {
        const colStart = randInt(1, COLS - 1 - DOOR_WIDTH);
        const range = [colStart, colStart + DOOR_WIDTH - 1];
        exits[e.a.ry][e.a.rx].south = range;
        exits[e.b.ry][e.b.rx].north = range;
      }
    }

    return { exits, connections };
  }

  function roomGraphBFS(sx, sy, connections) {
    const adj = new Map();
    function addAdj(a, b) {
      const ka = key2(a.rx, a.ry), kb = key2(b.rx, b.ry);
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka).push(b);
      adj.get(kb).push(a);
    }
    for (const e of connections) addAdj(e.a, e.b);

    const dist = Array.from({ length: RG_ROWS }, () => Array(RG_COLS).fill(-1));
    dist[sy][sx] = 0;
    const queue = [[sx, sy]];
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      const neighbours = adj.get(key2(cx, cy)) || [];
      for (const nb of neighbours) {
        if (dist[nb.ry][nb.rx] === -1) {
          dist[nb.ry][nb.rx] = dist[cy][cx] + 1;
          queue.push([nb.rx, nb.ry]);
        }
      }
    }
    return dist;
  }

  // ---------- a single room's tile grid ----------
  function buildRoomGrid(roomExits) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));
    for (let y = 1; y <= ROWS - 2; y++) {
      for (let x = 1; x <= COLS - 2; x++) grid[y][x] = FLOOR;
    }
    if (roomExits.north) { const [c0, c1] = roomExits.north; for (let x = c0; x <= c1; x++) grid[0][x] = FLOOR; }
    if (roomExits.south) { const [c0, c1] = roomExits.south; for (let x = c0; x <= c1; x++) grid[ROWS - 1][x] = FLOOR; }
    if (roomExits.west) { const [r0, r1] = roomExits.west; for (let y = r0; y <= r1; y++) grid[y][0] = FLOOR; }
    if (roomExits.east) { const [r0, r1] = roomExits.east; for (let y = r0; y <= r1; y++) grid[y][COLS - 1] = FLOOR; }
    return grid;
  }

  // ---------- full world generation ----------
  function generateWorld() {
    const { exits, connections } = buildRoomGraph();

    const rooms = [];
    for (let ry = 0; ry < RG_ROWS; ry++) {
      const row = [];
      for (let rx = 0; rx < RG_COLS; rx++) {
        const grid = buildRoomGrid(exits[ry][rx]);
        const floorVariant = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        const decor = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            if (grid[y][x] === FLOOR) floorVariant[y][x] = pickWeighted(FLOOR_VARIANTS).name;
          }
        }
        row.push({
          rx, ry, grid, floorVariant, decor, exits: exits[ry][rx],
          gems: [], devils: [],
          hasDoor: false, doorPos: null,
          hasKey: false, keyPos: null, keyCollected: false,
          usedTiles: new Set(),
        });
      }
      rooms.push(row);
    }

    function claimTile(room, x, y) { room.usedTiles.add(key2(x, y)); }
    function interiorCandidates(room) {
      const list = [];
      for (let y = 1; y <= ROWS - 2; y++) {
        for (let x = 1; x <= COLS - 2; x++) {
          if (!room.usedTiles.has(key2(x, y))) list.push({ x, y });
        }
      }
      return list;
    }

    const startPos = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
    const startRoom = rooms[0][0];
    claimTile(startRoom, startPos.x, startPos.y);

    const roomDist = roomGraphBFS(0, 0, connections);
    let maxDist = 0, doorRoomCoord = { rx: 0, ry: 0 };
    for (let ry = 0; ry < RG_ROWS; ry++) {
      for (let rx = 0; rx < RG_COLS; rx++) {
        if (roomDist[ry][rx] > maxDist) { maxDist = roomDist[ry][rx]; doorRoomCoord = { rx, ry }; }
      }
    }

    const doorRoom = rooms[doorRoomCoord.ry][doorRoomCoord.rx];
    {
      const cands = interiorCandidates(doorRoom);
      const c = cands.length ? cands[Math.floor(Math.random() * cands.length)] : startPos;
      doorRoom.hasDoor = true;
      doorRoom.doorPos = { x: c.x, y: c.y };
      claimTile(doorRoom, c.x, c.y);
    }

    // key: in a room roughly 40%-80% of the way to the door, so it can't
    // be grabbed on the way in without exploring.
    const keyRoomCandidates = [];
    for (let ry = 0; ry < RG_ROWS; ry++) {
      for (let rx = 0; rx < RG_COLS; rx++) {
        if (rx === doorRoomCoord.rx && ry === doorRoomCoord.ry) continue;
        const d = roomDist[ry][rx];
        if (d >= Math.ceil(maxDist * 0.4) && d <= Math.ceil(maxDist * 0.8)) keyRoomCandidates.push(rooms[ry][rx]);
      }
    }
    const keyRoom = keyRoomCandidates.length
      ? keyRoomCandidates[Math.floor(Math.random() * keyRoomCandidates.length)]
      : startRoom;
    {
      const cands = interiorCandidates(keyRoom);
      const c = cands.length ? cands[Math.floor(Math.random() * cands.length)] : startPos;
      keyRoom.hasKey = true;
      keyRoom.keyPos = { x: c.x, y: c.y };
      claimTile(keyRoom, c.x, c.y);
    }

    for (let ry = 0; ry < RG_ROWS; ry++) {
      for (let rx = 0; rx < RG_COLS; rx++) {
        const room = rooms[ry][rx];
        const isStart = rx === 0 && ry === 0;

        const cands = interiorCandidates(room);
        shuffle(cands);

        const decorCount = Math.min(10, cands.length);
        const decorSlice = cands.slice(0, decorCount);
        for (const c of decorSlice) room.decor[c.y][c.x] = DECOR_PROPS[Math.floor(Math.random() * DECOR_PROPS.length)];

        const rest = cands.slice(decorCount);
        const gemCount = Math.min(randInt(2, 5), rest.length);
        const gemSlice = rest.slice(0, gemCount);
        for (const c of gemSlice) {
          const type = pickWeighted(GEM_TYPES);
          room.gems.push({ x: c.x, y: c.y, type: type.name, value: type.value, collected: false });
        }

        const rest2 = rest.slice(gemCount);
        const devilBase = isStart ? 0 : Math.min(4, 1 + Math.floor(roomDist[ry][rx] / 2));
        const devilCount = Math.min(devilBase, rest2.length);
        const devilSlice = rest2.slice(0, devilCount);
        for (const c of devilSlice) {
          room.devils.push({
            x: c.x, y: c.y,
            px: c.x * TILE, py: c.y * TILE,
            facing: "down", moving: false, moveStart: 0, from: { x: c.x, y: c.y },
          });
        }
      }
    }

    return { rooms, connections, doorRoomCoord, startPos };
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
  let world, activeRoom, curRx, curRy;
  let player;
  let score = 0, lives = 3, level = 1;
  let gameOver = false, won = false;
  let lastEnemyTick = 0;

  function newLevel(carryScore) {
    world = generateWorld();
    curRx = 0;
    curRy = 0;
    activeRoom = world.rooms[curRy][curRx];

    player = {
      x: world.startPos.x, y: world.startPos.y,
      px: world.startPos.x * TILE, py: world.startPos.y * TILE,
      facing: "down", moving: false, moveStart: 0, from: { x: world.startPos.x, y: world.startPos.y },
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
    const room = activeRoom;

    // floor + walls
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cx = x * TILE, cy = y * TILE;
        if (room.grid[y][x] === FLOOR) {
          drawSprite(room.floorVariant[y][x], cx, cy, { fit: "cover" });
        } else {
          drawSprite("wall_fill", cx, cy, { fit: "cover" });
        }
      }
    }

    // decorations
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (room.decor[y][x]) {
          drawSprite(room.decor[y][x], x * TILE, y * TILE, { fit: "contain-center", scale: 0.7 });
        }
      }
    }

    // key + door
    if (room.hasKey && !room.keyCollected) drawSprite("key", room.keyPos.x * TILE, room.keyPos.y * TILE, { scale: 0.7 });
    if (room.hasDoor) drawSprite("door", room.doorPos.x * TILE, room.doorPos.y * TILE, { scale: 0.95 });

    // gems
    for (const g of room.gems) {
      if (!g.collected) drawSprite(g.type, g.x * TILE, g.y * TILE, { scale: 0.65 });
    }

    // entities sorted by row for pseudo depth
    const entities = [
      ...room.devils.map((e) => ({ ...e, kind: "devil" })),
      { ...player, kind: "hero" },
    ].sort((a, b) => a.py - b.py);

    for (const e of entities) {
      const blink = e.kind === "hero" && player.invulnUntil > performance.now() && Math.floor(performance.now() / 100) % 2 === 0;
      if (blink) continue;
      if (e.kind === "hero") {
        drawHero(e);
      } else {
        // devils have a walk-cycle frame; the hero sprite sheet only has static poses
        const walkFrame = e.moving && Math.floor(performance.now() / 150) % 2 === 0 ? "_walk" : "";
        drawSpritePixel(`devil_${e.facing}${walkFrame}`, e.px, e.py);
      }
    }
  }

  function drawHero(e) {
    if (e.moving && (e.facing === "left" || e.facing === "right")) {
      const frame = HERO_RUN_FRAMES[Math.floor(performance.now() / HERO_RUN_FRAME_MS) % HERO_RUN_FRAMES.length];
      drawSpritePixel(frame, e.px, e.py, e.facing === "left");
    } else {
      drawSpritePixel(`hero_${e.facing}`, e.px, e.py);
    }
  }

  function drawSpritePixel(name, px, py, mirror = false) {
    const img = images[name];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const w = TILE;
    const ratio = img.naturalHeight / img.naturalWidth;
    const h = w * ratio;
    const dy = py + TILE - h;
    if (mirror) {
      ctx.save();
      ctx.translate(px + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, px, dy, w, h);
    }
  }

  // ---------- movement ----------
  function tryMove(entity, dir) {
    if (entity.moving) return false;
    const d = ALL_DIRS[dir];
    if (!d) return false;
    const nx = entity.x + d.dx;
    const ny = entity.y + d.dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false;
    if (activeRoom.grid[ny][nx] !== FLOOR) return false;
    if (d.dx !== 0 && d.dy !== 0) {
      // don't let a diagonal move cut through a solid corner
      const orthoBlocked = activeRoom.grid[entity.y][nx] !== FLOOR && activeRoom.grid[ny][entity.x] !== FLOOR;
      if (orthoBlocked) return false;
    }
    entity.facing = DIAGONAL_FACING[dir] || dir;
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
    const dist = bfs(activeRoom.grid, player.x, player.y);
    const d = dist[enemy.y][enemy.x];
    let dir = null;
    if (d !== -1 && d <= 9 && Math.random() < 0.7) {
      let best = null, bestD = d;
      for (const [name, vec] of Object.entries(DIRS)) {
        const nx = enemy.x + vec.dx, ny = enemy.y + vec.dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (activeRoom.grid[ny][nx] !== FLOOR) continue;
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
        return nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && activeRoom.grid[ny][nx] === FLOOR;
      });
      if (options.length) dir = options[Math.floor(Math.random() * options.length)];
    }
    if (dir) tryMove(enemy, dir);
  }

  // ---------- room transitions ----------
  function transitionRoom() {
    let dir = null;
    if (player.x === COLS - 1) dir = "east";
    else if (player.x === 0) dir = "west";
    else if (player.y === ROWS - 1) dir = "south";
    else if (player.y === 0) dir = "north";
    if (!dir) return;

    let nrx = curRx, nry = curRy;
    if (dir === "east") nrx++;
    else if (dir === "west") nrx--;
    else if (dir === "south") nry++;
    else nry--;
    if (nrx < 0 || nrx >= RG_COLS || nry < 0 || nry >= RG_ROWS) return;

    curRx = nrx;
    curRy = nry;
    activeRoom = world.rooms[curRy][curRx];

    if (dir === "east") player.x = 1;
    else if (dir === "west") player.x = COLS - 2;
    else if (dir === "south") player.y = 1;
    else player.y = ROWS - 2;

    player.px = player.x * TILE;
    player.py = player.y * TILE;
    player.moving = false;
    updateHud();
  }

  function checkCollisions() {
    const room = activeRoom;
    if (room.hasKey && !room.keyCollected && player.x === room.keyPos.x && player.y === room.keyPos.y) {
      room.keyCollected = true;
      player.hasKey = true;
      updateHud();
    }
    for (const g of room.gems) {
      if (!g.collected && player.x === g.x && player.y === g.y) {
        g.collected = true;
        score += g.value;
        updateHud();
      }
    }
    if (room.hasDoor && player.x === room.doorPos.x && player.y === room.doorPos.y && player.hasKey) {
      won = true;
      showOverlay("Level voltooid!", `Je hebt de deur bereikt met ${score} punten.`, "Volgende level");
    }
    if (player.invulnUntil <= performance.now()) {
      for (const e of room.devils) {
        if (e.x === player.x && e.y === player.y) {
          hitPlayer();
          break;
        }
      }
    }
    if (!player.moving && (player.x === 0 || player.x === COLS - 1 || player.y === 0 || player.y === ROWS - 1)) {
      transitionRoom();
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
      curRx = 0;
      curRy = 0;
      activeRoom = world.rooms[0][0];
      player.x = world.startPos.x;
      player.y = world.startPos.y;
      player.px = player.x * TILE;
      player.py = player.y * TILE;
      player.moving = false;
      updateHud();
    }
  }

  // ---------- hud / overlay ----------
  function updateHud() {
    document.getElementById("stat-score").textContent = `⭐ ${score}`;
    document.getElementById("key-state").textContent = player && player.hasKey ? "✔" : "?";
    document.getElementById("lives-state").textContent = String(Math.max(0, lives));
    document.getElementById("stat-level").textContent = `🏰 ${level}`;
    document.getElementById("stat-room").textContent = `📍 ${curRx + 1}/${RG_COLS}, ${curRy + 1}/${RG_ROWS}`;
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
  // held (not just pressed) so opposite/adjacent keys combine into diagonals
  const heldDirs = new Set();
  let touchDir = null;

  function keyboardDir() {
    const dy = (heldDirs.has("down") ? 1 : 0) - (heldDirs.has("up") ? 1 : 0);
    const dx = (heldDirs.has("right") ? 1 : 0) - (heldDirs.has("left") ? 1 : 0);
    if (dx === 0 && dy === 0) return null;
    if (dx === 0) return dy > 0 ? "down" : "up";
    if (dy === 0) return dx > 0 ? "right" : "left";
    return `${dy > 0 ? "down" : "up"}-${dx > 0 ? "right" : "left"}`;
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        heldDirs.add(dir);
      }
    });
    window.addEventListener("keyup", (e) => {
      const dir = KEY_DIR[e.key];
      if (dir) heldDirs.delete(dir);
    });
    window.addEventListener("blur", () => heldDirs.clear());
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
    document.getElementById("btn-help").addEventListener("click", () => {
      document.getElementById("help-overlay").classList.remove("hidden");
    });
    document.getElementById("help-close").addEventListener("click", () => {
      document.getElementById("help-overlay").classList.add("hidden");
    });
  }

  // ---------- fullscreen ----------
  function setupFullscreen() {
    const btn = document.getElementById("btn-fullscreen");
    const el = document.getElementById("game");
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!request || !exit) {
      btn.classList.add("hidden");
      return;
    }
    const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const updateLabel = () => {
      btn.title = isFullscreen() ? "Verlaat fullscreen" : "Fullscreen";
    };
    btn.addEventListener("click", () => {
      if (isFullscreen()) {
        exit.call(document);
      } else {
        const result = request.call(el);
        if (result && typeof result.catch === "function") result.catch(() => {});
      }
    });
    document.addEventListener("fullscreenchange", updateLabel);
    document.addEventListener("webkitfullscreenchange", updateLabel);
    updateLabel();
  }

  // Keep the HUD bar tied to the maze's actual on-screen top row (portrait)
  // or left column (landscape), so it sits inside that row/column instead
  // of overlapping into the gameplay area next to it. When the maze is
  // letterboxed on that axis (dead space above it, or to its left) park the
  // HUD there instead of squeezing into a strip that might be tiny.
  const HUD_MIN_PX = 30;
  const HUD_MAX_PX = 52;
  function setupHudSizing() {
    const hud = document.getElementById("hud");
    const stage = document.getElementById("stage");
    const btnNew = document.getElementById("btn-new");
    const landscapeMQ = window.matchMedia("(orientation: landscape)");
    const sync = () => {
      // canvas.getBoundingClientRect() is the element's full CSS box, not the
      // letterboxed content rect that object-fit: contain actually paints
      // into — work out the real visible maze rect ourselves so the HUD
      // lines up with it regardless of which way it's letterboxed.
      const box = canvas.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      if (box.height <= 0 || box.width <= 0) return;
      const contentAspect = canvas.width / canvas.height;
      const boxAspect = box.width / box.height;
      let contentW, contentH;
      if (boxAspect > contentAspect) {
        contentH = box.height;
        contentW = contentH * contentAspect;
      } else {
        contentW = box.width;
        contentH = contentW / contentAspect;
      }
      const contentLeft = box.left + (box.width - contentW) / 2;
      const contentTop = box.top + (box.height - contentH) / 2;
      const isVertical = landscapeMQ.matches;

      hud.classList.toggle("hud-vertical", isVertical);
      btnNew.textContent = isVertical ? "+" : "Nieuwe kamers";
      btnNew.title = isVertical ? "Nieuwe kamers" : "";

      if (isVertical) {
        const leftGap = contentLeft - box.left; // dead letterbox space left of the maze, if any
        hud.style.width = ""; // let .hud-vertical's width: var(--row) apply
        hud.style.top = `${contentTop - stageRect.top}px`;
        hud.style.height = `${contentH}px`;
        if (leftGap >= HUD_MIN_PX) {
          const colPx = Math.min(leftGap, HUD_MAX_PX);
          hud.style.left = `${contentLeft - stageRect.left - colPx}px`;
          hud.style.setProperty("--row", `${colPx}px`);
        } else {
          hud.style.left = `${contentLeft - stageRect.left}px`;
          hud.style.setProperty("--row", `${contentW / COLS}px`);
        }
      } else {
        const topGap = contentTop - box.top; // dead letterbox space above the maze, if any
        hud.style.height = ""; // let #hud's height: var(--row) apply
        hud.style.left = `${contentLeft - stageRect.left}px`;
        hud.style.width = `${contentW}px`;
        if (topGap >= HUD_MIN_PX) {
          const rowPx = Math.min(topGap, HUD_MAX_PX);
          hud.style.top = `${contentTop - stageRect.top - rowPx}px`;
          hud.style.setProperty("--row", `${rowPx}px`);
        } else {
          hud.style.top = `${contentTop - stageRect.top}px`;
          hud.style.setProperty("--row", `${contentH / ROWS}px`);
        }
      }
    };
    new ResizeObserver(sync).observe(canvas);
    landscapeMQ.addEventListener("change", sync);
    sync();
  }

  // touch/mouse-drag joystick: touch anywhere on the stage and drag toward
  // an edge to move that direction, for as long as the drag stays deflected.
  function setupJoystick() {
    const stage = document.getElementById("stage");
    const joystick = document.getElementById("joystick");
    const knob = document.getElementById("joystick-knob");
    const overlay = document.getElementById("overlay");
    const helpOverlay = document.getElementById("help-overlay");
    const MAX_RADIUS = 40;
    const DEAD_ZONE = 12;

    let activePointerId = null;
    let originX = 0, originY = 0;

    // snap the drag angle to one of 8 directions (4 cardinal + 4 diagonal)
    const OCTANT_DIRS = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"];
    function dirFromDelta(dx, dy) {
      if (Math.hypot(dx, dy) < DEAD_ZONE) return null;
      const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      return OCTANT_DIRS[((octant % 8) + 8) % 8];
    }

    stage.addEventListener("pointerdown", (e) => {
      if (activePointerId !== null) return;
      if (gameOver || won) return;
      if (!overlay.classList.contains("hidden") || !helpOverlay.classList.contains("hidden")) return;
      if (e.target.closest("#hud")) return;
      activePointerId = e.pointerId;
      const rect = stage.getBoundingClientRect();
      originX = e.clientX - rect.left;
      originY = e.clientY - rect.top;
      joystick.style.left = `${originX}px`;
      joystick.style.top = `${originY}px`;
      knob.style.transform = "translate(0, 0)";
      joystick.classList.remove("hidden");
      stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener("pointermove", (e) => {
      if (e.pointerId !== activePointerId) return;
      const rect = stage.getBoundingClientRect();
      const dx = e.clientX - rect.left - originX;
      const dy = e.clientY - rect.top - originY;
      const dist = Math.min(MAX_RADIUS, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
      touchDir = dirFromDelta(dx, dy);
    });

    function release(e) {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      touchDir = null;
      joystick.classList.add("hidden");
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
  }

  // ---------- main loop ----------
  function loop(now) {
    if (!gameOver && !won) {
      if (!player.moving) {
        const dir = keyboardDir() || touchDir;
        if (dir) tryMove(player, dir);
      }
      updateMovement(player, PLAYER_MOVE_MS, now);
      for (const e of activeRoom.devils) updateMovement(e, ENEMY_MOVE_MS * 0.9, now);

      if (now - lastEnemyTick > ENEMY_MOVE_MS) {
        lastEnemyTick = now;
        for (const e of activeRoom.devils) {
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
    setupFullscreen();
    setupJoystick();
    await loadImages(SPRITE_NAMES);
    newLevel(0);
    setupHudSizing(); // after newLevel() so canvas.width/height reflect the real maze size
    requestAnimationFrame(loop);
  }

  main();
})();
