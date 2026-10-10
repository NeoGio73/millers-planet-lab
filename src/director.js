// Timeline and camera choreography for the six beats. Every pose is a pure function of the progress p
// through its beat, so the scrubber can jump anywhere.
import * as THREE from 'three';
import { SPACE } from './space.js';
import { SURF } from './surface.js';
import * as P from './physics.js';

export const BEATS = [
  { id: 'arrival', name: 'Arrival', dur: 14, tab: 'time', labels: ['gargantua', 'endurance', 'planet'],
    captions: [[0, 'The Endurance parks far from Gargantua, where clocks run almost as fast as they do on Earth. Try the parking orbit slider.']] },
  { id: 'descent', name: 'Descent', dur: 24, tab: 'time', labels: ['gargantua', 'endurance', 'ranger', 'planet'],
    captions: [[0, 'The Ranger lets go of the Endurance and turns toward the water world.'], [0.26, 'Falling inward. The Ranger’s clock slows as r shrinks, and Gargantua grows.'], [0.86, 'Into the atmosphere.']] },
  { id: 'landing', name: 'Landing', dur: 16, tab: 'time', labels: ['ranger', 'wave'],
    captions: [[0, 'Through the cloud deck and down toward a shallow ocean.'], [0.84, 'Touchdown. From here every hour costs seven years on Earth.']] },
  { id: 'wave', name: 'The wave', dur: 36, tab: 'wave', labels: ['ranger', 'wave'],
    captions: [[0, 'Those are not mountains. A wave tall enough to vanish into the cloud deck is closing in.'], [0.4, 'The wave lifts the Ranger up its face and into the clouds.'], [0.62, 'Engines flooded. Every minute spent waiting for them to drain costs 42.6 days on Earth.'], [0.88, 'Another wave is on the horizon.']] },
  { id: 'ascent', name: 'Ascent', dur: 24, tab: 'escape', labels: ['ranger', 'wave'],
    captions: [[0, 'Engines drained, the Ranger lifts off ahead of the next wave.'], [0.3, (params) => `Climbing away. Leaving the planet takes ${(P.vEscPlanet(params.planetRadius) / 1000).toFixed(1)} km/s, and Gargantua’s pull is far stronger still.`], [0.72, 'The Endurance is ahead. The Ranger’s clock is running fast again.']] },
  { id: 'reunion', name: 'Reunion', dur: 16, tab: 'time', labels: ['gargantua', 'endurance', 'ranger'],
    captions: [[0, 'Matching the Endurance’s spin to dock. A few hours have passed for the Ranger’s crew.'], [0.6, 'For Romilly, waiting aboard the Endurance, it has been more than twenty years.']] },
];

const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const _m = new THREE.Matrix4();
// The Arrival framing: Gargantua upper left, the Endurance right of centre, the planet's limb lower right.
const ARRIVAL_START = V(-7.6, 4.4, 30.6), ARRIVED = V(-4.5, 2.6, 17), ARRIVED_TARGET = V(-1.7, 0.3, 0);

/** Quaternion that points an object's +Z along `forward`, with +Y as close to `up` as it can be. */
function quatFacing(forward, up, out = new THREE.Quaternion()) {
  _m.lookAt(forward, ZERO, up);
  return out.setFromRotationMatrix(_m);
}

// ---- the wave beat's clockwork -------------------------------------------------------------------------
export const LAND_MIN = 10;                 // surface minutes covered by the landing beat
const WAVE_NEAR = 2500;                     // m: where the approach hands over to the lift
const WAVE_PAST = 7500;                     // m: far enough behind that the water is flat again
const T_LIFT = 0.40, T_CREST = 0.50, T_PAST = 0.62, T_NEXT = 0.80;

