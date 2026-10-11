// The orbital scene: stars, Gargantua in the distance, Miller's planet, the Endurance and the Ranger.
import * as THREE from 'three';

export const SPACE = {
  planetCenter: new THREE.Vector3(520, -640, -430),
  planetRadius: 520,
  gargantuaDir: new THREE.Vector3(-0.143, 0.018, -0.990).normalize(),
  gargantuaDist: 7000,
  // The planet is lit from the upper left, Gargantua's side of the opening shot. (Strictly, a planet that close to
  // the hole would be lit by the whole glowing disc wrapped around its sky.)
  planetLight: new THREE.Vector3(-0.75, 0.55, -0.25).normalize(),
  enduranceAxis: new THREE.Vector3(0.62, 0.2, 0.76).normalize(),   // the hub's docking port faces along this axis
  enduranceScale: 8 / 54.6,        // ring diameter of 8 scene units
  hubPort: 5.41 * (8 / 54.6),      // distance from the ring's centre to the docking port, along the axis
  rangerScale: 2 / 3.49,           // Ranger length of 2 scene units
  rangerPortHeight: 0.19,          // height of the Ranger's tail docking ring above its feet, in scene units
  // texture facts measured from the render of the user's black hole file
  shadowFrac: 0.1133,              // shadow radius / texture width
  texAspect: 1280 / 2048,
};

function makeStars() {
  const n = 4200;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), tint = new Float32Array(n * 3);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos[i * 3] = r * Math.cos(a) * 9000; pos[i * 3 + 1] = z * 9000; pos[i * 3 + 2] = r * Math.sin(a) * 9000;
    const m = rnd();
    size[i] = 0.9 + 2.6 * m * m * m;
    const warm = rnd();
    tint[i * 3] = 0.82 + 0.18 * warm; tint[i * 3 + 1] = 0.86 + 0.1 * rnd(); tint[i * 3 + 2] = 1.0 - 0.22 * warm;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aTint; varying vec3 vTint; varying float vA; uniform float uScale;
      void main(){ vTint = aTint; vA = clamp(aSize / 2.4, 0.25, 1.0); gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vTint; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * vA; gl_FragColor = vec4(vTint * a, a); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = -3;
  return p;
}

function makeGargantua(tex) {
  const group = new THREE.Group();
  const occluder = new THREE.Mesh(
    new THREE.CircleGeometry(SPACE.shadowFrac * 0.985, 72),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, toneMapped: false, fog: false }),
  );
  occluder.renderOrder = -2;
  // the render is added on top of the stars; an elliptical mask and a small black level hide the picture's rectangle
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, SPACE.texAspect),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; varying vec2 vUv;
        void main(){
          vec3 c = max(texture2D(map, vUv).rgb - 0.008, 0.0);
          float m = 1.0 - smoothstep(0.62, 1.0, length((vUv - 0.5) * 2.0));
          gl_FragColor = vec4(c * m, 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }),
  );
  glow.renderOrder = -1;
  group.add(occluder, glow);
  group.userData.glow = glow;
  return group;
}

