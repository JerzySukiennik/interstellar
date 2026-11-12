// Tesseract sets: one entry point, buildSet(kind, options), that bakes the real model modules (guarded dynamic imports) or the greybox kit into shared memory geometry with a mapping from history frames into set space.
import * as THREE from 'three';
import * as G from '../chapters/greybox.js';
import { Baker, cluster, featurePoints, triCount } from './bake.js';
import { poseAt } from './layout.js';

export const REAL = {
  interior: '../models/endurance-interior.js',
  cockpit: '../models/ranger-cockpit.js',
  ranger: '../models/ranger.js',
  endurance: '../models/endurance.js',
  ocean: '../world/ocean.js',
  wreck: '../models/wreck.js',
};

const RF = 33.2, THETA0 = -Math.PI / 2, SPIN = 0.55;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Y = V3(0, 1, 0);

export function ringToEndurance(s, y, z, out = V3()) { const th = THETA0 + s / RF, r = RF - y; return out.set(r * Math.cos(th), r * Math.sin(th), z); }
export function ringMatrix(s, y, z, out = new THREE.Matrix4()) {
  const th = THETA0 + s / RF, c = Math.cos(th), sn = Math.sin(th), r = RF - y;
  return out.set(-sn, -c, 0, r * c, c, -sn, 0, r * sn, 0, 0, 1, z, 0, 0, 0, 1);
}
const ringFrame = {
  point: (p, out) => ringToEndurance(p.x, p.y, p.z, out),
  basis: (p, q) => q.setFromRotationMatrix(ringMatrix(p.x, p.y, p.z, _m)),
};

async function tryReal(key, make, engine) {
  if (!REAL[key] || !engine?.renderer?.isWebGLRenderer) return null;
  try {
    const mod = await import(REAL[key]);
    return await make(mod);
  } catch (e) {
    console.warn(`[tesseract] real ${key} module failed, using greybox`, e?.message || e);
    return null;
  }
}

function boundsOf(obj) { obj.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(obj); }

function disposeTree(root) { root?.traverse(o => { o.geometry?.dispose?.(); }); }

function movable(id, pivot, setValue, emitOf) {
  setValue(0); pivot.updateWorldMatrix(true, true);
  const M0 = pivot.matrixWorld.clone();
  const b = new Baker();
  b.addObject(pivot, M0.clone().invert(), { emitOf });
  setValue(1); pivot.updateWorldMatrix(true, true);
  const M1 = pivot.matrixWorld.clone();
  setValue(0); pivot.updateWorldMatrix(true, true);
  const geo = b.build();
  return geo ? { id, geo, M0, M1 } : null;
}

const INTERIOR_EMIT = (mat, o) => {
  const n = mat.name || '';
  if (n.includes('porthole')) return [0.9, 0.72, 0.5, 1];
  if (n.includes('screen')) return [0.32, 0.75, 0.8, 2];
  if (n.includes('tube')) return [3.2, 3.4, 3.6, 0];
  if (n.includes('led')) return [1.6, 0.9, 0.35, 0];
  return [0, 0, 0, 0];
};

