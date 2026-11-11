// Endurance exterior: twelve-module ring with joints and ring airlocks, spine, hub, docked Landers, engine glow and a distant LOD, built on the shared hull materials.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createHullMaterials, boxProjectUV, subdividePanels, rng, decalUV } from './hull-materials.js';

export const RING = { RC: 32, ML: 14.0, MR0: 27.4, MR1: 43.0, MD: 5.6, PORT_Z: 3.4, JR: 1.5, SR: 2.7, HUB_R: 4.3, HUB_Z: 3.6, DOCK_Z: 5.3, LANDER_Y: 5.5 };
const { RC, ML, MR0, MR1, MD, JR, SR, HUB_R, HUB_Z, DOCK_Z, LANDER_Y } = RING;
const HALF = ML / 2, Y_IN = RC - MR0, Y_OUT = RC - MR1;
export const MODULE_TYPES = ['hab', 'engine', 'pod', 'hab', 'pod', 'engine', 'command', 'engine', 'pod', 'cryo', 'pod', 'engine'];
const INTERIOR_PORTS = {
  9: [[-2.85, 1], [2.6, -1]], 10: [[0, -1], [-3.0, 1]], 11: [[3.75, 1], [-3.75, 1]], 0: [[-0.95, -1], [1.15, 1]],
};
const PORT_Y = RC - (33.2 - 1.62);
const LS = 1.25, DR = 1.6;
const JGAP = 2 * RC * Math.sin(Math.PI / 12) - ML - 0.7;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(1, 1, 1));
const mul = (...ms) => ms.reduce((a, b) => new THREE.Matrix4().multiplyMatrices(a, b));
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

class XBag {
  constructor() { this.P = []; this.N = []; this.U = []; this.I = []; }
  get n() { return this.P.length / 3; }
  add(g, M, o = {}) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (o.uv !== 'keep' && !o.rect) boxProjectUV(g, { scale: o.scale ?? 1, offset: o.offset || [0, 0], rotate: o.rotate || 0 });
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    _nm.getNormalMatrix(M);
    const base = this.n, rect = o.rect;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(M);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      this.P.push(_v.x, _v.y, _v.z); this.N.push(_n.x, _n.y, _n.z);
      let u = uv ? uv.getX(i) : 0, w = uv ? uv.getY(i) : 0;
      if (rect) { u = rect[0] + u * (rect[2] - rect[0]); w = rect[1] + w * (rect[3] - rect[1]); }
      this.U.push(u, w);
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) this.I.push(base + a[i]); } else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
    g.dispose();
    return this;
  }
  build() {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setIndex(new THREE.BufferAttribute(this.n > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    g.computeBoundingSphere();
    this.P = this.N = this.U = this.I = null;
    return g;
  }
}

function solarTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const R = rng(606);
  x.fillStyle = '#2b3036'; x.fillRect(0, 0, S, S);
  const n = 8, cs = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 92 + R() * 30, b = v + 10 + R() * 12;
    x.fillStyle = `rgb(${v},${v + 4},${b})`;
    x.fillRect(i * cs + 3, j * cs + 3, cs - 6, cs - 6);
    x.strokeStyle = `rgba(150,160,170,${0.12 + R() * 0.1})`; x.lineWidth = 1;
    for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(i * cs + 3, j * cs + k * cs / 4); x.lineTo(i * cs + cs - 3, j * cs + k * cs / 4); x.stroke(); }
  }
  x.strokeStyle = '#c9cbc6'; x.lineWidth = 3;
  for (let k = 0; k <= n; k++) { x.beginPath(); x.moveTo(k * cs, 0); x.lineTo(k * cs, S); x.moveTo(0, k * cs); x.lineTo(S, k * cs); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.4, 1 / 2.4); t.anisotropy = 8;
  return t;
}