const PLANET_VERT = `
  varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vObj;
  void main(){ vUv = uv; vObj = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

// Value noise on the sphere itself (no seams at the poles or the date line) adds cloud detail the painted maps cannot hold up close.
const NOISE3 = `
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise3(p); p = p * 2.03 + 19.1; a *= 0.5; } return s / 0.9375; }
`;

const PLANET_FRAG = `
  uniform sampler2D tOcean; uniform sampler2D tClouds; uniform vec3 uLight; uniform vec3 uLightColor; uniform float uShift;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vObj;
  ${NOISE3}
  void main(){
    vec3 N = normalize(vN); vec3 L = normalize(uLight); vec3 V = normalize(cameraPosition - vW);
    float ndl = dot(N, L);
    float day = smoothstep(-0.18, 0.42, ndl);
    // how many noise cells one pixel spans: detail fades out before it can shimmer
    float px = length(fwidth(vObj));
    float wMid = smoothstep(0.55, 0.12, px * 26.0), wFine = smoothstep(0.55, 0.12, px * 120.0);
    vec3 q = vObj + vec3(uShift * 6.0, 0.0, uShift * 2.0);
    float mid = fbm3(q * 26.0) - 0.5, fine = fbm3(q * 120.0 + 7.0) - 0.5;
    vec2 uvc = vUv + vec2(uShift, 0.0);
    float base = texture2D(tClouds, uvc).r;
    float dens = base + (0.42 * mid * wMid + 0.16 * fine * wFine) * smoothstep(0.02, 0.35, base);
    float c = smoothstep(0.20, 0.66, dens);
    float shade = 1.0 - 0.45 * smoothstep(0.12, 0.72, texture2D(tClouds, uvc + vec2(0.004, 0.003)).r) * (1.0 - c);
    vec3 ocean = texture2D(tOcean, vUv).rgb * (0.9 + 0.2 * (fbm3(vObj * 60.0) - 0.5) * wMid);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 60.0) * (1.0 - c);
    vec3 col = ocean * uLightColor * (0.03 + 1.2 * day * shade) + uLightColor * spec * day * 0.8;
    vec3 cloud = mix(vec3(0.74, 0.78, 0.84), vec3(0.97, 0.97, 0.98), smoothstep(0.35, 0.9, dens)) * uLightColor * (0.04 + 1.08 * day);
    col = mix(col, cloud, c * 0.97);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += vec3(0.28, 0.50, 0.86) * rim * (0.06 + 0.94 * day) * 0.7;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// A shell a little larger than the planet: a haze that peaks just inside its own edge and fades to nothing at it.
