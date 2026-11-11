// Ranger exterior: procedural 19 m wedge with recessed rounded windows, surfaced deck, faceted belly, radiator slats, rear engine face with plumes, thruster jets, airlock, hatch steps, stance-aware gear, lights and LOD.
import * as THREE from 'three';
import { createHullMaterials, decalUV, grimeUV, rng, makeCanvas, tileNoise } from './hull-materials.js';

const DEG = Math.PI / 180;

export function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export function linear(xs, ys) {
  const n = xs.length;
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] + (ys[i + 1] - ys[i]) * t;
  };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const CROWN = monotone([-10.8, -8, -6, -3.0, -2.55, -1.3, 0, 2, 5.5, 7.6, 8.3], [0.12, 0.32, 0.5, 0.82, 0.92, 1.9, 2.15, 2.25, 2.25, 2.12, 2.08]);
const EDGE = monotone([-10.8, -6, -3.0, -1.3, 0, 4, 6.3, 8.3], [0.07, 0.44, 0.72, 0.88, 0.95, 1.15, 1.85, 2.06]);
const DROP = (z) => Math.max(0.03, CROWN(z) - EDGE(z));
const RING_V = [[3.7, 7.6], [3.75, 5.2], [3.7, 0], [3.4, -3], [2.3, -10]];
const WRING = linear([-10, -3, 0, 5.2, 7.6], [2.3, 3.4, 3.7, 3.75, 3.7]);
const DS = linear([-10, -3, 0, 5, 7.6], [0.9, 1.15, 1.3, 1.45, 1.8]);
const ES = monotone([-10.8, -6, -3, -1.5, 0, 3, 5, 6.3, 7.6], [-0.03, 0.24, 0.48, 0.6, 0.66, 0.72, 0.78, 0.8, 0.5]);
const WBOT = linear([-10, -3, 0, 5, 7.6], [1.9, 3.1, 3.4, 3.6, 4.0]);
const YBOT = linear([-10.8, 1.5, 8.6], [-0.22, -0.55, -0.35]);
const KEEL_X = 1.3, KEEL_STEP = 0.07;
const RAD_Z = 3.5;
const HULL_T = 0.22;
const GLASS_DEPTH = 0.18;
const RIM = 0.065;
const WIN_R = 0.07;

export function yTop(x, z) {
  const u = Math.min(1.08, Math.abs(x) / WRING(z));
  return CROWN(z) - DROP(z) * (0.4 * u * u + 0.6 * u * u * u * u);
}

export function deckNormal(x, z) {
  const e = 0.01;
  const dx = (yTop(x + e, z) - yTop(x - e, z)) / (2 * e);
  const dz = (yTop(x, z + e) - yTop(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  return [-dx / l, 1 / l, -dz / l];
}

export const yBottom = (x, z) => YBOT(z) - (Math.abs(x) < KEEL_X ? KEEL_STEP : 0);
const bottomNormal = (x, z) => {
  const e = 0.01, dz = (YBOT(z + e) - YBOT(z - e)) / (2 * e), l = Math.hypot(1, dz);
  return [0, -1 / l, dz / l];
};

export function area2(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
export function ccw(p) { return area2(p) < 0 ? p.slice().reverse() : p; }

function clipHalf(poly, a, b, keepLeft) {
  const out = [];
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const side = (p) => (ex * (p[1] - a[1]) - ez * (p[0] - a[0])) * (keepLeft ? 1 : -1);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

export function clipConvex(poly, region) {
  let p = poly;
  for (let i = 0; i < region.length && p.length >= 3; i++) p = clipHalf(p, region[i], region[(i + 1) % region.length], true);
  return p.length >= 3 && Math.abs(area2(p)) > 1e-7 ? p : null;
}

export function subtractConvex(poly, W) {
  const out = [];
  let rem = poly;
  for (let i = 0; i < W.length && rem && rem.length >= 3; i++) {
    const a = W[i], b = W[(i + 1) % W.length];
    const o = clipHalf(rem, a, b, false);
    if (o.length >= 3 && Math.abs(area2(o)) > 1e-7) out.push(o);
    rem = clipHalf(rem, a, b, true);
  }
  return out;
}

export function offsetConvex(W, d) {
  const n = W.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = W[i], b = W[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1e-9;
    const nx = ez / l, nz = -ex / l;
    lines.push([a[0] + nx * d, a[1] + nz * d, ex, ez]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i - 1 + n) % n], L1 = lines[i];
    const det = L0[2] * L1[3] - L0[3] * L1[2];
    if (Math.abs(det) < 1e-12) { out.push([L1[0], L1[1]]); continue; }
    const t = ((L1[0] - L0[0]) * L1[3] - (L1[1] - L0[1]) * L1[2]) / det;
    out.push([L0[0] + L0[2] * t, L0[1] + L0[3] * t]);
  }
  return out;
}

export function roundPoly(P, r, segs = 5) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n];
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const d1 = [(p1[0] - p0[0]) / l1, (p1[1] - p0[1]) / l1], d2 = [(p2[0] - p1[0]) / l2, (p2[1] - p1[1]) / l2];
    const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
    const tn = Math.tan(turn / 2);
    const t = Math.min(r * tn, 0.42 * Math.min(l1, l2));
    const rr = tn > 1e-6 ? t / tn : 0;
    const a = [p1[0] - d1[0] * t, p1[1] - d1[1] * t];
    const nA = [d1[1], -d1[0]], nB = [d2[1], -d2[0]];
    const ctr = [a[0] - nA[0] * rr, a[1] - nA[1] * rr];
    const ang0 = Math.atan2(nA[1], nA[0]);
    const delta = Math.atan2(nA[0] * nB[1] - nA[1] * nB[0], nA[0] * nB[0] + nA[1] * nB[1]);
    for (let k = 0; k <= segs; k++) { const ang = ang0 + delta * k / segs; out.push([ctr[0] + Math.cos(ang) * rr, ctr[1] + Math.sin(ang) * rr]); }
  }
  return out;
}

function bbox(p) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return [x0, z0, x1, z1]; }
const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };

export function edgeCounts(W, maxLen) { return W.map((a, i) => { const b = W[(i + 1) % W.length]; return Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen)); }); }
export function sampleEdges(W, counts) {
  const out = [];
  for (let i = 0; i < W.length; i++) {
    const a = W[i], b = W[(i + 1) % W.length];
    for (let k = 0; k < counts[i]; k++) { const t = k / counts[i]; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export class MeshBuilder {
  constructor() { this.sets = new Map(); this.tris = 0; }
  _set(key) { let s = this.sets.get(key); if (!s) { s = { p: [], n: [], u: [] }; this.sets.set(key, s); } return s; }
  tri(key, a, b, c, na, nb, nc, ua, ub, uc) {
    const s = this._set(key);
    s.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    s.n.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    s.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    this.tris++;
  }
  triO(key, a, b, c, hint, na, nb, nc, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-12) return;
    fx /= fl; fy /= fl; fz /= fl;
    const flip = fx * hint[0] + fy * hint[1] + fz * hint[2] < 0;
    if (flip) { fx = -fx; fy = -fy; fz = -fz; }
    const f = [fx, fy, fz];
    na = na || f; nb = nb || f; nc = nc || f;
    ua = ua || boxUV(a, f); ub = ub || boxUV(b, f); uc = uc || boxUV(c, f);
    if (flip) this.tri(key, a, c, b, na, nc, nb, ua, uc, ub); else this.tri(key, a, b, c, na, nb, nc, ua, ub, uc);
  }
  quadO(key, a, b, c, d, hint, uvs) {
    this.triO(key, a, b, c, hint, null, null, null, uvs?.[0], uvs?.[1], uvs?.[2]);
    this.triO(key, a, c, d, hint, null, null, null, uvs?.[0], uvs?.[2], uvs?.[3]);
  }
  geometry(key, geom, matrix, { flip = false, uv = 'box', groups = null } = {}) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const ranges = groups && g.groups.length ? g.groups.filter(r => groups.includes(r.materialIndex)) : [{ start: 0, count: P.count }];
    const s = this._set(key);
    for (const r of ranges) {
      for (let i = r.start; i < r.start + r.count; i += 3) {
        const idx = flip ? [i, i + 2, i + 1] : [i, i + 1, i + 2];
        for (const j of idx) {
          const p = [P.getX(j), P.getY(j), P.getZ(j)];
          let n = [N.getX(j), N.getY(j), N.getZ(j)];
          if (flip) n = [-n[0], -n[1], -n[2]];
          s.p.push(p[0], p[1], p[2]);
          s.n.push(n[0], n[1], n[2]);
          const u = uv === 'keep' && U ? [U.getX(j), U.getY(j)] : boxUV(p, n);
          s.u.push(u[0], u[1]);
        }
        this.tris++;
      }
    }
    g.dispose();
  }
  meshes(materials, { shadows = true } = {}) {
    const out = [];
    for (const [key, s] of this.sets) {
      if (!s.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(s.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(s.u, 2));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, materials[key]);
      m.name = key;
      m.castShadow = shadows && !['decal', 'glass', 'rglass', 'grime', 'seam', 'glow', 'plume', 'alight'].includes(key);
      m.receiveShadow = shadows;
      out.push(m);
    }
    return out;
  }
}

export function boxUV(p, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0], p[2]];
  if (ax >= az) return [p[2], p[1]];
  return [p[0], p[1]];
}

function insideConvex(p, region) {
  for (let i = 0; i < region.length; i++) {
    const a = region[i], b = region[(i + 1) % region.length];
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false;
  }
  return true;
}

export function gridSurface(B, key, region, holes, cell, P, N, UV, hintFn) {
  if (!region) return;
  const bb = bbox(region);
  const hb = holes.map(bbox);
  for (let x0 = bb[0]; x0 < bb[2]; x0 += cell) for (let z0 = bb[1]; z0 < bb[3]; z0 += cell) {
    const sq = [[x0, z0], [x0 + cell, z0], [x0 + cell, z0 + cell], [x0, z0 + cell]];
    const base = sq.every(p => insideConvex(p, region)) ? sq : clipConvex(sq, region);
    if (!base) continue;
    let pieces = [base];
    const cb = [x0, z0, x0 + cell, z0 + cell];
    for (let h = 0; h < holes.length; h++) {
      if (!overlap(cb, hb[h])) continue;
      pieces = pieces.flatMap(p => subtractConvex(p, holes[h]));
      if (!pieces.length) break;
    }
    for (const p of pieces) {
      const v = p.map(q => P(q[0], q[1])), n = p.map(q => N(q[0], q[1])), u = p.map(q => UV(q[0], q[1]));
      const c = centroid(p), hint = hintFn(c[0], c[1]);
      for (let k = 1; k < p.length - 1; k++) B.triO(key, v[0], v[k], v[k + 1], hint, n[0], n[k], n[k + 1], u[0], u[k], u[k + 1]);
    }
  }
}

function ringLoop(step, lod) {
  const half = RING_V.map(([x, z]) => [x, z]);
  const poly = ccw([...half, ...half.slice().reverse().map(([x, z]) => [-x, z])]);
  const radius = poly.map(() => 0.08);
  const pts = [];
  const n = poly.length;
  const corners = [];
  for (let i = 0; i < n; i++) {
    const P0 = poly[(i - 1 + n) % n], P1 = poly[i], P2 = poly[(i + 1) % n];
    const d1 = norm2([P1[0] - P0[0], P1[1] - P0[1]]), d2 = norm2([P2[0] - P1[0], P2[1] - P1[1]]);
    const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
    const t = radius[i] * Math.tan(turn / 2);
    corners.push({ P1, d1, d2, t, turn, r: radius[i] });
  }
  for (let i = 0; i < n; i++) {
    const c = corners[i], cn = corners[(i + 1) % n];
    const segs = Math.max(2, Math.ceil(c.turn / (lod ? 0.6 : 0.14)));
    const a = [c.P1[0] - c.d1[0] * c.t, c.P1[1] - c.d1[1] * c.t];
    const nA = [c.d1[1], -c.d1[0]], nB = [c.d2[1], -c.d2[0]];
    const ctr = [a[0] - nA[0] * c.r, a[1] - nA[1] * c.r];
    const ang0 = Math.atan2(nA[1], nA[0]);
    const delta = Math.atan2(nA[0] * nB[1] - nA[1] * nB[0], nA[0] * nB[0] + nA[1] * nB[1]);
    for (let k = 0; k < segs; k++) {
      const ang = ang0 + delta * (k / segs);
      const nr = [Math.cos(ang), Math.sin(ang)];
      pts.push({ p: [ctr[0] + nr[0] * c.r, ctr[1] + nr[1] * c.r], n: nr });
    }
    const b = [c.P1[0] + c.d2[0] * c.t, c.P1[1] + c.d2[1] * c.t];
    const e = [cn.P1[0] - cn.d1[0] * cn.t, cn.P1[1] - cn.d1[1] * cn.t];
    const len = Math.hypot(e[0] - b[0], e[1] - b[1]);
    const cnt = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < cnt; k++) {
      const f = k / cnt;
      pts.push({ p: [b[0] + (e[0] - b[0]) * f, b[1] + (e[1] - b[1]) * f], n: nB });
    }
  }
  let start = 0, best = 1e9;
  for (let i = 0; i < pts.length; i++) if (pts[i].n[1] > 0.99 && Math.abs(pts[i].p[0]) < best) { best = Math.abs(pts[i].p[0]); start = i; }
  return { loop: pts.slice(start).concat(pts.slice(0, start)), poly };
}