/** Where the crest is (z, metres; the Ranger sits at z = 0) at progress p of the wave beat. */
function crestAt(params, p) {
  const d0 = params.waveKm * 1000;
  if (p < T_LIFT) return lerp(-d0, -WAVE_NEAR, p / T_LIFT);
  if (p < T_CREST) return lerp(-WAVE_NEAR, 0, (p - T_LIFT) / (T_CREST - T_LIFT));
  if (p < T_PAST) return lerp(0, WAVE_PAST, (p - T_CREST) / (T_PAST - T_CREST));
  if (p < T_NEXT) return lerp(WAVE_PAST, 30000, (p - T_PAST) / (T_NEXT - T_PAST));
  return lerp(-62000, -24000, (p - T_NEXT) / (1 - T_NEXT));      // the next wave
}

/** Surface minutes elapsed at progress p of the wave beat: the wave keeps to sqrt(g h), then the wait is a time-lapse. */
function waveBeatMinutes(params, p) {
  const d0 = params.waveKm * 1000;
  const passed = LAND_MIN + (d0 + WAVE_PAST) / P.WAVE_SPEED / 60;
  if (p <= T_PAST) return LAND_MIN + (crestAt(params, p) + d0) / P.WAVE_SPEED / 60;
  return lerp(passed, Math.max(params.surfaceMin, passed), (p - T_PAST) / (1 - T_PAST));
}

export class Director {
  constructor({ space, surface, camera, params }) {
    this.space = space; this.surface = surface; this.camera = camera; this.params = params;
    this.beat = 0; this.p = 0; this.playing = false; this.speed = 1;
    this.look = { yaw: 0, pitch: 0, zoom: 1 };
    this.onBeatEnd = null; this.onBeatChange = null;
    this.cp = V(0, 0, 10); this.ct = V(0, 0, 0);
    this.out = { world: 'space', fade: 0, phase: 'pre', s: 0, viewerX: params.xE, labels: [], cloudTime: 0, waveDistance: 0 };
    this.lastP = 0;
    this.realTime = false;     // on the surface: play at the crew's true pace

    // geometry shared by the space beats
    this.axis = SPACE.enduranceAxis.clone();
    this.perp = new THREE.Vector3().crossVectors(this.axis, UP).normalize();
    this.nP = SPACE.planetCenter.clone().normalize();
    this.surfaceDist = SPACE.planetCenter.length() - SPACE.planetRadius;
    // docked: the ring between the Ranger's engines sits on the hub's port, nose pointing out along the axis
    this.dock = this.axis.clone().multiplyScalar(SPACE.hubPort + 1.0 + 0.04);
    this.clear = this.dock.clone().addScaledVector(this.axis, 5.5);
    const side = new THREE.Vector3().crossVectors(this.nP, UP).normalize();
    this.descentCurve = new THREE.CatmullRomCurve3([
      this.clear,
      this.clear.clone().addScaledVector(this.nP, 16).addScaledVector(side, 5),
      this.nP.clone().multiplyScalar(150).addScaledVector(side, 16),
      this.nP.clone().multiplyScalar(300).addScaledVector(side, 9),
      this.nP.clone().multiplyScalar(this.surfaceDist - 10),
    ], false, 'centripetal');
    this.hold = this.dock.clone().addScaledVector(this.axis, 9);
    this.ascentCurve = new THREE.CatmullRomCurve3([
      this.nP.clone().multiplyScalar(this.surfaceDist - 10).addScaledVector(side, -14),
      this.nP.clone().multiplyScalar(290).addScaledVector(side, -26),
      this.nP.clone().multiplyScalar(140).addScaledVector(side, -22).addScaledVector(UP, 6),
      this.hold.clone().addScaledVector(this.axis, 16).addScaledVector(side, -8).addScaledVector(UP, 4),
      this.hold,
    ], false, 'centripetal');
    this.holdQuat = quatFacing(this.ascentCurve.getTangent(0.999), UP);
  }

