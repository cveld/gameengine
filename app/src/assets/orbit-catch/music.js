// Synthesized techno for Orbit Catch: 128 BPM, 16 steps per bar, no audio files.
// `pattern` is pure so the arrangement can be tested in Node.
(function (root) {
  "use strict";
  const BPM = 128;
  const STEP = 60 / BPM / 4;
  // A minor bass line (Hz), one note per bar, cycling every four bars.
  const ROOTS = [55, 55, 65.41, 49];
  const CHORD = [1, 1.1892, 1.4983]; // minor triad ratios

  // Which voices play on a 16th step of a bar. Every 16 bars, bars 14-15 are a
  // breakdown without kick and bass; the first bar is a hats-only intro.
  function pattern(step, bar) {
    const phrase = bar % 16;
    const breakdown = phrase >= 14;
    const intro = bar === 0;
    return {
      kick: !breakdown && !intro && step % 4 === 0,
      clap: !intro && (step === 4 || step === 12),
      closedHat: step % 2 === 0 && step % 4 !== 2,
      openHat: step % 4 === 2,
      bass: !breakdown && !intro && step % 4 !== 0,
      bassFreq: ROOTS[bar % ROOTS.length] * (step % 8 === 7 ? 2 : 1),
      stab: !intro && bar % 2 === 1 && (step === 6 || step === 14),
      // Slow acid sweep of the bass filter over each 8-bar phrase.
      cutoff: 300 + 1700 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * ((bar % 8) * 16 + step) / 128))
    };
  }

  function createTechno(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor).connect(ctx.destination);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    delay.connect(feedback).connect(delay);
    delay.connect(master);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    let timer = null, nextTime = 0, step = 0, bar = 0, volume = 0.5;

    function envelope(gain, t, peak, decay) {
      gain.gain.setValueAtTime(peak, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    }
    function kick(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      envelope(g, t, 1, 0.4);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.42);
    }
    function noiseHit(t, type, freq, peak, decay) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise;
      f.type = type; f.frequency.value = freq;
      envelope(g, t, peak, decay);
      s.connect(f).connect(g).connect(master);
      s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.02);
    }
    function bass(t, freq, cutoff) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = freq;
      f.type = "lowpass"; f.Q.value = 9;
      f.frequency.setValueAtTime(cutoff * 2, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.5), t + STEP * 0.9);
      envelope(g, t, 0.32, STEP * 0.95);
      o.connect(f).connect(g).connect(master);
      o.start(t); o.stop(t + STEP);
    }
    function stab(t, rootFreq) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "lowpass"; f.frequency.value = 2200;
      envelope(g, t, 0.09, 0.22);
      f.connect(g);
      g.connect(master); g.connect(delay);
      for (const ratio of CHORD) {
        const o = ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.value = rootFreq * 4 * ratio;
        o.connect(f); o.start(t); o.stop(t + 0.25);
      }
    }

    function schedule() {
      while (nextTime < ctx.currentTime + 0.12) {
        const p = pattern(step, bar);
        if (p.kick) kick(nextTime);
        if (p.clap) noiseHit(nextTime, "bandpass", 1500, 0.35, 0.16);
        if (p.closedHat) noiseHit(nextTime, "highpass", 8000, 0.08, 0.04);
        if (p.openHat) noiseHit(nextTime, "highpass", 7000, 0.14, 0.18);
        if (p.bass) bass(nextTime, p.bassFreq, p.cutoff);
        if (p.stab) stab(nextTime, ROOTS[bar % ROOTS.length]);
        nextTime += STEP;
        step = (step + 1) % 16;
        if (step === 0) bar++;
      }
    }

    return {
      get playing() { return timer !== null; },
      start() {
        if (timer !== null) return;
        step = 0; bar = 0;
        nextTime = ctx.currentTime + 0.05;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.5);
        schedule();
        timer = setInterval(schedule, 25);
      },
      stop() {
        if (timer === null) return;
        clearInterval(timer);
        timer = null;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      }
    };
  }

  const api = { BPM, pattern, createTechno };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrbitCatchMusic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
