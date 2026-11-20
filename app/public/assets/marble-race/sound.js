// Marble Race sound effects, synthesized with Web Audio (no audio files).
(function (root) {
  "use strict";

  function createSound() {
    let ctx = null;
    let master = null;
    let rumbleGain = null;
    let enabled = true;
    let lastClack = 0;

    function ensure() {
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return true;
      }
      const Ctor = root.AudioContext || root.webkitAudioContext;
      if (!Ctor) return false;
      try {
        ctx = new Ctor();
      } catch (error) {
        return false;
      }
      master = ctx.createGain();
      master.gain.value = enabled ? 0.7 : 0;
      master.connect(ctx.destination);

      // Rolling rumble: looping brown noise through a low-pass filter.
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 380;
      rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0;
      noise.connect(filter).connect(rumbleGain).connect(master);
      noise.start();
      return true;
    }

    function tone(freq, start, duration, type = "sine", volume = 0.2) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    }

    return {
      unlock: ensure,
      setEnabled(on) {
        enabled = on;
        if (master && ctx) master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.05);
      },
      get enabled() { return enabled; },
      count(final) {
        if (!ctx) return;
        tone(final ? 880 : 440, ctx.currentTime, final ? 0.6 : 0.25, "square", 0.08);
      },
      clack(strength) {
        if (!ctx || !enabled) return;
        const now = ctx.currentTime;
        if (now - lastClack < 0.035) return;
        lastClack = now;
        const v = Math.min(0.22, 0.03 + strength * 0.03);
        tone(2400 + Math.random() * 900, now, 0.05, "sine", v);
        tone(4100 + Math.random() * 600, now, 0.03, "triangle", v * 0.5);
      },
      thump(strength) {
        if (!ctx || !enabled) return;
        const now = ctx.currentTime;
        const v = Math.min(0.3, 0.06 + strength * 0.03);
        tone(140 + Math.random() * 30, now, 0.15, "sine", v);
      },
      boing() {
        if (!ctx || !enabled) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        osc.connect(gain).connect(master);
        osc.start(now);
        osc.stop(now + 0.3);
      },
      fanfare() {
        if (!ctx) return;
        const now = ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, now + i * 0.13, 0.35, "square", 0.07));
        tone(1046.5, now + 0.55, 0.9, "triangle", 0.1);
        tone(783.99, now + 0.55, 0.9, "triangle", 0.08);
      },
      ding() {
        if (!ctx) return;
        tone(1318.5, ctx.currentTime, 0.4, "sine", 0.08);
      },
      rumble(speed) {
        if (!rumbleGain || !ctx) return;
        rumbleGain.gain.setTargetAtTime(Math.min(0.35, speed * 0.035), ctx.currentTime, 0.1);
      }
    };
  }

  root.MarbleSound = { createSound };
})(typeof globalThis !== "undefined" ? globalThis : this);