  // ---- transport ----
  goto(beat, p = 0) {
    beat = Math.max(0, Math.min(BEATS.length - 1, beat));
    const changed = beat !== this.beat;
    this.beat = beat; this.p = clamp01(p); this.lastP = this.p;
    this.look.yaw = 0; this.look.pitch = 0; this.look.zoom = 1;
    if (changed) this.realTime = false;
    this.surface.spray.clear();
    if (changed && this.onBeatChange) this.onBeatChange(this.beat);
  }
  seek(p) { this.p = clamp01(p); this.lastP = this.p; }
  /** True while the current beat shows the Ranger on the surface, where real time applies. */
  get onSurface() { const id = BEATS[this.beat].id; return id === 'landing' || id === 'wave'; }
  /** Surface minutes (on the crew's clock) at progress p of the current beat. */
  surfaceMinutesAt(p) {
    return BEATS[this.beat].id === 'landing' ? LAND_MIN * p : waveBeatMinutes(this.params, p);
  }
  get caption() {
    const list = BEATS[this.beat].captions; let text = list[0][1];
    for (const [at, t] of list) if (this.p >= at) text = t;
    return typeof text === 'function' ? text(this.params) : text;      // some captions quote a live value
  }

  // ---- per-frame ----
  frame(dt, time) {
    const b = BEATS[this.beat];
    if (this.playing) {
      let dp = (dt * this.speed) / b.dur;
      if (this.realTime && this.onSurface) {
        // advance so that one real second is one second on the crew's clock
        const e = 1e-4, a = Math.min(this.p, 1 - e), slope = (this.surfaceMinutesAt(a + e) - this.surfaceMinutesAt(a)) / e;
        if (slope > 0) dp = dt / 60 / slope;
      }
      this.p += dp;
      if (this.p >= 1) { this.p = 1; this.playing = false; this.realTime = false; if (this.onBeatEnd) this.onBeatEnd(this.beat); }
    }
    const o = this.out; o.fade = 0; o.labels = b.labels; o.cloudTime = time; o.waveDistance = 0;
    this['pose_' + b.id](this.p, dt, time);
    this.lastP = this.p;

    // camera, with the viewer's look-around offsets applied about the scripted target
    const off = this.cp.clone().sub(this.ct);
    off.applyAxisAngle(UP, this.look.yaw);
    const right = new THREE.Vector3().crossVectors(UP, off);
    if (right.lengthSq() > 1e-8) off.applyAxisAngle(right.normalize(), this.look.pitch);
    off.multiplyScalar(this.look.zoom);
    this.camera.position.copy(this.ct).add(off);
    if (o.world === 'surface') {
      const c = this.camera.position;
      c.y = Math.max(c.y, 0.9 + this.surface.heightAt(c.x, c.z));
    }
    this.camera.lookAt(this.ct);

    if (o.world === 'surface') {
      o.fade = Math.max(o.fade, smooth(seg(this.camera.position.y, SURF.deckHeight - 170, SURF.deckHeight - 30)));
      this.surface.update(dt, time, o.cloudTime, this.camera);
    } else {
      this.space.setViewerDistance(o.viewerX);
      this.space.update(dt, time, this.camera);
    }
    o.mission = P.missionState(this.params, o.phase, o.s);
    return o;
  }

  // ---- space helpers ----
  /** The Ranger's "up" while it turns with the ring. */
  spinUp(spin) { return this.perp.clone().applyAxisAngle(this.axis, spin); }
  /** Orientation while docked: tail on the port, rolling with the ring. */
  dockQuat(spin, out) { return quatFacing(this.axis, this.spinUp(spin), out); }
  /** Position `away` units out from the dock; `seated` (0 to 1) drops the hull so its docking ring lines up with the port. */
  dockPos(spin, away, seated, out) {
    return out.copy(this.dock).addScaledVector(this.axis, away).addScaledVector(this.spinUp(spin), -SPACE.rangerPortHeight * seated);
  }

  pose_arrival(p) {
    const o = this.out; o.world = 'space'; o.phase = 'pre'; o.s = 0; o.viewerX = this.params.xE;
    const sp = this.space, rig = sp.ranger.rig, spin = sp.enduranceSpin.rotation.x;
    this.dockPos(spin, 0, 1, rig.position); this.dockQuat(spin, rig.quaternion);
    sp.ranger.plumes.userData.setPower(0, 0);
    const e = smooth(p);
    this.cp.copy(ARRIVAL_START).lerp(ARRIVED, e);
    this.ct.copy(ARRIVED_TARGET);
  }

