// Tesseract world: builds every memory run from the layout (rooms with shared baked sets, mirrored levels, world-lines, time-slices, panes), and drives time-as-direction, figures, the push lever and the fold each frame.
import * as THREE from 'three';
import { buildLayout, alignPush, describeLayout, roomTime, xAtTime, CELL } from './layout.js';
import { buildSet, createLibrary, sampleTrack } from './sets.js';
import { memoryMaterial, worldlineMaterial, pointsMaterial, paneMaterial, ghostCraftMaterial } from './materials.js';
import { buildStrips, buildTrace, buildBeams, captureEnvironment } from './beams.js';
import { createAstronautBatch, createAstronautNear, poseFor, lerpPose, neutralPose, solvePose, CYCLE, STRIDE } from '../models/astronaut.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SPIN = 0.55;
const idle = () => new Promise(r => setTimeout(r, 0));
const Yv = V3(0, 1, 0), NZ = V3(0, 0, -1), ONE = V3(1, 1, 1);
const _camR = V3(), _camU = V3(), _v = V3(), _w = V3(), _u = V3(), _p = V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = V3();
export const FILM = { exposure: 1.0, bloomStrength: 0.19, bloomRadius: 0.8, bloomThreshold: 0, halation: 0.55, vignette: 0.5, ca: 0.0012, saturation: 0.95, contrast: 0.2, letterbox: 0, streak: 0, tintShadow: [0.003, 0.0015, 0.0], tintHigh: [0.006, 0.002, -0.004] };
export function applyFilm(film, seconds = 0, over = {}) {
  const p = { ...FILM, ...over };
  for (const k of ['tintShadow', 'tintHigh', 'fadeColor']) if (Array.isArray(p[k])) p[k] = new THREE.Color().setRGB(p[k][0], p[k][1], p[k][2]);
  return film.to(p, seconds);
}
const OCEAN = new Set(['landing', 'shallows', 'wave']);
const EYE_MODES = new Set(['float', 'seat']);
const CUT = new Set(['lab', 'ring', 'aged', 'cockpit', 'fall']);

const LIGHT = {
  lab: { sky: [0.06, 0.061, 0.064], ground: [0.014, 0.012, 0.01], key: [0.25, 1, 0.15], keyCol: [0.1, 0.095, 0.088], wrap: 0.5, lamp: [0.85, 0.79, 0.68], lampR: 2.6, sweep: true },
  ring: { sky: [0.06, 0.061, 0.064], ground: [0.014, 0.012, 0.01], key: [0.2, 1, 0.1], keyCol: [0.1, 0.095, 0.088], wrap: 0.5, lamp: [0.85, 0.79, 0.68], lampR: 2.6, sweep: true },
  aged: { sky: [0.24, 0.25, 0.27], ground: [0.06, 0.05, 0.045], key: [0.2, 1, 0.1], keyCol: [0.28, 0.28, 0.28], wrap: 0.7, lamp: [1.1, 0.95, 0.75], lampR: 2.6, sweep: true, flicker: 0.35 },
  cockpit: { sky: [0.06, 0.065, 0.07], ground: [0.02, 0.02, 0.022], key: [-0.75, 0.6, 0.1], keyCol: [0.5, 0.48, 0.45], wrap: 0.25, lamp: [0.2, 0.42, 0.46], lampR: 1.8 },
  fall: { sky: [0.03, 0.025, 0.025], ground: [0.06, 0.035, 0.015], key: [-0.7, -0.45, 0.2], keyCol: [0.95, 0.58, 0.28], wrap: 0.35, lamp: [0.15, 0.32, 0.36], lampR: 1.6, flicker: 0.2 },
  orbit: { sky: [0.025, 0.025, 0.03], ground: [0.01, 0.01, 0.012], key: null, keyCol: [2.3, 2.0, 1.6], wrap: 0.08, lamp: [0, 0, 0], lampR: 0 },
  ocean: { sky: [0.95, 0.95, 0.9], ground: [0.34, 0.36, 0.35], key: [0.25, 1, 0.2], keyCol: [0.25, 0.25, 0.24], wrap: 1.0, lamp: [0, 0, 0], lampR: 0 },
};

function eyeOffsetFor(pose) {
  const mats = Array.from({ length: 15 }, () => new THREE.Matrix4());
  solvePose(pose, mats);
  return V3(0, 0.15, 0.06).applyMatrix4(mats[2]);
}

