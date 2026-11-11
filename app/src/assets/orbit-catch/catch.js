// Orbit Catch: WebGL renderer, immersive WebXR session (hands/controllers) and
// a flat browser fallback around the pure rules in game.js.
(function () {
  "use strict";
  const Rules = window.OrbitCatchGame;
  const Body = window.OrbitCatchBody;
  const Music = window.OrbitCatchMusic;
  const scoreboard = window.OrbitCatchBoard.createBoard();
  const $ = id => document.getElementById(id);
  const canvas = $("scene");
  const arButton = $("enter-ar");
  const vrButton = $("enter-vr");
  const flatButton = $("play-flat");
  const musicButton = $("music");
  const statusEl = $("xr-status");
  const scoreEl = $("score");
  const comboEl = $("combo");
  const timeEl = $("time");
  const bannerEl = $("banner");

  const COLORS = {
    orb: [0.30, 0.70, 1.00],
    cube: [0.40, 0.94, 0.50],
    star: [1.00, 0.82, 0.23],
    miss: [1.00, 0.35, 0.35],
    hand: [0.55, 0.95, 0.90],
    arm: [0.30, 0.42, 0.72],
    grid: [0.25, 0.32, 0.55]
  };

  // --- Matrix helpers (column-major, like WebXR) -----------------------------
  function multiply(a, b, out = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  // Translation * RotY(yaw) * RotX(pitch) * Scale.
  function compose(out, x, y, z, yaw, pitch, sx, sy, sz) {
    const cy = Math.cos(yaw), syw = Math.sin(yaw), cx = Math.cos(pitch), sxp = Math.sin(pitch);
    out[0] = cy * sx; out[1] = 0; out[2] = -syw * sx; out[3] = 0;
    out[4] = syw * sxp * sy; out[5] = cx * sy; out[6] = cy * sxp * sy; out[7] = 0;
    out[8] = syw * cx * sz; out[9] = -sxp * sz; out[10] = cy * cx * sz; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(eye, target) {
    const f = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const s = normalize(cross(f, [0, 1, 0]));
    const u = cross(s, f);
    return {
      matrix: new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]),
      s, u, f
    };
  }

  // --- Meshes ----------------------------------------------------------------
  function sphereMesh(rings = 10, segments = 16) {
    const out = [];
    const point = (i, j) => {
      const t = Math.PI * i / rings, p = 2 * Math.PI * j / segments;
      return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
    };
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segments; j++) {
        const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
        for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], v[0], v[1], v[2]);
      }
    }
    return new Float32Array(out);
  }
  function flatMesh(vertices, faces) {
    const out = [];
    for (const face of faces) {
      const [a, b, c] = face.map(i => vertices[i]);
      const n = normalize(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
      for (const v of [a, b, c]) out.push(v[0], v[1], v[2], n[0], n[1], n[2]);
    }
    return new Float32Array(out);
  }
  function cubeMesh() {
    const v = [];
    for (let i = 0; i < 8; i++) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
    const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    const faces = [];
    for (const q of quads) faces.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
    return flatMesh(v, faces);
  }
  function gemMesh() {
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1.45, 0], [0, -1.45, 0], [0, 0, 1], [0, 0, -1]];
    return flatMesh(v, [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]);
  }
  function gridMesh(half = 5, step = 0.5) {
    const out = [];
    for (let i = -half; i <= half + 1e-6; i += step) {
      out.push(i, 0, -half, 0, 1, 0, i, 0, half, 0, 1, 0);
      out.push(-half, 0, i, 0, 1, 0, half, 0, i, 0, 1, 0);
    }
    return new Float32Array(out);
  }

  // Open cylinder of radius 1 from y = 0 to y = 1; joints are drawn as spheres.
  function cylinderMesh(segments = 12) {
    const out = [];
    for (let j = 0; j < segments; j++) {
      const a = 2 * Math.PI * j / segments, b = 2 * Math.PI * (j + 1) / segments;
      const p = [[Math.cos(a), 0, Math.sin(a)], [Math.cos(b), 0, Math.sin(b)]];
      for (const [v, y] of [[p[0], 0], [p[0], 1], [p[1], 1], [p[0], 0], [p[1], 1], [p[1], 0]]) out.push(v[0], y, v[2], v[0], 0, v[2]);
    }
    return new Float32Array(out);
  }
  // Model matrix for a cylinder of radius r from point a to point b.
  function segment(out, a, b, r) {
    const y = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const yn = normalize(y);
    const x = normalize(cross(yn, Math.abs(yn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const z = cross(x, yn);
    out[0] = x[0] * r; out[1] = x[1] * r; out[2] = x[2] * r; out[3] = 0;
    out[4] = y[0]; out[5] = y[1]; out[6] = y[2]; out[7] = 0;
    out[8] = z[0] * r; out[9] = z[1] * r; out[10] = z[2] * r; out[11] = 0;
    out[12] = a[0]; out[13] = a[1]; out[14] = a[2]; out[15] = 1;
    return out;
  }

  // --- WebGL setup -------------------------------------------------------------
  const contextOptions = { alpha: true, antialias: true, xrCompatible: true };
  const gl = canvas.getContext("webgl2", contextOptions) || canvas.getContext("webgl", contextOptions);
  if (!gl) {
    statusEl.textContent = "WebGL is not available in this browser, so Orbit Catch cannot run.";
    for (const button of [arButton, vrButton, flatButton]) button.disabled = true;
    return;
  }

  const LIT_VS = `attribute vec3 aPosition; attribute vec3 aNormal;
uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel; varying vec3 vNormal;
void main() { vNormal = (uModel * vec4(aNormal, 0.0)).xyz; gl_Position = uProj * uView * uModel * vec4(aPosition, 1.0); }`;
  const LIT_FS = `precision mediump float; uniform vec4 uColor; uniform float uEmissive; varying vec3 vNormal;
void main() { float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.9, 0.3))), 0.0);
gl_FragColor = vec4(uColor.rgb * mix(0.35 + 0.75 * d, 1.0, uEmissive), uColor.a); }`;
  const HUD_VS = `attribute vec2 aPos; uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel; varying vec2 vUv;
void main() { vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y); gl_Position = uProj * uView * uModel * vec4(aPos, 0.0, 1.0); }`;
  const HUD_FS = `precision mediump float; uniform sampler2D uTex; varying vec2 vUv; void main() { gl_FragColor = texture2D(uTex, vUv); }`;

  let res = null;
  // Two hands, eight palm triangles each, three vertices of six floats.
  const PALM_FLOATS = 2 * 8 * 3 * 6;
  const palmData = new Float32Array(PALM_FLOATS);
  let hudKey = "";
  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "Shader compile failed");
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "Program link failed");
    return p;
  }
  function buffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer: b, count: data.length / 6 };
  }
  function createResources() {
    const lit = program(LIT_VS, LIT_FS);
    const hud = program(HUD_VS, HUD_FS);
    const loc = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), gl.STATIC_DRAW);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    hudKey = "";
    const palm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, palm);
    gl.bufferData(gl.ARRAY_BUFFER, PALM_FLOATS * 4, gl.DYNAMIC_DRAW);
    res = {
      lit, hud, quad, texture, palm: { buffer: palm, count: 0 },
      litAttr: { position: gl.getAttribLocation(lit, "aPosition"), normal: gl.getAttribLocation(lit, "aNormal") },
      hudAttr: gl.getAttribLocation(hud, "aPos"),
      litU: loc(lit, ["uProj", "uView", "uModel", "uColor", "uEmissive"]),
      hudU: loc(hud, ["uProj", "uView", "uModel", "uTex"]),
      meshes: { orb: buffer(sphereMesh()), cube: buffer(cubeMesh()), star: buffer(gemMesh()), joint: buffer(sphereMesh(6, 10)), grid: buffer(gridMesh()), bone: buffer(cylinderMesh()) }
    };
  }
  createResources();

  // --- Drawing -------------------------------------------------------------------
  const modelMatrix = new Float32Array(16);
  let boundMesh = null;
  function bindMesh(mesh) {
    if (boundMesh === mesh) return;
    boundMesh = mesh;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.enableVertexAttribArray(res.litAttr.position);
    gl.vertexAttribPointer(res.litAttr.position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(res.litAttr.normal);
    gl.vertexAttribPointer(res.litAttr.normal, 3, gl.FLOAT, false, 24, 12);
  }
  function drawMesh(mesh, color, alpha, emissive, mode = gl.TRIANGLES) {
    bindMesh(mesh);
    gl.uniformMatrix4fv(res.litU.uModel, false, modelMatrix);
    gl.uniform4f(res.litU.uColor, color[0], color[1], color[2], alpha);
    gl.uniform1f(res.litU.uEmissive, emissive);
    gl.drawArrays(mode, 0, mesh.count);
  }

  // Scene state shared by the flat and XR paths.
  let game = null;
  let floorY = 0;
  let showGrid = true;
  // Virtual body: spheres for joints, cylinders for bones, triangles for palms.
  let body = { spheres: [], segments: [], palmFloats: 0 };
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let hudPose = null;

  function drawScene(proj, view) {
    const m = res.meshes;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(res.lit);
    boundMesh = null;
    gl.uniformMatrix4fv(res.litU.uProj, false, proj);
    gl.uniformMatrix4fv(res.litU.uView, false, view);

    if (showGrid) {
      compose(modelMatrix, 0, floorY, 0, 0, 0, 1, 1, 1);
      drawMesh(m.grid, COLORS.grid, 1, 1, gl.LINES);
    }
    if (game) {
      for (const o of game.objects) {
        const r = o.kind.radius;
        const scale = o.kind.id === "cube" ? r * 0.78 : o.kind.id === "star" ? r * 0.85 : r;
        compose(modelMatrix, o.x, o.y, o.z, o.spin, o.kind.id === "orb" ? 0 : o.spin * 0.6, scale, scale, scale);
        drawMesh(m[o.kind.id], COLORS[o.kind.id], 1, o.kind.id === "star" ? 0.45 : 0.1);
      }
    }
    for (const j of body.spheres) {
      compose(modelMatrix, j.p[0], j.p[1], j.p[2], 0, 0, j.r, j.r, j.r);
      drawMesh(m.joint, j.color, 1, 0.25);
    }
    for (const bone of body.segments) {
      segment(modelMatrix, bone.a, bone.b, bone.r);
      drawMesh(m.bone, bone.color, 1, 0.2);
    }
    if (body.palmFloats) {
      modelMatrix.set(IDENTITY);
      res.palm.count = body.palmFloats / 6;
      drawMesh(res.palm, COLORS.hand, 1, 0.35);
    }

    // Translucent pass: landing markers and catch/miss bursts.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (game) {
      for (const o of game.objects) {
        const height = Math.max(0, o.y - floorY);
        const r = o.kind.radius * (1.2 + Math.min(1, height / 2));
        compose(modelMatrix, o.x, floorY + 0.004, o.z, 0, 0, r, 0.002, r);
        drawMesh(m.joint, COLORS[o.kind.id], Math.max(0.15, 0.6 - height * 0.18), 1);
      }
      for (const e of game.effects) {
        const t = e.age / 0.6;
        if (e.type === "catch") {
          const r = e.kind.radius * (1 + t * 3);
          compose(modelMatrix, e.x, e.y, e.z, 0, 0, r, r, r);
          drawMesh(m.joint, COLORS[e.kind.id], 0.55 * (1 - t), 1);
        } else {
          const r = e.kind.radius * (1 + t * 4);
          compose(modelMatrix, e.x, floorY + 0.006, e.z, 0, 0, r, 0.002, r);
          drawMesh(m.joint, COLORS.miss, 0.7 * (1 - t), 1);
        }
      }
    }
    if (hudPose) drawHud(proj, view);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // --- In-headset HUD drawn from a 2D canvas -------------------------------------
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 512;
  hudCanvas.height = 256;
  const hudCtx = hudCanvas.getContext("2d");
  function hudLines() {
    if (!game) return ["", ""];
    if (game.state === "countdown") return ["Get ready", String(Math.ceil(game.countdown))];
    if (game.state === "over") return [`Final score ${game.score}`, `Caught ${game.caught} · Best combo ${game.bestCombo}`, "Pinch or trigger to play again"];
    return [`Score ${game.score}`, `×${game.multiplier()} · ${formatTime(game.timeLeft)}`];
  }
  function updateHudTexture() {
    const lines = hudLines();
    const held = scoreboard.holder !== null;
    const hover = scoreboard.hovering();
    const key = lines.join("|") + (held ? "|held" : hover ? "|hover" : "");
    if (key === hudKey) return;
    hudKey = key;
    const c = hudCtx;
    c.clearRect(0, 0, 512, 256);
    c.fillStyle = "rgba(8, 12, 30, 0.72)";
    c.fillRect(0, 0, 512, 256);
    // Gold while held, bright white-teal while a hand is within reach.
    c.strokeStyle = held ? "#ffd23a" : hover ? "#ffffff" : "rgba(115, 227, 206, 0.8)";
    c.lineWidth = held ? 10 : hover ? 8 : 4;
    c.strokeRect(2, 2, 508, 252);
    c.textAlign = "center";
    c.fillStyle = "#e4e9f4";
    c.font = "600 64px system-ui, sans-serif";
    c.fillText(lines[0], 256, 100);
    c.fillStyle = "#73e3ce";
    c.font = lines.length > 2 ? "500 32px system-ui, sans-serif" : "600 56px system-ui, sans-serif";
    c.fillText(lines[1], 256, lines.length > 2 ? 160 : 180);
    if (lines[2]) {
      c.fillStyle = "#8d9ab7";
      c.fillText(lines[2], 256, 215);
    }
    gl.bindTexture(gl.TEXTURE_2D, res.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hudCanvas);
  }
  function drawHud(proj, view) {
    gl.useProgram(res.hud);
    gl.bindBuffer(gl.ARRAY_BUFFER, res.quad);
    gl.disableVertexAttribArray(res.litAttr.normal);
    gl.enableVertexAttribArray(res.hudAttr);
    gl.vertexAttribPointer(res.hudAttr, 2, gl.FLOAT, false, 8, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.texture);
    gl.uniform1i(res.hudU.uTex, 0);
    gl.uniformMatrix4fv(res.hudU.uProj, false, proj);
    gl.uniformMatrix4fv(res.hudU.uView, false, view);
    compose(modelMatrix, hudPose.x, hudPose.y, hudPose.z, hudPose.yaw, 0, 0.5, 0.25, 1);
    gl.uniformMatrix4fv(res.hudU.uModel, false, modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(res.hudAttr);
    boundMesh = null;
  }

  // --- Sound and feedback ----------------------------------------------------------
  let audio = null;
  function ensureAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch { audio = null; }
  }
  let techno = null;
  let musicEnabled = true;
  function syncMusic() {
    const wanted = musicEnabled && Boolean(game) && !document.hidden && (Boolean(xrSession) || flatRunning);
    if (wanted) {
      ensureAudio();
      if (audio && !techno) { try { techno = Music.createTechno(audio); } catch { techno = null; } }
      if (techno) techno.start();
    } else if (techno) {
      techno.stop();
    }
    musicButton.textContent = musicEnabled ? "Music on" : "Music off";
    musicButton.setAttribute("aria-pressed", String(musicEnabled));
  }
  musicButton.addEventListener("click", () => { musicEnabled = !musicEnabled; syncMusic(); });
  document.addEventListener("visibilitychange", () => syncMusic());
  function blip(frequency, duration, type, volume) {
    if (!audio || audio.state !== "running") return;
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * (type === "sine" ? 0.6 : 1.5), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
  const PITCH = { orb: 660, cube: 784, star: 1046 };
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === "catch") {
        blip(PITCH[e.kind] * (1 + 0.06 * Math.min(6, game.combo)), 0.18, "triangle", 0.25);
        pulseControllers(0.6, 50);
      } else if (e.type === "miss") {
        blip(150, 0.25, "sine", 0.18);
      } else if (e.type === "start") {
        blip(880, 0.3, "triangle", 0.2);
      } else if (e.type === "over") {
        overAt = performance.now();
        blip(523, 0.6, "triangle", 0.25);
      }
    }
  }
  function formatTime(seconds) {
    const s = Math.ceil(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function updatePageHud() {
    if (!game) return;
    scoreEl.textContent = String(game.score);
    comboEl.textContent = `×${game.multiplier()}`;
    timeEl.textContent = formatTime(game.timeLeft);
    bannerEl.textContent = game.state === "countdown" ? String(Math.ceil(game.countdown))
      : game.state === "over" ? `Final score ${game.score} — click to play again` : "";
  }
  let overAt = 0;

  // --- Flat browser mode ---------------------------------------------------------------
  const FLAT_EYE = [0, 1.3, 2.6];
  const flatCatcher = { x: 0, y: 1.0, z: 0, radius: 0.12 };
  let flatCamera = null;
  let flatRunning = false;
  let flatLast = 0;
  const keys = new Set();

  function startFlat() {
    ensureAudio();
    endSessionIfAny();
    game = Rules.createGame({ flat: true, spawnHeight: 2.3 });
    flatButton.setAttribute("aria-pressed", "true");
    canvas.focus();
    if (!flatRunning) {
      flatRunning = true;
      flatLast = 0;
      requestAnimationFrame(flatFrame);
    }
    syncMusic();
  }
  function resizeFlat() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const aspect = w / h;
    const camera = lookAt(FLAT_EYE, [0, 1.15, 0]);
    flatCamera = { ...camera, proj: perspective(Math.PI / 3, aspect, 0.05, 50), aspect, tanHalf: Math.tan(Math.PI / 6) };
  }
  function pointerToPlane(event) {
    if (!flatCamera) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const { s, u, f, tanHalf, aspect } = flatCamera;
    const d = [0, 1, 2].map(i => f[i] + s[i] * nx * tanHalf * aspect + u[i] * ny * tanHalf);
    if (Math.abs(d[2]) < 1e-6) return;
    const t = -FLAT_EYE[2] / d[2];
    flatCatcher.x = Math.max(-1.3, Math.min(1.3, FLAT_EYE[0] + d[0] * t));
    flatCatcher.y = Math.max(0.1, Math.min(2.4, FLAT_EYE[1] + d[1] * t));
  }
  function flatFrame(time) {
    if (!flatRunning || xrSession) { flatRunning = false; return; }
    requestAnimationFrame(flatFrame);
    const dt = flatLast ? (time - flatLast) / 1000 : 0;
    flatLast = time;
    resizeFlat();
    if (!document.hidden && game) {
      const step = 1.4 * Math.min(0.1, dt);
      if (keys.has("ArrowLeft")) flatCatcher.x = Math.max(-1.3, flatCatcher.x - step);
      if (keys.has("ArrowRight")) flatCatcher.x = Math.min(1.3, flatCatcher.x + step);
      if (keys.has("ArrowUp")) flatCatcher.y = Math.min(2.4, flatCatcher.y + step);
      if (keys.has("ArrowDown")) flatCatcher.y = Math.max(0.1, flatCatcher.y - step);
      handleEvents(game.update(dt, { x: 0, z: 0 }, [flatCatcher]));
    }
    floorY = 0;
    showGrid = true;
    hudPose = null;
    body = { spheres: [{ p: [flatCatcher.x, flatCatcher.y, flatCatcher.z], r: flatCatcher.radius, color: COLORS.hand }], segments: [], palmFloats: 0 };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawScene(flatCamera.proj, flatCamera.matrix);
    updatePageHud();
  }
  canvas.addEventListener("pointermove", pointerToPlane);
  canvas.addEventListener("pointerdown", event => {
    pointerToPlane(event);
    if (!game || (game.state === "over" && performance.now() - overAt > 800)) startFlat();
  });
  canvas.addEventListener("keydown", event => {
    if (event.key.startsWith("Arrow")) { keys.add(event.key); event.preventDefault(); }
    if ((event.key === "Enter" || event.key === " ") && (!game || game.state === "over")) { startFlat(); event.preventDefault(); }
  });
  canvas.addEventListener("keyup", event => keys.delete(event.key));
  canvas.addEventListener("blur", () => keys.clear());
  flatButton.addEventListener("click", startFlat);

  // --- Immersive WebXR mode ---------------------------------------------------------------
  let xrSession = null;
  let xrMode = null;
  let refSpace = null;
  let refSpaceType = "";
  let xrLast = 0;
  let floorKnown = false;

  async function supported(mode) {
    try { return Boolean(navigator.xr && await navigator.xr.isSessionSupported(mode)); } catch { return false; }
  }
  async function checkSupport(keepStatus = false) {
    if (!window.isSecureContext) {
      statusEl.textContent = "AR and VR need a secure (HTTPS) page. You can still play in the browser.";
      return;
    }
    const [ar, vr] = await Promise.all([supported("immersive-ar"), supported("immersive-vr")]);
    arButton.disabled = !ar;
    vrButton.disabled = !vr;
    if (keepStatus) return;
    statusEl.textContent = ar || vr
      ? "Ready. Clear your play space, then choose AR or VR. Enable hand tracking on the headset to catch with your hands."
      : "This browser has no immersive WebXR. Open this page in a headset browser (for example Quest Browser), or play in the browser.";
  }

  async function startXR(mode) {
    if (xrSession) { xrSession.end(); return; }
    ensureAudio();
    const button = mode === "immersive-ar" ? arButton : vrButton;
    const optionalFeatures = mode === "immersive-ar"
      ? ["unbounded", "local-floor", "hand-tracking"]
      : ["local-floor", "hand-tracking"];
    arButton.disabled = vrButton.disabled = true;
    statusEl.textContent = "Starting…";
    let session = null;
    try {
      session = await navigator.xr.requestSession(mode, { optionalFeatures });
      if (mode === "immersive-ar" && session.environmentBlendMode === "opaque") {
        throw new Error("This headset reports opaque AR without passthrough");
      }
      await gl.makeXRCompatible();
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl, { alpha: mode === "immersive-ar", antialias: true }) });
      const candidates = mode === "immersive-ar" ? ["unbounded", "local-floor", "local"] : ["local-floor", "local"];
      refSpace = null;
      for (const type of candidates) {
        try { refSpace = await session.requestReferenceSpace(type); refSpaceType = type; break; } catch { /* Try the next space. */ }
      }
      if (!refSpace) throw new Error("No supported tracking space");
    } catch (error) {
      if (session) { try { await session.end(); } catch { /* Already ended. */ } }
      statusEl.textContent = `Could not start ${mode === "immersive-ar" ? "AR" : "VR"}: ${error && error.message ? error.message : error}`;
      void checkSupport(true);
      return;
    }

    xrSession = session;
    xrMode = mode;
    flatRunning = false;
    xrLast = 0;
    floorKnown = false;
    hudPose = null;
    game = Rules.createGame({ spawnHeight: 2.2 });
    scoreboard.reset();
    musicToggleHeld = false;
    button.disabled = false;
    button.textContent = "Exit";
    button.setAttribute("aria-pressed", "true");
    const hands = session.enabledFeatures ? (session.enabledFeatures.includes("hand-tracking") ? "hands enabled" : "hands not granted; use controllers")
      : "hand support unknown";
    statusEl.textContent = `Playing in ${mode === "immersive-ar" ? "AR" : "VR"} · tracking: ${refSpaceType} · ${hands}.`;
    refSpace.addEventListener("reset", () => { scoreboard.reset(); });
    session.addEventListener("squeezestart", event => {
      const grip = gripPositions.get(event.inputSource);
      if (!event.inputSource.hand && grip) scoreboard.grab(event.inputSource, grip, boardTime);
    });
    session.addEventListener("squeezeend", event => scoreboard.release(event.inputSource));
    session.addEventListener("select", () => {
      if (game && game.state === "over" && performance.now() - overAt > 1500) game.restart();
    });
    session.addEventListener("end", onSessionEnd);
    session.requestAnimationFrame(onXRFrame);
    syncMusic();
  }
  function onSessionEnd() {
    const finished = game;
    xrSession = null;
    xrMode = null;
    refSpace = null;
    body = { spheres: [], segments: [], palmFloats: 0 };
    hudPose = null;
    scoreboard.reset();
    gripPositions.clear();
    syncMusic();
    for (const [button, label] of [[arButton, "Play in AR (free roam)"], [vrButton, "Play in VR"]]) {
      button.textContent = label;
      button.setAttribute("aria-pressed", "false");
    }
    statusEl.textContent = finished ? `Session ended. Score: ${finished.score} (caught ${finished.caught}, missed ${finished.missed}).` : "Session ended.";
    void checkSupport(true);
    updatePageHud();
  }
  function endSessionIfAny() {
    if (xrSession) xrSession.end().catch(() => {});
  }

  function pulseControllers(intensity, ms) {
    if (!xrSession) return;
    for (const source of xrSession.inputSources) {
      const actuator = source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0];
      if (actuator && actuator.pulse) { try { actuator.pulse(intensity, ms); } catch { /* Optional. */ } }
    }
  }

  const PALM_JOINT = "middle-finger-metacarpal";
  const gripPositions = new Map();
  let musicToggleHeld = false;
  let boardTime = 0; // XR frame time in seconds, for the scoreboard's filtering
  function addArm(next, headMatrix, wrist, back, handedness) {
    const side = Body.sideOf(handedness, headMatrix, wrist);
    const arm = Body.arm(headMatrix, wrist, back, side);
    if (!arm) return;
    next.segments.push({ a: arm.shoulder, b: arm.elbow, r: 0.045, color: COLORS.arm });
    next.segments.push({ a: arm.elbow, b: arm.wrist, r: 0.032, color: COLORS.arm });
    next.spheres.push({ p: arm.shoulder, r: 0.05, color: COLORS.arm });
    next.spheres.push({ p: arm.elbow, r: 0.042, color: COLORS.arm });
  }
  function addPalm(next, points) {
    const outline = Body.PALM_OUTLINE.map(name => points.get(name)).filter(Boolean).map(j => j.p);
    if (outline.length < 3 || next.palmFloats + outline.length * 18 > PALM_FLOATS) return;
    const c = [0, 1, 2].map(i => outline.reduce((sum, p) => sum + p[i], 0) / outline.length);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const n = normalize(cross([a[0] - c[0], a[1] - c[1], a[2] - c[2]], [b[0] - c[0], b[1] - c[1], b[2] - c[2]]));
      for (const v of [c, a, b]) { palmData.set([v[0], v[1], v[2], n[0], n[1], n[2]], next.palmFloats); next.palmFloats += 6; }
    }
  }
  function collectHands(frame, catchers, headMatrix) {
    const next = { spheres: [], segments: [], palmFloats: 0 };
    // Right thumbstick click toggles the music without leaving the headset.
    let musicButtonDown = false;
    for (const source of xrSession.inputSources) {
      const buttons = source.gamepad && source.gamepad.buttons;
      if (!source.hand && source.handedness === "right" && buttons && buttons[3] && buttons[3].pressed) musicButtonDown = true;
    }
    if (musicButtonDown && !musicToggleHeld) { musicEnabled = !musicEnabled; syncMusic(); }
    musicToggleHeld = musicButtonDown;
    scoreboard.retain(new Set(xrSession.inputSources));
    for (const source of xrSession.inputSources) {
      if (source.hand && frame.getJointPose) {
        const points = new Map();
        for (const [name, joint] of source.hand.entries()) {
          const pose = frame.getJointPose(joint, refSpace);
          if (!pose) continue;
          const p = pose.transform.position;
          if (![p.x, p.y, p.z].every(Number.isFinite)) continue;
          const r = Math.max(0.006, pose.radius || 0.008);
          points.set(name, { p: [p.x, p.y, p.z], r });
          next.spheres.push({ p: [p.x, p.y, p.z], r, color: COLORS.hand });
          catchers.push({ x: p.x, y: p.y, z: p.z, radius: name === PALM_JOINT ? 0.06 : r + 0.015 });
        }
        for (const [from, to] of Body.HAND_BONES) {
          const a = points.get(from), b = points.get(to);
          if (a && b) next.segments.push({ a: a.p, b: b.p, r: Math.min(a.r, b.r) * 0.85, color: COLORS.hand });
        }
        addPalm(next, points);
        const thumb = points.get("thumb-tip"), index = points.get("index-finger-tip");
        scoreboard.updatePinch(source, thumb && thumb.p, index && index.p, boardTime);
        const wrist = points.get("wrist"), palm = points.get(PALM_JOINT);
        if (wrist) {
          const back = palm ? [wrist.p[0] - palm.p[0], wrist.p[1] - palm.p[1], wrist.p[2] - palm.p[2]] : null;
          addArm(next, headMatrix, wrist.p, back, source.handedness);
        }
      } else if (source.gripSpace) {
        const pose = frame.getPose(source.gripSpace, refSpace);
        if (!pose) continue;
        const p = pose.transform.position, g = pose.transform.matrix;
        next.spheres.push({ p: [p.x, p.y, p.z], r: 0.04, color: COLORS.hand });
        catchers.push({ x: p.x, y: p.y, z: p.z, radius: 0.08 });
        gripPositions.set(source, [p.x, p.y, p.z]);
        scoreboard.track(source, [p.x, p.y, p.z], boardTime);
        // The grip's +Z axis points back along the forearm.
        addArm(next, headMatrix, [p.x, p.y, p.z], [g[8], g[9], g[10]], source.handedness);
      }
    }
    body = next;
    if (body.palmFloats) {
      gl.bindBuffer(gl.ARRAY_BUFFER, res.palm.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, palmData.subarray(0, body.palmFloats));
      boundMesh = null;
    }
  }

  function onXRFrame(time, frame) {
    const session = frame.session;
    if (session !== xrSession) return;
    session.requestAnimationFrame(onXRFrame);
    const dt = xrLast ? (time - xrLast) / 1000 : 0;
    xrLast = time;
    boardTime = time / 1000;
    const layer = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    const ar = xrMode === "immersive-ar";
    if (ar) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(0.02, 0.03, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    const head = pose.transform.position;
    const m = pose.transform.matrix;
    if (!floorKnown) {
      // local-floor (and usually unbounded) put y = 0 on the floor; local puts it at the head.
      floorY = refSpaceType === "local-floor" || head.y > 0.9 ? 0 : head.y - 1.55;
      game.setFloor(floorY);
      floorKnown = true;
    }
    showGrid = !ar;

    const catchers = [];
    collectHands(frame, catchers, m);
    if (session.visibilityState === "visible") {
      handleEvents(game.update(dt, { x: head.x, z: head.z }, catchers));
    }

    // The scoreboard stays where it was put; it only turns to face the player.
    if (!scoreboard.position) scoreboard.place(m);
    scoreboard.face([head.x, head.y, head.z]);
    const b = scoreboard.position;
    hudPose = { x: b[0], y: b[1], z: b[2], yaw: scoreboard.yaw };
    updateHudTexture();

    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      drawScene(view.projectionMatrix, view.transform.inverse.matrix);
    }
    updatePageHud();
  }

  arButton.addEventListener("click", () => startXR("immersive-ar"));
  vrButton.addEventListener("click", () => startXR("immersive-vr"));

  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    flatRunning = false;
    endSessionIfAny();
    statusEl.textContent = "The graphics context was lost. Waiting for it to be restored…";
  });
  canvas.addEventListener("webglcontextrestored", () => {
    createResources();
    boundMesh = null;
    statusEl.textContent = "Graphics restored.";
    void checkSupport(true);
    if (game && !xrSession) { flatRunning = true; flatLast = 0; requestAnimationFrame(flatFrame); }
  });
  window.addEventListener("pagehide", endSessionIfAny);

  // Wide viewports fit the screen without scrolling, so the rules start collapsed.
  if (window.matchMedia("(min-width: 900px)").matches) document.querySelector(".help")?.removeAttribute("open");

  // Show an idle preview until the player starts.
  resizeFlat();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawScene(flatCamera.proj, flatCamera.matrix);
  window.addEventListener("resize", () => { if (!flatRunning && !xrSession) { resizeFlat(); gl.viewport(0, 0, canvas.width, canvas.height); drawScene(flatCamera.proj, flatCamera.matrix); } });
  void checkSupport();
})();