  pose_descent(p, dt, time) {
    const o = this.out; o.world = 'space'; o.phase = 'descent'; o.s = p; o.viewerX = P.xDescent(this.params, p);
    const sp = this.space, rig = sp.ranger.rig, spin = sp.enduranceSpin.rotation.x;
    const release = smooth(seg(p, 0.0, 0.12));              // easing out of the dock along the axis
    const turn = smooth(seg(p, 0.12, 0.26));                // swinging the nose onto the path
    const e = Math.pow(seg(p, 0.12, 0.97), 1.7);            // along the curve, gathering speed
    const pos = new THREE.Vector3(), tan = new THREE.Vector3();
    this.descentCurve.getTangent(Math.max(e, 0.002), tan);
    if (p < 0.12) this.dockPos(spin, 5.5 * release, 1 - release, pos); else this.descentCurve.getPoint(e, pos);
    rig.position.copy(pos);
    this.dockQuat(spin, rig.quaternion);
    if (turn > 0) rig.quaternion.slerp(quatFacing(tan, UP), turn);
    const burn = smooth(seg(p, 0.14, 0.3)) * (1 - 0.6 * smooth(seg(p, 0.6, 0.9)));
    sp.ranger.plumes.userData.setPower(p < 0.12 ? 0 : 0.2 * turn + 0.65 * burn, time);

    // camera: watch the release, ride over the Ranger's shoulder toward Gargantua, then dive with it
    const g = SPACE.gargantuaDir;
    const startCam = ARRIVED, startTgt = ARRIVED_TARGET;
    const shoulder = pos.clone().addScaledVector(g, -9.5).addScaledVector(UP, 2.4).addScaledVector(this.perp, -3.2);
    const shoulderTgt = pos.clone().addScaledVector(g, 30).addScaledVector(UP, -1.2);
    const dive = pos.clone().addScaledVector(tan, -8.5).addScaledVector(UP, 2.6);
    const diveTgt = pos.clone().addScaledVector(tan, 24);
    const a = smooth(seg(p, 0.10, 0.32)), b = smooth(seg(p, 0.70, 0.92));
    this.cp.copy(startCam).lerp(shoulder, a).lerp(dive, b);
    this.ct.copy(startTgt).lerp(pos, Math.min(1, a * 1.6)).lerp(shoulderTgt, a).lerp(diveTgt, b);
    o.fade = smooth(seg(p, 0.90, 0.995));
  }

