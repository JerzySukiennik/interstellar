// Miller chapter world: ocean, real Ranger and cockpit with hazed hull, boarding steps, wreckage with the flight recorder, colliders, and a light stand-in for the logic harness.
import * as THREE from 'three';
import { buildWreck, adaptWreck } from './wreck.js';

export const SEABED = -0.55;
export const GRAV = 12.75;
export const UPWIND = new THREE.Vector3(0.953, 0, -0.302).normalize();
export const LZ = new THREE.Vector3(0, 0, 0);
export const WRECK_DIST = 120;
export const BEACON0 = LZ.clone().addScaledVector(UPWIND, -WRECK_DIST);
export const DECK = { base: 1500, top: 2700 };
export const START = { p: LZ.clone().addScaledVector(UPWIND, -2300).setY(1960), yaw: Math.atan2(-UPWIND.x, -UPWIND.z) };
export const CABIN = { floorX: 2.3, z0: -3.1, z1: 6.48, doorX: 0.6, face: 8.0 };
export const STEPS = { n: 8, run: 0.33, width: 1.05 };
export const SEATS = { pilot: [-0.85, -0.75], copilot: [0.85, -0.75], rearL: [-1.55, 1.0], rearR: [1.55, 1.0] };
export const EYE = [-0.85, 1.2, -0.8];

const STUB_COLLIDERS = [
  { id: 'wallL', min: [-3.4, 0, -3.1], max: [-2.3, 2.6, 6.48] },
  { id: 'wallR', min: [2.3, 0, -3.1], max: [3.4, 2.6, 6.48] },
  { id: 'front', min: [-3.2, 0, -3.3], max: [3.2, 1.4, -1.98] },
  { id: 'pedestal', min: [-0.32, 0, -1.95], max: [0.32, 0.66, 0.45] },
  { id: 'consoleL', min: [-2.45, 0, -1.95], max: [-1.45, 0.7, 0.15] },
  { id: 'consoleR', min: [1.45, 0, -1.95], max: [2.45, 0.7, 0.15] },
  { id: 'suitLocker', min: [-2.4, 0, 2.25], max: [-1.6, 1.7, 3.55] },
  { id: 'lockersL', min: [-2.4, 0, 3.7], max: [-1.66, 1.16, 6.0] },
  { id: 'lockersR', min: [1.64, 0, 1.95], max: [2.4, 1.22, 5.6] },
  { id: 'rearL', min: [-3.2, 0, 6.43], max: [-0.62, 2.4, 6.58] },
  { id: 'rearR', min: [0.62, 0, 6.43], max: [3.2, 2.4, 6.58] },
];

export function stepsY(z, seabedLocal) {
  const rise = -seabedLocal / STEPS.n;
  const k = Math.ceil((z - CABIN.face) / STEPS.run - 1e-6);
  return Math.max(seabedLocal, -rise * Math.max(0, k));
}

export function seatColliders() {
  const out = [];
  for (const [id, [x, z]] of Object.entries(SEATS)) out.push({ id: 'seat_' + id, min: [x - 0.3, 0, z - 0.3], max: [x + 0.3, 0.55, z + 0.35] }, { id: 'seatback_' + id, min: [x - 0.3, 0.45, z + 0.2], max: [x + 0.3, 1.45, z + 0.48] });
  return out;
}

export function rampY(r, z, seabedLocal = -9) {
  if (z <= r.from[2]) return Math.max(0, r.from[1]);
  if (z >= r.to[2]) return Math.max(seabedLocal, r.to[1] - (z - r.to[2]));
  const u = (z - r.from[2]) / (r.to[2] - r.from[2]);
  return r.from[1] + (r.to[1] - r.from[1]) * u;
}