const ATMO_FRAG = `
  uniform vec3 uLight; varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
    float ndv = max(dot(N, V), 0.0);
    float day = smoothstep(-0.3, 0.45, dot(N, normalize(uLight)));
    float a = pow(1.0 - ndv, 3.0) * smoothstep(0.0, 0.22, ndv) * (0.08 + 0.92 * day) * 1.5;
    gl_FragColor = vec4(vec3(0.34, 0.58, 0.96) * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function makePlanet(tOcean, tClouds, lightDir, lightColor) {
  const group = new THREE.Group();
  const uniforms = { tOcean: { value: tOcean }, tClouds: { value: tClouds }, uLight: { value: lightDir }, uLightColor: { value: lightColor }, uShift: { value: 0 } };
  const body = new THREE.Mesh(new THREE.SphereGeometry(SPACE.planetRadius, 160, 96), new THREE.ShaderMaterial({ uniforms, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG }));
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(SPACE.planetRadius * 1.045, 128, 80),
    new THREE.ShaderMaterial({ uniforms: { uLight: { value: lightDir } }, vertexShader: PLANET_VERT, fragmentShader: ATMO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(body, atmo);
  group.userData.uniforms = uniforms;
  return group;
}

/** Two additive exhaust cones parented to a Ranger model wrapper (model coordinates: nose +X, up +Y). */
export function makePlumes() {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPower: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying float vT; varying vec3 vP; void main(){ vT = uv.y; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uPower; uniform float uTime; varying float vT; varying vec3 vP;
      void main(){ float k = 1.0 - vT; float flick = 0.86 + 0.14 * sin(uTime * 41.0 + vP.y * 9.0); float a = pow(k, 2.1) * uPower * flick * 0.85; vec3 c = mix(vec3(1.0, 0.55, 0.22), vec3(0.75, 0.88, 1.0), k); gl_FragColor = vec4(c * a * 1.6, a); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  const cones = [];
  for (const z of [-0.43, 0.43]) {
    // the cone's tip points +Y by default; lay it along -X so the open base sits at the nozzle and the tip trails behind
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.0, 20, 1, true), mat);
    cone.rotation.z = Math.PI / 2;
    cone.position.set(-2.62, 0.4, z);
    group.add(cone); cones.push(cone);
  }
  group.userData.setPower = (p, t) => {
    mat.uniforms.uPower.value = p; mat.uniforms.uTime.value = t; group.visible = p > 0.01; group.userData.power = p;
    const len = 0.5 + 1.6 * p;
    for (const cone of cones) { cone.scale.set(1, len, 1); cone.position.x = -2.12 - 0.5 * len; }
  };
  group.visible = false;
  return group;
}

/**
 * Wraps the Ranger model so that its nose points down local +Z and its feet rest on local y = 0.
 * Returns { rig, model, plumes, setGear(down) }.
 */
export function makeRangerRig(gltfScene, scale) {
  const rig = new THREE.Group();
  const turn = new THREE.Group();
  const model = gltfScene.clone(true);
  model.position.set(0.425, 0, 0);          // centre the hull fore and aft (model nose is +X)
  const plumes = makePlumes();
  model.add(plumes);
  turn.rotation.y = -Math.PI / 2;           // model +X (nose) becomes rig +Z
  turn.scale.setScalar(scale);
  turn.add(model);
  rig.add(turn);
  const gear = [];
  model.traverse((o) => { if (o.name.startsWith('RangerGear')) gear.push(o); });
  return { rig, model, plumes, setGear(down) { for (const g of gear) g.visible = down; } };
}

export function createSpace(assets, renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);

  const lightColor = new THREE.Color(1.0, 0.93, 0.84);

  const stars = makeStars();
  scene.add(stars);

  const gargantua = makeGargantua(assets.gargantua);
  gargantua.position.copy(SPACE.gargantuaDir).multiplyScalar(SPACE.gargantuaDist);
  scene.add(gargantua);

  const planet = makePlanet(assets.ocean, assets.clouds, SPACE.planetLight, lightColor);
  planet.position.copy(SPACE.planetCenter);
  planet.rotation.set(0.5, 0.9, 0.25);
  scene.add(planet);

  // lighting for the ships: Gargantua's disc as a warm key, planet-shine as a cool fill
  const key = new THREE.DirectionalLight(0xffe6c8, 3.0);
  key.position.copy(SPACE.gargantuaDir).multiplyScalar(100);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7fa6d8, 1.0);
  fill.position.copy(SPACE.planetCenter).normalize().multiplyScalar(100);
  scene.add(fill);
  // Gargantua sits behind the ships in most shots, so a light that travels with the viewer keeps them readable
  const front = new THREE.DirectionalLight(0xe6ebf4, 2.7);
  scene.add(front);
  scene.add(new THREE.AmbientLight(0x8090a8, 0.5));
  scene.environment = assets.envSpace;
  scene.environmentIntensity = 0.7;

  // Endurance: model axis is +X; align it with the chosen axis and spin about it
  const endurance = new THREE.Group();
  const spin = new THREE.Group();
  const eModel = assets.endurance.clone(true);
  eModel.scale.setScalar(SPACE.enduranceScale);
  spin.add(eModel);
  endurance.add(spin);
  endurance.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), SPACE.enduranceAxis);
  scene.add(endurance);

  const ranger = makeRangerRig(assets.ranger, SPACE.rangerScale);
  ranger.setGear(false);                    // legs stay folded away in space
  scene.add(ranger.rig);

  const tmpQ = new THREE.Quaternion();
  const api = {
    scene, stars, gargantua, planet, endurance, enduranceSpin: spin, ranger, key,
    /** Angular radius (rad) of the shadow as drawn, after the cap. */
    shadowAngle: 0,
    /**
     * Apparent size of Gargantua for a viewer hovering at x = r/r_s. The shadow's angular radius obeys
     *   sin θ = (3√3/2)(r_s/r)·sqrt(1 − r_s/r),
     * about 2.6 r_s/r from far away. It is capped at 12° so the hole never swallows the view.
     */
    setViewerDistance(x) {
      const s = x > 1.5 ? Math.min(1, (2.598 / x) * Math.sqrt(1 - 1 / x)) : 1;
      const theta = Math.min(Math.asin(s), THREE.MathUtils.degToRad(12));
      api.shadowAngle = theta;
      const width = (SPACE.gargantuaDist * Math.tan(theta)) / SPACE.shadowFrac;
      gargantua.scale.setScalar(width);
    },
    update(dt, time, camera) {
      spin.rotation.x += dt * 0.22;
      front.position.set(-0.45, 0.6, 1).applyQuaternion(camera.quaternion);       // from over the viewer's left shoulder
      planet.userData.uniforms.uShift.value = time * 0.0006;
      // billboard with a fixed tilt of the disc
      gargantua.quaternion.copy(camera.quaternion);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.32);
      gargantua.quaternion.multiply(tmpQ);
      stars.material.uniforms.uScale.value = renderer.getPixelRatio();
    },
  };
  api.setViewerDistance(100);
  return api;
}
