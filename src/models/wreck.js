// Wreck of a Lander torn apart by the wave: ripped hull section, standing structural panel, scattered debris and the flight recorder, skinned per piece so floating parts bob in a handful of draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createHullMaterials, boxProjectUV, rng } from './hull-materials.js';

export const WRECK = { WATER: 0, SEABED: -0.55, EYE: 1.75 };
const SEABED = WRECK.SEABED;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(s, s, s));
const mul = (...ms) => ms.reduce((a, b) => new THREE.Matrix4().multiplyMatrices(a, b));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const _v = V3(), _n = V3(), _nm = new THREE.Matrix3();

function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf), x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf), x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}
function fbm(x, y, z, o = 3) { let s = 0, a = 0.5, t = 0; for (let i = 0; i < o; i++) { s += vnoise(x, y, z) * a; t += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / t; }

class Bag {
  constructor(name, tint) { this.name = name; this.tint = tint || null; this.P = []; this.N = []; this.U = []; this.C = []; this.W = []; this.S = []; this.I = []; }
  get n() { return this.P.length / 3; }
  add(g, M, o = {}) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (o.uv !== 'keep' && !o.rect) boxProjectUV(g, { scale: o.uvScale ?? 1, offset: o.uvOffset || [0, 0] });
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    _nm.getNormalMatrix(M);
    const base = this.n, rect = o.rect, col = o.color ?? [1, 1, 1], bone = o.bone ?? 0, wear = o.wear ?? 1;
    const isFn = typeof col === 'function';
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(M);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      this.P.push(_v.x, _v.y, _v.z); this.N.push(_n.x, _n.y, _n.z);
      let u = uv ? uv.getX(i) : 0, w = uv ? uv.getY(i) : 0;
      if (rect) { u = rect[0] + u * (rect[2] - rect[0]); w = rect[1] + w * (rect[3] - rect[1]); }
      this.U.push(u, w);
      const c = isFn ? col(_v, i) : col, tn = this.tint && !o.raw ? this.tint : null;
      this.C.push(tn ? c[0] * tn[0] : c[0], tn ? c[1] * tn[1] : c[1], tn ? c[2] * tn[2] : c[2]);
      this.W.push(typeof wear === 'function' ? wear(_v) : wear);
      this.S.push(bone);
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) this.I.push(base + a[i]); } else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
    g.dispose();
    return this;
  }
  build() {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aWear', new THREE.Float32BufferAttribute(this.W, 1));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = this.S[i]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function gridGeometry(nu, nv, P, U, flip = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, c = d + 1;
    if (flip) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeJag(amps, seed) {
  return (edge, t) => {
    const a = amps[edge];
    if (!a) return 0;
    const k = { u0: 1.3, u1: 2.7, v0: 4.1, v1: 5.9 }[edge];
    const n = fbm(t * 1.3 + seed * 3.1, k + seed, 0.37, 4);
    const fq = 0.7 + 2.2 * vnoise(t * 0.35 + seed, k, 2.1);
    const f = t * fq + n * 2.6 + seed;
    const saw = Math.abs((f - Math.floor(f)) * 2 - 1) ** 3;
    const notch = Math.max(0, vnoise(t * 0.6 + seed, k * 2, 1.3) - 0.6) * 2.4;
    const petal = sstep(0.68, 0.84, vnoise(t * 0.8 + seed * 1.3, k * 3, 4.4)) * 0.75;
    const fine = (vnoise(t * 9 + seed, k, 7) - 0.5) * 0.12;
    return a * clamp(0.28 + 0.55 * n + 0.3 * saw + notch - petal + fine, 0.02, 1.35);
  };
}

function sheet(o) {
  const { w, h, surf } = o;
  const nu = o.nu ?? Math.max(4, Math.ceil(w / (o.res ?? 0.09))), nv = o.nv ?? Math.max(4, Math.ceil(h / (o.res ?? 0.09)));
  const t = o.t ?? 0.025, seed = o.seed ?? 1;
  const jag = o.jag || makeJag(o.tear || {}, seed);
  const P = [], UV = [], D = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const s = i / nu, r = j / nv;
    const u0 = jag('u0', r * h), u1 = w - jag('u1', r * h);
    const u = lerp(u0, u1, s);
    const v0 = jag('v0', u), v1 = h - jag('v1', u);
    const v = lerp(v0, v1, r);
    const ed = Math.min(o.tear?.u0 ? u - u0 : 9, o.tear?.u1 ? u1 - u : 9, o.tear?.v0 ? v - v0 : 9, o.tear?.v1 ? v1 - v : 9);
    const S = surf(u, v);
    let disp = 0;
    if (o.crumple) disp += o.crumple * Math.exp(-ed / 0.22) * (fbm(u * 3.3, v * 3.3, seed * 1.7, 2) - 0.5) * 2;
    if (o.curl) { const sg = (vnoise(u * 0.55 + seed, v * 0.55, seed * 0.3) - 0.5) * 2; disp += o.curl * sg * Math.pow(Math.max(0, 1 - ed / (o.curlLen ?? 0.8)), 2); }
    if (o.quilt) disp += o.quilt * Math.abs(Math.sin(u * Math.PI / 0.28) * Math.sin(v * Math.PI / 0.28)) ** 0.6;
    if (o.droop) disp += o.droop(u, v, ed);
    P.push(S.p.x + S.n.x * disp, S.p.y + S.n.y * disp, S.p.z + S.n.z * disp);
    UV.push(u, v); D.push(ed);
  }
  const mid = gridGeometry(nu, nv, P, UV);
  const N = mid.attributes.normal.array;
  const top = [], bot = [];
  for (let i = 0; i < P.length; i += 3) {
    top.push(P[i] + N[i] * t / 2, P[i + 1] + N[i + 1] * t / 2, P[i + 2] + N[i + 2] * t / 2);
    bot.push(P[i] - N[i] * t / 2, P[i + 1] - N[i + 1] * t / 2, P[i + 2] - N[i + 2] * t / 2);
  }
  mid.dispose();
  const M = o.M || new THREE.Matrix4();
  const base = { bone: o.bone, wear: o.wear, uv: 'keep', raw: o.raw };
  const colTop = o.color, colBot = o.colorBack ?? o.color;
  o.bag.add(gridGeometry(nu, nv, top, UV), M, { ...base, color: colTop });
  (o.backBag || o.bag).add(gridGeometry(nu, nv, bot, UV, true), M, { ...base, color: colBot, wear: o.wearBack ?? o.wear });
  if (t > 0.004 && o.rimBag !== null) {
    const loop = [];
    for (let i = 0; i <= nu; i++) loop.push(i);
    for (let j = 1; j <= nv; j++) loop.push(j * (nu + 1) + nu);
    for (let i = nu - 1; i >= 0; i--) loop.push(nv * (nu + 1) + i);
    for (let j = nv - 1; j >= 0; j--) loop.push(j * (nu + 1));
    const rp = [], ru = [];
    let acc = 0;
    for (let k = 0; k < loop.length - 1; k++) {
      const a = loop[k] * 3, b = loop[k + 1] * 3;
      const seg = Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
      const A = [top[a], top[a + 1], top[a + 2]], B = [top[b], top[b + 1], top[b + 2]], C = [bot[b], bot[b + 1], bot[b + 2]], Dd = [bot[a], bot[a + 1], bot[a + 2]];
      rp.push(...A, ...C, ...B, ...A, ...Dd, ...C);
      ru.push(acc, 0, acc + seg, t, acc + seg, 0, acc, 0, acc, t, acc + seg, t);
      acc += seg;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
    rg.computeVertexNormals();
    (o.rimBag || o.bag).add(rg, M, { ...base, color: o.rimColor ?? o.color, wear: 0.4 });
  }
  return { jag, nu, nv };
}

const planeSurf = (w, h) => (u, v) => ({ p: V3(u - w / 2, v - h / 2, 0), n: V3(0, 0, 1) });

function sweep(bag, prof, frames, M, o = {}) {
  const np = prof.length, nf = frames.length;
  const pos = [], uvs = [], idx = [];
  const lens = [0];
  for (let i = 1; i < nf; i++) lens.push(lens[i - 1] + frames[i].p.distanceTo(frames[i - 1].p));
  const cen = prof.reduce((a, q) => [a[0] + q[0] / np, a[1] + q[1] / np], [0, 0]);
  const at = (f, q) => V3().copy(f.p).addScaledVector(f.n, q[0]).addScaledVector(f.b, q[1]);
  for (let e = 0; e < np; e++) {
    const q0 = prof[e], q1 = prof[(e + 1) % np];
    const base = pos.length / 3;
    const elen = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
    for (let i = 0; i < nf; i++) {
      const a = at(frames[i], q0), b = at(frames[i], q1);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uvs.push(lens[i], 0, lens[i], elen);
    }
    for (let i = 0; i < nf - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 3, d = a + 2; idx.push(a, b, c, a, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  {
    const f = frames[Math.floor(nf / 2)], f2 = frames[Math.min(nf - 1, Math.floor(nf / 2) + 1)];
    const a = at(f, prof[0]), b = at(f, prof[1]), c = at(f2, prof[1]);
    const fn = V3().subVectors(b, a).cross(V3().subVectors(c, a));
    const out = V3().addVectors(a, b).multiplyScalar(0.5).sub(at(f, cen));
    if (fn.dot(out) < 0) { const ar = g.index.array; for (let i = 0; i < ar.length; i += 3) { const t = ar[i + 1]; ar[i + 1] = ar[i + 2]; ar[i + 2] = t; } }
  }
  g.computeVertexNormals();
  bag.add(g, M, { ...o, uv: 'keep' });
  if (o.caps !== false) {
    const tri = THREE.ShapeUtils.triangulateShape(prof.map(q => new THREE.Vector2(q[0], q[1])), []);
    for (const [fi, sgn] of [[0, -1], [nf - 1, 1]]) {
      const f = frames[fi], cp = [], ci = [];
      for (const q of prof) { const p = at(f, q); cp.push(p.x, p.y, p.z); }
      for (const t of tri) ci.push(...t);
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
      cg.setIndex(ci);
      const a = V3().fromArray(cp, tri[0][0] * 3), b = V3().fromArray(cp, tri[0][1] * 3), c = V3().fromArray(cp, tri[0][2] * 3);
      const fn = V3().subVectors(b, a).cross(V3().subVectors(c, a));
      const tan = fi === 0 ? V3().subVectors(frames[0].p, frames[1].p) : V3().subVectors(frames[nf - 1].p, frames[nf - 2].p);
      if (fn.dot(tan) < 0) { const ar = cg.index.array; for (let i = 0; i < ar.length; i += 3) { const t = ar[i + 1]; ar[i + 1] = ar[i + 2]; ar[i + 2] = t; } }
      cg.computeVertexNormals();
      bag.add(cg, M, { ...o });
    }
  }
}

function framesAlong(points, upFn) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const tan = V3().subVectors(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    const up = upFn(i, p, tan);
    const b = V3().crossVectors(tan, up).normalize();
    const n = V3().crossVectors(b, tan).normalize();
    out.push({ p, n, b });
  }
  return out;
}

const PROF = {
  C: [[0, -0.03], [0, 0.03], [0.009, 0.03], [0.009, -0.021], [0.111, -0.021], [0.111, 0.024], [0.12, 0.024], [0.12, -0.03]],
  Cs: [[0, -0.022], [0, 0.022], [0.007, 0.022], [0.007, -0.015], [0.073, -0.015], [0.073, 0.018], [0.08, 0.018], [0.08, -0.022]],
  L: [[0, -0.02], [0, 0.022], [0.005, 0.022], [0.005, -0.015], [0.045, -0.015], [0.045, -0.02]],
  hat: [[0, -0.035], [0, -0.02], [0.03, -0.012], [0.03, 0.012], [0, 0.02], [0, 0.035], [0.005, 0.035], [0.005, 0.024], [0.036, 0.015], [0.036, -0.015], [0.005, -0.024], [0.005, -0.035]],
  box: (a, b) => [[0, -b / 2], [0, b / 2], [a, b / 2], [a, -b / 2]],
};

function crush(g, fn) {
  const p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

const MARK_COLS = 8, MARK_ROWS = 4;
function marksTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const W = 2048, H = 1024, cw = W / MARK_COLS, ch = H / MARK_ROWS;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const R = rng(4404);
  const font = (px, wt = 700) => `${wt} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const light = 'rgba(214,212,204,0.88)', orange = 'rgba(232,128,38,1)', dark = 'rgba(28,29,31,0.92)';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const scuff = (ox, oy, w, h, n) => {
    x.save(); x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) { const px = ox + R() * w, py = oy + R() * h, l = 4 + R() * w * 0.12; x.strokeStyle = `rgba(0,0,0,${0.3 + R() * 0.6})`; x.lineWidth = 1 + R() * 5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + l, py + (R() - 0.5) * 6); x.stroke(); }
    x.restore();
  };
  x.fillStyle = light; x.font = font(ch * 0.5); x.fillText('LANDER 1', cw * 2, ch * 0.52); scuff(0, 0, cw * 4, ch, 160);
  x.fillStyle = light; x.font = font(ch * 0.36); x.fillText('ENDURANCE', cw * 6, ch * 0.52); scuff(cw * 4, 0, cw * 4, ch, 120);
  x.save(); x.beginPath(); x.rect(0, ch, cw * 2, ch); x.clip();
  for (let i = -4; i < 16; i++) { x.fillStyle = i % 2 ? 'rgba(22,22,22,0.95)' : 'rgba(204,158,34,0.95)'; x.beginPath(); x.moveTo(i * 48, ch); x.lineTo(i * 48 + 48, ch); x.lineTo(i * 48 + 48 - ch, ch * 2); x.lineTo(i * 48 - ch, ch * 2); x.fill(); }
  x.restore(); scuff(0, ch, cw * 2, ch, 140);
  x.strokeStyle = light; x.lineWidth = 6; x.strokeRect(cw * 2 + 20, ch + 40, cw * 2 - 40, ch - 80);
  x.fillStyle = light; x.font = font(ch * 0.26); x.fillText('NO STEP', cw * 3, ch * 1.5); scuff(cw * 2, ch, cw * 2, ch, 80);
  x.fillStyle = orange; x.fillRect(cw * 4 + 16, ch + 70, cw * 2 - 32, ch - 140);
  x.fillStyle = dark; x.font = font(ch * 0.2); x.fillText('RESCUE  →  CUT HERE', cw * 5, ch * 1.5); scuff(cw * 4, ch, cw * 2, ch, 90);
  x.fillStyle = light; x.font = font(ch * 0.66); x.fillText('01', cw * 6.5, ch * 1.52);
  x.beginPath(); x.lineWidth = 8; x.strokeStyle = light; x.arc(cw * 7.5, ch * 1.5, ch * 0.34, 0, 7); x.stroke();
  x.font = font(ch * 0.12); x.fillText('L-1', cw * 7.5, ch * 1.5);
  x.save(); x.translate(cw * 0.5, ch * 3); x.rotate(-Math.PI / 2); x.fillStyle = orange; x.font = font(cw * 0.5); x.fillText('LANDER 1', 0, 0); x.restore(); scuff(0, ch * 2, cw, ch * 2, 120);
  x.fillStyle = light; x.font = font(ch * 0.075, 600); x.textAlign = 'left';
  ['STRUCT ASSY 31L-2207  REV C', 'BAY 4  AFT BULKHEAD', 'DO NOT DRILL  WIRE RUN', 'TORQUE 22 NM  SAFETY WIRE', 'O2 LINE  MAX 3000 PSI', 'GND PT  28 VDC', 'N2O4  OXIDIZER', 'PYRO  SAFE/ARM  KEEP CLEAR'].forEach((l, i) => x.fillText(l, cw + 24, ch * 2 + 60 + i * ch * 0.22));
  x.textAlign = 'center';
  x.fillStyle = orange; x.fillRect(cw * 4 + 12, ch * 2 + 40, cw * 2 - 24, ch - 80);
  x.fillStyle = dark; x.font = font(ch * 0.15); x.fillText('FLIGHT RECORDER', cw * 5, ch * 2.42); x.font = font(ch * 0.1); x.fillText('DO NOT OPEN', cw * 5, ch * 2.66);
  x.fillStyle = light; x.font = font(ch * 0.4); x.fillText('O2', cw * 6.5, ch * 2.5);
  x.fillText('▲', cw * 7.5, ch * 2.5);
  for (let k = 0; k < 8; k++) {
    const sx = k * cw * 0.5 + cw * 4, sy = ch * 3;
    for (let s2 = 0; s2 < 5 + k; s2++) {
      const px = sx + 6 + R() * (cw * 0.5 - 12), w = 2 + R() * 9, len = ch * (0.3 + R() * 0.7), a = 0.08 + R() * 0.2;
      const g = x.createLinearGradient(px, sy, px, sy + len);
      g.addColorStop(0, `rgba(40,38,32,${a})`); g.addColorStop(1, 'rgba(40,38,32,0)');
      x.fillStyle = g; x.fillRect(px - w / 2, sy, w, len);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const MR = { lander: [0, 0, 4, 1], endurance: [4, 0, 4, 1], stripes: [0, 1, 2, 1], noStep: [2, 1, 2, 1], rescue: [4, 1, 2, 1], num: [6, 1, 1, 1], roundel: [7, 1, 1, 1], vertical: [0, 2, 1, 2], text: [1, 2, 3, 2], recorder: [4, 2, 2, 1], o2: [6, 2, 1, 1], arrow: [7, 2, 1, 1], grime: [4, 3, 4, 1] };
const markRect = (k) => { const [c0, r0, w, h] = MR[k]; return [c0 / MARK_COLS, 1 - (r0 + h) / MARK_ROWS, (c0 + w) / MARK_COLS, 1 - r0 / MARK_ROWS]; };

const WEAR_VERT = `
attribute float aWear;
varying vec3 vRest;
varying vec3 vRestN;
varying float vWear;
`;
const WEAR_FRAG = `
varying vec3 vRest;
varying vec3 vRestN;
varying float vWear;
uniform vec4 uWreck;
uniform vec4 uWreck2;
float wH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wN(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1, 0, 0)), f.x), mix(wH(i + vec3(0, 1, 0)), wH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wH(i + vec3(0, 0, 1)), wH(i + vec3(1, 0, 1)), f.x), mix(wH(i + vec3(0, 1, 1)), wH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wF(vec3 p) { return 0.55 * wN(p) + 0.28 * wN(p * 2.03 + 7.1) + 0.17 * wN(p * 4.07 + 3.3); }
`;
const WEAR_ALBEDO = `
  float wreckWet = 0.0, wreckScorch = 0.0;
  {
    float hy = vRest.y - uWreck.x;
    float st = wN(vec3(vRest.x * 7.0, vRest.y * 0.9, vRest.z * 7.0));
    float st2 = wN(vec3(vRest.x * 2.1 + 11.0, vRest.y * 0.4, vRest.z * 2.1));
    wreckWet = 1.0 - smoothstep(0.02, 0.2 + 0.75 * st * st2 + 0.2 * st, hy);
    float band = smoothstep(-0.05, 0.06, hy) * (1.0 - smoothstep(0.1, 0.32 + 0.3 * st, hy));
    float sc = wF(vRest * 0.85 + 3.0);
    wreckScorch = smoothstep(0.5, 0.74, sc) * vWear * uWreck.y;
    float scour = smoothstep(0.62, 0.8, wN(vec3(vRest.x * 1.3, vRest.y * 9.0 + vRest.x * 0.6, vRest.z * 1.3))) * vWear * uWreck.z * (1.0 - wreckScorch);
    float grime = (wF(vRest * 2.7) - 0.5) * 0.35 * vWear;
    vec3 c = diffuseColor.rgb * (1.0 + grime);
    c = mix(c, c * vec3(0.26, 0.24, 0.22) + vec3(0.006, 0.005, 0.004), wreckScorch);
    c = mix(c, c * 1.55 + vec3(0.02), scour);
    c *= mix(vec3(1.0), vec3(0.78, 0.77, 0.66), band * 0.8);
    c = mix(c, c * vec3(0.32, 0.36, 0.33), wreckWet * uWreck.w);
    diffuseColor.rgb = c;
  }
`;
const WEAR_ROUGH = `
  roughnessFactor = mix(roughnessFactor, 1.0, wreckScorch * 0.6);
  roughnessFactor = mix(roughnessFactor, roughnessFactor * uWreck2.x, wreckWet * uWreck.w);
`;

function wearify(m, name, { scorch = 1, scour = 1, wet = 1, gloss = 0.32 } = {}) {
  m.name = name;
  m.vertexColors = true;
  const uWreck = { value: new THREE.Vector4(WRECK.WATER, scorch, scour, wet) };
  const uWreck2 = { value: new THREE.Vector4(gloss, 0, 0, 0) };
  m.userData.wreck = uWreck;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWreck = uWreck;
    shader.uniforms.uWreck2 = uWreck2;
    shader.vertexShader = WEAR_VERT + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = position; vRestN = normal; vWear = aWear;');
    shader.fragmentShader = WEAR_FRAG + shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + WEAR_ALBEDO)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WEAR_ROUGH);
  };
  m.customProgramCacheKey = () => 'wreck-wear-1';
  m.needsUpdate = true;
  return m;
}

function bakeAO(bags, { cell = 0.08, skip = [] } = {}) {
  const min = V3(Infinity, Infinity, Infinity), max = V3(-Infinity, -Infinity, -Infinity);
  for (const b of bags) for (let i = 0; i < b.P.length; i += 3) { min.x = Math.min(min.x, b.P[i]); min.y = Math.min(min.y, b.P[i + 1]); min.z = Math.min(min.z, b.P[i + 2]); max.x = Math.max(max.x, b.P[i]); max.y = Math.max(max.y, b.P[i + 1]); max.z = Math.max(max.z, b.P[i + 2]); }
  min.subScalar(1.5); max.addScalar(1.5);
  let c = cell, nx, ny, nz;
  for (;;) { nx = Math.ceil((max.x - min.x) / c); ny = Math.ceil((max.y - min.y) / c); nz = Math.ceil((max.z - min.z) / c); if (nx * ny * nz < 7e6) break; c *= 1.15; }
  const grid = new Uint8Array(nx * ny * nz), ic = 1 / c;
  const mark = (x, y, z) => { const i = Math.floor((x - min.x) * ic), j = Math.floor((y - min.y) * ic), k = Math.floor((z - min.z) * ic); if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) grid[(k * ny + j) * nx + i] = 1; };
  const step = c * 0.7;
  for (const b of bags) {
    if (skip.includes(b)) continue;
    const P = b.P, I = b.I;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, bb = I[t + 1] * 3, cc = I[t + 2] * 3;
      const e1x = P[bb] - P[a], e1y = P[bb + 1] - P[a + 1], e1z = P[bb + 2] - P[a + 2];
      const e2x = P[cc] - P[a], e2y = P[cc + 1] - P[a + 1], e2z = P[cc + 2] - P[a + 2];
      const n = Math.max(1, Math.ceil(Math.max(Math.hypot(e1x, e1y, e1z), Math.hypot(e2x, e2y, e2z)) / step));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const s = i / n, r = j / n; mark(P[a] + e1x * s + e2x * r, P[a + 1] + e1y * s + e2y * r, P[a + 2] + e1z * s + e2z * r); }
    }
  }
  const NR = 14, dirs = [];
  for (let i = 0; i < NR; i++) { const u = (i + 0.5) / NR, phi = i * 2.399963; const r = Math.sqrt(u); dirs.push([Math.cos(phi) * r, Math.sin(phi) * r, Math.sqrt(1 - u)]); }
  const dists = []; { let d = c * 1.6; for (let k = 0; k < 18 && d < 3.2; k++) { dists.push(d); d += c * (0.9 + k * 0.22); } }
  const tA = V3(), bA = V3();
  for (const b of bags) {
    const P = b.P, N = b.N, C = b.C;
    for (let v = 0; v < P.length; v += 3) {
      const nx0 = N[v], ny0 = N[v + 1], nz0 = N[v + 2];
      if (Math.abs(nx0) < 0.9) tA.set(0, -nz0, ny0); else tA.set(nz0, 0, -nx0);
      tA.normalize(); bA.set(ny0 * tA.z - nz0 * tA.y, nz0 * tA.x - nx0 * tA.z, nx0 * tA.y - ny0 * tA.x);
      let occ = 0;
      for (const [dx, dy, dz] of dirs) {
        const rx = tA.x * dx + bA.x * dy + nx0 * dz, ry = tA.y * dx + bA.y * dy + ny0 * dz, rz = tA.z * dx + bA.z * dy + nz0 * dz;
        for (let k = 0; k < dists.length; k++) {
          const d = dists[k], x = P[v] + rx * d, y = P[v + 1] + ry * d, z = P[v + 2] + rz * d;
          if (y < SEABED) { occ += 1 - 0.4 * k / dists.length; break; }
          if (y < -0.02 && P[v + 1] > 0.02) { occ += 0.1; break; }
          const i = Math.floor((x - min.x) * ic), j = Math.floor((y - min.y) * ic), kk = Math.floor((z - min.z) * ic);
          if (i < 0 || j < 0 || kk < 0 || i >= nx || j >= ny || kk >= nz) break;
          if (grid[(kk * ny + j) * nx + i]) { occ += 1 - 0.55 * k / dists.length; break; }
        }
      }
      const ao = Math.pow(1 - clamp(occ / NR, 0, 1) * 0.78, 1.1);
      C[v] *= ao; C[v + 1] *= ao; C[v + 2] *= ao;
    }
  }
  return { cell: c, dims: [nx, ny, nz] };
}

const COL = { cell: 0.3, yLo: SEABED + 0.12, yHi: 2.2, margin: 0.35, eye: SEABED + 1.75 };

function buildColliders(meshes, bones) {
  const c = COL.cell, x0 = -16, z0 = -10, nx = Math.ceil(32 / c), nz = Math.ceil(20 / c);
  const occ = new Uint8Array(nx * nz), top = new Float32Array(nx * nz).fill(-9);
  const put = (x, y, z) => {
    if (y < COL.yLo || y > COL.yHi) return;
    const i = Math.floor((x - x0) / c), k = Math.floor((z - z0) / c);
    if (i < 0 || k < 0 || i >= nx || k >= nz) return;
    occ[k * nx + i] = 1; top[k * nx + i] = Math.max(top[k * nx + i], y);
  };
  for (const m of meshes) {
    const P = m.geometry.attributes.position.array, S = m.geometry.attributes.skinIndex.array, I = m.geometry.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3;
      if (!bones.has(S[I[t] * 4])) continue;
      const lo = Math.min(P[a + 1], P[b + 1], P[d + 1]), hi = Math.max(P[a + 1], P[b + 1], P[d + 1]);
      if (hi < COL.yLo || lo > COL.yHi) continue;
      const L = Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]), Math.hypot(P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]));
      const n = Math.max(1, Math.ceil(L / (c * 0.5)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n; put(P[a] + (P[b] - P[a]) * u + (P[d] - P[a]) * v, P[a + 1] + (P[b + 1] - P[a + 1]) * u + (P[d + 1] - P[a + 1]) * v, P[a + 2] + (P[b + 2] - P[a + 2]) * u + (P[d + 2] - P[a + 2]) * v); }
    }
  }
  const fill = occ.slice();
  for (let k = 1; k < nz - 1; k++) for (let i = 1; i < nx - 1; i++) {
    const o = (a, b) => occ[(k + b) * nx + i + a];
    if (!occ[k * nx + i] && ((o(-1, 0) && o(1, 0)) || (o(0, -1) && o(0, 1)))) { fill[k * nx + i] = 1; top[k * nx + i] = Math.max(top[k * nx + i - 1], top[k * nx + i + 1], top[(k - 1) * nx + i], top[(k + 1) * nx + i]); }
  }
  const used = new Uint8Array(nx * nz), out = [];
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!fill[k * nx + i] || used[k * nx + i]) continue;
    let i1 = i; while (i1 + 1 < nx && fill[k * nx + i1 + 1] && !used[k * nx + i1 + 1]) i1++;
    let k1 = k; for (;;) { const kk = k1 + 1; if (kk >= nz) break; let ok = true; for (let ii = i; ii <= i1; ii++) if (!fill[kk * nx + ii] || used[kk * nx + ii]) { ok = false; break; } if (!ok) break; k1 = kk; }
    let yt = -9; for (let kk = k; kk <= k1; kk++) for (let ii = i; ii <= i1; ii++) { used[kk * nx + ii] = 1; yt = Math.max(yt, top[kk * nx + ii]); }
    out.push({ id: 'wreck' + out.length, min: [+(x0 + i * c).toFixed(2), SEABED - 0.2, +(z0 + k * c).toFixed(2)], max: [+(x0 + (i1 + 1) * c).toFixed(2), +(yt + 0.05).toFixed(2), +(z0 + (k1 + 1) * c).toFixed(2)] });
  }
  return out;
}

export function insideCollider(colliders, x, z, r = 0, y = null) {
  return colliders.find(b => x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r && (y === null || (y >= b.min[1] && y <= b.max[1]))) || null;
}

export function laneClear(colliders, x, z, len = 14, r = COL.margin) {
  for (let d = 0; d <= len; d += 0.1) if (insideCollider(colliders, x, z + d, r)) return false;
  return true;
}

function findApproach(colliders, grab) {
  let best = null;
  for (let dz = 0; dz <= 2.6; dz += 0.05) for (let dx = -1.6; dx <= 1.6; dx += 0.05) {
    const x = grab.x + dx, z = grab.z + dz;
    const reach = Math.hypot(dx, COL.eye - grab.y, dz);
    if (reach > 1.9 || insideCollider(colliders, x, z, COL.margin) || !laneClear(colliders, x, z)) continue;
    const score = reach + Math.abs(dx) * 0.4;
    if (!best || score < best.score) best = { x, z, score, reach };
  }
  return best || { x: grab.x, z: grab.z + 2.2, reach: 2.2 };
}

export async function createWreck({ engine, quality, materials } = {}) {
  const q = typeof quality === 'string' ? quality : (engine?.qualityName || 'ultra');
  const mats = materials || createHullMaterials({ renderer: engine?.renderer, quality: q });
  const marksTex = marksTexture();
  const std = (src, o) => { const m = src.clone(); Object.assign(m, o); return m; };
  const M = {
    hull: wearify(std(mats.white, { color: new THREE.Color(0.46, 0.47, 0.48), roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) }), 'wreck.hull'),
    primer: wearify(std(mats.whitePlain || mats.white, { color: new THREE.Color(1, 1, 1), roughness: 1, metalness: 0.05 }), 'wreck.primer', { scour: 0.5 }),
    metal: wearify(std(mats.metal, { color: new THREE.Color(0.95, 0.95, 0.95) }), 'wreck.metal', { scorch: 0.8, scour: 0 }),
    insul: wearify(std(mats.whitePlain || mats.white, { color: new THREE.Color(0.66, 0.64, 0.58), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.2, 1.2) }), 'wreck.insul', { scour: 0, gloss: 1 }),
    tile: wearify(std(mats.tile, {}), 'wreck.tile', { scour: 0.6 }),
    rubber: wearify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 }), 'wreck.rubber', { scorch: 0.5, scour: 0 }),
    paint: wearify(std(mats.whitePlain || mats.white, { color: new THREE.Color(0.62, 0.16, 0.035), roughness: 1, metalness: 0 }), 'wreck.paint', { scorch: 0.4, scour: 0.8 }),
    marks: wearify(new THREE.MeshStandardMaterial({ map: marksTex, transparent: true, depthWrite: false, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'wreck.marks', { scour: 0 }),
  };
  const PRIMER = [0.24, 0.265, 0.225];
  const B = {}; for (const k of Object.keys(M)) B[k] = new Bag(k, k === 'primer' ? PRIMER : null);
  const group = new THREE.Group();
  group.name = 'Wreck';
  const anchors = {};
  const R = rng(19019);

  const bones = [], pieces = [];
  const addBone = (name, pivot, info = {}) => {
    const b = new THREE.Bone(); b.name = name; b.position.copy(pivot);
    b.userData.rest = pivot.clone();
    bones.push(b); group.add(b);
    const idx = bones.length - 1;
    if (info.piece !== false) pieces.push({ name, object: b, bone: idx, floating: !!info.floating, radius: info.radius ?? 1, draft: info.draft ?? 0, size: info.size || [1, 1], mass: info.mass ?? 1, phase: R() * 6.28, vy: 0, y: 0, tilt: V3(), tv: V3() });
    return idx;
  };
  addBone('static', V3(), { piece: false });

  const tone = (t, var_ = 0.12, f = 0.7) => (p) => { const n = 1 - var_ + var_ * 2 * fbm(p.x * f + 3, p.y * f, p.z * f, 2); return [t[0] * n, t[1] * n, t[2] * n]; };
  const box = (bag, Mx, sx, sy, sz, o = {}) => bag.add(new THREE.BoxGeometry(sx, sy, sz, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), Mx, o);
  const rbox = (bag, Mx, sx, sy, sz, r, o = {}) => bag.add(new RoundedBoxGeometry(sx, sy, sz, o.seg ?? 2, Math.min(r, sx / 2.05, sy / 2.05, sz / 2.05)), Mx, o);
  const cyl = (bag, Mx, a, b, r, seg = 12, o = {}) => {
    const d = V3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, seg, o.hs ?? 1, !!o.open);
    const qq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return bag.add(g, mul(Mx, new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), qq, V3(1, 1, 1))), o);
  };
  const tube = (bag, Mx, pts, r, o = {}) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    bag.add(new THREE.TubeGeometry(curve, o.seg ?? Math.max(8, Math.ceil(len / 0.06)), r, o.radial ?? 7, false), Mx, o);
  };
  const decal = (Mx, key, w, h, o = {}) => B.marks.add(new THREE.PlaneGeometry(w, h), Mx, { ...o, rect: markRect(key), wear: o.wear ?? 0.6 });
  const decalOn = (surf, u, v, w, h, key, M0, o = {}) => {
    const nu = Math.max(2, Math.ceil(w / 0.12)), nv = Math.max(2, Math.ceil(h / 0.12)), P = [], U = [];
    const r = markRect(key);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = surf(u - w / 2 + w * i / nu, v - h / 2 + h * j / nv);
      const off = o.off ?? 0.016;
      P.push(s.p.x + s.n.x * off, s.p.y + s.n.y * off, s.p.z + s.n.z * off);
      U.push(lerp(r[0], r[2], o.flipU ? 1 - i / nu : i / nu), lerp(r[1], r[3], j / nv));
    }
    B.marks.add(gridGeometry(nu, nv, P, U), M0, { ...o, uv: 'keep' });
  };

  const SC = 0.74, LEN = 5.8;
  const corners = [[0, 0], [4.2, 0.22], [5.35, 1.05], [4.85, 3.55], [2.45, 4.65], [0.2, 4.72]].map(([x, y]) => [x * SC, y * SC]);
  const profPts = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1];
    const steps = 40;
    for (let k = 0; k < steps; k++) profPts.push([lerp(a[0], b[0], k / steps), lerp(a[1], b[1], k / steps)]);
  }
  profPts.push(corners[corners.length - 1]);
  for (let it = 0; it < 6; it++) for (let i = 1; i < profPts.length - 1; i++) { profPts[i] = [(profPts[i - 1][0] + profPts[i][0] * 2 + profPts[i + 1][0]) / 4, (profPts[i - 1][1] + profPts[i][1] * 2 + profPts[i + 1][1]) / 4]; }
  const cum = [0];
  for (let i = 1; i < profPts.length; i++) cum.push(cum[i - 1] + Math.hypot(profPts[i][0] - profPts[i - 1][0], profPts[i][1] - profPts[i - 1][1]));
  const ULEN = cum[cum.length - 1];
  const profAt = (u) => {
    u = clamp(u, 0, ULEN);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; }
    const t = (u - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    const a = profPts[lo], b = profPts[hi];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), tx: tx / l, ty: ty / l };
  };
  const secDent = (u, v) => {
    const big = -0.6 * Math.exp(-((u - ULEN * 0.5) ** 2) / 1.0 - ((v - LEN * 0.85) ** 2) / 1.4);
    const big2 = -0.22 * Math.exp(-((u - ULEN * 0.8) ** 2) / 0.5 - ((v - LEN * 0.3) ** 2) / 0.8);
    return big + big2 + (fbm(u * 0.7, v * 0.7, 2.2, 3) - 0.5) * 0.12;
  };
  const secSurf = (u, v) => {
    const a = profAt(u), d = secDent(u, v), n = V3(a.ty, -a.tx, 0);
    return { p: V3(a.x + n.x * d, a.y + n.y * d, v), n };
  };
  const secM = mul(T(-3.1, -0.3, 0.95, 0, 0, 0), new THREE.Matrix4().makeRotationZ(-0.17), new THREE.Matrix4().makeRotationX(-0.2), new THREE.Matrix4().makeRotationY(0.22), new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(0, 1, 0), V3(1, 0, 0)));
  const PRE = 0.62, secTear = { u0: 0.55, u1: 1.05, v0: 0.5, v1: 1.5 };
  const secJag = makeJag(secTear, 7);
  const hullTone = tone([0.92, 0.93, 0.95], 0.14, 0.45);
  const innerTone = tone([0.55, 0.6, 0.52], 0.1);
  sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w: ULEN, h: LEN + PRE, res: 0.075, surf: (u, v) => secSurf(u, v - PRE), t: 0.03, tear: secTear, jag: secJag, seed: 7, crumple: 0.12, curl: 0.38, curlLen: 0.9, M: secM, color: hullTone, colorBack: innerTone, rimColor: [0.85, 0.85, 0.85] });
  const uMin = (v) => secJag('u0', v + PRE), uMax = (v) => ULEN - secJag('u1', v + PRE), vMax = (u) => LEN - secJag('v1', u), vMin = (u) => secJag('v0', u) - PRE;
  const inward = (u, v) => secSurf(u, v).n.clone().negate();
  const skinIn = (u, v, off = 0.016) => { const s = secSurf(u, v); return s.p.addScaledVector(s.n, -off); };

  const ribZ = [];
  for (let z = 0.62; z < LEN - 0.25; z += 0.58) ribZ.push(z);
  ribZ.forEach((z, k) => {
    let a = uMin(z) + 0.06, b = uMax(z) - 0.06;
    const runs = []; let cur = null;
    for (let u = a; u <= b; u += 0.04) { const ok = vMax(u) > z + 0.06; if (ok && !cur) cur = [u, u]; if (ok) cur[1] = u; if (!ok && cur) { runs.push(cur); cur = null; } }
    if (cur) runs.push(cur);
    runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
    const run = runs[0];
    if (!run || run[1] - run[0] < 0.3) return;
    const pts = [], n = Math.ceil((run[1] - run[0]) / 0.05);
    for (let i = 0; i <= n; i++) pts.push(skinIn(lerp(run[0], run[1], i / n), z));
    const Rr = rng(300 + k);
    for (const end of [0, 1]) {
      if (!end && Rr() < 0.4) continue;
      const i0 = end ? pts.length - 1 : 0, i1 = end ? pts.length - 2 : 1;
      const dir = V3().subVectors(pts[i0], pts[i1]).normalize(), inn = inward(end ? run[1] : run[0], z);
      const tall = end && k % 2 === 1;
      const ext = tall ? 0.6 + Rr() * 0.9 : 0.12 + Rr() * 0.35, bend = tall ? -(0.25 + Rr() * 0.5) : (Rr() - 0.3) * 0.9;
      const extra = [];
      for (let s = 1; s <= 5; s++) { const t = s / 5; extra.push(pts[i0].clone().addScaledVector(dir, ext * t).addScaledVector(inn, bend * ext * t * t).add(V3(0, 0, (Rr() - 0.5) * 0.06 * t))); }
      if (end) pts.push(...extra); else pts.unshift(...extra.reverse());
    }
    const fr = framesAlong(pts, (i, p) => { const u = clamp(run[0] + (run[1] - run[0]) * i / (pts.length - 1), 0, ULEN); return inward(u, z); });
    sweep(B.primer, PROF.C, fr.map(f => ({ p: f.p, n: f.n, b: f.b })), secM, { color: tone([0.95, 0.95, 0.9], 0.12), wear: 0.8 });
  });
  for (const [z0, w, seed] of [[1.3, 1.5, 4100], [3.2, 1.1, 4200]]) {
    const end = (z) => { const u = uMax(z) - 0.04, a = profAt(u), sp = secSurf(u, z); return { p: sp.p, t: V3(a.tx, a.ty, 0), n: sp.n }; };
    const fl = (u, v) => { const e = end(z0 + v), k = u * u; return { p: e.p.clone().addScaledVector(e.t, u * 0.9).addScaledVector(e.n, 0.55 * k + 0.12 * Math.sin(v * 3 + seed)).add(V3(0, 0, 0.15 * k)), n: e.n }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w: 1.0 + (seed % 3) * 0.2, h: w, res: 0.07, surf: fl, t: 0.03, tear: { u1: 0.5, v0: 0.2, v1: 0.3 }, seed, crumple: 0.12, curl: 0.2, M: secM, color: hullTone, colorBack: innerTone });
  }
  const strU = [];
  for (let u = 0.32; u < ULEN - 0.2; u += 0.36) strU.push(u + (R() - 0.5) * 0.05);
  strU.forEach((u, k) => {
    const Rr = rng(500 + k);
    const v1 = vMax(u) - 0.04 + Rr() * 0.45, v0 = vMin(u) + 0.05 + Rr() * 0.1;
    if (u < uMin(0) + 0.05 || u > uMax(0) - 0.05) return;
    const pts = [];
    for (let v = v0; v <= v1; v += 0.12) {
      const inside = u > uMin(v) + 0.05 && u < uMax(v) - 0.05;
      if (!inside) break;
      const over = Math.max(0, v - (vMax(u) - 0.04));
      pts.push(skinIn(u, Math.min(v, vMax(u) - 0.04), 0.016).add(V3(0, 0, over)).addScaledVector(inward(u, v), over * over * (Rr() - 0.4) * 2.2));
    }
    if (pts.length < 3) return;
    const fr = framesAlong(pts, (i, p) => inward(u, Math.min(LEN, p.z)));
    sweep(Rr() < 0.5 ? B.primer : B.metal, k % 3 === 0 ? PROF.hat : PROF.L, fr, secM, { color: [0.9, 0.9, 0.88], wear: 0.6 });
  });
  for (let k = 0; k < ribZ.length - 1; k++) {
    const Rr = rng(700 + k);
    const z0 = ribZ[k] + 0.045, z1 = ribZ[k + 1] - 0.045;
    if (z1 > LEN - 0.4) break;
    let u0 = Math.max(uMin(z1), uMin(z0)) + 0.05 + Rr() * 0.4, u1 = Math.min(uMax(z0), uMax(z1)) - 0.05 - Rr() * 0.6;
    if (Rr() < 0.25) continue;
    const segs = Rr() < 0.5 ? [[u0, lerp(u0, u1, 0.45 + Rr() * 0.2)], [lerp(u0, u1, 0.7 + Rr() * 0.1), u1]] : [[u0, u1]];
    for (const [a, b] of segs) {
      if (b - a < 0.4) continue;
      const lift = 0.05 + Rr() * 0.03;
      const bs = (u, v) => { const s = secSurf(a + u, z0 + v), n = s.n.clone().negate(); return { p: s.p.addScaledVector(n, lift), n }; };
      sheet({ bag: B.insul, w: b - a, h: z1 - z0, res: 0.06, surf: bs, t: 0.03, tear: { u0: Rr() * 0.12, u1: 0.08 + Rr() * 0.25, v1: Rr() < 0.4 ? 0.12 : 0 }, seed: 40 + k, quilt: 0.022, crumple: 0.05, curl: 0.12, M: secM, color: tone([0.9, 0.88, 0.82], 0.1, 1.4), wear: 0.9 });
    }
  }
  {
    const hang = (u, k) => {
      const Rr = rng(900 + k);
      const z = vMax(u) - 0.1, top = skinIn(u, z, 0.09);
      const w = 0.45 + Rr() * 0.5, h = 0.8 + Rr() * 1.1;
      const down = V3(0, -1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(secM).invert()).normalize();
      const out = V3(0, 0, 1);
      const side = V3().crossVectors(down, out).normalize();
      const surf = (uu, vv) => {
        const t = vv / h;
        const p = top.clone().addScaledVector(side, uu - w / 2).addScaledVector(out, 0.35 * Math.sin(t * 1.6) * (1 - t * 0.4) + 0.08 * Math.sin(uu * 7 + k)).addScaledVector(down, vv * 0.92);
        p.addScaledVector(side, Math.sin(t * 3 + k) * 0.08 * t);
        return { p, n: out.clone() };
      };
      sheet({ bag: B.insul, w, h, res: 0.06, surf, t: 0.025, tear: { v1: 0.35, u0: 0.08, u1: 0.1 }, seed: 60 + k, quilt: 0.02, crumple: 0.06, M: secM, color: tone([0.85, 0.83, 0.77], 0.12, 1.2), wear: 0.7 });
    };
    hang(ULEN * 0.3, 1); hang(ULEN * 0.55, 2); hang(ULEN * 0.78, 3);
  }
  {
    const inv = new THREE.Matrix4().copy(secM).invert();
    const toLocal = (p) => p.clone().applyMatrix4(inv);
    const cableCols = [[0.05, 0.05, 0.055], [0.07, 0.07, 0.07], [0.12, 0.12, 0.11], [0.5, 0.42, 0.3], [0.06, 0.06, 0.06], [0.35, 0.07, 0.03], [0.55, 0.53, 0.5]];
    const looms = [[ULEN * 0.62, 7, 1.0], [ULEN * 0.34, 5, 0.6], [ULEN * 0.86, 4, 0.8], [ULEN * 0.12, 3, 0.5]];
    looms.forEach(([u, n, sag], li) => {
      const Rr = rng(1100 + li);
      const zEnd = vMax(u) - 0.05;
      for (let c = 0; c < n; c++) {
        const off = 0.13 + c * 0.022, du = (c - n / 2) * 0.03;
        const pts = [];
        for (let z = 0.2; z < zEnd; z += 0.5) pts.push(skinIn(u + du, z, off));
        const exit = skinIn(u + du, zEnd, off);
        pts.push(exit);
        const wexit = exit.clone().applyMatrix4(secM);
        const wfar = wexit.clone().add(V3(0.6 + Rr() * 1.4 * sag, 0, (Rr() - 0.5) * 1.5));
        const wmid = wexit.clone().lerp(wfar, 0.4); wmid.y = Math.max(-0.1, lerp(wexit.y, -0.05, 0.75));
        wfar.y = -0.02 - Rr() * 0.12;
        const wend = wfar.clone().add(V3(0.3 + Rr() * 0.8, 0, (Rr() - 0.5) * 0.8)); wend.y = SEABED + 0.05;
        pts.push(toLocal(wmid), toLocal(wfar), toLocal(wend));
        tube(B.rubber, secM, pts, 0.008 + Rr() * 0.01, { color: cableCols[(c + li) % cableCols.length], wear: 0.4, radial: 6 });
      }
      for (let z = 0.6; z < zEnd - 0.2; z += 0.6) {
        const p = skinIn(u, z, 0.13 + n * 0.011);
        cyl(B.rubber, secM, p.clone().add(V3(0, 0, -0.012)), p.clone().add(V3(0, 0, 0.012)), n * 0.015 + 0.012, 10, { color: [0.03, 0.03, 0.03] });
      }
    });
    const pipes = [[ULEN * 0.48, 0.022, 0.24], [ULEN * 0.52, 0.016, 0.3], [ULEN * 0.72, 0.03, 0.26]];
    pipes.forEach(([u, r, off], k) => {
      const Rr = rng(1300 + k);
      const zEnd = vMax(u) + 0.1 + Rr() * 0.4;
      const pts = [];
      for (let z = 0.15; z < vMax(u) - 0.1; z += 0.4) pts.push(skinIn(u, z, off));
      const last = pts[pts.length - 1];
      const inn = inward(u, vMax(u));
      pts.push(last.clone().add(V3(0, 0, 0.3)).addScaledVector(inn, 0.05), last.clone().add(V3((Rr() - 0.5) * 0.3, 0, zEnd - last.z)).addScaledVector(inn, 0.25 + Rr() * 0.3));
      tube(B.metal, secM, pts, r, { radial: 10, wear: 0.7 });
      for (let i = 1; i < pts.length - 2; i += 2) {
        const p = pts[i];
        box(B.primer, mul(secM, T(p.x, p.y, p.z)), r * 3, r * 3, 0.03, { wear: 0.5 });
      }
    });
  }
  {
    const bh = [];
    for (let i = 0; i < profPts.length; i += 4) bh.push(new THREE.Vector2(...profPts[i]));
    bh.push(new THREE.Vector2(...profPts[profPts.length - 1]));
    const jj = makeJag({ u0: 0.5 }, 11);
    const ret = [];
    const F = profPts[profPts.length - 1], A = profPts[0];
    for (let i = 1; i < 28; i++) { const t = i / 28; const x = lerp(F[0], A[0], t), y = lerp(F[1], A[1], t); ret.push(new THREE.Vector2(x + 0.35 + jj('u0', t * 3.4), y)); }
    const shp = new THREE.Shape([...bh.map(v => v.clone().multiplyScalar(1)), ...ret]);
    const hx = 2.1 * SC, hy = 2.2 * SC, hw = 0.68, hh = 1.0, rr = 0.2;
    const hole = new THREE.Path();
    hole.moveTo(hx - hw / 2 + rr, hy - hh / 2);
    hole.lineTo(hx + hw / 2 - rr, hy - hh / 2); hole.quadraticCurveTo(hx + hw / 2, hy - hh / 2, hx + hw / 2, hy - hh / 2 + rr);
    hole.lineTo(hx + hw / 2, hy + hh / 2 - rr); hole.quadraticCurveTo(hx + hw / 2, hy + hh / 2, hx + hw / 2 - rr, hy + hh / 2);
    hole.lineTo(hx - hw / 2 + rr, hy + hh / 2); hole.quadraticCurveTo(hx - hw / 2, hy + hh / 2, hx - hw / 2, hy + hh / 2 - rr);
    hole.lineTo(hx - hw / 2, hy - hh / 2 + rr); hole.quadraticCurveTo(hx - hw / 2, hy - hh / 2, hx - hw / 2 + rr, hy - hh / 2);
    shp.holes.push(hole);
    const bg = new THREE.ExtrudeGeometry(shp, { depth: 0.035, bevelEnabled: false, curveSegments: 6 });
    crush(bg, (p) => { p.z += -0.08 * Math.exp(-((p.x - 2.6) ** 2 + (p.y - 1.4) ** 2) / 0.6) + (fbm(p.x * 1.4, p.y * 1.4, 3, 2) - 0.5) * 0.04; });
    B.primer.add(bg, mul(secM, T(0, 0, -0.005)), { color: tone([0.85, 0.88, 0.84], 0.14), wear: 1 });
    const loop = [];
    const hp = hole.getSpacedPoints(48);
    for (const p of hp) loop.push(V3(p.x, p.y, 0.035));
    const cen = V3(hx, hy, 0.035);
    const fr = framesAlong(loop, () => V3(0, 0, 1)).map(f => ({ p: f.p, n: V3(0, 0, 1), b: V3().subVectors(f.p, cen).setZ(0).normalize() }));
    sweep(B.metal, [[0, -0.02], [0, 0.07], [0.09, 0.07], [0.09, 0.03], [0.04, 0.03], [0.04, -0.02]], fr, secM, { color: [0.8, 0.8, 0.8], caps: false, wear: 0.8 });
    for (const sx of [-1, 1]) for (const yy of [-0.32, 0.3]) {
      box(B.metal, mul(secM, T(hx + sx * (hw / 2 + 0.08), hy + yy, 0.09)), 0.06, 0.16, 0.08);
      cyl(B.metal, mul(secM, T(hx + sx * (hw / 2 + 0.11), hy + yy, 0.12)), V3(0, -0.07, 0), V3(0, 0.07, 0), 0.018, 10);
    }
    decal(mul(secM, T(hx, hy + hh / 2 + 0.2, 0.04)), 'text', 0.6, 0.2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(B.metal, mul(secM, T(hx + Math.cos(a) * 0.62, hy + Math.sin(a) * 0.75, 0.04)), V3(0, 0, 0), V3(0, 0, 0.025), 0.012, 6);
    }
    const tank = (cx, cy, cz, r, dent) => {
      const g = new THREE.SphereGeometry(r, 28, 18);
      crush(g, (p) => { const d = V3(dent[0], dent[1], dent[2]).normalize(); const k = p.clone().normalize().dot(d); if (k > 0.3) p.addScaledVector(d, -(k - 0.3) * r * dent[3]); p.multiplyScalar(1 + (fbm(p.x * 6, p.y * 6, p.z * 6, 2) - 0.5) * 0.05); });
      B.primer.add(g, mul(secM, T(cx, cy, cz)), { color: [0.72, 0.74, 0.7], wear: 0.9 });
      cyl(B.metal, mul(secM, T(cx, cy, cz)), V3(-r * 1.05, 0, 0), V3(r * 1.05, 0, 0), 0.012, 6);
      for (const a of [-0.45, 0.45]) B.metal.add(new THREE.TorusGeometry(r * Math.cos(a) + 0.008, 0.009, 6, 40), mul(secM, T(cx, cy + r * Math.sin(a) * 0.9, cz, Math.PI / 2, 0, 0)), { wear: 0.6 });
      let bu = 0, bd = 1e9;
      for (let u = 0; u < ULEN; u += 0.03) { const q = skinIn(u, cz, 0.12); const d = Math.hypot(q.x - cx, q.y - (cy - r)); if (d < bd) { bd = d; bu = u; } }
      for (const s of [-1, 1]) cyl(B.metal, secM, V3(cx + s * r * 0.55, cy - r * 0.75, cz + s * 0.1), skinIn(bu + s * 0.25, cz + s * 0.1, 0.12), 0.018, 8);
    };
    const xsAt = (x) => { const ys = []; const poly = [...profPts, profPts[0]]; for (let i = 0; i < poly.length - 1; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[i + 1]; if ((x0 - x) * (x1 - x) <= 0 && x0 !== x1) ys.push(lerp(y0, y1, (x - x0) / (x1 - x0))); } return ys.length > 1 ? [Math.min(...ys), Math.max(...ys)] : null; };
    const flange = [];
    for (let i = 0; i < profPts.length; i += 3) { const a = profAt(cum[i]); const n = V3(a.ty, -a.tx, 0); flange.push({ p: V3(a.x, a.y, 0.03).addScaledVector(n, -0.016), n: n.clone().negate(), b: V3(0, 0, 1) }); }
    sweep(B.primer, PROF.C.map(([a, b]) => [a * 1.4, b * 1.3 + 0.01]), flange, secM, { color: [0.9, 0.92, 0.88], wear: 0.9 });
    for (const x of [2.55, 3.25]) { const r = xsAt(x); if (!r) continue; sweep(B.primer, PROF.L.map(([a, b]) => [a * 1.6, b * 1.4]), [{ p: V3(x, r[0] + 0.12, 0.03), n: V3(0, 0, 1), b: V3(1, 0, 0) }, { p: V3(x, r[1] - 0.12, 0.03), n: V3(0, 0, 1), b: V3(1, 0, 0) }], secM, { color: [0.85, 0.88, 0.84] }); }
    for (const y of [0.75, 2.75]) sweep(B.primer, PROF.L.map(([a, b]) => [a * 1.6, b * 1.4]), [{ p: V3(2.2, y, 0.03), n: V3(0, 0, 1), b: V3(0, 1, 0) }, { p: V3(3.55, y, 0.03), n: V3(0, 0, 1), b: V3(0, 1, 0) }], secM, { color: [0.85, 0.88, 0.84] });
    {
      const outer = [];
      for (let i = 0; i < profPts.length; i += 3) { const a = profAt(cum[i]); const n = V3(a.ty, -a.tx, 0); outer.push({ p: V3(a.x, a.y, -0.04).addScaledVector(n, -0.016), n: n.clone().negate(), b: V3(0, 0, -1) }); }
      sweep(B.primer, PROF.L.map(([a, b]) => [a * 1.5, b * 1.5]), outer, secM, { color: [0.85, 0.87, 0.84] });
      const oloop = hp.map(q => V3(q.x, q.y, -0.04));
      sweep(B.metal, [[0, -0.02], [0, 0.05], [0.07, 0.05], [0.07, -0.02]], framesAlong(oloop, () => V3(0, 0, 1)).map(f => ({ p: f.p, n: V3(0, 0, -1), b: V3().subVectors(f.p, cen).setZ(0).normalize() })), secM, { caps: false, color: [0.7, 0.7, 0.7] });
      const Rs = rng(1919);
      for (const [x, y, r] of [[0.95, 0.55, 0.03], [2.9, 1.05, 0.04], [3.5, 2.05, 0.025], [1.15, 2.95, 0.035], [2.3, 3.2, 0.02], [0.6, 1.5, 0.022]]) {
        const len = 0.15 + Rs() * 0.35;
        cyl(B.metal, secM, V3(x, y, -0.03), V3(x + (Rs() - 0.5) * 0.1, y - Rs() * 0.08, -0.03 - len), r, 12, { r2: r * (0.5 + Rs() * 0.4), wear: 0.8 });
        cyl(B.metal, secM, V3(x, y, -0.03), V3(x, y, -0.07), r * 1.8, 12, { wear: 0.6 });
      }
      for (const [x, y] of [[1.9, 0.6], [3.1, 2.6], [0.8, 2.2]]) for (let c = 0; c < 3; c++) {
        const L = 0.3 + Rs() * 0.5;
        tube(B.rubber, secM, [V3(x + c * 0.025, y, -0.03), V3(x + c * 0.03, y - 0.05, -0.2), V3(x + c * 0.04 + (Rs() - 0.5) * 0.2, y - L * 0.8, -0.3 - Rs() * 0.15), V3(x + (Rs() - 0.5) * 0.3, y - L * 1.6, -0.25 - Rs() * 0.25)], 0.008 + Rs() * 0.006, { color: [[0.05, 0.05, 0.05], [0.4, 0.33, 0.24], [0.35, 0.07, 0.03]][c], radial: 6 });
      }
      decal(mul(secM, T(2.7, 1.9, -0.045, 0, Math.PI, 0)), 'stripes', 0.8, 0.2);
      decal(mul(secM, T(1.0, 1.0, -0.045, 0, Math.PI, 0)), 'text', 0.5, 0.17);
    }
    tank(3.1 * SC, 1.05 * SC, 1.25, 0.42, [1, 0.3, 0.6, 0.9]);
    tank(3.2 * SC, 3.1 * SC, 1.9, 0.34, [-0.4, 1, 0.2, 0.5]);
  }
  {
    const shelfX = 1.3, shelfZ0 = 0.08, shelfZ1 = 0.62;
    const yAt = (yy) => V3(shelfX, yy, 0.3).applyMatrix4(secM).y;
    const solveY = (target) => { let a = -1, b = 4; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (yAt(m) < target) a = m; else b = m; } return (a + b) / 2; };
    const yRec = solveY(0.62);
    const rack = (yy) => {
      box(B.primer, mul(secM, T(shelfX + 0.05, yy - 0.12, (shelfZ0 + shelfZ1) / 2, 0, 0, 0)), 0.72, 0.03, shelfZ1 - shelfZ0, { wear: 0.8 });
      for (const zz of [shelfZ0 + 0.02, shelfZ1 - 0.02]) box(B.primer, mul(secM, T(shelfX + 0.05, yy - 0.15, zz)), 0.72, 0.05, 0.03);
    };
    for (const sx of [-0.33, 0.43]) for (const zz of [shelfZ0 + 0.02, shelfZ1 - 0.02]) {
      const a = V3(shelfX + sx, yRec - 0.95, zz), b = V3(shelfX + sx, yRec + 0.85, zz);
      const bent = sx < 0 && zz > 0.3;
      const pts = bent ? [a, V3(shelfX + sx, yRec + 0.3, zz), V3(shelfX + sx - 0.08, yRec + 0.55, zz + 0.05), V3(shelfX + sx - 0.3, yRec + 0.72, zz + 0.16)] : [a, b];
      sweep(B.primer, PROF.L, framesAlong(pts, () => V3(1, 0, 0)), secM, { wear: 0.7 });
    }
    rack(yRec);
    box(B.primer, mul(secM, T(shelfX + 0.02, yRec + 0.38, (shelfZ0 + shelfZ1) / 2 - 0.02, 0.1, 0, 0.16)), 0.72, 0.03, shelfZ1 - shelfZ0, { wear: 0.8 });
    tube(B.rubber, secM, [V3(shelfX - 0.9, yRec + 1.4, 0.9), V3(shelfX - 0.4, yRec + 0.6, 0.75), V3(shelfX - 0.42, yRec + 0.2, 0.66), V3(shelfX - 0.5, yRec - 0.4, 0.5), V3(shelfX - 0.7, yRec - 1.1, 0.7)], 0.016, { color: [0.05, 0.05, 0.05], radial: 7 });
    tube(B.rubber, secM, [V3(shelfX - 0.88, yRec + 1.42, 0.86), V3(shelfX - 0.38, yRec + 0.62, 0.71), V3(shelfX - 0.4, yRec + 0.22, 0.62), V3(shelfX - 0.55, yRec - 0.5, 0.42)], 0.01, { color: [0.4, 0.33, 0.24], radial: 6 });
    const avR = rng(1717);
    for (let i = 0; i < 3; i++) {
      const w = 0.18 + avR() * 0.1;
      rbox(B.primer, mul(secM, T(shelfX - 0.15 + i * 0.24, yRec + 0.5 - 0.105 + 0.1, 0.36 + (avR() - 0.5) * 0.08, 0, (avR() - 0.5) * 0.3, 0)), w, 0.2, 0.42, 0.01, { color: [0.16, 0.165, 0.17], raw: true, wear: 0.6 });
      decal(mul(secM, T(shelfX - 0.15 + i * 0.24, yRec + 0.5, 0.36 + 0.215)), 'text', w * 0.8, 0.07);
    }
    const recLocal = V3(shelfX + 0.04, yRec + 0.005, 0.36);
    const recQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(secM));
    const recWorld = recLocal.clone().applyMatrix4(secM);
    const recMx = mul(T(recWorld.x, recWorld.y, recWorld.z), new THREE.Matrix4().makeRotationFromQuaternion(recQ), new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(0, 1, 0), V3(-1, 0, 0)), T(0, 0, 0, 0.0, 0, 0.05));
    group.userData.recMx = recMx;
  }
  const recMx = group.userData.recMx;
  delete group.userData.recMx;
  {
    const BL = 0.4, BH = 0.19, BW = 0.27;
    const cage = (Mx) => {
      for (const sx of [-1, 1]) {
        sweep(B.metal, PROF.box(0.012, 0.03), framesAlong([V3(sx * (BL / 2 + 0.02), -BH / 2 - 0.02, -BW / 2 - 0.04), V3(sx * (BL / 2 + 0.02), -BH / 2 - 0.02, BW / 2 + 0.02)], () => V3(0, 1, 0)), Mx, { wear: 0.6 });
        for (const sz of [-1, 1]) cyl(B.metal, Mx, V3(sx * (BL / 2 + 0.02), -BH / 2 - 0.03, sz * (BW / 2 + 0.005)), V3(sx * (BL / 2 + 0.02), BH / 2 + 0.02, sz * (BW / 2 + 0.005)), 0.009, 8);
        tube(B.metal, Mx, [V3(sx * (BL / 2 + 0.02), BH / 2 + 0.02, -BW / 2), V3(sx * (BL / 2 + 0.03), BH / 2 + 0.05, 0), V3(sx * (BL / 2 + 0.02), BH / 2 + 0.02, BW / 2)], 0.008, { radial: 6 });
      }
      box(B.metal, mul(Mx, T(0, -BH / 2 - 0.035, -0.03)), BL + 0.08, 0.012, BW + 0.04, { wear: 0.8 });
      for (const sz of [-1, 1]) box(B.rubber, mul(Mx, T(0, BH / 2 + 0.006, sz * 0.08, 0, 0, 0.04)), BL + 0.07, 0.006, 0.035, { color: [0.12, 0.12, 0.11] });
      box(B.metal, mul(Mx, T(-BL / 2 - 0.02, 0, -BW / 2 - 0.035)), 0.03, BH + 0.05, 0.02);
      box(B.metal, mul(Mx, T(0, -BH / 2 - 0.02, -BW / 2 - 0.05)), BL + 0.04, 0.05, 0.02);
      tube(B.rubber, Mx, [V3(-0.08, 0.02, -BW / 2 - 0.06), V3(-0.1, 0.08, -BW / 2 - 0.2), V3(-0.3, -0.05, -BW / 2 - 0.45), V3(-0.5, -0.4, -BW / 2 - 0.6)], 0.011, { color: [0.07, 0.07, 0.07] });
      tube(B.rubber, Mx, [V3(0.1, 0.0, -BW / 2 - 0.06), V3(0.14, 0.03, -BW / 2 - 0.22), V3(0.25, -0.1, -BW / 2 - 0.5)], 0.008, { color: [0.4, 0.33, 0.24] });
    };
    cage(recMx);
    const beaconLocal = V3(BL / 2 + 0.02, BH / 2 + 0.03, -BW / 2 + 0.02);
    const bMx = mul(recMx, T(beaconLocal.x, beaconLocal.y, beaconLocal.z));
    cyl(B.metal, bMx, V3(0, 0, 0), V3(0, 0.05, 0), 0.03, 12);
    rbox(B.rubber, mul(bMx, T(0, 0.075, 0)), 0.07, 0.05, 0.07, 0.012, { color: [0.1, 0.1, 0.1] });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; tube(B.metal, bMx, [V3(Math.cos(a) * 0.036, 0.1, Math.sin(a) * 0.036), V3(Math.cos(a) * 0.045, 0.15, Math.sin(a) * 0.045), V3(0, 0.185, 0)], 0.004, { radial: 5, seg: 8 }); }
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.06, 0.04), name: 'wreck.lamp' });
    const lamp = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.075], [0.014, 0.072], [0.024, 0.062], [0.029, 0.045], [0.03, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 20), lampMat);
    lamp.name = 'wreck.strobe';
    lamp.matrixAutoUpdate = true;
    const bp = V3(), bq = new THREE.Quaternion(), bs = V3();
    mul(bMx, T(0, 0.1, 0)).decompose(bp, bq, bs);
    lamp.position.copy(bp); lamp.quaternion.copy(bq);
    group.add(lamp);
    const beacon = new THREE.Object3D(); beacon.name = 'beacon'; beacon.position.copy(bp); group.add(beacon); anchors.beacon = beacon;
    group.userData.lamp = lamp;

    const recPivot = V3().setFromMatrixPosition(recMx);
    const recBone = addBone('recorder', recPivot, { piece: false });
    const RB = recBone;
    const ribs = 7;
    rbox(B.paint, recMx, BL, BH, BW, 0.022, { bone: RB, seg: 3, color: tone([1, 1, 1], 0.1, 4), wear: 0.8 });
    for (let i = 0; i < ribs; i++) { const x = -BL / 2 + 0.05 + i * (BL - 0.1) / (ribs - 1); rbox(B.paint, mul(recMx, T(x, 0.004, 0)), 0.014, BH + 0.016, BW + 0.016, 0.006, { bone: RB, color: [0.92, 0.92, 0.92], wear: 0.9 }); }
    for (const sx of [-1, 1]) {
      rbox(B.rubber, mul(recMx, T(sx * (BL / 2 + 0.006), 0, 0)), 0.022, BH + 0.03, BW + 0.03, 0.008, { bone: RB, color: [0.06, 0.06, 0.06] });
      tube(B.metal, mul(recMx, T(sx * 0.12, BH / 2, 0)), [V3(0, 0, -0.07), V3(0, 0.045, -0.06), V3(0, 0.055, 0), V3(0, 0.045, 0.06), V3(0, 0, 0.07)], 0.007, { bone: RB, radial: 8, seg: 16 });
    }
    rbox(B.rubber, mul(recMx, T(-0.04, 0, BW / 2 + 0.004)), 0.2, 0.135, 0.012, 0.008, { bone: RB, color: [0.05, 0.05, 0.05] });
    for (let i = 0; i < 3; i++) {
      const cx = 0.115, cy = 0.05 - i * 0.05;
      cyl(B.metal, mul(recMx, T(cx, cy, BW / 2)), V3(0, 0, 0), V3(0, 0, 0.03), 0.017, 14, { bone: RB });
      cyl(B.rubber, mul(recMx, T(cx, cy, BW / 2)), V3(0, 0, 0.03), V3(0, 0, 0.034), 0.012, 12, { bone: RB, color: [0.05, 0.05, 0.05] });
    }
    for (let i = 0; i < 2; i++) {
      cyl(B.metal, mul(recMx, T(-0.08 + i * 0.16, 0.0, -BW / 2)), V3(0, 0, 0), V3(0, 0, -0.035), 0.022, 16, { bone: RB });
      for (let k = 0; k < 3; k++) cyl(B.metal, mul(recMx, T(-0.08 + i * 0.16, 0.0, -BW / 2 - 0.006 - k * 0.01)), V3(0, 0, 0), V3(0, 0, -0.005), 0.025, 16, { bone: RB });
    }
    decal(mul(recMx, T(0, BH / 2 + 0.0105, 0, -Math.PI / 2, 0, 0)), 'recorder', 0.3, 0.12, { bone: RB });
    decal(mul(recMx, T(0, 0.02, -BW / 2 - 0.0105, 0, Math.PI, 0)), 'recorder', 0.26, 0.1, { bone: RB });
    group.userData.recorderParts = { RB, BW };
  }
  const { RB, BW } = group.userData.recorderParts;
  delete group.userData.recorderParts;

  addBone('hullSection', V3(-1.5, 0, -1.2), { floating: false, radius: 3.4 });

  {
    const PW = 1.62, PH = 3.55, PD = 0.34;
    const pM = mul(T(-5.4, SEABED - 0.32, 3.4), new THREE.Matrix4().makeRotationY(0.42), new THREE.Matrix4().makeRotationX(-0.07), new THREE.Matrix4().makeRotationZ(0.05));
    const bone = addBone('panel', V3(-5.4, 0, 3.4), { floating: false, radius: 1.0 });
    const widths = [0.34, 0.29, 0.36, 0.31, 0.32];
    const tones = [[0.17, 0.175, 0.18], [0.55, 0.56, 0.57], [0.4, 0.41, 0.42], [0.64, 0.64, 0.65], [0.5, 0.51, 0.52]];
    let x = -PW / 2;
    widths.forEach((w, i) => {
      const Rr = rng(2000 + i);
      const top = PH - (i === 1 ? 0.07 : i === 3 ? -0.03 : Rr() * 0.05);
      const zoff = PD / 2 - 0.012 + (Rr() - 0.5) * 0.012;
      const surf = (u, v) => ({ p: V3(x + u, v, zoff + Math.sin(v / top * Math.PI) * 0.01 * (Rr() < 0.5 ? 1 : -1)), n: V3(0, 0, 1) });
      sheet({ bag: B.primer, rimBag: B.metal, w: w - 0.004, h: top, nu: 6, nv: 40, surf, t: 0.022, tear: i === 2 ? { v1: 0.1 } : {}, seed: 2100 + i, crumple: 0.02, M: pM, bone, color: tone(tones[i], 0.1, 1.1), raw: true, wear: 0.9 });
      x += w;
    });
    const bandY = PH * 0.8;
    box(B.tile, mul(pM, T(0.08, bandY, PD / 2 + 0.006)), PW - 0.12, 0.27, 0.025, { bone, sx: 8, color: [0.9, 0.9, 0.9] });
    rbox(B.primer, mul(pM, T(0.42, PH * 0.42, PD / 2 + 0.008)), 0.62, 0.95, 0.02, 0.006, { bone, color: [0.58, 0.58, 0.59], raw: true, wear: 0.6 });
    decal(mul(pM, T(0.26, PH * 0.58, PD / 2 + 0.014)), 'vertical', 0.27, 1.08, { bone, wear: 0.25 });
    decal(mul(pM, T(-0.45, PH * 0.93, PD / 2 + 0.014)), 'num', 0.18, 0.18, { bone });
    for (const sx of [-1, 1]) {
      const fx = sx * (PW / 2 + 0.005);
      const pts = []; for (let y = 0; y <= PH - 0.02; y += 0.2) pts.push(V3(fx, y, 0));
      sweep(B.primer, [[0, -PD / 2], [0, PD / 2 - 0.01], [0.012, PD / 2 - 0.01], [0.012, -PD / 2 + 0.012], [0.05 * -sx * -1, -PD / 2 + 0.012], [0.05 * -sx * -1, -PD / 2]].map(([a, b]) => [a, b]), framesAlong(pts, () => V3(-sx, 0, 0)).map(f => ({ p: f.p, n: V3(-sx, 0, 0), b: V3(0, 0, 1) })), pM, { bone, color: [0.5, 0.52, 0.5], wear: 1 });
    }
    for (let y = 0.3; y < PH - 0.1; y += 0.48) {
      const pts = [V3(-PW / 2 + 0.01, y, -PD / 2 + 0.02), V3(PW / 2 - 0.01, y, -PD / 2 + 0.02)];
      sweep(B.primer, PROF.C.map(([a, b]) => [a * 2.3, b]), [{ p: pts[0], n: V3(0, 0, 1), b: V3(0, 1, 0) }, { p: pts[1], n: V3(0, 0, 1), b: V3(0, 1, 0) }], pM, { bone, color: [0.7, 0.74, 0.68], wear: 1 });
    }
    for (const xx of [-0.4, 0.05, 0.47]) sweep(B.primer, PROF.hat.map(([a, b]) => [a * 1.5, b]), framesAlong([V3(xx, 0, PD / 2 - 0.03), V3(xx, PH - 0.08, PD / 2 - 0.03)], () => V3(0, 0, -1)).map(f => ({ p: f.p, n: V3(0, 0, -1), b: V3(1, 0, 0) })), pM, { bone, color: [0.66, 0.7, 0.64] });
    const backSurf = (u, v) => ({ p: V3(u - PW / 2, v, -PD / 2 + 0.008), n: V3(0, 0, -1) });
    const bs2 = (u, v) => { const s = backSurf(PW - u, v); return { p: s.p, n: s.n }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w: PW, h: PH * 0.55, res: 0.06, surf: bs2, t: 0.02, tear: { v1: 0.7, u0: 0.18 }, seed: 2300, crumple: 0.08, curl: 0.22, M: pM, bone, color: tone([0.7, 0.71, 0.73], 0.1), colorBack: [0.6, 0.64, 0.58], wear: 1 });
    sheet({ bag: B.insul, w: 0.9, h: 1.3, res: 0.06, surf: (u, v) => ({ p: V3(u - 0.2, PH * 0.62 + v * 0.45 - 0.9 + Math.sin(v * 2) * 0.05, -PD / 2 - 0.05 - v * 0.25 + 0.04 * Math.sin(u * 9)), n: V3(0, 0, -1) }), t: 0.025, tear: { v0: 0.3, u1: 0.2, v1: 0.2 }, seed: 2400, quilt: 0.018, crumple: 0.05, M: pM, bone, color: tone([0.85, 0.84, 0.78], 0.12, 1.4) });
    tube(B.rubber, pM, [V3(0.2, PH * 0.7, -PD / 2 + 0.06), V3(0.35, PH * 0.6, -PD / 2 - 0.08), V3(0.5, PH * 0.35, -PD / 2 - 0.25), V3(0.8, 0.4, -PD / 2 - 0.6), V3(1.4, 0.3, -PD / 2 - 1.2)], 0.012, { bone, color: [0.06, 0.06, 0.06] });
    tube(B.rubber, pM, [V3(0.24, PH * 0.7, -PD / 2 + 0.06), V3(0.4, PH * 0.58, -PD / 2 - 0.1), V3(0.62, PH * 0.3, -PD / 2 - 0.3), V3(1.1, 0.45, -PD / 2 - 0.9)], 0.009, { bone, color: [0.45, 0.38, 0.28] });
    const topS = (u, v) => ({ p: V3(u - PW / 2, PH - 0.09, PD / 2 - 0.03 - v), n: V3(0, 1, 0) });
    sheet({ bag: B.primer, w: PW, h: PD * 0.6, nu: 20, nv: 4, surf: topS, t: 0.01, tear: { v1: 0.06 }, seed: 2500, M: pM, bone, wear: 0.6 });
  }

  const piece = (name, pos, rot, info, build) => {
    const Mx = mul(T(pos[0], pos[1], pos[2]), new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')));
    const bone = addBone(name, V3(pos[0], info.floating ? 0 : pos[1], pos[2]), info);
    build(Mx, bone);
    return bone;
  };
  piece('skinLarge', [4.6, 0.05, 2.6], [0.06, 0.9, -0.04], { floating: true, radius: 1.8, draft: 0.05, size: [2.6, 1.7], mass: 2.2 }, (Mx, bone) => {
    const w = 2.6, h = 1.7;
    const surf = (u, v) => { const x = u - w / 2, y = v - h / 2; return { p: V3(x, 0.06 * Math.cos(x * 0.9) + 0.35 * Math.max(0, y - 0.25) ** 2 + 0.25 * Math.max(0, -x - 0.6) ** 2, y), n: V3(0, 1, 0) }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w, h, res: 0.07, surf: (u, v) => { const s = surf(u, v); return { p: s.p, n: V3(0, 1, 0) }; }, t: 0.028, tear: { u0: 0.4, u1: 0.35, v0: 0.3, v1: 0.45 }, seed: 3100, crumple: 0.1, curl: 0.22, M: Mx, bone, color: tone([0.95, 0.96, 0.98], 0.1), colorBack: [0.55, 0.6, 0.52], wear: 1 });
    for (const xx of [-0.55, 0.05, 0.6]) {
      const pts = []; for (let y = -0.45; y <= 0.55; y += 0.1) { const s = surf(xx + w / 2, y + h / 2); pts.push(s.p.clone().add(V3(0, -0.015, 0))); }
      sweep(B.primer, PROF.Cs, framesAlong(pts, () => V3(0, -1, 0)), Mx, { bone, color: [0.8, 0.82, 0.78] });
    }
    const end = surf(0.2 + w / 2, 0.55 + h / 2).p;
    sweep(B.primer, PROF.C, framesAlong([end.clone().add(V3(-0.6, -0.02, 0)), end.clone().add(V3(0, -0.02, 0)), end.clone().add(V3(0.3, 0.2, 0.05)), end.clone().add(V3(0.45, 0.55, 0.15)), end.clone().add(V3(0.5, 0.85, 0.3))], () => V3(0, 0, 1)), Mx, { bone, color: [0.8, 0.82, 0.78] });
    decalOn((u, v) => { const s = surf(u, v); return { p: s.p, n: V3(0, 1, 0) }; }, 1.35, 0.75, 0.9, 0.22, 'lander', Mx, { bone, off: 0.017 });
    decalOn((u, v) => { const s = surf(u, v); return { p: s.p, n: V3(0, 1, 0) }; }, 0.75, 1.2, 0.4, 0.2, 'stripes', Mx, { bone, off: 0.017 });
  });
  piece('skinSmall', [-8.6, 0.04, -1.2], [0.0, -0.5, 0.08], { floating: true, radius: 1.2, draft: 0.04, size: [2.1, 1.3], mass: 1.4 }, (Mx, bone) => {
    const w = 2.1, h = 1.3;
    const surf = (u, v) => { const x = u - w / 2, y = v - h / 2; return { p: V3(x, 0.4 * Math.max(0, x - 0.25) ** 1.6 + 0.04 * Math.sin(y * 4), y), n: V3(0, 1, 0) }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w, h, res: 0.06, surf, t: 0.025, tear: { u0: 0.3, v0: 0.22, v1: 0.25, u1: 0.15 }, seed: 3200, crumple: 0.1, curl: 0.2, M: Mx, bone, color: tone([0.7, 0.71, 0.73], 0.1), colorBack: [0.55, 0.6, 0.52] });
    decalOn(surf, 0.55, 0.45, 0.42, 0.22, 'noStep', Mx, { bone, off: 0.015 });
  });
  piece('tileFragment', [8.4, 0.03, -2.4], [0.05, 2.1, -0.06], { floating: true, radius: 1.1, draft: 0.03, size: [1.6, 1.0], mass: 1.4 }, (Mx, bone) => {
    const w = 1.6, h = 1.0;
    const surf = (u, v) => ({ p: V3(u - w / 2, 0.08 * Math.sin(u * 2.2) + 0.25 * Math.max(0, v - 0.65) ** 2, v - h / 2), n: V3(0, -1, 0) });
    const sfl = (u, v) => { const s = surf(w - u, v); return s; };
    sheet({ bag: B.primer, backBag: B.hull, rimBag: B.metal, w, h, res: 0.07, surf: sfl, t: 0.03, tear: { u0: 0.3, u1: 0.2, v0: 0.15, v1: 0.3 }, seed: 3300, crumple: 0.06, curl: 0.15, M: Mx, bone, color: [0.6, 0.64, 0.58], colorBack: tone([0.8, 0.8, 0.82], 0.1) });
    const Rr = rng(3301);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) {
      if (Rr() < 0.18) continue;
      const u = 0.25 + i * 0.145, v = 0.18 + j * 0.13;
      if (u > w - 0.3 || v > h - 0.2) continue;
      const s = surf(u, v);
      box(B.tile, mul(Mx, T(s.p.x, s.p.y + 0.03, s.p.z, 0, (Rr() - 0.5) * 0.04, 0)), 0.14, 0.04, 0.125, { bone, color: [1, 1, 1], wear: 0.7 });
    }
  });
  piece('markedPanel', [-5.2, 0.03, 6.4], [0.04, 0.3, 0.02], { floating: true, radius: 0.9, draft: 0.04, size: [1.6, 1.0], mass: 1 }, (Mx, bone) => {
    const w = 1.6, h = 1.0;
    const surf = (u, v) => ({ p: V3(u - w / 2, 0.12 * Math.max(0, v - 0.45) ** 1.5 * 3, v - h / 2), n: V3(0, 1, 0) });
    const s2 = (u, v) => { const s = surf(u, h - v); return { p: s.p, n: s.n }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w, h, res: 0.05, surf: s2, t: 0.025, tear: { u1: 0.18, v1: 0.12 }, seed: 3400, crumple: 0.05, curl: 0.12, M: Mx, bone, color: tone([0.95, 0.95, 0.97], 0.08), colorBack: [0.55, 0.6, 0.52] });
    for (const zz of [-0.25, 0.25]) sweep(B.primer, PROF.Cs, framesAlong([V3(-0.5, -0.025, zz), V3(0.4, -0.025, zz)], () => V3(0, -1, 0)), Mx, { bone });
    decalOn(s2, 0.42, 0.42, 0.55, 0.28, 'rescue', Mx, { bone, off: 0.016 });
  });
  piece('blanket', [1.2, 0.0, 5.4], [0, 0.7, 0], { floating: true, radius: 1.4, draft: 0.01, size: [2.5, 1.7], mass: 0.6 }, (Mx, bone) => {
    const w = 2.5, h = 1.7;
    const surf = (u, v) => ({ p: V3(u - w / 2, 0.05 * Math.sin(u * 3.1) * Math.sin(v * 2.3) + 0.12 * Math.max(0, fbm(u * 1.4, v * 1.4, 5, 2) - 0.45) + 0.18 * Math.max(0, u - 1.25) ** 1.3, v - h / 2), n: V3(0, 1, 0) });
    sheet({ bag: B.insul, w, h, res: 0.05, surf, t: 0.03, tear: { u0: 0.3, u1: 0.35, v0: 0.2, v1: 0.3 }, seed: 3500, quilt: 0.03, crumple: 0.08, curl: 0.12, M: Mx, bone, color: tone([1.25, 1.22, 1.15], 0.08, 1.2), wear: 0.4 });
  });
  piece('blanket2', [-7.4, 0.0, 1.6], [0, -0.4, 0], { floating: true, radius: 1.2, draft: 0.01, size: [2.1, 1.4], mass: 0.5 }, (Mx, bone) => {
    const w = 2.1, h = 1.4;
    const surf = (u, v) => ({ p: V3(u - w / 2, 0.06 * Math.sin(u * 2.7 + 1) * Math.sin(v * 2.1) + 0.2 * Math.max(0, v - 1.0) ** 1.4 + 0.1 * Math.max(0, fbm(u * 1.2, v * 1.2, 9, 2) - 0.45), v - h / 2), n: V3(0, 1, 0) });
    sheet({ bag: B.insul, w, h, res: 0.06, surf, t: 0.03, tear: { u0: 0.3, u1: 0.25, v0: 0.2, v1: 0.3 }, seed: 3550, quilt: 0.03, crumple: 0.08, curl: 0.12, M: Mx, bone, color: tone([1.2, 1.18, 1.1], 0.08, 1.2), wear: 0.4 });
  });
  piece('container', [6.8, 0.1, -4.6], [0.12, 0.4, 0.2], { floating: true, radius: 0.8, draft: 0.17, size: [0.9, 0.6], mass: 1.5 }, (Mx, bone) => {
    const g = new RoundedBoxGeometry(0.9, 0.55, 0.62, 3, 0.04);
    crush(g, (p) => { const d = Math.exp(-((p.x - 0.25) ** 2 + (p.z - 0.31) ** 2) / 0.05); p.z -= d * 0.09 * Math.sign(p.z + 1e-4) * (p.z > 0 ? 1 : 0); p.y -= Math.exp(-((p.x + 0.3) ** 2) / 0.04) * 0.04 * (p.y > 0 ? 1 : 0); });
    B.primer.add(g, Mx, { bone, color: [0.3, 0.31, 0.3], raw: true, wear: 1 });
    for (const xx of [-0.3, 0, 0.3]) box(B.primer, mul(Mx, T(xx, 0, 0)), 0.04, 0.575, 0.645, { bone, color: [0.26, 0.27, 0.26], raw: true });
    for (const sz of [-1, 1]) for (const xx of [-0.22, 0.22]) { box(B.metal, mul(Mx, T(xx, 0.16, sz * 0.325)), 0.07, 0.05, 0.02, { bone }); box(B.metal, mul(Mx, T(xx, 0.2, sz * 0.33)), 0.035, 0.035, 0.012, { bone }); }
    for (const sx of [-1, 1]) tube(B.metal, mul(Mx, T(sx * 0.46, 0.05, 0)), [V3(0, 0, -0.15), V3(sx * 0.04, 0.0, -0.1), V3(sx * 0.045, 0, 0.1), V3(0, 0, 0.15)], 0.009, { bone, radial: 6 });
    decal(mul(Mx, T(0, 0.04, 0.315)), 'o2', 0.22, 0.22, { bone });
    decal(mul(Mx, T(0, 0.281, 0, -Math.PI / 2, 0, 0)), 'text', 0.6, 0.26, { bone });
  });
  piece('tank', [-6.2, 0.18, -4.3], [0.3, -0.8, 1.42], { floating: true, radius: 0.9, draft: 0.2, size: [1.3, 0.5], mass: 1.2 }, (Mx, bone) => {
    const r = 0.27, L = 0.75;
    const g = new THREE.CapsuleGeometry(r, L, 10, 26);
    crush(g, (p) => { const d = Math.exp(-((p.y - 0.15) ** 2) / 0.04) * Math.max(0, p.x / r); p.x -= d * 0.13; p.multiplyScalar(1 + (fbm(p.x * 5, p.y * 5, p.z * 5, 2) - 0.5) * 0.03); });
    B.primer.add(g, Mx, { bone, color: [0.6, 0.6, 0.57], raw: true, wear: 1 });
    for (const yy of [-0.3, 0.3]) cyl(B.metal, mul(Mx, T(0, yy, 0)), V3(0, -0.02, 0), V3(0, 0.02, 0), r + 0.012, 24, { bone });
    cyl(B.metal, mul(Mx, T(0, L / 2 + r, 0)), V3(0, -0.02, 0), V3(0, 0.08, 0), 0.03, 10, { bone });
    tube(B.metal, Mx, [V3(0, L / 2 + r + 0.07, 0), V3(0.05, L / 2 + r + 0.16, 0.02), V3(0.18, L / 2 + r + 0.2, 0.06), V3(0.26, L / 2 + r + 0.16, 0.1)], 0.012, { bone, radial: 7 });
    decal(mul(Mx, T(0, 0, r + 0.004)), 'o2', 0.16, 0.16, { bone, color: [1, 1, 1] });
  });
  piece('seat', [-1.4, -0.3, -5.6], [0.25, 2.4, 1.2], { floating: false, radius: 0.7 }, (Mx, bone) => {
    const tubeR = 0.022;
    const fr = [V3(-0.25, 0, -0.25), V3(0.25, 0, -0.25), V3(0.25, 0, 0.25), V3(-0.25, 0, 0.25)];
    for (let i = 0; i < 4; i++) cyl(B.metal, Mx, fr[i], fr[(i + 1) % 4], tubeR, 8, { bone });
    for (const sx of [-1, 1]) tube(B.metal, Mx, [V3(sx * 0.25, 0, 0.25), V3(sx * 0.25, 0.35, 0.3), V3(sx * 0.22, 0.72, 0.36), V3(sx * 0.24, 0.85, 0.32)], tubeR, { bone, radial: 8 });
    cyl(B.metal, Mx, V3(-0.24, 0.72, 0.36), V3(0.12, 0.74, 0.36), tubeR, 8, { bone });
    rbox(B.rubber, mul(Mx, T(0, 0.06, 0)), 0.48, 0.08, 0.48, 0.03, { bone, color: [0.2, 0.06, 0.03] });
    const back = new RoundedBoxGeometry(0.46, 0.55, 0.08, 2, 0.03);
    crush(back, (p) => { if (p.x > 0.05 && p.y > 0.1) { p.z += (p.x - 0.05) * 0.4; p.x -= (p.y - 0.1) * 0.1; } });
    B.rubber.add(back, mul(Mx, T(0, 0.45, 0.36, -0.12, 0, 0)), { bone, color: [0.08, 0.08, 0.085] });
    for (const sx of [-1, 1]) cyl(B.metal, Mx, V3(sx * 0.2, 0, -0.25), V3(sx * 0.25, -0.35, -0.38), tubeR * 1.2, 8, { bone });
    tube(B.rubber, Mx, [V3(-0.15, 0.8, 0.4), V3(-0.12, 0.4, 0.45), V3(0, 0.1, 0.3), V3(0.3, 0.05, -0.1), V3(0.6, -0.1, -0.4)], 0.012, { bone, color: [0.12, 0.11, 0.1], radial: 5 });
    sweep(B.rubber, PROF.box(0.004, 0.045), framesAlong([V3(0.18, 0.8, 0.4), V3(0.2, 0.4, 0.45), V3(0.1, 0.1, 0.25), V3(-0.3, 0.02, -0.2), V3(-0.7, -0.1, -0.5)], () => V3(0, 0, 1)), Mx, { bone, color: [0.3, 0.27, 0.22] });
  });
  piece('gearStrut', [9.6, -0.6, 1.6], [0, -0.4, 0.62], { floating: false, radius: 1.3 }, (Mx, bone) => {
    cyl(B.metal, Mx, V3(0, -0.2, 0), V3(0, 1.3, 0), 0.085, 18, { bone });
    cyl(B.primer, Mx, V3(0, 1.1, 0), V3(0, 2.6, 0), 0.12, 18, { bone, color: [0.55, 0.57, 0.55] });
    for (const yy of [1.25, 2.4]) cyl(B.metal, Mx, V3(0, yy, 0), V3(0, yy + 0.06, 0), 0.14, 18, { bone });
    const tl = [V3(0.12, 2.0, 0), V3(0.38, 1.55, 0.02), V3(0.1, 1.05, 0)];
    sweep(B.primer, PROF.box(0.05, 0.09), framesAlong([tl[0], tl[1]], () => V3(0, 0, 1)), Mx, { bone });
    sweep(B.primer, PROF.box(0.05, 0.09), framesAlong([tl[1], tl[2]], () => V3(0, 0, 1)), Mx, { bone });
    cyl(B.metal, Mx, V3(0.38, 1.55, -0.06), V3(0.38, 1.55, 0.08), 0.03, 10, { bone });
    const pad = new THREE.CylinderGeometry(0.5, 0.42, 0.1, 28, 1);
    crush(pad, (p) => { if (p.x > 0.2) p.y += (p.x - 0.2) * 0.35; });
    B.primer.add(pad, mul(Mx, T(0, -0.3, 0, 0.15, 0, 0.1)), { bone, color: [0.45, 0.47, 0.45] });
    const top = V3(0, 2.6, 0);
    for (let i = 0; i < 4; i++) { const a = i * 1.7; tube(B.metal, Mx, [top, top.clone().add(V3(Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.1)), top.clone().add(V3(Math.cos(a) * 0.22, 0.18 + i * 0.03, Math.sin(a) * 0.22))], 0.022 - i * 0.003, { bone, radial: 7 }); }
    tube(B.rubber, Mx, [V3(-0.12, 2.5, 0), V3(-0.14, 1.8, 0.02), V3(-0.12, 1.2, 0.05), V3(-0.3, 0.5, 0.2)], 0.012, { bone, color: [0.06, 0.06, 0.06] });
  });
  piece('ribArc', [2.9, -0.9, -5.2], [0.05, 0.25, 0.1], { floating: false, radius: 1.2 }, (Mx, bone) => {
    const pts = [];
    for (let i = 0; i <= 26; i++) { const t = i / 26, a = t * 2.1; pts.push(V3(Math.sin(a) * 1.5 - 0.2 * t * t, (1 - Math.cos(a)) * -0.2 + a * 1.25 - 0.4 * t ** 3, 0.12 * t * t)); }
    sweep(B.primer, PROF.C.map(([a, b]) => [a * 1.6, b * 1.4]), framesAlong(pts, (i, p, tan) => V3(0, 0, 1).cross(tan).normalize()), Mx, { bone, color: [0.8, 0.83, 0.77] });
    const surf = (u, v) => { const t = clamp(u / 1.9, 0, 1), a = t * 2.1; return { p: V3(Math.sin(a) * 1.5 + 0.02, a * 1.25 - 0.2 * (1 - Math.cos(a)), v - 0.65), n: V3(1, 0, 0) }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w: 1.5, h: 1.1, res: 0.07, surf: (u, v) => { const s = surf(u, v); const tt = (u + 0.01) / 1.9 * 2.1; return { p: s.p, n: V3(Math.cos(tt), -Math.sin(tt) * 0.3, 0).normalize() }; }, t: 0.026, tear: { u1: 0.5, v0: 0.3, v1: 0.4 }, seed: 3600, crumple: 0.1, curl: 0.25, M: Mx, bone, color: tone([0.88, 0.89, 0.92], 0.12) });
    tube(B.rubber, Mx, [V3(1.0, 1.6, 0.05), V3(1.2, 1.2, 0.2), V3(1.3, 0.8, 0.5), V3(1.0, 0.7, 1.0)], 0.01, { bone, color: [0.07, 0.07, 0.07] });
  });
  piece('cornerSkin', [-9.8, -0.5, 3.2], [0.2, 1.0, -0.45], { floating: false, radius: 0.9 }, (Mx, bone) => {
    const w = 1.6, h = 1.3;
    const surf = (u, v) => { const k = clamp((u - 0.7) / 0.25, 0, 1); const ang = k * 1.45; const x = u < 0.7 ? u : 0.7 + Math.sin(ang) * 0.16 + Math.max(0, u - 0.95) * Math.cos(1.45); const z = u < 0.7 ? 0 : (1 - Math.cos(ang)) * 0.16 + Math.max(0, u - 0.95) * Math.sin(1.45); return { p: V3(x, v, z), n: V3(0, 0, 1) }; };
    const s2 = (u, v) => { const a = surf(u, v).p, b = surf(u + 0.01, v).p; const tng = V3().subVectors(b, a).normalize(); return { p: a, n: V3(-tng.z, 0, tng.x) }; };
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w, h, res: 0.06, surf: s2, t: 0.028, tear: { u0: 0.3, u1: 0.25, v1: 0.45 }, seed: 3700, crumple: 0.1, curl: 0.25, M: Mx, bone, color: tone([0.8, 0.81, 0.83], 0.12), colorBack: [0.55, 0.6, 0.52] });
    for (const vv of [0.3, 0.75]) { const pts = []; for (let u = 0.1; u < 1.4; u += 0.06) pts.push(s2(u, vv).p.clone().addScaledVector(s2(u, vv).n, -0.016)); sweep(B.primer, PROF.Cs, framesAlong(pts, (i, p) => s2(0.1 + i * 0.06, vv).n.clone().negate()), Mx, { bone, color: [0.8, 0.82, 0.78] }); }
    decalOn(s2, 0.35, 0.95, 0.5, 0.25, 'stripes', Mx, { bone, off: 0.016 });
  });
  piece('hatchDoor', [-1.0, -0.42, 4.4], [1.1, 0.4, 0.15], { floating: false, radius: 0.6 }, (Mx, bone) => {
    const g = new RoundedBoxGeometry(0.64, 0.96, 0.07, 3, 0.03);
    crush(g, (p) => { p.z += 0.05 * Math.exp(-((p.x - 0.1) ** 2 + (p.y + 0.2) ** 2) / 0.08); });
    B.hull.add(g, Mx, { bone, color: [0.95, 0.95, 0.97], wear: 1 });
    box(B.primer, mul(Mx, T(0, 0, -0.06)), 0.5, 0.8, 0.05, { bone });
    for (const yy of [-0.2, 0.2]) box(B.primer, mul(Mx, T(0, yy, -0.09)), 0.52, 0.04, 0.03, { bone });
    cyl(B.metal, mul(Mx, T(0.18, 0, 0.04)), V3(0, 0, 0), V3(0, 0, 0.05), 0.05, 16, { bone });
    cyl(B.metal, mul(Mx, T(0.18, 0, 0.09)), V3(-0.09, 0, 0), V3(0.09, 0, 0), 0.012, 8, { bone });
    for (const yy of [-0.32, 0.3]) { box(B.metal, mul(Mx, T(-0.34, yy, 0)), 0.06, 0.12, 0.05, { bone }); sweep(B.metal, PROF.box(0.012, 0.05), framesAlong([V3(-0.34, yy, 0.03), V3(-0.42, yy, 0.03), V3(-0.5, yy + 0.04, 0.0)], () => V3(0, 0, 1)), Mx, { bone }); }
    decal(mul(Mx, T(0, 0.3, 0.0365)), 'rescue', 0.42, 0.11, { bone });
  });
  piece('radiatorBox', [-11.6, -0.45, -2.6], [0.1, 0.3, -0.25], { floating: false, radius: 1.0 }, (Mx, bone) => {
    const g = new THREE.BoxGeometry(1.9, 0.9, 0.5, 14, 6, 4);
    crush(g, (p) => { p.y -= 0.18 * Math.exp(-((p.x - 0.5) ** 2) / 0.15) * (p.y > 0 ? 1 : 0.3); p.x += (fbm(p.y * 3, p.z * 3, 1, 2) - 0.5) * 0.05; });
    B.hull.add(g, Mx, { bone, color: [0.72, 0.73, 0.75], wear: 1 });
    for (let i = 0; i < 9; i++) { const x = -0.8 + i * 0.2; const h = 0.75 - (Math.abs(x - 0.5) < 0.3 ? 0.18 : 0); box(B.metal, mul(Mx, T(x, 0.02, 0.27, 0, 0, (i % 3 === 1 ? 0.12 : 0))), 0.012, h, 0.08, { bone, wear: 0.8 }); }
    decal(mul(Mx, T(-0.4, 0.2, 0.252)), 'endurance', 0.7, 0.18, { bone });
  });
  piece('debrisPlate', [5.4, -0.3, -1.6], [0.9, -1.2, 0.3], { floating: false, radius: 0.6 }, (Mx, bone) => {
    const w = 1.0, h = 0.8;
    sheet({ bag: B.hull, backBag: B.primer, rimBag: B.metal, w, h, res: 0.06, surf: planeSurf(w, h), t: 0.024, tear: { u0: 0.25, u1: 0.2, v0: 0.2, v1: 0.3 }, seed: 3800, crumple: 0.12, curl: 0.2, M: Mx, bone, color: tone([0.85, 0.86, 0.88], 0.12), colorBack: [0.55, 0.6, 0.52] });
  });
  piece('looseCables', [2.8, 0.0, 3.2], [0, 0.3, 0], { floating: true, radius: 1.0, draft: 0.0, size: [1.8, 0.6], mass: 0.3 }, (Mx, bone) => {
    const Rr = rng(3900);
    for (let c = 0; c < 4; c++) {
      const pts = []; for (let i = 0; i < 7; i++) pts.push(V3(-0.9 + i * 0.3 + (Rr() - 0.5) * 0.1, -0.005 + (i === 0 ? 0.08 : 0), Math.sin(i * 0.9 + c * 0.6) * 0.2 + c * 0.04));
      tube(B.rubber, Mx, pts, 0.01 + Rr() * 0.008, { bone, color: [[0.05, 0.05, 0.05], [0.4, 0.33, 0.24], [0.08, 0.08, 0.08], [0.35, 0.07, 0.03]][c], radial: 6 });
    }
    rbox(B.primer, mul(Mx, T(-0.95, 0.06, 0.08, 0.2, 0.3, 0.1)), 0.18, 0.1, 0.14, 0.01, { bone, color: [0.16, 0.165, 0.17], raw: true });
  });

  {
    const tileRun = (u0, u1, v0, v1) => {
      for (let u = u0; u < u1; u += 0.16) for (let v = v0; v < v1; v += 0.16) {
        if (v > vMax(u) - 0.2 || u < uMin(v) + 0.1 || u > uMax(v) - 0.1) continue;
        if (hash3(u * 7, v * 7, 1) < 0.12) continue;
        const s = secSurf(u, v);
        const t = V3(profAt(u).tx, profAt(u).ty, 0);
        const bas = new THREE.Matrix4().makeBasis(t, V3(0, 0, 1), s.n).setPosition(s.p.clone().addScaledVector(s.n, 0.032));
        box(B.tile, mul(secM, bas), 0.15, 0.15, 0.035, { color: [1, 1, 1], wear: 0.8 });
      }
    };
    tileRun(0.15, 2.9, 0.1, LEN);
    const winU = ULEN * 0.62;
    for (let k = 0; k < 3; k++) {
      const v = 0.75 + k * 1.15;
      if (v > vMax(winU) - 0.5) break;
      const s = secSurf(winU, v), a = profAt(winU), t = V3(a.tx, a.ty, 0);
      const bas = new THREE.Matrix4().makeBasis(t, V3(0, 0, 1), s.n).setPosition(s.p.clone().addScaledVector(s.n, 0.015));
      box(B.metal, mul(secM, bas, T(0, 0, 0.02)), 0.6, 0.6, 0.05, { color: [0.35, 0.35, 0.35] });
      box(B.rubber, mul(secM, bas, T(0, 0, 0.035)), 0.46, 0.46, 0.04, { color: [0.012, 0.013, 0.014], wear: 0 });
      if (k === 1) for (let i = 0; i < 5; i++) { const g = new THREE.TetrahedronGeometry(0.06 + hash3(i, 3, 3) * 0.05); B.rubber.add(g, mul(secM, bas, T((hash3(i, 1, 2) - 0.5) * 0.35, (hash3(i, 2, 1) - 0.5) * 0.35, 0.06, i, i * 2, 0)), { color: [0.05, 0.06, 0.065] }); }
    }
    decalOn(secSurf, ULEN * 0.86, 1.6, 1.6, 0.4, 'lander', secM, { off: 0.03 });
    decalOn(secSurf, ULEN * 0.86, 3.0, 0.9, 0.22, 'stripes', secM, { off: 0.03 });
    decalOn(secSurf, ULEN * 0.45, 2.2, 0.4, 0.4, 'roundel', secM, { off: 0.03 });
    decalOn(secSurf, ULEN * 0.5, 0.8, 0.6, 0.3, 'noStep', secM, { off: 0.03 });
    for (const [u, v] of [[ULEN * 0.7, 0.4], [ULEN * 0.3, 4.2]]) decalOn(secSurf, u, v, 0.8, 1.3, 'grime', secM, { off: 0.031 });
    const railU = ULEN * 0.74;
    const rp = [];
    for (let v = 0.4; v < Math.min(4.2, vMax(railU) - 0.3); v += 0.1) { const s = secSurf(railU, v); rp.push(s.p.clone().addScaledVector(s.n, 0.11)); }
    if (rp.length > 3) { tube(B.metal, secM, rp, 0.016, { radial: 8 }); for (let i = 0; i < rp.length; i += 8) { const s = secSurf(railU, 0.4 + i * 0.1); cyl(B.metal, secM, s.p, rp[i], 0.012, 8); } }
    const boxU = ULEN * 0.3, bs = secSurf(boxU, 1.2), ba = profAt(boxU);
    const bb = new THREE.Matrix4().makeBasis(V3(ba.tx, ba.ty, 0), V3(0, 0, 1), bs.n).setPosition(bs.p);
    rbox(B.primer, mul(secM, bb, T(0, 0, 0.18)), 0.55, 0.55, 0.36, 0.04, { color: [0.2, 0.2, 0.21], raw: true });
    for (const [dx, dy, rz] of [[0.3, 0, -Math.PI / 2], [-0.3, 0, Math.PI / 2], [0, 0.3, 0]]) cyl(B.metal, mul(secM, bb, T(dx, dy, 0.2, 0, 0, rz)), V3(0, 0, 0), V3(0, 0.1, 0), 0.04, 12, { r2: 0.06, open: true });
  }

  const bakeInfo = bakeAO(Object.values(B), { skip: [B.marks] });

  const skeleton = new THREE.Skeleton(bones, bones.map(b => new THREE.Matrix4().makeTranslation(-b.position.x, -b.position.y, -b.position.z)));
  const meshes = [];
  const bindI = new THREE.Matrix4();
  for (const [k, bag] of Object.entries(B)) {
    const g = bag.build();
    if (!g) continue;
    const m = new THREE.SkinnedMesh(g, M[k]);
    m.name = 'wreck.' + k;
    m.bind(skeleton, bindI);
    m.castShadow = k !== 'marks'; m.receiveShadow = true;
    m.boundingSphere = g.boundingSphere.clone(); m.boundingSphere.radius += 1.5;
    m.boundingBox = g.boundingBox.clone().expandByScalar(1.5);
    if (k === 'marks') m.renderOrder = 2;
    group.add(m); meshes.push(m);
  }
  const lamp = group.userData.lamp; delete group.userData.lamp;
  const recBone = bones[RB];

  const slotW = 0.17, slotH = 0.112;
  const glassMat = new THREE.MeshStandardMaterial({ name: 'wreck.recorderGlass', color: 0x040607, roughness: 0.12, metalness: 0 });
  const slotMesh = new THREE.Mesh(new THREE.PlaneGeometry(slotW, slotH), glassMat);
  slotMesh.name = 'wreck.recorderSlot';
  {
    const p = V3(), qq = new THREE.Quaternion(), s = V3();
    mul(new THREE.Matrix4().makeTranslation(-recBone.position.x, -recBone.position.y, -recBone.position.z), recMx, T(-0.04, 0, BW / 2 + 0.0112)).decompose(p, qq, s);
    slotMesh.position.copy(p); slotMesh.quaternion.copy(qq);
    recBone.add(slotMesh);
  }
  const recorder = recBone;
  recorder.name = 'recorder';
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.34), glassMat);
  hit.name = 'wreck.recorderHit'; hit.visible = false;
  {
    const p = V3(), qq = new THREE.Quaternion(), s = V3();
    mul(new THREE.Matrix4().makeTranslation(-recBone.position.x, -recBone.position.y, -recBone.position.z), recMx).decompose(p, qq, s);
    hit.position.copy(p); hit.quaternion.copy(qq);
    recBone.add(hit);
  }
  const grab = new THREE.Object3D(); grab.name = 'recorderGrab';
  {
    const p = V3(), qq = new THREE.Quaternion(), s = V3();
    mul(new THREE.Matrix4().makeTranslation(-recBone.position.x, -recBone.position.y, -recBone.position.z), recMx, T(0, 0.15, 0)).decompose(p, qq, s);
    grab.position.copy(p); grab.quaternion.copy(qq);
    recBone.add(grab);
  }
  anchors.recorderGrab = grab;
  const recPull = V3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(recMx))).normalize();
  const recWorld = V3().setFromMatrixPosition(recMx);
  const center = new THREE.Object3D(); center.name = 'center'; center.position.set(0, 0, 0); group.add(center); anchors.center = center;

  const displaySlots = [{ id: 'recorder', mesh: slotMesh, width: slotW, height: slotH, kind: 'recorder' }];
  let recT = 0;
  const recRest = recBone.position.clone();
  const setRecorder = (v) => {
    recT = clamp(v, 0, 1);
    const e = recT * recT * (3 - 2 * recT);
    recBone.position.copy(recRest).addScaledVector(recPull, e * 0.42).add(V3(0, Math.sin(e * Math.PI) * 0.04 + e * 0.03, 0));
    recBone.quaternion.setFromAxisAngle(V3(0, 1, 0), e * 0.12);
  };
  const interactables = [{ id: 'recorder', object: recorder, kind: 'pull', set: setRecorder, get value() { return recT; } }];

  let strobe = 0;
  const setStrobe = (v) => { strobe = Math.max(0, v); lamp.material.color.setRGB(0.08 + 30 * strobe, 0.06 + 22 * strobe, 0.04 + 12 * strobe); };
  setStrobe(0);

  const colliders = buildColliders(meshes.filter(m => !['marks', 'insul', 'rubber'].includes(m.name.slice(6))), new Set(pieces.filter(p => !p.floating).map(p => p.bone).concat([0])));
  const approach = new THREE.Object3D(); approach.name = 'approach';
  {
    const grab0 = V3().setFromMatrixPosition(recMx).add(V3(0, 0.15, 0));
    const spot = findApproach(colliders, grab0);
    approach.position.set(spot.x, SEABED, spot.z);
    approach.lookAt(grab0.x, SEABED, grab0.z);
    group.add(approach);
  }
  anchors.approach = approach;

  const tmpW = V3(), tmpL = V3(), qT = new THREE.Quaternion(), eT = new THREE.Euler();
  const floaters = pieces.filter(p => p.floating);
  let time = 0;
  const update = (dt = 1 / 60, heightAt) => {
    time += dt;
    dt = Math.min(dt, 0.05);
    if (floaters.length) {
      group.updateMatrixWorld();
      const gm = group.matrixWorld, gy = group.position.y;
      for (const p of floaters) {
        const rest = p.object.userData.rest, rx = p.size[0] * 0.42, rz = p.size[1] * 0.42;
        const hAt = (dx, dz) => {
          if (!heightAt) return 0.035 * Math.sin(time * 1.3 + p.phase + dx * 1.1) + 0.02 * Math.sin(time * 2.1 + p.phase * 2 + dz * 1.7);
          tmpW.set(rest.x + dx, 0, rest.z + dz).applyMatrix4(gm);
          return heightAt(tmpW.x, tmpW.z) - gy;
        };
        const h0 = hAt(0, 0), hx1 = hAt(rx, 0), hx0 = hAt(-rx, 0), hz1 = hAt(0, rz), hz0 = hAt(0, -rz);
        const hm = (h0 * 2 + hx1 + hx0 + hz1 + hz0) / 6;
        const k = 9 / p.mass, c = 2 * Math.sqrt(k) * 0.55;
        p.vy += (k * (hm - p.y) - c * p.vy) * dt; p.y += p.vy * dt;
        const comp = 0.75 / (0.6 + p.mass * 0.4);
        const tx = Math.atan2(hz1 - hz0, 2 * rz) * comp, tz = -Math.atan2(hx1 - hx0, 2 * rx) * comp;
        p.tv.x += (k * 0.8 * (tx - p.tilt.x) - c * p.tv.x) * dt; p.tilt.x += p.tv.x * dt;
        p.tv.z += (k * 0.8 * (tz - p.tilt.z) - c * p.tv.z) * dt; p.tilt.z += p.tv.z * dt;
        const yaw = 0.04 * Math.sin(time * 0.17 + p.phase);
        p.object.position.set(rest.x, rest.y + p.y, rest.z);
        p.object.quaternion.setFromEuler(eT.set(p.tilt.x, yaw, p.tilt.z, 'YXZ'));
      }
    }
  };

  const stats = () => {
    let tris = 0, verts = 0;
    for (const m of meshes) { tris += m.geometry.index.count / 3; verts += m.geometry.attributes.position.count; }
    return { tris, verts, calls: meshes.length + 2, bones: bones.length, pieces: pieces.length, floating: floaters.length, ao: bakeInfo };
  };

  const dispose = () => {
    for (const m of meshes) m.geometry.dispose();
    for (const m of Object.values(M)) m.dispose();
    marksTex.dispose(); lamp.geometry.dispose(); lamp.material.dispose(); slotMesh.geometry.dispose(); hit.geometry.dispose(); glassMat.dispose();
    skeleton.dispose();
    group.removeFromParent();
  };

  return {
    group, pieces: pieces.map(p => ({ name: p.name, object: p.object, floating: p.floating, radius: p.radius, wake: p.floating ? p.radius * 1.1 : 0 })),
    recorder, lamp, anchors, displaySlots, interactables, colliders, materials: M, meshes, skeleton,
    setRecorder, setStrobe, update, stats, dispose,
  };
}
