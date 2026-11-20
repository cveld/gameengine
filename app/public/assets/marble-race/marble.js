// Marble Race: game flow, camera, HUD and results.
(function () {
  "use strict";

  const Race = window.MarbleRace;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  // "tv": this page is the Chromecast receiver (index.html?tv=1). It renders the race
  // and is controlled by phones through cast-receiver.js.
  const tv = root.classList.contains("tv");
  const canvas = $("scene");
  const renderer = window.MarbleRender.createRenderer(canvas, { lowPower: tv });
  if (!renderer) {
    $("fallback").hidden = false;
    $("lobby").hidden = true;
    return;
  }
  const sound = window.MarbleSound.createSound();
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const randomSeed = () => 1 + Math.floor(Math.random() * 9999);

  // While casting, the phone is a remote control: `remote` forwards commands to the TV
  // (set by cast.js) and the local simulation and renderer are paused.
  let remote = null;
  let tvPicks = [];              // marbles picked by the connected phones (TV only)
  const listeners = new Set();   // notified when something visible changes (TV only)
  function notify() { for (const fn of listeners) fn(); }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* storage unavailable */ }
  }

  const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(",")})`;
  const formatTime = t => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
  };
  const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
  function dot(marble) {
    const span = document.createElement("span");
    span.className = "dot";
    span.style.setProperty("--dot", css(marble.color));
    span.style.setProperty("--dot2", css(marble.accent));
    return span;
  }

  // ---------- state ----------
  const params = new URLSearchParams(window.location.search);
  let seed = parseInt(params.get("track"), 10);
  if (!(seed > 0)) seed = randomSeed();
  let world = Race.WORLDS[params.get("world")] ? params.get("world") : (Race.WORLDS[storageGet("marble-race:world")] ? storageGet("marble-race:world") : "meadow");
  let pick = Math.max(0, Math.min(Race.MARBLES.length - 1, parseInt(storageGet("marble-race:pick"), 10) || 0));
  let course, race;
  let phase = "lobby";
  let camMode = "leader";
  let followId = null;          // marble chosen by clicking the standings
  let timeScale = 1;
  let lastLeaderSection = -1;
  let winnerShownAt = null;
  const cam = { eye: [0, 10, -12], target: [0, 0, 0], yaw: 0, pitch: 0, zoom: 1, fov: 0.95, ready: false };
  const isMine = id => (tv ? tvPicks.includes(id) : id === pick);

  function newRace(newSeed, newWorld) {
    if (newSeed !== undefined) seed = newSeed;
    if (newWorld && Race.WORLDS[newWorld]) world = newWorld;
    root.classList.toggle("world-lava", world === "lava");
    for (const b of document.querySelectorAll("[data-world]")) b.setAttribute("aria-checked", String(b.dataset.world === world));
    course = Race.buildCourse(seed, { world });
    race = Race.createRace(course, { seed: 1 + Math.floor(Math.random() * 1e9) });
    phase = "lobby";
    timeScale = 1;
    lastLeaderSection = -1;
    winnerShownAt = null;
    followId = null;
    cam.ready = false;
    $("track-name").textContent = `Track ${seed} · ${Race.WORLDS[world].label}`;
    $("course-list").textContent = course.sections.slice(1, -1).map(s => s.label).join(" → ");
    if (!tv) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("track", String(seed));
        url.searchParams.set("world", world);
        window.history.replaceState(null, "", url);
      } catch (error) { /* ignore */ }
    }
    buildStandings();
    buildLabels();
    $("results").hidden = true;
    root.classList.remove("results-open");
    $("skip").hidden = true;
    $("lobby").hidden = false;
    $("countdown").textContent = "";
    $("clock").textContent = formatTime(0);
    $("section").textContent = course.sections[0].label;
    notify();
  }

  // ---------- lobby ----------
  function buildPicker() {
    const picker = $("picker");
    picker.textContent = "";
    Race.MARBLES.forEach((marble, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(i === pick));
      button.appendChild(dot(marble));
      button.appendChild(document.createTextNode(marble.name));
      button.addEventListener("click", () => {
        if (tv) return;
        pick = i;
        storageSet("marble-race:pick", String(i));
        for (const b of picker.children) b.setAttribute("aria-checked", "false");
        button.setAttribute("aria-checked", "true");
        if (remote) remote.pick(i);
        refreshStandings(true);
      });
      picker.appendChild(button);
    });
  }

  function startRace() {
    if (phase !== "lobby") return;
    sound.unlock();
    $("lobby").hidden = true;
    phase = "countdown";
    Race.startCountdown(race);
    showCount("3");
    sound.count(false);
    notify();
  }

  function showCount(text) {
    const el = $("countdown");
    el.textContent = text;
    notify();
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  // ---------- standings ----------
  const rows = new Map();
  function buildStandings() {
    const list = $("standings");
    list.textContent = "";
    rows.clear();
    for (const m of race.marbles) {
      const li = document.createElement("li");
      li.title = `Follow ${m.name}`;
      const pos = document.createElement("span");
      pos.className = "pos";
      const name = document.createElement("span");
      name.textContent = m.name;
      const gap = document.createElement("span");
      gap.className = "gap";
      li.append(pos, dot(m), name, gap);
      li.addEventListener("click", () => {
        followId = m.id;
        setCam("marble");
      });
      rows.set(m.id, { li, pos, gap });
    }
    refreshStandings(true);
  }

  // Standings as plain entries, so they can be sent to a phone while casting.
  function standingEntries() {
    const order = Race.standings(race);
    const leader = order[0];
    return order.map((m, i) => {
      let gap;
      if (m.finished) gap = formatTime(m.finishTime);
      else if (race.state === "finished") gap = "DNF";
      else if (i === 0 || phase === "lobby" || phase === "countdown") gap = "";
      else gap = `+${Math.max(0, (leader.finished ? course.finishProgress : leader.progress) - m.progress).toFixed(1)} m`;
      return { id: m.id, finished: m.finished, finishTime: m.finishTime, respawns: m.respawns, gap };
    });
  }

  let standingsTimer = 0;
  function refreshStandings(force) {
    if (remote) return;
    if (!force && standingsTimer > 0) return;
    standingsTimer = 0.15;
    renderStandings(standingEntries());
  }
  function renderStandings(entries) {
    const list = $("standings");
    const followed = remote ? null : currentTarget();
    entries.forEach((entry, i) => {
      const row = rows.get(entry.id);
      if (!row) return;
      row.pos.textContent = String(i + 1);
      row.li.classList.toggle("mine", isMine(entry.id));
      row.li.classList.toggle("done", entry.finished);
      row.li.classList.toggle("followed", !!followed && followed.id === entry.id && camMode !== "leader");
      row.gap.textContent = entry.gap;
      if (list.children[i] !== row.li) list.insertBefore(row.li, list.children[i] || null);
    });
  }

  // ---------- name labels ----------
  const labels = [];
  function buildLabels() {
    const box = $("labels");
    box.textContent = "";
    labels.length = 0;
    for (const m of race.marbles) {
      const span = document.createElement("span");
      span.textContent = m.name;
      span.style.setProperty("--dot", css(m.color));
      box.appendChild(span);
      labels.push(span);
    }
  }
  function updateLabels(viewProj) {
    race.marbles.forEach((m, i) => {
      const el = labels[i];
      const p = renderer.project(viewProj, [m.p[0], m.p[1] + 0.55, m.p[2]]);
      const visible = p && p.depth < 32 && p.x > -40 && p.y > -20 && p.x < canvas.clientWidth + 40 && p.y < canvas.clientHeight + 20;
      if (!visible) { el.style.display = "none"; return; }
      el.style.display = "";
      el.style.left = `${p.x.toFixed(1)}px`;
      el.style.top = `${p.y.toFixed(1)}px`;
      el.style.opacity = String(Math.max(0.35, 1 - p.depth / 40));
      el.classList.toggle("mine", isMine(m.id));
    });
  }

  // ---------- ticker ----------
  let tickerTimer = 0;
  let tickerSeq = 0;
  function say(text, seconds = 2.8) {
    const el = $("ticker");
    el.textContent = text;
    el.classList.add("show");
    tickerTimer = seconds;
    tickerSeq++;
    notify();
  }

  // ---------- camera ----------
  function setCam(mode) {
    camMode = mode;
    for (const button of document.querySelectorAll("[data-cam]")) {
      const pressed = button.dataset.cam === mode || (mode === "marble" && button.dataset.cam === "pick" && followId === pick);
      button.setAttribute("aria-pressed", String(pressed));
    }
    if (typeof syncCamButton === "function") syncCamButton();
    refreshStandings(true);
  }

  function currentTarget() {
    if (!race) return null;
    if (camMode === "pick") return race.marbles[pick];
    if (camMode === "marble" && followId !== null) return race.marbles[followId];
    if (camMode === "overview") return null;
    const order = Race.standings(race);
    if (winnerShownAt !== null && race.time - winnerShownAt < 3) return race.marbles[race.finishOrder[0]];
    return order.find(m => !m.finished) || order[0];
  }

  function headingAt(m) {
    const path = course.path;
    const i = Math.min(path.length - 2, m.pathIndex);
    const a = path[i], b = path[i + 1], c = path[Math.min(path.length - 1, i + 2)];
    const s0 = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const t = Math.max(0, Math.min(1, (m.progress - course.cum[i]) / (course.cum[i + 1] - course.cum[i] || 1)));
    const d1 = [(b[0] - a[0]) / s0, (b[2] - a[2]) / s0];
    const s1 = Math.hypot(c[0] - b[0], c[2] - b[2]) || 1;
    const d2 = s1 > 0.01 ? [(c[0] - b[0]) / s1, (c[2] - b[2]) / s1] : d1;
    const blend = Math.max(0, (t - 0.6) / 0.4) * 0.5;
    const x = d1[0] * (1 - blend) + d2[0] * blend, z = d1[1] * (1 - blend) + d2[1] * blend;
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  }

  function updateCamera(dt) {
    let eye, target;
    if (phase === "lobby") {
      const start = course.sections[0].frame;
      const c = start.at(0, 0, 1.6);
      const angle = performance.now() / 1000 * 0.18 + cam.yaw;
      const r = 7 * cam.zoom;
      target = [c[0], c[1] + 0.3, c[2]];
      eye = [c[0] + Math.sin(angle) * r, c[1] + 6.5 + cam.pitch * 4, c[2] - Math.cos(angle) * r];
    } else {
      const m = currentTarget();
      if (!m) {
        const b = course.bounds;
        const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
        const extent = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
        const angle = performance.now() / 1000 * 0.05 + cam.yaw;
        const r = extent * 0.75 * cam.zoom;
        target = c;
        eye = [c[0] + Math.sin(angle) * r, c[1] + extent * (0.55 + cam.pitch * 0.4), c[2] - Math.cos(angle) * r];
      } else {
        const [hx, hz] = headingAt(m);
        const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
        const bx = hx * cy - hz * sy, bz = hx * sy + hz * cy;
        const dist = 6 * cam.zoom;
        const height = (3.8 + cam.pitch * 5) * cam.zoom;
        target = [m.p[0] + hx * 1.5, m.p[1] + 0.2, m.p[2] + hz * 1.5];
        eye = [m.p[0] - bx * dist, m.p[1] + height, m.p[2] - bz * dist];
      }
    }
    if (!cam.ready) {
      cam.eye = eye.slice();
      cam.target = target.slice();
      cam.ready = true;
      return;
    }
    const ke = 1 - Math.exp(-dt * 3.2), kt = 1 - Math.exp(-dt * 7);
    for (let k = 0; k < 3; k++) {
      cam.eye[k] += (eye[k] - cam.eye[k]) * ke;
      cam.target[k] += (target[k] - cam.target[k]) * kt;
    }
  }

  // Drag to swing the camera, wheel or pinch to zoom, double-click to reset.
  const pointers = new Map();
  let pinchStart = null;
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
    }
  });
  canvas.addEventListener("pointermove", e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.zoom = Math.max(0.4, Math.min(3, pinchStart.zoom * pinchStart.d / (d || 1)));
      return;
    }
    cam.yaw += (now.x - prev.x) * 0.008;
    cam.pitch = Math.max(-0.5, Math.min(1.2, cam.pitch - (now.y - prev.y) * 0.005));
  });
  const release = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    cam.zoom = Math.max(0.4, Math.min(3, cam.zoom * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });
  canvas.addEventListener("dblclick", () => { cam.yaw = 0; cam.pitch = 0; cam.zoom = 1; });

  // ---------- events ----------
  function handleEvents(events) {
    for (const e of events) {
      const m = e.marble !== undefined ? race.marbles[e.marble] : null;
      switch (e.type) {
        case "count":
          showCount(String(e.value));
          sound.count(false);
          break;
        case "go":
          phase = "running";
          showCount("GO!");
          sound.count(true);
          setTimeout(() => { if (phase === "running") { $("countdown").textContent = ""; notify(); } }, 900);
          break;
        case "lead":
          say(`${m.name} takes the lead!`);
          break;
        case "respawn":
          if (e.reason === "fell" && world === "lava") {
            say(`${m.name} fell into the lava! \u{1F525}`);
            sound.sizzle();
          } else {
            say(e.reason === "fell" ? `${m.name} flew off the track!` : `${m.name} got stuck and is put back`);
          }
          break;
        case "finish":
          if (e.place === 1) {
            winnerShownAt = race.time;
            say(`\u{1F3C1} ${m.name} wins in ${formatTime(e.time)}!`, 4);
            sound.fanfare();
            burstConfetti(m);
            $("skip").hidden = false;
            notify();
          } else {
            if (e.place <= 3 || isMine(m.id)) say(`${m.name} finishes ${ordinal(e.place)}`);
            sound.ding();
          }
          break;
        case "clack":
          sound.clack(e.speed);
          break;
        case "hit":
          if (e.tag === "bumper") sound.boing();
          else if (e.speed > 2.5 && (e.tag === "hammer" || e.tag === "pusher" || e.tag === "spinner")) sound.thump(e.speed);
          break;
        case "end":
          showResults();
          break;
        default:
          break;
      }
    }
  }

  function commentary() {
    if (phase !== "running") return;
    const order = Race.standings(race);
    const lead = order.find(m => !m.finished);
    if (!lead) return;
    let index = 0;
    for (let i = 0; i < course.sections.length; i++) {
      if (lead.pathIndex >= course.sections[i].pathIndex) index = i;
    }
    if (index > lastLeaderSection) {
      if (lastLeaderSection >= 0 && race.finishOrder.length === 0) {
        const s = course.sections[index];
        say(s.type === "finish" ? `${lead.name} enters the home straight!` : `${lead.name} reaches the ${s.label}`);
      }
      lastLeaderSection = index;
    }
    // Photo finish: slow motion when the first places are decided by a whisker.
    timeScale = 1;
    if (race.finishOrder.length === 0 && order.length > 1 && !reducedMotion) {
      const a = order[0], b = order[1];
      const toGo = course.finishProgress - a.progress;
      if (toGo < 3.5 && toGo > -0.5 && a.progress - b.progress < 1.2) {
        timeScale = 0.3;
        if (tickerTimer <= 0) say("Photo finish!", 1.5);
      }
    }
  }

  // ---------- results ----------
  // After the winner is in, the remaining race can be simulated at once.
  function skipToResults() {
    if (phase !== "running") return;
    const finishes = [];
    for (let i = 0; i < 4000 && race.state !== "finished"; i++) {
      for (const e of Race.update(race, 0.1)) if (e.type === "finish" || e.type === "end") finishes.push(e);
    }
    say("Remaining marbles simulated", 2);
    handleEvents(finishes.filter(e => e.type === "end"));
  }

  function showResults() {
    phase = "results";
    $("skip").hidden = true;
    timeScale = 1;
    const mine = renderResults(standingEntries());
    notify();
    setTimeout(() => {
      if (phase !== "results") return;
      $("results").hidden = false;
      root.classList.add("results-open");
      notify();
      if (!tv) $("again").focus({ preventScroll: true });
      if (mine && mine.place === 1) burstConfetti(Race.MARBLES[mine.id]);
    }, 1200);
  }

  // Fills the results panel from standing entries; returns this player's result.
  function renderResults(entries) {
    const info = id => Race.MARBLES[id];
    const podium = $("podium");
    podium.textContent = "";
    entries.slice(0, 3).forEach((entry, i) => {
      const step = document.createElement("div");
      step.className = `step p${i + 1}`;
      const name = document.createElement("span");
      name.textContent = info(entry.id).name;
      const time = document.createElement("small");
      time.textContent = entry.finished ? formatTime(entry.finishTime) : "DNF";
      const block = document.createElement("div");
      block.className = "block";
      block.textContent = String(i + 1);
      step.append(dot(info(entry.id)), name, time, block);
      podium.appendChild(step);
    });
    const winner = entries[0];
    $("results-title").textContent = winner.finished ? `${info(winner.id).name} wins!` : "Results";
    let mine = null;
    if (tv) {
      const names = tvPicks.map(id => {
        const place = entries.findIndex(e => e.id === id) + 1;
        return `${info(id).name} ${ordinal(place)}`;
      });
      $("your-result").textContent = names.length ? `Your marbles: ${names.join(", ")}` : "";
      $("your-result").hidden = !names.length;
    } else {
      const index = entries.findIndex(e => e.id === pick);
      const entry = entries[index];
      const place = index + 1;
      const name = info(pick).name;
      mine = { id: pick, place };
      $("your-result").hidden = false;
      $("your-result").textContent = entry.finished
        ? (place === 1 ? `Your marble ${name} won the race! \u{1F3C6}` : `Your marble ${name} finished ${ordinal(place)} in ${formatTime(entry.finishTime)}.`)
        : `Your marble ${name} did not finish in time (${ordinal(place)} on distance).`;
    }
    const list = $("result-list");
    list.textContent = "";
    entries.forEach((entry, i) => {
      const li = document.createElement("li");
      if (isMine(entry.id)) li.className = "mine";
      const pos = document.createElement("span");
      pos.className = "pos";
      pos.textContent = `${i + 1}.`;
      const name = document.createElement("span");
      name.textContent = info(entry.id).name + (entry.respawns ? ` (${entry.respawns}\u00d7 reset)` : "");
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = entry.finished ? (i === 0 ? formatTime(entry.finishTime) : `+${(entry.finishTime - winner.finishTime).toFixed(2)} s`) : "DNF";
      li.append(pos, dot(info(entry.id)), name, time);
      list.appendChild(li);
    });
    return mine;
  }

  // ---------- confetti ----------
  const confettiCanvas = $("confetti");
  const confettiCtx = confettiCanvas.getContext("2d");
  let confetti = [];
  function burstConfetti(marble) {
    if (reducedMotion || !confettiCtx) return;
    const w = confettiCanvas.clientWidth, h = confettiCanvas.clientHeight;
    const colors = [css(marble.color), css(marble.accent), "#f2b51d", "#ffffff", "#ff6a3d"];
    for (let i = 0; i < 160; i++) {
      confetti.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.4, y: h * 0.35,
        vx: (Math.random() - 0.5) * 520, vy: -200 - Math.random() * 420,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
        s: 5 + Math.random() * 6, c: colors[i % colors.length], life: 3 + Math.random() * 1.5
      });
    }
  }
  function drawConfetti(dt) {
    if (!confettiCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = confettiCanvas.clientWidth, h = confettiCanvas.clientHeight;
    if (confettiCanvas.width !== Math.round(w * dpr) || confettiCanvas.height !== Math.round(h * dpr)) {
      confettiCanvas.width = Math.round(w * dpr);
      confettiCanvas.height = Math.round(h * dpr);
    }
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    confettiCtx.clearRect(0, 0, w, h);
    if (!confetti.length) return;
    confetti = confetti.filter(p => (p.life -= dt) > 0 && p.y < h + 20);
    for (const p of confetti) {
      p.vy += 600 * dt;
      p.vx *= 1 - dt * 0.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.r);
      confettiCtx.globalAlpha = Math.min(1, p.life);
      confettiCtx.fillStyle = p.c;
      confettiCtx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      confettiCtx.restore();
    }
  }

  // ---------- controls ----------
  // Each action runs locally, or on the TV while casting.
  function command(action, extra = {}) {
    if (remote) { remote.command(action, extra); return; }
    switch (action) {
      case "start": startRace(); break;
      case "skip": skipToResults(); break;
      case "newTrack": newRace(extra.seed || randomSeed()); break;
      case "world":
        if (phase === "lobby" || phase === "results") newRace(undefined, extra.world);
        break;
      case "again": newRace(); startRace(); break;
      case "camera":
        followId = extra.marble !== undefined ? extra.marble : null;
        if (extra.mode === "pick" && followId === null) followId = pick;
        setCam(extra.mode === "pick" ? "marble" : extra.mode);
        break;
      default: break;
    }
  }
  for (const button of document.querySelectorAll("[data-world]")) {
    button.addEventListener("click", () => {
      if (tv) return;
      storageSet("marble-race:world", button.dataset.world);
      command("world", { world: button.dataset.world });
    });
  }
  $("start").addEventListener("click", () => command("start"));
  $("skip").addEventListener("click", () => command("skip"));
  $("new-track").addEventListener("click", () => command("newTrack"));
  $("again").addEventListener("click", () => command("again"));
  $("again-new").addEventListener("click", () => command("newTrack"));
  for (const button of document.querySelectorAll("[data-cam]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.cam;
      if (remote) {
        for (const b of document.querySelectorAll("[data-cam]")) b.setAttribute("aria-pressed", String(b === button));
        remote.command("camera", { mode, marble: mode === "pick" ? pick : undefined });
        return;
      }
      followId = null;
      if (mode === "pick") followId = pick;
      setCam(mode);
    });
  }
  function toggleSound() {
    const on = !sound.enabled;
    sound.setEnabled(on);
    if (on) sound.unlock();
    const button = $("sound");
    button.setAttribute("aria-pressed", String(on));
    button.textContent = on ? "Sound on" : "Sound off";
  }
  $("sound").addEventListener("click", toggleSound);

  // ---------- fullscreen ----------
  // Native fullscreen where the browser allows it (Android, desktop, iPad);
  // otherwise (iPhone Safari) the game asks the wrapper page to fill the screen.
  const nativeFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const canNative = !!(root.requestFullscreen || root.webkitRequestFullscreen) &&
    (document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false);
  let pseudoFullscreen = false;
  const embedded = window.parent !== window;

  function syncFullscreen() {
    const on = !!nativeFullscreen() || pseudoFullscreen;
    root.classList.toggle("fs", on);
    const button = $("fullscreen");
    button.setAttribute("aria-pressed", String(on));
    button.textContent = on ? "Exit fullscreen" : "Fullscreen";
  }
  function setPseudo(on) {
    pseudoFullscreen = on;
    if (embedded) window.parent.postMessage({ type: "marble:immersive", on }, window.location.origin);
    syncFullscreen();
  }
  async function enterFullscreen() {
    if (canNative) {
      try {
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
        else root.webkitRequestFullscreen();
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
        return;
      } catch (error) { /* fall back below */ }
    }
    setPseudo(true);
    say("Tip: turn your phone sideways", 2.5);
  }
  function exitFullscreen() {
    if (nativeFullscreen()) {
      if (screen.orientation && screen.orientation.unlock) { try { screen.orientation.unlock(); } catch (error) { /* ignore */ } }
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    if (pseudoFullscreen) setPseudo(false);
  }
  function toggleFullscreen() {
    if (nativeFullscreen() || pseudoFullscreen) exitFullscreen();
    else enterFullscreen();
  }
  $("fullscreen").addEventListener("click", toggleFullscreen);
  $("fs-exit").addEventListener("click", exitFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreen);
  document.addEventListener("webkitfullscreenchange", syncFullscreen);
  const camOrder = ["leader", "pick", "overview"];
  const camNames = { leader: "Leader", pick: "My marble", overview: "Overview", marble: "Leader" };
  $("fs-cam").addEventListener("click", () => {
    const next = camOrder[(camOrder.indexOf(camMode === "marble" ? "pick" : camMode) + 1) % camOrder.length];
    document.querySelector(`[data-cam="${next}"]`).click();
  });
  function syncCamButton() { $("fs-cam").textContent = `Camera: ${camNames[camMode] || "Leader"}`; }
  document.addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.key === "1") document.querySelector('[data-cam="leader"]').click();
    else if (e.key === "2") document.querySelector('[data-cam="pick"]').click();
    else if (e.key === "3") document.querySelector('[data-cam="overview"]').click();
    else if (e.key === "m" || e.key === "M") toggleSound();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else if (e.key === "Escape" && pseudoFullscreen) setPseudo(false);
  });

  // ---------- casting API ----------
  // Snapshot of what the TV shows, sent to the phones about twice a second.
  function snapshot() {
    return {
      type: "state",
      phase,
      track: seed,
      world,
      overlay: $("countdown").textContent,
      clock: $("clock").textContent,
      section: $("section").textContent,
      ticker: $("ticker").classList.contains("show") ? $("ticker").textContent : "",
      tickerSeq,
      skippable: !$("skip").hidden,
      resultsShown: !$("results").hidden,
      picks: tvPicks.slice(),
      standings: standingEntries()
    };
  }

  // Phone side: show the TV's state with the local panels.
  let lastTickerSeq = -1;
  function applyRemoteState(state) {
    if (state.track !== seed || (state.world && state.world !== world)) newRace(state.track, state.world);
    phase = state.phase;
    $("lobby").hidden = state.phase !== "lobby";
    $("countdown").textContent = state.overlay || "";
    $("clock").textContent = state.clock;
    $("section").textContent = state.section;
    $("skip").hidden = !state.skippable;
    renderStandings(state.standings);
    if (state.ticker && state.tickerSeq !== lastTickerSeq) {
      lastTickerSeq = state.tickerSeq;
      $("ticker").textContent = state.ticker;
      $("ticker").classList.add("show");
      tickerTimer = 2.8;
    }
    const showResults = state.phase === "results" && state.resultsShown;
    if (showResults && $("results").hidden) {
      const mine = renderResults(state.standings);
      $("results").hidden = false;
      if (mine && mine.place === 1) burstConfetti(Race.MARBLES[mine.id]);
    } else if (!showResults) {
      $("results").hidden = true;
    }
  }

  window.MarbleGame = {
    tv,
    get pick() { return pick; },
    snapshot,
    onChange(fn) { listeners.add(fn); },
    // TV side: run a command from a phone.
    command(action, extra = {}) {
      if (action === "start" || action === "again") sound.unlock();
      command(action, extra);
      notify();
    },
    setPicks(ids) {
      tvPicks = ids.filter(id => id >= 0 && id < Race.MARBLES.length);
      for (const [i, b] of [...$("picker").children].entries()) b.setAttribute("aria-checked", String(tvPicks.includes(i)));
      refreshStandings(true);
      notify();
    },
    // Phone side: start or stop remote control (null stops it).
    setRemote(controller, deviceName) {
      remote = controller;
      root.classList.toggle("remote", !!controller);
      $("cast-target").textContent = deviceName ? `Casting to ${deviceName}` : "Casting";
      if (!controller) {
        cam.ready = false;
        newRace();
      }
    },
    applyRemoteState
  };

  // ---------- main loop ----------
  buildPicker();
  newRace();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (remote) {
      // The TV runs the race; only the ticker fades here.
      if (tickerTimer > 0 && (tickerTimer -= dt) <= 0) $("ticker").classList.remove("show");
      drawConfetti(dt);
      requestAnimationFrame(frame);
      return;
    }
    const events = Race.update(race, dt * timeScale);
    handleEvents(events);
    commentary();
    if (phase === "running" || phase === "countdown") {
      const elapsed = race.state === "running" || race.state === "finished" ? race.time - race.startTime : 0;
      $("clock").textContent = formatTime(Math.max(0, race.endTime !== undefined ? race.endTime : elapsed));
      const target = currentTarget();
      if (target) {
        let index = 0;
        for (let i = 0; i < course.sections.length; i++) if (target.pathIndex >= course.sections[i].pathIndex) index = i;
        $("section").textContent = `${target.name}: ${course.sections[index].label}`;
      } else {
        $("section").textContent = "Overview";
      }
    }
    standingsTimer -= dt;
    refreshStandings(false);
    if (tickerTimer > 0) {
      tickerTimer -= dt;
      if (tickerTimer <= 0) { $("ticker").classList.remove("show"); notify(); }
    }
    const target = phase === "lobby" ? null : currentTarget();
    for (const m of race.marbles) m.highlight = isMine(m.id);
    sound.rumble(target && target.grounded ? Math.hypot(target.v[0], target.v[1], target.v[2]) : 0);
    updateCamera(dt);
    const scene = { course, marbles: race.marbles, camera: cam, time: race.time };
    renderer.render(scene);
    updateLabels(scene.viewProj);
    drawConfetti(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
