// Interstellar astronaut: hand-built rigid-segment pressure suit, IK gaits, room-lit near figures, instanced solid and clean-hull ghost time-slices.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const V3 = THREE.Vector3;

export const JOINTS = [
  ['pelvis', null, 0, 0.98, 0],
  ['spine', 'pelvis', 0, 0.10, 0],
  ['head', 'spine', 0, 0.50, 0.005],
  ['shoulderL', 'spine', 0.235, 0.38, 0],
  ['elbowL', 'shoulderL', 0, -0.29, 0],
  ['wristL', 'elbowL', 0, -0.27, 0],
  ['shoulderR', 'spine', -0.235, 0.38, 0],
  ['elbowR', 'shoulderR', 0, -0.29, 0],
  ['wristR', 'elbowR', 0, -0.27, 0],
  ['hipL', 'pelvis', 0.10, -0.07, 0],
  ['kneeL', 'hipL', 0, -0.42, 0],
  ['ankleL', 'kneeL', 0, -0.40, 0],
  ['hipR', 'pelvis', -0.10, -0.07, 0],
  ['kneeR', 'hipR', 0, -0.42, 0],
  ['ankleR', 'kneeR', 0, -0.40, 0],
];
export const JOINT_NAMES = JOINTS.map(j => j[0]);
const NJ = JOINTS.length;
const PARENT = JOINTS.map(j => JOINT_NAMES.indexOf(j[1]));
const REST = JOINTS.map(j => [j[2], j[3], j[4]]);
const REST_WORLD = [];
for (let i = 0; i < NJ; i++) {
  const p = PARENT[i] < 0 ? [0, 0, 0] : REST_WORLD[PARENT[i]];
  REST_WORLD.push([p[0] + REST[i][0], p[1] + REST[i][1], p[2] + REST[i][2]]);
}
const IDX = Object.fromEntries(JOINT_NAMES.map((n, i) => [n, i]));

export const MODES = ['stand', 'walk', 'wade', 'climb', 'float', 'swim', 'sit', 'lie', 'reach', 'tumble'];
export const CYCLE = { stand: 6, walk: 1.15, wade: 2.6, climb: 1.9, float: 7, swim: 4.5, sit: 5, lie: 6, reach: 4, tumble: 9 };
export const STRIDE = { walk: 1.56, wade: 1.24, climb: 0.6 };
export const DEFAULT_GRIP = 0.45;

const ANKLE_H = 0.099, THIGH = 0.42, SHIN = 0.40, UPPER = 0.29, FORE = 0.27, LEG_MAX = 0.805;
const GS = 1.3;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const set3 = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
const frac = x => x - Math.floor(x);

export function neutralPose() {
  const p = { root: [0, 0, 0], hand: [DEFAULT_GRIP, DEFAULT_GRIP, 0] };
  for (const n of JOINT_NAMES) p[n] = [0, 0, 0];
  return p;
}

export function copyPose(src, out = neutralPose()) {
  for (const k in out) { const s = src[k]; if (s) set3(out[k], s[0], s[1], s[2]); }
  return out;
}

export function lerpPose(a, b, t, out = neutralPose()) {
  for (const k in out) {
    const x = a[k], y = b[k], o = out[k];
    if (!x || !y) continue;
    o[0] = x[0] + (y[0] - x[0]) * t; o[1] = x[1] + (y[1] - x[1]) * t; o[2] = x[2] + (y[2] - x[2]) * t;
  }
  return out;
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new V3(), _one = new V3(1, 1, 1), _m = new THREE.Matrix4();

export function solvePose(pose, out, rootMatrix) {
  for (let i = 0; i < NJ; i++) {
    const r = pose[JOINT_NAMES[i]];
    _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, 'XYZ');
    _q.setFromEuler(_e);
    const R = REST[i];
    _v.set(R[0], R[1], R[2]);
    if (i === 0 && pose.root) { _v.x += pose.root[0]; _v.y += pose.root[1]; _v.z += pose.root[2]; }
    _m.compose(_v, _q, _one);
    if (PARENT[i] < 0) { if (rootMatrix) out[i].multiplyMatrices(rootMatrix, _m); else out[i].copy(_m); }
    else out[i].multiplyMatrices(out[PARENT[i]], _m);
  }
  return out;
}

const _gm = Array.from({ length: NJ }, () => new THREE.Matrix4());
const FOOT_PTS = [[0, -ANKLE_H, -0.105], [0, -ANKLE_H, 0.21], [0.055, -ANKLE_H, 0.05], [-0.055, -ANKLE_H, 0.05]];
function ground(p) {
  solvePose(p, _gm);
  let min = Infinity;
  for (const j of [IDX.ankleL, IDX.ankleR]) for (const f of FOOT_PTS) { _v.set(f[0], f[1], f[2]).applyMatrix4(_gm[j]); min = Math.min(min, _v.y); }
  p.root[1] -= min;
}

function arm(p, s, fwd, out, elbow, pron = 0, ext = 0, twist = 0) {
  const m = s === 'L' ? 1 : -1;
  set3(p['shoulder' + s], -Math.min(fwd, 2.5), twist * m, out * m);
  set3(p['elbow' + s], -elbow, 0, 0);
  set3(p['wrist' + s], 0, pron * m, ext * m);
}

function leg(p, s, fwd, out, knee, toe = 0, flat = true, twist = 0) {
  const m = s === 'L' ? 1 : -1;
  set3(p['hip' + s], -fwd, twist * m, out * m);
  set3(p['knee' + s], knee, 0, 0);
  if (flat) set3(p['ankle' + s], fwd - knee - p.pelvis[0] - toe, 0, -(out * m + p.pelvis[2]) * 0.9);
  else set3(p['ankle' + s], -toe, 0, -out * m * 0.5);
}

const _ik = { S: new V3(), T: new V3(), d: new V3(), t: new V3(), p: new V3(), E: new V3(), u: new V3(), w: new V3(), zb: new V3(), X: new V3(), Y: new V3(), Z: new V3(), mm: new THREE.Matrix4(), qa: new THREE.Quaternion(), qb: new THREE.Quaternion() };
function ik2(S, T, L1, L2, pole, legMode, outQ) {
  const k = _ik;
  k.d.subVectors(T, S);
  const len = k.d.length() || 1e-4;
  k.t.copy(k.d).divideScalar(len);
  const dist = clamp(len, 0.05, L1 + L2 - 1e-3);
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  k.p.copy(pole).addScaledVector(k.t, -pole.dot(k.t));
  if (k.p.lengthSq() < 1e-8) k.p.set(0, 0, 1).addScaledVector(k.t, -k.t.z);
  k.p.normalize();
  k.E.copy(S).addScaledVector(k.t, a).addScaledVector(k.p, h);
  k.u.subVectors(k.E, S).normalize();
  k.w.copy(S).addScaledVector(k.t, dist).sub(k.E).normalize();
  k.zb.copy(k.w).addScaledVector(k.u, -k.w.dot(k.u));
  if (k.zb.lengthSq() < 1e-8) k.zb.copy(k.p).negate();
  k.zb.normalize();
  k.Y.copy(k.u).negate();
  k.Z.copy(k.zb);
  if (legMode) k.Z.negate();
  k.X.crossVectors(k.Y, k.Z).normalize();
  k.Z.crossVectors(k.X, k.Y).normalize();
  outQ.setFromRotationMatrix(k.mm.makeBasis(k.X, k.Y, k.Z));
  return Math.acos(clamp(k.u.dot(k.w), -1, 1));
}

const _limbQ = new THREE.Quaternion(), _parQ = new THREE.Quaternion();
function limbIK(p, s, kind, T, pole) {
  solvePose(p, _gm);
  const isArm = kind === 'arm';
  const upper = (isArm ? 'shoulder' : 'hip') + s, lower = (isArm ? 'elbow' : 'knee') + s;
  const ju = IDX[upper];
  _ik.S.setFromMatrixPosition(_gm[ju]);
  const flex = ik2(_ik.S, T, isArm ? UPPER : THIGH, isArm ? FORE : SHIN, pole, !isArm, _limbQ);
  _parQ.setFromRotationMatrix(_gm[PARENT[ju]]).invert().multiply(_limbQ);
  _e.setFromQuaternion(_parQ, 'XYZ');
  set3(p[upper], _e.x, _e.y, _e.z);
  set3(p[lower], isArm ? -flex : flex, 0, 0);
}

const _hq = new THREE.Quaternion(), _hX = new V3(), _hY = new V3(), _hZ = new V3(), _hm = new THREE.Matrix4();
function orientHand(p, s, F, P) {
  solvePose(p, _gm);
  _hY.copy(F).normalize().negate();
  _hX.copy(P).multiplyScalar(s === 'L' ? -1 : 1);
  _hX.addScaledVector(_hY, -_hX.dot(_hY)).normalize();
  _hZ.crossVectors(_hX, _hY);
  _hq.setFromRotationMatrix(_hm.makeBasis(_hX, _hY, _hZ));
  _parQ.setFromRotationMatrix(_gm[IDX['elbow' + s]]).invert().multiply(_hq);
  _e.setFromQuaternion(_parQ, 'XYZ');
  set3(p['wrist' + s], _e.x, _e.y, _e.z);
}

function orientFoot(p, s, pitchUp, yaw = 0) {
  solvePose(p, _gm);
  _hZ.set(Math.sin(yaw) * Math.cos(pitchUp), Math.sin(pitchUp), Math.cos(yaw) * Math.cos(pitchUp));
  _hY.set(-Math.sin(yaw) * Math.sin(pitchUp), Math.cos(pitchUp), -Math.cos(yaw) * Math.sin(pitchUp));
  _hX.crossVectors(_hY, _hZ);
  _hq.setFromRotationMatrix(_hm.makeBasis(_hX, _hY, _hZ));
  _parQ.setFromRotationMatrix(_gm[IDX['knee' + s]]).invert().multiply(_hq);
  _e.setFromQuaternion(_parQ, 'XYZ');
  set3(p['ankle' + s], _e.x, _e.y, _e.z);
}

function reset(p) {
  for (const k in p) set3(p[k], 0, 0, 0);
  for (const n of JOINT_NAMES) if (!p[n]) p[n] = [0, 0, 0];
  if (!p.root) p.root = [0, 0, 0];
  if (!p.hand) p.hand = [0, 0, 0];
  set3(p.hand, DEFAULT_GRIP, DEFAULT_GRIP, 0);
}

const _T = new V3(), _P = new V3(), _F = new V3(), _N = new V3();
const POLE_FWD = new V3(0, 0, 1);

function footTrack(u, o, side) {
  const D = o.D, beta = o.beta;
  let z, y = ANKLE_H, pitch = 0;
  if (u < beta) {
    const r = u / beta;
    z = D * beta * (0.5 - r);
    const hl = o.heel * smooth(0.6, 1, r);
    const toeZ = z + 0.2;
    y = ANKLE_H * Math.cos(hl) + 0.2 * Math.sin(hl);
    z = toeZ - (0.2 * Math.cos(hl) - ANKLE_H * Math.sin(hl));
    pitch = -hl + o.strike * (1 - smooth(0, 0.14, r));
  } else {
    const s = (u - beta) / (1 - beta);
    const e = s - Math.sin(TAU * s) / TAU;
    z = D * beta * (-0.5 + e) + o.knee * Math.sin(PI * s) * 0.05;
    const lift = o.lift * (side === 'R' ? o.asym : 1);
    y = ANKLE_H + lift * Math.pow(Math.sin(PI * Math.min(1, s * 1.08)), 1.3);
    pitch = (o.swingPitch || 0.12) * Math.sin(PI * s) - o.heel * (1 - smooth(0, 0.35, s)) * 0.6;
  }
  return { x: (side === 'L' ? 1 : -1) * o.footX, y, z, pitch, stance: u < beta };
}

function gaitLegs(p, ph, o) {
  const feet = { L: footTrack(frac(ph), o, 'L'), R: footTrack(frac(ph + 0.5), o, 'R') };
  p.root[1] = 0;
  solvePose(p, _gm);
  let delta = Infinity;
  for (const s of ['L', 'R']) {
    const f = feet[s];
    _v.setFromMatrixPosition(_gm[IDX['hip' + s]]);
    const dz = f.z - _v.z, dx = f.x - _v.x;
    const need = f.y + Math.sqrt(Math.max(0.01, LEG_MAX * LEG_MAX - dz * dz - dx * dx)) - _v.y;
    if (f.stance) delta = Math.min(delta, need);
  }
  p.root[1] = (delta === Infinity ? 0 : delta) - o.crouch;
  for (const s of ['L', 'R']) {
    const f = feet[s];
    _T.set(f.x, f.y, f.z);
    _P.set(f.x * 0.3, 0, 1);
    limbIK(p, s, 'leg', _T, _P);
    orientFoot(p, s, f.pitch, 0);
  }
  return feet;
}

function stand(p, w, a) {
  const b = Math.sin(w), b2 = Math.sin(2 * w + 1);
  set3(p.pelvis, 0, 0.025 * b * a, 0.012 * Math.sin(w + 0.6) * a);
  set3(p.spine, 0.04 + 0.012 * b2, -0.02 * b * a, -0.01 * Math.sin(w + 0.6) * a);
  set3(p.head, 0.05 + 0.03 * Math.sin(2 * w + 2) * a, 0.15 * Math.sin(w + 1.2) * a, 0);
  arm(p, 'L', 0.1 + 0.03 * b2 * a, 0.2, 0.42 + 0.04 * b2 * a, 0.25, 0.1);
  arm(p, 'R', 0.14, 0.22, 0.5 + 0.03 * b2 * a, 0.3, 0.12);
  leg(p, 'L', 0.02, 0.035, 0.06);
  leg(p, 'R', -0.01, 0.045, 0.09);
  set3(p.hand, 0.5, 0.55, 0);
  ground(p);
}