async function interiorSource(lib) {
  const { engine, quality } = lib;
  const api = await tryReal('interior', m => m.createEnduranceInterior({ engine, quality }), engine);
  const src = { source: api ? 'real' : 'greybox', chunks: {}, movables: {}, zones: {} };
  if (api) {
    api.setAge(0); api.setHatch('lab', 0); api.setLever(0); api.setPodLid?.('A', 1); api.setFrost?.('A', 0);
    api.group.traverse(o => { if (!/figure$|sunBeams/.test(o.name || '')) o.visible = true; });
    api.group.updateMatrixWorld(true);
    const ident = new THREE.Matrix4();
    const zones = api.zones.filter(z => z !== 'hub');
    const bakers = Object.fromEntries(zones.map(z => [z, new Baker()]));
    const plants = new Baker(), wren = new Baker();
    let yieldN = 0;
    for (const o of api.group.children) {
      const name = o.name || '';
      if (o.isPoints || o.isLine || /^(sunBeams|tally)$/.test(name) || name.startsWith('hatch.lab') || name.startsWith('lever.')) continue;
      if (/figure$/.test(name)) { wren.addObject(o, ident, { emitOf: INTERIOR_EMIT }); continue; }
      if (/vines|leaves/.test(name)) { plants.addObject(o, ident, { emitOf: INTERIOR_EMIT }); continue; }
      if ((++yieldN & 3) === 0) await new Promise(r => setTimeout(r, 0));
      const bb = boundsOf(o);
      if (bb.isEmpty()) continue;
      const sph = bb.getBoundingSphere(new THREE.Sphere());
      if (sph.radius > 9) {
        for (const z of zones) bakers[z].addObject(o, ident, { emitOf: INTERIOR_EMIT, filter: p => api.zoneAt(p) === z });
      } else {
        const z = api.zoneAt(sph.center);
        if (bakers[z]) bakers[z].addObject(o, ident, { emitOf: INTERIOR_EMIT });
      }
    }
    for (const z of zones) {
      await new Promise(r => setTimeout(r, 0));
      const geo = bakers[z].build();
      if (geo) src.chunks[z] = { id: z, geo, lod: cluster(geo, 0.12), far: cluster(geo, 0.32), vfar: cluster(geo, 0.8) };
    }
    const pg = plants.build(), wg = wren.build();
    if (pg) src.chunks.plants = { id: 'plants', geo: pg, lod: cluster(pg, 0.12), far: cluster(pg, 0.3), vfar: cluster(pg, 0.9), aged: true };
    if (wg) src.chunks.wren = { id: 'wren', geo: wg, lod: wg, far: wg, vfar: wg, aged: true };
    const hatch = api.hatches.lab;
    if (hatch) src.movables.hatch = movable('hatch', hatch.pivot, v => hatch.set(v), INTERIOR_EMIT);
    const leverHolder = api.group.children.find(o => (o.name || '').startsWith('lever.'));
    if (leverHolder?.children[0]) src.movables.lever = movable('lever', leverHolder.children[0], v => api.setLever(v), INTERIOR_EMIT);
    for (const [k, b] of Object.entries(api.zoneBounds)) src.zones[k] = b;
    src.api = api;
  } else {
    const grp = new THREE.Group();
    const frame = G.ringFrame();
    const ring = G.buildRingInterior(grp, frame);
    const p = (min, max, m) => G.part(grp, min, max, m, frame);
    p([-4.55, 0.78, 2.4], [-2.45, 1.6, 2.46], 'glass');
    p([-6.03, 1.1, -0.5], [-5.98, 1.7, 0.5], G.own('warm')).userData.sweep = true;
    p([-1.4, 1.0, 2.55], [-0.6, 1.02, 2.95], 'cyan');
    p([ring.sH + 1, 1.0, 2.86], [ring.sH + 4, 2.2, 2.88], 'cyan');
    p([ring.sH - 3.8, 0.8, -2.9], [ring.sH - 1.2, 0.95, -2.3], 'green');
    const emit = (mat, o) => o.userData.sweep ? [0.9, 0.72, 0.5, 1] : mat.emissive && mat.emissiveIntensity > 0 ? [mat.emissive.r * 2, mat.emissive.g * 2, mat.emissive.b * 2, mat.name.startsWith('cyan') ? 2 : 0] : [0, 0, 0, 0];
    grp.traverse(o => { if (o.isMesh && o.material?.name === 'cyan') o.material = G.own('cyan'); });
    grp.traverse(o => { if (o.isMesh && o.material?.name?.startsWith('cyan')) o.material.emissiveIntensity = 1; });
    const b = new Baker();
    b.addObject(grp, new THREE.Matrix4(), { emitOf: emit });
    const geo = b.build();
    src.chunks.all = { id: 'all', geo, lod: geo, far: cluster(geo, 0.25), vfar: cluster(geo, 0.6) };
    const door = G.part(grp, [3.95, 0, -0.6], [4.05, 2.1, 0.6], 'grey');
    const lever = G.part(grp, [3.82, 0.95, 0.72], [3.9, 1.4, 0.8], 'red');
    src.movables.hatch = movable('hatch', door, v => G.place(door, [4, 1.05 + v * 2.0, 0], frame), emit);
    src.movables.lever = movable('lever', lever, v => G.place(lever, [3.86, 1.175, 0.76], frame, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -v * 1.2)), emit);
    src.zones.lab = { s0: -6, s1: 4 };
    disposeTree(grp);
  }
  return src;
}