export function walkData(W) {
  const ranger = W.ranger, seabedLocal = -ranger.gearHeight, ramp = ranger.ramp || null;
  const colliders = (W.cockpit.colliders || []).filter(c => c.id !== 'door' && !String(c.id || '').startsWith('ceil')).map(c => ({ id: c.id, min: [...c.min], max: [...c.max] })).concat(exteriorColliders(ranger.gearHeight, ramp));
  const rampEnd = ramp ? ramp.to[2] + Math.max(0, ramp.to[1] - seabedLocal) + 0.05 : 0;
  const floors = [
    { min: [-CABIN.floorX, CABIN.z0], max: [CABIN.floorX, CABIN.z1], y: 0 },
    { min: [-CABIN.doorX, CABIN.z1 - 0.1], max: [CABIN.doorX, CABIN.face], y: 0 },
    ramp ? { min: [-ramp.width / 2 - 0.05, CABIN.face], max: [ramp.width / 2 + 0.05, rampEnd], y: (x, z) => rampY(ramp, z, seabedLocal) } : { min: [-STEPS.width / 2 - 0.05, CABIN.face], max: [STEPS.width / 2 + 0.05, CABIN.face + STEPS.n * STEPS.run], y: (x, z) => stepsY(z, seabedLocal) },
  ];
  W.seabedLocal = seabedLocal;
  W.floors = floors;
  W.colliders = colliders;
  return { floors, colliders, seabedLocal };
}

export function exteriorColliders(gearHeight, ramp) {
  const foot = -gearHeight + 0.16;
  const rw = ramp ? ramp.width / 2 + 0.1 : STEPS.width / 2 + 0.1, rz = ramp ? ramp.to[2] : 8.0 + STEPS.n * STEPS.run;
  return [
    { id: 'belly', min: [-4.6, -1.7, -8.2], max: [4.6, -0.45, 7.98] },
    { id: 'tunnelL', min: [-3.6, -0.3, 6.45], max: [-0.6, 2.4, 8.02] },
    { id: 'tunnelR', min: [0.6, -0.3, 6.45], max: [3.6, 2.4, 8.02] },
    { id: 'gearL', min: [-3.4, foot - 0.3, 4.4], max: [-2.6, -0.5, 5.5] },
    { id: 'gearR', min: [2.6, foot - 0.3, 4.4], max: [3.4, -0.5, 5.5] },
    { id: 'gearN', min: [-0.4, foot - 0.3, -4.5], max: [0.4, -0.5, -3.4] },
    { id: 'stepRailL', min: [-rw - 0.1, -3, 8.0], max: [-rw, 0.9, rz - 0.3] },
    { id: 'stepRailR', min: [rw, -3, 8.0], max: [rw + 0.1, 0.9, rz - 0.3] },
    { id: 'innerDoor', min: [-0.62, 0, 6.36], max: [0.62, 1.74, 6.5] },
    { id: 'innerDoorOpen', min: [0.55, 99, 5.15], max: [0.98, 101, 6.45] },
    { id: 'outerDoor', min: [-0.62, 0, 7.9], max: [0.62, 1.74, 8.1] },
  ];
}

function hazeAll(root, ocean) {
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    for (const m of [].concat(o.material)) if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.userData.millerHaze) ocean.applyHaze(m);
  });
}

function stubOcean() {
  const H0 = 1200;
  const prof = s => s < 0.08 ? 0 : s < 0.63 ? Math.pow(Math.min(1, (s - 0.08) / 0.55), 1.6) : s < 5.2 ? 1 - (s - 0.63) / 4.57 : 0;
  const wave = { x: 9000, speed: 0, height: H0, visible: false, second: true, gap: 14000, height2: 1050, timeToReach() { return Infinity; } };
  let level = 0;
  return {
    stub: true, group: new THREE.Group(), wave, sky: null, environment: null, keyLight: null,
    update() {}, heightAt(x, z) {
      let h = level;
      if (wave.visible) for (const [wx, H] of [[wave.x, wave.height], [wave.x + wave.gap, wave.height2]]) h = Math.max(h, prof((x - wx - meander(z)) / H) * H);
      return Math.max(h, SEABED + 0.012);
    },
    setWave(o = {}) { Object.assign(wave, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))); },
    setDrawdown(d) { level = -0.32 * Math.min(1, Math.max(0, d)); }, splash() {}, addWake() { return { remove() {} }; },
    setWind() {}, setMist() {}, setSubmerged() {}, setCloudDeck() {}, occlusionAt: () => 1, applyHaze: m => m, dispose() {},
  };
}