function walk(p, ph, a) {
  const w = TAU * ph, c = Math.cos(w), s = Math.sin(w);
  set3(p.pelvis, 0.06, -0.1 * c * a, 0.03 * s * a);
  set3(p.spine, 0.05, 0.13 * c * a, -0.025 * s * a);
  set3(p.head, 0.04, -0.03 * c * a, 0);
  gaitLegs(p, ph, { D: STRIDE.walk, beta: 0.58, lift: 0.1, footX: 0.115, crouch: 0.012, heel: 0.55, strike: 0.25, knee: 1, asym: 1 });
  for (const [S, k] of [['L', 1], ['R', -1]]) {
    const cc = c * k;
    arm(p, S, 0.08 - 0.38 * cc * a, 0.17, 0.38 + 0.3 * Math.max(0, -cc) * a, 0.35, 0.08);
  }
  set3(p.hand, 0.55, 0.5, 0);
}

function wade(p, ph, a) {
  const w = TAU * ph, c = Math.cos(w), s = Math.sin(w);
  set3(p.pelvis, 0.14, -0.08 * c * a, -0.07 * s * a);
  set3(p.spine, 0.27 + 0.04 * Math.sin(2 * w + 0.6), 0.09 * c * a, 0.05 * s * a);
  set3(p.head, -0.06 - 0.04 * Math.sin(2 * w), -0.06 * c * a, 0.03 * s * a);
  gaitLegs(p, ph, { D: STRIDE.wade, beta: 0.62, lift: 0.3 * a, footX: 0.14, crouch: 0.045, heel: 0.35, strike: 0.1, knee: 1, asym: 0.85, swingPitch: -0.15 });
  for (const [S, k] of [['L', 1], ['R', -1]]) {
    const cc = c * k;
    arm(p, S, 0.22 - 0.2 * cc * a, 0.92 + 0.14 * Math.max(0, cc) * a + 0.05 * Math.sin(2 * w + k), 0.45 + 0.12 * cc * a, 1.1, 0.45);
  }
  set3(p.hand, 0.3, 0.35, 0);
}

function climb(p, ph, a) {
  set3(p.pelvis, 0.05, 0.03 * Math.sin(TAU * ph) * a, 0);
  set3(p.spine, 0.04, -0.03 * Math.sin(TAU * ph) * a, 0);
  set3(p.head, -0.32, 0.04 * Math.sin(TAU * ph) * a, 0);
  set3(p.root, 0, 0, -0.03);
  const C = STRIDE.climb, hold = 0.6;
  const rel = (u, ys) => {
    if (u < hold) return { y: ys - C * u, back: 0, held: 1 };
    const s = (u - hold) / (1 - hold), e = s - Math.sin(TAU * s) / TAU;
    return { y: ys - C * hold + C * hold * e, back: Math.sin(PI * s), held: 0 };
  };
  for (const [S, o] of [['L', 0], ['R', 0.5]]) {
    const sg = S === 'L' ? 1 : -1;
    const f = rel(frac(ph + o + 0.5), 0.3);
    _T.set(sg * 0.12, f.y + ANKLE_H, 0.15 - 0.06 * f.back);
    _P.set(sg * 0.2, 0.3, 1);
    limbIK(p, S, 'leg', _T, _P);
    orientFoot(p, S, 0.05 * f.back, 0);
  }
  for (const [S, o] of [['L', 0], ['R', 0.5]]) {
    const sg = S === 'L' ? 1 : -1;
    const h = rel(frac(ph + o), 1.8);
    _T.set(sg * 0.17, h.y - 0.13, 0.31 - 0.1 * h.back);
    _P.set(sg * 0.7, -1, -0.4);
    limbIK(p, S, 'arm', _T, _P);
    orientHand(p, S, _F.set(0, 1, 0.25), _N.set(0, -0.15, 1));
    p.hand[S === 'L' ? 0 : 1] = h.held ? 0.85 : 0.25 + 0.3 * (1 - h.back);
  }
}

function float(p, w, a) {
  const s1 = Math.sin(w), s2 = Math.sin(2 * w + 1.3), s3 = Math.sin(w + 2.1);
  set3(p.pelvis, 1.05 + 0.06 * s1 * a, 0.06 * s2 * a, 0.08 * s3 * a);
  set3(p.spine, -0.16 + 0.04 * s2 * a, 0.06 * s1 * a, 0.03 * s3 * a);
  set3(p.head, -0.72 + 0.06 * s1 * a, 0.12 * Math.sin(w + 2) * a, 0);
  arm(p, 'R', 1.75 + 0.12 * s1 * a, 0.22 + 0.05 * s2 * a, 0.35 + 0.12 * s3 * a, -0.9, 0.3);
  arm(p, 'L', 0.35 + 0.1 * s3 * a, 0.42 + 0.08 * s1 * a, 0.75 + 0.12 * s2 * a, 0.3, -0.1);
  leg(p, 'L', -0.12 + 0.08 * s2 * a, 0.14, 0.3 + 0.1 * s1 * a, -0.45, false);
  leg(p, 'R', 0.22 + 0.08 * s3 * a, 0.18, 1.35 + 0.12 * s1 * a, -0.35, false, -0.15);
  set3(p.hand, 0.35, 0.3, 0);
  set3(p.root, 0, 0.04 * s1 * a, 0);
}

function swim(p, w, a) {
  const s = Math.sin(w), c = Math.cos(w);
  set3(p.pelvis, 0.85, 0.04 * s * a, 0.05 * Math.sin(2 * w) * a);
  set3(p.spine, -0.15 + 0.04 * s * a, -0.08 * s * a, 0);
  set3(p.head, -0.55, 0.06 * s * a, 0);
  arm(p, 'R', 2.4 + 0.1 * s * a, 0.14, 0.2 + 0.12 * (1 - s) * a, -1.2, 0.35 + 0.15 * s * a);
  arm(p, 'L', -0.15 + 0.15 * s * a, 0.35, 0.5, 0.2, 0);
  leg(p, 'L', -0.15 + 0.16 * s * a, 0.08, 0.35 + 0.2 * Math.max(0, s) * a, -0.5, false);
  leg(p, 'R', -0.15 - 0.16 * s * a, 0.08, 0.35 + 0.2 * Math.max(0, -s) * a, -0.5, false);
  set3(p.hand, 0.25, 0.5, 0);
  set3(p.root, 0, 0, 0.02 * c * a);
}

function sit(p, w, a) {
  const b = Math.sin(w);
  set3(p.pelvis, -0.18, 0, 0);
  set3(p.spine, 0.06 + 0.01 * b, 0, 0);
  set3(p.head, 0.12, 0.05 * Math.sin(w + 1) * a, 0);
  leg(p, 'L', 1.4, 0.08, 1.45);
  leg(p, 'R', 1.4, 0.1, 1.42);
  ground(p);
  for (const [S, sg, k] of [['L', 1, 0], ['R', -1, 1.7]]) {
    solvePose(p, _gm);
    _v.setFromMatrixPosition(_gm[IDX['shoulder' + S]]);
    _T.set(_v.x - sg * 0.03 + 0.01 * Math.sin(w * 2 + k) * a, _v.y - 0.17 + 0.01 * Math.sin(w + k) * a, _v.z + 0.48);
    _P.set(sg * 0.6, -1, -0.3);
    limbIK(p, S, 'arm', _T, _P);
    orientHand(p, S, _F.set(-sg * 0.1, -0.25, 1), _N.set(0, -1, 0.1));
  }
  set3(p.hand, 0.6, 0.55, 0);
}

function lie(p, w, a) {
  const b = Math.sin(w);
  set3(p.pelvis, -HALF, 0, 0);
  set3(p.spine, 0.01 * b * a, 0, 0);
  set3(p.head, -0.05, 0.03 * Math.sin(w + 1) * a, 0);
  arm(p, 'L', 0.04, 0.14, 0.25, 0.6, 0);
  arm(p, 'R', 0.04, 0.14, 0.28, 0.6, 0);
  leg(p, 'L', 0.06, 0.04, 0.1, -0.45, false);
  leg(p, 'R', 0.05, 0.05, 0.12, -0.45, false);
  set3(p.hand, 0.4, 0.45, 0);
  set3(p.root, 0, -0.725, 0);
}

function tumble(p, w, a) {
  const S = Math.sin;
  set3(p.pelvis, w, 0.5 * S(w) * a, 0.3 * S(2 * w) * a);
  set3(p.spine, 0.1 + 0.15 * S(2 * w + 0.5) * a, 0.1 * S(2 * w) * a, 0);
  set3(p.head, 0.1 + 0.2 * S(2 * w + 1) * a, 0.2 * S(w + 0.4) * a, 0);
  arm(p, 'L', 0.6 + 0.7 * S(2 * w + 0.3) * a, 0.8 + 0.4 * S(3 * w + 1) * a, 0.7 + 0.4 * S(2 * w + 2) * a, -0.2, 0);
  arm(p, 'R', 0.4 + 0.8 * S(2 * w + 2.1) * a, 0.9 + 0.35 * S(3 * w + 2.5) * a, 0.6 + 0.5 * S(2 * w + 0.7) * a, -0.2, 0);
  leg(p, 'L', 0.5 + 0.5 * S(2 * w + 1) * a, 0.25 + 0.15 * S(3 * w) * a, 0.7 + 0.5 * S(2 * w + 2.5) * a, -0.3, false);
  leg(p, 'R', 0.3 + 0.6 * S(2 * w + 3.3) * a, 0.3 + 0.12 * S(3 * w + 1.4) * a, 0.8 + 0.4 * S(2 * w + 0.9) * a, -0.3, false);
  set3(p.hand, 0.3 + 0.2 * S(w * 2), 0.35 + 0.2 * S(w * 3 + 1), 0);
}

const _reach = neutralPose();
export function withReach(pose, amount = 1, side = 'R') {
  if (amount <= 0) return pose;
  const t = clamp(amount, 0, 1), sg = side === 'R' ? -1 : 1;
  copyPose(pose, _reach);
  _reach.spine[0] += 0.08; _reach.spine[1] -= 0.14 * sg;
  _reach.head[0] += 0.1; _reach.head[1] -= 0.16 * sg;
  solvePose(_reach, _gm);
  _v.setFromMatrixPosition(_gm[IDX['shoulder' + side]]);
  _T.set(_v.x - sg * 0.06, _v.y + 0.04, _v.z + 0.56);
  limbIK(_reach, side, 'arm', _T, _P.set(sg * 0.8, -1, -0.2));
  orientHand(_reach, side, _F.set(0, 1, 0.15), _N.set(sg * 0.15, 0, 1));
  for (const k of ['spine', 'head', 'shoulder' + side, 'elbow' + side, 'wrist' + side]) {
    const o = pose[k], r = _reach[k];
    for (let i = 0; i < 3; i++) o[i] += (r[i] - o[i]) * t;
  }
  const hi = side === 'L' ? 0 : 1;
  pose.hand[hi] += (0.18 - pose.hand[hi]) * t;
  return pose;
}

export function poseFor(mode, phase = 0, amount = 1, out) {
  const p = out || neutralPose();
  reset(p);
  const ph = frac(phase), w = TAU * ph, a = amount;
  switch (mode) {
    case 'walk': walk(p, ph, a); break;
    case 'wade': wade(p, ph, a); break;
    case 'climb': climb(p, ph, a); break;
    case 'float': float(p, w, a); break;
    case 'swim': swim(p, w, a); break;
    case 'sit': case 'seat': sit(p, w, a); break;
    case 'lie': lie(p, w, a); break;
    case 'tumble': tumble(p, w, a); break;
    case 'reach': stand(p, w, 0.6); withReach(p, a, 'R'); break;
    default: stand(p, w, a);
  }
  return p;
}

export function poseAtDistance(mode, distance, time = 0, out) {
  const s = STRIDE[mode];
  return poseFor(mode, s ? distance / s : time / (CYCLE[mode] || 6), 1, out);
}

function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z) { return vnoise(x, y, z) * 0.5 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.2; }

function phash(x, y) { const h = Math.sin(x * 157.31 + y * 113.97) * 43758.5453; return h - Math.floor(h); }
function pnoise(x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = k => ((k % P) + P) % P;
  const a = phash(m(xi), m(yi)), b = phash(m(xi + 1), m(yi)), c = phash(m(xi), m(yi + 1)), d = phash(m(xi + 1), m(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function dataTex(data, size) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

let TEX = null, TEXREF = 0;
function acquireTextures(hiRes) {
  TEXREF++;
  if (TEX) return TEX;
  const G = hiRes ? 1024 : 512, gd = new Uint8Array(G * G * 4);
  const streak = new Float32Array(G);
  for (let x = 0; x < G; x++) streak[x] = Math.pow(pnoise(x / G * 128, 0.5, 128), 5);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const u = x / G, v = y / G;
    const n = pnoise(u * 16, v * 16, 16) * 0.35 + pnoise(u * 48, v * 48, 48) * 0.35 + pnoise(u * 160, v * 160, 160) * 0.3;
    const scuff = smooth(0.7, 0.85, pnoise(u * 24 + 3.1, v * 24 + 7.7, 24));
    const drip = streak[x] * smooth(0.3, 0.7, pnoise(u * 16, v * 4, 16));
    const g = clamp(0.93 + 0.07 * n - 0.05 * scuff - 0.1 * drip, 0.78, 1);
    const i = (y * G + x) * 4;
    gd[i] = g * 255; gd[i + 1] = g * 252; gd[i + 2] = g * 244; gd[i + 3] = 255;
  }
  const W = 512, TH = 64, wd = new Uint8Array(W * W * 4), h = new Float32Array(W * W), cs = W / TH;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs), fx = (x % cs) / cs, fy = (y % cs) / cs;
    const over = ((cx + cy) % 3) < 2;
    const prof = over ? Math.sin(PI * fy) : Math.sin(PI * fx);
    h[y * W + x] = Math.pow(Math.max(0, prof), 0.7) * (0.8 + 0.2 * phash(cx, cy)) + (phash(x, y) - 0.5) * 0.12;
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const hx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W];
    const hy = h[((y + 1) % W) * W + x] - h[((y + W - 1) % W) * W + x];
    const nx = -hx * 0.9, ny = -hy * 0.9, l = Math.hypot(nx, ny, 1);
    const i = (y * W + x) * 4;
    wd[i] = (nx / l * 0.5 + 0.5) * 255; wd[i + 1] = (ny / l * 0.5 + 0.5) * 255; wd[i + 2] = (1 / l * 0.5 + 0.5) * 255; wd[i + 3] = 255;
  }
  const grime = dataTex(gd, G); grime.repeat.set(2.2, 2.2);
  const weave = dataTex(wd, W); weave.repeat.set(26, 26);
  TEX = { grime, weave };
  return TEX;
}
function releaseTextures() {
  TEXREF = Math.max(0, TEXREF - 1);
  if (TEXREF === 0 && TEX) { TEX.grime.dispose(); TEX.weave.dispose(); TEX = null; }
}

