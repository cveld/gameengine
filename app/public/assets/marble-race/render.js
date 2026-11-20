// Marble Race WebGL renderer (WebGL 2 with WebGL 1 fallback, GLSL ES 1.00).
(function (root) {
  "use strict";

  // ---------- matrices (column-major Float32Array(16)) ----------
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
  }
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  function invert(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = det ? 1 / det : 0;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  }

  // Model (rotation columns * scale, translation) and normal matrix (rotation / scale).
  const model = new Float32Array(16);
  const normalMat = new Float32Array(9);
  function setTransform(m, s, c) {
    for (let k = 0; k < 3; k++) {
      model[k * 4] = m[k * 3] * s[k];
      model[k * 4 + 1] = m[k * 3 + 1] * s[k];
      model[k * 4 + 2] = m[k * 3 + 2] * s[k];
      model[k * 4 + 3] = 0;
      normalMat[k * 3] = m[k * 3] / s[k];
      normalMat[k * 3 + 1] = m[k * 3 + 1] / s[k];
      normalMat[k * 3 + 2] = m[k * 3 + 2] / s[k];
    }
    model[12] = c[0]; model[13] = c[1]; model[14] = c[2]; model[15] = 1;
  }
  function quatToMat3(q) {
    const [x, y, z, w] = q;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)
    ];
  }
  // Orthonormal basis with the given unit Y axis.
  function basisFromY(y) {
    const ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let x = [ref[1] * y[2] - ref[2] * y[1], ref[2] * y[0] - ref[0] * y[2], ref[0] * y[1] - ref[1] * y[0]];
    const l = Math.hypot(x[0], x[1], x[2]);
    x = [x[0] / l, x[1] / l, x[2] / l];
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  }
  const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  // ---------- meshes ----------
  function cubeMesh() {
    const p = [], n = [], idx = [];
    const faces = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]
    ];
    for (const [nn, a, b] of faces) {
      const base = p.length / 3;
      for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        p.push(nn[0] + a[0] * sa + b[0] * sb, nn[1] + a[1] * sa + b[1] * sb, nn[2] + a[2] * sa + b[2] * sb);
        n.push(nn[0], nn[1], nn[2]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { p, n, idx };
  }
  function sphereMesh(seg, rings) {
    const p = [], n = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const th = r / rings * Math.PI;
      for (let s = 0; s <= seg; s++) {
        const ph = s / seg * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        p.push(x, y, z); n.push(x, y, z);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < seg; s++) {
        const a = r * (seg + 1) + s, b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { p, n, idx };
  }
  // Cylinder (or cone when topRadius is 0) along Y from -1 to 1.
  function cylinderMesh(seg, topRadius = 1, caps = true) {
    const p = [], n = [], idx = [];
    const slope = (1 - topRadius) / 2;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
      const nl = Math.hypot(1, slope);
      p.push(c, -1, si, c * topRadius, 1, si * topRadius);
      n.push(c / nl, slope / nl, si / nl, c / nl, slope / nl, si / nl);
    }
    for (let s = 0; s < seg; s++) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (caps) {
      for (const y of [-1, 1]) {
        const radius = y > 0 ? topRadius : 1;
        if (radius === 0) continue;
        const center = p.length / 3;
        p.push(0, y, 0); n.push(0, y, 0);
        for (let s = 0; s <= seg; s++) {
          const a = s / seg * Math.PI * 2;
          p.push(Math.cos(a) * radius, y, Math.sin(a) * radius); n.push(0, y, 0);
        }
        for (let s = 0; s < seg; s++) idx.push(center, center + 1 + s, center + 2 + s);
      }
    }
    return { p, n, idx };
  }
  function discMesh(seg) {
    const p = [0, 0, 0], n = [0, 1, 0], idx = [];
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2;
      p.push(Math.cos(a), 0, Math.sin(a)); n.push(0, 1, 0);
    }
    for (let s = 0; s < seg; s++) idx.push(0, 1 + s, 2 + s);
    return { p, n, idx };
  }

  const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMat;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vObjPos;