const MEANDER = [[85, 0.00029, 1.3], [140, 0.000113, 4.1], [30, 0.00093, 0.4]];
const MEANDER0 = MEANDER.reduce((s, [a, , p]) => s + a * Math.sin(p), 0);
export const meander = z => MEANDER.reduce((s, [a, k, p]) => s + a * Math.sin(z * k + p), 0) - MEANDER0;

function invisibleMat() { return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }); }

function targetMesh(parent, pos, size = [0.12, 0.08, 0.12], name = 'target') {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), invisibleMat());
  m.name = name;
  m.position.set(...pos);
  m.renderOrder = -1;
  parent.add(m);
  return m;
}

function buildSteps(parent, mats, seabedLocal) {
  const g = new THREE.Group();
  g.name = 'boardingSteps';
  const rise = -seabedLocal / STEPS.n, w = STEPS.width;
  const tread = new THREE.BoxGeometry(w, 0.045, STEPS.run - 0.02);
  const plate = mats.frame || mats.metal;
  const treads = new THREE.InstancedMesh(tread, plate, STEPS.n - 1);
  for (let k = 1; k < STEPS.n; k++) treads.setMatrixAt(k - 1, new THREE.Matrix4().makeTranslation(0, -rise * k - 0.022, CABIN.face + (k - 0.5) * STEPS.run));
  treads.castShadow = treads.receiveShadow = true;
  g.add(treads);
  const len = Math.hypot(STEPS.n * STEPS.run, -seabedLocal + 0.2);
  const ang = Math.atan2(-seabedLocal + 0.2, STEPS.n * STEPS.run);
  for (const s of [-1, 1]) {
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, len), mats.metal);
    stringer.position.set(s * (w / 2 + 0.03), seabedLocal / 2 - 0.12, CABIN.face + STEPS.n * STEPS.run / 2);
    stringer.rotation.x = -ang;
    stringer.castShadow = stringer.receiveShadow = true;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 10), mats.metal);
    rail.rotation.x = Math.PI / 2 - ang;
    rail.position.set(s * (w / 2 + 0.05), seabedLocal / 2 + 0.78, CABIN.face + STEPS.n * STEPS.run / 2 - 0.05);
    rail.castShadow = true;
    for (const f of [0.15, 0.55, 0.92]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), mats.metal);
      const z = CABIN.face + f * STEPS.n * STEPS.run;
      post.position.set(s * (w / 2 + 0.05), stepsY(z, seabedLocal) + 0.45, z);
      g.add(post);
    }
    g.add(stringer, rail);
  }
  g.visible = false;
  parent.add(g);
  return g;
}

function stubRanger() {
  const group = new THREE.Group();
  group.name = 'RangerStub';
  const anchors = {};
  for (const id of ['L', 'R', 'N']) { const f = new THREE.Object3D(); f.name = 'gearFoot' + id; f.position.set(id === 'L' ? -3 : id === 'R' ? 3 : 0, -2.45, id === 'N' ? -3.84 : 5.11); group.add(f); anchors['gearFoot' + id] = f; }
  const st = { gear: 0, hatch: 0, engine: 0 };
  return { group, anchors, windows: [], materials: {}, gearHeight: 2.61, setGear: v => { st.gear = v; }, setHatch: v => { st.hatch = v; }, setEngine: v => { st.engine = v; }, setLights() {}, setLOD() {}, update() {}, dispose() {}, get gear() { return st.gear; }, get hatch() { return st.hatch; }, stub: true };
}

