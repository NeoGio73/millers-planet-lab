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
/** A number with thousands separators. */
const num = (v, d = 0) => P.fmtNumber(v, d);
/** Scientific notation as markup: 2.66 × 10<sup>−10</sup>. */
function sci(v, d = 2) {
  const e = Math.floor(Math.log10(Math.abs(v)));
  return `${(v / Math.pow(10, e)).toFixed(d)} × 10<sup>${e < 0 ? '−' + -e : e}</sup>`;
}
/** A frequency in hertz, with as many digits as it needs. */
function fmtHz(f) {
  if (f >= 100) return `${f.toFixed(1)} Hz`;
  if (f >= 1) return `${f.toFixed(2)} Hz`;
  return `${f.toPrecision(3)} Hz`;
}
const RS = 'r<sub>s</sub>';

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
  const TABS = ['time', 'escape', 'wave', 'flight'];
  let currentTab = 'time';
  const panelEl = document.querySelector('.panel'), clocksEl = panelEl.querySelector('.clocks'), tabsEl = panelEl.querySelector('.tabs');
  new ResizeObserver(() => panelEl.style.setProperty('--clocks-h', `${clocksEl.offsetHeight}px`)).observe(clocksEl);
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
    tab.addEventListener('click', () => { userTook = true; showTab(t); });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { showTab(TABS[(i + 1) % TABS.length], true); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { showTab(TABS[(i + TABS.length - 1) % TABS.length], true); e.preventDefault(); }
    });
  });
  showTab('time');

  const updatePlot = buildPlot($('plot'));

  // ---- the equation in focus ----
  const CARD_TAB = { dilation: 'time', integral: 'time', surface: 'time', redshift: 'time', escape: 'escape', link: 'escape', tidal: 'wave', speed: 'wave', hover: 'flight', rocket: 'flight', sound: 'flight', loudness: 'flight' };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let focusKey = null, userTook = false;
  // the student takes over when they pick a tab or scroll the panel themselves; a new beat hands control back
  for (const ev of ['wheel', 'touchmove']) panelEl.addEventListener(ev, () => { userTook = true; }, { passive: true });
  panelEl.addEventListener('keydown', (e) => { if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(e.key) && !e.target.closest('input')) userTook = true; });
  function setFocus(key) {
    if (key === focusKey) return;
    const prev = focusKey && panelEl.querySelector(`[data-focus="${focusKey}"]`);
    if (prev) prev.classList.remove('focus');
    focusKey = key;
    const card = key && panelEl.querySelector(`[data-focus="${key}"]`);
    if (!card) return;
    card.classList.add('focus');
    if (userTook) return;
    showTab(CARD_TAB[key]);
    // scroll only when the panel scrolls on its own, beside the scene; under the scene (phones) the page would jump
    if (getComputedStyle(panelEl).overflowY === 'visible' || panelEl.scrollHeight <= panelEl.clientHeight + 4) return;
    const top = panelEl.scrollTop + card.getBoundingClientRect().top - panelEl.getBoundingClientRect().top - clocksEl.offsetHeight - tabsEl.offsetHeight - 12;
    panelEl.scrollTo({ top: Math.max(0, top), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
  function beatChanged() { userTook = false; focusKey && setFocus(null); focusKey = null; }

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
    setHTML('lv-tidal', `At r = ${RS} with M = ${fmtSuns(p.tidalMassExp).replace(' Suns', '')} M<sub>☉</sub> and R = ${R.toFixed(1)} R<sub>E</sub>: Δg = c<sup>6</sup>R ÷ (4G<sup>2</sup>M<sup>2</sup>) = ${dg >= 100 ? num(dg) : dg.toFixed(2)} m/s²`);

    // flight
    const ve = p.exhaustKms * 1000, g = P.MILLER_G;
    setText('out-ve', `${p.exhaustKms.toFixed(1)} km/s`);
    const burn = P.hoverBurn(g, ve), burnE = P.hoverBurn(P.G_EARTH, ve);
    setHTML('lv-hover', `e<sup>−${g.toFixed(2)} × 60 ÷ ${num(ve)}</sup> = ${(1 - burn).toFixed(3)}: ${(100 * burn).toFixed(0)}% of the Ranger's mass burns per minute of hovering. On Earth: ${(100 * burnE).toFixed(1)}%.`);
    const vo = P.vOrbitPlanet(R), vx = P.vEscPlanet(R), r1 = P.massRatio(vo, ve), r2 = P.massRatio(vx, ve), r3 = P.massRatio(P.V_ORBIT_EARTH, ve);
    setText('rk-orbit', r1 < 100 ? r1.toFixed(1) : num(r1));
    setText('rk-escape', r2 < 100 ? r2.toFixed(1) : num(r2));
    setText('rk-orbit-label', `launch mass ÷ final mass, to orbit the planet (${(vo / 1000).toFixed(1)} km/s)`);
    setText('rk-escape-label', `to escape the planet (${(vx / 1000).toFixed(1)} km/s)`);
    setHTML('lv-rocket', `Orbit: e<sup>${(vo / 1000).toFixed(1)} ÷ ${p.exhaustKms.toFixed(1)}</sup> = ${r1.toFixed(1)}, so ${(100 * (1 - 1 / r1)).toFixed(0)}% of the launch mass is fuel. Earth orbit needs e<sup>7.9 ÷ ${p.exhaustKms.toFixed(1)}</sup> = ${r3.toFixed(1)}.`);
  }

  const bind = (id, key) => {
    const el = $(id); el.value = params[key];
    el.addEventListener('input', () => { params[key] = +el.value; refresh(); if (onChange) onChange(key); });
  };
  bind('sl-xE', 'xE'); bind('sl-surface', 'surfaceMin'); bind('sl-radius', 'planetRadius'); bind('sl-mass', 'tidalMassExp'); bind('sl-wave', 'waveKm'); bind('sl-ve', 'exhaustKms');
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
  /** extra: { world: 'space' | 'surface', waveDistance (m, + while it approaches), rangerDist (m from the landing site) } */
  function update(m, extra = { world: 'space', waveDistance: 0, rangerDist: 0 }) {
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
    live(m, extra, docked);
  }

  function live(m, extra, docked) {
    const p = params, x = docked ? p.xE : m.x, dEarth = P.earthMinutesDescent(p, 1), F = P.F, Fe = F(p.xE);
    const shortX = (v) => (v >= 99.95 ? fmtX(v) : v.toFixed(1));
    // time dilation
    if (m.onSurface) setHTML('lv-dilation', `On the planet, r − ${RS} = ${sci(P.X_PLANET_EXCESS)} ${RS}: dτ/dt = 1/61,362 = ${rateHTML(m.rangerRate)}`);
    else setHTML('lv-dilation', `${docked ? 'Docked' : 'Ranger'} at r = ${fmtX(x)} ${RS}: √(1 − 1/${fmtX(x)}) = ${rateHTML(m.rangerRate)}`);
    const k = `(${p.descentMin} min ÷ ${num(p.xE - 1)})`;
    let integ = '';
    if (m.phase === 'descent') integ = `${k} × [F(${fmtX(p.xE)}) − F(${shortX(x)})] = ${k} × (${Fe.toFixed(2)} − ${F(x).toFixed(2)}) = ${P.fmtDuration(m.earth)}`;
    else if (m.phase === 'surface') integ = `Descent: ${k} × [F(${fmtX(p.xE)}) − F(1)] = ${P.fmtDuration(dEarth)}`;
    else if (m.phase === 'ascent') integ = `Ascent so far: ${k} × [F(${shortX(x)}) − F(1)] = ${P.fmtDuration(P.earthMinutesAscent(p, m.s))}`;
    else if (m.phase === 'done') integ = `${P.fmtDuration(dEarth)} + 61,362 × ${fmtMinutes(p.surfaceMin)} + ${P.fmtDuration(dEarth)} = ${P.fmtDuration(m.earth)}`;
    setHTML('lv-integral', integ);
    if (m.onSurface) {
      const surf = m.tau - p.descentMin;
      setHTML('lv-surface', `${P.fmtDuration(surf)} on the surface × 61,362 = ${P.fmtDuration(surf * P.SURFACE_FACTOR)} on Earth`);
    } else setHTML('lv-surface', `Once the Ranger lands: 1 min there × 61,362 = 42.6 days on Earth`);
    // a 440 Hz tone from the Ranger, heard on the Endurance
    const f = P.received(440, m.rangerRate, m.enduranceRate);
    if (docked) setHTML('lv-redshift', `A 440 Hz tone from the docked Ranger arrives at 440 Hz: same place, same clock rate.`);
    else if (f >= 1) setHTML('lv-redshift', `A 440 Hz tone sent from the Ranger now arrives on the Endurance at ${fmtHz(f)}.`);
    else setHTML('lv-redshift', `A 440 Hz tone sent from the surface arrives on the Endurance at ${fmtHz(f)}: one cycle every ${P.fmtDuration(1 / f / 60)}. A one-minute message would take ${P.fmtDuration(m.enduranceRate / m.rangerRate)} to play.`);
    // escape speed and the link to the clocks
    const R = p.planetRadius;
    if (extra.world === 'surface') setHTML('lv-escape', `From Miller's planet: √(2gR) = √(2 × ${P.MILLER_G.toFixed(2)} × ${sci(R * P.R_EARTH)}) m/s = ${(P.vEscPlanet(R) / 1000).toFixed(1)} km/s`);
    else setHTML('lv-escape', `From Gargantua at r = ${fmtX(x)} ${RS}: c √(${RS}/r) = c √(1/${fmtX(x)}) = ${fmtBeta(P.vEscGargantua(x))}`);
    if (m.onSurface) setHTML('lv-link', `On the planet, v<sub>esc</sub> = (1 − ${sci(1 - Math.sqrt(1 - 1 / P.SURFACE_FACTOR ** 2), 1)}) c, so the factor is ${rateHTML(m.rangerRate)}`);
    else { const b = P.vEscGargantua(x); setHTML('lv-link', `√(1 − ${b.toFixed(3)}²) = ${P.rate(x).toFixed(4)} = √(1 − 1/${fmtX(x)})`); }
    // the wave and its sound
    const d = extra.world === 'surface' ? extra.waveDistance : 0, vw = P.WAVE_SPEED, vs = P.SOUND_SPEED;
    let speed = `v = √(${P.MILLER_G.toFixed(2)} × 1,200) = ${vw.toFixed(0)} m/s = ${(vw * 3.6).toFixed(0)} km/h.`;
    if (d > 300) speed += ` The crest is ${(d / 1000).toFixed(1)} km away: it arrives in ${fmtSeconds(d / vw)}, while ${P.fmtDuration((d / vw / 60) * P.SURFACE_FACTOR)} pass on Earth.`;
    else if (d < -300 && d > -40000) speed += ' The crest has passed.';
    setHTML('lv-speed', speed);
    let sound = `√(1.4 × 8.314 × 288 ÷ 0.029) = ${vs.toFixed(0)} m/s.`;
    if (extra.world === 'space') sound += ' Out here there is no air, so nothing to hear.';
    else if (d > 300) sound += ` The crest is ${(d / 1000).toFixed(1)} km away: its roar reaches the Ranger in ${fmtSeconds(d / vs)}, the wave itself in ${fmtSeconds(d / vw)}.`;
    else sound += ` A sound made 20 km away arrives ${fmtSeconds(20000 / vs)} later.`;
    setHTML('lv-sound', sound);
    if (extra.world !== 'surface') setHTML('lv-loud', 'Out of the atmosphere: no air, nothing to hear.');
    else if (extra.rangerDist < 100) setHTML('lv-loud', 'The Ranger is at the landing site.');
    else setHTML('lv-loud', `Heard from the landing site, the Ranger ${extra.rangerDist < 1000 ? Math.round(extra.rangerDist / 10) * 10 + ' m' : (extra.rangerDist / 1000).toFixed(1) + ' km'} away is 20 log<sub>10</sub>(r/100 m) = ${P.dbDrop(extra.rangerDist).toFixed(1)} dB quieter than at 100 m.`);
  }

  return { update, refresh, showTab, setFocus, beatChanged, get tab() { return currentTab; }, get focus() { return focusKey; } };
}
