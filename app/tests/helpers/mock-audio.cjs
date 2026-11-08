// Deterministic lifecycle/parameter tests; actual audio output is tested offline.
module.exports = function installMockAudio(config = {}) {
  const state = { contexts: [] };
  const param = value => ({
    value, targets: [],
    cancelScheduledValues() {},
    setTargetAtTime(value, time, constant) { this.value = value; this.targets.push({ value, time, constant }); }
  });
  const position = () => ({ positionX: param(0), positionY: param(0), positionZ: param(0) });
  class Context {
    constructor() {
      this.state = "suspended"; this.currentTime = 0; this.nodes = []; this.resumes = 0;
      this.destination = {};
      this.listener = { ...position(), forwardX: param(0), forwardY: param(0), forwardZ: param(-1),
        upX: param(0), upY: param(1), upZ: param(0) };
      state.contexts.push(this);
    }
    node(kind, props) {
      const node = { kind, connections: [], disconnected: false, ...props,
        connect(target) { this.connections.push(target); return target; },
        disconnect() { this.disconnected = true; } };
      this.nodes.push(node);
      return node;
    }
    createGain() { return this.node("gain", { gain: param(1) }); }
    createPanner() {
      if (config.failGraph) throw new Error("Synthetic graph creation failure");
      return this.node("panner", position());
    }
    createBiquadFilter() { return this.node("filter", { frequency: param(350), Q: param(1) }); }
    createDelay() { return this.node("delay", { delayTime: param(0) }); }
    createOscillator() {
      return this.node("oscillator", { frequency: param(440), detune: param(0),
        start() { this.started = true; }, stop() { this.stopped = true; } });
    }
    async resume() {
      this.resumes++;
      if (config.failResume) throw new Error("Synthetic audio permission failure");
      this.state = "running";
    }
    async close() { this.state = "closed"; }
  }
  globalThis.AudioContext = Context;
  globalThis.mockAudio = state;
  return state;
};