export async function createTesseract({ engine, data, quality, log = false, onStatus } = {}) {
  const q = quality || engine?.qualityName || 'high';
  const layout = buildLayout(data);
  const lib = createLibrary({ engine, quality: q });
  for (const m of layout.memories) {
    onStatus?.(`set ${m.kind}`);
    m.set = await buildSet(m.kind, { lib, data, memory: m });
    await idle();
  }
  let P = layout.push;
  if (P && !P.fallback) {
    const set = P.memory.set;
    const lv = set.lever ? set.lever.clone().applyMatrix4(set.view) : P.p ? set.map('ring-unrolled', V3(...P.p), V3()).applyMatrix4(set.view) : V3(3, 0, 0);
    alignPush(layout, lv.x);
    P.leverLocal = lv;
  }
  if (log) {
    console.log(describeLayout(layout));
    const k = g => g ? Math.round((g.index ? g.index.count : g.attributes.position.count) / 3000) + 'k' : '-';
    console.log('[tesseract] sets ' + layout.memories.map(m => `${m.kind}: ${m.set.chunks.map(c => `${c.id} ${k(c.geo)}/${k(c.lod)}/${k(c.far)}`).join(', ')}`).filter((v, i, a) => a.indexOf(v) === i).join(' | '));
  }

  const scene = new THREE.Scene();
  scene.name = 'tesseract';
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.95, 0.9, 0.84), new THREE.Color(0.2, 0.12, 0.07), 1.3);
  const key = new THREE.DirectionalLight(new THREE.Color(1, 0.93, 0.84), 2.4);
  key.position.set(0.4, 1, 0.6);
  scene.add(hemi, key, key.target);

  const events = layout.events;
  const evT = type => events.filter(e => e.type === type).map(e => e.t);
  const ejectT = evT('eject')[0] ?? Infinity;
  const switchT = evT('switch');
  const failT = evT('display_fail');
  const W = waveModel(events);

  const sharedEdge = new THREE.Color(1.6, 0.85, 0.36);
  const runs = [];
  for (const m of layout.memories) { runs.push(buildRun(m)); await idle(); }
  const rooms = runs.flatMap(r => r.rooms);

  function lightFor(kind) { return LIGHT[OCEAN.has(kind) ? 'ocean' : kind] || LIGHT.lab; }

  function buildRun(m) {
    const set = m.set;
    const run = { mem: m, set, rooms: [], z: m.z, x0: m.rooms[0].x, x1: m.rooms[m.M - 1].x, kind: m.kind };
    const L = lightFor(m.kind);
    const sample = { p: V3(), q: new THREE.Quaternion(), extra: undefined, dist: 0, seg: null };
    for (const r of m.rooms) {
      let view = set.view.clone();
      if (set.follow) { sampleTrack(m, r.t, sample); view = set.viewFor(sample.p); }
      const room = { run, mem: m, k: r.m, x: r.x, center: V3(r.x, 0, m.z), view, T: r.t, meshes: [], mirrors: [], movs: [], craft: null, wave: null, mats: [] };
      room.viewQ = new THREE.Quaternion(); view.decompose(_v, room.viewQ, _s);
      room.world = new THREE.Matrix4().makeTranslation(r.x, 0, m.z).multiply(view);
      const levels = [0, 1, -1];
      for (const lv of levels) {
        const mat = memoryMaterial();
        const U = mat.uniforms;
        U.uSky.value.setRGB(...L.sky); U.uGround.value.setRGB(...L.ground); U.uKeyCol.value.setRGB(...L.keyCol); U.uWrap.value = L.wrap;
        U.uKeyDir.value.copy(L.key ? V3(...L.key).normalize() : set.keyDir || V3(0, 1, 0));
        if (lv !== 0) U.uKeyDir.value.y *= -1;
        U.uEdge.value.copy(sharedEdge);
        U.uLevel.value = lv === 0 ? 1 : 0.16;
        if (lv !== 0) U.uFog.value.set(10, 55);
        U.uLampCol.value.setRGB(...L.lamp);
        U.uFlicker.value = L.flicker || 0;
        if (m.kind === 'aged') U.uAge.value = clamp((layout.numbers.years || 30) / 45, 0.3, 1);
        const flip = lv === 0 ? 1 : -1;
        const c = set.box.center, h = set.box.half;
        const cc = V3(r.x + c.x, lv * CELL.y + flip * c.y, m.z + c.z);
        U.uClip.value.compose(cc, new THREE.Quaternion(), V3(h.x, h.y, h.z)).invert();
        if (L.lampR) U.uLamp.value.set(r.x, lv * CELL.y + flip * (c.y + h.y * 0.2), m.z, L.lampR);
        room.mats.push(mat);
        mat.userData.cc = cc.clone();
        const lvWorld = lv === 0 ? room.world.clone() : new THREE.Matrix4().makeTranslation(r.x, lv * CELL.y, m.z).multiply(new THREE.Matrix4().makeScale(1, -1, 1)).multiply(view);
        if (!room.chunks) room.chunks = set.chunks.filter(ch => chunkVisible(set, view, ch)).map(ch => set.follow ? clipChunk(ch, view, set.box) : ch).filter(Boolean);
        for (const ch of room.chunks) {
          const mesh = new THREE.Mesh(lv === 0 ? ch.lod : (ch.vfar || ch.far), mat);
          mesh.userData.level = lv;
          mesh.matrixAutoUpdate = false;
          mesh.matrix.copy(lvWorld);
          mesh.matrixWorldNeedsUpdate = true;
          mesh.visible = false;
          mesh.userData.chunk = ch;
          mesh.userData.base = lvWorld;
          scene.add(mesh);
          (lv === 0 ? room.meshes : room.mirrors).push(mesh);
        }
        if (lv !== 0) continue;
        for (const mv of set.movables) {
          const mesh = new THREE.Mesh(mv.geo, mat);
          mesh.matrixAutoUpdate = false;
          mesh.visible = false;
          mesh.userData.mov = mv;
          scene.add(mesh);
          room.movs.push(mesh);
        }
        if (set.craft) {
          room.craft = new THREE.Mesh(set.craft.geo, mat);
          room.craft.matrixAutoUpdate = false; room.craft.visible = false;
          scene.add(room.craft);
        }
        if (set.wave) {
          room.wave = new THREE.Mesh(set.wave, mat);
          room.wave.matrixAutoUpdate = false; room.wave.visible = false;
          scene.add(room.wave);
        }
      }
      run.rooms.push(room);
    }
    return run;
  }

  function clipChunk(ch, view, box) {
    const out = { ...ch };
    const c = box.center, h = box.half;
    let any = false;
    for (const k of ['geo', 'lod', 'far', 'vfar']) {
      const g = ch[k] || ch.far, P = g.attributes.position, I = g.index.array;
      const keep = [];
      for (let i = 0; i < I.length; i += 3) {
        _v.fromBufferAttribute(P, I[i]).add(_w.fromBufferAttribute(P, I[i + 1])).add(_w.fromBufferAttribute(P, I[i + 2])).multiplyScalar(1 / 3).applyMatrix4(view);
        if (Math.abs(_v.x - c.x) < h.x + 0.4 && Math.abs(_v.y - c.y) < h.y + 0.4 && Math.abs(_v.z - c.z) < h.z + 0.4) keep.push(I[i], I[i + 1], I[i + 2]);
      }
      const ng = new THREE.BufferGeometry();
      for (const a of Object.keys(g.attributes)) ng.setAttribute(a, g.attributes[a]);
      ng.setIndex(P.count > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
      ng.boundingSphere = g.boundingSphere;
      ng.userData.clipped = true;
      out[k] = ng;
      if (keep.length) any = true;
    }
    return any ? out : null;
  }

  function chunkVisible(set, view, ch) {
    if (!set.follow) return true;
    const inv = _m.copy(view).invert();
    const c = set.box.center.clone().applyMatrix4(inv);
    return c.distanceTo(ch.sphere.center) < ch.sphere.radius + set.box.half.length() + 1;
  }

  const baseStand = poseFor('stand', 0, 1);
  const EYE = { float: eyeOffsetFor(poseFor('float', 0, 1)), seat: eyeOffsetFor(poseFor('sit', 0, 1)) };
  const S = { p: V3(), q: new THREE.Quaternion(), extra: undefined, dist: 0, seg: null };
  const poseA = neutralPose(), poseB = neutralPose();
  function figureLocal(m, view, viewQ, t, out) {
    const set = m.set;
    sampleTrack(m, t, S);
    const seg = S.seg, frame = seg.frame || 'default', mode = seg.mode;
    out.t = t; out.visible = true; out.craft = false; out.mode = mode;
    if (m.kind === 'fall' && t >= ejectT) { out.visible = false; return out; }
    if (OCEAN.has(m.kind) || m.kind === 'orbit') {
      if (mode === 'fly' || frame === 'endurance-inertial') {
        set.map(frame, S.p, _p).applyMatrix4(view);
        _q.copy(viewQ).multiply(set.basis(frame, S.p, _q2)).multiply(S.q);
        out.matrix.compose(_p, _q, _s.setScalar(set.scale));
        out.craft = true; out.center.copy(_p);
        return out;
      }
      if (frame === 'ranger-local') { out.visible = false; return out; }
    }
    set.map(frame, S.p, _p).applyMatrix4(view);
    _q.copy(viewQ).multiply(set.basis(frame, S.p, _q2));
    _u.copy(Yv).applyQuaternion(_q);
    if (m.kind === 'fall') _w.copy(NZ).applyQuaternion(_q);
    else _w.copy(NZ).applyQuaternion(_q2.copy(_q).multiply(S.q));
    const pitch = Math.asin(clamp(_w.dot(_u), -1, 1));
    _w.addScaledVector(_u, -_w.dot(_u));
    if (_w.lengthSq() < 1e-6) _w.copy(NZ).applyQuaternion(_q);
    _w.normalize();
    _v.crossVectors(_u, _w).normalize();
    _m2.makeBasis(_v, _u, _w);
    const R = _q2.setFromRotationMatrix(_m2);
    const sc = set.scale * (OCEAN.has(m.kind) ? 3.4 : 1);
    const pose = out.pose;
    if (mode === 'walk' || mode === 'wade') {
      const sp = segSpeed(seg, t);
      poseFor(mode, S.dist / STRIDE[mode], 1, poseA);
      poseFor('stand', t / CYCLE.stand, 1, poseB);
      lerpPose(poseB, poseA, smooth(0.08, mode === 'wade' ? 0.7 : 1.0, sp), pose);
    } else if (mode === 'climb') poseFor('climb', S.dist / STRIDE.climb, 1, pose);
    else if (mode === 'float') poseFor('float', t / CYCLE.float, 1, pose);
    else if (mode === 'seat') poseFor('sit', t / CYCLE.sit, 1, pose);
    else poseFor('stand', t / CYCLE.stand, 1, pose);
    pose.head[0] += clamp(-pitch * 0.7, -0.6, 0.5);
    if (EYE_MODES.has(mode)) {
      const e = EYE[mode === 'seat' ? 'seat' : 'float'];
      _v.copy(e).multiplyScalar(sc).applyQuaternion(R);
      _p.sub(_v);
      out.center.copy(_p).addScaledVector(_u, 0.8 * sc);
    } else out.center.copy(_p).addScaledVector(_u, 0.95 * sc);
    out.matrix.compose(_p, R, _s.setScalar(sc));
    return out;
  }
  const spA = { p: V3(), q: new THREE.Quaternion() };
  function segSpeed(seg, t) {
    sampleTrack({ track: [seg] }, t - 0.3, spA); const a = spA.p.clone();
    sampleTrack({ track: [seg] }, t + 0.3, spA);
    return a.distanceTo(spA.p) / 0.6;
  }
  const mkOut = () => ({ matrix: new THREE.Matrix4(), center: V3(), pose: neutralPose(), visible: false, craft: false, t: 0, mode: null });

  function blendView(run, t, outM, outQ) {
    const m = run.mem;
    const u = (t - m.t0) / m.delta - 0.5;
    const k0 = clamp(Math.floor(u), 0, m.M - 1), k1 = clamp(k0 + 1, 0, m.M - 1);
    const f = clamp(u - Math.floor(u), 0, 1);
    const A = run.rooms[k0], B = run.rooms[k1];
    if (!run.set.follow || k0 === k1) { outM.copy(A.view); outQ.copy(A.viewQ); return u; }
    const e = smooth(0, 1, f);
    const pa = V3(), pb = V3(), sa = V3(), sb = V3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    A.view.decompose(pa, qa, sa); B.view.decompose(pb, qb, sb);
    outQ.slerpQuaternions(qa, qb, e);
    outM.compose(pa.lerp(pb, e), outQ, sa.lerp(sb, e));
    return u;
  }

  await idle();
  const worldline = buildWorldlines();
  await idle();
  scene.add(worldline.mesh);
  function buildWorldlines() {
    const pos = [], tan = [], side = [], info = [], idx = [];
    const strips = (pts, bright, width, m) => {
      let seq = [];
      const flush = () => {
        if (seq.length > 1) {
          const base = pos.length / 3;
          for (let i = 0; i < seq.length; i++) {
            const a = seq[Math.max(0, i - 1)].p, b = seq[Math.min(seq.length - 1, i + 1)].p;
            _w.subVectors(b, a);
            if (_w.lengthSq() < 1e-10) _w.set(1, 0, 0);
            _w.normalize();
            const uu = (seq[i].t - m.t0) / m.dur;
            for (const sd of [-1, 1]) { pos.push(seq[i].p.x, seq[i].p.y, seq[i].p.z); tan.push(_w.x, _w.y, _w.z); side.push(sd); info.push(bright, uu, m.index, width); }
          }
          for (let i = 0; i < seq.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        seq = [];
      };
      for (const p of pts) { if (p) seq.push(p); else flush(); }
      flush();
    };
    const beads = [];
    const out = mkOut(), bm = new THREE.Matrix4(), bq = new THREE.Quaternion();
    for (const run of runs) {
      const m = run.mem;
      const pts = [];
      const n = Math.max(60, Math.min(900, Math.round(m.dur * 7)));
      run.slices = [];
      for (let i = 0; i <= n; i++) {
        const t = m.t0 + (i / n) * m.dur;
        const u = blendView(run, t, bm, bq);
        figureLocal(m, bm, bq, t, out);
        if (!out.visible) { pts.push(null); continue; }
        pts.push({ p: out.center.clone().add(_v.set(m.x0 + u * CELL.x, 0, m.z)), t });
      }
      const mini = m.set.scale < 0.5;
      strips(pts, mini ? 0.8 : 0.6, mini ? 0.009 : 0.006, m);
      const box = m.set.box;
      for (const room of run.rooms) {
        const tr = [];
        for (let i = 0; i <= n; i++) {
          const t = m.t0 + (i / n) * m.dur;
          figureLocal(m, room.view, room.viewQ, t, out);
          if (!out.visible) { tr.push(null); continue; }
          _p.setFromMatrixPosition(out.matrix);
          if (Math.abs(_p.x - box.center.x) > box.half.x || Math.abs(_p.y - box.center.y) > box.half.y || Math.abs(_p.z - box.center.z) > box.half.z) { tr.push(null); continue; }
          tr.push({ p: _p.clone().add(room.center).add(_v.set(0, out.craft ? 0 : 0.025, 0)), t });
        }
        strips(tr, mini ? 0.34 : 0.2, mini ? 0.01 : 0.007, m);
      }
      let still = null;
      for (let t = m.t0; t <= m.t1 + 1e-6; t += 0.25) {
        sampleTrack(m, t, S); const a = S.p.clone(); sampleTrack(m, t + 0.25, S);
        const slow = a.distanceTo(S.p) / 0.25 < 0.12;
        if (slow && !still) still = t;
        if ((!slow || t + 0.25 > m.t1) && still != null) {
          const dur = t - still;
          if (dur >= 1.5) {
            const tm = (still + t) / 2;
            for (const room of run.rooms) {
              figureLocal(m, room.view, room.viewQ, tm, out);
              if (!out.visible) continue;
              _p.setFromMatrixPosition(out.matrix).add(room.center);
              beads.push(_p.x, _p.y + 0.04, _p.z, 0, (mini ? 0.07 : 0.1) * Math.min(3, Math.sqrt(dur / 1.5)), 1.1, Math.random(), 0);
            }
          }
          still = null;
        }
      }
      for (const e of m.events) {
        const u = blendView(run, e.t, bm, bq);
        figureLocal(m, bm, bq, e.t, out);
        if (!out.visible) continue;
        const big = e.type === 'anomaly_hatch' ? 2.2 : 1;
        beads.push(out.center.x + m.x0 + u * CELL.x, out.center.y, out.center.z + m.z, 0, 0.22 * big, 2.4 * big, Math.random(), e.type === 'anomaly_hatch' ? 1 : 0);
      }
      buildSlices(run);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const mat = worldlineMaterial();
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    const bg = new THREE.BufferGeometry();
    const P4 = [], Q4 = [];
    for (let i = 0; i < beads.length; i += 8) { P4.push(beads[i], beads[i + 1], beads[i + 2], 1); Q4.push(beads[i + 4], beads[i + 5], beads[i + 6], beads[i + 7]); }
    bg.setAttribute('aP', new THREE.Float32BufferAttribute(P4, 4));
    bg.setAttribute('aQ', new THREE.Float32BufferAttribute(Q4, 4));
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(P4.length / 4 * 3), 3));
    const bmat = pointsMaterial(0);
    const bpts = new THREE.Points(bg, bmat);
    bpts.frustumCulled = false;
    bpts.renderOrder = 4;
    return { mesh, material: mat, beads: bpts, beadMat: bmat };
  }
  scene.add(worldline.beads);

  function buildSlices(run) {
    const m = run.mem;
    const n = clamp(Math.round(26 + m.dur * 0.35), 30, 64);
    const prof = m.dwell, nb = prof.length;
    const w = prof.map(s => 1 / (1 + s / 0.45));
    const cum = [0];
    for (let i = 0; i < nb; i++) cum.push(cum[i] + w[i]);
    const total = cum[nb];
    const bm = new THREE.Matrix4(), bq = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const target = (i + 0.5) / n * total;
      let b = 0;
      while (b < nb - 1 && cum[b + 1] < target) b++;
      const f = (target - cum[b]) / Math.max(1e-6, cum[b + 1] - cum[b]);
      const t = m.t0 + ((b + f) / nb) * m.dur;
      const u = blendView(run, t, bm, bq);
      const o = figureLocal(m, bm, bq, t, mkOut());
      if (!o.visible) continue;
      o.matrix.premultiply(_m.makeTranslation(m.x0 + u * CELL.x, 0, m.z));
      o.world = o.center.clone().add(_v.set(m.x0 + u * CELL.x, 0, m.z));
      run.slices.push(o);
    }
  }

  await idle();
  const strip = buildStrips(runs, null);
  const trace = buildTrace(runs, (run, t) => {
    const bm = new THREE.Matrix4(), bq = new THREE.Quaternion();
    blendView(run, t, bm, bq);
    const o = figureLocal(run.mem, bm, bq, t, mkOut());
    return o.visible ? o.center : null;
  });
  const seed = [...String(data?.session?.id || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) ^ ((data?.segments?.length || 0) * 2654435761) ^ Math.round((data?.time || 0) * 1000);
  await idle();
  const beams = buildBeams({ runs, cell: CELL, strip, trace, quality: q, seed });
  await idle();
  beams.meshes.forEach(m => scene.add(m));
  const dust = buildDust(q === 'low' ? 1200 : 2600);
  scene.add(dust.points);
  function buildDust(n) {
    const g = new THREE.BufferGeometry();
    const P4 = new Float32Array(n * 4), Q4 = new Float32Array(n * 4);
    let s = 5;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) { P4.set([rnd() * 26, rnd() * 26, rnd() * 26, 1], i * 4); Q4.set([0.012 + rnd() * 0.02, 0.5 + rnd() * 1.5, rnd(), 0], i * 4); }
    g.setAttribute('aP', new THREE.BufferAttribute(P4, 4));
    g.setAttribute('aQ', new THREE.BufferAttribute(Q4, 4));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = pointsMaterial(1);
    mat.uniforms.uCell.value.set(CELL.x, CELL.y, CELL.z);
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    return { points, material: mat };
  }

  const panes = await buildPanes();
  async function buildPanes() {
    const list = [];
    const loader = new THREE.TextureLoader();
    const geo = new THREE.PlaneGeometry(2.1, 2.1 * 9 / 16);
    const lever = leverWorldEarly();
    for (const run of runs) {
      const m = run.mem, box = run.set.box;
      const used = [];
      for (const sn of m.snaps) {
        let tex = null, info = { v0: 0, v1: 1, gain: 1.6, mean: 0.3 };
        if (engine?.renderer?.isWebGLRenderer) {
          tex = await loader.loadAsync(sn.snap.url).catch(() => null);
          if (tex) {
            info = analyse(tex.image);
            if (info.mean < 0.018) { tex.dispose(); continue; }
            tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
          }
        }
        const mat = paneMaterial(tex);
        mat.uniforms.uGain.value = info.gain;
        mat.uniforms.uCrop.value.set(info.v0, info.v1);
        const mesh = new THREE.Mesh(geo, mat);
        if (sn.tag === 'anomaly' && lever && m === P?.memory) {
          mesh.position.copy(lever).add(V3(1.0, 1.55, -1.2));
          mesh.rotation.set(0, -Math.PI / 2, 0);
          mesh.scale.setScalar(0.8);
        } else {
          const x = clamp(xAtTime(m, sn.t), run.x0 - CELL.x * 0.5, run.x1 + CELL.x * 0.5);
          let level = 0;
          while (used.some(o => o.level === level && Math.abs(o.x - x) < 2.3)) level++;
          if (level > 1) { level = 0; while (used.some(o => o.level === level && Math.abs(o.x - x) < 2.3) && level < 2) level++; }
          used.push({ x, level });
          mesh.position.set(x + (level === 2 ? 2.4 : 0), box.center.y + 0.5 + Math.min(level, 1) * 1.45, m.z + Math.min(10.5, box.half.z + 1.6) + 5.2);
          mesh.rotation.x = -0.04;
        }
        mesh.renderOrder = 1;
        mesh.userData = { snap: sn, run, tex };
        scene.add(mesh);
        list.push(mesh);
      }
    }
    return { list, geo };
  }

  function leverWorldEarly() {
    if (!P || P.fallback || !P.leverLocal) return null;
    const r = runs.find(x => x.mem === P.memory);
    return r ? r.rooms[P.room].center.clone().add(P.leverLocal) : null;
  }

  function analyse(img) {
    try {
      const w = 64, h = 36, cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const row = y => { let s = 0; for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; s += (d[o] + d[o + 1] + d[o + 2]) / 765; } return s / w; };
      let y0 = 0, y1 = h - 1;
      while (y0 < h / 3 && row(y0) < 0.012) y0++;
      while (y1 > h * 2 / 3 && row(y1) < 0.012) y1--;
      let sum = 0, n = 0;
      for (let y = y0; y <= y1; y++) { sum += row(y); n++; }
      const mean = n ? sum / n : 0;
      return { v0: y0 / h, v1: (y1 + 1) / h, mean, gain: clamp(0.42 / Math.max(0.02, mean), 0.8, 7) };
    } catch { return { v0: 0, v1: 1, gain: 1.6, mean: 0.3 }; }
  }

  const MAXG = 170;
  const ghosts = createAstronautBatch({ engine, max: MAXG, look: 'ghost' });
  let near = null;
  if (engine?.renderer?.isWebGLRenderer) { try { near = createAstronautNear({ engine, quality: q, count: 2 }); } catch (e) { console.warn('[tesseract] near figure unavailable', e?.message); } }
  const solids = near || createAstronautBatch({ engine, max: 6, look: 'solid' });
  const NEAR_N = near ? 2 : 6;
  scene.add(ghosts.group, solids.group);
  const craftGeo = runs.find(r => r.set.craft)?.set.craft.geo || null;
  let gcraft = null;
  if (craftGeo) {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal']) g.setAttribute(k, craftGeo.attributes[k]);
    g.setIndex(craftGeo.index);
    const op = new THREE.InstancedBufferAttribute(new Float32Array(160).fill(0), 1);
    op.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOpacity', op);
    gcraft = new THREE.InstancedMesh(g, ghostCraftMaterial(), 160);
    gcraft.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gcraft.frustumCulled = false;
    gcraft.count = 0;
    gcraft.userData.op = op;
    scene.add(gcraft);
  }

  let pushRoom = null, lever = null;
  if (P?.fallback) {
    const run = runs.find(r => r.mem === P.memory);
    pushRoom = run.rooms[P.room];
    P.t = pushRoom.T;
    P.leverLocal = figureWorld(pushRoom, P.t).sub(pushRoom.center);
  }
  if (!P) {
    P = layout.push = { memory: null, t: 0, fallback: true, room: 0, leverLocal: layout.start.position.clone().add(V3(0, -0.3, -9)) };
    pushRoom = { center: V3(), T: 0, mats: [], movs: [] };
  }
  if (!pushRoom) pushRoom = runs.find(r => r.mem === P.memory).rooms[P.room];
  lever = pushRoom.movs.find(o => o.userData.mov.id === 'lever') || null;
  if (!lever) {
    lever = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.4) }));
    lever.position.copy(pushRoom.center).add(P.leverLocal);
    lever.updateMatrixWorld();
    scene.add(lever);
  }
  const pushTarget = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  pushTarget.name = 'push';
  pushTarget.renderOrder = -1;
  pushTarget.position.copy(pushRoom.center).add(P.leverLocal);
  pushTarget.userData.interact = { id: 'push', label: 'push', hold: 1.2, range: 3.2, radius: 0.35, enabled: false };
  scene.add(pushTarget);
  pushTarget.updateMatrixWorld();

  const sea = await makeSea();
  async function makeSea() {
    if (!engine?.renderer?.isWebGLRenderer || !runs.some(r => OCEAN.has(r.kind))) return null;
    try {
      const mod = await import('../world/ocean.js');
      if (!mod.createSeaPatch) return null;
      const light = { top: [0.43, 0.44, 0.43], horizon: [0.5, 0.51, 0.495], glow: [0.1, 0.1, 0.09], haze: 0 };
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.matrix.makeTranslation(0, -9000, 0);
      const patch = mod.createSeaPatch({ engine, size: 260, quality: q, frozen: true, light });
      holder.add(patch.group);
      let ridge = null, H = 0;
      if (mod.createWaveRidge && W) {
        const s0 = runs.find(r => r.kind === 'wave' || r.kind === 'shallows')?.set;
        H = s0 ? 2.3 * (s0.box.half.y * 2) / s0.scale : 400;
        ridge = mod.createWaveRidge({ engine, height: H, length: 600, quality: q, frozen: true, light });
        holder.add(ridge.group);
      }
      scene.add(holder);
      return { holder, patch, ridge, H, room: null };
    } catch (e) { console.warn('[tesseract] sea patch unavailable', e?.message || e); return null; }
  }
  function updateSea(cam) {
    if (!sea) return;
    let cand = null, bd = 45;
    for (const r of rooms) if (OCEAN.has(r.mem.kind) && r.dist < bd) { bd = r.dist; cand = r; }
    sea.room = cand;
    if (!cand) { sea.holder.matrix.makeTranslation(0, -9000, 0); sea.holder.matrixWorldNeedsUpdate = true; return; }
    const set = cand.mem.set, pt = set.patch;
    sea.holder.matrix.makeTranslation(cand.center.x, 0, cand.center.z).multiply(set.view);
    sea.holder.matrixWorldNeedsUpdate = true;
    sea.patch.group.position.set(pt.cx, 0, pt.cz);
    sea.patch.group.scale.set(Math.max(pt.sx, pt.sz) / 260, 1, Math.max(pt.sx, pt.sz) / 260);
    sea.patch.setTime(cand.T);
    for (const mesh of cand.meshes) mesh.visible = false;
    if (sea.ridge) {
      const d = W.at(cand.T);
      const show = cand.T >= W.t0 - 0.01 && d > -pt.sx * 0.6;
      sea.ridge.group.visible = show;
      if (show) {
        const rx = set.landed.p.x, edge = pt.cx + pt.sx / 2 + 40 / set.scale;
        sea.ridge.group.position.set(Math.min(rx + d, edge), 0, pt.cz);
        sea.ridge.setTime(cand.T);
      }
      if (cand.wave) cand.wave.visible = false;
    }
  }

  const proxies = [];
  {
    const ints = layout.memories.some(m => m.kind === 'lab' || m.kind === 'ring' || m.kind === 'aged') ? await lib.interior() : null;
    if (ints?.api) proxies.push(makeProxy(ints.api, ['lab', 'ring', 'aged'], 'interior'));
    const cks = layout.memories.some(m => m.kind === 'cockpit' || m.kind === 'fall') ? await lib.cockpit() : null;
    if (cks?.api) proxies.push(makeProxy(cks.api, ['cockpit', 'fall'], 'cockpit'));
  }
  function makeProxy(api, kinds, type) {
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.makeTranslation(0, -9000, 0);
    holder.add(api.group);
    scene.add(holder);
    const U = { uNearClip: { value: new THREE.Matrix4() }, uNearCut: { value: new THREE.Vector4(0, 0, 0, -999) }, uNearCutC: { value: new THREE.Vector3() } };
    const done = new Set();
    api.group.traverse(o => {
      if (o.isPoints || o.isLine || /sunBeams|dust/i.test(o.name || '')) { o.visible = false; return; }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (done.has(m)) continue;
        done.add(m);
        if (m.isShaderMaterial) { o.visible = false; continue; }
        const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
        m.onBeforeCompile = (sh, r) => {
          prev?.call(m, sh, r);
          if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <clipping_planes_fragment>')) return;
          Object.assign(sh.uniforms, U);
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNearW;').replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 nw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nnw = instanceMatrix * nw;\n#endif\nvNearW = (modelMatrix * nw).xyz; }');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vNearW; uniform mat4 uNearClip; uniform vec4 uNearCut; uniform vec3 uNearCutC;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ vec3 nq = abs((uNearClip * vec4(vNearW, 1.0)).xyz); if (max(nq.x, max(nq.y, nq.z)) > 1.0) discard; if (uNearCut.w > -900.0 && dot(vNearW - uNearCutC, uNearCut.xyz) > uNearCut.w) discard; }');
        };
        m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|tessclip';
        m.needsUpdate = true;
      }
    });
    if (type === 'interior') { api.setLights?.(1, 0); api.setDust?.(0); api.setVisibleZone?.('hub'); api.setVisibleZone?.('lab'); }
    return { api, kinds, type, holder, U, room: null, age: -1 };
  }
  function updateProxies(cam, dt) {
    for (const px of proxies) {
      let cand = null, bd = 20;
      for (const r of rooms) if (px.kinds.includes(r.mem.kind) && r.dist < bd && r.meshes.length) { bd = r.dist; cand = r; }
      px.room = cand;
      if (!cand) { if (px.on) { px.holder.matrix.makeTranslation(0, -9000, 0); px.holder.matrixWorldNeedsUpdate = true; px.on = false; } continue; }
      px.on = true;
      px.holder.matrix.copy(cand.world);
      px.holder.matrixWorldNeedsUpdate = true;
      for (const mesh of cand.meshes) mesh.visible = false;
      for (const mesh of cand.movs) mesh.visible = false;
      const RU = cand.mats[0].uniforms;
      px.U.uNearClip.value.copy(RU.uClip.value);
      px.U.uNearCut.value.copy(RU.uCut.value);
      px.U.uNearCutC.value.copy(RU.uCutC.value);
      const T = cand.T, a = px.api;
      if (px.type === 'interior') {
        const age = cand.mem.kind === 'aged' ? (layout.numbers.years || 25) : 0;
        if (Math.abs(age - px.age) > 0.01) { a.setAge(age); a.setLights?.(age ? 0.75 : 1, age ? 0.25 : 0); px.age = age; }
        const inv = _m.copy(cand.view).invert();
        a.setViewer(V3().copy(cand.mem.set.box.center).applyMatrix4(inv));
        const ph = Math.PI / 2 + SPIN * T, tl = 1.1;
        a.setSunDirection(V3(Math.cos(ph) * Math.cos(tl), Math.sin(ph) * Math.cos(tl), Math.sin(tl)), 7);
        if (cand.mem === P?.memory) { a.setLever(movValue(cand, 'lever', T)); a.setHatch('lab', movValue(cand, 'hatch', T)); }
        else { a.setLever(1); a.setHatch('lab', 1); }
      } else {
        a.setPower?.(cand.mats[0].uniforms.uPower.value);
        if (cand.mem.kind === 'fall') a.setFailure?.(Math.min(1, 1 - cand.mats[0].uniforms.uPower.value));
      }
      a.update?.(dt);
    }
  }

  const st = {
    t: 0, arrive: 0, reveal: 1, fold: 0, ripple: -1, pushed: false, pushT0: 0, still: 0, loop: 0, loopKey: null, after: [],
    nearest: null, lastNearest: null, scrub: 0, prevX: null, near: 0, pushReady: false,
  };
  const figOut = mkOut();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();

  function movValue(room, id, T) {
    if (!P || room.mem !== P.memory) return id === 'lever' || id === 'hatch' ? 1 : 0;
    const tA = room === pushRoom && st.pushed ? P.t : P.t;
    if (id === 'lever') return smooth(0, 1.4, T - tA);
    return smooth(1.4, 3.8, T - tA);
  }

  function roomLights(room, T) {
    const m = room.mem, L = lightFor(m.kind);
    for (const mat of room.mats) {
      const U = mat.uniforms;
      U.uTime.value = st.t;
      const sw = L.sweep ? Math.pow(Math.max(0, Math.cos(SPIN * T)), 10) : 0;
      U.uSweep.value = sw;
      if (L.sweep) {
        const lv = mat.uniforms.uLevel.value < 1 ? -1 : 1;
        U.uKeyDir.value.set(0.35 * Math.sin(SPIN * T), 0.42 * lv, 1).normalize();
        U.uKeyCol.value.setRGB(L.keyCol[0] + 1.5 * sw, L.keyCol[1] + 1.02 * sw, L.keyCol[2] + 0.6 * sw);
      }
      if (m.kind === 'cockpit') { const n = switchT.filter(x => x <= T).length; U.uPower.value = n === 0 ? 0.04 : n < 3 ? 0.2 + n * 0.1 : 0.75 + 0.06 * n; }
      else if (m.kind === 'fall') { const n = failT.filter(x => x <= T).length; U.uPower.value = Math.max(0.05, 1 - n * 0.23); U.uFlicker.value = 0.15 + n * 0.12; }
      else U.uPower.value = 1;
    }
  }

  function placeRoom(room, T, dist) {
    const lod = dist < 30 ? 'geo' : dist < 55 ? 'lod' : dist < 85 ? 'far' : 'vfar';
    for (const mesh of room.meshes) {
      const ch = mesh.userData.chunk;
      mesh.geometry = ch[lod] || ch.far;
      if (ch.spin) {
        _m.makeRotationAxis(ch.spin.axis, SPIN * (T - ch.spin.t0));
        mesh.matrix.multiplyMatrices(mesh.userData.base, _m);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    for (const mesh of room.mirrors) {
      const ch = mesh.userData.chunk;
      if (ch.spin) { _m.makeRotationAxis(ch.spin.axis, SPIN * (T - ch.spin.t0)); mesh.matrix.multiplyMatrices(mesh.userData.base, _m); mesh.matrixWorldNeedsUpdate = true; }
    }
    for (const mesh of room.movs) {
      const mv = mesh.userData.mov, v = movValue(room, mv.id, T);
      mv.M0.decompose(_v, _q, _s); mv.M1.decompose(_w, _q2, _u);
      _q.slerp(_q2, v); _v.lerp(_w, v);
      mesh.matrix.multiplyMatrices(room.world, _m.compose(_v, _q, _s));
      mesh.matrixWorldNeedsUpdate = true;
    }
    if (room.wave) {
      const set = room.mem.set, pt = set.patch;
      const d = W ? W.at(T) : null;
      const show = d != null && T >= W.t0 - 0.01;
      room.wave.visible = show && d > -pt.sx;
      if (room.wave.visible) {
        const rx = set.landed.p.x, edge = pt.cx + pt.sx / 2;
        const xw = rx + d;
        const far = xw > edge;
        _v.set(Math.min(xw, edge), 0, pt.cz).applyMatrix4(set.view);
        const close = far ? clamp((edge - rx) / Math.max(1, d), 0.04, 1) : 1;
        const h = Math.min(6.5, set.box.half.y * 2 - 1.2) * (0.15 + 0.85 * close);
        _q.setFromUnitVectors(V3(1, 0, 0), set.waveAxis);
        room.wave.matrix.makeTranslation(room.center.x, 0, room.center.z).multiply(_m.compose(_v, _q, _s.set(far ? 0.9 : 1.6, h, 1)));
        room.wave.matrixWorldNeedsUpdate = true;
      }
    }
  }

  function nearestRoom(cam) {
    let best = null, bd = Infinity;
    for (const r of rooms) { const d = r.center.distanceToSquared(cam); if (d < bd) { bd = d; best = r; } }
    return { room: best, dist: Math.sqrt(bd) };
  }

  function runDistance(run, cam) {
    const x = clamp(cam.x, run.x0 - CELL.x / 2, run.x1 + CELL.x / 2);
    return Math.hypot(cam.x - x, cam.y, cam.z - run.z);
  }

  function update(camera, dt, opts = {}) {
    st.t += dt;
    const cam = camera.getWorldPosition(_p).clone();
    const fwd = camera.getWorldDirection(V3());
    const px = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, opts.height || engine?.height || 1080);
    const vx = st.prevX == null || dt <= 0 ? 0 : (cam.x - st.prevX) / dt;
    st.prevX = cam.x;
    st.still = Math.abs(vx) < 0.35 ? st.still + dt : 0;
    const near = nearestRoom(cam);
    st.nearest = near;
    const nr = near.room;
    const W0 = 2.6;
    if (st.loopKey !== nr) { st.loopKey = nr; st.loop = 0; }
    const nearLever = nr === pushRoom && leverWorld(_u).distanceTo(cam) < 7;
    if (nr && st.still > 0.9 && near.dist < 16 && !opts.frozen && !nearLever) {
      st.loop += dt * 0.55;
      const win = Math.min(W0, nr.mem.delta * 0.55);
      if (st.loop > win) { st.after.push({ room: nr, t: nr.T, age: 0 }); st.loop = 0; }
    } else st.loop *= Math.exp(-dt * 2.5);

    for (const run of runs) {
      const m = run.mem;
      for (const room of run.rooms) {
        let T = roomTime(m, room.k, clamp(cam.x - room.x, -CELL.x / 2, CELL.x / 2));
        if (room === nr) T += st.loop;
        if (st.pushed && room === pushRoom) T = P.t + (st.t - st.pushT0);
        room.T = T;
        const dist = room.center.distanceTo(cam);
        room.dist = dist;
        const vis = dist < 130 && st.reveal > 0.005;
        for (const mesh of room.meshes) mesh.visible = vis;
        for (const mesh of room.mirrors) mesh.visible = vis && dist < 85;
        for (const mesh of room.movs) mesh.visible = vis;
        if (!vis) continue;
        const cutK = CUT.has(m.kind) ? 1 : 0;
        for (const mat of room.mats) {
          mat.uniforms.uFade.value = st.reveal * (1 + st.fold * 2) * (1 - st.fold * st.fold);
          const cc = mat.userData.cc, h = room.mem.set.box.half;
          _v.subVectors(cam, cc);
          const inside = Math.abs(_v.x) < h.x + 0.6 && Math.abs(_v.y) < h.y + 0.6 && Math.abs(_v.z) < h.z + 0.6;
          if (!cutK || inside) mat.uniforms.uCut.value.w = -999;
          else {
            _v.y *= 0.45; _v.normalize();
            mat.uniforms.uCut.value.set(_v.x, _v.y, _v.z, 0.22 * (Math.abs(_v.x) * h.x + Math.abs(_v.y) * h.y + Math.abs(_v.z) * h.z));
            mat.uniforms.uCutC.value.copy(cc);
          }
        }
        roomLights(room, T);
        placeRoom(room, T, dist);
      }
    }

    updateProxies(cam, dt);
    updateSea(cam);
    const order = rooms.filter(r => r.dist < 80).sort((a, b) => a.dist - b.dist);
    let ns = 0, ng = 0, nc = 0;
    const gOp = gcraft?.userData.op;
    for (const room of rooms) if (room.craft) room.craft.visible = false;
    for (const room of order) {
      const m = room.mem;
      figureLocal(m, room.view, room.viewQ, room.T, figOut);
      if (!figOut.visible && room.craft && room.mem.set.landed && OCEAN.has(m.kind)) {
        const set = m.set;
        _p.copy(set.landed.p);
        _q.copy(set.landed.q);
        if (W && layout.numbers.waveHit) {
          const tReach = W.t0 + (W.at(W.t0) - 0) / Math.max(1e-3, W.speed);
          const k = (room.T - tReach) / 14;
          if (k > 0 && k < 1) {
            const H = (sea?.H || 300) * 0.42;
            _p.x += W.at(room.T) + H * 0.3;
            _p.y += H * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.5);
            _q.multiply(_q2.setFromAxisAngle(V3(0, 0, 1), 0.55 * Math.sin(Math.PI * k)));
          }
        }
        _p.applyMatrix4(room.view);
        _q.premultiply(room.viewQ);
        figOut.matrix.compose(_p, _q, _s.setScalar(set.scale)); figOut.craft = true; figOut.visible = true;
      }
      if (!figOut.visible) continue;
      if (figOut.craft) {
        if (room.craft) {
          room.craft.matrix.makeTranslation(room.center.x, 0, room.center.z).multiply(figOut.matrix);
          room.craft.matrixWorldNeedsUpdate = true;
          room.craft.visible = true;
        }
        continue;
      }
      tmpM.makeTranslation(room.center.x, 0, room.center.z).multiply(figOut.matrix);
      if (ns < NEAR_N && room.dist < 22) { if (ns === 0 && solids.setLightFromRoom) solids.setLightFromRoom(room.mats[0].uniforms); solids.setInstance(ns++, tmpM, figOut.pose, 1); }
      else if (ng < MAXG - 2) ghosts.setInstance(ng++, tmpM, figOut.pose, 2 * smooth(80, 30, room.dist) * st.reveal);
      if (OCEAN.has(m.kind) && room.craft && m.set.landed) {
        _p.copy(m.set.landed.p).applyMatrix4(room.view);
        _q.copy(room.viewQ).multiply(m.set.landed.q);
        room.craft.matrix.makeTranslation(room.center.x, 0, room.center.z).multiply(_m.compose(_p, _q, _s.setScalar(m.set.scale)));
        room.craft.matrixWorldNeedsUpdate = true;
        room.craft.visible = true;
      }
    }
    const active = runs.map(r => ({ r, d: runDistance(r, cam) })).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { r, d } of active) {
      const k = smooth(70, 20, d) * st.reveal;
      if (k <= 0.01) continue;
      for (const sl of r.slices) {
        const fd = sl.world.distanceTo(cam);
        const op = k * smooth(60, 12, fd) * (r.set.scale > 0.5 ? 0.42 : 0.8);
        if (op < 0.01) continue;
        if (sl.craft) { if (gcraft && nc < 160) { gcraft.setMatrixAt(nc, sl.matrix); gOp.array[nc++] = op; } }
        else if (ng < MAXG - 2) ghosts.setInstance(ng++, sl.matrix, sl.pose, op);
      }
    }
    st.after = st.after.filter(a => (a.age += dt) < 1.2);
    for (const a of st.after) {
      figureLocal(a.room.mem, a.room.view, a.room.viewQ, a.t, figOut);
      if (!figOut.visible || figOut.craft || ng >= MAXG) continue;
      tmpM.makeTranslation(a.room.center.x, 0, a.room.center.z).multiply(figOut.matrix);
      ghosts.setInstance(ng++, tmpM, figOut.pose, 1.4 * (1 - a.age / 1.2));
    }
    solids.setCount(ns); ghosts.setCount(ng);
    ghosts.setViewer?.(cam);
    if (gcraft) { gcraft.count = nc; gcraft.instanceMatrix.needsUpdate = true; gOp.needsUpdate = true; }
    const solidRoom = order.find(r => r.dist < 22);
    if (solidRoom) { key.position.copy(solidRoom.center).add(_v.set(cam.x - solidRoom.center.x, 5, cam.z - solidRoom.center.z).normalize().multiplyScalar(6)).add(_w.set(0, 4, 0)); key.target.position.copy(solidRoom.center); key.target.updateMatrixWorld(); }

    for (const pane of panes.list) {
      const d = pane.position.distanceTo(cam);
      pane.visible = d < 110;
      pane.material.uniforms.uFade.value = st.reveal;
      pane.material.uniforms.uFold.value = st.fold;
    }

    const SU = beams.material.uniforms;
    camera.matrixWorld.extractBasis(_camR, _camU, _v);
    for (const M of [beams.material, beams.glass]) {
      const U = M.uniforms;
      U.uTime.value = st.t; U.uArrive.value = st.arrive; U.uFold.value = st.fold; U.uFwd.value.copy(fwd); U.uReveal.value = 0.25 + 0.75 * st.reveal;
      U.uCamUp.value.copy(_camU); U.uCamRight.value.copy(_camR);
      leverWorld(U.uTarget.value);
    }
    const rp = st.ripple >= 0 ? (st.ripple += dt) : 0;
    if (P) { leverWorld(_w); SU.uRipple.value.set(_w.x, _w.y, _w.z, rp); beams.glass.uniforms.uRipple.value.copy(SU.uRipple.value); }
    const WU = worldline.material.uniforms;
    WU.uTime.value = st.t; WU.uPixel.value = px; WU.uFold.value = st.fold; WU.uArrive.value = st.arrive; WU.uReveal.value = st.reveal; WU.uRipple.value.copy(SU.uRipple.value);
    WU.uFocus.value.set(cam.x, cam.y, cam.z, 18);
    const BU = worldline.beadMat.uniforms;
    BU.uTime.value = st.t; BU.uPx.value = 1 / px; BU.uFold.value = st.fold; BU.uArrive.value = 1 - st.reveal;
    const DU = dust.material.uniforms;
    DU.uTime.value = st.t; DU.uPx.value = 1 / px; DU.uFold.value = st.fold; DU.uArrive.value = st.arrive;

    st.pushReady = false;
    if (P && lever) {
      const L = _v.set(pushRoom.center.x + P.leverLocal.x, pushRoom.center.y + P.leverLocal.y, pushRoom.center.z + P.leverLocal.z);
      const dl = L.distanceTo(cam);
      const dtA = Math.abs(pushRoom.T - P.t);
      const align = st.pushed ? 0 : smooth(34, 4, dl) * smooth(8, 0.8, dtA);
      DU.uAlign.value.set(L.x, L.y, L.z, align);
      st.pushReady = !st.pushed && dl < 3.6 && dtA < 2;
      pushTarget.userData.interact.enabled = st.pushReady;
    }
    if (!nr) { st.nearest = null; st.scrub = 0; st.roomChanged = false; return st; }
    const nT = nr.T;
    st.scrub = dt > 0 && st.lastT != null && st.lastRoom === nr ? (nT - st.lastT) / dt : 0;
    st.lastT = nT; st.lastRoom = nr;
    st.roomChanged = st.lastNearest && st.lastNearest !== nr;
    st.lastNearest = nr;
    return st;
  }

  function startPush() {
    if (!P || st.pushed) return;
    st.pushed = true;
    st.pushT0 = st.t;
    st.ripple = 0;
  }

  function crossing() {
    if (!P?.memory || P.fallback || !pushRoom?.mem) return null;
    const m = P.memory, o = mkOut();
    for (let t = P.t + 0.5; t < m.track[m.track.length - 1].t1 + 0.01; t += 0.1) {
      figureLocal(m, pushRoom.view, pushRoom.viewQ, t, o);
      if (o.visible && o.center.x > P.leverLocal.x + 0.15) return t;
    }
    return null;
  }

  function standPoint() {
    const L = leverWorld(V3());
    if (!P?.memory || P.fallback) return L.clone().add(V3(0, 0.2, 2.2));
    const fig = figureWorld(pushRoom, P.t);
    const box = P.memory.set.box;
    let best = null, bd = -1;
    for (const o of [[-1.6, 0.2, -1.2], [-1.6, 0.2, 1.2], [-0.7, 0.2, -2.0], [-2.3, 0.3, 0], [-1.2, 0.25, 0.4], [-1.9, 0.2, -0.6]]) {
      const p = L.clone().add(V3(...o));
      const lp = p.clone().sub(pushRoom.center);
      if (Math.abs(lp.x - box.center.x) > box.half.x - 0.4 || Math.abs(lp.z - box.center.z) > box.half.z - 0.4) continue;
      const d = Math.hypot(p.x - fig.x, p.z - fig.z);
      if (p.distanceTo(L) < 2.8 && d > bd) { bd = d; best = p; }
    }
    return best || L.clone().add(V3(-1.6, 0.2, -1.2));
  }

  async function compileAll(renderer, camera) {
    const hidden = [];
    scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await renderer.compileAsync(scene, camera); } finally { for (const o of hidden) o.visible = false; }
  }

  function figureWorld(room, t = room.T, out = V3()) {
    const o = figureLocal(room.mem, room.view, room.viewQ, t, mkOut());
    return out.copy(o.center).add(room.center);
  }

  function leverWorld(out = V3()) { return P ? out.copy(pushRoom.center).add(P.leverLocal) : out.set(0, 0, 0); }

  let envRT = null;
  const pushCross = crossing();
  const pushStandP = standPoint();

  function stats() {
    let calls = 0, tris = 0;
    scene.traverse(o => { if (o.visible && (o.isMesh || o.isPoints)) { calls++; const g = o.geometry; tris += g.index ? g.index.count / 3 * (o.isInstancedMesh ? o.count : 1) : 0; } });
    return { calls, tris: Math.round(tris), rooms: rooms.length, beams: beams.count, slices: runs.reduce((n, r) => n + r.slices.length, 0) };
  }

  function dispose() {
    const mats = new Set(), geos = new Set();
    scene.traverse(o => { if (o.material) mats.add(o.material); if (o.geometry && !o.userData.chunk) geos.add(o.geometry); });
    for (const r of rooms) r.mats.forEach(m => mats.add(m));
    mats.forEach(m => m.dispose());
    geos.forEach(g => g.dispose?.());
    strip.dispose(); trace.dispose();
    for (const r of rooms) for (const ch of r.chunks || []) for (const k of ['geo', 'lod', 'far', 'vfar']) if (ch[k]?.userData?.clipped) ch[k].dispose();
    panes.list.forEach(p => p.userData.tex?.dispose());
    panes.geo.dispose();
    ghosts.dispose(); solids.dispose?.();
    sea?.patch.dispose(); sea?.ridge?.dispose(); envRT?.dispose();
    for (const px of proxies) px.holder.removeFromParent();
    lib.dispose();
  }

  return {
    scene, layout, runs, rooms, state: st, update, startPush, leverWorld, figureWorld, lever: pushTarget, pushRoom, stats, dispose, compileAll, panes: panes.list,
    get pushCross() { return pushCross; }, get pushStand() { return pushStandP; },
    setArrive(a) { st.arrive = a; }, setReveal(r) { st.reveal = r; }, setFold(f) { st.fold = f; },
    describe: () => describeLayout(layout),
    colliders: beams.bundles,
    async captureEnv(at) { const was = st.reveal; st.reveal = 1; envRT?.dispose(); envRT = await captureEnvironment(engine?.renderer, scene, at, [beams.material, beams.glass]); st.reveal = was; },
    sources: Object.assign({}, ...runs.map(r => r.set.sources)),
  };
}

function waveModel(events) {
  const ev = t => events.find(e => e.type === t);
  const ws = ev('wave_seen'), lift = ev('liftoff'), hit = ev('wave_hit'), rt = ev('recorder_taken');
  if (!ws && !hit) return null;
  const d0 = ws?.data?.distance ?? 1400;
  const t0 = ws ? ws.t : hit.t - 60;
  let tArr = null;
  if (lift && Number.isFinite(lift.data?.margin)) tArr = lift.t + lift.data.margin;
  else if (hit) tArr = hit.t + 4;
  if (tArr == null || tArr <= t0) tArr = t0 + 240;
  const v = d0 / (tArr - t0);
  return { t0: rt ? Math.min(rt.t, t0) : t0, at: t => d0 - (t - t0) * v, speed: v, tArr };
}
