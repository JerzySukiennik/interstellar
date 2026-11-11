// Cryo pod wake-up for pod A or its mirror image pod B: a first-person body that lies in the pod, lifts its head, props on its elbows, pushes up to sit, swings its legs over the edge and stands, with hands and feet pinned to the bed, the rim and the floor by two-bone IK and the camera riding the head; afterwards the same body follows the walking player.
import * as THREE from 'three';
import { createAstronaut, poseFor, neutralPose } from '../../models/astronaut.js';

const HALF = Math.PI / 2, DEG = Math.PI / 180;
const EYE_U = -0.85, MATTRESS = 0.76, PEEK = { shut: 1.1, open: 2.5 };
const LIMB = { upper: 0.29, fore: 0.27, thigh: 0.42, shin: 0.4, sole: 0.09 };
const MARKS = { push: 3.0, footR: 8.6, footL: 8.9, stepR: 10.7, stepL: 11.2 };
const VEC = ['LH', 'RH', 'LF', 'RF'];
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
const clamp01 = x => clamp(x, 0, 1);
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _p = V(), _v = V(), _P = V(), _T = V(), _pole = V(), _n = V(), _h = V(), _u = V(), _f = V(), _x = V(), _y = V(), _z = V(), _N = V(), _fw = V(), _sd = V(), _F = V();
const _q = Q(), _qp = Q(), _qw = Q(), _ql = Q(), _qf = Q(), _qb = Q(), _qh = Q(), _qx = Q();
const _e = new THREE.Euler(), _m = new THREE.Matrix4();
const TURN = Q().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

function hermite(keys, name, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0][name];
  if (t >= keys[n - 1].t) return keys[n - 1][name];
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], d = b.t - a.t, u = (t - a.t) / d;
  const slope = j => {
    if (j <= 0 || j >= n - 1) return 0;
    const s0 = (keys[j][name] - keys[j - 1][name]) / (keys[j].t - keys[j - 1].t), s1 = (keys[j + 1][name] - keys[j][name]) / (keys[j + 1].t - keys[j].t);
    return s0 * s1 <= 0 ? 0 : (s0 + s1) / 2;
  };
  const m0 = slope(i) * d, m1 = slope(i + 1) * d, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[name] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[name] + (u3 - u2) * m1;
}

function twoBone(P, T, la, lb, pole, sign, out) {
  _n.subVectors(T, P);
  const d = clamp(_n.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  _n.normalize();
  const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _h.copy(pole).addScaledVector(_n, -pole.dot(_n));
  if (_h.lengthSq() < 1e-8) _h.set(_n.y, _n.z, _n.x).addScaledVector(_n, -(_n.x * _n.y + _n.y * _n.z + _n.z * _n.x));
  _h.normalize();
  _u.copy(_n).multiplyScalar(cosA).addScaledVector(_h, sinA);
  _f.copy(_n).multiplyScalar(d).addScaledVector(_u, -la).normalize();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_z.lengthSq() < 1e-6) _z.copy(_h).negate().addScaledVector(_u, _h.dot(_u));
  _z.normalize().multiplyScalar(sign);
  _y.copy(_u).negate();
  _x.crossVectors(_y, _z);
  out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  return Math.PI - Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
}