const MARK_COLS = 8, MARK_ROWS = 4;
function marksTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const W = 1024, Hh = 512, cw = W / MARK_COLS, ch = Hh / MARK_ROWS;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, Hh);
  const R = rng(818);
  const font = (px) => `700 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const ox = (i % MARK_COLS) * cw, oy = Math.floor(i / MARK_COLS) * ch;
    x.fillStyle = 'rgba(30,31,33,0.92)'; x.font = font(ch * 0.62); x.fillText(String(i).padStart(2, '0'), ox + cw / 2, oy + ch / 2 + 4);
  }
  let ox = 4 * cw, oy = ch;
  x.fillStyle = 'rgba(30,31,33,0.9)'; x.font = font(ch * 0.34); x.fillText('ENDURANCE', ox + cw, oy + ch / 2);
  ox = 6 * cw;
  x.save(); x.beginPath(); x.rect(ox, oy, cw * 2, ch); x.clip();
  for (let i = -3; i < 14; i++) { x.fillStyle = i % 2 ? 'rgba(25,25,25,0.95)' : 'rgba(205,160,34,0.95)'; x.beginPath(); x.moveTo(ox + i * 22, oy); x.lineTo(ox + i * 22 + 22, oy); x.lineTo(ox + i * 22 + 22 - ch, oy + ch); x.lineTo(ox + i * 22 - ch, oy + ch); x.fill(); }
  x.restore();
  for (let k = 0; k < 8; k++) {
    const sx = k * cw, sy = 2 * ch;
    for (let s2 = 0; s2 < 6 + k; s2++) {
      const px = sx + 8 + R() * (cw - 16), w = 2 + R() * 10, len = ch * 2 * (0.3 + R() * 0.7), a = 0.06 + R() * 0.16;
      const g = x.createLinearGradient(px, sy, px, sy + len);
      g.addColorStop(0, `rgba(70,64,54,${a})`); g.addColorStop(1, 'rgba(70,64,54,0)');
      x.fillStyle = g; x.fillRect(px - w / 2, sy, w, len);
    }
  }
  ox = 0; oy = ch;
  x.fillStyle = 'rgba(30,31,33,0.9)'; x.font = font(ch * 0.2);
  ['NO STEP', 'RCS', 'GRAPPLE', 'O2 VENT'].forEach((t, i) => { x.strokeStyle = 'rgba(30,31,33,0.85)'; x.lineWidth = 3; x.strokeRect(i * cw + 10, oy + 34, cw - 20, ch - 68); x.fillText(t, i * cw + cw / 2, oy + ch / 2); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const markRect = (col, row, w = 1, h = 1) => [col / MARK_COLS, 1 - (row + h) / MARK_ROWS, (col + w) / MARK_COLS, 1 - row / MARK_ROWS];

export async function createEndurance({ engine, quality, materials } = {}) {
  const q = typeof quality === 'string' ? quality : (engine?.qualityName || 'ultra');
  const mats = materials || createHullMaterials({ renderer: engine?.renderer, quality: q });
  const solarTex = solarTexture();
  const marksTex = marksTexture();
  const glowTex = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#9a9a9a'); g.addColorStop(0.6, '#262626'); g.addColorStop(1, '#000000');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const M = {
    white: mats.white, tile: mats.tile, frame: mats.frame, metal: mats.metal, glass: mats.glass, radiator: mats.radiator, rubber: mats.rubber, engineM: mats.engine, decal: mats.decal,
    solar: new THREE.MeshStandardMaterial({ name: 'end.solar', map: solarTex, roughness: 0.35, metalness: 0.4 }),
    marks: new THREE.MeshStandardMaterial({ name: 'end.marks', map: marksTex, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    lander: (() => { const m = mats.white.clone(); m.name = 'end.lander'; m.color.setRGB(0.1, 0.102, 0.106); m.roughness = 0.85; return m; })(),
    cream: (() => { const m = mats.white.clone(); m.name = 'end.cream'; m.color.multiply(new THREE.Color(1.0, 0.96, 0.88)); return m; })(),
    grey: (() => { const m = mats.white.clone(); m.name = 'end.grey'; m.color.multiply(new THREE.Color(0.8, 0.81, 0.82)); return m; })(),
    lodFrame: (() => { const m = mats.frame.clone(); m.name = 'end.lodFrame'; m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -8; return m; })(),
    windowGlow: new THREE.MeshBasicMaterial({ name: 'end.windowGlow', color: new THREE.Color(0.55, 0.47, 0.36), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    engineGlow: new THREE.MeshBasicMaterial({ name: 'end.engineGlow', map: glowTex, color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uCol: { value: new THREE.Color(0.45, 0.65, 1.0) } },
    vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uI; uniform vec3 uCol; varying vec2 vUv; varying float vF; void main(){ float t = vUv.y; float a = pow(t, 2.2) * vF * vF; gl_FragColor = vec4(uCol * a * uI, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const B = {}; for (const k of Object.keys(M)) B[k] = new XBag();
  const L = { white: new XBag(), lodFrame: new XBag(), windowGlow: new XBag(), engineGlow: new XBag() };
  const plumes = new XBag();
  const group = new THREE.Group();
  group.name = 'Endurance';
  const anchors = {};
  const R = rng(3203);

  const box = (bag, Mx, sx, sy, sz, o) => bag.add(new THREE.BoxGeometry(sx, sy, sz), Mx, o);
  const cbox = (bag, Mx, sx, sy, sz, r, o) => bag.add(new RoundedBoxGeometry(sx, sy, sz, 1, Math.min(r, sx / 2.05, sy / 2.05, sz / 2.05)), Mx, o);
  const cyl = (bag, Mx, a, b, r, seg = 24, o = {}) => {
    const d = V3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, seg, 1, !!o.open);
    const qq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return bag.add(g, mul(Mx, new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), qq, V3(1, 1, 1))), o);
  };
  const torus = (bag, Mx, Rr, r, o = {}) => bag.add(new THREE.TorusGeometry(Rr, r, o.rs ?? 8, o.ts ?? 48), Mx, o);
  const decal = (Mx, cell, w, h) => B.decal.add(new THREE.PlaneGeometry(w, h), Mx, { rect: decalUV(cell) });
  const mark = (Mx, rect, w, h) => B.marks.add(new THREE.PlaneGeometry(w, h), Mx, { rect });
  const grime = (F, x, y, w, h, Rr) => mark(mul(F, T(x, y - h / 2, 0.006)), markRect(Math.floor(Rr() * 8), 2, 1, 2), w, h);

  const modFrame = (k) => {
    const th = (k * Math.PI) / 6, c = Math.cos(th), s = Math.sin(th);
    return new THREE.Matrix4().makeBasis(V3(-s, c, 0), V3(-c, -s, 0), V3(0, 0, 1)).setPosition(RC * c, RC * s, 0);
  };
  const faceFrames = (Mm) => ({
    front: mul(Mm, T(0, 0, MD)),
    back: mul(Mm, T(0, 0, -MD, 0, Math.PI, 0)),
    outer: mul(Mm, T(0, Y_OUT, 0, Math.PI / 2, 0, 0)),
    inner: mul(Mm, T(0, Y_IN, 0, -Math.PI / 2, 0, 0)),
    left: mul(Mm, T(-HALF, 0, 0, 0, -Math.PI / 2, 0)),
    right: mul(Mm, T(HALF, 0, 0, 0, Math.PI / 2, 0)),
  });

  const overlaps = (a, list) => list.some(b => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]);

  const panelize = (F, w, h, reserved, seed, o = {}) => {
    const Rr = rng(seed);
    const rects = subdividePanels(Rr, w, h, { maxW: o.maxW ?? 2.6, maxH: o.maxH ?? 2.2, minS: 0.45, splitP: 0.55 });
    for (const [px, py, pw, ph] of rects) {
      const x0 = px - w / 2, y0 = py - h / 2;
      if (overlaps([x0, y0, pw, ph], reserved)) continue;
      const cx = x0 + pw / 2, cy = y0 + ph / 2, r = Rr();
      if (r < 0.34) {
        const th = 0.025 + Rr() * 0.05;
        cbox(B.white, mul(F, T(cx, cy, th / 2)), pw - 0.08, ph - 0.08, th, 0.02);
        if (Rr() < 0.5) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(B.metal, mul(F, T(cx + sx * (pw / 2 - 0.12), cy + sy * (ph / 2 - 0.12), th)), V3(0, 0, 0), V3(0, 0, 0.015), 0.025, 6, {}, 0);
      } else if (r < 0.44) {
        const bw = pw * (0.4 + Rr() * 0.4), bh = ph * (0.4 + Rr() * 0.4), bd = 0.15 + Rr() * 0.4;
        cbox(Rr() < 0.88 ? B.white : B.frame, mul(F, T(cx, cy, bd / 2)), bw, bh, bd, 0.04);
        if (Rr() < 0.5) cyl(B.metal, mul(F, T(cx - bw / 2 - 0.05, cy, bd * 0.5)), V3(0, -bh / 2, 0), V3(0, bh / 2, 0), 0.04, 8);
      } else if (r < 0.47 && pw > 0.9 && ph > 0.9) {
        cbox(B.white, mul(F, T(cx, cy, 0.03)), pw - 0.1, ph - 0.1, 0.06, 0.02);
        box(B.radiator, mul(F, T(cx, cy, 0.065)), pw - 0.3, ph - 0.3, 0.02);
      } else if (r < 0.49) {
        box(B.tile, mul(F, T(cx, cy, 0.012)), pw - 0.06, ph - 0.06, 0.024);
      } else if (r < 0.66) {
        box(B.metal, mul(F, T(cx, cy, 0.01)), pw - 0.04, 0.03, 0.02);
      }
    }
    if (o.rails) {
      const hw = w / 2 - 0.25, hh = h / 2 - 0.25;
      for (const [a, b] of [[V3(-hw, -hh, 0.18), V3(hw, -hh, 0.18)], [V3(-hw, hh, 0.18), V3(hw, hh, 0.18)], [V3(-hw, -hh, 0.18), V3(-hw, hh, 0.18)], [V3(hw, -hh, 0.18), V3(hw, hh, 0.18)]]) {
        cyl(B.metal, F, a, b, 0.025, 6);
        const len = a.distanceTo(b), n = Math.floor(len / 1.2);
        for (let i = 0; i <= n; i++) { const p = V3().lerpVectors(a, b, i / n); cyl(B.metal, F, V3(p.x, p.y, 0), p, 0.018, 6); }
      }
    }
  };

  const window4 = (F, cx, cy, s = 0.46) => {
    box(B.frame, mul(F, T(cx, cy, 0.04)), s * 2 + 0.22, s * 2 + 0.22, 0.08);
    for (const [ix, iy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + ix * (s / 2 + 0.03), y = cy + iy * (s / 2 + 0.03);
      box(B.glass, mul(F, T(x, y, 0.06)), s, s, 0.02);
      if (R() < 0.75) B.windowGlow.add(new THREE.PlaneGeometry(s * 0.84, s * 0.84), mul(F, T(x, y, 0.072)), { uv: 'keep' });
    }
  };

  const roundPort = (F, cx, cy) => {
    const d = MD - RING.PORT_Z, w = 1.5;
    const Fb = mul(F, T(cx, cy, -d));
    torus(B.metal, mul(Fb, T(0, 0, 0.045)), 0.45, 0.05, { ts: 40 });
    B.glass.add(new THREE.CircleGeometry(0.43, 40), mul(Fb, T(0, 0, 0.034)), { uv: 'keep' });
    B.windowGlow.add(new THREE.CircleGeometry(0.36, 32), mul(Fb, T(0, 0, 0.036)), { uv: 'keep' });
    const back = new THREE.Shape(); back.moveTo(-w / 2, -w / 2); back.lineTo(w / 2, -w / 2); back.lineTo(w / 2, w / 2); back.lineTo(-w / 2, w / 2); back.lineTo(-w / 2, -w / 2);
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.43, 0, Math.PI * 2, true); back.holes.push(hole);
    B.frame.add(new THREE.ShapeGeometry(back, 24), mul(Fb, T(0, 0, 0.002)));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const Fw = mul(F, T(cx + Math.cos(a) * w / 2, cy + Math.sin(a) * w / 2, -d / 2, 0, 0, a), T(0, 0, 0, 0, -Math.PI / 2, 0));
      B.white.add(new THREE.PlaneGeometry(d, w), Fw);
    }
    torus(B.metal, mul(F, T(cx, cy, 0.0)), w * 0.72, 0.04, { ts: 4, rs: 4 });
  };

  const rcs = (Mx) => {
    cbox(B.frame, Mx, 0.6, 0.6, 0.5, 0.06);
    for (const [dx, dy, dz, rx, rz] of [[0.33, 0, 0, 0, -Math.PI / 2], [-0.33, 0, 0, 0, Math.PI / 2], [0, 0.33, 0, 0, 0], [0, 0, 0.3, Math.PI / 2, 0]]) {
      B.engineM.add(new THREE.CylinderGeometry(0.05, 0.11, 0.18, 12, 1, true), mul(Mx, T(dx, dy, dz, rx, 0, rz)));
    }
  };

  const antenna = (Mx, h, dish) => {
    cyl(B.metal, Mx, V3(0, 0, 0), V3(0, 0, h), 0.06, 10);
    cyl(B.frame, Mx, V3(0, 0, 0), V3(0, 0, 0.25), 0.16, 12);
    if (dish) {
      const pts = []; for (let i = 0; i <= 10; i++) { const r = (i / 10) * dish; pts.push(new THREE.Vector2(r, (r * r) / (dish * 2.5))); }
      B.white.add(new THREE.LatheGeometry(pts, 28), mul(Mx, T(0, 0, h, -Math.PI / 2, 0, 0)));
      cyl(B.metal, Mx, V3(0, 0, h), V3(0, 0, h + dish * 0.6), 0.025, 6);
    } else {
      for (let i = 0; i < 4; i++) cyl(B.metal, Mx, V3(0, 0, h * (0.4 + i * 0.15)), V3(0.35 - i * 0.06, 0, h * (0.4 + i * 0.15)), 0.015, 5);
    }
  };

  const nozzle = (Mx, r, len) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * (0.38 + 0.62 * Math.pow(t, 0.7)), -t * len)); }
    const g = new THREE.LatheGeometry(pts, 32);
    const g2 = g.clone();
    B.engineM.add(g, Mx);
    const inv = g2; const a = inv.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    inv.computeVertexNormals();
    B.engineM.add(inv, Mx);
    cyl(B.metal, Mx, V3(0, 0.25, 0), V3(0, 0, 0), r * 0.5, 20);
    for (let i = 0; i < 3; i++) torus(B.metal, mul(Mx, T(0, -len * (0.2 + i * 0.3), 0, Math.PI / 2, 0, 0)), r * (0.38 + 0.62 * Math.pow(0.2 + i * 0.3, 0.7)) + 0.015, 0.025, { ts: 32 });
    B.engineGlow.add(new THREE.CircleGeometry(r * 0.36, 24).rotateX(Math.PI / 2), mul(Mx, T(0, -0.05, 0)), { uv: 'keep' });
    B.engineGlow.add(new THREE.CircleGeometry(r * 0.95, 32).rotateX(Math.PI / 2), mul(Mx, T(0, -len + 0.05, 0)), { uv: 'keep' });
    const pg = new THREE.CylinderGeometry(r * 0.95, r * 0.25, len * 4, 24, 1, true);
    pg.translate(0, -len - len * 2, 0);
    plumes.add(pg, Mx, { uv: 'keep' });
    L.engineGlow.add(new THREE.CircleGeometry(r * 2.6, 16).rotateX(Math.PI / 2), mul(Mx, T(0, -len - 0.2, 0)), { uv: 'keep' });
  };

  for (let k = 0; k < 12; k++) {
    const type = MODULE_TYPES[k];
    const Mm = modFrame(k);
    const capped = type !== 'engine';
    const capH = capped ? 1.8 : 0, yTop = Y_IN - capH;
    const yc = (Y_OUT + yTop) / 2, hgt = yTop - Y_OUT;
    const paint = [B.white, B.cream, B.white, B.grey, B.white, B.cream, B.white, B.grey, B.cream, B.white, B.white, B.grey][k];
    const hx = ML / 11.4, hs = hgt / (capped ? 12.6 : 14.4);
    cbox(paint, mul(Mm, T(0, yc, 0)), ML, hgt, MD * 2, 0.42);
    cbox(L.white, mul(Mm, T(0, (Y_OUT + Y_IN) / 2, 0)), ML, Y_IN - Y_OUT, MD * 2, 0.42);
    if (capped) {
      cbox(paint, mul(Mm, T(0, yTop + capH / 2 - 0.05, 0)), ML - 1.4, capH + 0.1, MD * 2 - 1.0, 0.25);
      for (const sz of [-1, 1]) {
        const Fc = mul(Mm, T(0, yTop + capH / 2, sz * (MD - 0.5), 0, sz > 0 ? 0 : Math.PI, 0));
        panelize(Fc, ML - 2.0, capH - 0.3, [], k * 59 + sz, { maxW: 1.6, maxH: 1.2 });
        for (let i = 0; i < 7; i++) box(B.frame, mul(Fc, T((-3 + i) * 1.6, 0.1, 0.03)), 0.9, 0.5, 0.06);
      }
      box(B.metal, mul(Mm, T(0, yTop + 0.02, 0)), ML - 0.6, 0.06, MD * 2 - 0.6);
    }
    const F = faceFrames(Mm);
    const fw = ML - 0.9, fh = hgt - 0.9;
    for (const side of ['front', 'back']) {
      const n = type === 'pod' ? 3 : type === 'engine' ? 1 : 2;
      for (let i = 0; i < n; i++) box(L.lodFrame, mul(F[side], T(n === 1 ? 0 : (i - (n - 1) / 2) * (n === 3 ? 3 : 3.1) * hx, -1 * hs, 0.25)), (n === 1 ? 7.6 : 2.4) * hx, 9 * hs, 0.3);
    }
    for (const side of ['front', 'back']) {
      const Fs = mul(F[side], T(0, 0, 0));
      const reserved = [];
      const sgn = side === 'front' ? 1 : -1;
      const VR = rng(k * 977 + (side === 'front' ? 11 : 23));
      const variant = Math.floor(rng(k * 31 + 5)() * 3);
      if (type === 'hab' || type === 'cryo' || type === 'command') {
        const sets = type === 'command' ? [[[-3.2, 2.3], [0, 2.3], [3.2, 2.3]]] : [[[-1.55, 2.3], [1.55, 2.3]], [[-2.9, 1.9], [0, 1.9], [2.9, 1.9]], [[-2.3, 2.8], [1.4, 1.7]]];
        const set = sets[Math.min(sets.length - 1, variant)].map(([a, b]) => [a * hx, b * hx]);
        const ph = (type === 'command' ? 7.0 : variant === 1 ? 7.6 : 9.0) * hs, cy = (variant === 1 ? -1.9 : -1.2) * hs;
        for (const [px0, pw] of set) {
          const px = side === 'front' ? px0 : -px0;
          box(B.frame, mul(Fs, T(px, cy, 0.05)), pw + 0.3, ph + 0.3, 0.1);
          box(B.solar, mul(Fs, T(px, cy, 0.11)), pw, ph, 0.03);
          const nb = variant === 2 ? 5 : 4;
          for (let i = 1; i < nb; i++) box(B.metal, mul(Fs, T(px, cy - ph / 2 + i * (ph / nb), 0.13)), pw + 0.04, 0.05, 0.03);
          reserved.push([px - pw / 2 - 0.3, cy - ph / 2 - 0.3, pw + 0.6, ph + 0.6]);
        }
        const wx = (sgn > 0 ? -1 : 1) * (variant === 1 ? 3.6 : 4.1) * hx * (k % 2 ? -1 : 1), wy = (variant === 1 ? 4.1 : 4.35) * hs + 0.2;
        window4(Fs, wx, wy); reserved.push([wx - 0.9, wy - 0.9, 1.8, 1.8]);
        if (variant === 1) { window4(Fs, -wx, wy, 0.34); reserved.push([-wx - 0.75, wy - 0.75, 1.5, 1.5]); }
        if (type === 'command') { const cy2 = 4.5 * hs + 0.2; for (let i = 0; i < 5; i++) { box(B.glass, mul(Fs, T(-3 + i * 1.5, cy2, 0.06)), 1.1, 0.55, 0.04); B.windowGlow.add(new THREE.PlaneGeometry(1.0, 0.5), mul(Fs, T(-3 + i * 1.5, cy2, 0.083)), { uv: 'keep' }); } reserved.push([-4, cy2 - 0.5, 8, 1.1]); }
      } else if (type === 'pod') {
        const n = 2 + ((k / 2) | 0) % 3, span = 9.0 * hx, pw = Math.min(2.4 * hx, span / n - 0.4);
        for (let i = 0; i < n; i++) {
          const px = -span / 2 + (i + 0.5) * (span / n), plen = (9.6 - (i % 2) * VR() * 2.2) * hs, py = -0.8 * hs - (9.6 * hs - plen) / 2;
          box(B.frame, mul(Fs, T(px, py, 0.04)), pw + 0.3, plen, 0.08);
          cbox(B.white, mul(Fs, T(px, py, 0.1)), pw, plen - 0.3, 0.08, 0.03);
          box(B.tile, mul(Fs, T(px, py, 0.145)), pw - 0.3, plen - 0.8, 0.02);
          reserved.push([px - pw / 2 - 0.2, py - plen / 2, pw + 0.4, plen]);
        }
        const wx = (sgn > 0 ? 4.4 : -4.4) * hx * (k === 4 || k === 8 ? -1 : 1), wy = 4.6 * hs + 0.2;
        window4(Fs, wx, wy, 0.36); reserved.push([wx - 0.8, wy - 0.8, 1.6, 1.6]);
        mark(mul(Fs, T(-wx * 0.4, wy + 0.15, 0.09)), markRect(6, 1, 2, 1), 3.0, 0.35);
      } else {
        const wx = (sgn > 0 ? -4.4 : 4.4) * hx * (k === 5 ? -1 : 1), wy = 5.6 * hs + 0.2;
        window4(Fs, wx, wy, 0.3); reserved.push([wx - 0.7, wy - 0.7, 1.4, 1.4]);
        if (side === 'front') {
          const nr = 2 + variant, rw = Math.min(2.6 * hx, 7.2 * hx / nr - 0.2);
          box(B.frame, mul(Fs, T(0, -0.5 * hs, 0.05)), nr * (rw + 0.2) + 0.4, 8.6 * hs, 0.1);
          for (let i = 0; i < nr; i++) box(B.radiator, mul(Fs, T((i - (nr - 1) / 2) * (rw + 0.2), -0.5 * hs, 0.11)), rw, 8.2 * hs, 0.03);
          reserved.push([-(nr * (rw + 0.2) + 0.4) / 2, -5 * hs, nr * (rw + 0.2) + 0.4, 9.2 * hs]);
        } else {
          cbox(B.frame, mul(Fs, T(0, -0.6, 0.75)), 9.0 * hx, 10.4 * hs, 1.5, 0.2);
          cbox(L.lodFrame, mul(Fs, T(0, -0.6, 0.75)), 9.0 * hx, 10.4 * hs, 1.5, 0.2);
          const Ft = mul(Fs, T(0, -0.6, 1.5));
          panelize(Ft, 8.6 * hx, 10.0 * hs, [[-4.3 * hx, -4.8 * hs, 8.6 * hx, 9.6 * hs]], k * 13 + 1, { maxW: 1.4, maxH: 1.4 });
          for (const [nx, ny] of [[-2.2 * hx, -2.9 * hs], [2.2 * hx, -2.9 * hs], [-2.2 * hx, 1.7 * hs], [2.2 * hx, 1.7 * hs]]) {
            cyl(B.metal, Ft, V3(nx, ny, 0), V3(nx, ny, 0.35), 1.25, 32);
            nozzle(mul(Ft, T(nx, ny, 0.35, -Math.PI / 2, 0, 0)), 0.95, 1.9);
          }
          for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) cyl(B.metal, Fs, V3(sx * 4.3 * hx, (-5.2 + i * 3.0) * hs, 0.1), V3(sx * 4.3 * hx, (-5.2 + i * 3.0) * hs, 1.4), 0.08, 8);
          reserved.push([-4.7 * hx, -6 * hs, 9.4 * hx, 10.8 * hs]);
        }
      }
      {
        const nx = (VR() < 0.5 ? -1 : 1) * (fw / 2 - 1.1), ny = -(fh / 2) + 1.0 + VR() * 1.5;
        mark(mul(Fs, T(nx, ny, 0.012)), markRect(k % 8, Math.floor(k / 8)), 1.1, 1.1);
        if (VR() < 0.6) mark(mul(Fs, T(-nx * 0.6, -(fh / 2) + 0.7, 0.012)), markRect(4, 1, 2, 1), 3.2, 0.8);
        if (VR() < 0.5) mark(mul(Fs, T(nx * 0.2, fh / 2 - 0.9, 0.012)), markRect(Math.floor(VR() * 4), 1), 0.8, 0.8);
        const ng = 3 + Math.floor(VR() * 6);
        for (let i = 0; i < ng; i++) grime(Fs, (VR() - 0.5) * fw * 0.9, fh / 2 - VR() * fh * 0.6, 0.6 + VR() * 1.4, 1.5 + VR() * 3.5, VR);
      }
      const ports = INTERIOR_PORTS[k] || [];
      for (const [s, sig] of ports) {
        if (sig !== sgn) continue;
        const x = (side === 'front' ? s : -s) * ((RC - PORT_Y) / 33.2);
        roundPort(Fs, x, PORT_Y);
        reserved.push([x - 0.55, PORT_Y - 0.55, 1.1, 1.1]);
      }
      panelize(Fs, fw, fh, reserved, k * 97 + (side === 'front' ? 1 : 2), { rails: true });
      for (const [dx, dy] of [[-fw / 2 + 0.4, fh / 2 - 0.4], [fw / 2 - 0.4, fh / 2 - 0.4], [-fw / 2 + 0.4, -fh / 2 + 0.4], [fw / 2 - 0.4, -fh / 2 + 0.4]]) decal(mul(Fs, T(dx, dy, 0.012)), 'stencil', 0.5, 0.5);
    }
    const Fo = mul(F.outer, T(0, 0, 0));
    panelize(Fo, ML - 0.9, MD * 2 - 0.9, [[-1.2, -1.2, 2.4, 2.4]], k * 131 + 7, { maxW: 2, maxH: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rcs(mul(Mm, T(sx * (HALF - 0.3), Y_OUT - 0.25, sz * (MD - 0.3))));
    if (type === 'command' || type === 'hab') antenna(mul(F.outer, T(0, 0, 0.1)), type === 'command' ? 4.5 : 2.6, type === 'command' ? 1.6 : 0.9);
    else box(B.frame, mul(F.outer, T(0, 0, 0.3)), 1.6, 1.6, 0.6);
    const Fi = F.inner;
    const innerRes = (k === 0 || k === 6) ? [[-SR - 0.6, -SR - 0.6, 2 * SR + 1.2, 2 * SR + 1.2]] : [];
    panelize(Fi, (capped ? ML - 1.4 : ML) - 0.9, (capped ? MD * 2 - 1.0 : MD * 2) - 0.9, innerRes, k * 151 + 3, { maxW: 2, maxH: 2 });
    for (const side of ['left', 'right']) {
      const Fsd = F[side];
      const jy = -0.1;
      const Fc = mul(Fsd, T(0, 0, 0));
      const sres = [[-2.4, jy - 2.4 - yc, 4.8, 4.8]];
      if (type === 'engine' || type === 'command' || (type === 'pod' && side === 'left')) {
        cbox(B.frame, mul(Fsd, T(0, Y_OUT + 2.6, 0.55)), MD * 2 - 1.2, 4.0, 1.1, 0.12);
        const Fb = mul(Fsd, T(0, Y_OUT + 2.6, 1.1));
        for (let i = 0; i < 5; i++) box(B.radiator, mul(Fb, T(-2.2 + i * 1.1, 0, 0.01)), 0.9, 3.6, 0.02);
        sres.push([-MD, Y_OUT + 0.5 - yc, MD * 2, 4.4]);
      }
      panelize(mul(Fsd, T(0, yc, 0)), MD * 2 - 0.9, hgt - 0.9, sres, k * 171 + (side === 'left' ? 5 : 9), { maxW: 1.8, maxH: 2.4 });
      cyl(B.frame, Fc, V3(0, -0.1, 0), V3(0, -0.1, 0.35), JR + 0.35, 40);
      torus(B.metal, mul(Fc, T(0, -0.1, 0.36)), JR + 0.2, 0.06, { ts: 40 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; cyl(B.metal, Fc, V3(Math.cos(a) * (JR + 0.25), -0.1 + Math.sin(a) * (JR + 0.25), 0.3), V3(Math.cos(a) * (JR + 0.25), -0.1 + Math.sin(a) * (JR + 0.25), 0.42), 0.045, 6); }
    }
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -1 : 1, sz = i % 2 ? -1 : 1;
      cyl(B.metal, Mm, V3(sx * (HALF - 0.05), Y_OUT + 0.5, sz * (MD - 0.05)), V3(sx * (HALF - 0.05), yTop - 0.5, sz * (MD - 0.05)), 0.06, 8);
    }
    if (type === 'pod') {
      const g = 0.18, ex = HALF + 0.12, ez = MD + 0.12, y0 = Y_OUT - 0.1, y1 = yTop + 0.1;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(B.metal, mul(Mm, T(sx * ex, (y0 + y1) / 2, sz * ez)), g, y1 - y0, g);
      for (const yy of [y0, y1, (y0 + y1) / 2]) for (const sz of [-1, 1]) box(B.metal, mul(Mm, T(0, yy, sz * ez)), ML + 0.24, g, g);
      for (const yy of [y0, y1]) for (const sx of [-1, 1]) box(B.metal, mul(Mm, T(sx * ex, yy, 0)), g, g, MD * 2 + 0.24);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(B.frame, mul(Mm, T(sx * (HALF + 0.25), -0.1 + 2.6, sz * 2.0)), 0.5, 1.0, 1.2, 0.08);
    }
    const a0 = anchors['module' + k] = new THREE.Object3D();
    a0.name = 'module' + k; a0.matrix.copy(Mm); a0.matrix.decompose(a0.position, a0.quaternion, a0.scale); a0.userData.type = type;
    group.add(a0);
  }

  for (let k = 0; k < 12; k++) {
    const A = V3(HALF + 0.35, -0.1, 0).applyMatrix4(modFrame(k));
    const Bp = V3(-HALF - 0.35, -0.1, 0).applyMatrix4(modFrame((k + 1) % 12));
    const mid = V3().addVectors(A, Bp).multiplyScalar(0.5);
    const I = new THREE.Matrix4();
    cyl(B.white, I, A, Bp, JR, 40, { open: true });
    cyl(L.white, I, A, Bp, JR, 12, { open: true });
    const dir = V3().subVectors(Bp, A).normalize();
    for (const t of [0.12, 0.88]) { const p = V3().lerpVectors(A, Bp, t); cyl(B.rubber, I, p.clone().addScaledVector(dir, -0.15), p.clone().addScaledVector(dir, 0.15), JR + 0.06, 40); }
    for (const t of [0.24, 0.76]) { const p = V3().lerpVectors(A, Bp, t); cyl(B.metal, I, p.clone().addScaledVector(dir, -0.06), p.clone().addScaledVector(dir, 0.06), JR + 0.04, 40); }
    const out = V3(mid.x, mid.y, 0).normalize();
    const Nm = new THREE.Matrix4().makeBasis(dir, out.clone().negate(), V3(0, 0, 1)).setPosition(mid);
    const node = JGAP > 4.3;
    if (node) cyl(B.white, Nm, V3(0, 0, -2.3), V3(0, 0, 2.3), 2.1, 48);
    if (node) cyl(L.white, Nm, V3(0, 0, -2.3), V3(0, 0, 2.3), 2.1, 12);
    if (node) for (const sz of [-1, 1]) {
      torus(B.metal, mul(Nm, T(0, 0, sz * 2.3)), 2.0, 0.08, { ts: 48 });
      B.white.add(new THREE.CircleGeometry(2.0, 48), mul(Nm, T(0, 0, sz * 2.3, 0, sz > 0 ? 0 : Math.PI, 0)));
      torus(B.rubber, mul(Nm, T(0, 0, sz * 2.33)), 1.15, 0.11, { ts: 48 });
      B.frame.add(new THREE.CircleGeometry(1.02, 40), mul(Nm, T(0, 0, sz * 2.34, 0, sz > 0 ? 0 : Math.PI, 0)));
      torus(B.metal, mul(Nm, T(0, 0, sz * 2.37)), 0.55, 0.05, { ts: 32 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(B.metal, mul(Nm, T(Math.cos(a) * 1.45, Math.sin(a) * 1.45, sz * 2.36, 0, 0, a)), 0.3, 0.12, 0.08); }
      decal(mul(Nm, T(0, -1.45, sz * 2.37, 0, sz > 0 ? 0 : Math.PI, 0)), 'airlock', 0.7, 0.7);
    }
    if (node) for (const t of [-0.6, 0.6]) torus(B.metal, mul(Nm, T(0, 0, t)), 2.12, 0.04, { ts: 48 });
    else for (const sz of [-1, 1]) { box(B.metal, mul(Nm, T(0, 0, sz * (JR + 0.05))), JGAP * 0.6, 0.5, 0.1); decal(mul(Nm, T(0, -0.3, sz * (JR + 0.11), 0, sz > 0 ? 0 : Math.PI, 0)), 'airlock', 0.5, 0.5); }
    if (k % 3 === 1) {
      const Cp = mul(Nm, T(0, node ? -2.0 : -JR + 0.15, 0));
      cyl(B.white, Cp, V3(0, 0, 0), V3(0, -3.2, 0), 1.25, 40);
      B.white.add(new THREE.SphereGeometry(1.25, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), mul(Cp, T(0, -3.2, 0)));
      for (const yy of [-0.4, -1.6, -2.8]) torus(B.rubber, mul(Cp, T(0, yy, 0, Math.PI / 2, 0, 0)), 1.28, 0.06, { ts: 40 });
      window4(mul(Cp, T(0, -2.2, 1.24)), 0, 0, 0.22);
      cyl(L.white, Cp, V3(0, 0, 0), V3(0, -4.2, 0), 1.25, 10);
    }
    cyl(B.metal, I, A.clone().add(V3(0, 0, JR + 0.08)), Bp.clone().add(V3(0, 0, JR + 0.08)), 0.03, 6);
    cyl(B.metal, I, A.clone().add(V3(0, 0, -JR - 0.08)), Bp.clone().add(V3(0, 0, -JR - 0.08)), 0.03, 6);
  }

  for (const sx of [1, -1]) {
    const x0 = sx * (HUB_R - 0.2), x1 = sx * (MR0 + 0.2);
    const I = new THREE.Matrix4();
    cyl(B.white, I, V3(x0, 0, 0), V3(x1, 0, 0), SR, 48, { open: true });
    cyl(L.white, I, V3(x0, 0, 0), V3(x1, 0, 0), SR, 12, { open: true });
    const len = Math.abs(x1 - x0);
    for (let i = 1; i < 6; i++) {
      const x = x0 + sx * (len * i / 6);
      cyl(B.rubber, I, V3(x - 0.25, 0, 0), V3(x + 0.25, 0, 0), SR + 0.09, 48);
      if (i % 2) cyl(B.grey, I, V3(x - sx * len / 6 + 0.45, 0, 0), V3(x - 0.45, 0, 0), SR + 0.04, 48, { open: true });
      torus(B.metal, T(x - 0.33, 0, 0, 0, Math.PI / 2, 0), SR + 0.03, 0.03, { ts: 48 });
      torus(B.metal, T(x + 0.33, 0, 0, 0, Math.PI / 2, 0), SR + 0.03, 0.03, { ts: 48 });
    }
    for (const a of [0.5, Math.PI - 0.5, Math.PI + 1.2]) cyl(B.metal, I, V3(x0 + sx * 0.6, Math.cos(a) * (SR + 0.12), Math.sin(a) * (SR + 0.12)), V3(x1 - sx * 0.6, Math.cos(a) * (SR + 0.12), Math.sin(a) * (SR + 0.12)), 0.05, 8);
    cyl(B.frame, I, V3(x1 - sx * 0.6, 0, 0), V3(x1, 0, 0), SR + 0.5, 40);
    cyl(B.frame, I, V3(x0, 0, 0), V3(x0 + sx * 0.9, 0, 0), SR + 0.35, 40);
    for (let i = 0; i < 4; i++) decal(T(x0 + sx * (len * (i + 0.5) / 6), 0, SR + 0.002), 'stripes', 1.0, 0.25);
  }

  {
    const I = new THREE.Matrix4();
    const oct = new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_Z * 2, 8, 1);
    B.frame.add(oct, T(0, 0, 0, Math.PI / 2, Math.PI / 8, 0));
    L.lodFrame.add(new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_Z * 2, 8, 1), T(0, 0, 0, Math.PI / 2, Math.PI / 8, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + Math.PI / 8;
      const Ff = mul(T(Math.cos(a) * HUB_R * 0.925, Math.sin(a) * HUB_R * 0.925, 0), new THREE.Matrix4().makeBasis(V3(-Math.sin(a), Math.cos(a), 0), V3(0, 0, 1), V3(Math.cos(a), Math.sin(a), 0)));
      for (let j = 0; j < 3; j++) for (let m = 0; m < 2; m++) {
        if (R() < 0.3) continue;
        const cx = (m - 0.5) * 1.15, cy = -HUB_Z + 1.1 + j * 2.4;
        box(B.tile, mul(Ff, T(cx, cy, 0.03)), 1.0, 2.0, 0.06);
        if (R() < 0.5) cbox(B.frame, mul(Ff, T(cx, cy, 0.2)), 0.6, 1.2, 0.3, 0.05);
      }
      box(B.metal, mul(Ff, T(0, 0, 0.06)), 0.12, HUB_Z * 2, 0.12);
    }
    for (const sz of [-1, 1]) {
      torus(B.metal, T(0, 0, sz * HUB_Z), HUB_R - 0.3, 0.12, { ts: 8, rs: 6 });
      cyl(B.metal, I, V3(0, 0, sz * HUB_Z), V3(0, 0, sz * DOCK_Z), DR, 48);
      cyl(B.frame, I, V3(0, 0, sz * (HUB_Z + 0.2)), V3(0, 0, sz * (HUB_Z + 0.9)), DR + 0.4, 48);
      torus(B.rubber, T(0, 0, sz * (DOCK_Z - 0.1)), DR + 0.05, 0.13, { ts: 48 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; box(B.metal, T(Math.cos(a) * (DR + 0.25), Math.sin(a) * (DR + 0.25), sz * (DOCK_Z - 0.35), 0, 0, a), 0.25, 0.3, 0.5); }
      B.frame.add(new THREE.RingGeometry(DR - 0.5, DR, 48), T(0, 0, sz * DOCK_Z, 0, sz > 0 ? 0 : Math.PI, 0));
      cyl(L.lodFrame, I, V3(0, 0, sz * HUB_Z), V3(0, 0, sz * DOCK_Z), DR, 10);
    }
    for (const sy of [1, -1]) {
      cyl(B.metal, I, V3(0, sy * (HUB_R - 0.2), 0), V3(0, sy * (LANDER_Y - 0.4 * LS), 0), 1.5, 40);
      cyl(B.frame, I, V3(0, sy * (LANDER_Y - 0.8), 0), V3(0, sy * (LANDER_Y - 0.4 * LS), 0), 1.9, 40);
    }
  }

  const loft = (bag, profs, Mx) => {
    const n = profs[0].pts.length, pos = [], idx = [];
    profs.forEach((pr) => pr.pts.forEach(([x, y]) => pos.push(x, y, pr.z)));
    for (let s = 0; s < profs.length - 1; s++) for (let i = 0; i < n; i++) { const a = s * n + i, b = s * n + (i + 1) % n, c = (s + 1) * n + (i + 1) % n, d = (s + 1) * n + i; idx.push(a, b, c, a, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    bag.add(ng, Mx);
    for (const [pi, flip] of [[0, true], [profs.length - 1, false]]) {
      const pr = profs[pi], shape = new THREE.Shape(pr.pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const sg = new THREE.ShapeGeometry(shape);
      sg.translate(0, 0, pr.z);
      if (flip) { sg.rotateY(Math.PI); sg.translate(0, 0, 2 * pr.z); sg.scale(-1, 1, 1); const a = sg.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } sg.computeVertexNormals(); }
      bag.add(sg, Mx);
    }
  };

  const lander = (sy) => {
    const Lm = mul(T(0, sy * LANDER_Y, 0, 0, 0, sy > 0 ? 0 : Math.PI), new THREE.Matrix4().makeScale(LS, LS, LS));
    const BL = B.lander;
    const base = [[-10.2, 1.4], [-8.6, 0.3], [-3.4, 0.0], [3.4, 0.0], [8.6, 0.3], [10.2, 1.4], [9.4, 4.6], [6.0, 6.1], [-6.0, 6.1], [-9.4, 4.6]];
    const prof = (sx, sy2, oy) => base.map(([x, y]) => [x * sx, y * sy2 + oy]);
    const profs = [{ z: -6.6, pts: prof(0.93, 0.88, 0.35) }, { z: -5.6, pts: prof(1, 1, 0) }, { z: 3.0, pts: prof(1, 1, 0) }, { z: 6.1, pts: prof(0.64, 0.62, 1.25) }, { z: 7.3, pts: prof(0.42, 0.4, 2.1) }];
    loft(BL, profs, Lm);
    loft(L.lodFrame, profs, Lm);
    for (const pr of [profs[1], profs[2], profs[3]]) {
      for (let i = 0; i < pr.pts.length; i++) {
        const [x0, y0] = pr.pts[i], [x1, y1] = pr.pts[(i + 1) % pr.pts.length];
        cyl(B.metal, Lm, V3(x0, y0, pr.z), V3(x1, y1, pr.z), 0.06, 6);
      }
    }
    for (let i = 0; i < base.length; i++) cyl(B.frame, Lm, V3(base[i][0], base[i][1], -5.6), V3(base[i][0], base[i][1], 3.0), 0.07, 6);
    const top = mul(Lm, T(0, 6.1, -1.3, -Math.PI / 2, 0, 0));
    const Rl = rng(sy > 0 ? 71 : 72);
    const res = [[-5.3, -3.6, 4.4, 3.0], [1.1, -3.6, 4.2, 3.0], [-1.0, 1.6, 2.0, 2.0]];
    box(B.frame, mul(top, T(-3.1, -2.1, 0.03)), 4.4, 3.0, 0.06); box(B.radiator, mul(top, T(-3.1, -2.1, 0.07)), 4.1, 2.7, 0.02);
    box(B.frame, mul(top, T(3.2, -2.1, 0.03)), 4.2, 3.0, 0.06); box(B.radiator, mul(top, T(3.2, -2.1, 0.07)), 3.9, 2.7, 0.02);
    const rects = subdividePanels(Rl, 11.4, 8.4, { maxW: 2.2, maxH: 1.8, minS: 0.5, splitP: 0.6 });
    for (const [px, py, pw, ph] of rects) {
      const cx = px - 5.7, cy = py - 4.2, r = Rl();
      if (overlaps([cx - pw / 2, cy - ph / 2, pw, ph], res)) continue;
      if (r < 0.5) cbox(BL, mul(top, T(cx, cy, 0.025)), pw - 0.08, ph - 0.08, 0.05, 0.015);
      else if (r < 0.62) cbox(B.frame, mul(top, T(cx, cy, 0.1)), pw * 0.6, ph * 0.6, 0.2, 0.04);
      else if (r < 0.72) box(B.tile, mul(top, T(cx, cy, 0.015)), pw - 0.08, ph - 0.08, 0.03);
    }
    antenna(mul(top, T(0, 2.6, 0.05)), 1.8, 0.6);
    for (const sx of [-1, 1]) {
      const a0 = V3(sx * 10.2, 1.4, 0), a1 = V3(sx * 9.4, 4.6, 0), mid = V3().addVectors(a0, a1).multiplyScalar(0.5);
      const n = V3(sx * 3.2, 0.8, 0).normalize(), up = V3().subVectors(a1, a0).normalize();
      const Fs = mul(Lm, new THREE.Matrix4().makeBasis(V3(0, 0, sx), up, n).setPosition(mid));
      for (let i = 0; i < 7; i++) box(B.tile, mul(Fs, T(-4.6 + i * 1.35, 0, 0.03)), 1.2, 2.9, 0.05);
      for (let i = 0; i < 4; i++) {
        const z = (-3.2 + i * 1.5) * sx;
        box(B.frame, mul(Fs, T(z, 0.6, 0.06)), 0.62, 0.62, 0.06);
        box(B.glass, mul(Fs, T(z, 0.6, 0.1)), 0.46, 0.46, 0.02);
        if (Rl() < 0.6) B.windowGlow.add(new THREE.PlaneGeometry(0.4, 0.4), mul(Fs, T(z, 0.6, 0.112)), { uv: 'keep' });
      }
      const Fu = mul(Lm, new THREE.Matrix4().makeBasis(V3(0, 0, sx), V3(-sx * 3.4, 1.5, 0).normalize(), V3(sx * 1.5, 3.4, 0).normalize()).setPosition(V3(sx * 7.7, 5.35, -1.3)));
      for (let i = 0; i < 6; i++) cbox(BL, mul(Fu, T(-3.8 + i * 1.5, 0, 0.03)), 1.35, 1.4, 0.06, 0.02);
      cbox(B.frame, mul(Lm, T(sx * 10.6, 2.2, -2.4)), 1.0, 2.6, 5.4, 0.15);
      for (let i = 0; i < 3; i++) box(B.radiator, mul(Lm, T(sx * 11.12, 2.2, -4.2 + i * 1.8, 0, sx * Math.PI / 2, 0)), 1.5, 2.2, 0.02);
      rcs(mul(Lm, T(sx * 9.0, 5.0, 2.6))); rcs(mul(Lm, T(sx * 9.0, 5.0, -5.4)));
    }
    const belly = mul(Lm, T(0, 0, -1.3, Math.PI / 2, 0, 0));
    for (const gx of [-6.2, 6.2]) for (const gz of [-3.6, 2.6]) {
      cbox(B.frame, mul(belly, T(gx, gz, -0.02)), 2.4, 1.6, 0.06, 0.02);
      box(B.rubber, mul(belly, T(gx, gz, -0.06)), 2.1, 1.3, 0.06);
      for (const dx of [-0.53, 0.53]) box(B.metal, mul(belly, T(gx + dx, gz, -0.1)), 0.04, 1.3, 0.04);
      cyl(B.metal, belly, V3(gx - 0.6, gz, -0.12), V3(gx + 0.7, gz + 0.3, -0.18), 0.09, 8);
      cyl(B.metal, belly, V3(gx + 0.7, gz + 0.3, -0.18), V3(gx + 0.9, gz - 0.4, -0.22), 0.06, 8);
    }
    for (let i = 0; i < 14; i++) box(B.tile, mul(belly, T(-3.0 + (i % 7) * 1.0, -4.8 + Math.floor(i / 7) * 8.6, -0.02)), 0.94, 1.2, 0.04);
    cyl(B.metal, Lm, V3(0, -0.35, 0), V3(0, 0.05, 0), 2.0, 40);
    torus(B.rubber, mul(Lm, T(0, -0.3, 0, Math.PI / 2, 0, 0)), 1.75, 0.1, { ts: 40 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(B.frame, mul(Lm, T(Math.cos(a) * 2.15, -0.15, Math.sin(a) * 2.15, 0, -a, 0)), 0.3, 0.32, 0.5); }
    const nose = mul(Lm, T(0, 3.95, 5.35, -0.66, 0, 0));
    for (const [wx, ww] of [[-2.5, 1.4], [-0.9, 1.4], [0.9, 1.4], [2.5, 1.4]]) {
      box(B.frame, mul(nose, T(wx, 0, 0.28)), ww + 0.15, 0.95, 0.06);
      box(B.glass, mul(nose, T(wx, 0, 0.32)), ww, 0.8, 0.04);
      B.windowGlow.add(new THREE.PlaneGeometry(ww * 0.9, 0.7), mul(nose, T(wx, 0, 0.343)), { uv: 'keep' });
    }
    cbox(B.frame, mul(Lm, T(0, 3.0, -6.9)), 13.0, 3.8, 0.8, 0.12);
    for (const nx of [-4.5, -1.5, 1.5, 4.5]) nozzle(mul(Lm, T(nx, 3.0, -7.3, -Math.PI / 2, 0, 0)), 0.85, 1.5);
    mark(mul(top, T(-4.6, 3.3, 0.06)), markRect(6, 1, 2, 1), 2.4, 0.3);
    mark(mul(top, T(4.2, 3.2, 0.06)), markRect(2, 1), 0.9, 0.9);
    decal(mul(top, T(0, -3.6, 0.06)), 'warning', 0.9, 0.9);
    const an = new THREE.Object3D(); an.name = sy > 0 ? 'landerA' : 'landerB'; an.matrix.copy(Lm); an.matrix.decompose(an.position, an.quaternion, an.scale); group.add(an); anchors[an.name] = an;
  };
  {
    const I = new THREE.Matrix4(), TR2 = HUB_R + 1.05;
    const ang = Array.from({ length: 8 }, (_, i) => (i + 0.5) * Math.PI / 4);
    const pt = (a, z) => V3(Math.cos(a) * TR2, Math.sin(a) * TR2, z);
    for (const a of ang) {
      cyl(B.metal, I, pt(a, -HUB_Z - 0.4), pt(a, HUB_Z + 0.4), 0.085, 8);
      cyl(B.metal, I, V3(Math.cos(a) * (HUB_R - 0.05), Math.sin(a) * (HUB_R - 0.05), -HUB_Z + 0.6), pt(a, -HUB_Z + 0.6), 0.06, 6);
      cyl(B.metal, I, V3(Math.cos(a) * (HUB_R - 0.05), Math.sin(a) * (HUB_R - 0.05), HUB_Z - 0.6), pt(a, HUB_Z - 0.6), 0.06, 6);
    }
    for (const z of [-HUB_Z - 0.4, HUB_Z + 0.4]) for (let i = 0; i < 8; i++) cyl(B.metal, I, pt(ang[i], z), pt(ang[(i + 1) % 8], z), 0.07, 6);
    for (let i = 0; i < 8; i++) {
      const a0 = ang[i], a1 = ang[(i + 1) % 8], mida = (a0 + a1) / 2 + (i === 7 ? Math.PI : 0);
      if (Math.abs(Math.cos(mida)) > 0.9 || Math.abs(Math.sin(mida)) > 0.9) continue;
      cyl(B.metal, I, pt(a0, -HUB_Z - 0.4), pt(a1, HUB_Z + 0.4), 0.05, 6);
      cyl(B.metal, I, pt(a1, -HUB_Z - 0.4), pt(a0, HUB_Z + 0.4), 0.05, 6);
    }
    for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) for (const z of [-1.9, 1.9]) {
      const c = V3(Math.cos(a) * (TR2 + 0.55), Math.sin(a) * (TR2 + 0.55), z);
      B.white.add(new THREE.SphereGeometry(0.72, 24, 16), T(c.x, c.y, c.z));
      torus(B.metal, mul(T(c.x, c.y, c.z), T(0, 0, 0, 0, 0, a), T(0, 0, 0, 0, Math.PI / 2, 0)), 0.73, 0.04, { ts: 32 });
      cyl(B.metal, I, c, pt(a, z), 0.07, 6);
      cyl(B.metal, I, c.clone().add(V3(0, 0, 0.7)), pt(a + 0.2, z + 1.2), 0.035, 6);
    }
    for (const z of [-2.6, 2.6]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(V3(Math.cos(a) * (HUB_R + 0.25), Math.sin(a) * (HUB_R + 0.25), z)); }
      for (let i = 0; i < 24; i++) { const am = ((i + 0.5) / 24) * Math.PI * 2; if (Math.abs(Math.sin(am)) < 0.42 || Math.abs(Math.cos(am)) < 0.42) continue; cyl(B.metal, I, pts[i], pts[i + 1], 0.05, 6); }
    }
    for (const [a, z, L2, d] of [[Math.PI * 0.25, 2.2, 4.5, 1.7], [Math.PI * 1.25, -2.2, 3.6, 1.2]]) {
      const b0 = V3(Math.cos(a) * TR2, Math.sin(a) * TR2, z), b1 = V3(Math.cos(a) * (TR2 + L2), Math.sin(a) * (TR2 + L2), z + (z > 0 ? 1.2 : -1.2));
      cyl(B.metal, I, b0, b1, 0.1, 8);
      antenna(mul(new THREE.Matrix4().makeBasis(V3(0, 0, 1).cross(V3(Math.cos(a), Math.sin(a), 0)), V3(0, 0, 1), V3(Math.cos(a), Math.sin(a), 0)).setPosition(b1)), 0.6, d);
    }
    for (const [a, h] of [[Math.PI * 0.6, 3.2], [Math.PI * 1.6, 2.4], [Math.PI * 1.9, 2.0]]) cyl(B.metal, I, V3(Math.cos(a) * TR2, Math.sin(a) * TR2, 3.0), V3(Math.cos(a) * (TR2 + h), Math.sin(a) * (TR2 + h), 3.4), 0.03, 5);
    for (const sz of [-1, 1]) {
      const zf = sz * DOCK_Z;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const g = new THREE.BoxGeometry(0.9, 0.06, 0.8);
        const Pm = mul(T(Math.cos(a) * (DR + 0.15), Math.sin(a) * (DR + 0.15), zf - sz * 0.2), T(0, 0, 0, 0, 0, a - Math.PI / 2), T(0, 0, 0, sz * 0.55, 0, 0));
        B.frame.add(g, Pm);
      }
      const tg = mul(T(DR + 0.9, 0.9, zf - sz * 0.35));
      cyl(B.metal, tg, V3(0, 0, 0), V3(0, 0, sz * 0.6), 0.04, 6);
      B.white.add(new THREE.CircleGeometry(0.32, 24), mul(tg, T(0, 0, sz * 0.61, 0, sz > 0 ? 0 : Math.PI, 0)));
      box(B.rubber, mul(tg, T(0, 0, sz * 0.62)), 0.5, 0.06, 0.01); box(B.rubber, mul(tg, T(0, 0, sz * 0.62)), 0.06, 0.5, 0.01);
      const um = [V3(-DR - 0.4, -0.6, zf - sz * 1.6), V3(-DR - 1.2, -0.9, zf - sz * 0.9), V3(-DR - 0.9, -0.6, zf - sz * 0.1)];
      cyl(B.metal, I, um[0], um[1], 0.09, 8); cyl(B.metal, I, um[1], um[2], 0.07, 8);
      cbox(B.frame, T(um[2].x, um[2].y, um[2].z), 0.35, 0.35, 0.35, 0.05);
      for (let i = 0; i < 3; i++) cyl(B.rubber, I, V3(-DR - 0.2, 0.5 - i * 0.25, sz * HUB_Z), V3(-DR - 0.2, 0.5 - i * 0.25, zf - sz * 0.5), 0.045, 6);
    }
    for (const sx of [1, -1]) for (const a of [0.9, 2.3, 4.0]) cyl(B.metal, I, V3(sx * HUB_R, Math.cos(a) * (SR + 0.3), Math.sin(a) * (SR + 0.3)), V3(sx * (HUB_R + 4.5), Math.cos(a) * (SR + 0.14), Math.sin(a) * (SR + 0.14)), 0.06, 8);
  }
  lander(1);
  lander(-1);

  const hi = new THREE.Group(); hi.name = 'Endurance.detail';
  const lo = new THREE.Group(); lo.name = 'Endurance.lod';
  const meshes = [];
  for (const [k, bag] of Object.entries(B)) {
    const g = bag.build();
    if (!g) continue;
    const m = new THREE.Mesh(g, M[k]);
    m.name = 'end.' + k;
    const lit = !['windowGlow', 'engineGlow', 'decal'].includes(k);
    m.castShadow = lit && k !== 'glass'; m.receiveShadow = lit;
    if (k === 'engineGlow') m.renderOrder = 5;
    hi.add(m); meshes.push(m);
  }
  const pg = plumes.build();
  const plumeMesh = new THREE.Mesh(pg, plumeMat);
  plumeMesh.name = 'end.plumes'; plumeMesh.renderOrder = 6; plumeMesh.visible = false;
  hi.add(plumeMesh); meshes.push(plumeMesh);
  for (const [k, bag] of Object.entries(L)) {
    const g = bag.build();
    if (!g) continue;
    const m = new THREE.Mesh(g, k === 'engineGlow' ? M.engineGlow : M[k]);
    m.name = 'end.lod.' + k; m.castShadow = k === 'white' || k === 'lodFrame'; m.receiveShadow = m.castShadow;
    lo.add(m); meshes.push(m);
  }
  const lod = new THREE.LOD();
  lod.name = 'Endurance.LOD';
  lod.addLevel(hi, 0);
  lod.addLevel(lo, 900);
  group.add(lod);

  const portA = new THREE.Object3D(); portA.name = 'rangerPortA'; portA.position.set(0, 0, DOCK_Z); portA.quaternion.setFromAxisAngle(V3(0, 1, 0), Math.PI); group.add(portA); anchors.rangerPortA = portA;
  const portB = new THREE.Object3D(); portB.name = 'rangerPortB'; portB.position.set(0, 0, -DOCK_Z); group.add(portB); anchors.rangerPortB = portB;
  const hubA = new THREE.Object3D(); hubA.name = 'hub'; group.add(hubA); anchors.hub = hubA;

  const state = { engines: 0, windows: 1, t: 0 };
  const setEngines = (v) => {
    state.engines = Math.max(0, Math.min(1, v));
    M.engineGlow.color.setRGB(0.2, 0.42, 1.3).multiplyScalar(state.engines * 5);
    plumeMat.uniforms.uI.value = state.engines * 3.5;
    plumeMesh.visible = state.engines > 0.001;
  };
  const setWindows = (v) => { state.windows = Math.max(0, v); M.windowGlow.color.setRGB(0.55, 0.47, 0.36).multiplyScalar(state.windows); };
  setEngines(0);
  setWindows(1);

  const update = (dt = 0.016) => {
    state.t += dt;
    if (state.engines > 0) plumeMat.uniforms.uI.value = state.engines * (3.3 + 0.4 * Math.sin(state.t * 37) * Math.sin(state.t * 13));
  };

  const stats = () => {
    let tris = 0, calls = 0;
    hi.traverse(o => { if (o.isMesh) { tris += o.geometry.index.count / 3; calls++; } });
    let lt = 0; lo.traverse(o => { if (o.isMesh) lt += o.geometry.index.count / 3; });
    return { tris, calls, lodTris: lt };
  };

  const dispose = () => {
    for (const m of meshes) m.geometry.dispose();
    M.solar.dispose(); solarTex.dispose(); glowTex?.dispose(); M.cream.dispose(); M.grey.dispose(); M.lodFrame.dispose(); M.lander.dispose(); M.windowGlow.dispose(); M.engineGlow.dispose(); plumeMat.dispose();
    if (!materials) for (const k of ['white', 'tile', 'frame', 'metal', 'glass', 'radiator', 'rubber', 'engine', 'decal']) mats[k]?.dispose?.();
    group.removeFromParent();
  };

  return { group, lod, detail: hi, lodGroup: lo, anchors, modules: MODULE_TYPES.map((type, k) => ({ k, type, angle: k * 30 })), dims: RING, setEngines, setWindows, update, stats, dispose };
}
