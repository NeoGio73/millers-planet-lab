// The surface of Miller's planet: a shallow ocean under a cloud deck, the Ranger, and the wave. Units are metres.
import * as THREE from 'three';
import { makeRangerRig } from './space.js';
import { WAVE_HEIGHT, MILLER_G } from './physics.js';

export const SURF = {
  fogColor: new THREE.Color(0xbcc8cc),
  fogDensity: 3.6e-5,
  deckHeight: 1000,          // base of the cloud deck; the 1.2 km crest pokes through it
  waveFront: 1100,           // width of the steep leading face
  waveBack: 2600,            // width of the gentler back
  rangerScale: 16 / 3.49,    // a 16 m Ranger
  waterline: -0.45,          // rig height when resting: feet under knee-deep water
};

const STRIP_DEPTH = 14000, STRIP_STEP = 50, STRIP_HALF_WIDTH = 130000;   // the finely divided strip of water that carries the wave

/**
 * A flat disc of rings that widen with distance, to be kept centred under the viewer. One giant quad would be simpler,
 * but triangles hundreds of kilometres across that pass through the camera lose all precision when drawn.
 */
function radialPlane(rMin, rMax, rings, sectors) {
  const pos = [0, 0, 0], idx = [];
  for (let i = 0; i < rings; i++) {
    const r = rMin * Math.pow(rMax / rMin, i / (rings - 1));
    for (let j = 0; j < sectors; j++) { const a = (j / sectors) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  }
  for (let j = 0; j < sectors; j++) idx.push(0, 1 + ((j + 1) % sectors), 1 + j);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < sectors; j++) {
    const a = 1 + i * sectors + j, b = 1 + i * sectors + ((j + 1) % sectors), c = a + sectors, d = b + sectors;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** The strip that carries the wave: rows STRIP_STEP apart, columns fine near the Ranger and wider far along the crest. */
function waveStrip() {
  const xs = [0]; let step = 12;
  while (xs[xs.length - 1] < STRIP_HALF_WIDTH) { xs.push(Math.min(STRIP_HALF_WIDTH, xs[xs.length - 1] + step)); step = Math.min(2500, step * 1.2); }
  const cols = [...xs.slice(1).reverse().map((x) => -x), ...xs], rows = STRIP_DEPTH / STRIP_STEP + 1;
  const pos = new Float32Array(cols.length * rows * 3), idx = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols.length; c++) {
    const k = (r * cols.length + c) * 3; pos[k] = cols[c]; pos[k + 1] = 0; pos[k + 2] = -STRIP_DEPTH / 2 + r * STRIP_STEP;
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols.length - 1; c++) {
    const a = r * cols.length + c, b = a + 1, d = a + cols.length, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Height of the wave at world (x, z) when its crest is at zCrest. The wave travels toward +z. */
export function waveHeightAt(x, z, zCrest, amp = 1) {
  const u = z - zCrest;
  const w = u > 0 ? SURF.waveFront : SURF.waveBack;
  const along = 1.0 + 0.07 * Math.sin(x / 9000 + 1.3) + 0.04 * Math.sin(x / 3700);
  return amp * WAVE_HEIGHT * along * Math.exp(-(u * u) / (w * w));
}
/** Slope dh/dz at the same point. */
export function waveSlopeAt(x, z, zCrest, amp = 1) {
  const u = z - zCrest;
  const w = u > 0 ? SURF.waveFront : SURF.waveBack;
  return waveHeightAt(x, z, zCrest, amp) * ((-2 * u) / (w * w));
}

const WATER_COMMON = `
  uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uWater; uniform vec3 uWaterDark; uniform vec3 uSkyHorizon; uniform vec3 uSkyZenith; uniform float uTime; uniform float uDeck; uniform float uPix;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  // One train of ripples. fp is the size of a pixel on the water: a train fades out before it gets too fine to draw cleanly.
  vec2 train(vec2 p, vec2 dir, float len, float amp, float speed, float fp){
    float k = 6.2831853 / len; float keep = 1.0 - smoothstep(0.07 * len, 0.24 * len, fp);
    return dir * (amp * k * cos(k * dot(dir, p) - speed * uTime)) * keep;
  }
  vec2 ripples(vec2 p, float fp){
    vec2 g = train(p, vec2(0.60, 0.80), 310.0, 0.55, 0.45, fp);
    g += train(p, vec2(-0.35, 0.94), 130.0, 0.30, 0.7, fp);
    g += train(p, vec2(0.80, 0.60), 46.0, 0.16, 1.1, fp);
    g += train(p, vec2(-0.55, 0.83), 23.0, 0.09, 1.6, fp);
    g += train(p, vec2(0.25, -0.97), 9.5, 0.045, 2.4, fp);
    g += train(p, vec2(-0.92, -0.38), 4.1, 0.022, 3.3, fp);
    g += (vec2(vnoise(p * 0.9 + uTime * 0.4), vnoise(p * 0.9 + 7.3 - uTime * 0.35)) - 0.5) * 0.10 * (1.0 - smoothstep(0.1, 0.3, fp));
    return g;
  }
  vec3 skyColor(vec3 dir){ return mix(uSkyHorizon, uSkyZenith, pow(clamp(dir.y, 0.0, 1.0), 0.55)); }
  // Size of one pixel on the water (m), from the distance and the angle the surface is seen at. uPix is radians per pixel.
  float footprint(float d, float ndv){ return d * uPix / max(ndv, 0.04); }
  vec3 applyFog(vec3 col, float d){ float f = 1.0 - exp(-pow(d * uFogDensity, 2.0)); return mix(col, uFogColor, f); }
`;

const OCEAN_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const OCEAN_FRAG = `
  varying vec3 vW; uniform vec3 uStrip;      // centre z, half depth and half width of the wave's strip: the sea leaves a gap for it
  ${WATER_COMMON}
  void main(){
    if (abs(vW.z - uStrip.x) < uStrip.y && abs(vW.x) < uStrip.z) discard;
    float d = distance(cameraPosition, vW);
    vec3 V = normalize(cameraPosition - vW);
    vec2 g = ripples(vW.xz, footprint(d, V.y));
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 col = mix(uWater, skyColor(reflect(-V, N)), fres);
    col = applyFog(col, d);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const WAVE_SHAPE = `
  uniform float uCrestZ; uniform float uHeight; uniform float uFront; uniform float uBack;
  // height of the wave and its slopes along z and x at a point on the sea
  vec3 waveShape(vec2 xz){
    float u = xz.y - uCrestZ;
    float wid = u > 0.0 ? uFront : uBack;
    float along = 1.0 + 0.07 * sin(xz.x / 9000.0 + 1.3) + 0.04 * sin(xz.x / 3700.0);
    float bump = uHeight * exp(-(u * u) / (wid * wid));
    float dAlong = 0.07 / 9000.0 * cos(xz.x / 9000.0 + 1.3) + 0.04 / 3700.0 * cos(xz.x / 3700.0);
    return vec3(bump * along, bump * along * (-2.0 * u / (wid * wid)), bump * dAlong);
  }`;
const WAVE_VERT = `
  ${WAVE_SHAPE}
  varying vec3 vW;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y += waveShape(w.xz).x; vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const WAVE_FRAG = `
  varying vec3 vW;
  ${WATER_COMMON}
  ${WAVE_SHAPE}
  void main(){
    float d = distance(cameraPosition, vW);
    // the smooth shape is worked out again here, so the shading never shows the mesh's rows
    vec3 shape = waveShape(vW.xz);
    vec3 N = normalize(vec3(-shape.z, 1.0, -shape.y));
    vec3 V = normalize(cameraPosition - vW);
    float steep = clamp(1.0 - N.y, 0.0, 1.0);
    vec2 g = ripples(vW.xz, footprint(d, abs(dot(N, V)))) * (1.0 - steep);
    N = normalize(N + vec3(-g.x, 0.0, -g.y));
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 body = mix(uWater, uWaterDark, smoothstep(0.02, 0.45, steep));
    // streaks running down the face and foam gathering toward the crest
    float streak = vnoise(vec2(vW.x * 0.035, vW.y * 0.0025 - uTime * 0.05)) * (0.55 + 0.45 * vnoise(vec2(vW.x * 0.004 + 3.1, vW.y * 0.003)));
    float foam = smoothstep(0.42, 0.75, streak) * smoothstep(0.05, 0.4, steep) * 0.45;
    foam += smoothstep(0.80, 1.0, shape.x / max(uHeight, 1.0)) * (0.35 + 0.45 * vnoise(vW.xz * 0.02 + uTime * 0.6));
    vec3 col = mix(body, skyColor(reflect(-V, N)), fres * (1.0 - 0.55 * steep));
    col = mix(col, vec3(0.86, 0.90, 0.91), clamp(foam, 0.0, 0.9));
    // the top of the wave dissolves into the cloud deck
    col = mix(col, vec3(0.80, 0.84, 0.86), smoothstep(uDeck - 340.0, uDeck - 20.0, vW.y) * 0.94);
    col = applyFog(col, d);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const DECK_VERT = OCEAN_VERT;
const DECK_FRAG = `
  varying vec3 vW; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uCloudTime;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  void main(){
    float d = distance(cameraPosition, vW);
    vec2 p = vW.xz / 2600.0 + vec2(uCloudTime * 0.012, uCloudTime * 0.004);
    float n = fbm(p + 0.6 * vec2(fbm(p * 1.7 + 3.0), fbm(p * 1.7 - 5.0)));
    vec3 col = mix(vec3(0.60, 0.66, 0.69), vec3(0.88, 0.91, 0.92), smoothstep(0.25, 0.75, n));
    float f = 1.0 - exp(-pow(d * uFogDensity * 1.25, 2.0));
    col = mix(col, uFogColor, f);
    float a = mix(0.80 + 0.18 * n, 1.0, f);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

class Spray {
  constructor(count = 700) {
    this.n = count;
    this.pos = new Float32Array(count * 3); this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count); this.size = new Float32Array(count); this.alpha = new Float32Array(count);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.93, 0.96, 0.97), a * 0.55); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  emit(x, y, z, count, speed, up, spread, size = 2.2, life = 1.6) {
    for (let i = 0; i < count; i++) {
      const k = this.cursor; this.cursor = (this.cursor + 1) % this.n;
      const a = Math.random() * Math.PI * 2, r = Math.random();
      this.pos[k * 3] = x + Math.cos(a) * r * spread; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z + Math.sin(a) * r * spread;
      const s = speed * (0.4 + 0.6 * Math.random());
      this.vel[k * 3] = Math.cos(a) * s; this.vel[k * 3 + 1] = up * (0.5 + 0.5 * Math.random()); this.vel[k * 3 + 2] = Math.sin(a) * s;
      this.life[k] = life * (0.6 + 0.4 * Math.random()); this.size[k] = size * (0.6 + 0.8 * Math.random());
    }
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.points.geometry.attributes.aAlpha.needsUpdate = true; }
  update(dt) {
    for (let k = 0; k < this.n; k++) {
      if (this.life[k] <= 0) { this.alpha[k] = 0; continue; }
      this.life[k] -= dt;
      this.vel[k * 3 + 1] -= MILLER_G * dt;
      this.pos[k * 3] += this.vel[k * 3] * dt; this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt; this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      if (this.pos[k * 3 + 1] < 0) { this.life[k] = 0; this.alpha[k] = 0; continue; }
      this.alpha[k] = Math.min(1, this.life[k] * 1.4);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
}

export function createSurface(assets) {
  const scene = new THREE.Scene();
  scene.background = SURF.fogColor.clone();
  scene.fog = new THREE.FogExp2(SURF.fogColor, SURF.fogDensity);

  const shared = {
    uFogColor: { value: SURF.fogColor }, uFogDensity: { value: SURF.fogDensity }, uTime: { value: 0 }, uCloudTime: { value: 0 }, uDeck: { value: SURF.deckHeight }, uPix: { value: 0.001 },
    uWater: { value: new THREE.Color(0x35525c) }, uWaterDark: { value: new THREE.Color(0x21383f) },
    uSkyHorizon: { value: new THREE.Color(0xc4d0d3) }, uSkyZenith: { value: new THREE.Color(0x95a7ae) },
  };

  const flat = radialPlane(2, 170000, 60, 120);
  const oceanUniforms = { ...shared, uStrip: { value: new THREE.Vector3(-1e7, 0, 0) } };
  const ocean = new THREE.Mesh(flat, new THREE.ShaderMaterial({ uniforms: oceanUniforms, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG }));
  ocean.frustumCulled = false;
  scene.add(ocean);

  // a strip of finely divided water that carries the wave; it rides along with the crest
  const waveUniforms = { ...shared, uCrestZ: { value: -1e6 }, uHeight: { value: WAVE_HEIGHT }, uFront: { value: SURF.waveFront }, uBack: { value: SURF.waveBack } };
  const wave = new THREE.Mesh(waveStrip(), new THREE.ShaderMaterial({ uniforms: waveUniforms, vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG }));
  wave.frustumCulled = false;
  scene.add(wave);

  const deck = new THREE.Mesh(flat, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: DECK_VERT, fragmentShader: DECK_FRAG, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  deck.position.y = SURF.deckHeight; deck.frustumCulled = false;
  scene.add(deck);

  scene.add(new THREE.HemisphereLight(0xe2eaee, 0x3c5560, 1.25));
  const top = new THREE.DirectionalLight(0xffffff, 1.2);
  top.position.set(-0.35, 1, 0.45);
  scene.add(top);
  scene.environment = assets.envSurface;
  scene.environmentIntensity = 0.9;

  const ranger = makeRangerRig(assets.ranger, SURF.rangerScale);
  scene.add(ranger.rig);

  const spray = new Spray();
  scene.add(spray.points);

  let crestZ = -1e6, waveAmp = 1;
  return {
    scene, ranger, spray, shared,
    /** Place the wave: crest position along z and a height multiplier (0 hides it). */
    setWave(z, amp = 1) {
      crestZ = z; waveAmp = amp;
      waveUniforms.uCrestZ.value = z; waveUniforms.uHeight.value = WAVE_HEIGHT * amp;
      wave.position.z = z - 2000;            // strip spans the back (−z) more than the front
      wave.visible = amp > 0.001;
      oceanUniforms.uStrip.value.set(wave.position.z, wave.visible ? STRIP_DEPTH / 2 - 1 : 0, STRIP_HALF_WIDTH - 1);
    },
    heightAt(x, z) { return waveAmp > 0.001 ? waveHeightAt(x, z, crestZ, waveAmp) : 0; },
    slopeAt(x, z) { return waveAmp > 0.001 ? waveSlopeAt(x, z, crestZ, waveAmp) : 0; },
    /** Height of the drawn mesh rather than the ideal curve: the strip's rows are STRIP_STEP apart and move with the crest. */
    meshHeightAt(x, z) {
      if (waveAmp <= 0.001) return 0;
      const u = z - crestZ, u0 = Math.floor(u / STRIP_STEP) * STRIP_STEP, t = (u - u0) / STRIP_STEP;
      const a = waveHeightAt(x, crestZ + u0, crestZ, waveAmp), b = waveHeightAt(x, crestZ + u0 + STRIP_STEP, crestZ, waveAmp);
      return a + (b - a) * t;
    },
    /** Keeps spray sizes in metres and tells the water how big a pixel is: pass the canvas height in device pixels and the vertical field of view. */
    setViewport(heightPx, fovRad) {
      const focal = heightPx / (2 * Math.tan(fovRad / 2));
      spray.points.material.uniforms.uScale.value = focal; shared.uPix.value = 1 / focal;
    },
    update(dt, time, cloudTime, camera) {
      shared.uTime.value = time; shared.uCloudTime.value = cloudTime;
      ocean.position.set(camera.position.x, 0, camera.position.z); deck.position.set(camera.position.x, SURF.deckHeight, camera.position.z);
      spray.update(dt);
    },
  };
}
