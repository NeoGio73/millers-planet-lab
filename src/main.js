// Mission to Miller's planet: boot, asset loading, render loop, transport controls and scene labels.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createSpace, SPACE } from './space.js';
import { createSurface, SURF } from './surface.js';
import { Director, BEATS } from './director.js';
import { createPanel } from './panel.js';
import * as P from './physics.js';
import { createSound } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const canvas = $('gl'), viewport = $('viewport');

function fail(message) {
  $('loading').hidden = false; $('start').hidden = true;
  $('loading-text').textContent = message;
  $('loading-bar').parentElement.hidden = true;
}

// A small procedural sky rendered into an environment map, so metal has something to reflect.
function makeEnvironment(renderer, uniforms, body) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const decl = Object.keys(uniforms).map((k) => `uniform vec3 ${k};`).join(' ');
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; ${decl} void main(){ vec3 d = normalize(vDir); vec3 col; ${body} gl_FragColor = vec4(col, 1.0); }`,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), material);
  scene.add(sphere);
  const texture = pmrem.fromScene(scene, 0, 0.1, 100).texture;
  sphere.geometry.dispose(); material.dispose(); pmrem.dispose();
  return texture;
}

async function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    fail('This browser could not start WebGL, which the 3D view needs. Try a current version of Chrome, Edge, Firefox or Safari.');
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---- assets ----
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => { $('loading-bar').style.width = `${Math.round((100 * loaded) / total)}%`; };
  const textures = new THREE.TextureLoader(manager);
  const models = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const tex = (url, srgb, repeat) => textures.loadAsync(url).then((t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  });
  const glb = (url) => models.loadAsync(url).then((g) => g.scene);
  const [gargantua, ocean, clouds, endurance, ranger] = await Promise.all([
    tex('assets/textures/gargantua.webp', true, false),
    tex('assets/textures/miller_ocean.jpg', true, true),
    tex('assets/textures/miller_clouds.jpg', false, true),
    glb('assets/models/endurance.glb'),
    glb('assets/models/ranger.glb'),
  ]);

  const envSpace = makeEnvironment(renderer, { uG: { value: SPACE.gargantuaDir.clone() }, uP: { value: SPACE.planetCenter.clone().normalize() } }, `
    float g = max(dot(d, uG), 0.0);
    col = vec3(0.035, 0.040, 0.052);
    col += vec3(1.0, 0.80, 0.56) * (pow(g, 90.0) * 9.0 + pow(g, 5.0) * 0.22);
    col += vec3(0.20, 0.34, 0.58) * smoothstep(0.35, 0.95, dot(d, uP)) * 0.55;`);
  const envSurface = makeEnvironment(renderer, { uSky: { value: new THREE.Color(0.80, 0.86, 0.88) }, uSea: { value: new THREE.Color(0.16, 0.25, 0.28) } }, `
    col = mix(uSea, uSky * (0.85 + 0.45 * max(d.y, 0.0)), smoothstep(-0.08, 0.10, d.y));`);

  // The Ranger's baked maps were made for a bright studio. Out here its dark steel and deep creases would turn black,
  // so ease the metal and the ambient occlusion.
  ranger.traverse((o) => {
    if (o.isMesh && o.material && o.material.name === 'RangerBaked') { o.material.metalness = 0.55; o.material.aoMapIntensity = 0.6; }
  });

  const assets = { gargantua, ocean, clouds, endurance, ranger, envSpace, envSurface };
  const space = createSpace(assets, renderer);
  const surface = createSurface(assets);
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.3, 30000);
  const params = { ...P.DEFAULTS };
  const director = new Director({ space, surface, camera, params });
  const panel = createPanel({ params });

  // ---- sizing ----
  function resize() {
    const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep at least a 56° horizontal field of view when the viewport is narrow
    camera.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(28)) / camera.aspect)));
    camera.updateProjectionMatrix();
    surface.setViewport(h * renderer.getPixelRatio(), THREE.MathUtils.degToRad(camera.fov));
  }
  new ResizeObserver(resize).observe(viewport);
  resize();

  // ---- labels pinned to things in the scene ----
  const labelHost = $('labels');
  const labels = {};
  const addLabel = (key, html) => { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = html; el.style.opacity = '0'; labelHost.appendChild(el); labels[key] = { el, shown: false }; };
  addLabel('gargantua', '<i class="mk mk-hole"></i>Gargantua');
  addLabel('endurance', '<i class="mk mk-endurance"></i>Endurance');
  addLabel('ranger', '<i class="mk mk-ranger"></i>Ranger');
  addLabel('planet', '<i class="mk mk-planet"></i>Miller’s planet');
  addLabel('wave', 'Wave <small></small>');
  const waveSmall = labels.wave.el.querySelector('small');
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), camUp = new THREE.Vector3(), camFwd = new THREE.Vector3();
  let waveText = '';

  /**
   * Pins a label dyPx above a world point (or below it when there is no room above).
   * Returns false when the point is behind the camera or outside the frame.
   */
  function place(key, world, dyPx, w, h, keepInside = false) {
    const L = labels[key];
    v.copy(world).project(camera);
    if (!(v.z > -1 && v.z < 1)) return false;
    let x = (v.x * 0.5 + 0.5) * w, y0 = (-v.y * 0.5 + 0.5) * h, y = y0 - dyPx, below = false;
    const blocked = (yy) => yy < 44 || (x < 250 && yy < 130);     // top edge, or the beat title
    if (keepInside) { x = clamp(x, 90, w - 90); y = clamp(y, 150, h - 16); }
    else {
      if (blocked(y)) { below = true; y = y0 + dyPx; }
      if (x < 40 || x > w - 40 || y > h - (below ? 34 : 4) || blocked(y + (below ? 30 : 0))) return false;
    }
    if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    L.x = x; L.top = below ? y : y - L.h;
    return true;
  }
  document.fonts && document.fonts.ready.then(() => { for (const k in labels) labels[k].w = 0; });

  /** Labels that would overlap are stacked: a later label moves up above an earlier one. */
  const ORDER = ['ranger', 'endurance', 'gargantua', 'wave', 'planet'];
  function settleLabels(h) {
    const boxes = [];
    for (const key of ORDER) {
      const L = labels[key]; if (!L.next) continue;
      let top = L.top;
      for (let pass = 0; pass < 3; pass++) {
        const hit = boxes.find((b) => Math.abs(b.x - L.x) < (b.w + L.w) / 2 + 6 && top < b.top + b.h + 4 && top + L.h + 4 > b.top);
        if (!hit) break;
        top = hit.top - L.h - 6;
      }
      if (top < 4 || top + L.h > h) { L.next = false; continue; }
      boxes.push({ x: L.x, w: L.w, top, h: L.h });
      L.el.style.transform = `translate(${(L.x - L.w / 2).toFixed(1)}px, ${top.toFixed(1)}px)`;
    }
  }

  function updateLabels(out) {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const want = new Set(out.fade > 0.45 ? [] : out.labels);
    const pxPerRad = (h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion); camera.getWorldDirection(camFwd);
    for (const key in labels) {
      let ok = want.has(key);
      if (ok && out.world === 'space') {
        if (key === 'gargantua') ok = place(key, space.gargantua.position, Math.tan(space.shadowAngle) * pxPerRad * 1.7 + 10, w, h);
        else if (key === 'endurance') ok = place(key, v2.copy(camUp).multiplyScalar(4.5), 6, w, h);
        else if (key === 'ranger') ok = place(key, v2.copy(space.ranger.rig.position).addScaledVector(camUp, 0.75), 6, w, h);
        else if (key === 'planet') {
          // a point on the globe near the limb closest to the middle of the view
          const pc = SPACE.planetCenter, toC = v2.copy(pc).sub(camera.position), t = toC.dot(camFwd);
          const axisPoint = new THREE.Vector3().copy(camera.position).addScaledVector(camFwd, Math.max(t, 1));
          const outward = axisPoint.sub(pc);
          if (outward.length() < SPACE.planetRadius) ok = false;      // looking straight at the planet: it needs no label
          else {
            const toCam = new THREE.Vector3().copy(camera.position).sub(pc).normalize();
            const dir = outward.normalize().multiplyScalar(0.86).addScaledVector(toCam, 0.5).normalize();
            ok = place(key, dir.multiplyScalar(SPACE.planetRadius).add(pc), 0, w, h, true);
          }
        } else ok = false;
      } else if (ok) {
        if (key === 'ranger') ok = place(key, v2.copy(surface.ranger.rig.position).addScaledVector(camUp, 5.5), 6, w, h);
        else if (key === 'wave') {
          // pin the label where the view meets the wave front, kept to the nearer, clearer stretch of it
          const d = out.waveDistance, viewAz = Math.atan2(camFwd.x, -camFwd.z), az = clamp(viewAz, -0.6, 0.6);
          ok = d > 2600 && d < 46000 && camFwd.z < 0 && Math.abs(viewAz - az) < 0.4
            && place(key, v2.set(camera.position.x + Math.tan(az) * (d + camera.position.z), Math.min(700, 0.6 * P.WAVE_HEIGHT), -d), 0, w, h);
          const text = `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km away`;
          if (ok && text !== waveText) { waveText = text; waveSmall.textContent = text; labels.wave.w = 0; ok = place(key, v2, 0, w, h); }
        } else ok = false;
      }
      labels[key].next = ok;
    }
    settleLabels(h);
    for (const key in labels) {
      const L = labels[key];
      if (L.next !== L.shown) { L.shown = L.next; L.el.style.opacity = L.next ? '1' : '0'; }
    }
  }

  // ---- transport ----
  const beatsNav = $('beats'), beatButtons = [];
  BEATS.forEach((b, i) => {
    const btn = document.createElement('button'); btn.type = 'button';
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1).padStart(2, '0');
    const t = document.createElement('span'); t.className = 't'; t.textContent = b.name;
    btn.append(n, t);
    btn.addEventListener('click', () => { begin(); director.goto(i, 0); director.playing = true; sync(); });
    beatsNav.appendChild(btn); beatButtons.push(btn);
  });
  const btnPlay = $('btn-play'), btnNext = $('btn-next'), scrub = $('scrub'), caption = $('caption'), fade = $('fade');
  let started = false, lastCaption = '', lastFade = -1, lastScrub = -1;

  function sync() {
    const i = director.beat, last = i === BEATS.length - 1, ended = director.p >= 1 && !director.playing;
    const held = director.held && !director.playing;
    $('ico-play').toggleAttribute('hidden', director.playing); $('ico-pause').toggleAttribute('hidden', !director.playing);
    btnPlay.classList.toggle('held', held);
    btnPlay.setAttribute('aria-label', director.playing ? 'Pause' : held ? 'Continue' : 'Play');
    beatButtons.forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('current', k === i); if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    $('beat-count').textContent = `Beat ${i + 1} of ${BEATS.length}`;
    $('beat-name').textContent = BEATS[i].name;
    btnNext.textContent = last ? 'Start over' : 'Next beat';
    btnNext.classList.toggle('primary', ended);
  }
  function begin() { if (!started) { started = true; $('start').hidden = true; } }
  function next() {
    begin();
    if (director.beat < BEATS.length - 1) director.goto(director.beat + 1, 0); else director.goto(0, 0);
    director.playing = true; sync();
  }
  function togglePlay() {
    begin();
    if (director.playing) director.playing = false;
    else if (director.p >= 1) return next();
    else { director.playing = true; director.held = false; }
    sync();
  }
  director.onHold = () => sync();

  // pausing at each equation: on unless the viewer (or an instructor at a projector) turns it off; remembered per browser
  const btnHolds = $('btn-holds');
  try { const saved = localStorage.getItem('mpl.pauseAtEquations'); if (saved !== null) director.pauseAtEquations = saved === '1'; } catch (e) { /* storage unavailable */ }
  function syncHolds() {
    btnHolds.setAttribute('aria-pressed', String(director.pauseAtEquations));
    $('ico-hold-on').toggleAttribute('hidden', !director.pauseAtEquations); $('ico-hold-off').toggleAttribute('hidden', director.pauseAtEquations);
  }
  btnHolds.addEventListener('click', () => {
    director.pauseAtEquations = !director.pauseAtEquations;
    try { localStorage.setItem('mpl.pauseAtEquations', director.pauseAtEquations ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    syncHolds();
  });
  syncHolds();
  director.onBeatChange = () => panel.beatChanged();
  director.onBeatEnd = () => sync();
  btnPlay.addEventListener('click', togglePlay);
  btnNext.addEventListener('click', next);
  $('btn-start').addEventListener('click', () => { begin(); director.playing = true; sync(); btnPlay.focus({ preventScroll: true }); });
  scrub.addEventListener('input', () => { begin(); director.playing = false; director.seek(scrub.value / 1000); sync(); });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target;
    if (el.closest && el.closest('input, button, dialog, [role=tab], svg, a')) return;
    if (e.key === ' ' || e.key === 'k') { togglePlay(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
  });

  // ---- looking around ----
  const pointers = new Map(); let pinch = 0;
  const hint = $('hint');
  const engaged = () => { if (hint.style.opacity !== '0') hint.style.opacity = '0'; };
  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .listen')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture(e.pointerId); viewport.classList.add('dragging');
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  viewport.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      director.look.yaw = clamp(director.look.yaw - dx * 0.005, -2.6, 2.6);
      director.look.pitch = clamp(director.look.pitch + dy * 0.004, -0.45, 0.6);
      if (Math.abs(dx) + Math.abs(dy) > 1) engaged();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) director.look.zoom = clamp(director.look.zoom * (pinch / Math.max(d, 1)), 0.5, 2.2);
      pinch = d; engaged();
    }
  });
  const release = (e) => { pointers.delete(e.pointerId); pinch = 0; if (!pointers.size) viewport.classList.remove('dragging'); };
  viewport.addEventListener('pointerup', release); viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('wheel', (e) => {
    if (!started) return;
    e.preventDefault(); engaged();
    director.look.zoom = clamp(director.look.zoom * Math.exp(e.deltaY * 0.0012), 0.5, 2.2);
  }, { passive: false });
  viewport.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) { director.look.yaw = 0; director.look.pitch = 0; director.look.zoom = 1; } });

  // ---- sound: off until the viewer turns it on; heard only in the atmosphere ----
  const sound = createSound();
  const btnSound = $('btn-sound'), silence = $('silence');
  let silenceUntil = 0, silencePending = false, wasSpace = false, silenceShown = false;
  function syncSound() {
    btnSound.setAttribute('aria-pressed', String(sound.on));
    btnSound.setAttribute('aria-label', sound.on ? 'Sound on' : 'Sound off');
    $('ico-snd-off').toggleAttribute('hidden', sound.on); $('ico-snd-on').toggleAttribute('hidden', !sound.on);
  }
  async function setSound(on) {
    sound.on = on;
    if (on) await sound.enable();
    else ticksOn = false;
    if (on && lastWorld === 'space') silencePending = true;
    syncSound(); syncListen();
  }
  btnSound.addEventListener('click', () => setSound(!sound.on));
  let lastWorld = 'space';
  function soundFrame(out, now) {
    const rig = surface.ranger.rig, surf = out.world === 'surface';
    const camY = camera.position.y;
    sound.update({
      air: surf, playing: director.playing,
      engine: surf ? surface.ranger.plumes.userData.power || 0 : 0,
      engineDistance: surf ? camera.position.distanceTo(rig.position) : 1e9,
      wind: surf ? 0.45 + 0.55 * out.fade : 0,
      water: surf ? clamp(1 - camY / 250, 0, 1) : 0,
      waveDistance: surf ? out.waveDistance : 0,
    });
    // a short note when the scene leaves the air, so silence is not mistaken for a fault
    const isSpace = out.world === 'space';
    if (isSpace && !wasSpace && sound.on) silencePending = true;
    if (!isSpace) silencePending = false;
    if (silencePending && started && out.fade < 0.5) { silencePending = false; silenceUntil = now + 6000; }    // shown once the view clears
    wasSpace = isSpace; lastWorld = out.world;
    const show = sound.on && started && isSpace && now < silenceUntil && out.fade < 0.5;
    if (show !== silenceShown) { silenceShown = show; silence.hidden = !show; }
  }

  // ---- real time and the clock ticks (on the surface only) ----
  const ticker = sound;
  const listen = $('listen'), btnReal = $('btn-realtime'), btnTicks = $('btn-ticks'), listenNote = $('listen-note');
  const DAY_SECONDS = (24 * 3600) / P.SURFACE_FACTOR;          // crew seconds per Earth day: 1.41 s
  let ticksOn = false, lastDay = null, listenShown = false, listenState = '';
  function listenNoteText() {
    const s = DAY_SECONDS.toFixed(2);
    if (director.realTime && ticksOn) return `Real time. Each tick is one day passing on Earth, ${s} s apart.`;
    if (director.realTime) return `Real time: one second here is one second for the crew. Earth gains a day every ${s} s.`;
    if (ticksOn) return 'The ticks play in real time.';
    return 'Slow the surface to real time and hear Earth\u2019s days go by.';
  }
  function syncListen() {
    btnReal.setAttribute('aria-pressed', String(director.realTime));
    btnTicks.setAttribute('aria-pressed', String(ticksOn));
    $('ico-sound-off').toggleAttribute('hidden', ticksOn); $('ico-sound-on').toggleAttribute('hidden', !ticksOn);
    listenNote.textContent = listenNoteText();
  }
  function setRealTime(on) {
    begin();
    director.realTime = on;
    if (on && director.p >= 1) director.seek(0);
    if (on) director.playing = true;
    sync(); syncListen();
  }
  btnReal.addEventListener('click', () => setRealTime(!director.realTime));
  btnTicks.addEventListener('click', async () => {
    ticksOn = !ticksOn;
    if (ticksOn) { if (!sound.on) await setSound(true); ticksOn = true; if (!director.realTime) setRealTime(true); }
    syncListen();
  });
  function listenFrame(out) {
    const show = started && director.onSurface && out.fade < 0.5;
    if (show !== listenShown) { listenShown = show; listen.hidden = !show; }
    const state = `${director.realTime}|${ticksOn}`;
    if (state !== listenState) { listenState = state; syncListen(); }
    // one tick each time Earth's clock passes midnight, while the scene runs in real time
    if (ticksOn && director.realTime && director.playing && out.phase === 'surface') {
      const day = Math.floor(out.mission.earth / 1440);
      if (lastDay !== null && day > lastDay) ticker.tick();
      lastDay = day;
    } else lastDay = null;
  }

  // ---- render loop ----
  const HELD_CAPTION = 'Paused on a new equation. Read the card marked <b>Now</b> in the physics panel, then press <b>Continue</b>.';
  const sim = { freeze: false };
  // On a high-density screen with a modest graphics chip, step the resolution down until the animation runs smoothly.
  let slowTime = 0, frames = 0;
  function adapt(raw) {
    if (document.hidden || raw > 0.5) return;                 // ignore pauses such as a hidden tab
    frames++; slowTime += raw;
    if (frames < 90) return;
    const avg = slowTime / frames; frames = 0; slowTime = 0;
    const pr = renderer.getPixelRatio();
    if (avg > 1 / 40 && pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.5)); resize(); }
  }
  let lastT = performance.now(), time = 0;
  function tick(now) {
    if (sim.freeze) { lastT = now; requestAnimationFrame(tick); return; }      // used by the automated screenshot tests
    const raw = Math.max(0, (now - lastT) / 1000), dt = Math.min(0.1, raw); lastT = now; time += dt;
    adapt(raw);
    const out = director.frame(dt, time);
    listenFrame(out);
    soundFrame(out, now);
    const world = out.world === 'space' ? space : surface;
    if (out.world === 'space') { camera.near = 0.3; camera.far = 30000; } else { camera.near = 1; camera.far = 320000; }
    camera.updateProjectionMatrix();
    renderer.render(world.scene, camera);
    const f = Math.round(out.fade * 100) / 100;
    if (f !== lastFade) { lastFade = f; fade.style.opacity = String(f); }
    updateLabels(out);
    panel.setFocus(director.focus);
    panel.update(out.mission, { world: out.world, waveDistance: out.waveDistance, rangerDist: Math.hypot(surface.ranger.rig.position.x, surface.ranger.rig.position.z, surface.ranger.rig.position.y) });
    // while stopped at a new equation the caption says why; in real time it explains real time; otherwise it narrates
    const held = director.held && !director.playing;
    const cap = held ? HELD_CAPTION : director.realTime && director.onSurface ? listenNoteText() : director.caption;
    if (cap !== lastCaption) { lastCaption = cap; if (held) caption.innerHTML = cap; else caption.textContent = cap; }
    const sv = Math.round(director.p * 1000);
    if (sv !== lastScrub) { lastScrub = sv; scrub.value = String(sv); }
    requestAnimationFrame(tick);
  }

  sync();
  panel.update(P.missionState(params, 'pre', 0));
  caption.textContent = director.caption;
  // draw one frame before lifting the curtain, so shaders are compiled and nothing pops in
  director.frame(0, 0); renderer.render(space.scene, camera);
  renderer.compile(surface.scene, camera);
  $('loading').hidden = true;
  Object.assign(sim, { director, params, panel, space, surface, camera, renderer, ticker, sound, goto(beat, p = 0) { begin(); director.playing = false; director.goto(beat, p); sync(); } });
  window.__sim = sim;
  requestAnimationFrame((t) => { lastT = t; tick(t); });
}

boot().catch((err) => {
  console.error(err);
  if (!$('loading').hidden) fail('Something went wrong while loading the simulation. Reload the page to try again.');
});