function norm2(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function frameParams(s) {
  const [x, z] = s.p, [nx, nz] = s.n;
  const wr = smooth(0.5, 0.97, nz), wn = smooth(0.5, 0.97, -nz), ws = Math.max(0, 1 - wr - wn);
  const y0 = yTop(x, z);
  const D = ws * DS(z) + wr * 0.62 + wn * 0.72;
  const E = ws * ES(z) + wr * (y0 - 0.12) + wn * -0.03;
  const inset = ws * (WRING(z) - WBOT(z)) + wn * 0.55 + wr * 0.4;
  return { x, z, nx, nz, wr, wn, ws, y0, D, E, inset };
}

function frameSection(s, q) {
  const { x, z, nx, nz, y0, D, E } = q;
  const P = (o, y) => [x + nx * o, y, z + nz * o];
  const o3 = Math.min(0.42, D - 0.25);
  const p4o = o3 + 0.05;
  const p5 = [D - 0.03, E + 0.03];
  const mid = [p4o + (p5[0] - p4o) * 0.55 + 0.025, y0 + 0.025 + (p5[1] - y0 - 0.025) * 0.55 + 0.02];
  return [P(-0.09, y0 - 0.07), P(-0.09, y0 + 0.045), P(-0.06, y0 + 0.075), P(o3, y0 + 0.055), P(p4o, y0 + 0.025), P(mid[0], mid[1]), P(p5[0], p5[1]), P(D, E)];
}

function undersideSection(s, q) {
  const { x, z, nx, nz, D, E, inset } = q;
  const bx = x - nx * inset, bz = z - nz * inset;
  const yb = YBOT(bz);
  const e = [x + nx * D, E, z + nz * D];
  const b1 = [x + nx * (D - 0.035), E - 0.045, z + nz * (D - 0.035)];
  const b3 = [bx + nx * 0.05, yb + 0.035, bz + nz * 0.05];
  const b4 = [bx, yb, bz];
  const b2 = lerp3(b1, b3, 0.5);
  b2[0] += nx * 0.04; b2[2] += nz * 0.04; b2[1] -= 0.03;
  return [e, b1, b2, b3, b4];
}

function loft(B, key, sections, hintFn, { closed = false } = {}) {
  const ns = sections.length, np = sections[0].length;
  const along = [0];
  for (let i = 1; i < ns; i++) along.push(along[i - 1] + Math.hypot(...sub3(sections[i][0], sections[i - 1][0])));
  const across = sections.map(sec => { const a = [0]; for (let j = 1; j < np; j++) a.push(a[j - 1] + Math.hypot(...sub3(sec[j], sec[j - 1]))); return a; });
  const segs = closed ? ns : ns - 1;
  const fn = [];
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % ns, row = [];
    for (let j = 0; j < np - 1; j++) {
      const a = sections[i][j], b = sections[i1][j], c = sections[i1][j + 1], d = sections[i][j + 1];
      let f = norm3(cross3(sub3(c, a), sub3(d, b)));
      const h = hintFn(i, j);
      if (f[0] * h[0] + f[1] * h[1] + f[2] * h[2] < 0) f = [-f[0], -f[1], -f[2]];
      row.push(isNaN(f[0]) ? h : f);
    }
    fn.push(row);
  }
  const vn = (i, j) => {
    const prev = closed ? fn[(i - 1 + segs) % segs] : fn[i - 1];
    const cur = i < segs ? fn[i] : null;
    const a = prev ? prev[j] : null, b = cur ? cur[j] : null;
    if (a && b) { const dt = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; return dt > 0.82 ? norm3(add3(a, b)) : (cur ? b : a); }
    return a || b;
  };
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % ns;
    for (let j = 0; j < np - 1; j++) {
      const a = sections[i][j], b = sections[i1][j], c = sections[i1][j + 1], d = sections[i][j + 1];
      const na = vn(i, j), nb = vn(i1 === 0 && closed ? 0 : i + 1, j), nc = nb, nd = na;
      const ua = [along[i], across[i][j]], ub = [closed && i1 === 0 ? along[i] + Math.hypot(...sub3(b, a)) : along[i1], across[i1][j]];
      const uc = [ub[0], across[i1][j + 1]], ud = [along[i], across[i][j + 1]];
      const hint = fn[i][j];
      B.triO(key, a, b, c, hint, na, nb, nc, ua, ub, uc);
      B.triO(key, a, c, d, hint, na, nc, nd, ua, uc, ud);
    }
  }
}

function capPolygon(B, key, pts3, hint, drop = [0, 2]) {
  const pts2 = pts3.map(p => new THREE.Vector2(p[drop[0]], p[drop[1]]));
  if (THREE.ShapeUtils.isClockWise(pts2)) { pts2.reverse(); pts3 = pts3.slice().reverse(); }
  const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
  for (const [a, b, c] of tris) B.triO(key, pts3[a], pts3[b], pts3[c], hint);
}

const W_LEFT = [
  ['ws', [[-1.62, -2.48], [-0.34, -2.5], [-0.32, -1.45], [-1.38, -1.42]]],
  ['sf', [[-2.75, -2.4], [-1.92, -2.5], [-1.7, -1.75], [-2.05, -1.45], [-2.62, -1.6]]],
  ['t1', [[-1.25, -1.12], [-0.42, -1.22], [-0.38, -0.8], [-1.05, -0.62]]],
  ['s1', [[-3.0, -1.05], [-1.95, -1.2], [-1.62, -0.48], [-2.85, -0.22]]],
  ['t2', [[-1.3, -0.42], [-0.55, -0.52], [-0.5, -0.1], [-1.15, 0.0]]],
  ['s2', [[-3.05, 0.18], [-2.1, 0.02], [-1.85, 0.6], [-2.8, 0.92]]],
  ['t3', [[-1.55, 0.28], [-0.75, 0.2], [-0.55, 0.62], [-0.95, 1.02], [-1.45, 0.88]]],
  ['a1', [[-2.35, 1.4], [-1.55, 1.3], [-1.35, 1.92], [-2.15, 2.1]]],
  ['tr', [[-3.05, 1.35], [-2.62, 1.22], [-2.75, 1.95]]],
];
const W_RIGHT_ONLY = [['tq', [[2.55, 2.3], [3.05, 2.18], [2.85, 2.75]]], ['a2', [[0.45, 1.5], [0.95, 1.42], [0.92, 1.9], [0.5, 1.95]]]];
const W_CENTER = [['c1', [[0, 0.45], [0.2, 0.82], [0, 1.28], [-0.2, 0.82]]]];
const W_SKIP_RIGHT = new Set(['tr']);

export function rangerWindows() {
  const list = [];
  for (const [id, poly] of W_LEFT) {
    list.push({ id: id + 'L', sharp: ccw(poly) });
    if (!W_SKIP_RIGHT.has(id)) list.push({ id: id + 'R', sharp: ccw(poly.map(([x, z], j) => [-x + (id === 'ws' ? 0 : 0.035 * Math.sin(j * 1.7 + id.length * 2.1)), z + (id === 'ws' ? 0 : 0.035 * Math.cos(j * 2.3 + id.charCodeAt(0)))])) });
  }
  for (const [id, poly] of W_CENTER.concat(W_RIGHT_ONLY)) list.push({ id, sharp: ccw(poly) });
  return list.map(w => {
    const poly = ccw(roundPoly(w.sharp, WIN_R, 5));
    const glass = offsetConvex(poly, -0.05);
    const c = centroid(glass);
    const n = deckNormal(c[0], c[1]);
    const p0 = [c[0], yTop(c[0], c[1]) - GLASS_DEPTH, c[1]];
    const yPlane = (x, z) => p0[1] - (n[0] * (x - p0[0]) + n[2] * (z - p0[2])) / n[1];
    return { id: w.id, poly, glass, normal: n, point: p0, yPlane, region: c[1] < 1.45 ? 'cockpit' : 'cabin' };
  });
}

const PANELS_DECK = [
  [[-1.9, -9.6], [-0.6, -9.6], [-0.6, -8.7], [-1.9, -8.7]],
  [[0.4, -9.9], [1.6, -9.9], [1.6, -8.9], [0.4, -8.9]],
  [[-1.9, -7.4], [-0.6, -7.4], [-0.6, -6.4], [-1.9, -6.4]],
  [[0.5, -7.2], [1.7, -7.2], [1.7, -5.9], [0.5, -5.9]],
  [[-2.3, -5.6], [-1.1, -5.6], [-1.1, -4.4], [-2.3, -4.4]],
  [[-0.35, -5.3], [0.35, -5.3], [0.35, -4.1], [-0.35, -4.1]],
  [[1.2, -5.0], [2.6, -5.0], [2.6, -4.2], [1.2, -4.2]],
  [[-3.0, -3.9], [-2.2, -3.9], [-2.2, -3.25], [-3.0, -3.25]],
  [[2.3, -3.85], [3.0, -3.85], [3.0, -3.2], [2.3, -3.2]],
  [[-0.5, 2.6], [0.5, 2.6], [0.5, 3.3], [-0.5, 3.3]],
  [[-2.5, 2.7], [-1.3, 2.7], [-1.3, 3.3], [-2.5, 3.3]],
];
const HATCHES_BOTTOM = [
  { r: [-1.0, -8.8, 1.0, -7.6] }, { r: [-0.8, 0.6, 0.8, 2.6] }, { r: [-1.1, 3.2, 1.1, 4.2] }, { r: [-0.9, -2.4, 0.9, -1.0], glass: true },
  { r: [-2.6, -1.6, -1.6, 0.4] }, { r: [1.6, -1.6, 2.6, 0.4] }, { r: [-3.2, 1.2, -2.2, 3.4] }, { r: [2.2, 1.2, 3.2, 3.4] },
  { r: [-2.5, -4.6, -1.6, -3.0], glass: true }, { r: [1.6, -4.6, 2.5, -3.0], glass: true }, { r: [-2.2, -7.5, -1.5, -6.4] }, { r: [1.5, -7.5, 2.2, -6.4] },
];
const rectPoly = ([x0, z0, x1, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

const GEAR = [
  { id: 'L', x: -3.0, z: 6.3, len: 2.15, dir: -1, depth: 0.36 },
  { id: 'R', x: 3.0, z: 6.3, len: 2.15, dir: -1, depth: 0.36 },
  { id: 'N', x: 0, z: -5.6, len: 2.15, dir: 1, depth: 0.45 },
].map(g => {
  const za = g.z - g.dir * 0.1, zb = g.z + g.dir * (g.len - 0.1);
  const tilt = -Math.atan((YBOT(zb) - YBOT(za)) / ((zb - za) * g.dir));
  const hinge = [g.x, yBottom(g.x, g.z) + 0.285 * Math.cos(tilt), g.z];
  const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
  const well = [[g.x - 0.34, z0], [g.x + 0.34, z0], [g.x + 0.34, z1], [g.x - 0.34, z1]];
  return { ...g, tilt, hinge, well };
});
const GEAR_ANGLE = 72 * DEG;
const FOOT_FLIGHT = -2.45, FOOT_LANDED = -1.59;
const LEG_MIN = 1.3;
const WATER_ABOVE_GROUND = 0.55;

function surfDeck() { return { y: yTop, n: deckNormal, s: 1 }; }
function surfBottom() { return { y: yBottom, n: bottomNormal, s: -1 }; }

function rivet(B, key, x, z, surf, r = 0.009, h = 0.006, lift = 0.006, segs = 8) {
  const n = surf.n(x, z), y = surf.y(x, z) + surf.s * lift;
  const base = [x, y, z];
  const t1 = norm3(cross3(n, Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), t2 = cross3(n, t1);
  const top = add3(base, n, h);
  const ring0 = [], ring1 = [], n0 = [], n1 = [];
  for (let k = 0; k < segs; k++) {
    const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    ring0.push(add3(add3(base, t1, c * r), t2, s * r));
    ring1.push(add3(add3(add3(base, t1, c * r * 0.62), t2, s * r * 0.62), n, h * 0.78));
    n0.push(norm3(add3(add3(n, t1, c * 1.6), t2, s * 1.6)));
    n1.push(norm3(add3(add3(n, t1, c * 0.7), t2, s * 0.7)));
  }
  for (let k = 0; k < segs; k++) {
    const j = (k + 1) % segs;
    B.triO(key, ring0[k], ring0[j], ring1[j], n, n0[k], n0[j], n1[j]);
    B.triO(key, ring0[k], ring1[j], ring1[k], n, n0[k], n1[j], n1[k]);
    B.triO(key, ring1[k], ring1[j], top, n, n1[k], n1[j], n);
  }
}

function ringPts(base, d, counts) { return sampleEdges(offsetConvex(base, d), counts); }

function windowRecess(B, w, lod) {
  const surf = surfDeck();
  const W = w.poly;
  const counts = edgeCounts(W, lod ? 1 : 0.1);
  const Wout = ringPts(W, RIM, counts), Wr = ringPts(W, 0, counts), L1 = ringPts(W, -0.012, counts), L2 = ringPts(W, -0.024, counts);
  const F1 = ringPts(W, -0.036, counts), F2 = ringPts(W, -0.05, counts);
  const c = centroid(W);
  const up = (q) => surf.y(q[0], q[1]) + 0.008;
  const gp = (q, dy = 0) => [q[0], w.yPlane(q[0], q[1]) + dy, q[1]];
  const n = Wr.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const hintUp = deckNormal(Wr[i][0], Wr[i][1]);
    const inward = norm3([c[0] - Wr[i][0], 0, c[1] - Wr[i][1]]);
    const P = (q, y) => [q[0], y, q[1]];
    const a0 = P(Wout[i], up(Wout[i])), a1 = P(Wout[j], up(Wout[j]));
    const b0 = P(Wr[i], up(Wr[i])), b1 = P(Wr[j], up(Wr[j]));
    const s0 = P(Wout[i], surf.y(...Wout[i]) - 0.012), s1 = P(Wout[j], surf.y(...Wout[j]) - 0.012);
    const l10 = P(L1[i], surf.y(...L1[i]) - 0.002), l11 = P(L1[j], surf.y(...L1[j]) - 0.002);
    const l20 = P(L2[i], surf.y(...L2[i]) - 0.026), l21 = P(L2[j], surf.y(...L2[j]) - 0.026);
    const f10 = gp(F1[i], 0.012), f11 = gp(F1[j], 0.012), f20 = gp(F2[i], 0.012), f21 = gp(F2[j], 0.012), g0 = gp(F2[i]), g1 = gp(F2[j]);
    B.quadO('frame', a0, a1, b1, b0, hintUp);
    B.quadO('frame', s0, s1, a1, a0, norm3(add3([-inward[0], 0, -inward[2]], hintUp, 0.3)));
    B.quadO('frame', b0, b1, l11, l10, norm3(add3(inward, hintUp, 2)));
    B.quadO('frame', l10, l11, l21, l20, norm3(add3(inward, hintUp, 0.8)));
    B.quadO('frame', l20, l21, f11, f10, norm3(add3(inward, hintUp, 0.3)));
    B.quadO('frame', f10, f11, f21, f20, hintUp);
    B.quadO('frame', f20, f21, g1, g0, norm3(add3(inward, hintUp, 0.2)));
  }
  const glass = w.glass.map(q => gp(q));
  for (let k = 1; k < glass.length - 1; k++) B.triO('rglass', glass[0], glass[k], glass[k + 1], w.normal);
  if (lod) return;
  const mid = offsetConvex(W, RIM * 0.5);
  for (const q of sampleEdges(mid, edgeCounts(mid, 0.07))) rivet(B, 'metal', q[0], q[1], surf, 0.0075, 0.005, 0.008, 8);
}

function panelRecess(B, P0, surf, mat, opts = {}) {
  const { gap = 0.012, depth = 0.028, plate = 0.008, fasteners = true } = opts;
  const P = ccw(roundPoly(P0, 0.05, 3));
  const counts = edgeCounts(P, 0.2);
  const H = sampleEdges(offsetConvex(P, gap), counts);
  const S = sampleEdges(offsetConvex(P, gap * 0.35), counts);
  const Q = sampleEdges(P, counts);
  const c = centroid(P);
  const yAt = (q, d) => surf.y(q[0], q[1]) - surf.s * d;
  const pt = (q, d) => [q[0], yAt(q, d), q[1]];
  const n = Q.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const nn = surf.n(Q[i][0], Q[i][1]);
    const inward = norm3([c[0] - Q[i][0], 0, c[1] - Q[i][1]]);
    B.quadO('frame', pt(H[i], 0), pt(H[j], 0), pt(H[j], depth), pt(H[i], depth), norm3(add3(inward, nn, 0.2)));
    B.quadO('frame', pt(H[i], depth), pt(H[j], depth), pt(S[j], depth), pt(S[i], depth), nn);
    B.quadO(mat, pt(S[i], depth), pt(S[j], depth), pt(Q[j], plate), pt(Q[i], plate), norm3(add3([-inward[0], 0, -inward[2]], nn, 0.6)));
  }
  const cc = pt(c, plate);
  for (let i = 0; i < n; i++) B.triO(mat, cc, pt(Q[i], plate), pt(Q[(i + 1) % n], plate), surf.n(c[0], c[1]));
  if (!fasteners) return;
  const inner = offsetConvex(P, -0.035);
  for (const q of sampleEdges(inner, edgeCounts(inner, 0.16))) {
    const s2 = { y: (x, z) => surf.y(x, z) - surf.s * plate, n: surf.n, s: surf.s };
    rivet(B, 'metal', q[0], q[1], s2, 0.011, 0.004, 0.002, 8);
  }
  return offsetConvex(P, gap);
}

function hatchRecess(B, rect, surf, opts = {}) {
  const { depth = 0.075, frameW = 0.05, raise = 0.03, glass = false } = opts;
  const P = ccw(roundPoly(rectPoly(rect), 0.08, 4));
  const counts = edgeCounts(P, 0.18);
  const A = sampleEdges(offsetConvex(P, frameW), counts), Bq = sampleEdges(offsetConvex(P, frameW * 0.7), counts), C = sampleEdges(P, counts), D = sampleEdges(offsetConvex(P, -0.01), counts);
  const c = centroid(P);
  const pt = (q, d) => [q[0], surf.y(q[0], q[1]) - surf.s * d, q[1]];
  const n = C.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const nn = surf.n(C[i][0], C[i][1]);
    const out = norm3([C[i][0] - c[0], 0, C[i][1] - c[1]]);
    B.quadO('frame', pt(A[i], 0), pt(A[j], 0), pt(Bq[j], -raise), pt(Bq[i], -raise), norm3(add3(out, nn, 0.7)));
    B.quadO('frame', pt(Bq[i], -raise), pt(Bq[j], -raise), pt(C[j], -raise), pt(C[i], -raise), nn);
    B.quadO('frame', pt(C[i], -raise), pt(C[j], -raise), pt(D[j], depth), pt(D[i], depth), norm3(add3([-out[0], 0, -out[2]], nn, 0.3)));
  }
  const cc = pt(c, depth), key = glass ? 'rglass' : 'tile';
  for (let i = 0; i < n; i++) B.triO(key, cc, pt(D[i], depth), pt(D[(i + 1) % n], depth), surf.n(c[0], c[1]));
  if (!glass) for (const q of sampleEdges(offsetConvex(P, -0.04), edgeCounts(offsetConvex(P, -0.04), 0.2))) rivet(B, 'metal', q[0], q[1], { y: (x, z) => surf.y(x, z) - surf.s * depth, n: surf.n, s: surf.s }, 0.01, 0.004, 0.001, 8);
  return offsetConvex(P, frameW);
}