function buildKeys(L) {
  const { U, hLie, hSit, hStand, sole, rest: R } = L;
  const base = {
    u: U, v: 0, yaw: HALF, h: hLie, prx: -HALF, prz: 0, srx: 0, sry: 0, hrx: -0.05, hry: 0, eye: 0, grip: 0.45,
    afL: 0.04, aoL: 0.14, aeL: 0.25, afR: 0.04, aoR: 0.14, aeR: 0.28, fwd: 0.06, out: 0.045, knee: 0.1, toe: 0.45, flat: 0,
    LHw: 1, RHw: 1, LHp: 0.9, RHp: 0.9, LHe: 0, RHe: 0, LHr: 0, RHr: 0, LFw: 0, RFw: 0, LFp: 0, RFp: 0,
  };
  const K = [], mids = [];
  const fill = (k, o) => { for (const n in o) { if (VEC.includes(n)) { k[n + 'u'] = o[n][0]; k[n + 'y'] = o[n][1]; k[n + 'v'] = o[n][2]; } else k[n] = o[n]; } return k; };
  const key = (t, o) => K.push(fill({ ...(K[K.length - 1] || base), t }, o));
  const mid = (t, o) => mids.push([t, o]);
  const heel = (r, du, dy, v = r[2]) => [r[0] + du, r[1] + dy, v];
  key(0, { LH: [-0.12, hLie + 0.2, -0.13], RH: [-0.13, hLie + 0.205, 0.12], LF: R.LF, RF: R.RF });
  key(0.9, { hrx: 0.03, hry: -0.16, grip: 0.85 });
  key(1.7, { prx: -HALF + 0.06, srx: 0.18, hrx: 0.55, hry: -0.03, eye: 0.25, grip: 0.45, LH: [-0.17, 0.99, -0.31], RH: [-0.17, 0.99, 0.31], LHp: 0.3, RHp: 0.3, LFw: 1, RFw: 1 });
  key(2.5, { prx: -HALF + 0.45, srx: 0.24, hry: 0, eye: 0.5, h: hLie + 0.01, LH: [-0.26, 0.805, -0.29], RH: [-0.26, 0.805, 0.29], LHp: 1, RHp: 1 });
  key(3.3, { prx: -HALF + 1.05, srx: 0.3, hrx: 0.27, eye: 0.25, h: hSit - 0.02, LH: [-0.26, 0.8, -0.3], RH: [-0.26, 0.8, 0.3], LF: heel(R.LF, -0.04, 0.01), RF: heel(R.RF, -0.04, 0.01) });
  key(3.9, { prx: -0.04, srx: 0.38, hrx: 0.06, eye: 0, h: hSit, LH: [-0.1, 0.97, -0.26], RH: [-0.1, 0.97, 0.26], LHr: 0.9, RHr: 0.9, LF: heel(R.LF, -0.11, 0.02), RF: heel(R.RF, -0.11, 0.02) });
  key(4.6, { prx: -0.1, srx: 0.3, hrx: 0.25, eye: 0.1, grip: 0.3, LH: [0.4, 1.27, -0.13], RH: [0.4, 1.28, 0.13], LHe: 1.1, RHe: 1.1, LHr: 2.8, RHr: 2.8, LF: heel(R.LF, -0.16, 0.03, -0.11), RF: heel(R.RF, -0.16, 0.03, 0.11) });
  mid(4.9, { grip: 1.05 });
  key(5.2, { hrx: 0.22, grip: 0.35, LH: [0.41, 1.26, -0.14], RH: [0.41, 1.27, 0.14], LHe: 0.95, RHe: 0.95, LHr: 0.35, RHr: 0.35 });
  key(5.9, { prx: -0.12, srx: 0.28, sry: -0.22, hrx: 0.02, hry: -0.62, eye: 0, grip: 0.45, LH: [0.06, 1.04, -0.13], RH: [0.06, 1.04, 0.13], LHe: 0, RHe: 0, LHr: 0, RHr: 0, LHp: 0.8, RHp: 0.8 });
  key(6.5, { u: U + 0.02, v: 0.06, yaw: 84 * DEG, srx: 0.3, sry: -0.3, hrx: 0.28, hry: -0.45, eye: 0.15, RH: [0.02, 0.82, 0.4], RHp: 1, LH: [-0.2, 0.8, -0.25], LHp: 1, RF: [0.5, 0.93, 0.18] });
  mid(6.85, { RF: [0.42, 0.94, 0.46] });
  key(7.2, { u: U + 0.07, v: 0.18, yaw: 62 * DEG, prx: -0.1, sry: -0.12, hrx: 0.38, hry: -0.3, eye: 0.2, LH: [-0.02, 0.8, -0.12], RF: [0.3, 0.62, 0.66], LF: [0.6, 0.87, 0], toe: 0.25 });
  mid(7.55, { LF: [0.42, 0.93, 0.45] });
  key(7.9, { u: 0, v: 0.33, yaw: 40 * DEG, prx: -0.04, srx: 0.32, sry: 0, hrx: 0.45, hry: 0, eye: 0.25, RH: [-0.24, 0.82, 0.4], LH: [0.175, 0.8, 0.12], RF: [0.15, 0.43, 0.66], LF: [0.3, 0.43, 0.54] });
  key(8.6, { u: 0.07, v: 0.42, h: 0.83, prx: 0.04, srx: 0.34, RF: [0.155, sole, 0.67], RFp: 1, LF: [0.3, 0.25, 0.545] });
  key(8.9, { u: 0.1, v: 0.455, h: 0.8, prx: 0.1, hrx: 0.42, eye: 0.2, LF: [0.303, sole, 0.546], LFp: 1 });
  key(9.2, { u: 0.13, v: 0.49, h: 0.805, prx: 0.3, srx: 0.28, hrx: 0.1, eye: 0.1, LHw: 0.4, RHw: 0.4, afL: 0.2, aoL: 0.2, aeL: 0.4, afR: 0.2, aoR: 0.2, aeR: 0.4 });
  key(9.5, { u: 0.17, v: 0.535, h: 0.83, prx: 0.45, srx: 0.22, hrx: -0.22, eye: 0, LHw: 0, RHw: 0, LHp: 0, RHp: 0, afL: 0.25, aoL: 0.18, aeL: 0.5, afR: 0.25, aoR: 0.18, aeR: 0.5 });
  key(10.2, { u: 0.229, v: 0.608, h: hStand - 0.012, prx: 0.06, srx: 0.08, hrx: 0, afL: 0.1, aoL: 0.2, aeL: 0.4, afR: 0.12, aoR: 0.2, aeR: 0.45 });
  key(10.45, { u: 0.26, v: 0.645, RF: [0.21, 0.16, 0.74], RFp: 0.5 });
  key(10.7, { u: 0.3, v: 0.69, prx: 0.04, RF: [0.277, sole, 0.816], RFp: 1 });
  key(10.95, { u: 0.33, v: 0.725, LF: [0.36, 0.16, 0.62], LFp: 0.5 });
  key(11.2, { u: 0.351, v: 0.754, h: hStand, prx: 0, srx: 0.04, hrx: 0.05, LF: [0.425, sole, 0.692], LFp: 1, afL: 0.1, aoL: 0.2, aeL: 0.42, afR: 0.14, aoR: 0.22, aeR: 0.5, fwd: 0.02, out: 0.04, knee: 0.05, toe: 0, flat: 1 });
  key(11.6, { LFw: 0, RFw: 0 });
  const extra = mids.map(([t, o]) => { const k = { t }; for (const n in K[0]) if (n !== 't') k[n] = hermite(K, n, t); return fill(k, o); });
  return K.concat(extra).sort((x, y) => x.t - y.t);
}

