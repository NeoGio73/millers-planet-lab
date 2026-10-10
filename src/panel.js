// The physics panel: mission clocks, formula tabs, live values, sliders and the rate plot.
import katex from 'katex';
import * as P from './physics.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}, parent) => {
  const el = document.createElementNS(SVG_NS, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
};

// Write to the DOM only when the text really changes: this runs every frame.
const cache = new Map();
function setText(id, text) {
  if (cache.get(id) === text) return;
  cache.set(id, text); const el = $(id); if (el) el.textContent = text;
}
function setHTML(id, html) {
  if (cache.get(id) === html) return;
  cache.set(id, html); const el = $(id); if (el) el.innerHTML = html;
}

/** A rate such as 0.7071, or 1.63 × 10<sup>−5</sup> when it is tiny. */
function rateHTML(v) {
  if (v >= 0.001) return v.toFixed(4);
  const e = Math.floor(Math.log10(v));
  return `${(v / Math.pow(10, e)).toFixed(2)} × 10<sup>−${-e}</sup>`;
}

/** Distance in Schwarzschild radii, with more digits the closer it gets to the horizon. */
function fmtX(x) {
  if (x >= 2 && Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));     // slider values are whole numbers
  if (x >= 99.95) return x.toFixed(0);
  if (x >= 10) return x.toFixed(1);
  if (x >= 1.1) return x.toFixed(2);
  return x.toFixed(3);
}
/** A span of hours as hours, days or years. */
function fmtHours(h) {
  if (h < 10) return `${h.toFixed(3)} h`;
  if (h < 100) return `${h.toFixed(1)} h`;
  if (h < P.HOURS_PER_YEAR) return `${(h / 24).toFixed(1)} days`;
  return `${(h / P.HOURS_PER_YEAR).toFixed(2)} years`;
}
function fmtMinutes(min) {
  const h = Math.floor(min / 60), m = Math.round(min - h * 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
function fmtSeconds(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}
/** A fraction of c, with enough nines to show how close to c it is. */
function fmtBeta(b) {
  if (b < 0.9995) return `${b.toFixed(3)} c`;
  const nines = Math.min(10, Math.max(4, Math.ceil(-Math.log10(1 - b))));
  return `${b.toFixed(nines)} c`;
}
/** 10^e solar masses as markup: 3.2 × 10<sup>7</sup> Suns. */
function fmtSuns(exp) {
  const e = Math.floor(exp + 1e-9), mant = Math.pow(10, exp - e);
  return mant < 1.05 ? `10<sup>${e}</sup> Suns` : `${mant.toFixed(1)} × 10<sup>${e}</sup> Suns`;
}

// ---- the rate plot ---------------------------------------------------------------------------------------
const PLOT = { w: 372, h: 196, l: 34, r: 14, t: 16, b: 24, xMax: 200 };
const LOG_MAX = Math.log10(PLOT.xMax);
const px = (x) => PLOT.l + (Math.log10(Math.max(1, Math.min(PLOT.xMax, x))) / LOG_MAX) * (PLOT.w - PLOT.l - PLOT.r);
const py = (rate) => PLOT.t + (1 - rate) * (PLOT.h - PLOT.t - PLOT.b);
const xFromPx = (sx) => Math.pow(10, Math.min(1, Math.max(0, (sx - PLOT.l) / (PLOT.w - PLOT.l - PLOT.r))) * LOG_MAX);

function buildPlot(host) {
  const C = { grid: '#2A323A', axis: '#8B949C', curve: '#A7AFB6', ink: '#ECE8DF', ink2: '#A7AFB6', surface: '#12161A', ranger: '#C98500', planet: '#3987E5' };
  const svg = svgEl('svg', { viewBox: `0 0 ${PLOT.w} ${PLOT.h}`, role: 'img', tabindex: '0', 'aria-label': 'Clock rate against distance from Gargantua. The rate climbs steeply from zero at the horizon to 0.71 at two Schwarzschild radii and 0.995 at one hundred. The table above gives the live values.' }, host);
  // grid and axes: solid hairlines
  for (const r of [0, 0.5, 1]) {
    svgEl('line', { x1: PLOT.l, x2: PLOT.w - PLOT.r, y1: py(r), y2: py(r), stroke: C.grid, 'stroke-width': 1 }, svg);
    const t = svgEl('text', { x: PLOT.l - 8, y: py(r) + 4, 'text-anchor': 'end', 'font-size': 12, fill: C.axis }, svg); t.textContent = r === 0 ? '0' : r === 1 ? '1' : '0.5';
  }
  for (const x of [1, 2, 5, 10, 20, 50, 100, 200]) {
    svgEl('line', { x1: px(x), x2: px(x), y1: py(0), y2: py(0) + 4, stroke: C.grid, 'stroke-width': 1 }, svg);
    const t = svgEl('text', { x: px(x), y: PLOT.h - 5, 'text-anchor': 'middle', 'font-size': 12, fill: C.axis }, svg); t.textContent = String(x);
  }
  // Earth is the reference line at the top
  const earth = svgEl('g', {}, svg);
  svgEl('circle', { cx: PLOT.l + 12, cy: py(1) - 9, r: 4, fill: 'none', stroke: C.ink, 'stroke-width': 2 }, earth);
  const et = svgEl('text', { x: PLOT.l + 22, y: py(1) - 5, 'font-size': 13, fill: C.ink2 }, earth); et.textContent = 'Earth, far away';
  // the curve
  let d = '';
  for (let i = 0; i <= 140; i++) {
    const t = i / 140, x = Math.pow(10, LOG_MAX * t * t);
    d += `${i ? 'L' : 'M'}${px(x).toFixed(2)} ${py(P.rate(x)).toFixed(2)}`;
  }
  svgEl('path', { d, fill: 'none', stroke: C.curve, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

  // probe (hover / keyboard)
  const probe = svgEl('g', { visibility: 'hidden' }, svg);
  const probeLine = svgEl('line', { y1: PLOT.t, y2: py(0), stroke: '#5B6672', 'stroke-width': 1 }, probe);
  const probeDot = svgEl('circle', { r: 4, fill: C.ink, stroke: C.surface, 'stroke-width': 2 }, probe);

  // marks: planet, Endurance, Ranger, each with a 2px surface ring
  const planet = svgEl('g', {}, svg);
  svgEl('circle', { cx: px(1), cy: py(0), r: 6, fill: C.planet, stroke: C.surface, 'stroke-width': 2 }, planet);
  const pt = svgEl('text', { x: px(1) + 11, y: py(0) - 8, 'font-size': 13, fill: C.ink }, planet); pt.textContent = 'Miller’s planet';
  const endurance = svgEl('g', {}, svg);
  const eMark = svgEl('rect', { width: 11, height: 11, fill: C.ink, stroke: C.surface, 'stroke-width': 2 }, endurance);
  const eText = svgEl('text', { 'font-size': 13, fill: C.ink, 'text-anchor': 'middle' }, endurance);
  const ranger = svgEl('g', {}, svg);
  const rMark = svgEl('circle', { r: 4.5, fill: C.ranger, stroke: C.surface, 'stroke-width': 2 }, ranger);
  const rText = svgEl('text', { 'font-size': 13, fill: C.ink }, ranger); rText.textContent = 'Ranger';

  // tooltip
  const tip = document.createElement('div'); tip.className = 'plot-tip'; tip.hidden = true;
  const tipValue = document.createElement('strong'), tipWhere = document.createElement('span'), tipHour = document.createElement('span');
  tip.append(tipValue, tipWhere, tipHour); host.appendChild(tip);
  let probeX = 10;
  function showProbe(x) {
    probeX = Math.min(PLOT.xMax, Math.max(1, x));
    const r = P.rate(probeX), sx = px(probeX), sy = py(r);
    probe.setAttribute('visibility', 'visible');
    probeLine.setAttribute('x1', sx); probeLine.setAttribute('x2', sx);
    probeDot.setAttribute('cx', sx); probeDot.setAttribute('cy', sy);
    tipValue.textContent = `rate ${r >= 0.001 ? r.toFixed(4) : '0'}`;
    tipWhere.textContent = `at r = ${fmtX(probeX)} rₛ`;
    tipHour.textContent = r > 0 ? `1 h here = ${fmtHours(1 / r)} on Earth` : 'the clock stops';
    tip.hidden = false;
    // sits in the empty space under the curve, beside the crosshair, and never leaves the plot
    const scale = host.clientWidth / PLOT.w, tw = tip.offsetWidth, cx = sx * scale;
    const left = cx + 12 + tw <= host.clientWidth ? cx + 12 : cx - 12 - tw;
    tip.style.left = `${Math.min(host.clientWidth - tw, Math.max(0, left))}px`;
    tip.style.top = `${Math.round(PLOT.h * scale * 0.4)}px`;
  }
  function hideProbe() { probe.setAttribute('visibility', 'hidden'); tip.hidden = true; }
  const fromEvent = (e) => { const b = svg.getBoundingClientRect(); return xFromPx(((e.clientX - b.left) / b.width) * PLOT.w); };
  svg.addEventListener('pointermove', (e) => showProbe(fromEvent(e)));
  svg.addEventListener('pointerdown', (e) => showProbe(fromEvent(e)));
  svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg) hideProbe(); });
  svg.addEventListener('focus', () => showProbe(probeX));
  svg.addEventListener('blur', hideProbe);
  svg.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') { showProbe(Math.pow(10, Math.log10(probeX) - step)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { showProbe(Math.pow(10, Math.log10(probeX) + step)); e.preventDefault(); }
  });

  return function update(xE, xR, rateR, docked) {
    const ex = px(xE), ey = py(P.rate(xE));
    eMark.setAttribute('x', ex - 5.5); eMark.setAttribute('y', ey - 5.5);
    eText.setAttribute('x', Math.min(PLOT.w - PLOT.r - 44, Math.max(PLOT.l + 44, ex))); eText.setAttribute('y', ey + 24);
    eText.textContent = docked ? 'Endurance + Ranger' : 'Endurance';
    const rx = px(xR), ry = py(rateR);
    rMark.setAttribute('cx', rx); rMark.setAttribute('cy', ry);
    // the Ranger's label yields when it sits on top of another mark's label
    const nearE = Math.hypot(rx - ex, ry - ey) < 30, nearP = Math.hypot(rx - px(1), ry - py(0)) < 30;
    rText.setAttribute('visibility', docked || nearE || nearP ? 'hidden' : 'visible');
    // the label sits in the empty space under the curve, left of the mark unless that would run off the plot
    const right = rx < PLOT.l + 60;
    rText.setAttribute('text-anchor', right ? 'start' : 'end');
    rText.setAttribute('x', rx + (right ? 10 : -10)); rText.setAttribute('y', ry + 17);
  };
}

