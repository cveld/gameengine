// Marble Race music: driving, synthesized techno (Web Audio, no audio files).
// 132 BPM, 16 steps per bar. The arrangement follows the race: a filtered
// groove in the lobby, a build-up during the countdown, the full track while
// racing and an open breakdown after the finish. The lava world plays it in a
// darker key with more drive. `pattern` is pure so it can be tested in Node.
(function (root) {
  "use strict";

  const BPM = 132;
  const STEP = 60 / BPM / 4;
  // Bass roots (Hz), one per bar, cycling every four bars.
  const ROOTS = { meadow: [55, 55, 61.74, 49], lava: [46.25, 46.25, 51.91, 41.2] }; // A minor / F# minor
  // 16-step acid line (semitones from the root, null = rest).
  const ACID = [0, null, 12, 0, null, 0, 15, null, 0, 12, null, 10, 0, null, 7, 12];

  // Which voices play on a step. Sections: "lobby", "build", "race", "outro".
  // During a race every 16 bars end with two bars of breakdown (no kick).
  function pattern(step, bar, section) {
    const race = section === "race";
    const phrase = bar % 16;
    const breakdown = race && phrase >= 14;
    const fill = race && phrase === 13 && step >= 12;
    const four = step % 4 === 0;
    return {
      kick: (section === "lobby" || section === "outro" || race) && four && !breakdown,
      // Build-up: kick on every beat, then 8ths, then 16ths in the last bar.
      buildKick: section === "build" && (bar < 1 ? four : bar < 2 ? step % 2 === 0 : true),
      clap: (race || section === "outro") && (step === 4 || step === 12) && !breakdown,
      snareFill: fill,
      closedHat: race ? true : section !== "build" && step % 2 === 0,
      openHat: (race || section === "lobby" || section === "outro") && step % 4 === 2,
      // Rolling bass: the three 16ths after each kick.
      bass: (race || section === "lobby") && !four && !breakdown,
      acid: race && bar % 8 >= 4 && ACID[step] !== null,
      acidNote: ACID[step],
      ride: race && phrase >= 8 && phrase < 14 && step % 4 === 2,
      riser: section === "build",
      stab: race && phrase === 15 && (step === 0 || step === 6 || step === 12)
    };
  }

  function createMusic(ctx) {
    const out = ctx.createGain();
    out.gain.value = 0;
    // Everything runs through a low-pass "room" filter: closed in the lobby,
    // opening up in the build and fully open in the race.
    const room = ctx.createBiquadFilter();
    room.type = "lowpass";
    room.frequency.value = 900;
    room.Q.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    room.connect(comp).connect(out).connect(ctx.destination);

    // Side-chain feel: the bass ducks on every kick.
    const bassBus = ctx.createGain();
    bassBus.connect(room);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const delayLevel = ctx.createGain();
    delayLevel.gain.value = 0.5;
    delay.connect(feedback).connect(delay);
    delay.connect(delayLevel).connect(room);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Soft clipping for the "steaming" drive on the acid line.
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    drive.curve = curve;
    drive.connect(room);
    drive.connect(delay);

    let timer = null, nextTime = 0, step = 0, bar = 0;
    let section = "lobby", nextSection = null, world = "meadow", volume = 0.55;
    let riser = null;

    const env = (gain, t, peak, decay) => {
      gain.gain.setValueAtTime(peak, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    };

    function kick(t, peak = 1) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
      env(g, t, peak, 0.5);
      o.connect(g).connect(room);
      o.start(t); o.stop(t + 0.52);
      // Duck the bass for a pumping groove.
      bassBus.gain.cancelScheduledValues(t);
      bassBus.gain.setValueAtTime(0.25, t);
      bassBus.gain.linearRampToValueAtTime(1, t + STEP * 2.6);
    }
    function noiseHit(t, type, freq, peak, decay, dest = room) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise;
      f.type = type; f.frequency.value = freq;
      env(g, t, peak, decay);
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.02);
    }
    function bass(t, freq) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = freq;
      f.type = "lowpass"; f.Q.value = 4;
      f.frequency.setValueAtTime(world === "lava" ? 520 : 700, t);
      f.frequency.exponentialRampToValueAtTime(140, t + STEP * 0.9);
      env(g, t, 0.34, STEP * 0.92);
      o.connect(f).connect(g).connect(bassBus);
      o.start(t); o.stop(t + STEP);
    }
    function acid(t, freq) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = freq;
      f.type = "lowpass"; f.Q.value = 14;
      const sweep = 0.5 - 0.5 * Math.cos((bar % 8) / 8 * Math.PI * 2);
      f.frequency.setValueAtTime(400 + 2600 * sweep, t);
      f.frequency.exponentialRampToValueAtTime(220, t + STEP * 0.8);
      env(g, t, 0.07, STEP * 0.85);
      o.connect(f).connect(g).connect(drive);
      o.start(t); o.stop(t + STEP);
    }
    function stab(t, rootFreq) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 0.8;
      env(g, t, 0.12, 0.3);
      f.connect(g);
      g.connect(room); g.connect(delay);
      for (const ratio of [1, 1.1892, 1.4983, 2]) {
        const o = ctx.createOscillator();
        o.type = "square"; o.frequency.value = rootFreq * 4 * ratio;
        o.connect(f); o.start(t); o.stop(t + 0.32);
      }
    }
    function startRiser(t) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true;
      f.type = "bandpass"; f.Q.value = 2;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + 3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 3);
      s.connect(f).connect(g).connect(room);
      s.start(t);
      riser = { s, g };
    }
    function stopRiser(t) {
      if (!riser) return;
      riser.g.gain.cancelScheduledValues(t);
      riser.g.gain.setValueAtTime(0.0001, t);
      riser.s.stop(t + 0.05);
      riser = null;
    }

    // Loudness per section, relative to the race.
    const LEVEL = { lobby: 0.45, build: 0.6, race: 1, outro: 0.6 };
    function setRoom(t) {
      if (timer !== null || t === ctx.currentTime) {
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
        out.gain.linearRampToValueAtTime(volume * LEVEL[section], t + (section === "build" ? 3 : section === "race" ? 0.02 : 1));
      }
      const target = { lobby: 900, build: 600, race: 18000, outro: 2600 }[section];
      room.frequency.cancelScheduledValues(t);
      room.frequency.setValueAtTime(room.frequency.value, t);
      if (section === "build") room.frequency.exponentialRampToValueAtTime(9000, t + 3);
      else room.frequency.exponentialRampToValueAtTime(target, t + (section === "race" ? 0.05 : 1.5));
    }

    function schedule() {
      while (nextTime < ctx.currentTime + 0.12) {
        // Section changes land on the next beat, so "GO" hits the downbeat.
        if (nextSection && step % 4 === 0) {
          section = nextSection;
          nextSection = null;
          if (section === "race" || section === "build") { step = 0; bar = 0; }
          if (section === "build") startRiser(nextTime);
          else stopRiser(nextTime);
          setRoom(nextTime);
        }
        const p = pattern(step, bar, section);
        const rootFreq = ROOTS[world][bar % 4];
        if (p.kick) kick(nextTime);
        if (p.buildKick) kick(nextTime, 0.6 + 0.4 * (bar / 3));
        if (p.clap) noiseHit(nextTime, "bandpass", 1600, 0.4, 0.17);
        if (p.snareFill) noiseHit(nextTime, "bandpass", 2200, 0.3, 0.09);
        if (p.closedHat) noiseHit(nextTime, "highpass", 9000, step % 2 === 0 ? 0.07 : 0.035, 0.035);
        if (p.openHat) noiseHit(nextTime, "highpass", 7000, 0.12, 0.2);
        if (p.ride) noiseHit(nextTime, "highpass", 11000, 0.05, 0.45, delay);
        if (p.bass) bass(nextTime, rootFreq * (step % 4 === 3 ? 2 : 1));
        if (p.acid) acid(nextTime, rootFreq * 2 * Math.pow(2, p.acidNote / 12));
        if (p.stab) stab(nextTime, rootFreq);
        nextTime += STEP;
        step = (step + 1) % 16;
        if (step === 0) bar++;
      }
    }

    return {
      get playing() { return timer !== null; },
      get section() { return section; },
      start() {
        if (timer !== null) return;
        step = 0; bar = 0;
        nextTime = ctx.currentTime + 0.05;
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setValueAtTime(0.0001, ctx.currentTime);
        room.frequency.setValueAtTime({ lobby: 900, build: 600, race: 18000, outro: 2600 }[section], ctx.currentTime);
        out.gain.linearRampToValueAtTime(volume * LEVEL[section], ctx.currentTime + 1);
        schedule();
        timer = setInterval(schedule, 25);
      },
      stop() {
        if (timer === null) return;
        clearInterval(timer);
        timer = null;
        stopRiser(ctx.currentTime);
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      },
      setSection(next) {
        if (next === section && !nextSection) return;
        if (timer === null) { section = next; return; }
        nextSection = next;
      },
      setWorld(next) { world = ROOTS[next] ? next : "meadow"; }
    };
  }

  const api = { BPM, STEP, pattern, createMusic };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MarbleMusic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
