// Locally synthesized ambience: no music files, network requests or autoplay.
(function (root) {
  "use strict";
  function pulse(time, enabled = true) {
    return enabled ? 1 + 0.055 * Math.sin(time * Math.PI * 1.6) +
      0.018 * Math.sin(time * Math.PI * 3.2) : 1;
  }
  function create(options = {}) {
    const AudioContext = root.AudioContext || root.webkitAudioContext;
    let context = null, gain = null, panner = null, voices = [];
    let enabled = false, active = false, disposed = false, initialized = false, lastChord = -1;
    const nodes = [];
    const notify = text => options.onStatus?.(text);
    function level(value) {
      if (!gain || context.state === "closed") return;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(value, context.currentTime, 0.08);
    }
    function initialize() {
      context = new AudioContext();
      gain = context.createGain(); gain.gain.value = 0;
      panner = context.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.5; panner.maxDistance = 15; panner.rolloffFactor = 0.6;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass"; filter.frequency.value = 1100; filter.Q.value = 0.4;
      const delay = context.createDelay(1), feedback = context.createGain(), echo = context.createGain();
      delay.delayTime.value = 0.37; feedback.gain.value = 0.22; echo.gain.value = 0.18;
      nodes.push(gain, panner, filter, delay, feedback, echo);
      filter.connect(gain); filter.connect(delay);
      delay.connect(feedback); feedback.connect(delay);
      delay.connect(echo); echo.connect(gain);
      gain.connect(panner); panner.connect(context.destination);
      voices = [110, 130.8128, 164.8138, 55].map((frequency, index) => {
        const oscillator = context.createOscillator(), volume = context.createGain();
        oscillator.type = index === 3 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index % 2 ? 4 : -4;
        volume.gain.value = index === 3 ? 0.45 : 0.18;
        oscillator.connect(volume); volume.connect(filter); oscillator.start();
        nodes.push(oscillator, volume);
        return oscillator;
      });
      initialized = true;
    }
    async function unlock() {
      if (disposed || !AudioContext) {
        if (!AudioContext) notify("Sound needs a browser with Web Audio support. Orbit still works without it.");
        return false;
      }
      try {
        // Call from Sound or Enter XR's user gesture, before awaiting anything.
        if (!context) initialize();
        await context.resume();
        if (disposed) return false;
        notify("");
        return context.state === "running";
      } catch (error) {
        level(0);
        if (context && !initialized) {
          // A failed graph must be discarded so retry cannot use partial nodes.
          for (const node of nodes) {
            if (typeof node.stop === "function") { try { node.stop(); } catch (ignored) { /* Not started. */ } }
            node.disconnect();
          }
          void context.close().catch(() => {});
          nodes.length = 0; voices = []; context = gain = panner = null;
        }
        notify("Sound could not start. Use Sound off/on to retry; Orbit still works without audio.");
        console.warn("Orbit sound:", error.message);
        return false;
      }
    }
    function setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) level(0);
      options.onChange?.(enabled);
      if (enabled) void unlock();
    }
    function setActive(value) {
      active = Boolean(value);
      if (!active) level(0);
    }
    function setPosition(target, x, y, z) {
      if (target.positionX) {
        target.positionX.value = x; target.positionY.value = y; target.positionZ.value = z;
      } else target.setPosition(x, y, z);
    }
    function update(time, shape, pulseEnabled, source, pose) {
      if (!context || disposed || context.state !== "running") return;
      level(enabled && active ? 0.10 * (0.72 + 0.28 * (pulse(time, pulseEnabled) - 0.927) / 0.146) : 0);
      if (!enabled || !active) return;
      const chord = Math.floor(time / 10) % 4 + shape * 4;
      if (chord !== lastChord) {
        lastChord = chord;
        const transpositions = [1, 0.8908987, 1.1892071, 1.0594631];
        const ratio = transpositions[chord % 4] * [1, 1.122462, 0.943874][shape];
        [110, 130.8128, 164.8138, 55].forEach((frequency, i) =>
          voices[i].frequency.setTargetAtTime(frequency * ratio, context.currentTime, 0.7));
      }
      const listener = context.listener;
      if (pose) {
        setPosition(listener, pose[12], pose[13], pose[14]);
        if (listener.forwardX) {
          listener.forwardX.value = -pose[8]; listener.forwardY.value = -pose[9]; listener.forwardZ.value = -pose[10];
          listener.upX.value = pose[4]; listener.upY.value = pose[5]; listener.upZ.value = pose[6];
        } else listener.setOrientation(-pose[8], -pose[9], -pose[10], pose[4], pose[5], pose[6]);
        setPosition(panner, source[0], source[1], source[2]);
      } else {
        setPosition(listener, 0, 0, 0);
        if (listener.forwardX) {
          listener.forwardX.value = 0; listener.forwardY.value = 0; listener.forwardZ.value = -1;
          listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
        } else listener.setOrientation(0, 0, -1, 0, 1, 0);
        setPosition(panner, 0, 0, -1.8);
      }
    }
    return {
      get enabled() { return enabled; },
      get available() { return Boolean(AudioContext); },
      unlock, setEnabled, setActive, update,
      toggle() { setEnabled(!enabled); },
      dispose() {
        disposed = true; active = false; level(0);
        for (const node of nodes) {
          if (typeof node.stop === "function") { try { node.stop(); } catch (error) { /* Already stopped. */ } }
          node.disconnect();
        }
        if (context && context.state !== "closed") void context.close().catch(() => {});
      }
    };
  }
  const api = { pulse, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitSound = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
