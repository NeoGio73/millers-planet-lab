// Sound for the simulation, all made in the browser with the Web Audio API (no recorded audio, nothing from the film).
// Engines, wind, water and the wave only sound in the atmosphere of Miller's planet; space is silent.

/** The clock tick: a bright click, a short metallic ring and a soft knock underneath. */
function makeTickBuffer(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 0.09);
  const buffer = ctx.createBuffer(1, n, sr), d = buffer.getChannelData(0);
  let seed = 12345;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let prev = 0, hp = 0, lp = 0, lp2 = 0, peak = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 3600) / sr);                    // two-pole low-pass corner for the click
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = noise(); hp = 0.82 * (hp + w - prev); prev = w; lp += k * (hp - lp); lp2 += k * (lp - lp2);   // band-passed noise
    const click = lp2 * Math.exp(-t / 0.0028) * 1.6;
    const ring = Math.sin(2 * Math.PI * 2350 * t) * Math.exp(-t / 0.005) * 0.32
               + Math.sin(2 * Math.PI * 1180 * t) * Math.exp(-t / 0.011) * 0.24;
    const knock = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t / 0.022) * 0.22;
    const v = (click + ring + knock) * Math.min(1, t / 0.0003);
    d[i] = v; peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
  return buffer;
}

/** Four seconds of looping noise: 'white', or 'brown' (deep and rumbling). */
function makeNoiseBuffer(ctx, kind, seed) {
  const sr = ctx.sampleRate, n = sr * 4;
  const buffer = ctx.createBuffer(1, n, sr), d = buffer.getChannelData(0);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let b = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd();
    if (kind === 'brown') { b = (b + 0.02 * w) / 1.02; d[i] = b; } else d[i] = w;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= peak;
  // fade the loop's ends into each other so it repeats without a click
  const f = Math.round(sr * 0.05);
  for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
  return buffer;
}

export function createSound() {
  let ctx = null, master = null, tickOut = null, tickBuffer = null;
  const layers = {};
  const api = {
    on: false,          // the viewer's choice
    count: 0,           // ticks played (for the tests)
    levels: { engine: 0, wind: 0, water: 0, wave: 0 },

    /** Must run inside a click or key press: browsers allow sound only after the viewer asks for it. */
    async enable() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!ctx) build(new AC());
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      return ctx.state === 'running';
    },

    /**
     * Called every frame. engine: thrust 0–1; engineDistance: metres from the listener; wind, water: 0–1;
     * waveDistance: metres to the wave's crest (0 when there is none); air: false in space; playing: the animation runs.
     */
    update(s) {
      if (!ctx) return;
      const now = ctx.currentTime, air = s.air && s.playing;
      // amplitude falls as 1/r, so intensity falls as 1/r²: the rule on the Loudness card
      const engine = air ? s.engine * Math.min(1, 45 / Math.max(1, s.engineDistance)) : 0;
      const wave = air && s.waveDistance > 0 ? Math.min(1, 1600 / Math.max(1, Math.abs(s.waveDistance))) : 0;
      const L = api.levels;
      L.engine = engine; L.wind = air ? s.wind : 0; L.water = air ? s.water : 0; L.wave = wave;
      const set = (param, v, tc = 0.12) => param.setTargetAtTime(v, now, tc);
      set(layers.engineRumble.gain, 0.9 * L.engine);
      set(layers.engineRoar.gain, 0.42 * L.engine * L.engine);
      set(layers.engineFilter.frequency, 500 + 1300 * L.engine);
      set(layers.wind.gain, 0.16 * L.wind, 0.4);
      set(layers.water.gain, 0.22 * L.water, 0.4);
      set(layers.waveRumble.gain, 1.0 * L.wave, 0.25);
      set(layers.waveHiss.gain, 0.22 * L.wave * L.wave, 0.25);
      set(master.gain, api.on ? 1 : 0, 0.08);
    },

    tick() {
      api.count++;
      if (!ctx || !api.on || ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      src.buffer = tickBuffer;
      src.playbackRate.value = 0.98 + Math.random() * 0.04;      // a little life, as a real escapement has
      src.connect(tickOut); src.start();
    },
  };

  function build(audio) {
    ctx = audio;
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -14; out.ratio.value = 4; out.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0; master.connect(out);
    tickOut = ctx.createGain(); tickOut.gain.value = 0.5; tickOut.connect(out);
    tickBuffer = makeTickBuffer(ctx);
    const white = makeNoiseBuffer(ctx, 'white', 777), brown = makeNoiseBuffer(ctx, 'brown', 4242);

    const loop = (buffer, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
    const filter = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
    // a slow random wobble for gusts and swells
    const lfo = (freq, depth, target) => { const o = ctx.createOscillator(); o.frequency.value = freq; const g = gain(depth); o.connect(g); g.connect(target); o.start(); };

    // engines: a deep rumble plus a roar whose brightness rises with thrust
    layers.engineRumble = gain(); chain(loop(brown, 1.0), filter('lowpass', 160), layers.engineRumble, master);
    layers.engineFilter = filter('bandpass', 900, 0.6);
    layers.engineRoar = gain(); chain(loop(white, 1.0), layers.engineFilter, layers.engineRoar, master);
    // wind: band-passed noise that gusts
    const windBand = filter('bandpass', 420, 0.8); lfo(0.13, 160, windBand.frequency);
    layers.wind = gain(); chain(loop(white, 0.97), windBand, layers.wind, master);
    // water: soft swell and lap
    const waterSwell = gain(0.7); lfo(0.21, 0.3, waterSwell.gain);
    layers.water = gain(); chain(loop(brown, 1.6), filter('highpass', 180), filter('lowpass', 1400), waterSwell, layers.water, master);
    // the wave: a low roar that grows as it closes in, with the hiss of white water when it is near
    layers.waveRumble = gain(); chain(loop(brown, 0.8), filter('lowpass', 110), layers.waveRumble, master);
    layers.waveHiss = gain(); chain(loop(white, 0.9), filter('lowpass', 2200), filter('highpass', 400), layers.waveHiss, master);
  }

  return api;
}