const ENVS = new WeakMap();
function defaultEnv(renderer) {
  if (!renderer) return null;
  if (ENVS.has(renderer)) return ENVS.get(renderer);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new RoomEnvironment();
  const tex = pm.fromScene(env, 0.04).texture;
  env.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
  pm.dispose();
  ENVS.set(renderer, tex);
  return tex;
}

const ALBEDO = {
  fabric: [0.64, 0.63, 0.6], shell: [0.56, 0.56, 0.55], helmet: [0.7, 0.7, 0.68], dark: [0.045, 0.047, 0.05],
  strap: [0.22, 0.225, 0.23], pad: [0.3, 0.305, 0.31], metal: [0.6, 0.6, 0.6], visor: [0.03, 0.03, 0.032], glove: [0.42, 0.42, 0.41],
  rubber: [0.03, 0.03, 0.03], patch: [0.015, 0.025, 0.06], device: [0.07, 0.075, 0.08], skin: [0.36, 0.24, 0.18], cap: [0.06, 0.055, 0.05],
};
const RM = {
  fabric: [0.92, 0], shell: [0.5, 0], helmet: [0.32, 0], dark: [0.86, 0], strap: [0.7, 0], pad: [0.6, 0], metal: [0.32, 1], visor: [0.06, 0.6],
  glove: [0.88, 0], rubber: [0.75, 0], patch: [0.6, 0], device: [0.35, 0.2], skin: [0.6, 0], cap: [0.8, 0],
};

export function createLightRig() {
  return {
    uRoomOn: { value: 0 }, uSceneK: { value: 1 }, uSpecK: { value: 1 }, uRoomGain: { value: 1 },
    uSky: { value: new THREE.Color(0.5, 0.5, 0.5) }, uGround: { value: new THREE.Color(0.1, 0.1, 0.1) },
    uKeyDir: { value: new V3(0.3, 0.9, 0.3).normalize() }, uKeyCol: { value: new THREE.Color(0.6, 0.6, 0.6) }, uWrap: { value: 0.6 },
    uLamp: { value: new THREE.Vector4(0, 0, 0, 0) }, uLampCol: { value: new THREE.Color(0, 0, 0) },
  };
}

const setCol = (c, v) => { if (v == null) return; if (Array.isArray(v)) c.setRGB(v[0], v[1], v[2]); else if (v.isColor) c.copy(v); else c.set(v); };
export function applyLight(U, L = {}) {
  if (L.off) { U.uRoomOn.value = 0; U.uSceneK.value = 1; return; }
  U.uRoomOn.value = 1;
  U.uSceneK.value = L.sceneLights ?? 0;
  if (L.specular != null) U.uSpecK.value = L.specular;
  if (L.gain != null) U.uRoomGain.value = L.gain;
  const amb = L.ambient || {};
  setCol(U.uSky.value, L.sky ?? amb.sky ?? (amb.isColor || Array.isArray(amb) ? amb : null));
  setCol(U.uGround.value, L.ground ?? amb.ground ?? (amb.isColor || Array.isArray(amb) ? amb : null));
  const key = L.key || {};
  const kd = L.keyDir ?? key.dir;
  if (kd) { if (Array.isArray(kd)) U.uKeyDir.value.set(kd[0], kd[1], kd[2]); else U.uKeyDir.value.copy(kd); U.uKeyDir.value.normalize(); }
  setCol(U.uKeyCol.value, L.keyColor ?? key.color);
  if (L.wrap != null) U.uWrap.value = L.wrap;
  const lamp = L.lamp;
  if (lamp === null || lamp === false) U.uLamp.value.w = 0;
  else if (lamp) {
    if (lamp.isVector4) U.uLamp.value.copy(lamp);
    else if (Array.isArray(lamp)) U.uLamp.value.set(lamp[0], lamp[1], lamp[2], lamp[3] ?? 2.5);
    else {
      const pos = lamp.position || lamp.pos;
      if (pos) { if (Array.isArray(pos)) U.uLamp.value.set(pos[0], pos[1], pos[2], U.uLamp.value.w); else U.uLamp.value.set(pos.x, pos.y, pos.z, U.uLamp.value.w); }
      if (lamp.radius != null) U.uLamp.value.w = lamp.radius;
      setCol(U.uLampCol.value, lamp.color);
    }
  }
  setCol(U.uLampCol.value, L.lampColor);
}
export function applyLightFromRoom(U, room, extra = {}) {
  U.uRoomOn.value = 1; U.uSceneK.value = extra.sceneLights ?? 0;
  U.uSky.value.copy(room.uSky.value); U.uGround.value.copy(room.uGround.value);
  U.uKeyDir.value.copy(room.uKeyDir.value).normalize(); U.uKeyCol.value.copy(room.uKeyCol.value);
  U.uWrap.value = room.uWrap.value;
  U.uLamp.value.copy(room.uLamp.value); U.uLampCol.value.copy(room.uLampCol.value);
  U.uRoomGain.value = extra.gain ?? ((room.uFade ? room.uFade.value : 1) * (room.uLevel ? room.uLevel.value : 1));
}

const ROOM_UNIFORMS = 'uniform float uRoomOn, uSceneK, uSpecK, uRoomGain, uWrap;\nuniform vec3 uSky, uGround, uKeyDir, uKeyCol, uLampCol;\nuniform vec4 uLamp;\nvarying vec3 vRoomW;';
function injectRoom(mat, U, x = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, x.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomW;\n' + (x.vDecl || ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 rw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    rw = instanceMatrix * rw;
  #endif
    vRoomW = (modelMatrix * rw).xyz; }
  ${x.vMain || ''}`);
    let f = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ROOM_UNIFORMS + '\n' + (x.fDecl || ''))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.directDiffuse *= uSceneK; reflectedLight.directSpecular *= uSceneK;
  if (uRoomOn > 0.5) {
    vec3 nW = inverseTransformDirection(normal, viewMatrix);
    float kd = max(0.0, (dot(nW, uKeyDir) + uWrap) / (1.0 + uWrap));
    vec3 hemi = mix(uGround, uSky, nW.y * 0.5 + 0.5);
    vec3 ld = uLamp.xyz - vRoomW; float r2 = dot(ld, ld);
    vec3 lw = ld * inversesqrt(r2 + 1e-4);
    float lp = uLamp.w > 0.0 ? (max(0.0, dot(nW, lw)) * 0.75 + 0.25) / (1.0 + r2 / (uLamp.w * uLamp.w)) : 0.0;
    reflectedLight.indirectDiffuse += material.diffuseColor * (hemi + uKeyCol * kd + uLampCol * lp) * uRoomGain;
    vec3 kV = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
    vec3 lV = normalize((viewMatrix * vec4(lw, 0.0)).xyz);
    reflectedLight.directSpecular += uSpecK * uRoomGain * (uKeyCol * saturate(dot(normal, kV)) * BRDF_GGX(kV, geometryViewDir, normal, material) + uLampCol * lp * saturate(dot(normal, lV)) * BRDF_GGX(lV, geometryViewDir, normal, material));
  }
  ${x.fLights || ''}`);
    if (x.fReplace) for (const [a, b] of x.fReplace) f = f.replace(a, b);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'astro_room_' + (x.key || 'std');
  return mat;
}

function heroMaterials(tex, U, env) {
  const C = k => new THREE.Color(...ALBEDO[k]);
  const ns = new THREE.Vector2(0.22, 0.22);
  const M = (k, o) => injectRoom(new THREE.MeshStandardMaterial({ name: 'astro_' + k, color: C(k), vertexColors: true, roughness: RM[k][0], metalness: RM[k][1], envMap: env, envMapIntensity: 0.6, ...o }), U);
  const visor = injectRoom(new THREE.MeshStandardMaterial({
    name: 'astro_visor', color: new THREE.Color(0.012, 0.012, 0.013), roughness: 0.04, metalness: 0, envMap: env, envMapIntensity: 1,
    transparent: true, opacity: 0.5, depthWrite: false,
  }), U, {
    key: 'visor',
    fLights: 'reflectedLight.indirectSpecular *= 2.2; reflectedLight.directSpecular *= 2.0;',
    fReplace: [['#include <opaque_fragment>', 'float vfr = pow(1.0 - saturate(dot(normal, geometryViewDir)), 2.5);\ndiffuseColor.a = mix(diffuseColor.a, 0.97, vfr);\n#include <opaque_fragment>']],
  });
  visor.renderOrder = 2;
  return {
    fabric: M('fabric', { map: tex.grime, normalMap: tex.weave, normalScale: ns }),
    shell: M('shell', { map: tex.grime }),
    helmet: M('helmet', { map: tex.grime }),
    dark: M('dark', { normalMap: tex.weave, normalScale: ns }),
    strap: M('strap', { normalMap: tex.weave, normalScale: ns }),
    pad: M('pad', { map: tex.grime }),
    metal: M('metal', {}),
    visor,
    glove: M('glove', { map: tex.grime, normalMap: tex.weave, normalScale: ns }),
    rubber: M('rubber', {}),
    patch: M('patch', {}),
    device: M('device', {}),
    skin: M('skin', {}),
    cap: M('cap', {}),
  };
}

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const FIELDS = ['rx', 'f', 'b', 'cx', 'cz', 'n'];
function normKeys(keys) {
  return keys.map(k => {
    const rx = k.rx ?? k.r;
    return { y: k.y, rx, f: k.f ?? rx, b: k.b ?? rx, cx: k.cx || 0, cz: k.cz || 0, n: k.n || 2 };
  }).sort((a, b) => a.y - b.y);
}
function prof(keys, y, o) {
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1].y) i++;
  const k1 = keys[i], k2 = keys[i + 1], k0 = keys[i - 1] || k1, k3 = keys[i + 2] || k2;
  const t = clamp((y - k1.y) / (k2.y - k1.y), 0, 1);
  for (const f of FIELDS) o[f] = cr(k0[f], k1[f], k2[f], k3[f], t);
  o.rx = Math.max(o.rx, 0.0005); o.f = Math.max(o.f, 0.0005); o.b = Math.max(o.b, 0.0005); o.n = Math.max(o.n, 1.6);
  return o;
}
function ringXZ(pr, th, off, out) {
  const c = Math.cos(th), s = Math.sin(th), e = 2 / pr.n;
  const xx = Math.sign(c) * Math.pow(Math.abs(c), e), zz = Math.sign(s) * Math.pow(Math.abs(s), e);
  const rz = s >= 0 ? pr.f : pr.b, g = pr.n - 1;
  let nx = Math.sign(xx) * Math.pow(Math.abs(xx), g) / pr.rx, nz = Math.sign(zz) * Math.pow(Math.abs(zz), g) / rz;
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  out.x = pr.cx + pr.rx * xx + nx * off; out.z = pr.cz + rz * zz + nz * off; out.nx = nx; out.nz = nz;
  return out;
}

function geoFrom(pos, uv, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function pushCol(col, ao, pc) {
  const r = typeof pc === 'number' ? [pc, pc, pc] : pc;
  col.push(ao * r[0], ao * (0.985 + 0.015 * ao) * r[1], ao * (0.93 + 0.07 * ao) * r[2]);
}

function tube(keysRaw, o) {
  const keys = normKeys(keysRaw), seg = o.seg;
  const y0 = keys[0].y, y1 = keys[keys.length - 1].y;
  const ys = [];
  for (let y = y0; y < y1 - 1e-6;) {
    ys.push(y);
    const fz = o.fineStep && o.fine && o.fine.some(z => y >= z[0] - 1e-6 && y < z[1]);
    y += fz ? o.fineStep : o.step;
  }
  ys.push(y1);
  const ravg = keys.reduce((s, k) => s + k.rx, 0) / keys.length;
  const pos = [], uv = [], col = [], idx = [], pr = {}, pt = {};
  for (const y of ys) {
    prof(keys, y, pr);
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * TAU;
      ringXZ(pr, th, 0, pt);
      const d = o.disp ? o.disp(th, y) : 0;
      pos.push(pt.x - pt.nx * d, y, pt.z - pt.nz * d);
      uv.push(th * ravg, y);
      pushCol(col, 1 - Math.min(1, Math.max(0, d) / 0.0055) * 0.38, o.paint ? o.paint(th, y) : 1);
    }
  }
  const R = seg + 1;
  for (let j = 0; j < ys.length - 1; j++) for (let k = 0; k < seg; k++) {
    const a = j * R + k, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = geoFrom(pos, uv, col, idx);
  const n = g.attributes.normal;
  for (let j = 0; j < ys.length; j++) {
    const a = j * R, b = a + seg;
    _v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, _v.x, _v.y, _v.z); n.setXYZ(b, _v.x, _v.y, _v.z);
  }
  return g;
}

const edgeProf = e => (e <= 0 ? 0 : e >= 1 ? 1 : Math.sqrt(1 - (1 - e) * (1 - e)));