varying vec3 vObjNormal;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = uNormalMat * aNormal;
  vObjPos = aPos;
  vObjNormal = aNormal;
  gl_Position = uViewProj * world;
}`;

  const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vObjPos;
varying vec3 vObjNormal;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uScale;
uniform float uKind;
uniform float uAlpha;
uniform float uEmissive;
uniform vec3 uCamera;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec2 uFog;
void main() {
  if (uKind > 3.5 && uKind < 4.5) {
    float d = length(vObjPos.xz);
    gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha * (1.0 - smoothstep(0.35, 1.0, d)));
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamera - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  vec3 base = uColor;
  float gloss = 0.08;
  float shine = 24.0;
  if (uKind > 0.5 && uKind < 1.5) {
    // Track floor: soft tiles plus a centre stripe.
    vec2 g = abs(fract(vWorld.xz * 0.5) - 0.5);
    float line = smoothstep(0.47, 0.5, max(g.x, g.y));
    base *= 1.0 - 0.07 * line;
  } else if (uKind > 1.5 && uKind < 2.5) {
    vec3 lp = vObjPos * uScale * 2.6;
    float c = mod(floor(lp.x) + floor(lp.y) + floor(lp.z), 2.0);
    base = mix(vec3(0.08), vec3(0.97), c);
  } else if (uKind > 2.5 && uKind < 3.5) {
    // Glass marble with a swirl that turns with the marble.
    vec3 o = vObjNormal;
    float swirl = sin(o.x * 5.0 + sin(o.y * 4.0 + o.z * 3.0) * 2.2 + o.z * 2.0);
    base = mix(uColor, uColor2, smoothstep(-0.15, 0.25, swirl));
    gloss = 0.9;
    shine = 90.0;
  } else if (uKind > 4.5 && uKind < 5.5) {
    // Ground: meadow checker that fades into the haze.
    vec2 t = floor(vWorld.xz / 6.0);
    float c = mod(t.x + t.y, 2.0);
    base = mix(uColor, uColor2, c * 0.5);
  }
  vec3 l = normalize(uLight);
  float diff = max(dot(n, l), 0.0);
  vec3 sky = vec3(0.62, 0.78, 1.0);
  vec3 ground = vec3(0.42, 0.38, 0.32);
  vec3 ambient = mix(ground, sky, n.y * 0.5 + 0.5) * 0.45;
  vec3 color = base * (ambient + vec3(1.0, 0.96, 0.88) * diff * 0.75);
  vec3 h = normalize(l + v);
  color += vec3(1.0) * pow(max(dot(n, h), 0.0), shine) * gloss;
  if (uKind > 2.5 && uKind < 3.5) {
    vec3 r = reflect(-v, n);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 env = mix(vec3(0.55, 0.5, 0.45), vec3(0.75, 0.88, 1.0), smoothstep(-0.2, 0.4, r.y));
    color = mix(color, env, 0.15 + 0.55 * fres);
  }
  color += base * uEmissive;
  float dist = length(uCamera - vWorld);
  float fog = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  color = mix(color, uFogColor, fog * fog);
  gl_FragColor = vec4(color, uAlpha);
}`;

  const SKY_VERT = `
attribute vec2 aPos;
varying vec2 vPos;
void main() { vPos = aPos; gl_Position = vec4(aPos, 0.999, 1.0); }`;
  const SKY_FRAG = `
precision mediump float;
varying vec2 vPos;
uniform mat4 uInvViewProj;
uniform vec3 uLight;
void main() {
  vec4 a = uInvViewProj * vec4(vPos, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vPos, 1.0, 1.0);
  vec3 dir = normalize(b.xyz / b.w - a.xyz / a.w);
  float t = clamp(dir.y * 1.4 + 0.15, 0.0, 1.0);
  vec3 col = mix(vec3(0.86, 0.9, 0.96), vec3(0.32, 0.56, 0.92), t);
  float sun = max(dot(dir, normalize(uLight)), 0.0);
  col += vec3(1.0, 0.85, 0.6) * (pow(sun, 400.0) * 1.5 + pow(sun, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

  // options.lowPower: for weak GPUs such as a Chromecast (1x pixels, no MSAA, fewer trees).
  function createRenderer(canvas, options = {}) {
    const lowPower = !!options.lowPower;
    const attrs = { antialias: !lowPower, alpha: false, premultipliedAlpha: false, powerPreference: lowPower ? "low-power" : "default" };
    let gl = canvas.getContext("webgl2", attrs);
    let version = 2;
    if (!gl) { gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs); version = 1; }
    if (!gl) return null;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
      return shader;
    }
    function program(vs, fs) {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(prog, 0, "aPos");
      gl.bindAttribLocation(prog, 1, "aNormal");
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "Program link failed");
      const uniforms = {};
      const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        uniforms[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { prog, u: uniforms };
    }

    let main, sky, meshes, skyBuffer;
    function init() {
      main = program(VERT, FRAG);
      sky = program(SKY_VERT, SKY_FRAG);
      meshes = {
        cube: upload(cubeMesh()),
        sphere: upload(sphereMesh(28, 18)),
        cylinder: upload(cylinderMesh(20, 1, true)),
        cone: upload(cylinderMesh(14, 0, true)),
        disc: upload(discMesh(24))
      };
      skyBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }
    function upload(mesh) {
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      const data = new Float32Array(mesh.p.length * 2);
      for (let i = 0; i < mesh.p.length / 3; i++) {
        data.set(mesh.p.slice(i * 3, i * 3 + 3), i * 6);
        data.set(mesh.n.slice(i * 3, i * 3 + 3), i * 6 + 3);
      }
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
      return { vb, ib, count: mesh.idx.length };
    }
    init();

    let lost = false;
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; });
    canvas.addEventListener("webglcontextrestored", () => { lost = false; init(); });

    const LIGHT = [0.45, 0.85, 0.3];
    const FOG = [0.8, 0.86, 0.94];
    let current = null;
    function bindMesh(mesh) {
      if (current === mesh) return;
      current = mesh;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    }
    function draw(mesh, m, s, c, color, opts = {}) {
      setTransform(m, s, c);
      const u = main.u;
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniformMatrix3fv(u.uNormalMat, false, normalMat);
      gl.uniform3fv(u.uColor, color);
      gl.uniform3fv(u.uColor2, opts.color2 || color);
      gl.uniform3fv(u.uScale, s);
      gl.uniform1f(u.uKind, opts.kind || 0);
      gl.uniform1f(u.uAlpha, opts.alpha === undefined ? 1 : opts.alpha);
      gl.uniform1f(u.uEmissive, opts.emissive || 0);
      bindMesh(mesh);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    function drawCapsule(a, b, r, color, opts) {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      const m = basisFromY([d[0] / l, d[1] / l, d[2] / l]);
      draw(meshes.cylinder, m, [r, l / 2, r], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], color, opts);
      draw(meshes.sphere, IDENTITY3, [r, r, r], b, color, opts);
    }

    let scenery = null;
    function prepareScenery(course) {
      const rnd = root.MarbleRace.createRng(course.seed * 31 + 7);
      const trees = [];
      const b = course.bounds;
      const pad = 30;
      for (let i = 0; i < (lowPower ? 40 : 90); i++) {
        const x = b.min[0] - pad + rnd() * (b.max[0] - b.min[0] + pad * 2);
        const z = b.min[2] - pad + rnd() * (b.max[2] - b.min[2] + pad * 2);
        const h = 2.5 + rnd() * 3;
        trees.push({ x, z, h, shade: 0.75 + rnd() * 0.35 });
      }
      scenery = { course, trees };
    }

    function render(scene) {
      if (lost) return;
      const { course, marbles, camera, time } = scene;
      if (!scenery || scenery.course !== course) prepareScenery(course);
      const dpr = lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const proj = perspective(camera.fov || 0.95, w / h, 0.1, 700);
      const view = lookAt(camera.eye, camera.target, [0, 1, 0]);
      const viewProj = multiply(proj, view);
      scene.viewProj = viewProj;
      current = null;

      // Sky.
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(sky.prog);
      gl.uniformMatrix4fv(sky.u.uInvViewProj, false, invert(viewProj));
      gl.uniform3fv(sky.u.uLight, LIGHT);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
      gl.enableVertexAttribArray(0);
      gl.disableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.useProgram(main.prog);
      const u = main.u;
      gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
      gl.uniform3fv(u.uCamera, camera.eye);
      gl.uniform3fv(u.uLight, LIGHT);
      gl.uniform3fv(u.uFogColor, FOG);
      gl.uniform2f(u.uFog, 60, 420);

      // Ground, trees and pillars.
      const gy = course.groundY;
      const cx = (course.bounds.min[0] + course.bounds.max[0]) / 2, cz = (course.bounds.min[2] + course.bounds.max[2]) / 2;
      draw(meshes.cube, IDENTITY3, [600, 0.5, 600], [cx, gy - 0.5, cz], [0.42, 0.66, 0.3], { kind: 5, color2: [0.52, 0.76, 0.36] });
      for (const t of scenery.trees) {
        draw(meshes.cylinder, IDENTITY3, [0.22, t.h * 0.2, 0.22], [t.x, gy + t.h * 0.2, t.z], [0.45, 0.3, 0.18]);
        draw(meshes.cone, IDENTITY3, [t.h * 0.32, t.h * 0.45, t.h * 0.32], [t.x, gy + t.h * 0.4 + t.h * 0.45, t.z], [0.16 * t.shade, 0.5 * t.shade, 0.24 * t.shade]);
      }
      for (const d of course.deco) {
        if (d.type === "pillar") {
          const top = d.c[1] - 0.4;
          const half = (top - gy) / 2;
          if (half > 0) draw(meshes.cylinder, IDENTITY3, [0.45, half, 0.45], [d.c[0], gy + half, d.c[2]], d.color);
        } else {
          draw(meshes.cube, d.m, d.h, d.c, d.color, { kind: d.kind || 0 });
        }
      }

      // Course solids.
      for (const s of course.solids) {
        if (s.type === "box") {
          draw(meshes.cube, s.m, s.h, s.c, s.color || [0.8, 0.8, 0.8], { kind: s.kind || 0 });
        } else {
          let emissive = 0;
          if (s.tag === "bumper" && s.lastHit !== undefined) emissive = Math.max(0, 0.9 - (time - s.lastHit) * 3);
          drawCapsule(s.a, s.b, s.r, s.color || [0.5, 0.5, 0.5], { emissive });
        }
      }

      // Marbles.
      for (const m of marbles) {
        draw(meshes.sphere, quatToMat3(m.q), [0.3, 0.3, 0.3], m.p, m.color, { kind: 3, color2: m.accent, emissive: m.highlight ? 0.12 : 0 });
      }

      // Blob shadows.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -4);
      for (const m of marbles) {
        const hit = root.MarbleRace.floorBelow(course, m.p, 12);
        if (!hit) continue;
        const height = hit.distance;
        const alpha = Math.max(0, 0.45 - height * 0.05);
        if (alpha <= 0.01) continue;
        const size = 0.3 * (1 + height * 0.15);
        const nrm = hit.normal;
        draw(meshes.disc, basisFromY(nrm), [size, 1, size], [m.p[0], hit.y + 0.01, m.p[2]], [0, 0, 0], { kind: 4, alpha });
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // Project a world point to CSS pixels; null when behind the camera.
    function project(viewProj, p) {
      if (!viewProj) return null;
      const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
      const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
      const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
      if (w <= 0.1) return null;
      return { x: (x / w * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - y / w * 0.5) * canvas.clientHeight, depth: w };
    }

    return { gl, version, render, project, isLost: () => lost };
  }

  root.MarbleRender = { createRenderer, perspective, lookAt, multiply, invert };
})(typeof globalThis !== "undefined" ? globalThis : this);