// ---- the panel -------------------------------------------------------------------------------------------
export function createPanel({ params, onChange }) {
  for (const el of document.querySelectorAll('[data-tex]')) {
    katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: el.classList.contains('formula') });
  }

  // tabs
  const TABS = ['time', 'escape', 'wave'];
  let currentTab = 'time';
  function showTab(name, focus = false) {
    currentTab = name;
    for (const t of TABS) {
      const on = t === name, tab = $('tab-' + t);
      tab.setAttribute('aria-selected', on ? 'true' : 'false'); tab.tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
      if (on && focus) tab.focus();
    }
  }
  TABS.forEach((t, i) => {
    const tab = $('tab-' + t);
    tab.addEventListener('click', () => showTab(t));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { showTab(TABS[(i + 1) % TABS.length], true); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { showTab(TABS[(i + TABS.length - 1) % TABS.length], true); e.preventDefault(); }
    });
  });
  showTab('time');

  const updatePlot = buildPlot($('plot'));

  // ---- values that change only when a slider moves ----
  function refresh() {
    const p = params, rateE = P.rate(p.xE);
    // time dilation
    setText('tx-xE', fmtX(p.xE)); setText('tx-xE2', fmtX(p.xE));
    setHTML('tr-endurance', rateHTML(rateE));
    setHTML('out-xE', `${fmtX(p.xE)} r<sub>s</sub>`);
    const lostHours = (1 - rateE) * P.HOURS_PER_YEAR;
    const lost = lostHours < 48 ? `${lostHours.toFixed(0)} hours` : `${(lostHours / 24).toFixed(0)} days`;
    setHTML('xE-note', `Out here the Endurance’s clock falls ${lost} behind Earth’s every year. Park closer and Romilly ages less while he waits, but Gargantua looms larger and climbing back out costs more.`);
    setText('out-surface', fmtMinutes(p.surfaceMin));
    const done = P.missionState(p, 'done', 1);
    const dEarth = P.earthMinutesDescent(p, 1), aEarth = P.earthMinutesAscent(p, 1);
    const filmMin = (P.FILM_ROMILLY_YEARS * P.MINUTES_PER_YEAR / rateE - dEarth - aEarth) / P.SURFACE_FACTOR;
    setText('surface-note', `Whole trip: ${P.fmtHMS(done.tau)} for the Ranger’s crew, ${P.fmtYMD(done.endurance / P.MINUTES_PER_YEAR)} for Romilly on the Endurance, ${P.fmtYMD(done.earth / P.MINUTES_PER_YEAR)} on Earth. The film’s 23 years, 4 months, 8 days for Romilly takes ${fmtMinutes(filmMin)} on the surface.`);

    // escape velocity
    const R = p.planetRadius, vP = P.vEscPlanet(R) / 1000;
    setText('out-radius', `${R.toFixed(1)} Earths`);
    setText('tx-planet', `1.3 g, radius ${R.toFixed(1)} Earths`);
    setText('ve-planet', `${vP.toFixed(1)} km/s`);
    setText('ve-endurance', fmtBeta(P.vEscGargantua(p.xE)));
    const dens = P.planetDensity(R);
    setText('radius-note', `Surface gravity stays at 1.3 g, so the radius sets the mass: ${(1.3 * R * R).toFixed(1)} Earth masses at ${dens.toFixed(2)} times Earth’s density. Escape speed grows as the square root of the radius: ${(vP / (P.V_ESC_EARTH / 1000)).toFixed(2)} times Earth’s here.`);
    const vOrb = P.vOrbGargantua(p.xE), periodS = (2 * Math.PI * p.xE * P.RS) / (vOrb * P.C);
    const period = periodS < 2 * 86400 ? `${(periodS / 3600).toFixed(1)} hours` : `${(periodS / 86400).toFixed(0)} days`;
    setHTML('orbit-note', `Parked at ${fmtX(p.xE)} r<sub>s</sub>, the Endurance circles Gargantua at ${vOrb.toFixed(3)} c, about ${P.fmtNumber(Math.round((vOrb * P.C) / 1e5) * 100)} km/s. One lap takes ${period}. Add ${((Math.SQRT2 - 1) * 100).toFixed(0)}% more speed and it would escape.`);

    // the wave
    setHTML('out-mass', fmtSuns(p.tidalMassExp));
    const dg = P.tidalAcceleration(Math.pow(10, p.tidalMassExp), 1, R * P.R_EARTH), ratio = dg / P.MILLER_G;
    setText('tide-dg', `${dg >= 100 ? P.fmtNumber(dg) : dg.toFixed(1)} m/s²`);
    setText('tide-ratio', `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(2)} ×`);
    setText('tide-note', ratio < 1
      ? 'The planet holds together, stretched into an egg shape with its ocean heaped toward and away from Gargantua. For a planet this close to the horizon the stretch falls as 1/M², so only a very heavy black hole is gentle enough.'
      : 'The stretch beats the planet’s own gravity, so the planet would be pulled apart. For a planet this close to the horizon the stretch falls as 1/M²: this is why Gargantua has to be so heavy.');
    setText('out-wave', `${p.waveKm} km`);
    const eta = P.waveEtaSeconds(p.waveKm);
    setText('wave-eta', fmtSeconds(eta));
    setText('wave-earth', `${((eta / 60) * P.SURFACE_FACTOR / 1440).toFixed(0)} days`);
  }

  const bind = (id, key) => {
    const el = $(id); el.value = params[key];
    el.addEventListener('input', () => { params[key] = +el.value; refresh(); if (onChange) onChange(key); });
  };
  bind('sl-xE', 'xE'); bind('sl-surface', 'surfaceMin'); bind('sl-radius', 'planetRadius'); bind('sl-mass', 'tidalMassExp'); bind('sl-wave', 'waveKm');
  refresh();

  // about and full screen
  const about = $('about');
  $('btn-about').addEventListener('click', () => { if (about.showModal) about.showModal(); else about.setAttribute('open', ''); });
  const full = $('btn-full');
  if (!document.fullscreenEnabled) full.hidden = true;
  full.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => { full.querySelector('span').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });

  // ---- values that follow the animation ----
  function update(m) {
    setText('ck-ranger', P.fmtHMS(m.tau));
    setText('ck-endurance', P.fmtDuration(m.endurance));
    setText('ck-earth', P.fmtDuration(m.earth));
    setHTML('rt-ranger', rateHTML(m.rangerRate));
    setHTML('rt-endurance', rateHTML(m.enduranceRate));
    setHTML('tr-ranger', rateHTML(m.rangerRate));
    const docked = m.phase === 'pre' || m.phase === 'done';
    const where = docked ? 'docked' : m.onSurface ? 'on Miller’s planet' : `r = ${fmtX(m.x)} r<sub>s</sub>`;
    setHTML('tx-ranger-where', where); setHTML('tx-ranger-where2', where);
    setText('hr-earth', fmtHours(1 / m.rangerRate));
    setText('hr-endurance', fmtHours(m.enduranceRate / m.rangerRate));
    setText('ve-ranger', fmtBeta(m.onSurface ? Math.sqrt(1 - 1 / (P.SURFACE_FACTOR * P.SURFACE_FACTOR)) : P.vEscGargantua(m.x)));
    updatePlot(params.xE, m.x, m.rangerRate, docked);

    let note;
    const gap = (earth, tau) => P.fmtDuration(Math.max(0, earth - tau));
    if (m.phase === 'pre') {
      note = 'Nothing to add up yet: the Ranger is still docked. Press play and watch the two sides of the integral pull apart.';
    } else if (m.phase === 'descent') {
      note = `${P.fmtDuration(m.tau)} on the Ranger’s clock so far, ${P.fmtDuration(m.earth)} on Earth’s: a gap of ${gap(m.earth, m.tau)}. The integrand stays close to 1 until r is within a few r<sub>s</sub>.`;
    } else if (m.phase === 'surface') {
      const surf = m.tau - params.descentMin;
      note = `On the surface r is fixed, so the integrand is the constant 61,362 and the integral is a product: ${fmtMinutes(surf)} here is ${P.fmtDuration(surf * P.SURFACE_FACTOR)} on Earth.`;
    } else if (m.phase === 'ascent') {
      note = `Climbing out, the integrand falls back toward 1. Earth has now counted ${P.fmtDuration(m.earth)} against the Ranger’s ${P.fmtHMS(m.tau)}.`;
    } else {
      note = `Whole flight: the Ranger’s clock reads ${P.fmtHMS(m.tau)} and Earth’s ${P.fmtDuration(m.earth)}. Almost all of it built up while the Ranger sat on the surface.`;
    }
    setHTML('integral-note', note);
  }

  return { update, refresh, showTab, get tab() { return currentTab; } };
}