function patch(surf, o) {
  const { u0, u1, cols, rows } = o;
  const M = o.M ?? 3, Mu = o.wrapU ? 0 : M, Mv = M;
  const mu = o.mu ?? 0.05, mv = o.mv ?? 0.008, thick = o.thick ?? 0.01, sink = o.sink ?? 0.003;
  const NI = cols + 2 * Mu, NJv = rows + 2 * Mv;
  const pos = [], uv = [], col = [], idx = [];
  const P = [];
  for (let i = 0; i <= NI; i++) {
    const ii = i - Mu;
    let u, eu;
    if (ii < 0) { u = u0 - mu * (-ii / Mu); eu = 1 + ii / Mu; }
    else if (ii > cols) { u = u1 + mu * ((ii - cols) / Mu); eu = 1 - (ii - cols) / Mu; }
    else { u = u0 + (u1 - u0) * ii / cols; eu = 1; }
    const [v0, v1] = o.vr(clamp(u, Math.min(u0, u1), Math.max(u0, u1)));
    for (let j = 0; j <= NJv; j++) {
      const jj = j - Mv;
      let v, ev;
      if (jj < 0) { v = v0 - mv * (-jj / Mv); ev = 1 + jj / Mv; }
      else if (jj > rows) { v = v1 + mv * ((jj - rows) / Mv); ev = 1 - (jj - rows) / Mv; }
      else { v = v0 + (v1 - v0) * jj / rows; ev = 1; }
      const pf = edgeProf(eu) * edgeProf(ev);
      const bump = o.bump ? o.bump(u, v, eu, ev) : 0;
      const p = surf(u, v, -sink + (thick + sink) * pf + bump * pf);
      pos.push(p[0], p[1], p[2]);
      uv.push(u * (o.ru ?? 0.16), v);
      const pc = o.paint ? o.paint(u, v) : 1;
      pushCol(col, 0.72 + 0.28 * pf, pc);
      P.push(p);
    }
  }
  const S = NJv + 1;
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJv; j++) {
    const a = i * S + j, b = (i + 1) * S + j, c = a + 1, d = b + 1;
    idx.push(a, b, c, c, b, d);
  }
  const ci = Math.floor(NI / 2), cj = Math.floor(NJv / 2);
  const pa = P[ci * S + cj], pb = P[(ci + 1) * S + cj], pc = P[ci * S + cj + 1];
  const nrm = new V3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).cross(new V3(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]));
  const uc = u0 + (u1 - u0) * clamp((ci - Mu) / cols, 0, 1), vv = o.vr(uc), vc = vv[0] + (vv[1] - vv[0]) * clamp((cj - Mv) / rows, 0, 1);
  const q0 = surf(uc, vc, 0), q1 = surf(uc, vc, 0.01);
  if (nrm.dot(new V3(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2])) < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  const g = geoFrom(pos, uv, col, idx);
  if (o.wrapU) {
    const n = g.attributes.normal;
    for (let j = 0; j <= NJv; j++) {
      const a = j, b = NI * S + j;
      _v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, _v.x, _v.y, _v.z); n.setXYZ(b, _v.x, _v.y, _v.z);
    }
  }
  return g;
}

function torsoSurf(keysRaw) {
  const keys = normKeys(keysRaw), pr = {}, pt = {};
  return (th, y, off) => { prof(keys, y, pr); ringXZ(pr, th, off, pt); return [pt.x, y, pt.z]; };
}
function ellipSurf(C, R) {
  return (a, e, off) => {
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    const x = R[0] * sa * ce, y = R[1] * se, z = R[2] * ca * ce;
    let nx = x / (R[0] * R[0]), ny = y / (R[1] * R[1]), nz = z / (R[2] * R[2]);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    return [C[0] + x + nx * off, C[1] + y + ny * off, C[2] + z + nz * off];
  };
}
function frameAt(surf, u, v, off = 0) {
  const p = surf(u, v, off), q = surf(u, v, off + 0.01);
  return { p, n: [(q[0] - p[0]) * 100, (q[1] - p[1]) * 100, (q[2] - p[2]) * 100] };
}