async function cockpitSource(lib) {
  const { engine, quality } = lib;
  const api = await tryReal('cockpit', m => m.createRangerCockpit({ engine, quality }), engine);
  const src = { source: api ? 'real' : 'greybox' };
  if (api) {
    api.setPower?.(1); api.setFailure?.(0); api.update?.(0.02);
    api.group.updateMatrixWorld(true);
    const slots = new Set((api.displaySlots || []).map(d => d.mesh));
    const emit = (mat, o) => {
      if (slots.has(o)) return [0.42, 0.95, 1.05, 2];
      const n = (mat.name || '').toLowerCase();
      if (mat.isMeshBasicMaterial && mat.color && mat.color.r + mat.color.g + mat.color.b > 0.6) return [mat.color.r * 3, mat.color.g * 3, mat.color.b * 3, 2];
      if (mat.emissive && (mat.emissiveIntensity ?? 1) * (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05) return [mat.emissive.r * mat.emissiveIntensity, mat.emissive.g * mat.emissiveIntensity, mat.emissive.b * mat.emissiveIntensity, n.includes('lamp') || n.includes('led') || n.includes('button') ? 2 : 2];
      return [0, 0, 0, 0];
    };
    const b = new Baker();
    b.addObject(api.group, new THREE.Matrix4(), { emitOf: emit, skip: o => o.isPoints || /helmet|visor/i.test(o.name || '') });
    src.geo = b.build();
    src.eye = api.anchors.pilotEye.getWorldPosition(V3());
    src.bounds = src.geo.boundingBox.clone();
    src.api = api;
  } else {
    const grp = new THREE.Group();
    const rg = G.ranger(grp);
    rg.displays.forEach(d => { d.material.emissiveIntensity = 1; });
    grp.updateMatrixWorld(true);
    const emit = mat => mat.name?.startsWith('cyan') ? [0.42, 0.95, 1.05, 2] : [0, 0, 0, 0];
    const b = new Baker();
    b.addObject(grp, new THREE.Matrix4(), { emitOf: emit, filter: p => p.y > -0.2 && Math.abs(p.x) < 1.35 && p.z < 8.2 });
    src.geo = b.build();
    src.eye = rg.anchors.eyeL.getWorldPosition(V3());
    src.bounds = src.geo.boundingBox.clone();
    disposeTree(grp);
  }
  src.lod = cluster(src.geo, 0.07);
  src.far = cluster(src.geo, 0.34);
  src.vfar = cluster(src.geo, 0.8);
  return src;
}

async function rangerSource(lib) {
  const { engine, quality } = lib;
  const api = await tryReal('ranger', m => m.createRanger({ engine, quality }), engine);
  const b = new Baker();
  let source = 'greybox';
  if (api) {
    const lod = api.lodGroup || api.group.getObjectByName('RangerLOD') || api.lod;
    if (lod?.isObject3D) {
      const vis = [];
      lod.traverse(o => { vis.push([o, o.visible]); o.visible = true; });
      lod.updateWorldMatrix(true, true);
      b.addObject(lod, api.group.matrixWorld.clone().invert());
      vis.forEach(([o, v]) => { o.visible = v; });
      source = 'real';
    }
    try { api.dispose?.(); } catch {}
  }
  if (b.empty) {
    source = 'greybox';
    const grp = new THREE.Group();
    G.ranger(grp, { cabin: false });
    b.addObject(grp, new THREE.Matrix4());
    disposeTree(grp);
  }
  return { source, geo: b.build() };
}

async function enduranceSource(lib) {
  const { engine, quality } = lib;
  const api = await tryReal('endurance', m => m.createEndurance({ engine, quality }), engine);
  const b = new Baker();
  let source = 'greybox';
  if (api) {
    const root = api.detail?.isObject3D ? api.detail : (api.lodGroup || api.lod)?.isObject3D ? (api.lodGroup || api.lod) : api.group;
    const vis = [];
    root.traverse(o => { vis.push([o, o.visible]); o.visible = true; });
    root.updateWorldMatrix(true, true);
    b.addObject(root, api.group.matrixWorld.clone().invert(), { skip: o => o.isPoints || o.isSprite });
    vis.forEach(([o, v]) => { o.visible = v; });
    if (!b.empty) source = 'real';
    try { api.dispose?.(); } catch {}
  }
  if (b.empty) {
    const grp = new THREE.Group();
    G.endurance(grp);
    b.addObject(grp, new THREE.Matrix4());
    disposeTree(grp);
  }
  const geo = b.build();
  return { source, geo, lod: triCount(geo) > 40000 ? cluster(geo, 0.6) : geo, far: triCount(geo) > 40000 ? cluster(geo, 1.6) : geo, vfar: triCount(geo) > 20000 ? cluster(geo, 3.5) : geo };
}

export function createLibrary({ engine, quality } = {}) {
  const lib = { engine, quality: quality || engine?.qualityName || 'high', cache: new Map() };
  lib.get = (key, fn) => { if (!lib.cache.has(key)) lib.cache.set(key, fn(lib)); return lib.cache.get(key); };
  lib.interior = () => lib.get('interior', interiorSource);
  lib.cockpit = () => lib.get('cockpit', cockpitSource);
  lib.ranger = () => lib.get('ranger', rangerSource);
  lib.endurance = () => lib.get('endurance', enduranceSource);
  lib.dispose = async () => {
    for (const p of lib.cache.values()) {
      const s = await p;
      const gs = new Set();
      const add = g => g?.isBufferGeometry && gs.add(g);
      for (const c of Object.values(s.chunks || {})) { add(c.geo); add(c.lod); add(c.far); add(c.vfar); }
      for (const m of Object.values(s.movables || {})) add(m?.geo);
      add(s.geo); add(s.lod); add(s.far); add(s.vfar);
      try { s.api?.dispose?.(); } catch {}
      gs.forEach(g => g.dispose());
    }
    lib.cache.clear();
  };
  return lib;
}

function base(kind, o) {
  return {
    kind, scale: 1, follow: false, chunks: [], movables: [], view: new THREE.Matrix4(),
    box: { center: V3(), half: V3(8, 4, 6) }, frames: {}, sources: {}, craft: null, feature: null, lever: null, eye: null, light: kind,
    map(frame, p, out) { const f = this.frames[frame] || this.frames.default; return f ? f.point(p, out) : out.copy(p); },
    basis(frame, p, q) { const f = this.frames[frame] || this.frames.default; return f ? f.basis(p, q) : q.identity(); },
    ...o,
  };
}

function seatEye(data, fallback) {
  const pts = [];
  for (const s of data?.segments || []) if (s.mode === 'seat' && s.frame === 'ranger-local') for (const S of s.samples) pts.push(S.slice(1, 4));
  if (!pts.length) return fallback.clone();
  const med = k => { const a = pts.map(p => p[k]).sort((x, y) => x - y); return a[a.length >> 1]; };
  return V3(med(0), med(1), med(2));
}

function trackBounds(memory, frame, extra = []) {
  const b = new THREE.Box3();
  for (const s of memory.track) if (s.frame === frame) for (const S of s.samples) if (S[0] >= memory.t0 - 1 && S[0] <= memory.t1 + 1) b.expandByPoint(_v.set(S[1], S[2], S[3]));
  for (const p of extra) b.expandByPoint(p);
  return b;
}

function landedPose(data) {
  const segs = (data?.segments || []).filter(s => s.chapter === 'miller' && s.mode === 'fly' && s.frame === 'miller-world');
  const d = segs[0];
  if (!d) return { p: V3(0, 1.2, 0), q: new THREE.Quaternion() };
  const S = d.samples[d.samples.length - 1];
  return { p: V3(S[1], S[2], S[3]), q: new THREE.Quaternion(S[4], S[5], S[6], S[7]) };
}

function oceanPatch(cx, cz, rx, rz, y = 0) {
  const rings = 14, segs = 120;
  const pos = [], col = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const u = r / rings;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(a * 3 + 1.3) + 0.07 * Math.sin(a * 7 + 0.4) + 0.04 * Math.sin(a * 13);
      pos.push(cx + Math.cos(a) * rx * u * wob, y, cz + Math.sin(a) * rz * u * wob);
      const c = 0.44 * Math.pow(Math.max(0, 1 - Math.pow(u, 3.2)), 1.3) + 0.004;
      col.push(c, c * 1.1, c * 1.06);
    }
  }
  for (let r = 0; r < rings; r++) for (let k = 0; k < segs; k++) {
    const a = r * segs + k, b = r * segs + (k + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wreckGroup(at, away) {
  const grp = new THREE.Group();
  const wb = new G.Boxes();
  wb.add([-3, -0.6, -1.5], [3, 0.4, 1.5], 'wreck').add([2.5, -0.5, -4], [3.2, 0.6, -1.5], 'wreck').add([-6, -0.6, 1], [-3, 0.1, 2.2], 'wreck').add([-1, 0.4, -1], [0.5, 1.6, 0.3], 'wreck');
  wb.build(grp);
  grp.position.copy(at).addScaledVector(away, 3.2).setY(0);
  grp.rotation.set(0.05, Math.atan2(away.x, away.z) + 0.6, -0.08);
  grp.updateMatrixWorld(true);
  return grp;
}

export async function buildSet(kind, options = {}) {
  const lib = options.lib || createLibrary(options);
  const data = options.data || {};
  const memory = options.memory;
  if (kind === 'lab' || kind === 'ring' || kind === 'aged') {
    const src = await lib.interior();
    const set = base(kind, { sources: { interior: src.source }, frames: { 'ring-unrolled': ringFrame, default: ringFrame } });
    const ids = Object.keys(src.chunks).filter(id => kind === 'aged' || !src.chunks[id].aged);
    set.chunks = ids.map(id => ({ ...src.chunks[id], sphere: src.chunks[id].geo.boundingSphere }));
    set.movables = [src.movables.hatch, src.movables.lever].filter(Boolean);
    if (kind === 'lab') {
      const z = src.zones.lab || { s0: -5.2, s1: 5.2 };
      const sc = (z.s0 + z.s1) / 2;
      set.view = new THREE.Matrix4().makeTranslation(0, -1.35, 0).multiply(ringMatrix(sc, 0, 0).invert());
      const L = z.s1 - z.s0;
      set.box = { center: V3(0.325, 0.05, 0), half: V3((L - 0.05) / 2, 1.55, 2.6) };
      set.chunks = set.chunks.filter(c => c.id === 'lab' || c.id === 'all');
      const lv = src.movables.lever;
      if (lv) set.lever = V3().setFromMatrixPosition(lv.M0);
      const lab = set.chunks[0];
      if (lab) {
        const g = lab.lod.clone().applyMatrix4(set.view);
        g.computeBoundingBox();
        set.feature = featurePoints(g, 140);
        g.dispose();
      }
    } else {
      set.follow = true;
      set.box = { center: V3(0, 1.0, 0), half: V3(8.6, 4.0, 2.6) };
      set.viewFor = (p) => new THREE.Matrix4().makeTranslation(0, -1.35, 0).multiply(ringMatrix(p.x, Math.max(0, p.y), 0).invert());
    }
    return set;
  }
  if (kind === 'cockpit' || kind === 'fall') {
    const src = await lib.cockpit();
    const R = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2);
    const bb = src.bounds.clone();
    const c = bb.getCenter(V3()).applyQuaternion(R);
    const view = new THREE.Matrix4().compose(c.clone().negate().setY(-(bb.min.y + bb.max.y) / 2 - 0.1), R, V3(1, 1, 1));
    const recorded = seatEye(data, src.source === 'real' ? src.eye : V3(-0.6, 1.18, -5.3));
    const off = src.eye.clone().sub(recorded);
    const size = bb.getSize(V3());
    const set = base(kind, { sources: { cockpit: src.source }, view, eye: src.eye.clone() });
    set.chunks = [{ id: 'cockpit', geo: src.geo, lod: src.lod, far: src.far, vfar: src.vfar, sphere: src.geo.boundingSphere }];
    set.box = { center: V3(0, 0, 0), half: V3(size.z / 2 + 0.2, size.y / 2 + 0.25, size.x / 2 + 0.2) };
    const rf = { point: (p, out) => out.copy(p).add(off), basis: (p, q) => q.identity() };
    set.frames = { 'ranger-local': rf, schwarzschild: { point: (p, out) => out.copy(src.eye), basis: (p, q) => q.identity() }, default: rf };
    const g = src.lod.clone().applyMatrix4(view);
    g.computeBoundingBox();
    set.feature = featurePoints(g, 140);
    g.dispose();
    return set;
  }
  if (kind === 'orbit') {
    const [end, rg] = await Promise.all([lib.endurance(), lib.ranger()]);
    const tb = trackBounds(memory, 'endurance-inertial', [V3(-34, -34, -3), V3(34, 34, 3)]);
    const ext = Math.max(tb.max.x - tb.min.x, tb.max.y - tb.min.y, (tb.max.z - tb.min.z) * 0.7);
    const s = Math.min(1 / 4, 13.5 / ext);
    const cz = (tb.min.z + tb.max.z) / 2;
    const view = new THREE.Matrix4().makeTranslation(-cz * s, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(s, s, s));
    const pt = { point: (p, out) => out.copy(p), basis: (p, q) => q.identity() };
    const set = base(kind, { sources: { endurance: end.source, ranger: rg.source }, view, scale: s, frames: { 'endurance-inertial': pt, default: pt } });
    set.chunks = [{ id: 'endurance', geo: end.geo, lod: end.lod, far: end.far, vfar: end.vfar, sphere: end.geo.boundingSphere, spin: { axis: V3(0, 0, 1), rate: SPIN, t0: memory?.t0 ?? 0 } }];
    set.craft = { geo: rg.geo };
    set.box = { center: V3(0, 0, 0), half: V3(Math.min(9.5, (tb.max.z - tb.min.z) * s / 2 + 2.2), Math.min(7.4, 36 * s + 0.8), Math.min(10.5, 36 * s + 0.8)) };
    set.keyDir = V3(-0.25, 0.1, -0.96).normalize().applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    const g = end.lod.clone().applyMatrix4(set.view);
    g.computeBoundingBox();
    set.feature = featurePoints(g, 110);
    g.dispose();
    return set;
  }
  if (kind === 'landing' || kind === 'shallows' || kind === 'wave') {
    const rg = await lib.ranger();
    let set_wreckSource = 'greybox';
    const landed = landedPose(data);
    const rec = (data.events || []).find(e => e.type === 'recorder_taken') || (data.events || []).find(e => e.type === 'wreck_found');
    const extra = [landed.p.clone()];
    let wreck = null;
    if (rec?.p && kind !== 'landing') {
      const at = V3(...rec.p), away = at.clone().sub(landed.p).setY(0).normalize();
      const real = await lib.get('wreck', async () => tryReal('wreck', m => m.createWreck({ engine: lib.engine, quality: lib.quality }), lib.engine));
      if (real?.group) {
        wreck = new THREE.Group();
        wreck.add(real.group);
        wreck.position.copy(at).addScaledVector(away, 2.6).setY(0);
        wreck.rotation.set(0, Math.atan2(away.x, away.z), 0);
        wreck.updateMatrixWorld(true);
        set_wreckSource = 'real';
      } else wreck = wreckGroup(at, away);
      extra.push(wreck.position.clone());
    }
    const tb = trackBounds(memory, 'miller-world', extra);
    const pad = kind === 'landing' ? 30 : 14;
    tb.min.x -= pad; tb.max.x += pad; tb.min.z -= pad; tb.max.z += pad;
    const sx = tb.max.x - tb.min.x, sz = tb.max.z - tb.min.z, sy = Math.max(4, tb.max.y - Math.min(0, tb.min.y));
    const swap = sx > sz;
    const along = swap ? sx : sz, across = swap ? sz : sx;
    const s = Math.min(20 / along, 15 / across, kind === 'landing' ? 12 / sy : 1);
    const cx = (tb.min.x + tb.max.x) / 2, cz = (tb.min.z + tb.max.z) / 2;
    const yWater = kind === 'landing' ? -Math.min(5.5, sy * s / 2) : -2.2;
    const rot = swap ? new THREE.Matrix4().makeRotationY(-Math.PI / 2) : new THREE.Matrix4();
    const view = new THREE.Matrix4().makeTranslation(0, yWater, 0).multiply(rot).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
    const set = base(kind, { sources: { ranger: rg.source, ocean: 'sea patch', wreck: set_wreckSource }, view, scale: s });
    const rl = new THREE.Matrix4().compose(landed.p, landed.q, V3(1, 1, 1));
    const pt = { point: (p, out) => out.copy(p), basis: (p, q) => q.identity() };
    set.frames = { 'miller-world': pt, 'ranger-local': { point: (p, out) => out.copy(p).applyMatrix4(rl), basis: (p, q) => q.copy(landed.q) }, default: pt };
    const b = new Baker();
    const patch = oceanPatch(cx, cz, sx / 2 * 1.02, sz / 2 * 1.02, 0);
    b.addGeometry(patch, new THREE.Matrix4(), { color: [1, 1, 1], vertexColors: true });
    patch.dispose();
    if (wreck) { b.addObject(wreck, new THREE.Matrix4(), { tint: [0.9, 0.9, 0.88], skip: o => o.isPoints || o.isSprite }); if (set_wreckSource !== 'real') disposeTree(wreck); else wreck.children[0]?.removeFromParent(); }
    const geo = b.build();
    const lodP = triCount(geo) > 30000 ? cluster(geo, 0.3) : geo;
    set.chunks = [{ id: 'patch', geo, lod: lodP, far: triCount(geo) > 30000 ? cluster(geo, 0.9) : geo, vfar: triCount(geo) > 30000 ? cluster(geo, 2.5) : geo, sphere: geo.boundingSphere }];
    set.craft = { geo: rg.geo };
    set.landed = { p: landed.p.clone(), q: landed.q.clone() };
    const hx = (swap ? sz : sx) * s / 2, hz = (swap ? sx : sz) * s / 2;
    set.box = { center: V3(0, yWater + (kind === 'landing' ? sy * s / 2 : 2.4), 0), half: V3(hx + 0.4, kind === 'landing' ? sy * s / 2 + 1 : 4.8, hz + 0.4) };
    set.waveAxis = V3(1, 0, 0).applyMatrix4(rot);
    set.patch = { cx, cz, sx, sz, yWater };
    set.feature = new Float32Array([-hx, yWater, -hz, -hx, yWater, hz, hx, yWater, -hz, hx, yWater, hz, 0, yWater, -hz, 0, yWater, hz]);
    return set;
  }
  throw new Error(`[tesseract] unknown set kind ${kind}`);
}

export function figurePose(set, frame, p, out) { return set.map(frame, p, out); }

export function sampleTrack(memory, t, out) {
  const seg = memory.track.find(s => t >= s.t0 && t <= s.t1) || memory.track.reduce((a, s) => (Math.abs((t < s.t0 ? s.t0 : s.t1) - t) < Math.abs((t < a.t0 ? a.t0 : a.t1) - t) ? s : a));
  poseAt(seg, t, out);
  out.seg = seg;
  return out;
}
