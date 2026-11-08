const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pulse, create } = require("../src/assets/orbit/sound.js");
const installMockAudio = require("./helpers/mock-audio.cjs");
const savedContext = globalThis.AudioContext;

test("breathing pulse is deterministic, gently bounded, periodic and can be disabled", () => {
  for (let t = 0; t < 20; t += 0.01) {
    assert.ok(pulse(t) >= 0.927 && pulse(t) <= 1.073);
    assert.equal(pulse(t, false), 1);
    assert.ok(Math.abs(pulse(t) - pulse(t + 1.25)) < 1e-12);
  }
  assert.equal(pulse(0), 1);
  assert.notEqual(pulse(0.3), 1);
});

test("sound is opt-in, fades when paused/muted and follows source/headset poses", async () => {
  const state = installMockAudio();
  try {
    const sound = create();
    assert.equal(state.contexts.length, 0, "Loading must not start audio");
    await sound.unlock();
    const context = state.contexts[0], master = context.nodes[0], panner = context.nodes[1];
    assert.deepEqual(context.nodes.filter(node => node.kind === "oscillator").map(node => node.frequency.value),
      [220, 261.6256, 329.6276, 110], "Keep chord voices out of the very quiet deep-bass range");
    sound.setActive(true);
    sound.update(0.3, 0, true);
    assert.equal(master.gain.value, 0, "XR unlock alone must stay silent");
    sound.setEnabled(true);
    const pose = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 2, 1.6, -3, 1];
    sound.update(0.3, 1, true, [1, 2, -4], pose);
    assert.ok(master.gain.value > 0.10 && master.gain.value <= 0.16);
    assert.deepEqual([panner.positionX.value, panner.positionY.value, panner.positionZ.value], [1, 2, -4]);
    assert.deepEqual([context.listener.positionX.value, context.listener.positionY.value,
      context.listener.positionZ.value], [2, 1.6, -3]);
    assert.equal(context.listener.forwardX.value, -1);
    sound.setActive(false);
    assert.equal(master.gain.value, 0);
    sound.setActive(true); sound.update(1, 1, true);
    sound.toggle();
    assert.equal(master.gain.value, 0);
    assert.equal(sound.enabled, false);
    sound.dispose();
    assert.equal(context.state, "closed");
    assert.ok(context.nodes.every(node => node.disconnected));
    assert.ok(context.nodes.filter(node => node.kind === "oscillator").every(node => node.stopped));
    assert.equal(await sound.unlock(), false);
  } finally { globalThis.AudioContext = savedContext; }
});

test("missing or denied audio leaves rendering usable and reports a retry hint", async () => {
  const messages = [];
  try {
    globalThis.AudioContext = undefined;
    const missing = create({ onStatus: text => messages.push(text) });
    assert.equal(missing.available, false);
    assert.equal(await missing.unlock(), false);
    assert.match(messages.at(-1), /Web Audio/);
    const state = installMockAudio({ failResume: true });
    const denied = create({ onStatus: text => messages.push(text) });
    assert.equal(await denied.unlock(), false);
    assert.match(messages.at(-1), /retry/);
    assert.equal(state.contexts[0].nodes[0].gain.value, 0);
    denied.dispose();
  } finally { globalThis.AudioContext = savedContext; }
});

test("partial audio initialization can be retried without retaining a broken graph", async () => {
  const config = { failGraph: true }, state = installMockAudio(config);
  try {
    const sound = create();
    assert.equal(await sound.unlock(), false);
    assert.equal(state.contexts[0].state, "closed");
    config.failGraph = false;
    assert.equal(await sound.unlock(), true);
    assert.equal(state.contexts.length, 2);
    sound.setEnabled(true); sound.setActive(true); sound.update(0.2, 0, true);
    assert.ok(state.contexts[1].nodes[0].gain.value > 0);
    sound.dispose();
  } finally { globalThis.AudioContext = savedContext; }
});