function posUV(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) + p.getZ(i); uv[i * 2 + 1] = p.getY(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function prep(g, shade = 1) {
  if (!g.index) { const n = g.attributes.position.count, a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) posUV(g);
  if (!g.attributes.color) {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    const s = typeof shade === 'number' ? [shade, shade, shade] : shade;
    for (let i = 0; i < n; i++) { c[i * 3] = s[0]; c[i * 3 + 1] = s[1]; c[i * 3 + 2] = s[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  return g;
}
function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  g.applyMatrix4(new THREE.Matrix4().compose(new V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new V3(...s)));
  return g;
}
function onSurf(g, fr, push = 0, up = [0, 1, 0], spin = 0) {
  const Z = new V3(...fr.n).normalize();
  let X = new V3().crossVectors(new V3(...up), Z);
  if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
  X.normalize();
  const Y = new V3().crossVectors(Z, X);
  if (spin) { const q = new THREE.Quaternion().setFromAxisAngle(Z, spin); X.applyQuaternion(q); Y.applyQuaternion(q); }
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  m.setPosition(fr.p[0] + Z.x * push, fr.p[1] + Z.y * push, fr.p[2] + Z.z * push);
  g.applyMatrix4(m);
  return g;
}
function mirrorX(src) {
  const g = src.clone(), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
  const ix = g.index.array;
  for (let t = 0; t < ix.length; t += 3) { const x = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = x; }
  return g;
}
function ribs(y, a, b, period, depth) {
  if (y < a || y > b) return 0;
  const t = (y - a) / period, v = 0.5 + 0.5 * Math.cos(TAU * t);
  const fade = Math.min(1, (y - a) / (period * 0.5), (b - y) / (period * 0.5));
  return depth * Math.pow(v, 4) * Math.max(0, fade);
}
const nribs = (th, y, a, b, period, depth, seed = 0) => {
  const jy = 0.007 * (vnoise(Math.cos(th) * 2.2 + seed, y * 9, Math.sin(th) * 2.2) - 0.5) + 0.0025 * Math.sin(th * 3 + seed);
  const amp = 0.3 + 1.1 * vnoise(Math.cos(th) * 3 + seed, y * 15 + 7, Math.sin(th) * 3);
  return ribs(y + jy, a, b, period * (0.92 + 0.16 * vnoise(seed, y * 4, th)), depth * amp);
};
const seam = (d, w, depth) => depth * Math.exp(-(d / w) * (d / w));
const wrinkle = (th, y, amp, f = 1, s = 0) => amp * (vnoise(Math.cos(th) * 3 * f + s, y * 26 * f, Math.sin(th) * 3 * f) - 0.5) * 2;
const fold = (th, y, c, y0, y1, ang, depth) => {
  if (y < y0 || y > y1) return 0;
  const d = angDiff(th, c);
  if (Math.abs(d) > 1.2) return 0;
  const t = (y - y0) / (y1 - y0);
  let v = 0;
  for (let i = 0; i < 3; i++) v += seam(d - ang * (t - 0.2 - i * 0.3) * 4, 0.12, 1);
  return depth * v * Math.sin(PI * t) * (1 - Math.abs(d) / 1.2);
};
const quilt = (th, y, y0, y1, dy, cols, w, depth) => {
  if (y < y0 || y > y1) return 0;
  const fy = (y - y0) / dy, gy = Math.abs(fy - Math.round(fy)) * dy;
  let d = seam(gy, w, depth);
  for (const c of cols) d = Math.max(d, seam(angDiff(th, c), w * 6, depth));
  return d * smooth(y0, y0 + 0.01, y) * smooth(y1, y1 - 0.01, y);
};

const TORSO = [
  { y: -0.07, rx: 0.178, f: 0.13, b: 0.122, n: 2.4 },
  { y: 0.02, rx: 0.182, f: 0.134, b: 0.124, n: 2.4 },
  { y: 0.14, rx: 0.19, f: 0.142, b: 0.126, n: 2.5 },
  { y: 0.26, rx: 0.2, f: 0.148, b: 0.13, n: 2.6 },
  { y: 0.35, rx: 0.21, f: 0.147, b: 0.132, n: 2.8 },
  { y: 0.42, rx: 0.195, f: 0.132, b: 0.122, n: 2.7 },
  { y: 0.47, rx: 0.155, f: 0.112, b: 0.105, n: 2.4 },
  { y: 0.505, rx: 0.1, f: 0.085, b: 0.085, n: 2.2 },
  { y: 0.52, rx: 0.02, f: 0.02, b: 0.02, n: 2 },
];
const COLLAR = [
  { y: 0.39, rx: 0.13, f: 0.11, b: 0.1 }, { y: 0.43, rx: 0.165, f: 0.158, b: 0.13 }, { y: 0.47, rx: 0.172, f: 0.17, b: 0.14 },
  { y: 0.505, rx: 0.156, f: 0.15, b: 0.142 }, { y: 0.535, rx: 0.135, f: 0.133, b: 0.132 }, { y: 0.545, rx: 0.07 }, { y: 0.55, rx: 0.01 },
];
const PELVIS = [
  { y: -0.15, rx: 0.01, f: 0.01, b: 0.01 },
  { y: -0.14, rx: 0.06, f: 0.05, b: 0.06 },
  { y: -0.12, rx: 0.13, f: 0.09, b: 0.1, n: 2.2 },
  { y: -0.085, rx: 0.18, f: 0.125, b: 0.122, n: 2.4 },
  { y: -0.04, rx: 0.19, f: 0.136, b: 0.124, n: 2.4 },
  { y: 0.04, rx: 0.186, f: 0.135, b: 0.124, n: 2.4 },
  { y: 0.12, rx: 0.165, f: 0.12, b: 0.114, n: 2.4 },
  { y: 0.14, rx: 0.05, f: 0.05, b: 0.05 },
];
const UA = [{ y: -0.345, r: 0.02 }, { y: -0.33, r: 0.058 }, { y: -0.3, r: 0.075 }, { y: -0.22, r: 0.086 }, { y: -0.12, r: 0.096 }, { y: -0.05, r: 0.108 }, { y: 0.0, r: 0.104 }, { y: 0.04, r: 0.092 }, { y: 0.068, r: 0.06 }, { y: 0.082, r: 0.015 }];
const FA = [{ y: -0.305, r: 0.02 }, { y: -0.29, r: 0.05 }, { y: -0.265, r: 0.062 }, { y: -0.2, r: 0.07 }, { y: -0.1, r: 0.078 }, { y: -0.02, r: 0.084 }, { y: 0.03, r: 0.08 }, { y: 0.07, r: 0.05 }, { y: 0.085, r: 0.012 }];
const TH = [{ y: -0.47, r: 0.02 }, { y: -0.455, r: 0.065 }, { y: -0.42, rx: 0.088, f: 0.088, b: 0.086 }, { y: -0.32, rx: 0.1, f: 0.1, b: 0.096 }, { y: -0.15, rx: 0.114, f: 0.114, b: 0.116 }, { y: -0.02, rx: 0.124, f: 0.124, b: 0.126, cx: 0.004 }, { y: 0.06, rx: 0.118, f: 0.116, b: 0.122 }, { y: 0.12, r: 0.045 }];
const SH = [{ y: -0.42, r: 0.02 }, { y: -0.4, r: 0.058 }, { y: -0.36, rx: 0.072, f: 0.074, b: 0.072 }, { y: -0.26, rx: 0.075, f: 0.075, b: 0.083 }, { y: -0.12, rx: 0.088, f: 0.086, b: 0.098 }, { y: -0.02, rx: 0.092, f: 0.094, b: 0.09 }, { y: 0.05, r: 0.082 }, { y: 0.09, r: 0.02 }];
const BT = [{ y: -0.07, rx: 0.077, f: 0.088, b: 0.083 }, { y: 0, rx: 0.086, f: 0.088, b: 0.088 }, { y: 0.11, r: 0.083 }, { y: 0.14, r: 0.079 }, { y: 0.15, r: 0.055 }, { y: 0.155, r: 0.01 }];
const CUFF = [{ y: -0.04, r: 0.05 }, { y: -0.015, r: 0.055 }, { y: 0.015, r: 0.06 }, { y: 0.032, r: 0.066 }, { y: 0.042, r: 0.058 }, { y: 0.046, r: 0.01 }];
const HELM_C = [0, 0.155, 0.012], HELM_R = [0.152, 0.16, 0.163];
const PACK = { c: [0, 0.255, -0.115 - 0.105], s: [0.39, 0.5, 0.21] };

function buildParts(lod) {
  const H = lod.hero;
  const S = n => Math.max(6, Math.round(n * lod.seg));
  const G = n => Math.max(2, Math.round(n * lod.grid));
  const M = H ? 3 : 2;
  const SINK = H ? 0.003 : 0.008;
  const T = { step: lod.step, fineStep: H ? lod.fineStep : 0 };
  const parts = {};
  for (const n of JOINT_NAMES) parts[n] = [];
  const extra = { fingersL: [], fingersR: [], bellows: {} };
  const vols = [];
  const add = (j, mat, g, vol = null) => parts[j].push({ mat, geo: prep(g), vol });
  const both = (jl, jr, mat, g, vol = null) => { const a = prep(g); parts[jl].push({ mat, geo: a, vol }); parts[jr].push({ mat, geo: mirrorX(a), vol: vol ? vol + 'R' : null }); };
  const rb = (w, h, d, r, s = H ? 2 : 1) => posUV(new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
  const cyl = (r0, r1, h, s, open = false) => posUV(new THREE.CylinderGeometry(r0, r1, h, S(s), 1, open));
  const tor = (R, r, s1, s2) => posUV(new THREE.TorusGeometry(R, r, Math.max(4, Math.round(s1 * lod.seg)), S(s2)));
  const pt = (o) => patch(o.surf, { sink: SINK, M, ...o });
  const tubeVol = (id, joint, keys, mirror = false) => {
    const nk = normKeys(keys), pr = {};
    vols.push({ id, joint, test: (x, y, z) => {
      if (mirror) x = -x;
      if (y <= nk[0].y || y >= nk[nk.length - 1].y) return false;
      prof(nk, y, pr);
      const rz = z >= pr.cz ? pr.f : pr.b;
      const m = 0.004;
      const dx = Math.abs(x - pr.cx) / Math.max(1e-3, pr.rx - m), dz = Math.abs(z - pr.cz) / Math.max(1e-3, rz - m);
      return Math.pow(dx, pr.n) + Math.pow(dz, pr.n) < 1;
    } });
  };
  const boxVol = (id, joint, c, s) => vols.push({ id, joint, test: (x, y, z) => Math.abs(x - c[0]) < s[0] / 2 - 0.004 && Math.abs(y - c[1]) < s[1] / 2 - 0.004 && Math.abs(z - c[2]) < s[2] / 2 - 0.004 });
  const ellVol = (id, joint, C, R) => vols.push({ id, joint, test: (x, y, z) => ((x - C[0]) / (R[0] - 0.004)) ** 2 + ((y - C[1]) / (R[1] - 0.004)) ** 2 + ((z - C[2]) / (R[2] - 0.004)) ** 2 < 1 });
  const DARKC = [0.14, 0.14, 0.15];

  const tSurf = torsoSurf(TORSO);
  const sidePanel = (th, y) => {
    const m = Math.max(1 - smooth(0.97, 1.02, Math.abs(angDiff(th, 0))), 1 - smooth(0.97, 1.02, Math.abs(angDiff(th, PI)))) * smooth(0.14, 0.155, y) * smooth(0.5, 0.45, y);
    return [1 - m * (1 - DARKC[0]), 1 - m * (1 - DARKC[1]), 1 - m * (1 - DARKC[2])];
  };
  add('spine', 'fabric', tube(TORSO, {
    seg: S(72), ...T, fine: [[-0.07, 0.11]],
    disp: H ? (th, y) => nribs(th, y, -0.07, 0.1, 0.021, 0.0042, 1)
      + quilt(th, y, 0.11, 0.21, 0.05, [HALF - 0.5, HALF + 0.5, HALF], 0.0035, 0.0018)
      + seam(angDiff(th, 0), 0.03, 0.002) + seam(angDiff(th, PI), 0.03, 0.002)
      + seam(Math.abs(angDiff(th, -HALF)), 0.03, 0.0018) * smooth(0.0, 0.1, y)
      + wrinkle(th, y, 0.0016) + wrinkle(th, y, 0.0008, 3.5, 4) : null,
    paint: sidePanel,
  }), 'torso');
  tubeVol('torso', 'spine', TORSO);
  add('spine', 'dark', tube(COLLAR, { seg: S(56), ...T, disp: H ? (th, y) => wrinkle(th, y, 0.0055, 1.6, 2) + wrinkle(th, y, 0.002, 4, 7) + nribs(th, y, 0.44, 0.53, 0.016, 0.004, 3) : null }), 'collar');
  tubeVol('collar', 'spine', COLLAR);

  const plateVR = (u) => {
    const w = clamp((HALF - u) / 1.0, 0, 1);
    return [0.215 + 0.1 * Math.pow(w, 1.6), 0.428 + 0.04 * smooth(0, 0.55, w) - 0.006 * w];
  };
  const plateBump = (u, v) => { const w = clamp((HALF - u) / 1.0, 0, 1); return 0.006 * Math.sin(PI * clamp(w * 1.05, 0, 1)) * smooth(0.21, 0.3, v); };
  both('spine', 'spine', 'shell', pt({ surf: tSurf, u0: HALF - 1.02, u1: HALF - 0.035, vr: plateVR, cols: G(26), rows: G(14), mu: 0.05, mv: 0.009, thick: 0.024, bump: plateBump }));
  if (H) {
    both('spine', 'spine', 'strap', pt({ surf: tSurf, u0: HALF - 0.95, u1: HALF - 0.12, vr: u => { const r = plateVR(u); return [r[0] + 0.045, r[0] + 0.05]; }, cols: 20, rows: 1, M: 2, mu: 0.02, mv: 0.003, thick: 0.0275, sink: 0.0 }));
  }

  const padC = t => [0.19 - 0.02 * Math.cos(t), 0.36 + 0.126 * Math.cos(t), 0.146 * Math.sin(t)];
  const padSurf = (t, v, off) => {
    const c = padC(t), n = new V3(0.3, Math.cos(t), Math.sin(t) * 1.1).normalize();
    const side = new V3(1, 0, 0).addScaledVector(n, -n.x).normalize();
    return [c[0] + side.x * v + n.x * off, c[1] + side.y * v + n.y * off, c[2] + side.z * v + n.z * off];
  };
  const padVR = t => { const w = 0.056 - 0.008 * Math.pow(t / 1.25, 2); return [-w, w]; };
  both('spine', 'spine', 'dark', pt({ surf: padSurf, u0: -1.25, u1: 1.25, vr: padVR, cols: G(36), rows: G(6), mu: 0.04, mv: 0.006, thick: 0.012, ru: 0.13 }));
  const NSEG = 6;
  for (let i = 0; i < NSEG; i++) {
    const a = -1.18 + (2.36 / NSEG) * i, b = a + (2.36 / NSEG) * 0.66;
    both('spine', 'spine', 'helmet', pt({ surf: padSurf, u0: a, u1: b, vr: t => { const r = padVR(t); return [r[0] + 0.004, r[1] - 0.004]; }, cols: G(4), rows: G(4), M: H ? 2 : 1, mu: 0.015, mv: 0.004, thick: 0.018, sink: 0.001, bump: () => 0.002 }));
  }
  if (H) {
    both('spine', 'spine', 'pad', onSurf(rb(0.074, 0.032, 0.02, 0.005), frameAt(padSurf, 1.24, 0), 0.012, [0, 0, 1]));
    both('spine', 'spine', 'metal', onSurf(rb(0.054, 0.009, 0.01, 0.003), frameAt(padSurf, 1.24, 0), 0.03, [0, 0, 1]));
    for (const t of [-1.0, 1.0]) both('spine', 'spine', 'metal', onSurf(xf(cyl(0.006, 0.006, 0.01, 8), [0, 0, 0], [HALF, 0, 0]), frameAt(padSurf, t, 0.04), 0.016));
  }

  if (H) {
    for (const [y, R, r] of [[0.512, 0.13, 0.013], [0.536, 0.132, 0.011]]) add('spine', 'metal', xf(tor(R, r, 10, 56), [0, y, 0], [HALF, 0, 0], [1, 1, 1.04]));
    add('spine', 'metal', xf(cyl(0.129, 0.129, 0.03, 56, true), [0, 0.524, 0], [0, 0, 0], [1, 1, 1.04]));
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; add('spine', 'metal', xf(rb(0.014, 0.02, 0.01, 0.003), [Math.sin(a) * 0.139, 0.524, Math.cos(a) * 0.144], [0, a, 0])); }
  } else add('spine', 'metal', xf(cyl(0.132, 0.132, 0.045, 10), [0, 0.525, 0]));

  const cb = frameAt(tSurf, HALF + 0.08, 0.125);
  add('spine', 'shell', onSurf(rb(0.088, 0.108, 0.034, 0.008), cb, 0.008));
  if (H) {
    add('spine', 'device', onSurf(rb(0.064, 0.082, 0.01, 0.003), cb, 0.025));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      add('spine', 'helmet', onSurf(xf(rb(0.016, 0.01, 0.012, 0.003), [-0.013 + c * 0.026, 0.026 - r * 0.026, 0]), cb, 0.032));
      add('spine', 'metal', onSurf(xf(cyl(0.003, 0.003, 0.012, 6), [-0.013 + c * 0.026 + 0.009, 0.026 - r * 0.026, 0], [HALF, 0, 0]), cb, 0.034));
    }
    add('spine', 'device', onSurf(rb(0.024, 0.036, 0.014, 0.004), frameAt(tSurf, HALF + 0.52, 0.1), 0.006));
    add('spine', 'shell', onSurf(rb(0.03, 0.016, 0.012, 0.003), frameAt(tSurf, HALF - 0.4, 0.17), 0.004));
    const nasa = frameAt(tSurf, HALF + 0.55, 0.36);
    add('spine', 'patch', onSurf(xf(cyl(0.031, 0.031, 0.004, 32), [0, 0, 0], [HALF, 0, 0]), nasa, 0.0275));
    add('spine', 'helmet', onSurf(tor(0.031, 0.0018, 4, 32), nasa, 0.0295));
    const tag = frameAt(tSurf, HALF - 0.62, 0.3);
    add('spine', 'strap', onSurf(rb(0.064, 0.024, 0.004, 0.0015), tag, 0.026));
    add('spine', 'helmet', onSurf(rb(0.056, 0.016, 0.004, 0.0015), tag, 0.0285));
  }

  const [pcx, pcy, pcz] = PACK.c, [pw, ph, pd] = PACK.s;
  add('spine', 'shell', xf(rb(pw - 0.04, ph - 0.03, pd - 0.03, 0.03), [0, pcy, pcz]), 'pack');
  boxVol('pack', 'spine', [0, pcy, pcz], [pw - 0.04, ph - 0.03, pd - 0.03]);
  add('spine', 'dark', xf(rb(0.3, 0.42, 0.06, 0.02), [0, pcy, -0.105]));
  const fz = pcz - pd / 2 + 0.01;
  for (const y of [pcy - ph / 2 + 0.012, pcy + ph / 2 - 0.012]) add('spine', 'pad', xf(rb(pw, 0.026, pd, 0.008), [0, y, pcz]));
  for (const x of [-pw / 2 + 0.012, pw / 2 - 0.012]) {
    add('spine', 'pad', xf(rb(0.026, ph, pd, 0.008), [x, pcy, pcz]));
    add('spine', 'shell', xf(rb(0.03, ph * 0.7, pd * 0.62, 0.008), [x + Math.sign(x) * 0.012, pcy + 0.02, pcz + 0.01], [0, Math.sign(x) * 0.25, 0]));
  }
  for (const y of [pcy - 0.13, pcy + 0.02, pcy + 0.16]) add('spine', 'strap', xf(rb(pw + 0.012, 0.03, pd + 0.012, 0.01), [0, y, pcz]));
  add('spine', 'helmet', xf(rb(pw - 0.07, ph - 0.12, 0.02, 0.01), [0, pcy + 0.02, fz - 0.004]));
  if (H) {
    add('spine', 'device', xf(rb(0.2, 0.09, 0.012, 0.004), [0, pcy + 0.09, fz - 0.016]));
    add('spine', 'shell', xf(rb(0.24, 0.05, 0.05, 0.012), [0, pcy + ph / 2 + 0.01, pcz + 0.01]));
    for (const x of [-0.14, 0.14]) {
      add('spine', 'metal', xf(cyl(0.024, 0.024, 0.04, 20), [x, pcy + ph / 2 + 0.01, pcz + 0.03]));
      add('spine', 'metal', xf(cyl(0.028, 0.028, 0.012, 20), [x, pcy + ph / 2 + 0.034, pcz + 0.03]));
      add('spine', 'metal', xf(cyl(0.026, 0.026, 0.13, 20), [x * 0.85, pcy - ph / 2 + 0.03, fz - 0.01], [0, 0, HALF]));
    }
    for (let i = 0; i < 8; i++) {
      const x = (i % 4 - 1.5) * 0.08, y = pcy - 0.06 + Math.floor(i / 4) * 0.2;
      add('spine', 'metal', xf(cyl(0.006, 0.006, 0.008, 8), [x, y, fz - 0.016], [HALF, 0, 0]));
    }
    for (const sx of [-1, 1]) {
      const hose = new THREE.CatmullRomCurve3([new V3(sx * 0.14, pcy + ph / 2 + 0.04, pcz + 0.03), new V3(sx * 0.15, pcy + ph / 2 + 0.11, pcz + 0.06), new V3(sx * 0.13, 0.575, -0.09), new V3(sx * 0.09, 0.548, -0.11)]);
      add('spine', 'rubber', posUV(new THREE.TubeGeometry(hose, 28, 0.013, 10, false)));
    }
    const hose2 = new THREE.CatmullRomCurve3([new V3(-0.15, 0.08, pcz + 0.05), new V3(-0.2, 0.05, -0.08), new V3(-0.19, 0.05, 0.05), new V3(-0.12, 0.08, 0.13)]);
    add('spine', 'rubber', posUV(new THREE.TubeGeometry(hose2, 24, 0.009, 8, false)));
  }

  const pSurf = torsoSurf(PELVIS);
  add('pelvis', 'fabric', tube(PELVIS, {
    seg: S(60), ...T,
    disp: H ? (th, y) => seam(angDiff(th, HALF), 0.025, 0.0025) * smooth(0.0, -0.05, y) + seam(angDiff(th, -HALF), 0.022, 0.003) * smooth(0, -0.05, y)
      + seam(Math.abs(y + 0.02), 0.004, 0.0018) + seam(Math.abs(y + 0.075), 0.004, 0.0018) * (1 - smooth(0.8, 1.3, Math.abs(angDiff(th, -HALF)))) + wrinkle(th, y, 0.0018, 1.2) : null,
  }), 'pelvis');
  tubeVol('pelvis', 'pelvis', PELVIS);
  add('pelvis', 'shell', pt({ surf: pSurf, u0: 0, u1: TAU, wrapU: true, vr: () => [0.026, 0.074], cols: S(64), rows: G(4), mv: 0.006, thick: 0.012, ru: 0.17 }));
  for (const sgn of [1, -1]) {
    const fr = frameAt(pSurf, HALF - sgn * 0.85, 0.05);
    add('pelvis', 'shell', onSurf(rb(0.078, 0.058, 0.05, 0.01), fr, 0.03));
    if (H) {
      add('pelvis', 'metal', onSurf(rb(0.05, 0.016, 0.012, 0.004), fr, 0.056));
      add('pelvis', 'strap', onSurf(rb(0.082, 0.012, 0.054, 0.004), fr, 0.03));
    }
  }
  add('pelvis', 'shell', onSurf(rb(0.22, 0.072, 0.062, 0.012), frameAt(pSurf, -HALF, 0.04), 0.035));
  if (H) for (const x of [-0.07, 0.07]) add('pelvis', 'metal', onSurf(xf(cyl(0.012, 0.012, 0.02, 12), [x, 0, 0], [HALF, 0, 0]), frameAt(pSurf, -HALF, 0.04), 0.07));

  const outerMask = th => smooth(0.45, 0.9, 0.5 + 0.5 * Math.cos(th + 0.25 * Math.sin(th * 2)));
  both('shoulderL', 'shoulderR', 'fabric', tube(UA, {
    seg: S(48), ...T, fine: [[-0.25, 0.06]],
    disp: H ? (th, y) => nribs(th, y, -0.24, -0.06, 0.021, 0.0042, 5) * outerMask(th) + nribs(th, y, -0.03, 0.045, 0.018, 0.0045, 6) * (0.25 + 0.75 * outerMask(th - 0.4))
      + fold(th, y, PI - 0.3, -0.29, -0.16, 0.5, 0.004) + seam(angDiff(th, HALF), 0.04, 0.0018) + wrinkle(th, y, 0.002, 1.4, 5) + wrinkle(th, y, 0.0009, 3.6, 8) : null,
    paint: (th, y) => { const m = (1 - smooth(0.85, 1.25, Math.abs(angDiff(th, PI - 0.6)))) * smooth(-0.27, -0.17, y) * smooth(0.075, 0.045, y); return [1 - m * 0.93, 1 - m * 0.93, 1 - m * 0.925]; },
  }), 'ua');
  tubeVol('ua', 'shoulderL', UA); tubeVol('uaR', 'shoulderR', UA, true);
  const uaSurf = torsoSurf(UA);
  if (H) {
    add('shoulderL', 'strap', pt({ surf: uaSurf, u0: 0.15, u1: 0.75, vr: () => [-0.08, -0.03], cols: 8, rows: 4, M: 2, mu: 0.03, mv: 0.004, thick: 0.005 }));
    const pk = frameAt(uaSurf, 0.35, -0.16);
    parts.shoulderR.push({ mat: 'shell', geo: mirrorX(prep(onSurf(rb(0.07, 0.09, 0.03, 0.008), pk, 0.008))) });
    parts.shoulderR.push({ mat: 'shell', geo: mirrorX(prep(onSurf(xf(rb(0.074, 0.03, 0.012, 0.004), [0, 0.034, 0], [-0.15, 0, 0]), pk, 0.027))) });
  }

  both('elbowL', 'elbowR', 'fabric', tube(FA, {
    seg: S(44), ...T, fine: [[-0.22, 0.045]],
    disp: H ? (th, y) => nribs(th, y, -0.07, 0.04, 0.018, 0.005, 9) + nribs(th, y, -0.21, -0.08, 0.02, 0.003, 10) * outerMask(th)
      + fold(th, y, HALF + 0.4, -0.02, 0.07, -0.6, 0.004) + seam(angDiff(th, HALF + 0.3), 0.04, 0.0016) + wrinkle(th, y, 0.002, 1.5, 9) : null,
  }), 'fa');
  tubeVol('fa', 'elbowL', FA); tubeVol('faR', 'elbowR', FA, true);
  both('elbowL', 'elbowR', 'metal', xf(cyl(0.067, 0.067, 0.032, 40, true), [0, -0.262, 0]));
  if (H) for (const y of [-0.246, -0.278]) both('elbowL', 'elbowR', 'metal', xf(tor(0.067, 0.005, 6, 40), [0, y, 0], [HALF, 0, 0]));
  const faSurf = torsoSurf(FA);
  const dv = frameAt(faSurf, 0.2, -0.165);
  add('elbowL', 'shell', onSurf(rb(0.06, 0.09, 0.034, 0.008), dv, 0.012));
  if (H) {
    add('elbowL', 'device', onSurf(rb(0.044, 0.056, 0.006, 0.002), dv, 0.03));
    for (let i = 0; i < 3; i++) add('elbowL', 'helmet', onSurf(xf(rb(0.008, 0.008, 0.006, 0.002), [0.024, -0.03 + i * 0.015, 0]), dv, 0.03));
    for (const y of [-0.13, -0.2]) add('elbowL', 'strap', pt({ surf: faSurf, u0: 0, u1: TAU, wrapU: true, vr: () => [y - 0.008, y + 0.008], cols: 40, rows: 2, M: 2, mv: 0.003, thick: 0.005 }));
  }

  const glove = [];
  const gl = (g) => glove.push(xf(g, [0, 0, 0], [0, 0, 0], [GS, GS, GS]));
  gl(tube(CUFF.map(k => ({ ...k, y: k.y - 0.01 })), { seg: S(40), ...T, fine: [[-0.045, 0.03]], disp: H ? (th, y) => nribs(th, y, -0.045, 0.0, 0.011, 0.0028, 12) + wrinkle(th, y, 0.0012, 2, 3) : null }));
  gl(xf(rb(0.05, 0.1, 0.09, 0.02), [-0.004, -0.095, 0.002]));
  if (H) {
    const tb = new V3(-0.016, -0.058, 0.044), tq = new THREE.Euler(-0.65, 0, -0.55);
    gl(xf(xf(new THREE.CapsuleGeometry(0.0135, 0.032, 3, 10), [0, -0.016, 0]), [tb.x, tb.y, tb.z], [tq.x, tq.y, tq.z]));
    const tt = new V3(0, -0.032, 0).applyEuler(tq).add(tb);
    gl(xf(xf(new THREE.CapsuleGeometry(0.0125, 0.026, 3, 10), [0, -0.013, 0]), [tt.x, tt.y, tt.z], [tq.x - 0.25, 0, tq.z - 0.45]));
    gl(xf(rb(0.012, 0.06, 0.07, 0.005), [0.027, -0.09, 0.0]));
  }
  for (const g of glove) both('wristL', 'wristR', 'glove', g);
  const KN = [-0.004 * GS, -0.142 * GS, 0];
  const fingerGeo = (hi) => {
    const out = [];
    const fzs = [-0.031, -0.0105, 0.0105, 0.031], fl = [0.064, 0.074, 0.08, 0.074];
    for (let i = 0; i < 4; i++) {
      const L1 = fl[i] * 0.55, L2 = fl[i] * 0.45, r = 0.0105, c1 = -0.55 - i * 0.04, c2 = -0.85;
      const base = new V3(0, 0, fzs[i]);
      out.push(xf(xf(new THREE.CapsuleGeometry(r, L1, hi ? 3 : 1, hi ? 10 : 5), [0, -L1 / 2, 0]), [base.x, base.y, base.z], [0, 0, c1]));
      const tip = new V3(Math.sin(c1) * L1, -Math.cos(c1) * L1, 0).add(base);
      out.push(xf(xf(new THREE.CapsuleGeometry(r * 0.94, L2, hi ? 3 : 1, hi ? 10 : 5), [0, -L2 / 2, 0]), [tip.x, tip.y, tip.z], [0, 0, c1 + c2]));
    }
    return out.map(g => xf(g, [0, 0, 0], [0, 0, 0], [GS, GS, GS]));
  };
  if (H) {
    for (const g of fingerGeo(true)) { const a = prep(g); extra.fingersL.push({ mat: 'glove', geo: a }); extra.fingersR.push({ mat: 'glove', geo: mirrorX(a) }); }
  } else {
    for (const g of fingerGeo(false)) both('wristL', 'wristR', 'glove', xf(g, KN));
  }
  vols.push({ id: 'palm', joint: 'wristL', test: (x, y, z) => Math.abs(x + 0.004 * GS) < 0.025 * GS - 0.004 && Math.abs(y + 0.095 * GS) < 0.05 * GS - 0.004 && Math.abs(z) < 0.045 * GS - 0.004 });
  vols.push({ id: 'palmR', joint: 'wristR', test: (x, y, z) => Math.abs(-x + 0.004 * GS) < 0.025 * GS - 0.004 && Math.abs(y + 0.095 * GS) < 0.05 * GS - 0.004 && Math.abs(z) < 0.045 * GS - 0.004 });

  both('hipL', 'hipR', 'fabric', tube(TH, {
    seg: S(52), ...T,
    disp: H ? (th, y) => seam(angDiff(th, HALF - 0.45), 0.035, 0.0022) * smooth(0.05, 0.0, y) + seam(angDiff(th, HALF + 0.45), 0.035, 0.0022) * smooth(0.05, 0.0, y)
      + seam(Math.abs(y + 0.3), 0.004, 0.0018) + quilt(th, y, -0.28, -0.06, 0.055, [], 0.003, 0.0014) * (1 - smooth(0.6, 1.0, Math.abs(angDiff(th, HALF))))
      + fold(th, y, -HALF, -0.44, -0.3, 0.5, 0.0035) + wrinkle(th, y, 0.0028, 1.2, 13) + wrinkle(th, y, 0.0012, 3, 2) : null,
  }), 'th');
  tubeVol('th', 'hipL', TH); tubeVol('thR', 'hipR', TH, true);
  const thSurf = torsoSurf(TH);
  if (H) {
    const hf = frameAt(thSurf, 0.25, -0.15);
    add('hipL', 'strap', onSurf(rb(0.06, 0.16, 0.03, 0.008), hf, 0.004));
    add('hipL', 'metal', onSurf(xf(rb(0.028, 0.15, 0.03, 0.008), [0, -0.01, 0]), hf, 0.03));
    add('hipL', 'device', onSurf(xf(rb(0.034, 0.05, 0.05, 0.006), [0, 0.08, 0.012]), hf, 0.03));
    for (const y of [-0.09, -0.21]) add('hipL', 'dark', pt({ surf: thSurf, u0: 0, u1: TAU, wrapU: true, vr: () => [y - 0.009, y + 0.009], cols: 48, rows: 2, M: 2, mv: 0.003, thick: 0.006 }));
  }

  both('kneeL', 'kneeR', 'fabric', tube(SH, {
    seg: S(48), ...T, fine: [[-0.07, 0.045]],
    disp: H ? (th, y) => nribs(th, y, -0.07, 0.045, 0.019, 0.005, 15) + fold(th, y, -HALF, -0.02, 0.07, 0.6, 0.004) + seam(angDiff(th, -HALF), 0.04, 0.002) * smooth(-0.08, -0.12, y)
      + seam(angDiff(th, HALF + 0.5), 0.035, 0.0018) * smooth(-0.1, -0.14, y) + wrinkle(th, y, 0.002, 1.3, 17) : null,
  }), 'sh');
  tubeVol('sh', 'kneeL', SH); tubeVol('shR', 'kneeR', SH, true);
  const shSurf = torsoSurf(SH);
  both('kneeL', 'kneeR', 'shell', pt({
    surf: shSurf, u0: HALF - 0.95, u1: HALF + 0.95, cols: G(18), rows: G(12), mu: 0.08, mv: 0.01, thick: 0.022,
    vr: u => { const w = Math.abs(u - HALF) / 0.95, h = 0.072 * (1 - 0.35 * w * w); return [-0.03 - h, -0.03 + h]; },
    bump: (u, v) => 0.008 * Math.cos(clamp((u - HALF) / 0.95, -1, 1) * HALF) * Math.cos(clamp((v + 0.03) / 0.075, -1, 1) * HALF),
  }));
  if (H) both('kneeL', 'kneeR', 'strap', pt({ surf: shSurf, u0: 0, u1: TAU, wrapU: true, vr: () => [-0.15, -0.135], cols: 48, rows: 2, M: 2, mv: 0.003, thick: 0.006 }));

  both('ankleL', 'ankleR', 'shell', tube(BT, { seg: S(44), ...T, fine: [[0.06, 0.13]], disp: H ? (th, y) => nribs(th, y, 0.07, 0.13, 0.014, 0.003, 18) + wrinkle(th, y, 0.0014, 1, 21) : null }), 'bt');
  tubeVol('bt', 'ankleL', BT); tubeVol('btR', 'ankleR', BT, true);
  const btSurf = torsoSurf(BT);
  both('ankleL', 'ankleR', 'strap', pt({ surf: btSurf, u0: 0, u1: TAU, wrapU: true, vr: () => [0.025, 0.05], cols: S(44), rows: G(2), mv: 0.004, thick: 0.007 }));
  if (H) both('ankleL', 'ankleR', 'metal', onSurf(rb(0.03, 0.022, 0.012, 0.004), frameAt(btSurf, 0.3, 0.037), 0.008));
  const foot = new RoundedBoxGeometry(0.132, 0.088, 0.3, H ? 4 : 1, 0.034);
  const fp = foot.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const z = fp.getZ(i), y = fp.getY(i), x = fp.getX(i), t = smooth(-0.04, 0.15, z);
    if (y > 0) fp.setY(i, y - y * t * 0.5);
    fp.setX(i, x * (1 - 0.12 * t));
  }
  foot.computeVertexNormals();
  both('ankleL', 'ankleR', 'shell', xf(posUV(foot), [0, -0.05, 0.05]));
  both('ankleL', 'ankleR', 'rubber', xf(rb(0.14, 0.03, 0.316, 0.009, H ? 2 : 1), [0, -0.084, 0.05]));
  if (H) for (let i = 0; i < 8; i++) both('ankleL', 'ankleR', 'rubber', xf(rb(0.128, 0.007, 0.018, 0.002, 1), [0, -0.099, -0.09 + i * 0.04]));
  vols.push({ id: 'foot', joint: 'ankleL', test: (x, y, z) => Math.abs(x) < 0.055 && y > -0.088 && y < -0.012 && z > -0.09 && z < 0.18 });
  vols.push({ id: 'footR', joint: 'ankleR', test: (x, y, z) => Math.abs(x) < 0.055 && y > -0.088 && y < -0.012 && z > -0.09 && z < 0.18 });

  const C = HELM_C, R = HELM_R;
  const hS = ellipSurf(C, R);
  const ECUT = -0.82;
  const A = 1.4, E0 = -0.15, E = 0.64, NX = 3.2;
  const shell = new THREE.SphereGeometry(1, S(76), S(44), 0, TAU, 0, HALF - ECUT);
  {
    const sp = shell.attributes.position, si = shell.index.array, keep = [];
    for (let t = 0; t < si.length; t += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { x += sp.getX(si[t + k]); y += sp.getY(si[t + k]); z += sp.getZ(si[t + k]); }
      const l = Math.hypot(x, y, z) || 1, a = Math.atan2(x / l, z / l), e = Math.asin(clamp(y / l, -1, 1));
      if (Math.pow(Math.abs(a / (A - 0.04)), NX) + Math.pow(Math.abs((e - E0) / (E - 0.04)), NX) >= 1) keep.push(si[t], si[t + 1], si[t + 2]);
    }
    shell.setIndex(keep);
  }
  xf(shell, C, [0, 0, 0], R);
  add('head', 'helmet', posUV(shell), 'helm');
  if (H) { const liner = new THREE.SphereGeometry(1, S(48), S(28), 0, TAU, 0, HALF - ECUT + 0.05); xf(liner, C, [0, 0, 0], [R[0] - 0.012, R[1] - 0.012, R[2] - 0.012]); const li = liner.index.array; for (let t = 0; t < li.length; t += 3) { const x = li[t + 1]; li[t + 1] = li[t + 2]; li[t + 2] = x; } const ln = liner.attributes.normal; for (let i = 0; i < ln.count; i++) ln.setXYZ(i, -ln.getX(i), -ln.getY(i), -ln.getZ(i)); add('head', 'cap', posUV(liner)); }
  ellVol('helm', 'head', C, R);
  const vis = [], vuv = [], vcol = [], vidx = [], VC = H ? 40 : 6;
  const sq = (u, v) => {
    const ang = Math.atan2(v, u), s = Math.max(Math.abs(u), Math.abs(v));
    const c = Math.cos(ang), sn = Math.sin(ang);
    const rho = Math.pow(Math.pow(Math.abs(c), NX) + Math.pow(Math.abs(sn), NX), -1 / NX);
    return [s * rho * c, s * rho * sn, s];
  };
  for (let i = 0; i <= VC; i++) for (let j = 0; j <= VC; j++) {
    const [px, py, s] = sq(-1 + 2 * i / VC, -1 + 2 * j / VC);
    const p = hS(A * px, E0 + E * py, 0.007 + 0.012 * (1 - s * s));
    vis.push(...p); vuv.push(i / VC, j / VC); vcol.push(1, 1, 1);
  }
  for (let i = 0; i < VC; i++) for (let j = 0; j < VC; j++) {
    const a = i * (VC + 1) + j, b = a + VC + 1;
    vidx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  add('head', 'visor', geoFrom(vis, vuv, vcol, vidx));
  const rimPts = [], chinPts = [];
  for (let k = 0; k < 96; k++) {
    const ang = k / 96 * TAU, c = Math.cos(ang), sn = Math.sin(ang);
    const rho = Math.pow(Math.pow(Math.abs(c), NX) + Math.pow(Math.abs(sn), NX), -1 / NX);
    const a = A * rho * c, e = E0 + E * rho * sn;
    rimPts.push(new V3(...hS(a, e, 0.009)));
    if (sn < -0.3) chinPts.push(new V3(...hS(a, e - 0.035, 0.006)));
  }
  add('head', 'helmet', posUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), H ? 120 : 24, 0.0075, H ? 8 : 4, true)));
  chinPts.sort((p, q) => p.x - q.x);
  if (chinPts.length > 3) add('head', 'metal', posUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chinPts), H ? 64 : 10, 0.009, H ? 10 : 4, false)));
  const BW = 1.7;
  const bandLow = a => E0 + E + 0.035 - 0.42 * Math.pow(Math.abs(a) / BW, 3);
  const bandVR = a => { const l = bandLow(a); return [l, l + 0.24 - 0.11 * Math.pow(a / BW, 2)]; };
  add('head', 'dark', pt({ surf: hS, u0: -BW, u1: BW, cols: G(56), rows: G(8), mu: 0.05, mv: 0.035, thick: 0.017, vr: bandVR, bump: (a, e) => 0.003 * Math.sin(PI * clamp((e - bandLow(a)) / 0.24, 0, 1)) }));
  if (H) {
    const lipPts = [];
    for (let k = 0; k <= 48; k++) { const a = -BW + 2 * BW * k / 48; lipPts.push(new V3(...hS(a, bandLow(a) - 0.012, 0.012))); }
    add('head', 'helmet', posUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPts), 64, 0.006, 6, false)));
    const topPts = [];
    for (let k = 0; k <= 48; k++) { const a = -BW + 2 * BW * k / 48; topPts.push(new V3(...hS(a, bandVR(a)[1] + 0.01, 0.013))); }
    add('head', 'helmet', posUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPts), 64, 0.005, 6, false)));
  }
  add('head', 'helmet', pt({ surf: hS, u0: -0.18, u1: 0.18, cols: G(8), rows: G(4), mu: 0.03, mv: 0.02, thick: 0.022, vr: () => [bandLow(0) + 0.03, bandLow(0) + 0.14] }));
  for (const o of [-0.13, 0.13]) add('head', 'dark', pt({ surf: hS, u0: PI + o - 0.035, u1: PI + o + 0.035, cols: G(2), rows: G(20), mu: 0.02, mv: 0.03, thick: 0.007, vr: () => [-0.5, 0.95 - Math.abs(o)] }));
  for (const sgn of [1, -1]) {
    const fr = frameAt(hS, sgn * 1.86, 0.12);
    add('head', 'helmet', onSurf(xf(cyl(0.062, 0.066, 0.03, 48), [0, 0, 0], [HALF, 0, 0]), fr, 0.006));
    if (H) {
      add('head', 'metal', onSurf(tor(0.049, 0.006, 8, 48), fr, 0.022));
      add('head', 'strap', onSurf(xf(cyl(0.04, 0.04, 0.012, 40), [0, 0, 0], [HALF, 0, 0]), fr, 0.022));
      add('head', 'metal', onSurf(xf(cyl(0.017, 0.019, 0.02, 20), [0, 0, 0], [HALF, 0, 0]), fr, 0.028));
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; add('head', 'helmet', onSurf(xf(rb(0.009, 0.016, 0.014, 0.002), [Math.cos(a) * 0.031, Math.sin(a) * 0.031, 0], [0, 0, a]), fr, 0.028)); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; add('head', 'metal', onSurf(xf(rb(0.006, 0.008, 0.006, 0.0015), [Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0], [0, 0, a]), fr, 0.021)); }
      add('head', 'device', onSurf(rb(0.03, 0.05, 0.022, 0.005), frameAt(hS, sgn * 1.5, -0.55), 0.004, [0, 1, 0], sgn * 0.3));
      add('head', 'metal', onSurf(rb(0.012, 0.03, 0.01, 0.003), frameAt(hS, sgn * 1.5, -0.55), 0.016, [0, 1, 0], sgn * 0.3));
    } else add('head', 'strap', onSurf(xf(cyl(0.04, 0.04, 0.01, 8), [0, 0, 0], [HALF, 0, 0]), fr, 0.024));
  }
  const ringY = C[1] + R[1] * Math.sin(ECUT), ringR = R[0] * Math.cos(ECUT);
  add('head', 'metal', xf(tor(ringR, H ? 0.013 : 0.016, 10, 64), [0, ringY, C[2]], [HALF, 0, 0], [1, 1.07, 1]));
  if (H) {
    add('head', 'metal', xf(tor(ringR * 0.98, 0.008, 6, 64), [0, ringY - 0.014, C[2]], [HALF, 0, 0], [1, 1.07, 1]));
    const hc = [0, 0.135, 0.022];
    const headG = new THREE.SphereGeometry(1, 28, 20);
    xf(headG, hc, [0, 0, 0], [0.074, 0.098, 0.088]);
    add('head', 'skin', posUV(headG));
    const capG = new THREE.SphereGeometry(1, 28, 16, 0, TAU, 0, 1.75);
    xf(capG, [hc[0], hc[1] + 0.004, hc[2] - 0.006], [-0.55, 0, 0], [0.079, 0.103, 0.094]);
    add('head', 'cap', posUV(capG));
    for (const sx of [-1, 1]) add('head', 'cap', xf(cyl(0.03, 0.032, 0.022, 20), [sx * 0.078, 0.125, 0.012], [0, 0, HALF]));
    add('head', 'cap', posUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0.075, 0.11, 0.03), new V3(0.06, 0.07, 0.09), new V3(0.02, 0.07, 0.115)]), 12, 0.004, 6, false)));
  }

  if (H) {
    const bel = (name, parent, keys, seg) => { extra.bellows[name] = { parent, geo: prep(tube(keys, { seg: S(seg), step: 0.006, disp: (th, y) => nribs(th, y, keys[0].y + 0.004, keys[keys.length - 1].y - 0.004, 0.016, 0.004, seg) })) }; };
    bel('shoulderL', 'spine', [{ y: -0.045, r: 0.098 }, { y: 0, r: 0.108 }, { y: 0.045, r: 0.098 }], 44);
    bel('hipL', 'pelvis', [{ y: -0.06, r: 0.118 }, { y: -0.02, r: 0.128 }, { y: 0.02, r: 0.118 }], 48);
    bel('kneeL', 'hipL', [{ y: -0.045, r: 0.088 }, { y: 0, r: 0.095 }, { y: 0.045, r: 0.088 }], 44);
    bel('elbowL', 'shoulderL', [{ y: -0.035, r: 0.079 }, { y: 0, r: 0.087 }, { y: 0.035, r: 0.079 }], 40);
  }
  return { parts, extra, vols, KN };
}