function radiatorSlats(B, region, lod) {
  const z0 = RAD_Z + 0.12, z1 = 7.45, pitch = 0.18;
  const bands = [[-1, -0.36], [-0.32, 0.32], [0.36, 1]];
  for (let z = z0; z <= z1 + 1e-6; z += pitch) {
    const hw = WRING(z) - 0.16;
    for (const [fa, fb] of bands) {
      const xa = fa * hw, xb = fb * hw, segs = lod ? 1 : 6;
      for (let k = 0; k < segs; k++) {
        const x0 = xa + (xb - xa) * k / segs, x1 = xa + (xb - xa) * (k + 1) / segs;
        const slat = (x) => {
          const yb = yTop(x, z) - 0.05;
          return { r0: [x, yb, z + 0.05], t0: [x, yb + 0.1, z - 0.02], t1: [x, yb + 0.1, z - 0.0], r1: [x, yb, z + 0.075] };
        };
        const A = slat(x0), C = slat(x1);
        B.quadO('slat', A.r0, C.r0, C.t0, A.t0, [0, 0.5, -1]);
        B.quadO('slat', A.t0, C.t0, C.t1, A.t1, [0, 1, 0]);
        B.quadO('slat', A.t1, C.t1, C.r1, A.r1, [0, 0.5, 1]);
        if (k === 0) B.quadO('slat', A.r0, A.t0, A.t1, A.r1, [-1, 0, 0]);
        if (k === segs - 1) B.quadO('slat', C.r0, C.t0, C.t1, C.r1, [1, 0, 0]);
      }
    }
  }
  const segs = 40;
  for (const [za, zb] of [[RAD_Z, RAD_Z + 0.06]]) {
    const hw = WRING(za) + 0.02;
    for (let k = 0; k < segs; k++) {
      const x0 = -hw + 2 * hw * k / segs, x1 = -hw + 2 * hw * (k + 1) / segs;
      const y = (x, z) => yTop(x, z) + 0.03;
      B.quadO('frame', [x0, y(x0, za), za], [x1, y(x1, za), za], [x1, y(x1, zb), zb], [x0, y(x0, zb), zb], [0, 1, 0]);
      B.quadO('frame', [x0, y(x0, za) - 0.08, za], [x1, y(x1, za) - 0.08, za], [x1, y(x1, za), za], [x0, y(x0, za), za], [0, 0.2, -1]);
    }
  }
  if (lod) return;
  for (const f of [-0.34, 0.34]) for (let z = z0 - 0.05; z < z1 + 0.05; z += 0.1) {
    const x = f * (WRING(z) - 0.16), za = z, zb = Math.min(z1 + 0.1, z + 0.1);
    const ya = yTop(x, za) - 0.05, yb = yTop(x, zb) - 0.05;
    B.quadO('frame', [x - 0.025, ya + 0.11, za], [x + 0.025, ya + 0.11, za], [x + 0.025, yb + 0.11, zb], [x - 0.025, yb + 0.11, zb], [0, 1, 0]);
    for (const sx of [-1, 1]) B.quadO('frame', [x + sx * 0.025, ya, za], [x + sx * 0.025, yb, zb], [x + sx * 0.025, yb + 0.11, zb], [x + sx * 0.025, ya + 0.11, za], [sx, 0, 0]);
  }
}

function chamferRectPath(path, x0, y0, x1, y1, cb, ct) {
  path.moveTo(x0 + cb, y0);
  path.lineTo(x1 - cb, y0);
  path.lineTo(x1, y0 + cb);
  path.lineTo(x1, y1 - ct);
  path.lineTo(x1 - ct, y1);
  path.lineTo(x0 + ct, y1);
  path.lineTo(x0, y1 - ct);
  path.lineTo(x0, y0 + cb);
  path.lineTo(x0 + cb, y0);
  return path;
}

function roundedRectPath(path, x0, y0, x1, y1, r) {
  const [rbl, rbr, rtr, rtl] = Array.isArray(r) ? r : [r, r, r, r];
  path.moveTo(x0 + rbl, y0);
  path.lineTo(x1 - rbr, y0);
  if (rbr) path.quadraticCurveTo(x1, y0, x1, y0 + rbr);
  path.lineTo(x1, y1 - rtr);
  if (rtr) path.quadraticCurveTo(x1, y1, x1 - rtr, y1);
  path.lineTo(x0 + rtl, y1);
  if (rtl) path.quadraticCurveTo(x0, y1, x0, y1 - rtl);
  path.lineTo(x0, y0 + rbl);
  if (rbl) path.quadraticCurveTo(x0, y0, x0 + rbl, y0);
  return path;
}

const BODY = { x: 3.95, y0: -0.35, y1: 2.0, zFace: 8.0, depth: 1.4 };
const BAY = { xi: 1.35, xo: 3.75, y0: 0.05, y1: 1.79 };
const DOOR = { w: 2.3, h: 1.9, panelW: 2.5, panelH: 2.04, panelY: -0.06, drop: 2.0 };
const AIRLOCK = { z0: BODY.zFace - BODY.depth + 0.04, innerW: 1.24, innerH: 1.74 };

function bayShape(s, inset = 0) {
  const p = new THREE.Path();
  const xi = s * (BAY.xi + inset), xo = s * (BAY.xo - inset);
  const x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
  const ro = Math.max(0.02, 0.35 - inset), ri = Math.max(0.02, 0.08 - inset * 0.5);
  const r = s > 0 ? [ri, ro, ro, ri] : [ro, ri, ri, ro];
  return roundedRectPath(p, x0, BAY.y0 + inset, x1, BAY.y1 - inset, r);
}

function rearBody(B, lod) {
  const shape = chamferRectPath(new THREE.Shape(), -BODY.x, BODY.y0, BODY.x, BODY.y1, 0.32, 0.14);
  if (!lod) {
    shape.holes.push(bayShape(-1), bayShape(1));
    shape.holes.push(roundedRectPath(new THREE.Path(), -DOOR.w / 2, 0, DOOR.w / 2, DOOR.h, 0.05));
  }
  const bt = 0.035;
  const g = new THREE.ExtrudeGeometry(shape, { depth: BODY.depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: lod ? 1 : 2, curveSegments: lod ? 3 : 10 });
  B.geometry('frame', g, new THREE.Matrix4().makeTranslation(0, 0, BODY.zFace - BODY.depth - bt));
  g.dispose();
  const surround = chamferRectPath(new THREE.Shape(), -1.32, BODY.y0 + 0.02, 1.32, BODY.y1 - 0.02, 0.06, 0.06);
  if (!lod) surround.holes.push(roundedRectPath(new THREE.Path(), -DOOR.w / 2 - 0.01, -0.01, DOOR.w / 2 + 0.01, DOOR.h + 0.01, 0.05));
  const sg = new THREE.ExtrudeGeometry(surround, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 8 });
  B.geometry('white', sg, new THREE.Matrix4().makeTranslation(0, 0, BODY.zFace - 0.004));
  sg.dispose();
  const zBack = BODY.zFace - BODY.depth + 0.1;
  for (const s of [-1, 1]) {
    if (lod) {
      const xi = s * BAY.xi, xo = s * BAY.xo;
      B.quadO('glow', [xi, BAY.y0, 8.04], [xo, BAY.y0, 8.04], [xo, BAY.y1, 8.04], [xi, BAY.y1, 8.04], [0, 0, 1]);
      continue;
    }
    const liner = new THREE.ExtrudeGeometry(new THREE.Shape(bayShape(s, 0.012).getPoints(12)), { depth: BODY.depth - 0.12, bevelEnabled: false, curveSegments: 12 });
    B.geometry('frame', liner, new THREE.Matrix4().makeTranslation(0, 0, zBack), { flip: true, groups: [1] });
    liner.dispose();
    const back = new THREE.ShapeGeometry(new THREE.Shape(bayShape(s, 0.01).getPoints(12)));
    B.geometry('frame', back, new THREE.Matrix4().makeTranslation(0, 0, zBack));
    back.dispose();
    const vanes = 12;
    for (let k = 0; k < vanes; k++) {
      const x = s * (BAY.xi + 0.16 + (BAY.xo - BAY.xi - 0.32) * k / (vanes - 1));
      const vane = new THREE.BoxGeometry(0.014, BAY.y1 - BAY.y0 - 0.14, 0.34);
      B.geometry('slat', vane, new THREE.Matrix4().makeRotationY(s * 0.62).setPosition(x, (BAY.y0 + BAY.y1) / 2, 6.98));
      vane.dispose();
    }
    const cowl = new THREE.ExtrudeGeometry(new THREE.Shape(bayShape(s, 0.09).getPoints(12)), { depth: 0.07, bevelEnabled: false, curveSegments: 12 });
    B.geometry('engine', cowl, new THREE.Matrix4().makeTranslation(0, 0, 7.3), { flip: true, groups: [1] });
    cowl.dispose();
  }
  if (lod) return;
  for (const [x, y] of [[-1.24, 1.92], [1.24, 1.92], [-1.24, -0.22], [1.24, -0.22]]) {
    const c = new THREE.CylinderGeometry(0.035, 0.04, 0.03, 14);
    B.geometry('metal', c, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, BODY.zFace + 0.03));
    c.dispose();
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const g2 = new THREE.BoxGeometry(0.3, 0.018, 0.02);
      B.geometry('metal', g2, new THREE.Matrix4().makeTranslation(s * (BAY.xi + 0.35 + k * 0.42), -0.2, BODY.zFace + 0.01));
      g2.dispose();
    }
    const track = new THREE.BoxGeometry(0.04, BODY.y1 - BODY.y0 - 0.1, 0.02);
    B.geometry('metal', track, new THREE.Matrix4().makeTranslation(s * 1.29, (BODY.y0 + BODY.y1) / 2, BODY.zFace + 0.04));
    track.dispose();
    const plate = new THREE.BoxGeometry(0.46, 0.18, 0.02);
    B.geometry('white', plate, new THREE.Matrix4().makeTranslation(s * 3.25, -0.1, BODY.zFace + 0.01));
    plate.dispose();
  }
  const zi = AIRLOCK.z0, L = BODY.zFace - zi;
  const lin = new THREE.ExtrudeGeometry(new THREE.Shape(roundedRectPath(new THREE.Path(), -DOOR.w / 2 + 0.012, 0.012, DOOR.w / 2 - 0.012, DOOR.h - 0.012, 0.04).getPoints(8)), { depth: L - 0.02, bevelEnabled: false });
  B.geometry('white', lin, new THREE.Matrix4().makeTranslation(0, 0, zi), { flip: true, groups: [1] });
  lin.dispose();
  const endWall = new THREE.Shape([new THREE.Vector2(-DOOR.w / 2, 0), new THREE.Vector2(DOOR.w / 2, 0), new THREE.Vector2(DOOR.w / 2, DOOR.h), new THREE.Vector2(-DOOR.w / 2, DOOR.h)]);
  endWall.holes.push(roundedRectPath(new THREE.Path(), -AIRLOCK.innerW / 2, 0.0, AIRLOCK.innerW / 2, AIRLOCK.innerH, 0.06));
  const ew = new THREE.ShapeGeometry(endWall, 6);
  B.geometry('white', ew, new THREE.Matrix4().makeTranslation(0, 0, zi + 0.012));
  ew.dispose();
  const floorG = new THREE.BoxGeometry(DOOR.w - 0.1, 0.02, L - 0.08);
  B.geometry('frame', floorG, new THREE.Matrix4().makeTranslation(0, 0.012, zi + L / 2));
  floorG.dispose();
  for (let k = 0; k < 10; k++) { const tg = new THREE.BoxGeometry(DOOR.w - 0.3, 0.008, 0.03); B.geometry('rubber', tg, new THREE.Matrix4().makeTranslation(0, 0.025, zi + 0.12 + k * (L - 0.24) / 9)); tg.dispose(); }
  for (const s of [-1, 1]) {
    const rail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * (DOOR.w / 2 - 0.012), 1.05, zi + 0.15), new THREE.Vector3(s * (DOOR.w / 2 - 0.07), 1.05, zi + 0.2), new THREE.Vector3(s * (DOOR.w / 2 - 0.07), 1.05, BODY.zFace - 0.25), new THREE.Vector3(s * (DOOR.w / 2 - 0.012), 1.05, BODY.zFace - 0.2)]), 16, 0.016, 8, false);
    B.geometry('metal', rail, null); rail.dispose();
    const box = new THREE.BoxGeometry(0.06, 0.5, 0.5);
    B.geometry('frame', box, new THREE.Matrix4().makeTranslation(s * (DOOR.w / 2 - 0.04), 1.5, zi + 0.6));
    box.dispose();
  }
  const lt = new THREE.BoxGeometry(DOOR.w - 0.6, 0.012, 0.08);
  B.geometry('alight', lt, new THREE.Matrix4().makeTranslation(0, DOOR.h - 0.018, zi + L / 2));
  lt.dispose();
}

