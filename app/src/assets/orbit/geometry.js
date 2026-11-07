// Parametric surfaces and living motion adapted from Orbit's src/scene.cpp.
// See LICENSE for the original MIT copyright notice.
(function (root) {
  "use strict";
  const TAU = Math.PI * 2;
  const subtract = (a, b) => a.map((value, i) => value - b[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = a => {
    const length = Math.hypot(...a);
    return length > 1e-10 ? a.map(value => value / length) : [0, 1, 0];
  };
  const center = u => [(2 + Math.cos(3 * u)) * Math.cos(2 * u) * 0.66,
    (2 + Math.cos(3 * u)) * Math.sin(2 * u) * 0.66, Math.sin(3 * u) * 0.66];

  function surface(shape, u, v) {
    if (shape === 0) {
      const p = center(u);
      const tangent = normalize(subtract(center(u + 0.001), center(u - 0.001)));
      const n = normalize(cross(tangent, normalize(p)));
      const b = normalize(cross(tangent, n));
      return p.map((value, i) => value + (n[i] * Math.cos(v) + b[i] * Math.sin(v)) * 0.30);
    }
    if (shape === 1) {
      const r = 1.62 + 0.13 * Math.cos(6 * u), tube = 0.50 + 0.07 * Math.sin(3 * u);
      return [(r + tube * Math.cos(v)) * Math.cos(u), (r + tube * Math.cos(v)) * Math.sin(u),
        tube * Math.sin(v) + 0.30 * Math.sin(3 * u)];
    }
    const r = 1.80 + 0.18 * Math.cos(6 * u) * Math.sin(v) ** 2;
    return [r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u)];
  }

  function spikeExtension(time, phase) {
    const ripple = 0.55 * Math.sin(time * 1.1 + phase * 0.7) * Math.sin(time * 0.65);
    const pulse = (1 + Math.sin(time * 2.6 + phase + ripple)) * 0.5;
    return 0.52 * pulse * pulse * (0.86 + 0.14 * Math.cos(time * 0.85) ** 2);
  }

  function buildMesh(shape) {
    if (![0, 1, 2].includes(shape)) throw new RangeError("Unknown sculpture");
    const rows = shape === 2 ? 64 : 112, cols = shape === 2 ? 32 : 16;
    const stride = shape === 2 ? cols + 1 : cols;
    const vmax = shape === 2 ? Math.PI : TAU;
    const original = [], triangles = [], edges = [], tints = [], kinds = [], spikes = [];
    const addTriangle = (a, b, c, tint, kind) => {
      // The trefoil surface uses the opposite winding.
      if (shape === 0 && kind === 0) [b, c] = [c, b];
      triangles.push(a, b, c);
      tints.push(tint);
      kinds.push(kind);
    };
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < stride; j++) original.push(...surface(shape, TAU * i / rows, vmax * j / cols));
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const ni = (i + 1) % rows, nj = shape === 2 ? j + 1 : (j + 1) % cols;
        const a = i * stride + j, b = ni * stride + j, c = ni * stride + nj, d = i * stride + nj;
        const tint = (Math.sin(2 * TAU * i / rows) + 1) * 0.5;
        addTriangle(a, b, c, tint, 0);
        addTriangle(a, c, d, tint, 0);
        edges.push(a, b, a, d);
      }
    }
    function addSpike(u, v) {
      const anchor = surface(shape, u, v);
      const tangent = normalize(subtract(surface(shape, u + 0.001, v), surface(shape, u - 0.001, v)));
      let normal = normalize(cross(tangent, subtract(surface(shape, u, v + 0.001), surface(shape, u, v - 0.001))));
      if (shape === 0) normal = normal.map(value => -value);
      const bitangent = normalize(cross(normal, tangent));
      const radius = [0.065, 0.075, 0.085][shape];
      const base = original.length / 3, tint = (Math.sin(2 * u) + 1) * 0.5;
      for (let k = 0; k < 6; k++) {
        const angle = TAU * k / 6;
        original.push(...anchor.map((value, i) => value + normal[i] * 0.004 +
          (tangent[i] * Math.cos(angle) + bitangent[i] * Math.sin(angle)) * radius));
      }
      const tip = original.length / 3;
      original.push(...anchor);
      for (let k = 0; k < 6; k++) {
        const next = base + (k + 1) % 6;
        addTriangle(base + k, next, tip, tint, 1);
        edges.push(base + k, next, base + k, tip);
      }
      spikes.push({ anchor, tangent, normal, tip, phase: 2 * u + v });
    }
    if (shape === 2) {
      for (let i = 0; i < 400; i++) addSpike(i * Math.PI * (3 - Math.sqrt(5)) % TAU, Math.acos(1 - 2 * (i + 0.5) / 400));
    } else {
      const columns = shape === 0 ? 8 : 12;
      for (let i = 0; i < 48; i++) {
        for (let j = 0; j < columns; j++) addSpike(TAU * (i + 0.5) / 48, TAU * (j + 0.5 + (i % 2) * 0.5) / columns);
      }
    }
    return {
      shape, spikes,
      original: new Float32Array(original),
      positions: new Float32Array(original.length),
      triangles: new Uint16Array(triangles), edges: new Uint16Array(edges),
      tints: new Float32Array(tints), kinds: new Uint8Array(kinds),
      // Position, flat normal, tint, spike flag. Buffers are reused every frame.
      solid: new Float32Array(triangles.length * 8),
      wire: new Float32Array(edges.length * 8)
    };
  }

  function updateMesh(mesh, time) {
    const source = mesh.original, positions = mesh.positions;
    for (const spike of mesh.spikes) {
      const extension = spikeExtension(time, spike.phase);
      const sway = 0.16 * extension * Math.sin(time * 3.2 + spike.phase);
      for (let axis = 0; axis < 3; axis++) {
        source[spike.tip * 3 + axis] = spike.anchor[axis] + spike.normal[axis] * extension + spike.tangent[axis] * sway;
      }
    }
    const breath = 1 + 0.075 * Math.sin(time * 1.7);
    const scaleX = 1 + 0.04 * Math.sin(time * 1.3), scaleY = 1 + 0.055 * Math.sin(time * 1.3 + 1.5);
    for (let i = 0; i < source.length; i += 3) {
      const x = source[i], y = source[i + 1], z = source[i + 2];
      const wave = breath * (1 + 0.035 * Math.sin(x * 1.4 + y * 1.2 - time * 2.1));
      const twist = 0.13 * Math.sin(time * 1.2 + y * 0.8), c = Math.cos(twist), s = Math.sin(twist);
      positions[i] = (x * c + z * s) * wave * scaleX;
      positions[i + 1] = y * wave * scaleY;
      positions[i + 2] = (-x * s + z * c) * wave;
    }
    for (let face = 0; face < mesh.triangles.length / 3; face++) {
      const a = mesh.triangles[face * 3] * 3, b = mesh.triangles[face * 3 + 1] * 3, c = mesh.triangles[face * 3 + 2] * 3;
      const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      for (let corner = 0; corner < 3; corner++) {
        const index = mesh.triangles[face * 3 + corner] * 3, offset = (face * 3 + corner) * 8;
        mesh.solid[offset] = positions[index]; mesh.solid[offset + 1] = positions[index + 1]; mesh.solid[offset + 2] = positions[index + 2];
        mesh.solid[offset + 3] = nx / length; mesh.solid[offset + 4] = ny / length; mesh.solid[offset + 5] = nz / length;
        mesh.solid[offset + 6] = mesh.tints[face]; mesh.solid[offset + 7] = mesh.kinds[face];
      }
    }
    for (let i = 0; i < mesh.edges.length; i++) {
      const index = mesh.edges[i] * 3, offset = i * 8;
      mesh.wire[offset] = positions[index]; mesh.wire[offset + 1] = positions[index + 1]; mesh.wire[offset + 2] = positions[index + 2];
      mesh.wire[offset + 3] = 0; mesh.wire[offset + 4] = 0; mesh.wire[offset + 5] = 1;
      mesh.wire[offset + 6] = 0.5; mesh.wire[offset + 7] = 0;
    }
    return mesh;
  }
  const api = { surface, spikeExtension, buildMesh, updateMesh };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