function stubCockpit(ranger) {
  const group = new THREE.Group();
  const values = {};
  const mk = (id, pos) => { const o = new THREE.Group(); o.position.set(...pos); const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), invisibleMat()); o.add(t); group.add(o); return { id, object: o, set: v => { values[id] = v; } }; };
  const interactables = [mk('engineStart', [0, 0.62, -1.55]), mk('hatch', [-0.44, 0.95, 6.37]), mk('batt', [-0.18, 0.7, -1.65]), mk('fuelCells', [-0.06, 0.7, -1.65]), mk('avionics', [0.06, 0.7, -1.65]), mk('rcs', [0.18, 0.7, -1.65])];
  ranger.group.add(group);
  return { group, stub: true, anchors: {}, displaySlots: [], interactables, colliders: STUB_COLLIDERS.concat(seatColliders()), walkable: [], lights: {}, set: (id, v) => { values[id] = v; }, get: id => values[id] ?? 0, setPower() {}, setFailure() {}, setStick() {}, setThrottle() {}, update() {}, dispose() {} };
}

export async function buildWorld(ctx) {
  const { engine } = ctx;
  const real = !!engine.renderer.capabilities;
  const quality = engine.qualityName;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, 16 / 9, 0.04, 40000);
  let ocean, ranger, cockpit, hull;
  if (real) {
    const [{ createMillerSurface }, { createHullMaterials }, { createRanger }, { createRangerCockpit }] = await Promise.all([
      import('../../world/ocean.js'), import('../../models/hull-materials.js'), import('../../models/ranger.js'), import('../../models/ranger-cockpit.js')]);
    ocean = createMillerSurface({ engine, wind: 0.5, quality, second: true });
    scene.add(ocean.group);
    scene.environment = ocean.environment;
    scene.environmentIntensity = 1;
    hull = createHullMaterials({ renderer: engine.renderer, quality });
    ranger = await createRanger({ engine, quality, materials: hull });
    cockpit = await createRangerCockpit({ engine, quality, materials: hull, ranger });
    ranger.group.add(cockpit.group);
    const own = new Set(Object.values(hull).filter(m => m && m.isMaterial));
    cockpit.group.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && !own.has(m)) m.envMapIntensity = 0.14; });
    for (const m of own) if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) ocean.applyHaze(m);
    ranger.group.traverse(o => { if (o.isMesh && !cockpit.group.getObjectById(o.id)) for (const m of [].concat(o.material)) if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.userData.millerHaze) ocean.applyHaze(m); });
    const key = ocean.keyLight;
    key.castShadow = true;
    const ss = engine.quality?.shadowSize || 2048;
    key.shadow.mapSize.set(ss, ss);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 160 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    scene.add(key, key.target);
  } else {
    ocean = stubOcean();
    ranger = stubRanger();
    cockpit = stubCockpit(ranger);
    hull = { white: null };
  }
  scene.add(ranger.group);
  const mats = real ? hull : { white: new THREE.MeshBasicMaterial(), metal: new THREE.MeshBasicMaterial() };
  const seabedLocal = -ranger.gearHeight;
  const ramp = ranger.ramp || null;
  const steps = ramp ? new THREE.Group() : buildSteps(ranger.group, mats, seabedLocal);
  if (ramp) { steps.visible = false; ranger.group.add(steps); }
  if (real && !ramp) hazeAll(steps, ocean);
  let wreck = null;
  if (real) {
    const { createWreck } = await import('../../models/wreck.js');
    wreck = adaptWreck(await createWreck({ engine, quality, materials: hull }), mats, ocean, hazeAll);
  } else wreck = buildWreck(mats, ocean, hazeAll);
  wreck.root.visible = false;
  wreck.trail.visible = false;
  scene.add(wreck.root, wreck.trail);

  const eye = new THREE.Object3D();
  eye.name = 'millerEye';
  eye.position.set(...EYE);
  ranger.group.add(eye);
  const targets = {
    harness: targetMesh(ranger.group, [EYE[0], 0.74, -1.08], [0.16, 0.08, 0.12], 'harnessTarget'),
  };
  const byId = id => cockpit.interactables.find(i => i.id === id) || null;
  const colliders = (cockpit.colliders || []).filter(c => c.id !== 'door' && !String(c.id || '').startsWith('ceil')).map(c => ({ id: c.id, min: [...c.min], max: [...c.max] })).concat(exteriorColliders(ranger.gearHeight, ramp));
  const floors = [
    { min: [-CABIN.floorX, CABIN.z0], max: [CABIN.floorX, CABIN.z1], y: 0 },
    { min: [-CABIN.doorX, CABIN.z1 - 0.1], max: [CABIN.doorX, CABIN.face], y: 0 },
    ramp ? { min: [-ramp.width / 2 - 0.05, CABIN.face], max: [ramp.width / 2 + 0.05, ramp.to[2]], y: (x, z) => rampY(ramp, z) } : { min: [-STEPS.width / 2 - 0.05, CABIN.face], max: [STEPS.width / 2 + 0.05, CABIN.face + STEPS.n * STEPS.run], y: (x, z) => stepsY(z, seabedLocal) },
  ];
  const legs = [0, 1].map(i => { const o = new THREE.Object3D(); o.name = 'leg' + i; scene.add(o); return o; });
  const feet = ['gearFootL', 'gearFootR', 'gearFootN'].map(k => ranger.anchors[k]).filter(Boolean);
  const wakes = { feet: feet.map(f => ocean.addWake(f, 0.3)), legs: legs.map(l => ocean.addWake(l, 0.17)), debris: wreck.debris.slice(0, 3).concat(wreck.floaters, wreck.trailPieces.slice(0, 4)).map(d => ocean.addWake(d, d === wreck.floaters[0] ? 1.1 : d === wreck.floaters[1] ? 1.3 : 0.4)) };
  const beaconLight = real ? new THREE.PointLight(0xffa040, 0, 14, 2) : null;
  if (beaconLight) scene.add(beaconLight);
  return { real, scene, cam, ocean, ranger, cockpit, hull, steps, ramp, wreck, eye, targets, byId, colliders, floors, seabedLocal, legs, feet, wakes, beaconLight };
}

