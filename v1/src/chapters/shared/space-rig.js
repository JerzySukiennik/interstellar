// Shared space scene for the flight chapters: cached sky layer, one shadowed key from Gargantua, Endurance spinning with two Rangers, directed exposure and stars, plasma, crack and glint effects, flight sound, seamless hand-over, and the co-op stage that sends this pilot's Ranger and draws the partner's on the other one.
import * as THREE from 'three';
import { createCockpitRig, createRangerKit, canRender } from './cockpit-rig.js';

export const SPIN = 0.55;
const CHASE_FILL = 1.1;
export const FLIGHT_CHAPTERS = ['departure', 'spaceflight', 'return', 'gargantua'];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = V(0, 0, 0), _w = V(0, 0, 0), _u = V(0, 0, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp;

export const BH = (() => {
  const E = V(0, 1.3, 30);
  const hole = E.clone().negate().normalize();
  const dirM = hole.clone().applyAxisAngle(V(0, 1, 0), 0.165).add(V(0, -0.035, 0)).normalize();
  const b = 2 * E.dot(dirM), c = E.lengthSq() - 15 * 15;
  const Dm = (-b - Math.sqrt(b * b - 4 * c)) / 2;
  const P = E.clone().addScaledVector(dirM, Dm);
  const Rp = 0.25;
  const toHole = P.clone().negate().normalize();
  const side = E.clone().sub(P); side.addScaledVector(toHole, -side.dot(toHole)).normalize();
  const n = side.clone().multiplyScalar(0.9).addScaledVector(toHole, 0.42).normalize();
  const F = P.clone().addScaledVector(n, Rp * 1.014);
  const G_DIR = V(0.75, 0.3, -0.6).normalize();
  const upW = V(0, 1, 0).addScaledVector(G_DIR, -G_DIR.y).normalize().applyAxisAngle(G_DIR, -0.33);
  const upB = V(0, 1, 0).addScaledVector(hole, -hole.y).normalize();
  const basis = (f, u) => { const r = V(0, 0, 0).crossVectors(f, u).normalize(); const uu = V(0, 0, 0).crossVectors(r, f); return new THREE.Matrix4().makeBasis(r, uu, f.clone().negate()); };
  const S = new THREE.Quaternion().setFromRotationMatrix(basis(G_DIR, upW)).multiply(new THREE.Quaternion().setFromRotationMatrix(basis(hole, upB)).invert());
  return { E, P, Rp, F, n, dirM, Dm, S, G_DIR, toHole };
})();

export function planetAt(obs, extra = {}) {
  const d = Math.max(BH.Rp * 1.0005, obs.distanceTo(BH.P));
  return { direction: _v.copy(BH.P).sub(obs).normalize().clone(), angularRadius: Math.asin(Math.min(0.9999, BH.Rp / d)), distance: d, cover: 0.62, ...extra };
}

let cached = null;
export function getSpaceRig(ctx) {
  if (!cached) cached = build(ctx).catch(e => { cached = null; throw e; });
  return cached;
}
export function peekSpaceRig() { return cached; }

function stubSky(engine) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 2000);
  const observer = V(0, 2, 60), skyRotation = new THREE.Quaternion(), lightDirection = V(0, 0, -1);
  let plunge = 0;
  const derive = () => { lightDirection.copy(observer).multiplyScalar(-1 / Math.max(observer.length(), 1.001)).applyQuaternion(skyRotation); };
  const planet = { state: { direction: V(0, 0, -1), angularRadius: 0.01 }, set(o) { Object.assign(this.state, o); }, mesh: new THREE.Object3D() };
  return {
    scene, camera, observer, skyRotation, lightDirection, lightColor: new THREE.Color(0xfff8ee), planet, environment: null, gargantua: { uniforms: {} },
    get lightIntensity() { return 13 * (1 - smooth(plunge, 0.8, 1)); }, get plunge() { return plunge; },
    update(main) { if (main) { main.getWorldQuaternion(camera.quaternion); camera.updateMatrixWorld(); } derive(); },
    setObserver(v) { observer.copy(v); derive(); }, setSkyRotation(q) { skyRotation.copy(q); derive(); }, setPlanet(o) { planet.set(o); }, setPlunge(x) { plunge = clamp(x, 0, 1); },
    setDisk() {}, refreshEnvironment() {}, attachEnvironment() {}, async compile() {}, measure() { return {}; }, dispose() {},
    worldToBh: (v, out = V(0, 0, 0)) => out.copy(v).applyQuaternion(_q.copy(skyRotation).invert()), bhToWorld: (v, out = V(0, 0, 0)) => out.copy(v).applyQuaternion(skyRotation),
  };
}