function applyGrime(g, off, lite = false) {
  const p = g.attributes.position, c = g.attributes.color;
  const L = lite ? 0.5 : 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + off[0], y = p.getY(i) + off[1], z = p.getZ(i) + off[2];
    let k = 0.94 + 0.06 * fbm(x * 9, y * 9, z * 9);
    k *= 1 - 0.07 * smooth(0.6, 0.8, fbm(x * 31 + 5, y * 31, z * 31));
    const wetEdge = 0.46 + 0.04 * (fbm(x * 6, y * 2, z * 6) - 0.5);
    const wet = smooth(wetEdge + 0.02, wetEdge - 0.03, y);
    const dirt = smooth(0.28, 0.04, y);
    let s = 0;
    if (z > 0.06) {
      s += Math.exp(-(((x + 0.01) / 0.035) ** 2)) * smooth(1.2, 1.13, y) * smooth(1.0, 1.1, y);
      for (const sx of [-0.16, 0.16]) s += 0.7 * Math.exp(-(((x - sx) / 0.03) ** 2)) * smooth(1.32, 1.24, y) * smooth(1.12, 1.22, y);
      s *= 0.4 + 0.6 * vnoise(x * 70, y * 4, 1);
    }
    k *= 1 - L * 0.16 * s;
    const r = k * (1 - L * (wet * 0.12 + dirt * 0.14)), gg = k * (1 - L * (wet * 0.15 + dirt * 0.18)), b = k * (1 - L * (wet * 0.25 + dirt * 0.26));
    c.setXYZ(i, c.getX(i) * r, c.getY(i) * gg, c.getZ(i) * b);
  }
}

function triCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

const LOD_HERO = { hero: true, seg: 0.62, step: 0.0145, fineStep: 0.0038, grid: 0.72 };
const LOD_LITE = { hero: false, seg: 0.26, step: 0.055, fineStep: 0, grid: 0.34 };

function heroLod(q) {
  const lod = { ...LOD_HERO };
  if (q === 'medium') Object.assign(lod, { seg: 0.62, step: 0.015, fineStep: 0.004 });
  if (q === 'low') Object.assign(lod, { seg: 0.48, step: 0.02, fineStep: 0.0055, grid: 0.6 });
  return lod;
}

const BELLOW_KEYS = ['shoulderL', 'shoulderR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'elbowL', 'elbowR'];

export function createAstronaut({ engine, quality, envMap, shared } = {}) {
  const q = quality || engine?.qualityName || 'high';
  let built = shared?.built;
  if (!built) built = buildParts(heroLod(q));
  const ownShared = !shared;
  const tex = ownShared ? acquireTextures(q !== 'low') : null;
  const light = shared?.light || createLightRig();
  const env = envMap ?? shared?.env ?? defaultEnv(engine?.renderer);
  const materials = shared?.materials || heroMaterials(tex, light, env);
  const group = new THREE.Group();
  group.name = 'astronaut';
  const joints = {}, objs = [], geos = [];
  let triangles = 0, drawCalls = 0;
  for (let i = 0; i < NJ; i++) {
    const o = new THREE.Object3D();
    o.name = JOINT_NAMES[i];
    o.position.set(...REST[i]);
    (PARENT[i] < 0 ? group : objs[PARENT[i]]).add(o);
    objs.push(o);
    joints[JOINT_NAMES[i]] = o;
  }
  const meshOf = (name, list, parent, off) => {
    const byMat = {};
    for (const pt of list) (byMat[pt.mat] ||= []).push(pt.geo);
    for (const [m, l] of Object.entries(byMat)) {
      let g = l.length === 1 ? l[0].clone() : mergeGeometries(l);
      if (ownShared || !shared.geoCache) applyGrime(g, off);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[m]);
      mesh.name = name + '_' + m;
      mesh.castShadow = m !== 'visor' && m !== 'skin' && m !== 'cap';
      mesh.receiveShadow = true;
      if (m === 'visor') mesh.renderOrder = 2;
      parent.add(mesh);
      geos.push(g);
      triangles += triCount(g);
      drawCalls++;
    }
  };
  for (let i = 0; i < NJ; i++) meshOf(JOINT_NAMES[i], built.parts[JOINT_NAMES[i]], objs[i], REST_WORLD[i]);
  const knuckles = {};
  for (const s of ['L', 'R']) {
    const k = new THREE.Object3D();
    k.name = 'knuckle' + s;
    k.position.set(s === 'L' ? built.KN[0] : -built.KN[0], built.KN[1], built.KN[2]);
    joints['wrist' + s].add(k);
    knuckles[s] = k;
    const off = REST_WORLD[IDX['wrist' + s]];
    meshOf('fingers' + s, built.extra['fingers' + s], k, [off[0] + k.position.x, off[1] + k.position.y, off[2]]);
  }
  const bellows = {};
  for (const name of BELLOW_KEYS) {
    const side = name.endsWith('R');
    const base = built.extra.bellows[side ? name.slice(0, -1) + 'L' : name];
    if (!base) continue;
    const parentName = side ? base.parent.replace(/L$/, 'R') : base.parent;
    const holder = new THREE.Object3D();
    holder.name = 'bellows_' + name;
    holder.position.set(...REST[IDX[name]]);
    joints[parentName].add(holder);
    const g = side ? mirrorX(base.geo) : base.geo;
    meshOf('bellows' + name, [{ mat: 'fabric', geo: g }], holder, REST_WORLD[IDX[name]]);
    bellows[name] = holder;
  }
  const anchors = {};
  const anchor = (name, parent, p) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...p); joints[parent].add(o); anchors[name] = o; };
  anchor('eye', 'head', [0, 0.15, 0.06]);
  anchor('handL', 'wristL', [-0.01, -0.14, 0.01]);
  anchor('handR', 'wristR', [0.01, -0.14, 0.01]);
  anchor('back', 'spine', [0, 0.27, -0.33]);
  anchor('chest', 'spine', [0, 0.3, 0.17]);
  const pose = neutralPose();
  const qh = new THREE.Quaternion(), qi = new THREE.Quaternion();
  function setPose(p) {
    for (let i = 0; i < NJ; i++) {
      const r = p[JOINT_NAMES[i]];
      if (r) objs[i].rotation.set(r[0], r[1], r[2]);
    }
    const rt = p.root || [0, 0, 0];
    objs[0].position.set(REST[0][0] + rt[0], REST[0][1] + rt[1], REST[0][2] + rt[2]);
    for (const name in bellows) {
      qh.setFromEuler(objs[IDX[name]].rotation);
      bellows[name].quaternion.copy(qi.identity().slerp(qh, 0.5));
    }
    const hd = p.hand || [DEFAULT_GRIP, DEFAULT_GRIP, 0];
    knuckles.L.rotation.set(0, 0, -(hd[0] - DEFAULT_GRIP) * 1.25);
    knuckles.R.rotation.set(0, 0, (hd[1] - DEFAULT_GRIP) * 1.25);
    copyPose(p, pose);
  }
  setPose(poseFor('stand', 0, 1, pose));
  return {
    group, joints, anchors, materials, triangles, drawCalls, pose, light,
    setPose,
    animate(mode, phase, amount = 1) { setPose(poseFor(mode, phase, amount, pose)); },
    setLight(L) { applyLight(light, L); },
    setLightFromRoom(U, extra) { applyLightFromRoom(light, U, extra); },
    setEnvMap(tex2, intensity) { for (const m of Object.values(materials)) { if (tex2 !== undefined) { m.envMap = tex2; m.needsUpdate = true; } if (intensity != null) m.envMapIntensity = m.name === 'astro_visor' ? intensity * 1.6 : intensity; } },
    update() {},
    dispose() {
      geos.forEach(g => g.dispose());
      if (ownShared) { Object.values(materials).forEach(m => m.dispose()); releaseTextures(); }
      group.removeFromParent();
    },
  };
}