export async function partnerRanger(ctx, W) {
  let ranger;
  if (W.real) {
    const { createRanger } = await import('../../models/ranger.js');
    ranger = await createRanger({ engine: ctx.engine, quality: ctx.engine.qualityName, materials: W.hull });
    ranger.group.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.userData.millerHaze) W.ocean.applyHaze(m); });
  } else ranger = stubRanger();
  ranger.group.name = 'partnerRanger';
  ranger.group.visible = false;
  W.scene.add(ranger.group);
  return ranger;
}

export function wreckCollidersLocal(W) {
  const out = [];
  const r = W.wreck.root, g = W.ranger.group;
  r.updateMatrixWorld(true); g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const M = new THREE.Matrix4().multiplyMatrices(inv, r.matrixWorld);
  const e = M.elements, ca = Math.abs(e[0]), sa = Math.abs(e[8]);
  const v = new THREE.Vector3();
  for (const c of W.wreck.colliders) {
    const nx = Math.max(1, Math.ceil((c.max[0] - c.min[0]) / 0.6)), nz = Math.max(1, Math.ceil((c.max[2] - c.min[2]) / 0.6));
    const hx = (c.max[0] - c.min[0]) / nx / 2, hz = (c.max[2] - c.min[2]) / nz / 2;
    const ex = hx * ca + hz * sa, ez = hx * sa + hz * ca;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      v.set(c.min[0] + (2 * i + 1) * hx, (c.min[1] + c.max[1]) / 2, c.min[2] + (2 * k + 1) * hz).applyMatrix4(M);
      const hy = (c.max[1] - c.min[1]) / 2;
      out.push({ id: 'wreck', min: [v.x - ex, v.y - hy, v.z - ez], max: [v.x + ex, v.y + hy, v.z + ez] });
    }
  }
  return out;
}