const SWAP = n => (/^[LR][HF]/.test(n) ? (n[0] === 'L' ? 'R' : 'L') + n.slice(1) : /^a[foe][LR]$/.test(n) ? n.slice(0, 2) + (n[2] === 'L' ? 'R' : 'L') : n);
const NEG = n => n === 'v' || n === 'prz' || n === 'sry' || n === 'hry' || /^[LR][HF]v$/.test(n);

export async function createWake(ctx, rig, { pod = 'A' } = {}) {
  const mir = pod === 'B';
  const real = !!ctx.engine.renderer.capabilities;
  const a = createAstronaut({ engine: ctx.engine, quality: ctx.engine.qualityName });
  const J = a.joints;
  const bed = new THREE.Group(), group = new THREE.Group();
  bed.name = 'podFrame';
  group.name = 'pilotBody';
  group.add(a.group);
  bed.add(group);
  rig.scene.add(bed);
  J.head.traverse(o => { if (o.isMesh) o.visible = false; });
  for (const o of J.spine.children) if (o.isMesh && /_(metal|dark)$/.test(o.name)) o.visible = false;
  a.group.traverse(o => { if (o.isMesh) { o.castShadow = real; o.receiveShadow = real; o.frustumCulled = false; } });

  const measure = pose => { a.setPose(pose); a.group.scale.setScalar(1); a.group.updateMatrixWorld(true); return a.group.worldToLocal(a.anchors.eye.getWorldPosition(V())); };
  const eyeStand = measure(poseFor('stand', 0, 0)), eyeLie = measure(poseFor('lie', 0, 0));
  const A = { eye: rig.anchorRing('podA_eye'), stand: rig.anchorRing('podA_stand') };
  const C = { s: A.eye.s - EYE_U, z: mir ? -A.eye.z : A.eye.z };
  const k = A.stand.y / eyeStand.y;
  const L = { U: EYE_U - eyeLie.z * k, hLie: MATTRESS + 0.075, hSit: MATTRESS + 0.11, hStand: 0.98 * k, sole: LIMB.sole * k, rest: { LF: [0, 0, 0], RF: [0, 0, 0] } };
  let keys = buildKeys(L);
  const T = keys[keys.length - 1].t;
  const pose = neutralPose();
  const st = { t: 0, playing: false, done: false, yaw: 0, pitch: 0, soft: 0, lid: 0, cues: [], phase: 0, mode: 'pod' };
  const val = (n, t) => {
    if (!mir) return hermite(keys, n, t);
    if (n === 'yaw') return Math.PI - hermite(keys, 'yaw', t);
    const x = hermite(keys, SWAP(n), t);
    return NEG(n) ? -x : x;
  };
  let g = n => val(n, 0);

  function place() {
    _v.set(C.s, 0, C.z);
    rig.F.ring.toWorld(_v, bed.position);
    rig.F.ring.basis(_v, bed.quaternion);
  }

  function setEuler(arr, q) { _e.setFromQuaternion(q, 'XYZ'); arr[0] = _e.x; arr[1] = _e.y; arr[2] = _e.z; }

  function arm(s, m) {
    const w = clamp01(g(s + 'Hw'));
    if (w <= 0.001) return;
    const sh = pose['shoulder' + s], el = pose['elbow' + s];
    J['shoulder' + s].getWorldPosition(_P);
    J.spine.getWorldQuaternion(_qp);
    bed.localToWorld(_T.set(g(s + 'Hu'), g(s + 'Hy'), g(s + 'Hv')));
    _pole.set(m * 0.5, -0.2, -1).applyQuaternion(_qp);
    const flex = twoBone(_P, _T, LIMB.upper * k, LIMB.fore * k, _pole, 1, _qw);
    _ql.copy(_qp).invert().multiply(_qw);
    _qf.setFromEuler(_e.set(sh[0], sh[1], sh[2], 'XYZ')).slerp(_ql, w);
    setEuler(sh, _qf);
    el[0] += (-flex - el[0]) * w;
    const plant = clamp01(g(s + 'Hp')) * w;
    if (plant <= 0.001) return;
    _qb.copy(_qp).multiply(_qf).multiply(_qx.setFromAxisAngle(X, el[0]));
    _F.set(0, -1, 0).applyQuaternion(_qb);
    _F.addScaledVector(_N, -_F.dot(_N)).addScaledVector(_fw, 0.5).addScaledVector(_sd, 0.34 * m);
    _F.addScaledVector(_N, -_F.dot(_N)).normalize();
    const lift = g(s + 'He'), roll = g(s + 'Hr');
    _n.copy(_N).multiplyScalar(Math.cos(lift)).addScaledVector(_F, -Math.sin(lift));
    _F.multiplyScalar(Math.cos(lift)).addScaledVector(_N, Math.sin(lift));
    _x.crossVectors(_n, _F).multiplyScalar(Math.sin(roll)).addScaledVector(_n, m * Math.cos(roll));
    _y.copy(_F).negate();
    _z.crossVectors(_x, _y);
    _qh.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    _ql.copy(_qb).invert().multiply(_qh);
    setEuler(pose['wrist' + s], _q.identity().slerp(_ql, plant));
  }

  function leg(s, m) {
    const w = clamp01(g(s + 'Fw'));
    if (w <= 0.001) return;
    const hip = pose['hip' + s], kn = pose['knee' + s], an = pose['ankle' + s];
    J['hip' + s].getWorldPosition(_P);
    J.pelvis.getWorldQuaternion(_qp);
    bed.localToWorld(_T.set(g(s + 'Fu'), g(s + 'Fy'), g(s + 'Fv')));
    _pole.copy(_N).addScaledVector(_fw, 0.6).addScaledVector(_sd, 0.15 * m);
    const flex = twoBone(_P, _T, LIMB.thigh * k, LIMB.shin * k, _pole, -1, _qw);
    _ql.copy(_qp).invert().multiply(_qw);
    _qf.setFromEuler(_e.set(hip[0], hip[1], hip[2], 'XYZ')).slerp(_ql, w);
    setEuler(hip, _qf);
    kn[0] += (flex - kn[0]) * w;
    const plant = clamp01(g(s + 'Fp')) * w;
    if (plant <= 0.001) return;
    _qb.copy(_qp).multiply(_qf).multiply(_qx.setFromAxisAngle(X, kn[0]));
    group.getWorldQuaternion(_qh).multiply(_qx.setFromAxisAngle(UP, m * 0.1));
    _ql.copy(_qb).invert().multiply(_qh);
    setEuler(an, _q.setFromEuler(_e.set(an[0], an[1], an[2], 'XYZ')).slerp(_ql, plant));
  }

  function apply(t, time) {
    g = n => val(n, t);
    place();
    const push = t > 1.9 && t < 3.5 ? Math.sin((t - 1.9) / 1.6 * Math.PI) : t > 8.8 && t < 10 ? Math.sin((t - 8.8) / 1.2 * Math.PI) : 0;
    const breathe = Math.sin(time * 1.9) * 0.012, effort = Math.sin(time * 37) * 0.004 * push;
    const sway = t > 3.6 ? Math.sin(time * 0.9) * 0.01 * (1 - clamp01((t - 10.2) / 1.2) * 0.6) : 0;
    const prx = g('prx'), fw = g('fwd'), knee = g('knee'), out = g('out'), flat = clamp01(g('flat')), toe = g('toe'), grip = g('grip');
    for (const n in pose) { const o = pose[n]; o[0] = 0; o[1] = 0; o[2] = 0; }
    pose.root[1] = g('h') / k - 0.98;
    pose.pelvis[0] = prx; pose.pelvis[2] = g('prz') + sway;
    pose.spine[0] = g('srx') + breathe + effort; pose.spine[1] = g('sry'); pose.spine[2] = -sway * 0.6;
    pose.head[0] = g('hrx') + effort; pose.head[1] = g('hry');
    for (const [s, m] of [['L', 1], ['R', -1]]) {
      pose['hip' + s][0] = -fw; pose['hip' + s][2] = out * m;
      pose['knee' + s][0] = knee;
      pose['ankle' + s][0] = (fw - knee - prx) * flat + toe * (1 - flat);
      pose['ankle' + s][2] = -out * m * 0.6;
      pose['shoulder' + s][0] = -g('af' + s); pose['shoulder' + s][2] = g('ao' + s) * m;
      pose['elbow' + s][0] = -g('ae' + s);
    }
    pose.hand[0] = grip; pose.hand[1] = grip + 0.05;
    a.setPose(pose);
    a.group.scale.setScalar(k);
    group.position.set(g('u'), 0, g('v'));
    group.quaternion.setFromAxisAngle(UP, g('yaw'));
    bed.updateMatrixWorld(true);
    if (g('LHw') + g('RHw') + g('LFw') + g('RFw') <= 0.001) return;
    bed.getWorldQuaternion(_q);
    _N.set(0, 1, 0).applyQuaternion(_q);
    group.getWorldQuaternion(_q);
    _fw.set(0, 0, 1).applyQuaternion(_q);
    _sd.set(1, 0, 0).applyQuaternion(_q);
    arm('L', 1); arm('R', -1); leg('L', 1); leg('R', -1);
    a.setPose(pose);
    bed.updateMatrixWorld(true);
  }

  const sag = t => hermite(keys, 'prx', t) + hermite(keys, 'srx', t) + hermite(keys, 'hrx', t) + hermite(keys, 'eye', t);
  const calmAt = t => 1 - 0.55 * Math.sin(clamp01(t / T) * Math.PI);
  const local = name => bed.worldToLocal(J[name].getWorldPosition(V())).toArray();

  apply(0, 0);
  const flip = p => [p[0], p[1], -p[2]];
  L.rest = mir ? { LF: flip(local('ankleR')), RF: flip(local('ankleL')) } : { LF: local('ankleL'), RF: local('ankleR') };
  keys = buildKeys(L);
  apply(T, 0);
  const endEye = bed.worldToLocal(a.anchors.eye.getWorldPosition(V()));
  const end = { s: C.s + endEye.x, z: C.z + endEye.z };
  apply(0, 0);

  const controller = {
    position: V(), quaternion: Q(), enabled: true, look: true, anchor: group, duration: T,
    seek(t) { st.t = clamp(t, 0, T); st.playing = false; st.pitch = st.soft = st.yaw = 0; },
    update(dt, input) {
      if (st.mode !== 'pod') return;
      st.phase += dt;
      if (st.playing) { st.t = Math.min(T, st.t + dt); if (st.t >= T) { st.playing = false; st.done = true; } }
      const lying = !st.playing && !st.done;
      const low = lying ? lerp(-0.95, -1.8, st.lid) : -0.6;
      if (input && this.look) { const l = input.look(); st.yaw = clamp(st.yaw - l.x, -0.7, 0.7); st.pitch = clamp(st.pitch - l.y, Math.min(low, st.pitch), 0.45); }
      if (st.pitch < low) st.pitch += (low - st.pitch) * Math.min(1, dt * 3);
      st.soft += (st.pitch - st.soft) * Math.min(1, dt * (lying ? 7 : 30));
      const tp = lying ? Math.max(st.t, smooth(-st.soft, 0.4, 1.3) * lerp(PEEK.shut, PEEK.open, st.lid)) : st.t;
      const calm = st.playing ? calmAt(st.t) : 1;
      apply(tp, st.phase);
      const cam = rig.camera;
      a.anchors.eye.getWorldPosition(cam.position);
      J.head.getWorldQuaternion(cam.quaternion).multiply(TURN).multiply(_q.setFromEuler(_e.set(st.soft * calm + sag(tp) - sag(st.t) - hermite(keys, 'eye', tp), st.yaw * calm, 0, 'YXZ')));
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
      bed.getWorldQuaternion(_q);
      _N.set(0, 1, 0).applyQuaternion(_q);
      _h.copy(_N).addScaledVector(_f, -_N.dot(_f));
      if (_h.lengthSq() > 1e-6) {
        _u.lerp(_h.normalize(), 0.8 * smooth(1 - Math.abs(_f.dot(_N)), 0.02, 0.15)).normalize();
        _z.copy(_f).negate();
        _x.crossVectors(_u, _z).normalize();
        _y.crossVectors(_z, _x);
        cam.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
      }
      cam.updateMatrixWorld();
      this.position.copy(cam.position); this.quaternion.copy(cam.quaternion);
      while (st.cues.length && st.t >= st.cues[0].t) st.cues.shift().fn();
    },
  };

  return {
    controller, group, astronaut: a, duration: T, marks: MARKS, end, pod,
    get done() { return st.done; },
    get time() { return st.t; },
    lid(u) { st.lid = clamp01(u); },
    rise(cues = []) {
      const tp = Math.max(st.t, smooth(-st.soft, 0.4, 1.3) * lerp(PEEK.shut, PEEK.open, st.lid));
      st.pitch = st.soft = clamp((st.soft + sag(tp) - sag(st.t)) / calmAt(tp), -0.6, 0.45);
      st.t = tp;
      st.cues = cues.filter(c => c.t >= tp).sort((x, y) => x.t - y.t);
      st.playing = true;
    },
    walk() { st.mode = 'walk'; rig.scene.add(group); },
    follow(dt, ctl, show) {
      if (st.mode !== 'walk') return;
      group.visible = !!show;
      if (!show || !ctl?.frame) return;
      const sp = Math.hypot(ctl.velocity.x, ctl.velocity.z);
      if (sp > 0.12) a.animate('walk', ((ctl._phase / (Math.PI * 2)) % 1 + 1) % 1, Math.min(1, sp / 0.9)); else a.animate('stand', (st.phase / 6) % 1, 0.6);
      st.phase += dt;
      a.group.scale.setScalar(k);
      _v.set(-Math.sin(ctl.yaw), 0, -Math.cos(ctl.yaw));
      _p.copy(ctl.position).addScaledVector(_v, -(eyeStand.z * k + 0.07 + 0.05 * Math.max(0, -ctl.pitch)));
      rig.F.ring.toWorld(_p, group.position);
      rig.F.ring.basis(_p, group.quaternion).multiply(_q.setFromAxisAngle(UP, ctl.yaw + Math.PI));
      group.updateMatrixWorld(true);
    },
    dispose() { bed.removeFromParent(); group.removeFromParent(); a.dispose(); },
  };
}