export function createAstronautNear({ engine, quality, count = 2, envMap } = {}) {
  const q = quality || engine?.qualityName || 'high';
  const built = buildParts(heroLod(q));
  const tex = acquireTextures(q !== 'low');
  const light = createLightRig();
  const env = envMap ?? defaultEnv(engine?.renderer);
  const materials = heroMaterials(tex, light, env);
  const shared = { built, light, env, materials };
  const group = new THREE.Group();
  group.name = 'astronautNear';
  const figures = [];
  for (let i = 0; i < count; i++) {
    const f = createAstronaut({ engine, quality: q, shared });
    f.group.matrixAutoUpdate = false;
    f.group.visible = false;
    group.add(f.group);
    figures.push(f);
  }
  return {
    group, figures, materials, light,
    triangles: figures[0]?.triangles || 0, drawCallsPerFigure: figures[0]?.drawCalls || 0,
    setInstance(i, matrix, pose, opacity = 1) {
      const f = figures[i];
      if (!f) return;
      f.group.matrix.copy(matrix);
      f.group.matrixWorldNeedsUpdate = true;
      f.setPose(pose);
      f.group.visible = opacity > 0.02;
    },
    setCount(n) { figures.forEach((f, i) => { if (i >= n) f.group.visible = false; }); },
    setLight(L) { applyLight(light, L); },
    setLightFromRoom(U, extra) { applyLightFromRoom(light, U, extra); },
    setEnvMap(t, intensity) { figures[0]?.setEnvMap(t, intensity); },
    dispose() {
      figures.forEach(f => f.dispose());
      Object.values(materials).forEach(m => m.dispose());
      releaseTextures();
      group.removeFromParent();
    },
  };
}

const GHOST_VERT = `
attribute float aOpacity;
varying vec3 vN; varying vec3 vV; varying float vA; varying float vShade; varying float vY;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vV = cameraPosition - wp.xyz;
  vA = aOpacity;
  vShade = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GHOST_FRAG = `
uniform vec3 uTint; uniform float uGain; uniform float uCover; uniform float uBand;
varying vec3 vN; varying vec3 vV; varying float vA; varying float vShade; varying float vY;
void main(){
  float op = min(vA, 1.0);
  if (op <= 0.004) discard;
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
  float dist = length(vV);
  float rimW = fwidth(ndv);
  float rim = pow(1.0 - ndv, 2.4);
  rim = mix(rim, 0.25 + 0.3 * rim, smoothstep(0.25, 0.7, rimW) * 0.7 + smoothstep(18.0, 45.0, dist) * 0.3);
  float body = smoothstep(0.03, 0.4, vShade);
  float lum = mix(0.08, 0.22, body) + rim * mix(0.35, 0.95, body);
  float bandArg = vY * 160.0;
  float bandK = uBand * (1.0 - smoothstep(0.5, 1.5, fwidth(bandArg)));
  lum *= 1.0 - bandK * 0.5 * (0.5 + 0.5 * sin(bandArg));
  lum *= max(vA, 1.0);
  float cover = clamp((0.045 + 0.55 * rim) * mix(0.6, 1.0, body) * uCover * op, 0.0, 0.95);
  if (cover < 0.003) discard;
  gl_FragColor = vec4(uTint * uGain * lum * cover, cover);
}`;

export function createGhostMaterial({ tint = new THREE.Color(1.0, 0.72, 0.42), gain = 1.7, cover = 1, band = 0.25 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'astro_ghost',
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, vertexColors: true,
    uniforms: { uTint: { value: tint.clone ? tint.clone() : new THREE.Color(tint) }, uGain: { value: gain }, uCover: { value: cover }, uBand: { value: band } },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

function solidBatchMaterial(U, env) {
  const m = new THREE.MeshStandardMaterial({ name: 'astro_batch_solid', vertexColors: true, roughness: 0.8, metalness: 0, envMap: env, envMapIntensity: 0.6 });
  return injectRoom(m, U, {
    key: 'batch',
    vDecl: 'attribute float aOpacity;\nattribute vec2 aRM;\nvarying float vOp;\nvarying vec2 vRM;',
    vMain: 'vOp = aOpacity; vRM = aRM;',
    fDecl: 'varying float vOp;\nvarying vec2 vRM;',
    fReplace: [
      ['#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vOp < 0.999) { float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (ign >= vOp) discard; }'],
      ['#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;'],
      ['#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;'],
    ],
  });
}

let LITE = null;
function liteGeometries() {
  if (LITE) { LITE.ref++; return LITE; }
  const { parts, vols } = buildParts(LOD_LITE);
  const solid = [], ghost = [];
  let triangles = 0, ghostTriangles = 0;
  const pA = new V3(), pB = new V3(), pC = new V3();
  for (let i = 0; i < NJ; i++) {
    const name = JOINT_NAMES[i], off = REST_WORLD[i];
    const sl = [], gl = [];
    for (const { mat, geo, vol } of parts[name]) {
      applyGrime(geo, off, true);
      const c = geo.attributes.color, al = ALBEDO[mat], rm = RM[mat];
      for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * al[0], c.getY(k) * al[1], c.getZ(k) * al[2]);
      const rmA = new Float32Array(c.count * 2);
      for (let k = 0; k < c.count; k++) { rmA[k * 2] = rm[0]; rmA[k * 2 + 1] = rm[1]; }
      geo.setAttribute('aRM', new THREE.BufferAttribute(rmA, 2));
      geo.deleteAttribute('uv');
      sl.push(geo);
      const pos = geo.attributes.position, ix = geo.index.array, keep = [];
      for (let t = 0; t < ix.length; t += 3) {
        pA.fromBufferAttribute(pos, ix[t]); pB.fromBufferAttribute(pos, ix[t + 1]); pC.fromBufferAttribute(pos, ix[t + 2]);
        const cx = (pA.x + pB.x + pC.x) / 3, cy = (pA.y + pB.y + pC.y) / 3, cz = (pA.z + pB.z + pC.z) / 3;
        const wx = cx + off[0], wy = cy + off[1], wz = cz + off[2];
        let inside = false;
        for (const V of vols) {
          if (V.id === vol) continue;
          const jo = REST_WORLD[IDX[V.joint]];
          if (V.test(wx - jo[0], wy - jo[1], wz - jo[2])) { inside = true; break; }
        }
        if (!inside && mat !== 'visor') keep.push(ix[t], ix[t + 1], ix[t + 2]);
      }
      if (keep.length) { const g2 = geo.clone(); g2.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1)); gl.push(g2); }
    }
    const g = mergeGeometries(sl);
    const gg = gl.length ? mergeGeometries(gl) : g.clone();
    sl.forEach(x => x.dispose()); gl.forEach(x => x.dispose());
    solid.push(g); ghost.push(gg);
    triangles += triCount(g); ghostTriangles += triCount(gg);
  }
  LITE = { solid, ghost, triangles, ghostTriangles, ref: 1 };
  return LITE;
}
function releaseLite() { if (LITE && --LITE.ref <= 0) { LITE.solid.forEach(g => g.dispose()); LITE.ghost.forEach(g => g.dispose()); LITE = null; } }

export function createAstronautBatch({ engine, quality, max = 400, look = 'ghost', tint, envMap } = {}) {
  const lite = liteGeometries();
  const group = new THREE.Group();
  group.name = 'astronautBatch';
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1);
  opacity.setUsage(THREE.DynamicDrawUsage);
  const ghost = createGhostMaterial(tint ? { tint: new THREE.Color(tint) } : {});
  const light = createLightRig();
  const solid = solidBatchMaterial(light, envMap ?? defaultEnv(engine?.renderer));
  const wrap = src => {
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
    g.setIndex(src.index);
    g.setAttribute('aOpacity', opacity);
    return g;
  };
  const geoS = lite.solid.map(wrap), geoG = lite.ghost.map(wrap);
  let currentLook = look;
  const meshes = JOINT_NAMES.map((n, i) => {
    const mesh = new THREE.InstancedMesh(look === 'solid' ? geoS[i] : geoG[i], look === 'solid' ? solid : ghost, max);
    mesh.name = 'astro_' + n;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = mesh.receiveShadow = look === 'solid';
    mesh.boundingSphere = new THREE.Sphere(new V3(), 1);
    group.add(mesh);
    return mesh;
  });
  const mats = Array.from({ length: NJ }, () => new THREE.Matrix4());
  const viewer = { on: false, pos: new V3(), pix: 0.0035 };
  const lastP = new V3(), cur = new V3(), bmin = new V3(), bmax = new V3();
  let cursor = 0, lastOk = false, maxScale = 1, hasBounds = false;
  function write(slot, matrix, pose, op) {
    solvePose(pose, mats, matrix);
    for (let j = 0; j < NJ; j++) meshes[j].setMatrixAt(slot, mats[j]);
    opacity.array[slot] = op;
  }
  return {
    group, meshes, materials: { ghost, solid }, light,
    trianglesPerFigure: lite.triangles, ghostTrianglesPerFigure: lite.ghostTriangles,
    drawCalls: meshes.length,
    setInstance(i, matrix, pose, op = 1) {
      cur.setFromMatrixPosition(matrix);
      const sc = matrix.getMaxScaleOnAxis();
      if (!hasBounds) { bmin.copy(cur); bmax.copy(cur); hasBounds = true; maxScale = sc; }
      else { bmin.min(cur); bmax.max(cur); maxScale = Math.max(maxScale, sc); }
      if (viewer.on) {
        if (cursor >= max) return;
        if (lastOk && currentLook === 'ghost' && cur.distanceTo(lastP) < viewer.pix * cur.distanceTo(viewer.pos) * sc) {
          opacity.array[cursor - 1] = Math.max(opacity.array[cursor - 1], Math.min(1, op));
          return;
        }
        write(cursor++, matrix, pose, op);
        lastP.copy(cur); lastOk = true;
      } else {
        if (i < 0 || i >= max) return;
        write(i, matrix, pose, op);
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
      opacity.needsUpdate = true;
    },
    setCount(n) {
      const c = viewer.on ? cursor : clamp(n | 0, 0, max);
      for (const m of meshes) m.count = c;
      if (hasBounds) {
        const s = meshes[0].boundingSphere;
        s.center.addVectors(bmin, bmax).multiplyScalar(0.5);
        s.radius = bmin.distanceTo(bmax) * 0.5 + 1.4 * maxScale;
        const inv = group.matrixWorld.clone().invert();
        s.center.applyMatrix4(inv);
        for (const m of meshes) { m.boundingSphere.copy(s); m.frustumCulled = true; }
      }
      cursor = 0; lastOk = false; hasBounds = false;
    },
    setViewer(pos, pixelAngle = 0.0035) { if (!pos) { viewer.on = false; return; } viewer.on = true; viewer.pos.copy(pos); viewer.pix = pixelAngle; },
    setTint(color) { ghost.uniforms.uTint.value.set(color); },
    setGain(g) { ghost.uniforms.uGain.value = g; },
    setLight(L) { applyLight(light, L); },
    setLightFromRoom(U, extra) { applyLightFromRoom(light, U, extra); },
    setEnvMap(t, intensity) { if (t !== undefined) { solid.envMap = t; solid.needsUpdate = true; } if (intensity != null) solid.envMapIntensity = intensity; },
    setLook(l) {
      currentLook = l;
      meshes.forEach((m, i) => { m.material = l === 'solid' ? solid : ghost; m.geometry = l === 'solid' ? geoS[i] : geoG[i]; m.castShadow = m.receiveShadow = l === 'solid'; });
    },
    get look() { return currentLook; },
    dispose() {
      if (LITE && LITE.ref === 1) { geoS.forEach(g => g.dispose()); geoG.forEach(g => g.dispose()); }
      ghost.dispose(); solid.dispose();
      releaseLite();
      group.removeFromParent();
    },
  };
}