function stubEndurance() {
  const group = new THREE.Group();
  group.name = 'EnduranceStandIn';
  const anchors = {};
  const a = (n, p, q) => { const o = new THREE.Object3D(); o.name = n; o.position.set(...p); if (q) o.quaternion.copy(q); group.add(o); anchors[n] = o; };
  a('rangerPortA', [0, 0, 5.3], new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
  a('rangerPortB', [0, 0, -5.3]);
  a('hub', [0, 0, 0]);
  return { group, lod: group, anchors, dims: { RC: 32 }, setEngines() {}, setWindows() {}, update() {}, stats: () => ({}), dispose() {} };
}

function glintTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2 + 0.5) / (S / 2), dy = (y - S / 2 + 0.5) / (S / 2), r = Math.hypot(dx, dy);
    const core = Math.exp(-r * r * 90) + 0.35 * Math.exp(-r * r * 9) + 0.08 * Math.exp(-r * 3);
    const spikes = (Math.exp(-Math.abs(dy) * 70) * Math.exp(-Math.abs(dx) * 2.6) + Math.exp(-Math.abs(dx) * 70) * Math.exp(-Math.abs(dy) * 2.6)) * 0.55;
    const v = Math.min(1, (core + spikes) * Math.max(0, 1 - r * r));
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * Math.pow(v, 0.8)); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

function crackTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  let seed = 9;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cx = S * 0.36, cy = S * 0.58;
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let k = 0; k < 17; k++) {
    let a = (k / 17) * Math.PI * 2 + R() * 0.3, x = cx, y = cy, w = 3.2;
    g.beginPath(); g.moveTo(x, y);
    const n = 14 + Math.floor(R() * 12);
    for (let i = 0; i < n; i++) {
      a += (R() - 0.5) * 0.55; const l = 18 + R() * 46; x += Math.cos(a) * l; y += Math.sin(a) * l;
      g.lineTo(x, y);
      if (R() < 0.22) { g.lineWidth = w; g.stroke(); g.beginPath(); g.moveTo(x, y); w = Math.max(0.8, w * 0.8); const b = a + (R() - 0.5) * 1.6; g.lineWidth = 1; g.moveTo(x, y); g.lineTo(x + Math.cos(b) * 60, y + Math.sin(b) * 60); g.stroke(); g.beginPath(); g.moveTo(x, y); }
    }
    g.lineWidth = w; g.stroke();
  }
  for (let r = 30; r < 260; r += 34 + R() * 30) {
    g.lineWidth = 1.2; g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.12) { const rr = r * (0.85 + R() * 0.3); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (R() < 0.35) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 60); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 60, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