function hatchDoor(lod) {
  const B = new MeshBuilder();
  const shape = roundedRectPath(new THREE.Shape(), -DOOR.panelW / 2, 0, DOOR.panelW / 2, DOOR.panelH, 0.07);
  if (!lod) { const hole = new THREE.Path(); hole.absarc(0, 1.02, 0.955, 0, Math.PI * 2, true); shape.holes.push(hole); }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: lod ? 1 : 3, curveSegments: 6 });
  B.geometry('white', g, new THREE.Matrix4().makeTranslation(0, 0, 0.02));
  g.dispose();
  const cy = 1.02, cz = 0.13;
  const disc = (r, mat, seg = 64) => { const c = new THREE.CircleGeometry(r, seg); B.geometry(mat, c, new THREE.Matrix4().makeTranslation(0, cy, cz - 0.022)); c.dispose(); };
  disc(0.92, 'frame');
  if (lod) return B;
  const lathe = (pts, mat, segs = 72) => {
    const lg = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), segs);
    B.geometry(mat, lg, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, cy, cz));
    lg.dispose();
  };
  lathe([[0.95, -0.02], [0.95, 0.015], [0.935, 0.03], [0.9, 0.03], [0.885, 0.0], [0.885, -0.02]], 'metal');
  lathe([[0.62, -0.02], [0.62, 0.005], [0.6, 0.018], [0.57, 0.018], [0.555, 0.0], [0.555, -0.02]], 'metal');
  lathe([[0.2, -0.02], [0.2, 0.03], [0.17, 0.05], [0.08, 0.055], [0.0, 0.055]], 'metal', 40);
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * Math.PI * 2;
    const sp = new THREE.BoxGeometry(0.022, 0.34, 0.012);
    B.geometry('metal', sp, new THREE.Matrix4().makeRotationZ(a).setPosition(-Math.sin(a) * 0.38, cy + Math.cos(a) * 0.38, cz - 0.012));
    sp.dispose();
    const sp2 = new THREE.BoxGeometry(0.018, 0.25, 0.01);
    B.geometry('engine', sp2, new THREE.Matrix4().makeRotationZ(a + Math.PI / 26).setPosition(-Math.sin(a + Math.PI / 26) * 0.73, cy + Math.cos(a + Math.PI / 26) * 0.73, cz - 0.014));
    sp2.dispose();
  }
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + 0.2;
    const latch = new THREE.BoxGeometry(0.08, 0.05, 0.035);
    B.geometry('metal', latch, new THREE.Matrix4().makeRotationZ(a).setPosition(-Math.sin(a) * 0.915, cy + Math.cos(a) * 0.915, cz + 0.035));
    latch.dispose();
  }
  for (const [x, y] of [[-1.08, 0.12], [1.08, 0.12], [-1.08, 1.9], [1.08, 1.9]]) {
    const c = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10);
    B.geometry('metal', c, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, 0.14));
    c.dispose();
  }
  const handle = new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI);
  B.geometry('metal', handle, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-1.12, 1.0, 0.14));
  handle.dispose();
  return B;
}

const BLADE = { rearLow: [5.42, 0.3, 7.72], rearHigh: [4.4, 1.55, 7.9], tip: [4.95, 2.45, -1.6], webZ: 0.2, t: 0.07 };

function thickTri(B, key, A, Bp, C, t, hint) {
  let n = norm3(cross3(sub3(Bp, A), sub3(C, A)));
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = n.map(q => -q);
  const T = (p) => add3(p, n, t / 2), D = (p) => add3(p, n, -t / 2);
  B.triO(key, T(A), T(Bp), T(C), n);
  B.triO(key, D(A), D(Bp), D(C), n.map(q => -q));
  const c = [(A[0] + Bp[0] + C[0]) / 3, (A[1] + Bp[1] + C[1]) / 3, (A[2] + Bp[2] + C[2]) / 3];
  for (const [p, q] of [[A, Bp], [Bp, C], [C, A]]) B.quadO(key, T(p), T(q), D(q), D(p), sub3([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], c));
}

function bladeFin(B, s, lod, scuffs = null, cfg = BLADE) {
  const S = (p) => [s * p[0], p[1], p[2]];
  const R0 = S(cfg.rearLow), T0 = S(cfg.rearHigh), C = S(cfg.tip);
  const nu = lod ? 4 : 18, nv = lod ? 1 : 4;
  const lower = (u) => lerp3(R0, C, u), upper = (u) => lerp3(T0, C, u);
  const P = (u, v) => lerp3(lower(u), upper(u), v);
  let n = norm3(cross3(sub3(C, R0), sub3(T0, R0)));
  if (n[0] * s + n[1] < 0) n = n.map(q => -q);
  const thick = (u) => cfg.t * (1 - 0.75 * u) + 0.012;
  const top = [], bot = [];
  for (let i = 0; i <= nu; i++) {
    const rt = [], rb = [], u = Math.min(i / nu, 0.995);
    for (let j = 0; j <= nv; j++) {
      const p = P(u, j / nv), t = thick(u) / 2;
      rt.push({ p: add3(p, n, t), n });
      rb.push({ p: add3(p, n, -t), n: n.map(q => -q) });
    }
    top.push(rt); bot.push(rb);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) for (const grid of [top, bot]) {
    const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
    B.triO('frame', a.p, b.p, c.p, a.n, a.n, b.n, c.n);
    B.triO('frame', a.p, c.p, d.p, a.n, a.n, c.n, d.n);
  }
  const mid = P(0.33, 0.5);
  for (const j of [0, nv]) for (let i = 0; i < nu; i++) B.quadO('frame', top[i][j].p, top[i + 1][j].p, bot[i + 1][j].p, bot[i][j].p, sub3(top[i][j].p, mid));
  for (let j = 0; j < nv; j++) B.quadO('frame', top[0][j].p, top[0][j + 1].p, bot[0][j + 1].p, bot[0][j].p, [0, 0, 1]);
  const zw = cfg.webZ, uw = (R0[2] - zw - 1.6) / (R0[2] - C[2]);
  const F = [s * (WRING(zw) + DS(zw) - 0.04), ES(zw) + 0.02, zw];
  thickTri(B, 'frame', lower(0.004), F, lower(uw), cfg.t * 0.8, [s, 0.2, 0]);
  if (scuffs && !lod) {
    const [u0, v0, u1, v1] = scuffs;
    for (let i = Math.floor(nu * 0.3); i < nu; i++) {
      const a = top[i][0], b = top[i + 1][0], c = top[i + 1][1], d = top[i][1];
      const L = (q) => add3(q.p, q.n, 0.002);
      const f0 = (i % 4) / 4, f1 = f0 + 0.25;
      B.triO('grime', L(a), L(b), L(c), a.n, a.n, b.n, c.n, [u0 + (u1 - u0) * f0, v0], [u0 + (u1 - u0) * f1, v0], [u0 + (u1 - u0) * f1, v1]);
      B.triO('grime', L(a), L(c), L(d), a.n, a.n, c.n, d.n, [u0 + (u1 - u0) * f0, v0], [u0 + (u1 - u0) * f1, v1], [u0 + (u1 - u0) * f0, v1]);
    }
  }
  return C;
}

function surfDecal(B, uvRect, cx, cz, w, h, rot, surf, { lift = 0.004, nx = 3, ny = 4, key = 'grime' } = {}) {
  const [u0, v0, u1, v1] = uvRect;
  const c = Math.cos(rot), s = Math.sin(rot);
  const ax = [c, 0, -s], bx = [-s, 0, -c];
  const pt = (fx, fy) => {
    const x = cx + ax[0] * (fx - 0.5) * w + bx[0] * (fy - 0.5) * h, z = cz + ax[2] * (fx - 0.5) * w + bx[2] * (fy - 0.5) * h;
    return [x, surf.y(x, z) + surf.s * lift, z];
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const fa = i / nx, fb = (i + 1) / nx, ga = j / ny, gb = (j + 1) / ny;
    const uv = (fx, fy) => [u0 + (u1 - u0) * fx, v0 + (v1 - v0) * fy];
    const a = pt(fa, ga), b = pt(fb, ga), cc = pt(fb, gb), d = pt(fa, gb);
    const n = surf.n(a[0], a[2]);
    B.triO(key, a, b, cc, n, n, n, n, uv(fa, ga), uv(fb, ga), uv(fb, gb));
    B.triO(key, a, cc, d, n, n, n, n, uv(fa, ga), uv(fb, gb), uv(fa, gb));
  }
}

function deckLines(windows) {
  const lines = [], rivets = [];
  const fr = [0, 0.11, 0.22, 0.33, 0.44, 0.54, 0.63, 0.72, 0.8, 0.87, 0.93];
  const fl = [...fr.slice(1).map(f => -f).reverse(), ...fr];
  for (const f of fl) {
    const pts = [];
    for (let z = -10.3; z <= RAD_Z; z += 0.1) pts.push([f * WRING(z), z]);
    lines.push(pts);
    if ([0.44, 0.8, 0.22].some(q => Math.abs(Math.abs(f) - q) < 0.01)) rivets.push({ pts, side: Math.sign(f) || 1 });
  }
  const R = rng(5150);
  const zs = [];
  for (let z = -10.0; z < RAD_Z - 0.2; z += 0.42 + R() * 0.38) zs.push(z);
  for (const z of zs) {
    for (let i = 0; i < fl.length - 1; i++) {
      if (R() < 0.35) continue;
      const pts = [];
      for (let k = 0; k <= 4; k++) { const f = fl[i] + (fl[i + 1] - fl[i]) * k / 4; pts.push([f * WRING(z), z]); }
      lines.push(pts);
      if (R() < 0.2) rivets.push({ pts, side: 1 });
    }
  }
  const hull = ccw(convexHull(windows.flatMap(w => w.poly)));
  for (const d of [0.3, 0.62, 1.0]) {
    const ring = offsetConvex(hull, d);
    const pts = sampleEdges(ring, edgeCounts(ring, 0.08));
    pts.push(pts[0]);
    lines.push(pts);
    if (d < 0.5) rivets.push({ pts, side: 1 });
  }
  const ring = offsetConvex(hull, 0.3), ctr = centroid(hull);
  for (let i = 0; i < ring.length; i++) {
    if (R() < 0.3) continue;
    const a = ring[i], dir = norm2([a[0] - ctr[0], a[1] - ctr[1]]);
    const pts = [];
    for (let t = 0; t < 4.5; t += 0.1) { const p = [a[0] + dir[0] * t, a[1] + dir[1] * t]; if (Math.abs(p[0]) > WRING(p[1]) - 0.12 || p[1] > RAD_Z) break; pts.push(p); }
    lines.push(pts);
  }
  for (const s of [-1, 1]) {
    const pts = [];
    for (let z = -2.2; z < RAD_Z; z += 0.1) { const u = 0.5 + 0.12 * Math.sin((z + 2.2) / 5.7 * Math.PI); pts.push([s * u * WRING(z), z]); }
    lines.push(pts);
  }
  return { lines, rivets, hull: offsetConvex(hull, 0.3) };
}

