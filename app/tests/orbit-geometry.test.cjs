const { test } = require("node:test");
const assert = require("node:assert/strict");
const { surface, spikeExtension, buildMesh, updateMesh } = require("../src/assets/orbit/geometry.js");
const tau = Math.PI * 2;

function near(a, b, epsilon = 1e-5) {
  assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
}

test("surface seams close for every sculpture", () => {
  for (const shape of [0, 1, 2]) {
    for (const v of [0, 0.8, 2.1, Math.PI]) {
      const start = surface(shape, 0, v), end = surface(shape, tau, v);
      start.forEach((value, i) => near(value, end[i]));
    }
    if (shape !== 2) {
      surface(shape, 1.4, 0).forEach((value, i) => near(value, surface(shape, 1.4, tau)[i]));
    }
  }
});

test("sphere poles remain fixed across longitudes", () => {
  for (const u of [0, 1, 3, 5]) {
    near(surface(2, u, 0)[0], 0);
    near(surface(2, u, 0)[1], 1.8);
    near(surface(2, u, Math.PI)[1], -1.8);
    near(surface(2, u, Math.PI)[2], 0);
  }
});

test("spike extension stays within native motion bounds", () => {
  for (let time = 0; time < 20; time += 0.17) {
    for (let phase = 0; phase < tau * 3; phase += 0.5) {
      const value = spikeExtension(time, phase);
      assert.ok(value >= 0 && value <= 0.52);
      assert.equal(value, spikeExtension(time, phase));
    }
  }
});

test("meshes have expected spike counts, valid indices and finite render buffers", () => {
  for (const [shape, count] of [[0, 384], [1, 576], [2, 400]]) {
    const mesh = buildMesh(shape);
    assert.equal(mesh.spikes.length, count);
    const vertexCount = mesh.original.length / 3;
    assert.ok(vertexCount < 65536);
    for (const index of [...mesh.triangles, ...mesh.edges]) assert.ok(index < vertexCount);
    const solid = mesh.solid, wire = mesh.wire, positions = mesh.positions;
    for (const time of [0, 1, 12.3, 1000]) {
      updateMesh(mesh, time);
      assert.ok(mesh.solid.every(Number.isFinite));
      assert.ok(mesh.wire.every(Number.isFinite));
      assert.equal(mesh.solid, solid);
      assert.equal(mesh.wire, wire);
      assert.equal(mesh.positions, positions);
    }
  }
});

test("deformation is deterministic when time is frozen and changes when it advances", () => {
  const mesh = updateMesh(buildMesh(0), 2);
  const frozen = mesh.solid.slice();
  updateMesh(mesh, 2);
  assert.deepEqual(mesh.solid, frozen);
  updateMesh(mesh, 2.1);
  assert.notDeepEqual(mesh.solid, frozen);
});

test("unknown shapes are rejected", () => {
  assert.throws(() => buildMesh(3), RangeError);
  assert.throws(() => buildMesh(-1), RangeError);
});