const PLASMA_VERT = `
attribute float edge;
varying float vEdge; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ vEdge = edge; vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PLASMA_FRAG = `
uniform float uI, uT, uRim;
varying float vEdge; varying vec3 vP; varying vec3 vN; varying vec3 vW;
float h(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  float flow = n3(vP * vec3(3.0, 3.0, 1.2) + vec3(0.0, 0.0, uT * 9.0)) * 0.65 + n3(vP * 9.0 + vec3(0.0, uT * 5.0, uT * 17.0)) * 0.35;
  float a;
  if (uRim > 0.5) a = pow(1.0 - vEdge, 1.6) * (0.6 + 0.7 * flow);
  else { vec3 V = normalize(cameraPosition - vW); float f = 1.0 - abs(dot(normalize(vN), V)); a = (0.18 + 0.9 * flow * flow) * (0.5 + 0.8 * f); }
  vec3 col = mix(vec3(1.0, 0.28, 0.05), vec3(1.0, 0.62, 0.3), clamp(flow * 1.3 - 0.3, 0.0, 1.0));
  gl_FragColor = vec4(col * a * uI, 1.0);
}`;

function buildPlasma(ranger) {
  const group = new THREE.Group();
  group.name = 'plasma';
  const U = { uI: { value: 0 }, uT: { value: 0 } };
  const mat = (rim) => new THREE.ShaderMaterial({ vertexShader: PLASMA_VERT, fragmentShader: PLASMA_FRAG, uniforms: { ...U, uRim: { value: rim } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const yTop = ranger.shape?.yTop;
  const wins = ranger.windows || [];
  if (yTop && wins.length) {
    const pos = [], edge = [], nor = [];
    for (const w of wins) {
      const p = w.poly, cx = p.reduce((a, q) => a + q[0], 0) / p.length, cz = p.reduce((a, q) => a + q[1], 0) / p.length;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        const ox = (x, z, k) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + dx / l * k, z + dz / l * k]; };
        const a1 = ox(a[0], a[1], -0.3), b1 = ox(b[0], b[1], -0.3);
        const P = (x, z) => [x, yTop(x, z) + 0.012, z];
        const quad = [[P(a[0], a[1]), 0], [P(b[0], b[1]), 0], [P(b1[0], b1[1]), 1], [P(a[0], a[1]), 0], [P(b1[0], b1[1]), 1], [P(a1[0], a1[1]), 1]];
        for (const [v, e] of quad) { pos.push(...v); edge.push(e); nor.push(0, 1, 0); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
    const m = new THREE.Mesh(g, mat(1)); m.renderOrder = 5; m.frustumCulled = false; m.visible = false;
    group.add(m);
  }
  const sg = new THREE.SphereGeometry(1, 48, 24);
  sg.setAttribute('edge', new THREE.Float32BufferAttribute(new Float32Array(sg.attributes.position.count), 1));
  const sheath = new THREE.Mesh(sg, mat(0));
  sheath.scale.set(6.2, 3.4, 10.5); sheath.position.set(0, 0.5, -3.2); sheath.renderOrder = 6; sheath.frustumCulled = false;
  group.add(sheath);
  group.visible = false;
  return { group, U, set(i, t) { U.uI.value = i; U.uT.value = t; group.visible = i > 0.002; } };
}

function buildCrack(ranger) {
  const yTop = ranger.shape?.yTop;
  const eye = ranger.anchors?.pilotEye?.position || V(-0.85, 1.2, -0.8);
  const look = V(0, 0.18, -1).normalize();
  const score = w => { const c = w.poly.reduce((a, q) => [a[0] + q[0] / w.poly.length, a[1] + q[1] / w.poly.length], [0, 0]); const d = V(c[0], yTop ? yTop(c[0], c[1]) : 2.2, c[1]).sub(eye).normalize(); return d.dot(look); };
  const wins = (ranger.windows || []).slice().sort((a, b) => score(b) - score(a));
  const group = new THREE.Group(); group.name = 'crack'; group.visible = false;
  if (!yTop || !wins.length) return { group, set() {} };
  const tex = crackTexture();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const w of wins.slice(0, 2)) {
    const p = w.poly, xs = p.map(q => q[0]), zs = p.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const pos = [], uv = [];
    for (let i = 1; i < p.length - 1; i++) for (const q of [p[0], p[i], p[i + 1]]) { pos.push(q[0], yTop(q[0], q[1]) - 0.16, q[1]); uv.push((q[0] - x0) / Math.max(0.01, x1 - x0) * 0.8 + 0.1, (q[1] - z0) / Math.max(0.01, z1 - z0) * 0.8 + 0.1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat); m.renderOrder = 7; group.add(m);
  }
  return { group, mat, set(v, light = 1) { group.visible = v > 0.001; mat.color.setScalar(v * 4 * light); } };
}

async function build(ctx) {
  const { engine } = ctx;
  const real = canRender(ctx);
  const scene = new THREE.Scene();
  scene.name = 'space';
  const camera = new THREE.PerspectiveCamera(62, engine.aspect, 0.03, 40000);
  camera.name = 'flightCam';
  let sky;
  if (real) { const { createSpaceSky } = await import('../../sky/space-sky.js'); sky = createSpaceSky({ engine }); } else sky = stubSky(engine);
  sky.setSkyRotation(BH.S);
  sky.setObserver(BH.E);
  sky.setPlanet(planetAt(BH.E));

  const kitA = await createRangerKit(ctx, { cockpit: true });
  const kitB = await createRangerKit(ctx, { cockpit: false, materials: kitA.materials });
  let endurance;
  if (real) { const { createEndurance } = await import('../../models/endurance.js'); endurance = await createEndurance({ engine, quality: engine.qualityName, materials: kitA.materials }); }
  else endurance = stubEndurance();
  const world = new THREE.Group();
  world.name = 'inertial';
  scene.add(world);
  world.add(endurance.group);

  const key = new THREE.DirectionalLight(0xfff8ee, 13);
  key.name = 'key';
  key.castShadow = true;
  const ss = engine.quality?.shadowSize || 4096;
  key.shadow.mapSize.set(ss, ss);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 420 });
  const bounce = new THREE.DirectionalLight(0xdfe6f0, 0);
  const diskLight = new THREE.DirectionalLight(0xffc890, 0);
  bounce.name = 'bounce'; diskLight.name = 'disk';
  scene.add(key, key.target, bounce, bounce.target, diskLight, diskLight.target);

  const player = kitA.ranger, other = kitB.ranger;
  scene.add(player.group, other.group);
  const cockpitRig = await createCockpitRig(ctx, { ranger: player, cockpit: kitA.cockpit });
  const plasma = real ? buildPlasma(player) : { group: new THREE.Group(), U: { uI: { value: 0 } }, set() {} };
  const crack = real ? buildCrack(player) : { group: new THREE.Group(), set() {} };
  player.group.add(plasma.group, crack.group);
  const glintMat = new THREE.SpriteMaterial({ map: real ? glintTexture() : null, color: new THREE.Color(0, 0, 0), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, sizeAttenuation: false });
  const glint = new THREE.Sprite(glintMat);
  glint.name = 'glint'; glint.renderOrder = 8; glint.frustumCulled = false; glint.visible = false;
  scene.add(glint);

  if (real) { sky.attachEnvironment(scene); }
  scene.environmentIntensity = 0.02;

  const state = {
    active: false, hold: false, spin: true, auto: true, exposure: 1, exposureBase: 1, exposureOverride: null, meter: { key: 0.16, min: 0.42, max: 1.6, up: 1.4, down: 0.9 }, meterOn: null, starBase: 1, starsOverride: null,
    focus: player.group, shadowMode: 'auto', aged: 0, glint: 0, glintAuto: true, bounce: 0, diskI: 0, diskDir: V(0, -1, 0), envT: 0, envDirty: false,
    keyScale: 1, bounceExtra: 0, lodOther: false, time: 0, inCockpit: false, gFill: 0, hullFill: 0, engine: null, engineOn: false, rcsT: 0, rcsLevel: 0, rcsKey: '', rcsLoop: null, rcsSet: 0,
  };

  const rig = {
    ctx, scene, camera, sky, key, bounce, diskLight, endurance, player, other, kitA, kitB, cockpit: kitA.cockpit, cockpitRig, plasma, crack, glint, state, BH, real,
    ports: { A: endurance.anchors.rangerPortA, B: endurance.anchors.rangerPortB },
    dock(ranger, port) {
      const p = typeof port === 'string' ? rig.ports[port] : port;
      endurance.group.add(ranger.group);
      ranger.group.quaternion.copy(p.quaternion);
      const off = ranger.anchors.dockPort.position.clone().applyQuaternion(p.quaternion);
      ranger.group.position.copy(p.position).sub(off);
      ranger.group.updateMatrixWorld(true);
    },
    dockPose(ranger, port) {
      const p = typeof port === 'string' ? rig.ports[port] : port;
      const off = ranger.anchors.dockPort.position.clone().applyQuaternion(p.quaternion);
      return { position: p.position.clone().sub(off), quaternion: p.quaternion.clone() };
    },
    release(r) { const g = r.isObject3D ? r : r.group; scene.attach(g); g.updateMatrixWorld(true); },
    world,
    toInertial(v, out = V(0, 0, 0)) { return out.copy(v).sub(world.position); },
    toLocal(v, out = V(0, 0, 0)) { return out.copy(v).add(world.position); },
    enduranceWorld(out = V(0, 0, 0)) { return out.copy(world.position); },
    onShift(fn) { shiftHooks.add(fn); return () => shiftHooks.delete(fn); },
    rehome() { if (world.position.lengthSq() > 0) shift(world.position.clone()); },
    activate({ background = true, fov = 62 } = {}) {
      state.active = true;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      engine.setView(scene, camera);
      engine.setBackground(background ? sky.scene : null, background ? sky.camera : null);
      ctx.audio.listener?.(camera);
    },
    setAge(years) {
      state.aged = years;
      endurance.setWindows(years > 0 ? clamp(1 - years / 42, 0.06, 0.6) : 1);
      endurance.setEngines(0);
    },
    setObserver(v) { sky.setObserver(v); },
    setSkyRotation(q) { sky.setSkyRotation(q); },
    refreshEnv() { if (real) sky.refreshEnvironment(); },
    bhToWorld(v, out = V(0, 0, 0)) { return out.copy(v).applyQuaternion(sky.skyRotation); },
    worldToBh(v, out = V(0, 0, 0)) { return out.copy(v).applyQuaternion(_q.copy(sky.skyRotation).invert()); },
    planetDirWorld(out = V(0, 0, 0)) { return out.copy(BH.P).sub(sky.observer).normalize().applyQuaternion(sky.skyRotation); },
    setupDocked({ playerPort = 'A', otherPort = 'B' } = {}) {
      rig.dock(player, playerPort);
      if (otherPort) { rig.dock(other, otherPort); other.group.visible = true; } else other.group.visible = false;
      player.group.visible = true;
    },
    resetSky() {
      sky.setSkyRotation(BH.S); sky.setObserver(BH.E); sky.setPlanet(planetAt(BH.E)); sky.setPlunge(0);
      sky.setDisk?.({ stars: 1 });
      rig.rehome();
      bounce.intensity = 0; diskLight.intensity = 0; state.diskI = 0; state.bounce = 0;
      plasma.set(0, 0); crack.set(0);
      rig.refreshEnv();
    },
    async compile() {
      if (!real) return;
      await sky.compile();
      const vis = plasma.group.visible, cv = crack.group.visible, gv = glint.visible;
      plasma.group.visible = crack.group.visible = glint.visible = true;
      await engine.renderer.compileAsync(scene, camera);
      plasma.group.visible = vis; crack.group.visible = cv; glint.visible = gv;
    },
    flightSound(st, dt) {
      const a = ctx.audio;
      const thr = st?.throttle || 0;
      if (!state.engine) state.engine = a.engine?.('main_engine') || null;
      const E = state.engine;
      if (E) {
        if (thr > 0.02 && !state.engineOn) { state.engineOn = true; E.ignite(thr); }
        else if (state.engineOn && thr <= 0.01) { state.engineOn = false; E.shutdown(); }
        else if (state.engineOn) E.set(thr);
      }
      const r = st?.rcs, w = st?.angularVelocity;
      const lin = r ? Math.min(1, Math.abs(r.x) + Math.abs(r.y) + Math.abs(r.z)) : 0;
      const spin = state.spinAcc ||= V(0, 0, 0);
      if (st?.angAccel) spin.copy(st.angAccel);
      else if (state.lastW && w && dt > 0) spin.copy(w).sub(state.lastW).multiplyScalar(0.6 / dt);
      else spin.set(0, 0, 0);
      if (spin.length() > 1) spin.setLength(1);
      const rot = Math.min(1, spin.length() * 0.85);
      if (w) (state.lastW ||= V(0, 0, 0)).copy(w);
      if (st?.quaternion) { if (Math.abs(thr - player.engine) > 0.004) player.setEngine(thr); player.setRcs?.(r || null, spin); }
      const act = Math.max(lin, rot * 0.5);
      state.rcsLevel += (act - state.rcsLevel) * Math.min(1, dt * (act > state.rcsLevel ? 12 : 4));
      const key = lin > 0.25 ? `${Math.sign(r.x)}${Math.sign(r.y)}${Math.sign(r.z)}` : '';
      state.rcsT -= dt;
      if (key && key !== state.rcsKey && state.rcsT <= 0) { a.sfx('rcs', { volume: 0.2, rate: 0.92 + Math.random() * 0.1 }); state.rcsT = 0.5; }
      state.rcsKey = key;
      if (state.rcsLevel > 0.03 && !state.rcsLoop) { state.rcsLoop = a.loop('ranger_engines', { volume: 0, lowpass: 950, rate: 1.22 }); state.rcsSet = 0; }
      const vol = 0.26 * state.rcsLevel;
      if (state.rcsLoop && Math.abs(vol - state.rcsSet) > 0.012) { state.rcsSet = vol; state.rcsLoop.set({ volume: vol, fade: 0.12 }); }
    },
    stopSound() {
      if (state.engineOn) state.engine?.shutdown?.();
      state.engineOn = false;
      state.rcsLoop?.stop(0.3); state.rcsLoop = null; state.rcsLevel = 0; state.rcsKey = '';
      player.setRcs?.(null, null);
    },
    dispose() {
      offUpdate(); offPre(); offDir?.();
      cockpitRig.dispose();
      for (const k of [kitA, kitB]) { k.ranger.dispose?.(); k.cockpit?.dispose?.(); }
      endurance.dispose?.();
      sky.dispose();
      scene.traverse(o => { if (o.isMesh || o.isSprite) { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); } });
      if (cached && rig === cachedRig) cached = null;
    },
  };
  let cachedRig = rig;
  const shiftHooks = new Set();
  function shift(d) {
    if (player.group.parent === scene) player.group.position.sub(d);
    world.position.sub(d);
    camera.position.sub(d);
    camera.updateMatrixWorld();
    for (const fn of shiftHooks) fn(d);
    scene.updateMatrixWorld();
  }
  function floatOrigin() {
    if (player.group.parent !== scene) return;
    const inertial = _a2.copy(player.group.position).sub(world.position);
    const far = inertial.length() > 1500;
    if (!far && world.position.lengthSq() > 0 && inertial.length() < 1000) shift(world.position.clone());
    else if (far && player.group.position.length() > 40) shift(player.group.position.clone());
  }
  const _a2 = V(0, 0, 0), _ew = V(0, 0, 0);

  const shadowBasis = { r: V(0, 0, 0), u: V(0, 0, 0), f: V(0, 0, 0) };
  function placeShadow() {
    const ld = sky.lightDirection;
    const fw = state.focus.getWorldPosition(V(0, 0, 0));
    const camIn = camera.position.distanceTo(fw) < 9;
    let center = fw, half = 13;
    const ew = world.position;
    const dE = fw.distanceTo(ew);
    const dC = camera.position.distanceTo(ew);
    if (state.shadowMode === 'tight' || (state.shadowMode === 'auto' && (camIn || dC > 160))) { center = fw; half = 13; }
    else if (dE < 70) { center = ew.clone().lerp(fw, 0.25); half = 48; }
    else if (dC < 160) { center = ew.clone(); half = 46; }
    shadowBasis.f.copy(ld);
    shadowBasis.r.set(0, 1, 0).cross(ld); if (shadowBasis.r.lengthSq() < 1e-4) shadowBasis.r.set(1, 0, 0); shadowBasis.r.normalize();
    shadowBasis.u.crossVectors(ld, shadowBasis.r).normalize();
    const texel = (half * 2) / key.shadow.mapSize.x;
    const cr = Math.round(center.dot(shadowBasis.r) / texel) * texel, cu = Math.round(center.dot(shadowBasis.u) / texel) * texel, cf = center.dot(shadowBasis.f);
    const c = V(0, 0, 0).addScaledVector(shadowBasis.r, cr).addScaledVector(shadowBasis.u, cu).addScaledVector(shadowBasis.f, cf);
    key.target.position.copy(c);
    key.position.copy(c).addScaledVector(ld, 200);
    const sc = key.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    key.target.updateMatrixWorld();
    key.updateMatrixWorld();
  }

  const _cf = V(0, 0, 0), _cp = V(0, 0, 0), _wd = V(0, 0, 0);
  function fills(dir, pos, halfV, halfD) {
    const r = Math.max(1.05, sky.observer.length());
    const rd = Math.asin(Math.min(1, 15 / r));
    const ag = Math.acos(clamp(dir.dot(sky.lightDirection), -1, 1));
    const inG = 1 - smooth(ag, rd * 0.5, rd + halfD);
    const g = clamp(inG * Math.pow(clamp(rd / halfV, 0.08, 1), 0.55) + smooth(sky.plunge, 0.2, 0.7), 0, 1);
    let h = 0;
    if (endurance.group.visible) {
      _v.copy(world.position).sub(pos); const d = _v.length();
      const ae = Math.atan(42 / Math.max(d, 1));
      const a = Math.acos(clamp(_v.normalize().dot(dir), -1, 1));
      h = (1 - smooth(a, ae * 0.4, ae + halfD)) * clamp(ae / halfV, 0, 1);
    }
    const pd = sky.planet?.state?.direction, par = sky.planet?.state?.angularRadius || 0;
    let p = 0;
    if (pd && par > 0.05) { _w.copy(pd).applyQuaternion(sky.skyRotation); const a = Math.acos(clamp(_w.dot(dir), -1, 1)); p = (1 - smooth(a, par * 0.6, par + halfD)) * clamp(par / halfV, 0, 1); }
    return { g, h, p };
  }
  function directExposure(dt) {
    camera.getWorldDirection(_cf); camera.getWorldPosition(_cp);
    const meter = state.inCockpit && state.exposureOverride == null && !!engine.film.setAutoExposure;
    const want = meter ? JSON.stringify(state.meter) : null;
    if (want !== state.meterOn) { state.meterOn = want; engine.film.setAutoExposure?.(meter ? state.meter : null); }
    const halfV = THREE.MathUtils.degToRad(camera.fov) / 2, halfD = Math.atan(Math.tan(halfV) * Math.hypot(1, camera.aspect));
    const { g, h, p } = fills(_cf, _cp, halfV, halfD);
    state.gFill = g; state.hullFill = h; state.planetFill = p;
    const lit = g * (1 - 0.9 * h);
    const gx = Math.exp(Math.log(0.11) * lit * (1 - 0.85 * p));
    const target = state.exposureOverride ?? state.exposureBase * gx * THREE.MathUtils.lerp(1, 0.8, Math.max(h * 0.5, p * (1 - g)));
    engine.film.autoCap = meter ? state.exposureBase * gx * THREE.MathUtils.lerp(8, 1.05, smooth(lit, 0.05, 0.6)) : Infinity;
    const k = 1 - Math.exp(-dt * 1.6);
    if (meter) state.exposure = engine.film.exposure;
    else { state.exposure = Math.exp(Math.log(state.exposure) + (Math.log(Math.max(1e-3, target)) - Math.log(state.exposure)) * k); engine.film.exposure = state.exposure; }
    const stars = state.starsOverride ?? clamp(1 - 1.7 * g - 1.3 * h - 1.6 * p - (state.inCockpit ? 0.55 : 0), 0, 1) * state.starBase;
    sky.setDisk?.({ stars });
  }
  function windowBounce() {
    _wd.set(0, 0.55, -1).normalize().applyQuaternion(player.group.getWorldQuaternion(_q));
    const { g, h, p } = fills(_wd, player.group.getWorldPosition(_cp), 1.1, 1.3);
    const lit = clamp(_wd.dot(sky.lightDirection) * 0.5 + 0.5, 0, 1);
    const v = (0.5 * g + 0.6 * h * lit + 0.55 * p) * (sky.lightIntensity / 13) + state.diskI * 0.02 + state.bounceExtra + 0.05 + 0.03 * cockpitRig.powerLevel;
    cockpitRig.setBounce(v);
  }

  function frame(dt) {
    if (state.hold) { engine.setView(scene, camera); engine.setBackground(sky.scene, sky.camera); engine.film.fade = 0; }
    state.active = engine.scene === scene;
    if (!state.active) return;
    state.time += dt;
    floatOrigin();
    if (state.spin) endurance.group.rotation.z += SPIN * dt;
    endurance.update?.(dt);
    player.update(dt); other.update(dt);
    sky.update(camera, dt);
    key.color.copy(sky.lightColor);
    key.intensity = sky.lightIntensity * state.keyScale;
    placeShadow();
    const pw = player.group.getWorldPosition(_u);
    state.inCockpit = camera.position.distanceTo(pw) < 8 && !(ctx.view?.kind === 'ship' && ctx.view.blend > 0.5);
    const dOther = camera.position.distanceTo(other.group.getWorldPosition(_v));
    const low = dOther > 90;
    if (low !== state.lodOther) { other.setLOD(low); state.lodOther = low; }
    const gain = clamp(0.9 / Math.max(0.05, engine.film.exposure), 1, 6);
    player.setPlumeGain?.(gain); other.setPlumeGain?.(gain);
    const chase = ctx.view?.kind === 'ship' ? ctx.view.blend * CHASE_FILL : 0;
    bounce.intensity = Math.max(state.bounce, chase);
    if (chase > state.bounce) { bounce.position.copy(pw).addScaledVector(_w.set(0.25, 0.4, 1).normalize().applyQuaternion(ctx.view.q), 100); bounce.target.position.copy(pw); bounce.target.updateMatrixWorld(); }
    else if (state.bounce > 0) { rig.planetDirWorld(_w); bounce.position.copy(pw).addScaledVector(_w, 100); bounce.target.position.copy(pw); bounce.target.updateMatrixWorld(); }
    diskLight.intensity = state.diskI;
    if (state.diskI > 0) { diskLight.position.copy(pw).addScaledVector(state.diskDir, 100); diskLight.target.position.copy(pw); diskLight.target.updateMatrixWorld(); }
    if (state.glintAuto) {
      const d = camera.position.distanceTo(world.position);
      state.glint = endurance.group.visible ? smooth(d, 350, 1200) : 0;
    }
    if (state.glint > 0.001) {
      glint.visible = true;
      const d = camera.position.distanceTo(world.position);
      glint.position.copy(camera.position).sub(world.position).setLength(Math.min(60, d * 0.5)).add(world.position);
      const lit = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(state.time * 0.55 * 2)), 3);
      glintMat.color.setScalar(state.glint * lit * 60);
      glint.scale.setScalar(0.09 + 0.1 * state.glint * clamp(3000 / d, 0.5, 1.5));
    } else glint.visible = false;
    if (state.auto) directExposure(dt);
    if (state.envDirty && (state.envT += dt) > 0.6) { state.envT = 0; state.envDirty = false; rig.refreshEnv(); }
    if (state.inCockpit) { windowBounce(); const L = rig.cockpit?.lights; if (L?.flood && cockpitRig.powerLevel < 0.08) L.flood.intensity = Math.max(L.flood.intensity, 0.35); }
    if (state.inCockpit || cockpitRig.power.avionics || cockpitRig.failure > 0) cockpitRig.update(dt, camera);
  }
  const offUpdate = engine.onUpdate(frame);
  const offPre = engine.onPreRender(() => { if (state.hold) { engine.setView(scene, camera); engine.setBackground(sky.scene, sky.camera); engine.film.fade = 0; } });
  const offDir = ctx.director?.on?.((type, data) => { if (type === 'enter' && !FLIGHT_CHAPTERS.includes(data?.chapter)) rig.dispose(); });

  rig.setupDocked({ playerPort: 'A', otherPort: 'B' });
  await rig.compile();
  return rig;
}

const _ns = V(0, 0, 0);
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export function netStage(ctx, rig) {
  const net = ctx.net;
  rig.state.netShip = false;
  if (!net) return;
  const E = rig.endurance.group, o = rig.other, g = rig.player.group;
  const last = { e: -1, l: -1 };
  const offShift = rig.onShift(d => { if (rig.state.netShip && o.group.parent === rig.scene) o.group.position.sub(d); });
  const offExit = ctx.director.on(type => { if (type === 'exit') { offShift(); offExit(); rig.state.netShip = false; } });
  net.stage({
    scene: rig.scene,
    ship: () => {
      const docked = g.parent === E;
      return { k: docked ? 'e' : 'i', p: docked ? g.position : rig.toInertial(g.position, _ns), q: g.quaternion, e: Math.round((rig.player.engine || 0) * 20) / 20, l: rig.player.lights ? 1 : 0 };
    },
    placeShip: s => {
      rig.state.netShip = !!s;
      if (!s) return;
      const og = o.group, d = s.s;
      if (d.k === 'e') { if (og.parent !== E) E.add(og); og.position.copy(s.p); }
      else { if (og.parent !== rig.scene) rig.scene.add(og); rig.toLocal(s.p, og.position); }
      og.quaternion.copy(s.q);
      og.visible = d.k === 'e' ? E.visible : og.position.distanceTo(rig.camera.position) < 9000;
      if (d.e !== last.e) { last.e = d.e; o.setEngine?.(d.e || 0); }
      if (d.l !== last.l) { last.l = d.l; o.setLights?.(!!d.l); }
    },
    world: () => ({ spin: Math.round(wrapPi(E.rotation.z) * 1000) / 1000 }),
    applyWorld: (w, dt) => {
      if (w.spin == null || !rig.state.spin) return;
      const e = wrapPi(w.spin - E.rotation.z);
      E.rotation.z += e * Math.min(1, dt * 2);
    },
  });
}

export const RS_M = 2.95e11;
const _a = V(0, 0, 0), _b = new THREE.Quaternion(), _c = new THREE.Quaternion();

export function seatTween(rig, fromCam, seatCtl, seconds = 1.4) {
  const ranger = rig.player.group;
  ranger.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(ranger.matrixWorld).invert();
  const p0 = fromCam.position.clone().applyMatrix4(inv);
  const q0 = ranger.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(fromCam.quaternion.clone());
  const t = { u: 0, done: false, position: p0.clone(), quaternion: q0.clone(), enabled: true };
  t.update = (dt, input) => {
    t.u = Math.min(1, t.u + dt / seconds);
    const e = t.u * t.u * (3 - 2 * t.u);
    seatCtl.update(0, input);
    ranger.updateWorldMatrix(true, false);
    const pT = seatCtl.camera.position.clone().applyMatrix4(new THREE.Matrix4().copy(ranger.matrixWorld).invert());
    const rq = ranger.getWorldQuaternion(_b);
    const qT = _c.copy(rq).invert().multiply(seatCtl.camera.quaternion);
    t.position.lerpVectors(p0, pT, e);
    t.quaternion.slerpQuaternions(q0, qT, e);
    const cam = seatCtl.camera;
    cam.position.copy(t.position).applyMatrix4(ranger.matrixWorld);
    cam.quaternion.copy(rq).multiply(t.quaternion);
    cam.updateMatrixWorld();
    if (t.u >= 1) t.done = true;
  };
  return t;
}

export function occludedByEndurance(p, dir) {
  if (Math.abs(dir.z) < 1e-4) return false;
  const s = -p.z / dir.z;
  if (s < 0) return false;
  const x = p.x + dir.x * s, y = p.y + dir.y * s, r = Math.hypot(x, y);
  return r < 4.5 || (r > 23.5 && r < 41);
}

export function navFeed(rig, body, target, { dirWorld, range, closing = 0, burn } = {}) {
  const cr = rig.cockpitRig;
  const dir = dirWorld || (target === 'GARGANTUA' ? rig.sky.lightDirection : target === 'ENDURANCE' ? _a.copy(rig.world.position).sub(body.position).normalize() : rig.planetDirWorld(_a));
  const aim = cr.aim(body.quaternion, dir);
  const obs = rig.sky.observer;
  const rng = range ?? (target === 'GARGANTUA' ? obs.length() * RS_M : target === 'ENDURANCE' ? body.position.distanceTo(rig.world.position) : obs.distanceTo(BH.P) * RS_M);
  cr.setNav({ target, bearing: aim.bearing, elevation: aim.elevation, alignError: aim.error, tolerance: 2.9, range: rng, closing, burn: burn || { cue: target === 'ENDURANCE' ? null : 'BURN' } });
  return aim;
}

export function viewClear(rig) {
  const p = V(0, 0, 0), o = V(0, 0, 0);
  return (pivot, d) => {
    if (!rig.endurance.group.visible) return 1;
    const rot = rig.endurance.group.rotation.z, c = Math.cos(-rot), s = Math.sin(-rot);
    const og = rig.other.group, op = og.visible && og.parent === rig.endurance.group ? rig.toInertial(og.getWorldPosition(o), o) : null;
    const n = 12;
    for (let i = 2; i <= n; i++) {
      rig.toInertial(p.copy(pivot).addScaledVector(d, i / n), p);
      const lx = p.x * c - p.y * s, ly = p.x * s + p.y * c, r = Math.hypot(lx, ly), az = Math.abs(p.z);
      if (p.length() < 8.5 || (az < 4 && r > 25.5 && r < 45) || (az < 3.6 && Math.abs(ly) < 3.6 && Math.abs(lx) < 30) || (r < 5 && az < 7) || (op && Math.abs(p.z - op.z) < 11 && Math.hypot(p.x - op.x, p.y - op.y) < 6)) return Math.max(0.05, (i - 1.5) / n);
    }
    return 1;
  };
}

export function roundVec(v, k = 100) { return v.toArray().map(x => Math.round(x * k) / k); }

export function preloadSounds(ctx, group, ids) { ctx.audio.preload?.(group); ctx.audio.load(ids.concat('ranger_engines')); }

const _c1 = V(0, 0, 0), _c2 = V(0, 0, 0), _c3 = V(0, 0, 0);
export function collideEndurance(rig, f) {
  if (!f.enabled || f.body.parent !== rig.scene || !rig.endurance.group.visible) return false;
  const p = rig.toInertial(f.body.position, _c1);
  const rot = rig.endurance.group.rotation.z, c = Math.cos(-rot), s = Math.sin(-rot);
  const lx = p.x * c - p.y * s, ly = p.x * s + p.y * c, lz = p.z, r = Math.hypot(lx, ly);
  const n = _c2.set(0, 0, 0);
  let pen = 0;
  const o = rig.other.group;
  const op = o.visible && o.parent === rig.endurance.group ? rig.toInertial(o.getWorldPosition(_c3), _c3) : null;
  const od = op ? Math.hypot(p.x - op.x, p.y - op.y) : Infinity;
  if (p.length() < 12) { n.copy(p).normalize(); pen = 12 - p.length(); }
  else if (Math.abs(lz) < 7.5 && r > 21 && r < 44) { n.set(0, 0, Math.sign(lz) || 1); pen = 7.5 - Math.abs(lz); }
  else if (Math.abs(lz) < 6 && Math.abs(ly) < 4.5 && Math.abs(lx) < 36) { n.set(0, 0, Math.sign(lz) || 1); pen = 6 - Math.abs(lz); }
  else if (op && Math.abs(p.z - op.z) < 13 && od < 8) { if (od > 0.05) n.set((p.x - op.x) / od, (p.y - op.y) / od, 0); else n.set(1, 0, 0); pen = 8 - od; }
  if (pen <= 0) return false;
  f.body.position.addScaledVector(n, pen);
  const vn = f.velocity.dot(n);
  if (vn < 0) {
    f.velocity.addScaledVector(n, -1.5 * vn);
    f.angularVelocity.add(V((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4));
    if (-vn > 0.3) { rig.ctx.input?.rumble?.(Math.min(1, -vn * 0.4 + 0.3), 0.2); rig.ctx.audio.sfx('bump_soft', { volume: Math.min(1, -vn * 0.4 + 0.4), rate: 0.55 }); rig.ctx.audio.sfx('groan', { volume: Math.min(0.8, -vn * 0.3) }); }
  }
  return true;
}