  // ---- surface helpers ----
  placeSurfaceRanger(x, y, z, pitch, roll, yaw = 0) {
    const rig = this.surface.ranger.rig;
    rig.position.set(x, y, z);
    quatFacing(V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), UP, rig.quaternion);
    rig.rotateZ(roll);
  }

  pose_landing(p, dt, time) {
    const o = this.out; o.world = 'surface'; o.phase = 'surface';
    o.s = (LAND_MIN / this.params.surfaceMin) * p;
    const sf = this.surface;
    // the wave is already on its way: it covers LAND_MIN minutes of travel during this beat
    const crest = -(this.params.waveKm * 1000 + P.WAVE_SPEED * 60 * LAND_MIN * (1 - p));
    sf.setWave(crest, 1); o.waveDistance = -crest;
    const q = seg(p, 0, 0.86);                               // the approach; the rest is settling
    const settle = seg(p, 0.86, 1);
    const z = lerp(3000, 0, 1 - Math.pow(1 - q, 2.3));
    const y = 800 * Math.pow(1 - q, 2.5) + 2.2 * (1 - smooth(seg(q, 0.86, 1))) * (1 - smooth(settle * 1.6)) + SURF.waterline * smooth(settle * 1.6);
    const pitch = 0.16 * Math.sin(Math.PI * smooth(seg(q, 0.35, 1))) - 0.10 * (1 - smooth(seg(q, 0, 0.5)));
    const bob = 0.05 * Math.sin(time * 1.3) * settle;
    this.placeSurfaceRanger(0, y + bob, z, pitch * (1 - settle), 0.03 * Math.sin(time * 0.9) * (1 - settle));
    const hover = smooth(seg(q, 0.55, 0.9)) * (1 - smooth(settle * 2.2));
    sf.ranger.plumes.userData.setPower(Math.max(0, 0.35 + 0.5 * hover - 0.35 * smooth(settle * 2.5)), time);
    if (this.playing) {
      if (hover > 0.2 && y < 40) sf.spray.emit(0, 0.3, z + 6, Math.round(60 * dt * 14 * hover), 9, 5, 7, 2.6, 1.5);
      if (this.lastP < 0.86 && p >= 0.86) sf.spray.emit(0, 0.3, 0, 260, 13, 9, 6, 3.2, 2.2);
    }
    const rp = sf.ranger.rig.position;
    // off the ship's right shoulder all the way down, easing lower and wider as it settles
    const low = smooth(seg(p, 0.55, 0.95));
    this.cp.set(rp.x + lerp(17, 25, low), Math.max(rp.y + lerp(6.5, 3.15, low), 2.6), rp.z + lerp(33, 23, low));
    this.ct.set(rp.x, rp.y + lerp(-1, 2.5, low), rp.z + lerp(-8, -2, low));
    o.fade = 1 - smooth(seg(p, 0.0, 0.10));
  }

  pose_wave(p, dt, time) {
    const o = this.out; o.world = 'surface'; o.phase = 'surface';
    o.s = waveBeatMinutes(this.params, p) / Math.max(this.params.surfaceMin, 1);
    const sf = this.surface;
    const crest = crestAt(this.params, p);
    sf.setWave(crest, 1); o.waveDistance = -crest;
    const h = sf.meshHeightAt(0, 0), slope = sf.slopeAt(0, 0);
    const lifted = smooth(seg(h, 2, 60));
    const pitch = Math.atan(-slope) * 0.85;                    // the nose points toward −z, so a face rising ahead tips it up
    const roll = lifted * 0.14 * Math.sin(time * 1.7) + 0.02 * Math.sin(time * 0.9);
    this.placeSurfaceRanger(0, h + SURF.waterline + 0.06 * Math.sin(time * 1.3), 0, pitch, roll, lifted * 0.22 * Math.sin(time * 0.6));
    sf.ranger.plumes.userData.setPower(0, time);
    if (this.playing && h > 0.6 && h < 45) sf.spray.emit(0, h + 0.5, -6, Math.round(60 * dt * 12), 11, 6, 9, 3.0, 1.3);

    const rp = sf.ranger.rig.position;
    // A: low behind the ship, tilting up as the wall of water climbs. B: alongside, riding the face. C: a slow circle while the crew waits.
    const lookFar = smooth(seg(p, 0.08, 0.34));
    const camA = V(7, 3.6, 34);
    const tgtA = V(-1, 3.5, -40).lerp(V(0, 40 + 0.36 * P.WAVE_HEIGHT * lookFar, Math.min(crest, -400)), lookFar * 0.8);
    const camB = V(rp.x + 36, rp.y + 6, rp.z + 12), tgtB = V(rp.x, rp.y + 2.5, rp.z);
    const th = lerp(1.5, 0.35, smooth(seg(p, T_PAST - 0.02, 1)));
    const camC = V(Math.sin(th) * 32, 4.4, Math.cos(th) * 32), tgtC = V(0, 3, -4);
    // the eye comes back to the ship before the camera swings round to its side, so the ship never leaves the frame
    const eye = smooth(seg(p, T_LIFT - 0.05, T_LIFT - 0.005)), ab = smooth(seg(p, T_LIFT - 0.02, T_LIFT + 0.05));
    const bc = smooth(seg(p, T_PAST - 0.035, T_PAST + 0.04));
    this.cp.copy(camA).lerp(camB, ab).lerp(camC, bc);
    this.ct.copy(tgtA).lerp(tgtB, eye).lerp(tgtC, bc);
    o.cloudTime = time + 900 * smooth(seg(p, T_PAST, 1));       // the clouds race while the crew waits
  }

  pose_ascent(p, dt, time) {
    const o = this.out; o.phase = 'ascent'; o.s = p;
    o.viewerX = P.X_PLANET + (this.params.xE - P.X_PLANET) * p;
    if (p < 0.3) {
      o.world = 'surface';
      const sf = this.surface, q = p / 0.3;
      const crest = lerp(-24000, -7000, q);
      sf.setWave(crest, 1); o.waveDistance = -crest;
      const lift = smooth(seg(q, 0.08, 0.45)), climb = Math.pow(seg(q, 0.35, 1), 2.2);
      const y = SURF.waterline + 34 * lift + 1250 * climb;
      const z = -900 * climb;
      const pitch = 1.02 * smooth(seg(q, 0.3, 0.8));
      this.placeSurfaceRanger(0, y, z, pitch, 0.02 * Math.sin(time * 2.1));
      sf.ranger.plumes.userData.setPower(0.55 + 0.45 * smooth(seg(q, 0.0, 0.2)), time);
      if (this.playing && y < 30) sf.spray.emit(0, 0.3, z + 5, Math.round(60 * dt * 16), 12, 7, 8, 2.8, 1.5);
      const rp = sf.ranger.rig.position;
      const camA = V(26, 3.0, 24), camB = V(rp.x + 22, rp.y - 7, rp.z + 46);
      const k = smooth(seg(q, 0.35, 0.85));
      this.cp.copy(camA).lerp(camB, k); this.ct.set(rp.x, rp.y + 2, rp.z - 4);
      o.fade = smooth(seg(q, 0.80, 0.98));
      o.labels = ['ranger', 'wave'];
    } else {
      o.world = 'space';
      const sp = this.space, rig = sp.ranger.rig, q = (p - 0.3) / 0.7;
      const e = 1 - Math.pow(1 - q, 1.6);
      const pos = new THREE.Vector3(), tan = new THREE.Vector3();
      this.ascentCurve.getPoint(e, pos); this.ascentCurve.getTangent(Math.min(Math.max(e, 0.002), 0.999), tan);
      rig.position.copy(pos); quatFacing(tan, UP, rig.quaternion);
      sp.ranger.plumes.userData.setPower(0.85 * (1 - smooth(seg(q, 0.55, 0.95))), time);
      const g = SPACE.gargantuaDir;
      const shoulder = pos.clone().addScaledVector(g, -9.5).addScaledVector(UP, 2.2).addScaledVector(this.perp, 3.0);
      const shoulderTgt = pos.clone().addScaledVector(g, 30);
      const chase = pos.clone().addScaledVector(tan, -9).addScaledVector(UP, 2.4);
      const chaseTgt = pos.clone().addScaledVector(tan, 26);
      const k = smooth(seg(q, 0.50, 0.85));
      this.cp.copy(shoulder).lerp(chase, k); this.ct.copy(shoulderTgt).lerp(chaseTgt, k);
      o.fade = 1 - smooth(seg(q, 0.0, 0.10));
      o.labels = ['gargantua', 'ranger', 'planet', 'endurance'];
    }
  }

  pose_reunion(p, dt, time) {
    const o = this.out; o.world = 'space'; o.phase = 'done'; o.s = 1; o.viewerX = this.params.xE;
    const sp = this.space, rig = sp.ranger.rig, spin = sp.enduranceSpin.rotation.x;
    // swing round, match the ring's spin, then back onto the port tail first
    const backIn = smooth(seg(p, 0.30, 0.80));
    this.dockPos(spin, 9 * (1 - backIn), backIn, rig.position);
    rig.quaternion.copy(this.holdQuat).slerp(this.dockQuat(spin), smooth(seg(p, 0.0, 0.42)));
    sp.ranger.plumes.userData.setPower(0.25 * (1 - smooth(seg(p, 0.0, 0.2))), time);
    // end where the story began: the ring with Gargantua behind it
    const e = smooth(p);
    this.cp.set(12, 5, 22).lerp(ARRIVED, e);
    this.ct.copy(ARRIVED_TARGET);
  }
}
