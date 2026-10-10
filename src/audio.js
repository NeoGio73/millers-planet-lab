// A dry clock tick made in the browser (no recorded audio), for the real-time mode on Miller's planet.

/** Builds the tick: a bright click, a short metallic ring and a soft knock underneath. */
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

export function createTicker() {
  let ctx = null, buffer = null, out = null;
  const api = {
    count: 0,
    /** Must be called from a click or key press: browsers only allow sound after the viewer asks for it. */
    async enable() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!ctx) {
        ctx = new AC();
        buffer = makeTickBuffer(ctx);
        out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      return ctx.state === 'running';
    },
    tick() {
      api.count++;
      if (!ctx || ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 0.98 + Math.random() * 0.04;      // a little life, as a real escapement has
      src.connect(out); src.start();
    },
  };
  return api;
}