const DECK_UV = { x0: -3.9, x1: 3.9, z0: -10.9, z1: 3.62 };

function buildDeckTexture(windows, quality) {
  const W = quality === 'low' ? 512 : quality === 'medium' ? 1024 : 2048, H = W * 2;
  const sx = W / (DECK_UV.x1 - DECK_UV.x0), sz = H / (DECK_UV.z1 - DECK_UV.z0);
  const toPx = ([x, z]) => [(x - DECK_UV.x0) * sx, (z - DECK_UV.z0) * sz];
  const { lines, rivets, hull } = deckLines(windows);
  const seam = makeCanvas(W, H), sc = seam.getContext('2d');
  sc.fillStyle = '#000'; sc.fillRect(0, 0, W, H);
  sc.strokeStyle = '#fff'; sc.lineWidth = Math.max(1, 0.005 * sx); sc.lineJoin = 'round';
  for (const pts of lines) { if (pts.length < 2) continue; sc.beginPath(); pts.forEach((p, i) => { const q = toPx(p); i ? sc.lineTo(q[0], q[1]) : sc.moveTo(q[0], q[1]); }); sc.stroke(); }
  const riv = makeCanvas(W, H), rc = riv.getContext('2d');
  rc.fillStyle = '#000'; rc.fillRect(0, 0, W, H);
  rc.fillStyle = '#fff';
  for (const { pts, side } of rivets) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const n = Math.max(1, Math.round(l / 0.06));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; const q = toPx([a[0] + dx * t - dz / l * 0.024 * side, a[1] + dz * t + dx / l * 0.024 * side]); rc.beginPath(); rc.arc(q[0], q[1], Math.max(0.8, 0.0045 * sx), 0, 7); rc.fill(); }
    }
  }
  const gr = makeCanvas(W, H), gc = gr.getContext('2d');
  gc.fillStyle = '#000'; gc.fillRect(0, 0, W, H);
  const R = rng(9191);
  const streak = (x, z, len, wd, al) => { const a = toPx([x, z]), b = toPx([x, z + len]); const g = gc.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0)'); gc.fillStyle = g; gc.fillRect(a[0] - wd * sx / 2, a[1], wd * sx, b[1] - a[1]); };
  for (const w of windows) for (const p of w.poly.slice().sort((a, b) => b[1] - a[1]).slice(0, 6)) if (R() < 0.5) streak(p[0], p[1] + RIM, 0.25 + R() * 0.7, 0.02 + R() * 0.05, 0.25 + R() * 0.3);
  for (const { pts } of rivets) for (let i = 0; i < pts.length; i += 3) if (R() < 0.25) streak(pts[i][0], pts[i][1], 0.1 + R() * 0.45, 0.01 + R() * 0.02, 0.2 + R() * 0.3);
  for (const pts of lines) for (let i = 0; i < pts.length; i += 6) if (R() < 0.08) streak(pts[i][0], pts[i][1], 0.2 + R() * 0.8, 0.03 + R() * 0.08, 0.1 + R() * 0.15);
  const sd = sc.getImageData(0, 0, W, H).data, rd = rc.getImageData(0, 0, W, H).data, gd = gc.getImageData(0, 0, W, H).data;
  const noise = tileNoise(256, 16, 4, 9393);
  const fr = [0, 0.11, 0.22, 0.33, 0.44, 0.54, 0.63, 0.72, 0.8, 0.87, 0.93, 1.2];
  const out = makeCanvas(W, H), oc = out.getContext('2d');
  const img = oc.createImageData(W, H);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const hb = bbox(hull);
  for (let j = 0; j < H; j++) {
    const z = DECK_UV.z0 + (j + 0.5) / sz, wr = WRING(z), zband = Math.floor((z + 10.5) / 0.55);
    for (let i = 0; i < W; i++) {
      const x = DECK_UV.x0 + (i + 0.5) / sx;
      const f = Math.abs(x) / wr;
      let band = 0;
      while (band < fr.length - 1 && f > fr[band + 1]) band++;
      let id0 = band * (x < 0 ? -1 : 1) + 50, id1 = zband;
      if (x > hb[0] && x < hb[2] && z > hb[1] && z < hb[3] && insideConvex([x, z], hull)) { id0 = 200 + Math.floor((Math.atan2(z - 0.0, x) + Math.PI) / (Math.PI / 5)); id1 = 0; }
      const hsh = hash(id0, id1), hsh2 = hash(id0 + 7, id1 + 13);
      let tone = 0.885 + (hsh - 0.5) * 0.12;
      let rough = 0.55 + hsh2 * 0.25;
      let height = 0.5;
      const edgeD = wr - Math.abs(x);
      if (edgeD < 0.27 && z < RAD_Z) {
        const cs = 0.09, u = (x / cs), v = (z / cs);
        const fu = u - Math.floor(u), fv = v - Math.floor(v);
        const pd = Math.min(fu, 1 - fu, fv, 1 - fv);
        height += Math.sqrt(Math.min(1, pd / 0.25)) * 0.16 - 0.06;
        tone = 0.8 + (hsh - 0.5) * 0.05 - (pd < 0.06 ? 0.06 : 0);
        rough = 0.82;
      }
      const k = (j * W + i) * 4;
      const sm = sd[k] / 255, rv = rd[k] / 255, gv = gd[k] / 255;
      const nz = noise[((j >> 3) & 255) * 256 + ((i >> 3) & 255)];
      tone *= (1 - 0.5 * sm) * (1 - 0.07 * rv) * (1 - 0.28 * gv) * (0.97 + 0.06 * nz);
      height += -0.42 * sm + 0.32 * rv;
      rough = Math.min(1, rough + 0.2 * sm + 0.12 * gv);
      img.data[k] = Math.max(0, Math.min(255, tone * 255));
      img.data[k + 1] = Math.max(0, Math.min(255, rough * 255));
      img.data[k + 2] = Math.max(0, Math.min(255, height * 255));
      img.data[k + 3] = 255;
    }
  }
  oc.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function deckMaterial(base, tex) {
  const m = base.clone();
  m.name = 'ranger.deck';
  m.userData.deckTex = tex;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.deckTex = { value: tex };
    sh.uniforms.deckBump = { value: 2.2 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 deckUv;\nvarying vec2 vDeckUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvDeckUv = deckUv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D deckTex;\nuniform float deckBump;\nvarying vec2 vDeckUv;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 dk = texture2D(deckTex, vDeckUv);\ndiffuseColor.rgb *= dk.r;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, dk.g, 0.7);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 dSTdx = dFdx(vDeckUv), dSTdy = dFdy(vDeckUv);
  float Hll = dk.b;
  vec2 dHdxy = vec2(texture2D(deckTex, vDeckUv + dSTdx).b - Hll, texture2D(deckTex, vDeckUv + dSTdy).b - Hll) * deckBump;
  vec3 vSigmaX = normalize(dFdx(-vViewPosition)), vSigmaY = normalize(dFdy(-vViewPosition));
  vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  normal = normalize(abs(fDet) * normal - vGrad);
}`);
  };
  m.customProgramCacheKey = () => 'ranger.deck';
  return m;
}

function smudgeTexture() {
  const S = 256, c = makeCanvas(S), x = c.getContext('2d'), img = x.createImageData(S, S);
  const n = tileNoise(S, 8, 4, 6161);
  for (let i = 0; i < S * S; i++) { const v = 10 + Math.pow(n[i], 3) * 70; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function spaceEnv(renderer) {
  if (!renderer) return null;
  const sc = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 c = vec3(0.0); c += vec3(0.55, 0.6, 0.68) * smoothstep(0.02, -0.25, h) * 0.9; c += vec3(1.1, 0.95, 0.75) * pow(max(0.0, dot(vP, normalize(vec3(0.6, 0.15, -0.7)))), 60.0) * 6.0; c += vec3(0.8, 0.82, 0.86) * smoothstep(0.996, 0.999, dot(vP, normalize(vec3(-0.4, 0.3, 0.8)))) * 3.0; gl_FragColor = vec4(c, 1.0); }',
  });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.01).texture;
  pm.dispose(); mat.dispose();
  return tex;
}

function glowTexture() {
  const c = makeCanvas(256, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(128, 64, 4, 128, 64, 130);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#d0d0d0'); g.addColorStop(0.6, '#505050'); g.addColorStop(1, '#101010');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function plumeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0.5, 0.72, 1.0) }, intensity: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; varying float vT; varying vec3 vAxis; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0)); vT = uv.y; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform vec3 color; uniform float intensity; varying vec3 vN; varying vec3 vW; varying float vT; varying vec3 vAxis; void main(){ vec3 V = normalize(cameraPosition - vW); float side = pow(abs(dot(normalize(vN), V)), 1.4); float endOn = abs(dot(vAxis, V)); float core = max(side, endOn * 0.85); float t = clamp(vT, 0.0, 1.0); float along = pow(1.0 - t, 1.6) * smoothstep(0.0, 0.06, t); gl_FragColor = vec4(color * intensity * core * along, 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

function rcsBlock(B, pos, normal, yaw, holes = 4) {
  const n = new THREE.Vector3(...normal).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1));
  const plate = new THREE.BoxGeometry(0.58, 0.07, 0.26);
  B.geometry('frame', plate, m);
  plate.dispose();
  for (let k = 0; k < holes; k++) {
    const x = -0.21 + 0.42 * k / Math.max(1, holes - 1);
    const ring = new THREE.CylinderGeometry(0.05, 0.055, 0.02, 14, 1, true);
    B.geometry('metal', ring, m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0.04, 0)));
    ring.dispose();
    const cup = new THREE.CircleGeometry(0.045, 14);
    B.geometry('rubber', cup, m.clone().multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, 0.037, 0)));
    cup.dispose();
  }
}

function decalQuad(B, cell, center, normal, w, h, rot = 0, surf = null) {
  const [u0, v0, u1, v1] = decalUV(cell);
  const n = norm3(normal);
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let t1 = norm3(cross3(ref, n)), t2 = cross3(n, t1);
  if (Math.abs(n[1]) > 0.9) { t1 = [1, 0, 0]; t2 = [0, 0, -1]; if (n[1] < 0) t2 = [0, 0, 1]; }
  const c = Math.cos(rot), s = Math.sin(rot);
  const ax2 = add3(add3([0, 0, 0], t1, c), t2, s);
  const bx = add3(add3([0, 0, 0], t1, -s), t2, c);
  const nx = surf ? 4 : 1, ny = surf ? 2 : 1;
  const pt = (fx, fy) => {
    let p = add3(add3(center, ax2, (fx - 0.5) * w), bx, (fy - 0.5) * h);
    if (surf) p = [p[0], surf.y(p[0], p[2]) + 0.006, p[2]];
    return p;
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const fa = i / nx, fb = (i + 1) / nx, ga = j / ny, gb = (j + 1) / ny;
    const uv = (fx, fy) => [u0 + (u1 - u0) * fx, v0 + (v1 - v0) * fy];
    B.triO('decal', pt(fa, ga), pt(fb, ga), pt(fb, gb), n, n, n, n, uv(fa, ga), uv(fb, ga), uv(fb, gb));
    B.triO('decal', pt(fa, ga), pt(fb, gb), pt(fa, gb), n, n, n, n, uv(fa, ga), uv(fb, gb), uv(fa, gb));
  }
}

function footY(c) { return FOOT_FLIGHT + (FOOT_LANDED - FOOT_FLIGHT) * c; }

function buildLeg(gear, materials, lod) {
  const mount = new THREE.Group();
  mount.name = 'gearMount' + gear.id;
  mount.position.set(...gear.hinge);
  mount.rotation.y = gear.dir < 0 ? Math.PI : 0;
  const tiltG = new THREE.Group();
  tiltG.rotation.x = gear.tilt;
  mount.add(tiltG);
  const pivot = new THREE.Group();
  pivot.name = 'gear' + gear.id;
  tiltG.add(pivot);
  const lenAt = (c) => Math.max(LEG_MIN, (gear.hinge[1] - footY(c)) / Math.sin(GEAR_ANGLE + gear.tilt));
  const B = new MeshBuilder();
  const box = (mat, sx, sy, sz, x, y, z, rx = 0, BB = B) => { const g = new THREE.BoxGeometry(sx, sy, sz); BB.geometry(mat, g, new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z)); g.dispose(); };
  const cyl = (mat, r, l, x, y, z, axis = 'z', seg = 16, BB = B) => {
    const g = new THREE.CylinderGeometry(r, r, l, seg);
    const m = axis === 'z' ? new THREE.Matrix4().makeRotationX(Math.PI / 2) : axis === 'x' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4();
    BB.geometry(mat, g, m.setPosition(x, y, z)); g.dispose();
  };
  cyl('metal', 0.06, 0.36, 0, 0, 0, 'x');
  box('frame', 0.14, 0.14, 1.12, 0, 0, 0.58);
  box('frame', 0.18, 0.06, 0.4, 0, 0.0, 0.22);
  cyl('frame', 0.085, 0.09, 0, 0, 1.12, 'z');
  if (!lod) {
    box('frame', 0.04, 0.04, 0.9, 0.09, -0.1, 0.5, -0.12);
    box('frame', 0.04, 0.04, 0.9, -0.09, -0.1, 0.5, -0.12);
    box('metal', 0.03, 0.03, 0.26, 0, 0.11, 1.0, 0.5);
    box('metal', 0.03, 0.03, 0.26, 0, 0.11, 1.22, -0.5);
    cyl('metal', 0.016, 0.06, 0, 0.17, 1.1, 'x', 8);
    for (const sx of [-1, 1]) box('rubber', 0.012, 0.012, 0.8, sx * 0.08, 0.06, 0.6);
  }
  const slider = new THREE.Group();
  slider.position.set(0, 0, LEG_MIN);
  const SB = new MeshBuilder();
  cyl('metal', 0.05, 1.2, 0, 0, -0.6, 'z', 18, SB);
  if (!lod) cyl('frame', 0.065, 0.06, 0, 0, -0.04, 'z', 16, SB);
  const foot = new THREE.Group();
  const FB = new MeshBuilder();
  const fbox = (mat, sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); FB.geometry(mat, g, new THREE.Matrix4().makeTranslation(x, y, z)); g.dispose(); };
  const fc = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 14);
  FB.geometry('metal', fc, new THREE.Matrix4().makeRotationZ(Math.PI / 2)); fc.dispose();
  fbox('frame', 0.36, 0.06, 0.46, 0, -0.105, 0);
  fbox('rubber', 0.38, 0.025, 0.48, 0, -0.148, 0);
  if (!lod) { fbox('frame', 0.09, 0.07, 0.22, 0, -0.045, 0); for (const sx of [-1, 1]) fbox('frame', 0.025, 0.05, 0.38, sx * 0.16, -0.06, 0); }
  for (const m of B.meshes(materials)) pivot.add(m);
  for (const m of SB.meshes(materials)) slider.add(m);
  for (const m of FB.meshes(materials)) foot.add(m);
  const footAnchor = new THREE.Object3D();
  footAnchor.name = 'gearFoot' + gear.id;
  footAnchor.position.set(0, -0.16, 0);
  foot.add(footAnchor);
  slider.add(foot);
  pivot.add(slider);
  return { pivot: mount, leg: pivot, slider, foot, footAnchor, lenAt, tilt: gear.tilt };
}

function buildGearDoors(gear, materials) {
  const out = [];
  const zc = (gear.well[0][1] + gear.well[2][1]) / 2, len = gear.well[2][1] - gear.well[0][1];
  const tilt = -Math.atan((YBOT(gear.well[2][1]) - YBOT(gear.well[0][1])) / len);
  const halves = [[-1, 0.34], [1, 0.34]];
  for (const [side, w] of halves) {
    const tg = new THREE.Group();
    tg.position.set(gear.x + side * 0.34, yBottom(gear.x, zc) - 0.002, zc);
    tg.rotation.x = tilt;
    const hg = new THREE.Group();
    tg.add(hg);
    const B = new MeshBuilder();
    const g = new THREE.BoxGeometry(w, 0.022, len - 0.01);
    B.geometry('blanket', g, new THREE.Matrix4().makeTranslation(-side * w / 2, -0.011, 0)); g.dispose();
    const fr = new THREE.BoxGeometry(w - 0.06, 0.03, len - 0.08);
    B.geometry('frame', fr, new THREE.Matrix4().makeTranslation(-side * w / 2, 0.012, 0)); fr.dispose();
    for (const m of B.meshes(materials)) hg.add(m);
    out.push({ g: tg, hinge: hg, side });
  }
  return out;
}

function buildSteps(materials) {
  const root = new THREE.Group();
  root.name = 'hatchSteps';
  const slide = new THREE.Group();
  root.add(slide);
  const W = 0.86, Ls = 0.7;
  const landing = new MeshBuilder();
  const add = (BB, key, geom, m) => { BB.geometry(key, geom, m); geom.dispose(); };
  add(landing, 'white', new THREE.BoxGeometry(W + 0.08, 0.05, 0.42), new THREE.Matrix4().makeTranslation(0, -0.02, -0.21));
  add(landing, 'rubber', new THREE.BoxGeometry(W - 0.04, 0.008, 0.36), new THREE.Matrix4().makeTranslation(0, 0.009, -0.21));
  add(landing, 'metal', new THREE.CylinderGeometry(0.02, 0.02, W + 0.1, 10), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, -0.02, 0));
  for (const m of landing.meshes(materials)) slide.add(m);
  const sections = [], rails = [];
  const mkSection = () => {
    const g = new THREE.Group();
    const S = new MeshBuilder();
    for (const sx of [-1, 1]) {
      add(S, 'white', new THREE.BoxGeometry(0.035, 0.16, Ls), new THREE.Matrix4().makeTranslation(sx * (W / 2 - 0.0175), -0.06, Ls / 2));
      for (let b = 0.1; b < Ls; b += 0.2) add(S, 'metal', new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(sx * (W / 2 + 0.003), -0.06, b));
    }
    add(S, 'white', new THREE.BoxGeometry(W - 0.07, 0.012, Ls - 0.02), new THREE.Matrix4().makeTranslation(0, -0.13, Ls / 2));
    for (let t = 0.12; t < Ls; t += 0.23) {
      add(S, 'frame', new THREE.BoxGeometry(W - 0.07, 0.03, 0.17), new THREE.Matrix4().makeTranslation(0, -0.015, t));
      add(S, 'rubber', new THREE.BoxGeometry(W - 0.14, 0.006, 0.12), new THREE.Matrix4().makeTranslation(0, 0.002, t));
    }
    for (const m of S.meshes(materials)) g.add(m);
    for (const sx of [-1, 1]) {
      const pg = new THREE.Group();
      pg.position.set(sx * (W / 2 - 0.0175), 0.02, 0);
      const PB = new MeshBuilder();
      const tops = [];
      for (const z0 of [0.08, Ls - 0.08]) {
        const top = new THREE.Vector3(0, 0.82, z0);
        tops.push(top);
        const pt = new THREE.CylinderGeometry(0.014, 0.014, 0.82, 8);
        PB.geometry('metal', pt, new THREE.Matrix4().makeTranslation(0, 0.41, z0)); pt.dispose();
      }
      const rail = new THREE.TubeGeometry(new THREE.LineCurve3(tops[0].clone().add(new THREE.Vector3(0, 0, -0.05)), tops[1].clone().add(new THREE.Vector3(0, 0, 0.05))), 1, 0.016, 8, false);
      PB.geometry('metal', rail, null); rail.dispose();
      for (const m of PB.meshes(materials)) pg.add(m);
      g.add(pg);
      rails.push({ g: pg, sx });
    }
    return g;
  };
  const A = mkSection();
  slide.add(A);
  const Bsec = mkSection();
  Bsec.position.set(0, 0, Ls);
  A.add(Bsec);
  sections.push(A, Bsec);
  const footA = new THREE.Object3D();
  footA.name = 'rampFoot';
  footA.position.set(0, 0, Ls);
  Bsec.add(footA);
  return { root, slide, A, B: Bsec, rails, foot: footA, Ls, W };
}

export async function createRanger({ engine, quality, materials } = {}) {
  const q = quality || engine?.qualityName || 'high';
  const mats = materials || createHullMaterials({ renderer: engine?.renderer, quality: q });
  const own = [];
  const navMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, toneMapped: false });
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const glowTex = glowTexture();
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, toneMapped: false });
  const plumeMat = plumeMaterial();
  const alightMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const slatMat = new THREE.MeshStandardMaterial({ name: 'ranger.slat', color: 0x0d0e10, roughness: 0.45, metalness: 0.35 });
  const radBaseMat = new THREE.MeshStandardMaterial({ name: 'ranger.radBase', color: 0x050506, roughness: 0.8, metalness: 0.1 });
  const smudge = smudgeTexture();
  smudge.repeat.set(0.8, 0.8);
  const envTex = spaceEnv(engine?.renderer);
  const rglass = new THREE.MeshPhysicalMaterial({ name: 'ranger.glass', color: 0x06080b, roughness: 1, roughnessMap: smudge, metalness: 0, clearcoat: 0, envMap: envTex, envMapIntensity: 1.0, ior: 1.5 });
  const deckTex = buildDeckTexture(rangerWindows(), q);
  const deckMat = deckMaterial(mats.whitePlain || mats.white, deckTex);
  own.push(navMat, strobeMat, glowMat, glowTex, plumeMat, alightMat, slatMat, radBaseMat, smudge, rglass, deckTex, deckMat);
  if (envTex) own.push(envTex);
  const M = { ...mats, deck: deckMat, rglass, slat: slatMat, radBase: radBaseMat, nav: navMat, strobe: strobeMat, glow: glowMat, plume: plumeMat, alight: alightMat };

  const group = new THREE.Group();
  group.name = 'Ranger';
  const hi = new THREE.Group();
  hi.name = 'RangerHigh';
  group.add(hi);

  const windows = rangerWindows();
  const { loop } = ringLoop(0.2, false);
  const params = loop.map(frameParams);
  const B = new MeshBuilder();

  const ringPoly = ccw(loop.map(s => s.p));
  const deckRegion = clipConvex(ringPoly, ccw([[-20, -20], [20, -20], [20, RAD_Z], [-20, RAD_Z]]));
  const radRegion = clipConvex(ringPoly, ccw([[-20, RAD_Z], [20, RAD_Z], [20, 20], [-20, 20]]));
  const deckSurf = surfDeck();
  const panelHoles = PANELS_DECK.map(p => panelRecess(B, ccw(p), deckSurf, 'deck'));
  const deckHoles = windows.map(w => offsetConvex(w.poly, RIM)).concat(panelHoles);
  gridSurface(B, 'deck', deckRegion, deckHoles, 0.12, (x, z) => [x, yTop(x, z), z], deckNormal, (x, z) => [x, z], (x, z) => deckNormal(x, z));
  gridSurface(B, 'radBase', radRegion, [], 0.25, (x, z) => [x, yTop(x, z) - 0.05, z], deckNormal, (x, z) => [x, z], (x, z) => deckNormal(x, z));
  for (const w of windows) windowRecess(B, w, false);
  radiatorSlats(B, radRegion, false);

  const fsec = params.map((qq, i) => frameSection(loop[i], qq));
  const frameHint = (i, j) => {
    const qq = params[i], sec = fsec[i], a = sec[j], b = sec[j + 1];
    const d = [(b[0] - a[0]) * qq.nx + (b[2] - a[2]) * qq.nz, b[1] - a[1]];
    return norm3([qq.nx * -d[1], d[0], qq.nz * -d[1]]);
  };
  loft(B, 'frame', fsec, frameHint, { closed: true });

  const sideIdx = params.map((qq, i) => (qq.wr < 0.02 ? i : -1)).filter(i => i >= 0);
  const usec = sideIdx.map(i => undersideSection(loop[i], params[i]));
  const uHint = (k, j) => {
    const qq = params[sideIdx[k]], sec = usec[k], a = sec[j], b = sec[j + 1];
    const d = [(b[0] - a[0]) * qq.nx + (b[2] - a[2]) * qq.nz, b[1] - a[1]];
    return norm3([qq.nx * -d[1], d[0], qq.nz * -d[1]]);
  };
  loft(B, 'blanket', usec, uHint, { closed: false });
  for (const k of [0, sideIdx.length - 1]) capPolygon(B, 'frame', fsec[sideIdx[k]].concat(usec[k].slice(1)), [0, 0, 1], [0, 1]);

  const bottomPoly = ccw(usec.map(s => [s[4][0], s[4][2]]).concat([[-WBOT(7.6), 8.06], [WBOT(7.6), 8.06]]));
  const bottomConvex = convexHull(bottomPoly);
  const bsurf = surfBottom();
  const hatchHoles = HATCHES_BOTTOM.map(h => hatchRecess(B, h.r, bsurf, { glass: h.glass }));
  const bottomHoles = GEAR.map(g => ccw(g.well)).concat(hatchHoles);
  const zones = [
    clipConvex(bottomConvex, ccw([[-KEEL_X, -20], [KEEL_X, -20], [KEEL_X, 20], [-KEEL_X, 20]])),
    clipConvex(bottomConvex, ccw([[KEEL_X, -20], [20, -20], [20, 20], [KEEL_X, 20]])),
    clipConvex(bottomConvex, ccw([[-20, -20], [-KEEL_X, -20], [-KEEL_X, 20], [-20, 20]])),
  ];
  for (const zr of zones) gridSurface(B, 'blanket', zr, bottomHoles, 0.4, (x, z) => [x, yBottom(x, z), z], bottomNormal, (x, z) => [x, z], bottomNormal);
  {
    const zb = bbox(zones[0]);
    for (const s of [-1, 1]) for (let z = zb[1]; z < zb[3] - 1e-3; z += 0.4) {
      const z2 = Math.min(zb[3], z + 0.4);
      const x = s * KEEL_X;
      B.quadO('frame', [x, YBOT(z), z], [x, YBOT(z2), z2], [x, YBOT(z2) - KEEL_STEP, z2], [x, YBOT(z) - KEEL_STEP, z], [s, -0.2, 0]);
    }
    for (const [x, za, zbb] of [[-KEEL_X - 0.06, zb[1] + 0.3, zb[3] - 0.3], [KEEL_X + 0.06, zb[1] + 0.3, zb[3] - 0.3], [-3.45, 0, 4.0], [3.45, 0, 4.0], [-2.1, -9.0, -5.0], [2.1, -9.0, -5.0]]) {
      for (let z = za; z < zbb - 1e-3; z += 0.5) {
        const z2 = Math.min(zbb, z + 0.5), y1 = yBottom(x, z), y2 = yBottom(x, z2);
        const bm = new THREE.BoxGeometry(0.1, 0.05, z2 - z + 0.01);
        B.geometry('frame', bm, new THREE.Matrix4().makeRotationX(-Math.atan((y2 - y1) / (z2 - z))).setPosition(x, (y1 + y2) / 2 - 0.022, (z + z2) / 2));
        bm.dispose();
      }
    }
  }
  for (const g of GEAR) {
    const W = ccw(g.well);
    const top = Math.max(...W.map(([x, z]) => yBottom(x, z))) + g.depth;
    const pts = W.map(([x, z]) => [x, yBottom(x, z), z]);
    const c = centroid(W);
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      const inward = norm3([c[0] - a[0], 0, c[1] - a[2]]);
      B.quadO('rubber', a, b, [b[0], top, b[2]], [a[0], top, a[2]], inward);
    }
    B.quadO('rubber', ...W.map(([x, z]) => [x, top, z]), [0, -1, 0]);
  }

  rearBody(B, false);

  const tips = [bladeFin(B, -1, false, grimeUV('scuff')), bladeFin(B, 1, false, grimeUV('scuff'))];

  const rcs = [
    [[-2.0, yTop(-2.0, -9.6) + 0.04, -9.6], deckNormal(-2.0, -9.6), 0.25],
    [[2.0, yTop(2.0, -9.6) + 0.04, -9.6], deckNormal(2.0, -9.6), -0.25],
    [[-(WRING(6.9) + 0.25), yTop(-WRING(6.9), 6.9) + 0.09, 6.9], [0, 1, 0], Math.PI / 2],
    [[WRING(6.9) + 0.25, yTop(WRING(6.9), 6.9) + 0.09, 6.9], [0, 1, 0], Math.PI / 2],
    [[-3.25, yTop(-3.25, -2.2) + 0.03, -2.2], deckNormal(-3.25, -2.2), Math.PI / 2],
    [[3.25, yTop(3.25, -2.2) + 0.03, -2.2], deckNormal(3.25, -2.2), Math.PI / 2],
  ];
  for (const [p, n, yaw] of rcs) rcsBlock(B, p, n, yaw);
  for (const s of [-1, 1]) {
    const z = -0.8, x = s * (WRING(z) + DS(z) * 0.82), y = yTop(s * WRING(z), z) + (ES(z) - yTop(s * WRING(z), z)) * 0.8;
    rcsBlock(B, [x, y, z], [s * 0.8, 0.6, 0], 0, 3);
    rcsBlock(B, [s * 1.3, 0.0, -10.55], [0, 0.45, -0.9], 0, 3);
  }

  {
    const sp = [2.75, yTop(2.75, 3.15) + 0.01, 3.15];
    const sq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...deckNormal(sp[0], sp[2])));
    const sm = new THREE.Matrix4().compose(new THREE.Vector3(...sp), sq, new THREE.Vector3(1, 1, 1));
    const sensor = new THREE.BoxGeometry(0.5, 0.03, 0.5);
    B.geometry('white', sensor, sm); sensor.dispose();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const r = (i + j) % 2 ? 0.045 : 0.065;
      const ring = new THREE.CylinderGeometry(r, r, 0.012, 16);
      B.geometry('frame', ring, sm.clone().multiply(new THREE.Matrix4().makeTranslation(-0.15 + i * 0.15, 0.018, -0.15 + j * 0.15))); ring.dispose();
    }
    for (const [x, z, h] of [[0.9, 3.2, 0.32], [-1.6, -6.9, 0.22], [1.9, -1.9, 0.18]]) {
      const y = yTop(x, z);
      const ant = new THREE.BoxGeometry(0.03, h, 0.22);
      B.geometry('frame', ant, new THREE.Matrix4().makeRotationX(-0.25).setPosition(x, y + h / 2 - 0.02, z)); ant.dispose();
      const base = new THREE.BoxGeometry(0.1, 0.02, 0.3);
      B.geometry('metal', base, new THREE.Matrix4().makeTranslation(x, y + 0.008, z)); base.dispose();
    }
  }

  {
    const R = rng(8080);
    const GU = grimeUV;
    for (const w of windows) {
      const bb = bbox(w.poly);
      if (R() < 0.6) surfDecal(B, GU('halo'), (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, bb[2] - bb[0] + 0.36, bb[3] - bb[1] + 0.36, 0, deckSurf, { nx: 4, ny: 4, lift: 0.0045 });
    }
    for (const [x, z] of [[-2.0, -9.6], [2.0, -9.6], [0.9, 3.2], [-1.6, -6.9], [1.9, -1.9], [-3.25, -2.2], [3.25, -2.2], [2.75, 3.15]]) {
      const len = 0.6 + R() * 0.9;
      if (z + len < RAD_Z) surfDecal(B, GU('streakWide'), x, z + 0.15 + len / 2, 0.35, len, 0, deckSurf, { ny: 5 });
    }
    for (let i = 0; i < 40; i++) {
      const z = -10 + R() * 13, x = (R() * 2 - 1) * (WRING(z) - 0.35), sz = 0.3 + R() * 0.9;
      if (z > RAD_Z - 0.4) continue;
      surfDecal(B, GU('blotch'), x, z, sz, sz * (0.6 + R() * 0.8), R() * 3, deckSurf);
    }
    const sc = GU('scuff'), sd = GU('scuffDots');
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length, qq = params[i];
      if (!(qq.wn > 0.15 || loop[i].p[1] < -4.5 || qq.wr > 0.3)) continue;
      const A = fsec[i], C = fsec[j];
      const quad = (k0, k1, uv) => {
        const n = frameHint(i, k0), L = (p) => add3(p, n, 0.003);
        const f0 = (i % 3) / 3, f1 = f0 + 1 / 3;
        const U = (f, v) => [uv[0] + (uv[2] - uv[0]) * f, uv[1] + (uv[3] - uv[1]) * v];
        B.triO('grime', L(A[k0]), L(C[k0]), L(C[k1]), n, n, n, n, U(f0, 0), U(f1, 0), U(f1, 1));
        B.triO('grime', L(A[k0]), L(C[k1]), L(A[k1]), n, n, n, n, U(f0, 0), U(f1, 1), U(f0, 1));
      };
      quad(4, 5, sc); quad(5, 6, sc);
      if (qq.wn > 0.15) quad(2, 3, sd);
    }
  }

  decalQuad(B, 'callsign', [-2.9, 0, 2.55], [0, 1, 0], 0.8, 0.4, Math.PI / 2, deckSurf);
  decalQuad(B, 'callsign', [2.3, 0, -6.4], [0, 1, 0], 1.3, 0.65, -Math.PI / 2, deckSurf);
  decalQuad(B, 'noStep', [-0.9, 0, -6.0], [0, 1, 0], 0.6, 0.15, Math.PI, deckSurf);
  decalQuad(B, 'noStep', [1.2, 0, 3.15], [0, 1, 0], 0.6, 0.15, Math.PI, deckSurf);
  decalQuad(B, 'warning', [2.35, 0, 1.6], [0, 1, 0], 0.16, 0.16, 0, deckSurf);
  decalQuad(B, 'stencil', [2.6, 0, 1.25], [0, 1, 0], 0.45, 0.45, Math.PI / 2, deckSurf);
  decalQuad(B, 'stencil', [-2.9, 0, -2.95], [0, 1, 0], 0.4, 0.4, -Math.PI / 2, deckSurf);
  decalQuad(B, 'rescue', [-1.45, 0, 2.7], [0, 1, 0], 0.5, 0.25, Math.PI, deckSurf);
  decalQuad(B, 'flag', [-3.25, -0.1, BODY.zFace + 0.022], [0, 0, 1], 0.24, 0.16, 0);
  decalQuad(B, 'callsign', [3.25, -0.1, BODY.zFace + 0.022], [0, 0, 1], 0.36, 0.17, 0);
  decalQuad(B, 'hotExhaust', [-2.55, -0.06, BODY.zFace + 0.04], [0, 0, 1], 0.6, 0.15, 0);
  decalQuad(B, 'hotExhaust', [2.55, -0.06, BODY.zFace + 0.04], [0, 0, 1], 0.6, 0.15, 0);

  const statics = B.meshes(M);
  const deckMesh = statics.find(m => m.name === 'deck');
  if (deckMesh) {
    const P = deckMesh.geometry.attributes.position, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = (P.getX(i) - DECK_UV.x0) / (DECK_UV.x1 - DECK_UV.x0); uv[i * 2 + 1] = (P.getZ(i) - DECK_UV.z0) / (DECK_UV.z1 - DECK_UV.z0); }
    deckMesh.geometry.setAttribute('deckUv', new THREE.BufferAttribute(uv, 2));
  }
  statics.forEach(m => hi.add(m));

  const navLights = [];
  const navPoint = (p, color, size = 0.05) => {
    const g = new THREE.SphereGeometry(size, 10, 8);
    const cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) col.set(color, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    navLights.push({ p, color });
    return [g, p];
  };
  const navGeo = mergeColored([
    navPoint(tips[0], [1, 0.04, 0.02]), navPoint(tips[1], [0.03, 1, 0.12]),
    navPoint([-2.25, 0.0, -10.7], [1, 0.04, 0.02], 0.035), navPoint([2.25, 0.0, -10.7], [0.03, 1, 0.12], 0.035),
    navPoint([0, 2.15, 8.2], [1, 0.95, 0.9], 0.04),
    ...[[-1.24, 1.92], [1.24, 1.92], [-1.24, -0.22], [1.24, -0.22]].map(([x, y]) => navPoint([x, y, BODY.zFace + 0.05], [1, 0.55, 0.12], 0.024)),
  ]);
  const navMesh = new THREE.Mesh(navGeo, navMat);
  navMesh.name = 'navLights';
  group.add(navMesh);
  const strobeGeo = new THREE.SphereGeometry(0.045, 10, 8);
  const strobePts = [[-5.45, 0.32, 7.5], [5.45, 0.32, 7.5], [0, YBOT(1) - KEEL_STEP - 0.04, 1]];
  const strobeMesh = new THREE.InstancedMesh(strobeGeo, strobeMat, strobePts.length);
  strobePts.forEach((p, i) => strobeMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(...p)));
  strobeMesh.name = 'strobes';
  group.add(strobeMesh);
  own.push(strobeGeo, navGeo);

  const GB = new MeshBuilder();
  for (const s of [-1, 1]) {
    const pl = new THREE.PlaneGeometry(BAY.xo - BAY.xi - 0.05, BAY.y1 - BAY.y0 - 0.05);
    GB.geometry('glow', pl, new THREE.Matrix4().makeTranslation(s * (BAY.xi + BAY.xo) / 2, (BAY.y0 + BAY.y1) / 2, BODY.zFace - BODY.depth + 0.12), { uv: 'keep' });
    pl.dispose();
  }
  GB.meshes(M, { shadows: false }).forEach(m => hi.add(m));
  const engineLights = [-1, 1].map(s => { const l = new THREE.PointLight(0x9cc4ff, 0, 4.5, 2); l.position.set(s * (BAY.xi + BAY.xo) / 2, (BAY.y0 + BAY.y1) / 2, 7.25); hi.add(l); return l; });

  const plume = new THREE.Group();
  plume.name = 'plume';
  plume.visible = false;
  for (const s of [-1, 1]) {
    const cg = new THREE.CylinderGeometry(1.0, 0.62, 8.0, 40, 1, true);
    cg.rotateX(Math.PI / 2);
    const pm = new THREE.Mesh(cg, plumeMat);
    pm.scale.set(1.15, 0.78, 1);
    pm.position.set(s * (BAY.xi + BAY.xo) / 2, (BAY.y0 + BAY.y1) / 2, BODY.zFace + 4.0);
    pm.renderOrder = 10;
    pm.frustumCulled = false;
    plume.add(pm);
    own.push(cg);
  }
  hi.add(plume);

  const jetMat = plumeMaterial();
  jetMat.uniforms.color.value.setRGB(0.8, 0.9, 1.0);
  jetMat.uniforms.intensity.value = 2.6;
  const jetGeo = new THREE.CylinderGeometry(0.2, 0.04, 1, 14, 1, true);
  jetGeo.rotateX(Math.PI / 2);
  jetGeo.translate(0, 0, 0.5);
  own.push(jetMat, jetGeo);
  const jetGroup = new THREE.Group();
  jetGroup.name = 'jets';
  const jets = [];
  const jetAxis = new THREE.Vector3(0, 0, 1), jetT = new THREE.Vector3();
  const addJet = (p, n, size = 1, length = 1.3) => {
    const dir = new THREE.Vector3(...n).normalize();
    const m = new THREE.Mesh(jetGeo, jetMat);
    m.position.set(...p).addScaledVector(dir, 0.05);
    m.quaternion.setFromUnitVectors(jetAxis, dir);
    m.visible = false; m.renderOrder = 10; m.frustumCulled = false;
    jetGroup.add(m);
    jets.push({ mesh: m, p: new THREE.Vector3(...p), f: dir.clone().negate(), size, length, level: 0, target: 0, belly: dir.y < -0.9 });
  };
  for (const s of [-1, 1]) {
    addJet([s * 2.0, yTop(s * 2.0, -9.6) + 0.04, -9.6], deckNormal(s * 2.0, -9.6));
    addJet([s * (WRING(6.9) + 0.25), yTop(s * WRING(6.9), 6.9) + 0.09, 6.9], [0, 1, 0]);
    addJet([s * 3.25, yTop(s * 3.25, -2.2) + 0.03, -2.2], deckNormal(s * 3.25, -2.2));
    addJet([s * (WRING(-0.8) + DS(-0.8) * 0.82), yTop(s * WRING(-0.8), -0.8) + (ES(-0.8) - yTop(s * WRING(-0.8), -0.8)) * 0.8, -0.8], [s * 0.8, 0.6, 0]);
    addJet([s * 1.3, 0.0, -10.55], [0, 0.45, -0.9]);
    addJet([s * 4.3, 0.35, BODY.zFace - 0.2], [s * 0.25, 0, 1], 0.9, 1.4);
    addJet([s * 2.4, yBottom(s * 2.4, -5.0) - 0.02, -5.0], [0, -1, 0], 1.9, 2.6);
    addJet([s * 2.9, yBottom(s * 2.9, 4.6) - 0.02, 4.6], [0, -1, 0], 1.9, 2.6);
  }
  hi.add(jetGroup);
  const setRcs = (lin, ang, hover = 0) => {
    for (const j of jets) {
      let w = lin ? Math.max(0, j.f.x * lin.x + j.f.y * lin.y + j.f.z * lin.z) : 0;
      if (ang) { jetT.crossVectors(j.p, j.f); const l = jetT.length(); if (l > 0.3) w += Math.max(0, jetT.dot(ang) / l); }
      if (hover && j.belly) w += hover;
      j.target = Math.min(1, w);
    }
  };

  const doorGroup = new THREE.Group();
  doorGroup.name = 'hatchDoor';
  const DB = hatchDoor(false);
  decalQuad(DB, 'callsign', [-0.92, 1.88, 0.132], [0, 0, 1], 0.3, 0.15, 0);
  decalQuad(DB, 'pushOpen', [0.92, 1.88, 0.132], [0, 0, 1], 0.3, 0.15, 0);
  decalQuad(DB, 'flag', [-1.0, 0.14, 0.132], [0, 0, 1], 0.2, 0.15, 0);
  DB.meshes(M).forEach(m => doorGroup.add(m));
  doorGroup.position.set(0, DOOR.panelY, BODY.zFace);
  hi.add(doorGroup);
  const innerDoor = new THREE.Group();
  innerDoor.name = 'airlockInnerDoor';
  {
    const IB = new MeshBuilder();
    const pg = new THREE.BoxGeometry(AIRLOCK.innerW + 0.02, AIRLOCK.innerH + 0.01, 0.05);
    IB.geometry('white', pg, new THREE.Matrix4().makeTranslation(0, AIRLOCK.innerH / 2, AIRLOCK.z0 - 0.01)); pg.dispose();
    const wg = new THREE.CircleGeometry(0.15, 24);
    IB.geometry('rglass', wg, new THREE.Matrix4().makeTranslation(0, 1.3, AIRLOCK.z0 + 0.016)); wg.dispose();
    const rg = new THREE.TorusGeometry(0.16, 0.012, 6, 32);
    IB.geometry('metal', rg, new THREE.Matrix4().makeTranslation(0, 1.3, AIRLOCK.z0 + 0.018)); rg.dispose();
    const lv = new THREE.BoxGeometry(0.04, 0.3, 0.03);
    IB.geometry('metal', lv, new THREE.Matrix4().makeTranslation(0.45, 0.95, AIRLOCK.z0 + 0.03)); lv.dispose();
    IB.meshes(M).forEach(m => innerDoor.add(m));
  }
  hi.add(innerDoor);

  const steps = buildSteps(M);
  steps.root.position.set(0, 0, BODY.zFace);
  steps.root.visible = false;
  hi.add(steps.root);

  const legs = GEAR.map(g => buildLeg(g, M, false));
  legs.forEach(l => hi.add(l.pivot));
  const doors = GEAR.flatMap(g => buildGearDoors(g, M));
  doors.forEach(d => hi.add(d.g));

  const lod = new THREE.Group();
  lod.name = 'RangerLOD';
  lod.visible = false;
  {
    const LB = new MeshBuilder();
    const { loop: L2 } = ringLoop(1.0, true);
    const p2 = L2.map(frameParams);
    const f2 = p2.map((qq, i) => frameSection(L2[i], qq));
    loft(LB, 'frame', f2, (i, j) => { const qq = p2[i]; const a = f2[i][j], b = f2[i][j + 1]; const d = [(b[0] - a[0]) * qq.nx + (b[2] - a[2]) * qq.nz, b[1] - a[1]]; return norm3([qq.nx * -d[1], d[0], qq.nz * -d[1]]); }, { closed: true });
    const si = p2.map((qq, i) => (qq.wr < 0.02 ? i : -1)).filter(i => i >= 0);
    const u2 = si.map(i => undersideSection(L2[i], p2[i]));
    loft(LB, 'blanket', u2, (k, j) => { const qq = p2[si[k]]; const a = u2[k][j], b = u2[k][j + 1]; const d = [(b[0] - a[0]) * qq.nx + (b[2] - a[2]) * qq.nz, b[1] - a[1]]; return norm3([qq.nx * -d[1], d[0], qq.nz * -d[1]]); });
    for (const k of [0, si.length - 1]) capPolygon(LB, 'frame', f2[si[k]].concat(u2[k].slice(1)), [0, 0, 1], [0, 1]);
    const rp = ccw(L2.map(s => s.p));
    gridSurface(LB, 'white', clipConvex(rp, ccw([[-20, -20], [20, -20], [20, RAD_Z], [-20, RAD_Z]])), [], 1.0, (x, z) => [x, yTop(x, z), z], deckNormal, (x, z) => [x, z], deckNormal);
    gridSurface(LB, 'slat', clipConvex(rp, ccw([[-20, RAD_Z], [20, RAD_Z], [20, 20], [-20, 20]])), [], 1.0, (x, z) => [x, yTop(x, z) - 0.02, z], deckNormal, (x, z) => [x, z], deckNormal);
    for (const w of windows) {
      const gp = w.poly.map(([x, z]) => [x, yTop(x, z) + 0.012, z]);
      for (let k = 1; k < gp.length - 1; k++) LB.triO('rglass', gp[0], gp[k], gp[k + 1], [0, 1, 0]);
    }
    gridSurface(LB, 'blanket', bottomConvex, [], 2.0, (x, z) => [x, YBOT(z), z], bottomNormal, (x, z) => [x, z], bottomNormal);
    rearBody(LB, true);
    bladeFin(LB, -1, true); bladeFin(LB, 1, true);
    const dg = new THREE.BoxGeometry(DOOR.panelW, DOOR.panelH, 0.12);
    LB.geometry('white', dg, new THREE.Matrix4().makeTranslation(0, DOOR.panelY + DOOR.panelH / 2, BODY.zFace + 0.06)); dg.dispose();
    const dd = new THREE.CircleGeometry(0.92, 24);
    LB.geometry('metal', dd, new THREE.Matrix4().makeTranslation(0, DOOR.panelY + 1.02, BODY.zFace + 0.125)); dd.dispose();
    LB.meshes(M, { shadows: false }).forEach(m => lod.add(m));
    lod.userData.triangles = LB.tris;
  }
  group.add(lod);

  const anchors = {};
  const anchor = (name, pos, lookDir, parent = group) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(...pos);
    if (lookDir) o.lookAt(new THREE.Vector3(...pos).add(new THREE.Vector3(...lookDir)));
    parent.add(o);
    anchors[name] = o;
    return o;
  };
  anchor('dockPort', [0, DOOR.panelY + 1.02, BODY.zFace + 0.2], [0, 0, 1]);
  anchor('hatchOutside', [0, 0, BODY.zFace + 0.75], [0, 0, 1]);
  anchor('hatchInside', [0, 0, AIRLOCK.z0 - 0.35], [0, 0, -1]);
  anchor('pilotEye', [-0.85, 1.2, -0.8], [0, 0, -1]);
  anchor('copilotEye', [0.85, 1.2, -0.8], [0, 0, -1]);
  anchor('noseCam', [0.0, yTop(0, -3.2) + 0.25, -3.2], [0, -0.05, -1]);
  anchor('rampTop', [0, 0, BODY.zFace], [0, 0, 1]);
  anchors.rampFoot = steps.foot;
  for (const l of legs) anchors[l.footAnchor.name] = l.footAnchor;

  const tmpBox = new THREE.Box3();
  for (const m of statics) tmpBox.union(m.geometry.boundingBox);
  const bounds = tmpBox.clone();

  const state = { gear: 0, hatch: 0, engine: 0, ramp: 0, stance: 0, lights: false, t: 0, flicker: 0, lodAuto: false, plumeGain: 1 };
  const glowColor = new THREE.Color(0.55, 0.75, 1.0);
  const applyGear = () => {
    const v = state.gear;
    const dOpen = smooth(0, 0.3, v), e = smooth(0.15, 1, v);
    for (const l of legs) {
      l.leg.rotation.x = e * GEAR_ANGLE;
      l.slider.position.z = LEG_MIN + (l.lenAt(state.stance) - LEG_MIN) * e;
      l.foot.rotation.x = -(e * GEAR_ANGLE + l.tilt);
    }
    for (const d of doors) d.hinge.rotation.z = d.side * dOpen * 100 * DEG;
    applySteps();
  };
  const setGear = (v) => { state.gear = Math.max(0, Math.min(1, v)); applyGear(); group.updateMatrixWorld(true); };
  const setStance = (s) => { state.stance = typeof s === 'number' ? Math.max(0, Math.min(1, s)) : s === 'landed' ? 1 : 0; applyGear(); group.updateMatrixWorld(true); };
  const gearHeightNow = () => -(footY(state.stance) - 0.16);
  const doorDrop = () => smooth(0.2, 1, state.hatch) * DOOR.drop;
  const applySteps = () => {
    const r = state.ramp * smooth(0.92, 1, state.hatch);
    steps.root.visible = r > 0.001;
    const slideOut = smooth(0, 0.3, r);
    steps.slide.position.z = -1.1 + 1.42 * slideOut;
    const hingeY = 0.0;
    const water = -gearHeightNow() + WATER_ABOVE_GROUND;
    const drop = hingeY - (water - 0.12);
    const theta = Math.asin(Math.max(0.3, Math.min(0.98, drop / (2 * steps.Ls))));
    const swing = smooth(0.3, 0.75, r), unfold = smooth(0.55, 0.95, r);
    steps.A.position.set(0, 0, 0);
    steps.A.rotation.x = theta * swing;
    steps.B.rotation.x = Math.PI * (1 - unfold);
    const rf = smooth(0.85, 1, r);
    for (const rl of steps.rails) rl.g.rotation.z = -rl.sx * (110 * DEG) * (1 - rf);
  };
  const setHatch = (v) => {
    state.hatch = Math.max(0, Math.min(1, v));
    const a = smooth(0, 0.2, state.hatch);
    const drop = doorDrop();
    doorGroup.position.set(0, DOOR.panelY - drop, BODY.zFace + a * 0.16);
    applySteps();
  };
  const setRamp = (v) => { state.ramp = Math.max(0, Math.min(1, v)); applySteps(); group.updateMatrixWorld(true); };
  const applyEngine = () => {
    const v = state.engine;
    const k = v * (1 + state.flicker * 0.06);
    glowMat.color.copy(glowColor).multiplyScalar(k * 30);
    plumeMat.uniforms.intensity.value = k * 2.4 * state.plumeGain;
    plume.visible = v > 0.01;
    plume.scale.set(1, 1, 0.45 + 0.55 * v);
    plume.position.z = BODY.zFace * (1 - (0.45 + 0.55 * v));
    for (const l of engineLights) l.intensity = k * 14;
  };
  const setEngine = (v) => { state.engine = Math.max(0, Math.min(1, v)); applyEngine(); };
  const setPlumeGain = (v) => { if (v === state.plumeGain) return; state.plumeGain = v; jetMat.uniforms.intensity.value = 2.6 * v; applyEngine(); };
  const setLights = (on) => {
    state.lights = !!on;
    navMat.color.setScalar(on ? 24 : 0.02);
    alightMat.color.setScalar(on ? 6 : 0);
    if (!on) strobeMat.color.setScalar(0.02);
  };
  const setLOD = (low) => { lod.visible = !!low; hi.visible = !low; };
  const rampData = () => {
    const sr = state.ramp, sh = state.hatch;
    state.ramp = 1; state.hatch = 1; applySteps(); group.updateMatrixWorld(true);
    const fp = group.worldToLocal(steps.foot.getWorldPosition(new THREE.Vector3()));
    state.ramp = sr; state.hatch = sh; applySteps(); group.updateMatrixWorld(true);
    return { from: [0, 0, BODY.zFace], to: [0, +fp.y.toFixed(3), +fp.z.toFixed(3)], width: steps.W - 0.06, door: [0, DOOR.panelY + DOOR.panelH - DOOR.drop, BODY.zFace + 0.23] };
  };
  setGear(0); setHatch(0); setRamp(0); setEngine(0); setLights(false);

  const tris = (obj) => { let t = 0; obj.traverse(o => { if (o.isMesh && o.geometry) { const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } }); return t; };
  const wp = new THREE.Vector3(), cp = new THREE.Vector3();

  return {
    group,
    lod,
    anchors,
    bounds,
    windows,
    materials: M,
    parts: { innerDoor, door: doorGroup, steps: steps.root },
    get gearHeight() { return gearHeightNow(); },
    get ramp() { return rampData(); },
    shape: { yTop, deckNormal, yBottom, ringPoly, hullThickness: HULL_T, body: BODY, door: DOOR, airlock: AIRLOCK },
    setGear, setHatch, setRamp, setStance, setEngine, setPlumeGain, setRcs, setLights, setLOD,
    setGlassEnv(tex, intensity = 1) { rglass.envMap = tex; rglass.envMapIntensity = intensity; rglass.needsUpdate = true; },
    setAutoLOD(on) { state.lodAuto = !!on; },
    get stance() { return state.stance; },
    get ramp01() { return state.ramp; },
    get gear() { return state.gear; }, get hatch() { return state.hatch; }, get engine() { return state.engine; }, get lights() { return state.lights; },
    stats() { return { high: tris(hi), lod: tris(lod), drawCallsHigh: countMeshes(hi), drawCallsLod: countMeshes(lod) }; },
    update(dt, camera) {
      state.t += dt;
      if (state.lights) strobeMat.color.setScalar(state.t % 1.6 < 0.06 ? 60 : 0.02);
      if (state.engine > 0) { state.flicker = Math.sin(state.t * 53.0) * 0.5 + Math.sin(state.t * 31.7) * 0.5; applyEngine(); }
      for (const j of jets) {
        j.level += (j.target - j.level) * Math.min(1, dt * 16);
        const v = j.level, on = v > 0.03 && hi.visible;
        if (on !== j.mesh.visible) j.mesh.visible = on;
        if (on) { const k = j.size * (0.55 + 0.45 * v), f = 1 + 0.1 * Math.sin(state.t * 61 + j.p.x * 3 + j.p.z); j.mesh.scale.set(k, k, j.size * j.length * (0.3 + 0.7 * v) * f); }
      }
      if (camera && state.lodAuto) {
        group.getWorldPosition(wp); camera.getWorldPosition(cp);
        const d = wp.distanceTo(cp), h = engine?.height || 1080;
        const px = 19 / (2 * d * Math.tan((camera.fov || 50) * DEG / 2)) * h;
        if (!lod.visible && px < 60) setLOD(true);
        else if (lod.visible && px > 75) setLOD(false);
      }
    },
    dispose() {
      group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      own.forEach(o => o.dispose());
    },
  };
}

function countMeshes(obj) { let n = 0; obj.traverse(o => { if (o.isMesh) { let p = o, vis = true; while (p && p !== obj) { if (!p.visible) vis = false; p = p.parent; } if (vis) n++; } }); return n; }

function mergeColored(list) {
  const pos = [], nor = [], col = [];
  for (const [g, p] of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.translate(p[0], p[1], p[2]);
    pos.push(...ng.attributes.position.array);
    nor.push(...ng.attributes.normal.array);
    col.push(...ng.attributes.color.array);
    if (ng !== g) ng.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function convexHull(points) {
  const p = points.map(q => q.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
