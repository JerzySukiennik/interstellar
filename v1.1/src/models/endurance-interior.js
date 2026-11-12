// Endurance interior: procedural ring modules, tunnels, spine and hub, authored unrolled and bent onto the ring, with tube lights, ageing, plants and interactables.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const RF = 33.2;
export const THETA0 = -Math.PI / 2;
export const PITCH = RF * Math.PI / 6;
export const DIM = { HL: 5.2, HW: 2.34, H: 2.7, FIL: 0.7, KICK: 0.16, HY: 1.1, HR: 1.02, TR: 1.25, SR: 1.1, HUB_R: 2.3, HUB_HZ: 2.3, DOCK_Z: 5.3 };
const { HL, HW, H, FIL, KICK, HY, HR, TR, SR, HUB_R, HUB_HZ, DOCK_Z } = DIM;
const WALL_TOP = 2.0;
const TILE = 0.26;
const SPINE_X0 = 2.0, SPINE_X1 = RF - H + 0.06;
const MODS = [
  { id: 'lab', k: 9, c: 0, name: 'M09 CRYO LAB' },
  { id: 'pod', k: 10, c: PITCH, name: 'M10 LANDING POD' },
  { id: 'engine', k: 11, c: 2 * PITCH, name: 'M11 ENGINE 2' },
  { id: 'hab', k: 0, c: 3 * PITCH, name: 'M00 HABITAT A' },
];
const ONE = [1, 1, 1];
const TUBE_COOL = new THREE.Color(0.9, 0.96, 1.0);
const TUBE_WARM = new THREE.Color(1.0, 0.78, 0.55);

export function ringToEndurance(s, y, z, out = new THREE.Vector3()) {
  const th = THETA0 + s / RF, r = RF - y;
  return out.set(r * Math.cos(th), r * Math.sin(th), z);
}

export function ringMatrix(s, y, z, out = new THREE.Matrix4()) {
  const th = THETA0 + s / RF, c = Math.cos(th), sn = Math.sin(th), r = RF - y;
  return out.set(-sn, -c, 0, r * c, c, -sn, 0, r * sn, 0, 0, 1, z, 0, 0, 0, 1);
}

export function ringUp(s, out = new THREE.Vector3()) {
  const th = THETA0 + s / RF;
  return out.set(-Math.cos(th), -Math.sin(th), 0);
}

export function enduranceToRing(p) {
  let th = Math.atan2(p.y, p.x) - THETA0;
  while (th < -Math.PI / 2) th += Math.PI * 2;
  while (th >= Math.PI * 1.5) th -= Math.PI * 2;
  return { s: th * RF, y: RF - Math.hypot(p.x, p.y), z: p.z };
}

function rigFrame(s, y, z) {
  return ringMatrix(s, y, z).multiply(new THREE.Matrix4().makeTranslation(-s, -y, -z));
}

function rand(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash1(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function tnoise(size, period, oct, seed, pers = 0.5) {
  const out = new Float32Array(size * size);
  const R = rand(seed);
  let amp = 1, tot = 0, p = period;
  for (let o = 0; o < oct && p <= size; o++) {
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    const sc = p / size;
    for (let y = 0; y < size; y++) {
      const fy = y * sc, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % p) * p, r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x * sc, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % p, c1 = (x0 + 1) % p;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    tot += amp; amp *= pers; p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function normalsFrom(h, S, k, cell = 0) {
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let xl, xr, yd, yu;
      if (cell) {
        const bx = x - (x % cell), by = y - (y % cell);
        xl = Math.max(bx, x - 1); xr = Math.min(bx + cell - 1, x + 1); yd = Math.max(by, y - 1); yu = Math.min(by + cell - 1, y + 1);
      } else {
        xl = (x - 1 + S) % S; xr = (x + 1) % S; yd = (y - 1 + S) % S; yu = (y + 1) % S;
      }
      const dx = (h[y * S + xr] - h[y * S + xl]) * k / (cell ? xr - xl : 2);
      const dy = (h[yu * S + x] - h[yd * S + x]) * k / (cell ? yu - yd : 2);
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * S + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255; out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255; out[i + 2] = (inv * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  }
  return out;
}

function dataTex(data, size, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso;
  t.repeat.set(1 / repeat, 1 / repeat);
  t.needsUpdate = true;
  return t;
}

function padTextures(S) {
  const half = S / 2;
  const h = new Float32Array(S * S), alb = new Uint8Array(S * S * 4);
  const R = rand(9101);
  const fine = tnoise(S, 64, 3, 33);
  const grime = tnoise(S, 8, 4, 34);
  for (let vy = 0; vy < 2; vy++) {
    for (let vx = 0; vx < 2; vx++) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => ({ cx, cy, k: 4 + Math.floor(R() * 5), ph: R() * 6.28, a: 0.4 + R() * 0.9 }));
      const ang = R() * Math.PI, ox = 0.3 + R() * 0.4, oy = 0.3 + R() * 0.4, dn = [Math.cos(ang), Math.sin(ang)], dlen = 0.18 + R() * 0.22, dAmp = R() < 0.6 ? 0.1 + R() * 0.12 : 0;
      const grimeSide = R();
      for (let y = 0; y < half; y++) {
        for (let x = 0; x < half; x++) {
          const fu = (x + 0.5) / half, fv = (y + 0.5) / half;
          const e = Math.min(fu, 1 - fu, fv, 1 - fv);
          let hh = 0;
          const seam = Math.exp(-(e / 0.014) * (e / 0.014));
          hh -= seam;
          let st = 0;
          const edges = [[fu, fv], [1 - fu, fv], [fv, fu], [1 - fv, fu]];
          for (const [d, t] of edges) {
            if (t < 0.035 || t > 0.965) continue;
            const q = (d - 0.05) / 0.0065;
            if (q * q > 9) continue;
            const c = 0.5 + 0.5 * Math.cos((t / 0.03) * Math.PI * 2);
            st = Math.max(st, Math.exp(-q * q) * c * c);
          }
          hh -= 0.32 * st;
          let cr = 0;
          for (const c of corners) {
            const dx = fu - c.cx, dy = fv - c.cy, r = Math.hypot(dx, dy);
            if (r > 0.6) continue;
            const s = Math.abs(Math.sin(Math.atan2(dy, dx) * c.k + c.ph));
            const s4 = s * s * s * s;
            cr += c.a * s4 * s4 * Math.exp(-r / 0.13) * smooth(0.015, 0.07, r);
          }
          hh -= 0.22 * cr;
          if (dAmp) {
            const px = fu - ox, py = fv - oy, along = px * dn[0] + py * dn[1], perp = -px * dn[1] + py * dn[0];
            if (Math.abs(along) < dlen) hh -= dAmp * Math.exp(-(perp / 0.01) * (perp / 0.01)) * (1 - Math.abs(along) / dlen);
          }
          const gx = vx * half + x, gy = vy * half + y, gi = gy * S + gx;
          hh += 0.004 * Math.sin(gx * 2.1) * Math.sin(gy * 2.1) + (fine[gi] - 0.5) * 0.08;
          h[gi] = hh;
          const gr = (grime[gi] - 0.5) * 18 + (grimeSide < 0.5 ? (1 - fv) : fv) * -6;
          const base = 226 + gr - 46 * seam - 26 * st - 14 * Math.min(1, cr) - 10 * smooth(0.12, 0.0, e);
          const i = gi * 4;
          alb[i] = Math.max(0, Math.min(255, base + 1));
          alb[i + 1] = Math.max(0, Math.min(255, base + 1));
          alb[i + 2] = Math.max(0, Math.min(255, base - 2));
          alb[i + 3] = 255;
        }
      }
    }
  }
  return { map: alb, normal: normalsFrom(h, S, half * 0.0058 * 2, half) };
}

function grateTextures(S) {
  const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4), h = new Float32Array(S * S);
  const pxm = S / 0.5, pitch = S / 16, bw = 0.005 * pxm, cp = S / 5, cw = 0.007 * pxm;
  const n = tnoise(S, 16, 4, 7), sc = tnoise(S, 64, 2, 8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dB = Math.min(x % pitch, pitch - (x % pitch)), dC = Math.min(y % cp, cp - (y % cp));
      const bar = dB < bw / 2, cross = dC < cw / 2;
      const solid = bar || cross;
      let ht = 0;
      if (bar) ht = 1 - Math.pow(dB / (bw / 2), 4) * 0.5;
      if (cross) ht = Math.max(ht, 0.8 - Math.pow(dC / (cw / 2), 4) * 0.4);
      h[i] = ht;
      const wear = solid ? (bar ? 1 - dB / (bw / 2) : 0.6) : 0;
      const v = 96 + n[i] * 40 + wear * 34 + (sc[i] > 0.75 ? 25 : 0);
      alb[i * 4] = v; alb[i * 4 + 1] = v + 2; alb[i * 4 + 2] = v + 4; alb[i * 4 + 3] = solid ? 255 : 0;
      orm[i * 4] = 255; orm[i * 4 + 1] = solid ? 80 + n[i] * 80 - wear * 30 : 255; orm[i * 4 + 2] = 230; orm[i * 4 + 3] = 255;
    }
  }
  return { map: alb, orm, normal: normalsFrom(h, S, 1.6) };
}

function fabricTextures(S) {
  const h = new Float32Array(S * S);
  const n = tnoise(S, 8, 4, 61), w = tnoise(S, 32, 2, 62);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    h[i] = 0.08 * Math.sin(x * 1.6) * Math.sin(y * 1.6) + n[i] * 3 + Math.pow(Math.abs(Math.sin(n[i] * 22 + w[i] * 6)), 6) * -0.8;
  }
  return { normal: normalsFrom(h, S, 1.2) };
}

function grimeTextures(S) {
  const map = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
  const n = tnoise(S, 6, 5, 71), m = tnoise(S, 48, 2, 72), R = rand(73);
  const streak = new Float32Array(S * S);
  for (let k = 0; k < 220; k++) {
    const x0 = Math.floor(R() * S), y0 = Math.floor(R() * S), len = 20 + Math.floor(R() * S * 0.3), a = 0.15 + R() * 0.5, horiz = R() < 0.6;
    for (let t = 0; t < len; t++) {
      const x = horiz ? (x0 + t) % S : x0, y = horiz ? y0 : (y0 + t) % S;
      streak[y * S + x] = Math.max(streak[y * S + x], a * (1 - t / len));
    }
  }
  for (let i = 0; i < S * S; i++) {
    const v = 240 + (n[i] - 0.5) * 14;
    map[i * 4] = v; map[i * 4 + 1] = v; map[i * 4 + 2] = v - 3; map[i * 4 + 3] = 255;
    orm[i * 4] = 255; orm[i * 4 + 1] = 120 + (n[i] - 0.5) * 90 + streak[i] * 70; orm[i * 4 + 2] = 255; orm[i * 4 + 3] = 255;
  }
  return { map, orm };
}

function frostTexture(S) {
  const d = new Uint8Array(S * S * 4);
  const n = tnoise(S, 8, 5, 81), c = tnoise(S, 64, 2, 82);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const e = Math.min(x, S - 1 - x, y, S - 1 - y) / (S / 2);
    const crystal = Math.pow(Math.abs(Math.sin(c[i] * 40)), 3);
    const v = clamp01(0.55 * (1 - e) + 0.35 * n[i] + 0.18 * crystal);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v * 255; d[i * 4 + 3] = 255;
  }
  return d;
}

function frostLid(W, Hh) {
  const d = new Uint8Array(W * Hh * 4);
  const c1 = makeCanvas(W, Hh), c2 = makeCanvas(W, Hh), c3 = makeCanvas(W, Hh);
  if (!c1) return d;
  const pxm = W / 2.19, R = rand(3131);
  const x1 = c1.getContext('2d'), x2 = c2.getContext('2d'), x3 = c3.getContext('2d');
  x1.fillStyle = '#000'; x1.fillRect(0, 0, W, Hh); x2.fillStyle = '#808080'; x2.fillRect(0, 0, W, Hh); x3.fillStyle = '#000'; x3.fillRect(0, 0, W, Hh);
  x1.globalCompositeOperation = 'lighter'; x3.globalCompositeOperation = 'lighten';
  for (const x of [x1, x2, x3]) x.lineCap = 'round';
  const step = Math.max(4, pxm * 0.005);
  const seg = (ax, ay, bx, by, w, br, fac, ord) => {
    x1.strokeStyle = `rgba(255,255,255,${br})`; x1.lineWidth = w; x1.beginPath(); x1.moveTo(ax, ay); x1.lineTo(bx, by); x1.stroke();
    const g = Math.floor(fac * 255); x2.strokeStyle = `rgb(${g},${g},${g})`; x2.lineWidth = w + 1; x2.beginPath(); x2.moveTo(ax, ay); x2.lineTo(bx, by); x2.stroke();
    const o = Math.floor(Math.max(0, Math.min(1, ord)) * 255); x3.strokeStyle = `rgb(${o},${o},${o})`; x3.lineWidth = w + 2; x3.beginPath(); x3.moveTo(ax, ay); x3.lineTo(bx, by); x3.stroke();
  };
  const frond = (px, py, ang, len, w, depth, ord0, ordSpan, fac, br) => {
    const n = Math.max(2, Math.round(len / step));
    let cx = px, cy = py, a = ang;
    const side0 = R() < 0.5 ? 1 : -1, curl = (R() - 0.5) * 0.012;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      a += curl + (R() - 0.5) * 0.05;
      const nx = cx + Math.cos(a) * step, ny = cy + Math.sin(a) * step;
      const ww = Math.max(0.8, w * Math.pow(1 - t, 0.7));
      seg(cx, cy, nx, ny, ww, br * (0.75 + 0.25 * (1 - t)), fac, ord0 - ordSpan * t);
      if (depth > 0 && i > 1 && i % 2 === 0) {
        for (const sg of [side0, -side0]) {
          if (R() > 0.82) continue;
          const bl = len * (0.22 + R() * 0.2) * Math.pow(1 - t, 0.85) * (depth === 1 ? 0.75 : 1);
          if (bl < step * 2) continue;
          frond(nx, ny, a + sg * (Math.PI / 3) * (0.85 + R() * 0.3), bl, ww * 0.55, depth - 1, ord0 - ordSpan * t, ordSpan * 0.5, Math.min(1, fac + (R() - 0.5) * 0.3), br * 0.9);
        }
      }
      cx = nx; cy = ny;
      if (cx < -20 || cy < -20 || cx > W + 20 || cy > Hh + 20) break;
    }
  };
  const per = [[0, 0, W, 0, Math.PI / 2], [W, 0, W, Hh, Math.PI], [W, Hh, 0, Hh, -Math.PI / 2], [0, Hh, 0, 0, 0]];
  for (const [ax, ay, bx, by, inward] of per) {
    const L = Math.hypot(bx - ax, by - ay);
    for (let u = R() * 0.03 * pxm; u < L; u += (0.03 + R() * 0.05) * pxm) {
      const t = u / L, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      const corner = Math.min(u, L - u) < 0.12 * pxm ? 1.5 : 1;
      frond(px, py, inward + (R() - 0.5) * 1.3, (0.07 + Math.pow(R(), 1.6) * 0.3) * pxm * corner, (0.0018 + R() * 0.0022) * pxm, 2, 1, 0.75, R(), 0.55 + 0.45 * R());
    }
  }
  const half = Math.min(W, Hh) / 2;
  for (let i = 0; i < 1100; i++) {
    const px = R() * W, py = R() * Hh, ed = Math.min(px, py, W - px, Hh - py) / half;
    const o0 = 0.28 + 0.6 * Math.pow(1 - ed, 1.2) + (R() - 0.5) * 0.12;
    frond(px, py, R() * Math.PI * 2, (0.025 + Math.pow(R(), 1.5) * 0.11) * pxm, (0.0011 + R() * 0.0016) * pxm, R() < 0.35 ? 2 : 1, o0, 0.3, R(), 0.3 + 0.45 * R());
  }
  const n2 = Math.round(W * Hh / 900);
  for (let i = 0; i < n2; i++) {
    const px = R() * W, py = R() * Hh, ed = Math.min(px, py, W - px, Hh - py) / half;
    const o0 = 0.2 + 0.6 * Math.pow(1 - ed, 1.2) + (R() - 0.5) * 0.2;
    frond(px, py, R() * Math.PI * 2, (0.006 + Math.pow(R(), 2) * 0.03) * pxm, (0.0006 + R() * 0.0008) * pxm, 1, o0, 0.15, R(), 0.4 + 0.45 * R());
  }
  const blur = (c, px) => { const b2 = makeCanvas(W, Hh), xb = b2.getContext('2d'); xb.filter = `blur(${px}px)`; xb.drawImage(c, 0, 0); return xb.getImageData(0, 0, W, Hh).data; };
  const i1 = blur(c1, Math.max(0.6, pxm * 0.0007)), i2 = x2.getImageData(0, 0, W, Hh).data, i3 = blur(c3, Math.max(0.8, pxm * 0.001));
  for (let i = 0; i < W * Hh; i++) { d[i * 4] = i1[i * 4]; d[i * 4 + 1] = i2[i * 4]; d[i * 4 + 2] = 0; d[i * 4 + 3] = i3[i * 4]; }
  return d;
}

function dropTexture(S) {
  const d = new Uint8Array(S * S * 4), R = rand(5757), h = new Float32Array(S * S);
  for (let k = 0; k < Math.round(S * S / 260); k++) {
    const cx = R() * S, cy = R() * S, r = 1.2 + Math.pow(R(), 3) * 9;
    for (let yy = Math.floor(cy - r); yy <= cy + r; yy++) for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
      const q = ((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r);
      if (q >= 1) continue;
      const i = ((yy + S) % S) * S + ((xx + S) % S);
      h[i] = Math.max(h[i], Math.sqrt(1 - q));
    }
  }
  for (let i = 0; i < S * S; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = h[i] * 255; d[i * 4 + 3] = 255; }
  return d;
}

const LABELS = {
  'M09 CRYO LAB': 'd', 'M10 LANDING POD': 'd', 'M11 ENGINE 2': 'd', 'M00 HABITAT A': 'd', 'M06 COMMAND': 'd', 'M01 LANDING POD': 'd', 'M08 ENGINE 1': 'd',
  'LANDER 1': 'd', 'LANDER 2': 'd', 'RANGER 1': 'd', 'RANGER 2': 'd', 'SPINE ACCESS': 'w', 'HUB': 'w',
  'NO ACCESS': 'y', 'PRESSURE HATCH': 'w', 'MANUAL RELEASE': 'y', 'PULL TO RELEASE': 'y', 'O2': 'w', 'N2': 'w', 'H2O': 'w', 'COOLANT': 'w',
  'PWR BUS A': 'w', 'PWR BUS B': 'w', 'CRYO 01': 'w', 'CRYO 02': 'w', 'MED': 'w', 'FIRE EXT': 'y', 'DO NOT OBSTRUCT': 'y', 'HANDHOLD': 'w', 'STOW': 'w',
  'LIFE SUPPORT': 'w', 'GALLEY': 'w', 'HYDRO 1': 'w', 'COMMS': 'w', 'ATT CTRL': 'w', 'MAIN ENG': 'w', 'RCS': 'w', 'FUEL XFER': 'w', 'ISOL VALVE': 'y',
  'HAB A': 'w', 'BUNK 1': 'w', 'BUNK 2': 'w', 'CARGO 01': 'w', 'CARGO 02': 'w', 'CARGO 03': 'w', 'CARGO 04': 'w', 'SEED VAULT': 'w', 'SAMPLE KIT': 'w',
  'EMBRYO BANK': 'w', 'SPARES': 'w', 'TOOLS': 'w', 'LOX 1': 'w', 'LOX 2': 'w', 'HE PRESS': 'y', 'HIGH VOLTAGE': 'y', 'GND': 'w', 'MASTER ARM': 'y',
  'CAUTION': 'y', 'TO HUB': 'w', 'TO RING': 'w', 'DOCK PORT A': 'd', 'DOCK PORT B': 'd', 'LADDER': 'w', 'CLIMB': 'w', 'MISSION': 'w', 'LOG': 'w',
  'NAV': 'w', 'THERM': 'w', 'DATA 1': 'w', 'DATA 2': 'w', 'SICK BAY': 'w', 'CYCLE': 'w', 'WATER': 'w', 'FOOD': 'w', 'VENT': 'w', 'HEAT': 'w',
};
const LABEL_EXTRA = ['stripes', 'stripes2', 'dial', 'dial2', 'barcode', 'panelA', 'panelB', 'panelC', 'panelD', 'grill', 'photo', 'book', 'notes', 'screen'];
const ATLAS_COLS = 8, ATLAS_ROWS = 16;
const LABEL_INDEX = {};
[...Object.keys(LABELS), ...LABEL_EXTRA].forEach((k, i) => { LABEL_INDEX[k] = i; });

function labelRect(name) {
  const i = LABEL_INDEX[name] ?? 0, cx = i % ATLAS_COLS, cy = Math.floor(i / ATLAS_COLS);
  return [cx / ATLAS_COLS + 0.002, 1 - (cy + 1) / ATLAS_ROWS + 0.004, (cx + 1) / ATLAS_COLS - 0.002, 1 - cy / ATLAS_ROWS - 0.004];
}

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function labelAtlas() {
  const W = 2048, Hh = 1024, cw = W / ATLAS_COLS, ch = Hh / ATLAS_ROWS;
  const c = makeCanvas(W, Hh);
  if (!c) return null;
  const x = c.getContext('2d');
  const R = rand(404);
  x.fillStyle = '#777'; x.fillRect(0, 0, W, Hh);
  const font = (px, w = 700) => `${w} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const cell = (name) => { const i = LABEL_INDEX[name]; return [(i % ATLAS_COLS) * cw, Math.floor(i / ATLAS_COLS) * ch]; };
  for (const [name, style] of Object.entries(LABELS)) {
    const [ox, oy] = cell(name);
    const bg = style === 'd' ? '#26292b' : style === 'y' ? '#d4a51e' : '#e6e4dc';
    const fg = style === 'd' ? '#e8e6de' : '#16181a';
    x.fillStyle = bg; x.fillRect(ox, oy, cw, ch);
    x.strokeStyle = fg; x.globalAlpha = 0.7; x.lineWidth = 3; x.strokeRect(ox + 5, oy + 5, cw - 10, ch - 10); x.globalAlpha = 1;
    let fs = ch * 0.5;
    x.font = font(fs);
    const w = x.measureText(name).width;
    if (w > cw * 0.86) fs *= (cw * 0.86) / w;
    x.font = font(fs); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, ox + cw / 2, oy + ch / 2 + 2);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(60,55,45,${R() * 0.08})`; x.fillRect(ox + R() * cw, oy + R() * ch, 2 + R() * 10, 1 + R() * 3); }
  }
  const at = (n) => cell(n);
  let [ox, oy] = at('stripes');
  x.save(); x.beginPath(); x.rect(ox, oy, cw, ch); x.clip();
  for (let i = -4; i < 20; i++) { x.fillStyle = i % 2 ? '#141414' : '#d6a41c'; x.beginPath(); x.moveTo(ox + i * 24, oy); x.lineTo(ox + i * 24 + 24, oy); x.lineTo(ox + i * 24 + 24 - ch, oy + ch); x.lineTo(ox + i * 24 - ch, oy + ch); x.fill(); }
  x.restore();
  [ox, oy] = at('stripes2');
  x.save(); x.beginPath(); x.rect(ox, oy, cw, ch); x.clip();
  x.fillStyle = '#e6e4dc'; x.fillRect(ox, oy, cw, ch);
  for (let i = -4; i < 20; i++) { if (i % 2) continue; x.fillStyle = '#1c1c1c'; x.beginPath(); x.moveTo(ox + i * 24, oy); x.lineTo(ox + i * 24 + 24, oy); x.lineTo(ox + i * 24 + 24 - ch, oy + ch); x.lineTo(ox + i * 24 - ch, oy + ch); x.fill(); }
  x.restore();
  for (const dn of ['dial', 'dial2']) {
    [ox, oy] = at(dn);
    x.fillStyle = '#101112'; x.fillRect(ox, oy, cw, ch);
    for (let j = 0; j < 4; j++) {
      const cx = ox + ch / 2 + j * ch, cy = oy + ch / 2, r = ch * 0.44;
      x.fillStyle = dn === 'dial' ? '#e8e5da' : '#1a1c1d'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.strokeStyle = dn === 'dial' ? '#111' : '#ddd'; x.lineWidth = 1.5;
      for (let t = 0; t <= 10; t++) { const a = Math.PI * 0.75 + t / 10 * Math.PI * 1.5; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); x.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); x.stroke(); }
      const a = Math.PI * 0.75 + R() * Math.PI * 1.5; x.lineWidth = 2.5; x.strokeStyle = '#b8471c'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); x.stroke();
    }
  }
  [ox, oy] = at('barcode');
  x.fillStyle = '#eee'; x.fillRect(ox, oy, cw, ch); x.fillStyle = '#111';
  for (let px = ox + 10; px < ox + cw - 10; px += 2 + Math.floor(R() * 5)) x.fillRect(px, oy + 8, 1 + Math.floor(R() * 3), ch - 22);
  for (const pn of ['panelA', 'panelB', 'panelC', 'panelD']) {
    [ox, oy] = at(pn);
    x.fillStyle = pn === 'panelD' ? '#202325' : '#15171a'; x.fillRect(ox, oy, cw, ch);
    x.fillStyle = '#b9bcb6'; x.font = font(9, 600); x.textAlign = 'left'; x.textBaseline = 'top';
    const words = ['BUS', 'XFER', 'ARM', 'SAFE', 'PRI', 'SEC', 'ON', 'OFF', 'AUTO', 'MAN', 'VLV', 'HTR', 'FAN', 'CMD', 'TLM', 'RCV'];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) x.fillText(words[Math.floor(R() * words.length)], ox + 6 + k * 31, oy + 4 + r * 15);
    x.strokeStyle = '#8a8d88'; x.lineWidth = 1; x.strokeRect(ox + 2, oy + 2, cw - 4, ch - 4);
  }
  [ox, oy] = at('grill');
  x.fillStyle = '#0d0e0f'; x.fillRect(ox, oy, cw, ch); x.fillStyle = '#3a3d40';
  for (let px = ox + 4; px < ox + cw - 4; px += 8) x.fillRect(px, oy + 6, 4, ch - 12);
  [ox, oy] = at('photo');
  const g = x.createLinearGradient(ox, oy, ox, oy + ch); g.addColorStop(0, '#9fb3c4'); g.addColorStop(0.55, '#d8c79c'); g.addColorStop(0.56, '#6d7a3e'); g.addColorStop(1, '#4a4f2a');
  x.fillStyle = g; x.fillRect(ox, oy, cw, ch); x.fillStyle = '#2b2a22'; x.fillRect(ox + cw * 0.55, oy + ch * 0.3, cw * 0.18, ch * 0.3); x.fillRect(ox + cw * 0.3, oy + ch * 0.42, 6, ch * 0.2);
  [ox, oy] = at('book');
  x.fillStyle = '#3c4a5a'; x.fillRect(ox, oy, cw, ch); x.fillStyle = '#c8c2ae'; x.font = font(22, 700); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ORBITAL MECHANICS', ox + cw / 2, oy + ch / 2);
  [ox, oy] = at('notes');
  x.fillStyle = '#ece7d6'; x.fillRect(ox, oy, cw, ch); x.strokeStyle = '#2b3550'; x.lineWidth = 1.2;
  for (let r = 0; r < 4; r++) { x.beginPath(); let px = ox + 8; x.moveTo(px, oy + 12 + r * 13); while (px < ox + cw - 20) { px += 4 + R() * 6; x.lineTo(px, oy + 10 + r * 13 + R() * 4); } x.stroke(); }
  [ox, oy] = at('screen');
  x.fillStyle = '#050807'; x.fillRect(ox, oy, cw, ch);
  return c;
}

function makeTallyCanvas() {
  return makeCanvas(1024, 512);
}

function drawTally(c, n) {
  if (!c) return;
  const x = c.getContext('2d');
  const R = rand(1717), W = c.width, Hc = c.height;
  x.fillStyle = '#80837f'; x.fillRect(0, 0, W, Hc);
  for (let i = 0; i < 260; i++) { const yy = R() * Hc; x.fillStyle = `rgba(${R() < 0.5 ? '60,62,60' : '160,163,158'},${0.05 + R() * 0.08})`; x.fillRect(0, yy, W, 1 + R() * 2); }
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(50,48,44,${R() * 0.12})`; x.beginPath(); x.ellipse(R() * W, R() * Hc, 10 + R() * 40, 4 + R() * 12, R() * 3, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(40,42,40,0.9)'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, Hc - 8);
  const gw = 112, rowH = 190, perRow = 8, mh = 140;
  x.lineCap = 'round';
  const scratch = (x0, y0, x1, y1) => {
    x.strokeStyle = 'rgba(28,30,28,0.75)'; x.lineWidth = 13; x.beginPath(); x.moveTo(x0 + 2, y0 + 2); x.lineTo(x1 + 2, y1 + 2); x.stroke();
    x.strokeStyle = 'rgba(238,241,236,0.96)'; x.lineWidth = 8 + R() * 3; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(x0 - 1, y0); x.lineTo(x1 - 1, y1); x.stroke();
  };
  for (let i = 0; i < n; i++) {
    const g = Math.floor(i / 5), k = i % 5, row = Math.floor(g / perRow), col = g % perRow;
    const bx = 46 + col * gw, by = 40 + row * rowH;
    if (by + mh > Hc - 10) break;
    if (k < 4) { const px = bx + k * 20 + (R() - 0.5) * 4; scratch(px, by + (R() - 0.5) * 6, px + (R() - 0.5) * 7, by + mh + (R() - 0.5) * 6); }
    else scratch(bx - 14, by + mh - 18 + R() * 10, bx + 86, by + 14 + R() * 10);
  }
}

function invert(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.array.length; i++) n.array[i] *= -1;
  return g;
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _w = new THREE.Vector3(), _nm = new THREE.Matrix3(), _nm2 = new THREE.Matrix3();

class Bag {
  constructor(zone) { this.zone = zone; this.P = []; this.N = []; this.U = []; this.C = []; this.F = []; this.I = []; }
  get n() { return this.P.length / 3; }
  vtx(x, y, z, nx, ny, nz, u, w, r, g, b) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.U.push(u, w); this.C.push(r, g, b); this.F.push(0);
    return this.n - 1;
  }
  add(g, M, o = {}) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, ca = g.attributes.color;
    _nm.getNormalMatrix(M);
    const rig = o.rig && this.zone.ring ? o.rig : null;
    if (rig) _nm2.getNormalMatrix(rig);
    const base = this.n, col = o.color || ONE, sc = o.uvScale || 1, rect = o.rect, mode = o.uv || (rect ? 'keep' : 'box'), ao = o.ao ?? 1;
    const aoFn = this.zone.ao;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(M);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      let u = 0, w = 0;
      if (mode === 'keep' && uv) {
        u = uv.getX(i); w = uv.getY(i);
        if (rect) { u = rect[0] + u * (rect[2] - rect[0]); w = rect[1] + w * (rect[3] - rect[1]); } else { u *= sc; w *= sc; }
      } else {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) { u = _v.x; w = _v.z; } else if (ax >= az) { u = _v.z; w = _v.y; } else { u = _v.x; w = _v.y; }
        u *= sc; w *= sc;
      }
      let r = col[0] * ao, gg = col[1] * ao, b = col[2] * ao;
      if (ca) { r *= ca.getX(i); gg *= ca.getY(i); b *= ca.getZ(i); }
      if (rig) {
        const a = aoFn ? aoFn(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z) : 1;
        r *= a; gg *= a; b *= a;
        _v.applyMatrix4(rig); _n.applyMatrix3(_nm2).normalize();
      }
      this.P.push(_v.x, _v.y, _v.z); this.N.push(_n.x, _n.y, _n.z); this.U.push(u, w); this.C.push(r, gg, b); this.F.push(rig ? 1 : 0);
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) this.I.push(base + a[i]); } else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
    g.dispose();
    return this;
  }
  build() {
    if (!this.I.length) return null;
    const n = this.n, P = new Float32Array(this.P), N = new Float32Array(this.N), C = new Float32Array(this.C), F = this.F;
    const aoFn = this.zone.ao, bend = this.zone.ring;
    for (let i = 0; i < n; i++) {
      if (F[i]) continue;
      const j = i * 3;
      if (aoFn) { const a = aoFn(P[j], P[j + 1], P[j + 2], N[j], N[j + 1], N[j + 2]); C[j] *= a; C[j + 1] *= a; C[j + 2] *= a; }
      if (bend) {
        const s = P[j], y = P[j + 1], th = THETA0 + s / RF, c = Math.cos(th), sn = Math.sin(th), r = RF - y;
        P[j] = r * c; P[j + 1] = r * sn;
        const ns = N[j], ny = N[j + 1];
        N[j] = -ns * sn - ny * c; N[j + 1] = ns * c - ny * sn;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.U), 2));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.P = this.N = this.U = this.C = this.F = this.I = null;
    return g;
  }
}

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
const mul = (...ms) => ms.reduce((a, b) => new THREE.Matrix4().multiplyMatrices(a, b));
const segs = (l) => (l > 0.7 ? Math.ceil(l / 0.45) : 1);
const frameN = (p, xd, n) => { const Zc = n.clone().normalize(); const Y = V3().crossVectors(Zc, xd).normalize(); const X = V3().crossVectors(Y, Zc); return new THREE.Matrix4().makeBasis(X, Y, Zc).setPosition(p); };
const tunnelPt = (s, phi, sz, r = TR) => ({ p: V3(s, HY + r * Math.cos(phi), sz * r * Math.sin(phi)), n: V3(0, -Math.cos(phi), -sz * Math.sin(phi)) });
const tunnelFrame = (s, phi, sz, off = 0, r = TR) => { const t = tunnelPt(s, phi, sz, r); return frameN(t.p.addScaledVector(t.n, off), V3(1, 0, 0), t.n); };
const spineFrame = (x, az, off = 0, r = SR) => { const n = V3(0, -Math.cos(az), -Math.sin(az)); return frameN(V3(x, Math.cos(az) * r, Math.sin(az) * r).addScaledVector(n, off), V3(1, 0, 0), n); };

function box(bag, M, sx, sy, sz, o) {
  return bag.add(new THREE.BoxGeometry(sx, sy, sz, segs(sx), segs(sy), segs(sz)), M, o);
}

function rbox(bag, M, sx, sy, sz, r, o) {
  return bag.add(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)), M, o);
}

function cylAB(bag, M, a, b, r, seg = 12, o = {}) {
  const d = V3().subVectors(b, a), len = d.length();
  if (len < 1e-5) return bag;
  const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, seg, o.hs ?? segs(len), !!o.open);
  if (o.inside) invert(g);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  const L = new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1));
  return bag.add(g, mul(M, L), o);
}

function torus(bag, M, R, r, o = {}) {
  return bag.add(new THREE.TorusGeometry(R, r, o.rs ?? 8, o.ts ?? Math.max(24, Math.round(R * 60)), o.arc ?? Math.PI * 2), M, o);
}

function plane(bag, M, w, h, o) {
  return bag.add(new THREE.PlaneGeometry(w, h, segs(w), segs(h)), M, o);
}

let LABEL_RIG = null;
function label(B, M, name, w, h, part) {
  let r = labelRect(name);
  if (part !== undefined) { const du = (r[2] - r[0]) / 4; r = [r[0] + du * part, r[1], r[0] + du * (part + 1), r[3]]; }
  return B.label.add(new THREE.PlaneGeometry(w, h), M, { rect: r, rig: LABEL_RIG });
}

function tubePath(bag, M, pts, r, o = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => p.clone()), false, 'catmullrom', 0.4);
  const len = curve.getLength();
  return bag.add(new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(len / 0.12)), r, o.rs ?? 6, false), M, o);
}

function flangeGeo(r0, r1, d, seg = 72) {
  const sh = new THREE.Shape(); sh.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, r0, 0, Math.PI * 2, true); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: seg });
  return g.rotateY(Math.PI / 2);
}

function vn3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const h = (a, b, c) => hash1((a * 73856093) ^ (b * 19349663) ^ (c * 83492791));
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf), sz = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), sx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), sx), sy), l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), sx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), sx), sy), sz);
}

function wearAt(list, x, y, z) {
  let w = 0;
  for (const e of list) {
    let d;
    if (e.ring) {
      const vx = x - e.c.x, vy = y - e.c.y, vz = z - e.c.z, a = vx * e.n.x + vy * e.n.y + vz * e.n.z;
      const rx = vx - a * e.n.x, ry = vy - a * e.n.y, rz = vz - a * e.n.z;
      d = Math.hypot(a, Math.hypot(rx, ry, rz) - e.R);
    } else {
      const abx = e.b.x - e.a.x, aby = e.b.y - e.a.y, abz = e.b.z - e.a.z, l2 = abx * abx + aby * aby + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((x - e.a.x) * abx + (y - e.a.y) * aby + (z - e.a.z) * abz) / l2));
      d = Math.hypot(x - e.a.x - abx * t, y - e.a.y - aby * t, z - e.a.z - abz * t);
    }
    if (d < e.r * 2.5) w = Math.max(w, Math.exp(-((d / e.r) ** 2)) * e.k);
  }
  return w;
}

function pillow(f, c) {
  const x = f < c ? (f / c) * 0.5 : 0.5 + ((f - c) / (1 - c)) * 0.5;
  return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), 0.62);
}

function padSurface(bag, na, nb, param, opt) {
  const k = opt.k, R = rand(opt.seed || 1), puff = (opt.puff ?? 0.022) * 1.45, skip = opt.skip;
  const P = { p: V3(), n: V3(), ta: V3(), tb: V3(), la: 0.26, lb: 0.26 };
  const cr = V3();
  const e = 0.5 / k;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const rv = [R(), R(), R(), R(), R(), R(), R()];
      if (skip && skip(i + 0.5, j + 0.5)) continue;
      const pf = puff * (0.7 + 0.6 * rv[0]), vx = rv[1] < 0.5 ? 0 : 1, vy = rv[2] < 0.5 ? 0 : 1, fu0 = rv[3] < 0.5, fv0 = rv[4] < 0.5;
      const cu = 0.5 + (rv[5] - 0.5) * 0.16, cv = 0.5 + (rv[6] - 0.5) * 0.16, tint = 0.95 + 0.05 * rv[0], warm = (rv[6] - 0.5) * 0.02;
      param(i + 0.5, j + 0.5, P);
      cr.crossVectors(P.ta, P.tb);
      const flip = cr.dot(P.n) < 0;
      const base = bag.n;
      for (let q = 0; q <= k; q++) {
        for (let r = 0; r <= k; r++) {
          const fu = q / k, fv = r / k;
          param(i + fu, j + fv, P);
          const bu = pillow(fu, cu), bv = pillow(fv, cv);
          const d = pf * bu * bv;
          const du = pf * (pillow(Math.min(1, fu + e), cu) - pillow(Math.max(0, fu - e), cu)) / (Math.min(1, fu + e) - Math.max(0, fu - e)) * bv;
          const dv = pf * (pillow(Math.min(1, fv + e), cv) - pillow(Math.max(0, fv - e), cv)) / (Math.min(1, fv + e) - Math.max(0, fv - e)) * bu;
          const sa = du / P.la, sb = dv / P.lb;
          _w.copy(P.n).addScaledVector(P.ta, -sa).addScaledVector(P.tb, -sb).normalize();
          const uu = vx * 0.5 + (0.004 + 0.992 * (fu0 ? 1 - fu : fu)) * 0.5, ww = vy * 0.5 + (0.004 + 0.992 * (fv0 ? 1 - fv : fv)) * 0.5;
          bag.vtx(P.p.x + P.n.x * d, P.p.y + P.n.y * d, P.p.z + P.n.z * d, _w.x, _w.y, _w.z, uu, ww, tint + warm, tint, tint - warm);
        }
      }
      for (let q = 0; q < k; q++) {
        for (let r = 0; r < k; r++) {
          const a = base + q * (k + 1) + r, b = a + (k + 1), c = b + 1, d2 = a + 1;
          if (flip) bag.I.push(a, c, b, a, d2, c); else bag.I.push(a, b, c, a, c, d2);
        }
      }
    }
  }
}

const PROFILE = (() => {
  const segsP = [];
  const wallN = 7, filN = 4, ceilN = 12;
  const wl = (WALL_TOP - KICK) / wallN, fl = (Math.PI / 2 * FIL) / filN, cl = ((HW - FIL) * 2) / ceilN;
  segsP.push({ n: wallN, f: (t) => ({ y: KICK + t * wl, z: -HW, ny: 0, nz: 1, ty: 1, tz: 0, l: wl }) });
  segsP.push({ n: filN, f: (t) => { const a = Math.PI - (t / filN) * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return { y: WALL_TOP + FIL * s, z: -HW + FIL + FIL * c, ny: -s, nz: -c, ty: -c, tz: s, l: fl }; } });
  segsP.push({ n: ceilN, f: (t) => ({ y: H, z: -HW + FIL + t * cl, ny: -1, nz: 0, ty: 0, tz: 1, l: cl }) });
  segsP.push({ n: filN, f: (t) => { const a = Math.PI / 2 - (t / filN) * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return { y: WALL_TOP + FIL * s, z: HW - FIL + FIL * c, ny: -s, nz: -c, ty: -c, tz: s, l: fl }; } });
  segsP.push({ n: wallN, f: (t) => ({ y: WALL_TOP - t * wl, z: HW, ny: 0, nz: -1, ty: -1, tz: 0, l: wl }) });
  const total = segsP.reduce((a, s) => a + s.n, 0);
  const at = (b) => {
    let acc = 0;
    for (let i = 0; i < segsP.length; i++) {
      const s = segsP[i];
      if (b <= acc + s.n || i === segsP.length - 1) return s.f(Math.min(s.n, Math.max(0, b - acc)));
      acc += s.n;
    }
    return null;
  };
  return { total, at, wallN, filN, ceilN };
})();

function surfaceAt(x, b, off = 0.012) {
  if (b < 0) {
    const z = -HW + Math.min(-b, 18) * TILE;
    return { p: V3(x, 0.012 + off * 0.2, z), n: V3(0, 1, 0) };
  }
  const q = PROFILE.at(Math.min(b, PROFILE.total));
  return { p: V3(x, q.y + q.ny * off, q.z + q.nz * off), n: V3(0, q.ny, q.nz) };
}

function createMaterials(renderer, q, U) {
  const texSize = q === 'high' || q === 'ultra' ? 2048 : 1024;
  const aniso = renderer?.capabilities ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const pad = padTextures(texSize);
  const grate = grateTextures(q === 'low' ? 512 : 1024);
  const fab = fabricTextures(512);
  const grime = grimeTextures(1024);
  const tex = {
    padMap: dataTex(pad.map, texSize, { srgb: true, aniso }),
    padNormal: dataTex(pad.normal, texSize, { aniso }),
    grateMap: null, grateOrm: null, grateNormal: null,
    fabNormal: dataTex(fab.normal, 512, { repeat: 0.25, aniso }),
    grimeMap: dataTex(grime.map, 1024, { srgb: true, repeat: 1.3, aniso }),
    grimeOrm: dataTex(grime.orm, 1024, { repeat: 1.3, aniso }),
    frost: dataTex(frostTexture(256), 256, { aniso }),
    frostX: null,
  };
  const gs = q === 'low' ? 512 : 1024;
  tex.grateMap = dataTex(grate.map, gs, { srgb: true, repeat: 0.5, aniso });
  const FW = q === 'low' ? 1536 : q === 'medium' ? 2048 : 4096, FH = Math.round(FW * 0.78 / 2.19);
  {
    const fd = frostLid(FW, FH);
    const t = new THREE.DataTexture(fd, FW, FH, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = renderer?.capabilities ? renderer.capabilities.getMaxAnisotropy() : 8; t.needsUpdate = true;
    t.userData.size = FW;
    tex.frostX = t;
    tex.drops = dataTex(dropTexture(512), 512, { aniso: 8 });
  }
  tex.grateOrm = dataTex(grate.orm, gs, { repeat: 0.5, aniso });
  tex.grateNormal = dataTex(grate.normal, gs, { repeat: 0.5, aniso });
  tex.padMap.repeat.set(1, 1); tex.padNormal.repeat.set(1, 1);
  const atlasCanvas = labelAtlas();
  tex.atlas = atlasCanvas ? new THREE.CanvasTexture(atlasCanvas) : new THREE.Texture();
  tex.atlas.colorSpace = THREE.SRGBColorSpace; tex.atlas.anisotropy = aniso;
  const tallyCanvas = makeTallyCanvas();
  tex.tally = tallyCanvas ? new THREE.CanvasTexture(tallyCanvas) : new THREE.Texture();
  tex.tally.colorSpace = THREE.SRGBColorSpace; tex.tally.anisotropy = aniso;
  tex.tallyCanvas = tallyCanvas;

  const shadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment.replace(/(float getShadow\([^)]*\)\s*\{\s*float shadow = )1\.0;/g, '$10.0;');
  const NOISE = `
varying vec3 vEPos; varying vec3 vENrm;
uniform float uHaze; uniform vec3 uHazeCol; uniform float uFrost;
uniform float uDustF; uniform float uGrime; uniform float uYellow; uniform float uCondense; uniform vec3 uHatchP[10]; uniform float uStain; uniform float uPeel;
float eh3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float en3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eh3(i), eh3(i + vec3(1,0,0)), f.x), mix(eh3(i + vec3(0,1,0)), eh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(eh3(i + vec3(0,0,1)), eh3(i + vec3(1,0,1)), f.x), mix(eh3(i + vec3(0,1,1)), eh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
  const patch = (m, { frost = false, key }) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHaze = U.haze; sh.uniforms.uHazeCol = U.hazeCol; sh.uniforms.uFrost = frost ? U.frost : U.zero;
      sh.uniforms.uStain = U.stain; sh.uniforms.uPeel = U.peel; sh.uniforms.uDustF = U.dustF; sh.uniforms.uGrime = U.grime; sh.uniforms.uYellow = U.yellow; sh.uniforms.uCondense = U.condense; sh.uniforms.uHatchP = U.hatchP;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEPos; varying vec3 vENrm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEPos = transformed; vENrm = objectNormal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + NOISE)
        .replace('#include <shadowmap_pars_fragment>', shadowChunk)
        .replace('#include <color_fragment>', `#include <color_fragment>
float frostM = 0.0;
if (uFrost > 0.001) { float fn = en3(vEPos * 7.0) * 0.45 + en3(vEPos * 43.0) * 0.35 + en3(vEPos * 151.0) * 0.2; frostM = smoothstep(1.0 - uFrost, 1.0 - uFrost + 0.4, fn) * (0.55 + 0.45 * en3(vEPos * 151.0 + 7.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.76, 0.82), frostM * 0.6); }
float ringR = length(vEPos.xy);
vec3 eUp = ringR > 20.0 ? -vec3(vEPos.xy / ringR, 0.0) : vec3(0.0);
float dnz = en3(vEPos * 11.0) * 0.55 + en3(vEPos * 57.0) * 0.45;
float upF = dot(normalize(vENrm), eUp);
#if defined(USE_COLOR) && defined(ENDI_PAD)
float aoV = clamp(dot(vColor.rgb, vec3(0.333)), 0.0, 1.0);
#else
float aoV = 1.0;
#endif
float dustM = uDustF * (smoothstep(0.3, 0.9, upF) * (0.5 + 0.5 * dnz) + smoothstep(0.85, 0.45, aoV) * smoothstep(-0.3, 0.6, upF) * 0.8);
dustM = clamp(dustM, 0.0, 1.0);
#ifdef ENDI_LABEL
if (uPeel > 0.01) { float pn = en3(vEPos * 23.0) * 0.6 + en3(vEPos * 71.0) * 0.4; if (pn < uPeel * 0.55) discard; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 0.82, 0.62), uPeel); }
#endif
float condM = 0.0;
#ifdef ENDI_PAD
{
  vec2 sf = fract(vMapUv * 2.0); vec2 se = min(sf, 1.0 - sf);
  float seam = 1.0 - smoothstep(0.0, 0.07, min(se.x, se.y));
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.9, 0.7), uYellow * (0.7 + 0.3 * dnz));
  diffuseColor.rgb *= 1.0 - uGrime * seam * (0.4 + 0.6 * dnz) * 0.6;
  float hd = 99.0;
  for (int i = 0; i < 10; i++) hd = min(hd, length(vEPos - uHatchP[i]));
  vec3 sq = vEPos - eUp * dot(vEPos, eUp) * 0.9;
  float streak = smoothstep(0.5, 0.78, en3(sq * 23.0)) * smoothstep(0.3, 0.7, en3(sq * 4.0 + 3.1));
  condM = uCondense * exp(-max(hd - 1.05, 0.0) / 0.45) * streak;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.79, 0.84), condM * 0.55);
}
#endif
{ float stn = en3(vEPos * 1.7 + 4.0) * 0.7 + en3(vEPos * 6.0) * 0.3; float stM = uStain * 0.6 * smoothstep(0.68, 0.71, stn) * (1.0 - smoothstep(0.73, 0.8, stn)) * (0.5 + 0.5 * dnz); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.52, 0.38), stM); }
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.48, 0.44), dustM * 0.85);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, frostM);\nroughnessFactor = mix(roughnessFactor, 0.97, dustM);\nroughnessFactor = mix(roughnessFactor, 0.18, condM);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, frostM);')
        .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, 1.0 - exp(-length(vViewPosition) * uHaze));\n#include <dithering_fragment>');
    };
    m.customProgramCacheKey = () => 'endi-' + key;
    if (key === 'pad') m.defines = { ...(m.defines || {}), ENDI_PAD: '' };
    if (key === 'label') m.defines = { ...(m.defines || {}), ENDI_LABEL: '' };
    return m;
  };
  const std = (o, p) => patch(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }), p);
  const M = {
    pad: std({ name: 'endi.pad', map: tex.padMap, normalMap: tex.padNormal, normalScale: new THREE.Vector2(1, 1), roughness: 0.86, metalness: 0 }, { key: 'pad' }),
    metal: std({ name: 'endi.metal', map: tex.grimeMap, roughnessMap: tex.grimeOrm, metalnessMap: tex.grimeOrm, roughness: 1.0, metalness: 0.85 }, { frost: true, key: 'metal' }),
    paint: std({ name: 'endi.paint', map: tex.grimeMap, roughnessMap: tex.grimeOrm, roughness: 0.75, metalness: 0 }, { frost: true, key: 'paint' }),
    fabric: std({ name: 'endi.fabric', normalMap: tex.fabNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92, metalness: 0 }, { key: 'fabric' }),
    grate: std({ name: 'endi.grate', map: tex.grateMap, roughnessMap: tex.grateOrm, metalnessMap: tex.grateOrm, normalMap: tex.grateNormal, roughness: 1, metalness: 1, alphaTest: 0.5, alphaToCoverage: true }, { frost: true, key: 'grate' }),
    label: std({ name: 'endi.label', map: tex.atlas, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, { key: 'label' }),
    tally: std({ name: 'endi.tally', map: tex.tally, roughness: 0.42, metalness: 0.55, vertexColors: false }, { key: 'tally' }),
    led: new THREE.MeshBasicMaterial({ name: 'endi.led', vertexColors: true, color: 0xffffff }),
    glass: new THREE.MeshStandardMaterial({ name: 'endi.screen', color: 0x030605, roughness: 0.12, metalness: 0, emissive: 0x000000 }),
    portSky: new THREE.MeshBasicMaterial({ name: 'endi.portSky', map: (() => { const c = makeCanvas(512, 512); if (!c) return null; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512); const R = rand(4747); for (let i = 0; i < 900; i++) { const b = Math.pow(R(), 3); x.fillStyle = `rgba(${215 + R() * 40},${220 + R() * 35},255,${0.15 + b * 0.85})`; const r0 = 0.5 + b * 1.3; x.beginPath(); x.arc(R() * 512, R() * 512, r0, 0, 7); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), color: new THREE.Color(0.9, 0.9, 0.95) }),
    port: new THREE.MeshStandardMaterial({ name: 'endi.porthole', color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false }),
    tube: new THREE.MeshBasicMaterial({ name: 'endi.tube', color: 0xffffff }),
    status: new THREE.MeshBasicMaterial({ name: 'endi.status', color: new THREE.Color(4, 1.7, 0.2) }),
    figure: std({ name: 'endi.figure', roughness: 0.9, metalness: 0, color: 0x8c9095 }, { key: 'figure' }),
  };
  M.podU = {
    uTA: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) }, uTB: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
    uTI: { value: new Array(6).fill(0) }, uGlowCol: { value: new THREE.Color(0.9, 0.96, 1.0) }, uTime: { value: 0 },
  };
  M.podGlass = [0, 1].map(i => {
    const uPF = { value: 1 }, uBreath = { value: 0 };
    const m = new THREE.MeshStandardMaterial({ name: 'endi.podFrost' + i, map: tex.frostX, normalMap: tex.frostX, color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, M.podU, { uPF, uBreath, tDrop: { value: tex.drops }, uBreathUV: { value: new THREE.Vector2(0.11, 0.5) }, uSize: { value: new THREE.Vector2(2.19, 0.78) }, uTile: { value: 0.3 } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uPF, uBreath, uTile, uTime; uniform vec2 uBreathUV, uSize; uniform sampler2D tDrop; uniform vec3 uTA[6], uTB[6], uGlowCol; uniform float uTI[6];
varying vec3 vWP;`)
        .replace('#include <map_fragment>', `vec2 gm = vMapUv * uSize;
vec4 F = texture2D(map, vMapUv, 0.6);
vec4 Fb = texture2D(map, vMapUv, 3.5);
vec4 Fbb = texture2D(map, vMapUv, 6.5);
vec2 bdv = (vMapUv - uBreathUV) * uSize;
float bg = exp(-dot(bdv, bdv) / 0.004);
float thr = 1.0 - uPF * 1.06 + bg * 0.35 * (1.0 - uPF * 0.8);
float present = smoothstep(thr - 0.04, thr + 0.05, F.a);
float presentB = smoothstep(thr - 0.1, thr + 0.1, Fb.a);
float cw = fwidth(F.r);
float cryst = mix(F.r, Fb.r * 1.4, smoothstep(0.15, 0.5, cw)) * present * step(0.001, uPF);
float film = clamp(Fb.r * 1.6 + Fbb.r * 1.1 + smoothstep(0.55, 1.0, uPF) * 0.45, 0.0, 1.0) * presentB * smoothstep(0.05, 0.6, uPF);
float wet = smoothstep(0.0, 0.2, uPF) * (1.0 - smoothstep(0.5, 0.85, uPF)) * clamp(Fbb.r * 2.5 + 0.15, 0.0, 1.0);
vec2 dUv = gm / 0.11;
float dpx = length(fwidth(dUv)) * 512.0;
float drop = texture2D(tDrop, dUv).r;
float runD = texture2D(tDrop, vec2(dUv.x * 0.6, dUv.y * 0.15 + uTime * 0.012)).r * smoothstep(0.45, 0.15, uPF);
float dw = fwidth(drop) * 1.5;
float dropM = wet * smoothstep(0.2 - dw, 0.55 + dw, max(drop, runD * 0.9)) * (1.0 - smoothstep(0.7, 1.8, dpx));
float fog = bg * uBreath;
float frostM = clamp(cryst * 1.1 + film * 0.55, 0.0, 1.0);
diffuseColor = vec4(vec3(0.42, 0.46, 0.5) * (0.6 + 0.4 * F.r), clamp(cryst * 0.85 + film * 0.62 + fog * 0.5 + dropM * (0.05 + 0.4 * smoothstep(0.75, 0.25, drop)), 0.0, 0.94));
float fts = 1.5 / ${(tex.frostX.userData.size || 2048).toFixed(1)};
float hx = texture2D(map, vMapUv + vec2(fts, 0.0), 1.0).r - texture2D(map, vMapUv - vec2(fts, 0.0), 1.0).r;
float hy = texture2D(map, vMapUv + vec2(0.0, fts * 2.81), 1.0).r - texture2D(map, vMapUv - vec2(0.0, fts * 2.81), 1.0).r;
float dts = 1.0 / 512.0;
float dxD = texture2D(tDrop, dUv + vec2(dts, 0.0)).r - texture2D(tDrop, dUv - vec2(dts, 0.0)).r;
float dyD = texture2D(tDrop, dUv + vec2(0.0, dts)).r - texture2D(tDrop, dUv - vec2(0.0, dts)).r;
vec3 podN = normalize(vec3((-hx * 1.6 + (F.g - 0.5) * 0.8) * present - dxD * 5.0 * dropM, (-hy * 1.6 + (fract(F.g * 7.31) - 0.5) * 0.8) * present - dyD * 5.0 * dropM, 1.0));`)
        .replace('#include <normal_fragment_maps>', '#ifdef USE_NORMALMAP_TANGENTSPACE\nnormal = normalize(tbn * podN);\n#endif')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.03 + cryst * 0.3 + film * 0.45 + fog * 0.5 - dropM * 0.02, 0.02, 1.0);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec3 glowS = vec3(0.0);
for (int i = 0; i < 6; i++) {
  vec3 ab = uTB[i] - uTA[i];
  float tt = clamp(dot(vWP - uTA[i], ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  vec3 Lv = uTA[i] + ab * tt - vWP;
  glowS += uGlowCol * uTI[i] / (dot(Lv, Lv) + 0.35);
}
float roomL = (uTI[0] + uTI[1] + uTI[2] + uTI[3] + uTI[4] + uTI[5]) / 6.0;
totalEmissiveRadiance += glowS * (cryst * 0.9 + film * 0.8 + fog * 0.6 + dropM * 0.1) * 0.011 + uGlowCol * roomL * (film * 0.004 + cryst * 0.005 + fog * 0.008);`);
    };
    m.customProgramCacheKey = () => 'endi-podfrost';
    m.userData.uPF = uPF; m.userData.uBreath = uBreath;
    return m;
  });
  M.podOuter = new THREE.MeshStandardMaterial({ name: 'endi.podOuter', color: 0x0a0d0f, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false });
  const plantPatch = (m, stem) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGrowth = U.growth; sh.uniforms.uDry = U.dry;
      if (stem) {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBirth;\nvarying float vBirth;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBirth = aBirth;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGrowth; uniform float uDry;\nvarying float vBirth;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vBirth > uGrowth) discard;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.15, 0.11) * (0.7 + 0.6 * fract(vBirth * 53.0)), smoothstep(0.2, 0.9, uDry));');
      } else {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aLeaf;\nuniform float uGrowth; uniform float uDry;\nvarying float vDryK; varying float vSeed;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
float growK = clamp((uGrowth - aLeaf.x) / 0.06, 0.0, 1.0);
float dryK = clamp(uDry * 1.25 - 0.25 + aLeaf.y * (0.3 + uDry * 0.7), 0.0, 1.0);
float ageK = smoothstep(0.3, 1.0, aLeaf.y) * smoothstep(0.25, 0.8, uGrowth) * 0.85;
vDryK = aLeaf.w > 0.5 ? max(aLeaf.y, dryK) : max(dryK, ageK);
float dropK = aLeaf.w > 0.5 ? 0.0 : smoothstep(0.8, 1.1, uDry * 0.6 + aLeaf.y * 0.6);
transformed.z += aLeaf.z * 1.8 * transformed.y * transformed.y + aLeaf.z * 0.12 * transformed.x;
transformed.z -= vDryK * 0.55 * transformed.x * transformed.x;
transformed.y *= 1.0 - vDryK * 0.4;
transformed *= growK * (1.0 - dropK);
vSeed = fract(aLeaf.x * 97.0 + aLeaf.y * 13.0);`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDryK; varying float vSeed;')
          .replace('#include <color_fragment>', `#include <color_fragment>
vec3 lc = diffuseColor.rgb;
lc = mix(lc, vec3(0.3, 0.25, 0.055) * (0.8 + 0.4 * vSeed), smoothstep(0.0, 0.42, vDryK));
lc = mix(lc, vec3(0.11, 0.06, 0.028) * (0.8 + 0.5 * vSeed), smoothstep(0.35, 0.72, vDryK));
lc = mix(lc, vec3(0.15, 0.115, 0.075) * (0.75 + 0.5 * vSeed), smoothstep(0.75, 1.0, vDryK));
diffuseColor.rgb = lc;`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, vDryK);');
      }
    };
    m.customProgramCacheKey = () => 'endi-plant-' + (stem ? 's' : 'l');
    return m;
  };
  M.leaf = plantPatch(new THREE.MeshStandardMaterial({ name: 'endi.leaf', color: 0xffffff, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }), false);
  M.stem = plantPatch(new THREE.MeshStandardMaterial({ name: 'endi.stem', color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0 }), true);
  M.tex = tex;
  return M;
}

const C = {
  white: [0.8, 0.79, 0.76], offwhite: [0.68, 0.67, 0.63], grey: [0.36, 0.37, 0.38], lgrey: [0.55, 0.56, 0.57], dgrey: [0.14, 0.145, 0.15], black: [0.035, 0.035, 0.038],
  alu: [0.82, 0.83, 0.85], steel: [0.55, 0.56, 0.58], dark: [0.2, 0.2, 0.21], brass: [0.75, 0.6, 0.38], yellow: [0.7, 0.48, 0.05], red: [0.5, 0.045, 0.035],
  cream: [0.74, 0.71, 0.62], blue: [0.12, 0.16, 0.22], navy: [0.06, 0.08, 0.12], olive: [0.22, 0.24, 0.16], tan: [0.45, 0.38, 0.28],
};
const LAYER_SPOT = 5, LAYER_SUN = 6, LAYER_PLANT = 7;
const LED = { amber: [5, 2.2, 0.35], cyan: [0.5, 3.2, 3.6], green: [0.6, 3.5, 0.9], white: [4, 4, 4], warm: [6, 4.6, 3.2], dim: [0.6, 0.3, 0.05] };

function aoBox(cx, hl, hw, h) {
  return (s, y, z, ns, ny, nz) => {
    const x = s - cx;
    let occ = 0;
    const pl = (d, px, py, pz) => { if (d < 1.5) occ += Math.exp(-Math.max(d, 0) / 0.38) * (1 - Math.max(0, ns * px + ny * py + nz * pz)); };
    pl(y, 0, 1, 0); pl(h - y, 0, -1, 0); pl(hw - z, 0, 0, -1); pl(hw + z, 0, 0, 1); pl(hl - x, -1, 0, 0); pl(hl + x, 1, 0, 0);
    return Math.max(0.5, 1 - 0.3 * occ);
  };
}

function aoTunnel(s0, s1) {
  return (s, y, z, ns, ny) => {
    let occ = Math.exp(-Math.max(y, 0) / 0.3) * (1 - Math.max(0, ny));
    occ += Math.exp(-Math.max(0, Math.min(s - s0, s1 - s)) / 0.4) * 0.6;
    const r = Math.hypot(y - HY, z);
    occ += Math.exp(-Math.max(0, TR - r) / 0.25) * 0.35 * (1 - Math.abs(ny));
    return Math.max(0.55, 1 - 0.3 * occ);
  };
}

function aoSpace(kind) {
  if (kind === 'spine') return (x, y, z) => { const r = Math.hypot(y, z); let occ = Math.exp(-Math.max(0, SR - r) / 0.2) * 0.3; occ += Math.exp(-Math.max(0, x - SPINE_X0) / 0.6) * 0.5 + Math.exp(-Math.max(0, SPINE_X1 - x) / 0.6) * 0.5; return Math.max(0.6, 1 - 0.3 * occ); };
  return (x, y, z) => { const r = Math.hypot(x, y); let occ = Math.exp(-Math.max(0, HUB_R - r) / 0.3) * Math.exp(-Math.max(0, HUB_HZ - Math.abs(z)) / 0.3) * 2; if (Math.abs(z) > HUB_HZ) occ += 0.3 * Math.exp(-Math.max(0, SR - r) / 0.2); return Math.max(0.55, 1 - 0.3 * occ); };
}

export async function createEnduranceInterior({ engine, quality } = {}) {
  const q = typeof quality === 'string' ? quality : (engine?.qualityName || 'high');
  const hiQ = q === 'high' || q === 'ultra';
  const K = hiQ ? 6 : q === 'medium' ? 4 : 3;
  const renderer = engine?.renderer || null;
  const U = {
    haze: { value: 0.004 }, hazeCol: { value: new THREE.Color(0.02, 0.022, 0.024) }, frost: { value: 0 }, zero: { value: 0 },
    growth: { value: 0.05 }, dry: { value: 0 },
    stain: { value: 0 }, peel: { value: 0 }, dustF: { value: 0 }, grime: { value: 0.15 }, yellow: { value: 0 }, condense: { value: 0 }, hatchP: { value: Array.from({ length: 10 }, () => new THREE.Vector3(0, 0, 1e4)) },
  };
  const M = createMaterials(renderer, q, U);
  let envTex = null;
  if (renderer && renderer.isWebGLRenderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    for (const k of ['pad', 'metal', 'paint', 'fabric', 'grate', 'label', 'tally', 'glass', 'port', 'figure', 'leaf', 'stem']) { M[k].envMap = envTex; }
    for (const m of M.podGlass) { m.envMap = envTex; m.envMapIntensity = 0.12; }
  }

  const group = new THREE.Group();
  group.name = 'EnduranceInterior';
  const anchors = {};
  const displaySlots = [];
  const interactables = [];
  const colliders = [];
  const walkable = [];
  const spaceColliders = [];
  const portholes = [];
  const tubes = [];
  const hatches = {};
  const zones = {};
  const zoneOrder = ['aft', 'lab', 't1', 'pod', 't2', 'engine', 't3', 'hab', 'fore', 'spine', 'hub'];
  const disposables = [];

  const mkZone = (id, ring, ao, extra = {}) => {
    const z = { id, ring, meshes: [], objects: [], tubes: [], lights: [], spots: [], wear: [], ...extra };
    z.ao = (x, y, zz, nx, ny, nz) => {
      const a = ao(x, y, zz, nx, ny, nz);
      if (!z.wear.length) return a;
      const w = wearAt(z.wear, x, y, zz);
      if (w < 0.01) return a;
      return a * (1 - 0.42 * w * (0.3 + 0.7 * vn3(x * 7, y * 7, zz * 7)) * (0.5 + 0.5 * vn3(x * 29 + 5, y * 29, zz * 29)));
    };
    z.B = {};
    for (const k of ['pad', 'metal', 'paint', 'fabric', 'grate', 'label', 'led']) z.B[k] = new Bag(z);
    zones[id] = z;
    return z;
  };

  const E = (zone, Mu) => {
    if (!zone.ring) return Mu.clone();
    const p = V3().setFromMatrixPosition(Mu);
    const R = Mu.clone().setPosition(0, 0, 0);
    return ringMatrix(p.x, p.y, p.z).multiply(R);
  };
  const mount = (zone, Mu, name, rig) => {
    const o = new THREE.Group();
    o.name = name || '';
    o.matrixAutoUpdate = false;
    o.matrix.copy(rig && zone.ring ? mul(rig, Mu) : E(zone, Mu));
    o.matrixWorldNeedsUpdate = true;
    group.add(o);
    zone.objects.push(o);
    return o;
  };
  const meshFromBags = (bags, parent, opts = {}) => {
    const out = [];
    for (const [k, bag] of Object.entries(bags)) {
      const g = bag.build();
      if (!g) continue;
      const m = new THREE.Mesh(g, M[k]);
      m.castShadow = k !== 'led' && k !== 'label';
      m.receiveShadow = k !== 'led';
      if (m.castShadow) { m.layers.enable(LAYER_SUN); if (k !== 'pad') m.layers.enable(LAYER_SPOT); }
      parent.add(m);
      disposables.push(g);
      out.push(m);
    }
    return out;
  };
  const localBags = (zoneLike) => { const B = {}; for (const k of ['pad', 'metal', 'paint', 'fabric', 'grate', 'label', 'led']) B[k] = new Bag(zoneLike); return B; };
  const LOCAL = { ring: false, ao: null };

  const addTube = (zone, A, Bv, L) => {
    const t = { index: tubes.length, zone: zone.id, a: A, b: Bv, light: L, warm: 1, dead: false, seed: hash1(tubes.length * 7 + 3), level: 1 };
    tubes.push(t); zone.tubes.push(t);
    return t;
  };

  const tubeFixture = (zone, Mu, len, o = {}) => {
    const B = zone.B, rig = zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null;
    const op = { rig };
    if (o.stand) {
      for (const sx of [-1, 1]) {
        cylAB(B.metal, Mu, V3(sx * (len / 2 - 0.08), 0, -0.04), V3(sx * (len / 2 - 0.08), 0, -0.04 - (0.2 + sx * 0.12)), 0.012, 8, { ...op, color: C.steel });
      }
    }
    rbox(B.paint, mul(Mu, T(0, 0, -0.028)), len + 0.08, 0.085, 0.022, 0.008, { ...op, color: C.white });
    box(B.metal, mul(Mu, T(0, 0, -0.012)), len - 0.02, 0.05, 0.004, { ...op, color: C.alu });
    for (const sx of [-1, 1]) {
      rbox(B.paint, mul(Mu, T(sx * (len / 2 + 0.015), 0, 0)), 0.05, 0.06, 0.06, 0.01, { ...op, color: C.lgrey });
      cylAB(B.metal, Mu, V3(sx * (len / 2 - 0.005), 0, 0), V3(sx * (len / 2 + 0.01), 0, 0), 0.024, 12, { ...op, color: C.steel });
      box(B.paint, mul(Mu, T(sx * (len / 2 - 0.1), 0, -0.05)), 0.03, 0.04, 0.05, { ...op, color: C.grey });
    }
    for (const sx of [-0.3, 0, 0.3]) box(B.metal, mul(Mu, T(sx * len, 0, 0.028)), 0.006, 0.05, 0.006, { ...op, color: C.steel, ao: 0.8 });
    const W = rig ? mul(rig, Mu) : Mu;
    return addTube(zone, V3(-len / 2, 0, 0).applyMatrix4(W), V3(len / 2, 0, 0).applyMatrix4(W), V3(0, 0, 0.16).applyMatrix4(W));
  };

  const handrail = (zone, bag, Mu, len, o = {}) => {
    const rig = o.rigid && zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null;
    zone.wear.push({ a: V3(-len / 2, 0, 0.07).applyMatrix4(Mu), b: V3(len / 2, 0, 0.07).applyMatrix4(Mu), r: 0.28, k: 0.9 });
    cylAB(bag, Mu, V3(-len / 2, 0, 0.07), V3(len / 2, 0, 0.07), 0.016, 10, { color: o.color || C.lgrey, rig });
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.06 + (i / (n - 1)) * (len - 0.12);
      cylAB(bag, Mu, V3(x, 0, 0), V3(x, 0, 0.07), 0.011, 8, { color: C.steel, rig });
      cylAB(bag, Mu, V3(x, 0, -0.004), V3(x, 0, 0.008), 0.03, 12, { color: C.steel, rig });
    }
  };

  const cableRun = (zone, Mu, len, n, seed, o = {}) => {
    const R = rand(seed), B = zone.B;
    const clipStep = 0.5;
    for (let c = 0; c < n; c++) {
      const off = V3((R() - 0.5) * 0.02, (c % 3 - 1) * 0.022 + (R() - 0.5) * 0.004, 0.02 + Math.floor(c / 3) * 0.022);
      const pts = [];
      for (let x = -len / 2; x <= len / 2 + 1e-6; x += clipStep / 2) {
        const mid = Math.abs(((x + len / 2) % clipStep) - clipStep / 2) < 0.13;
        pts.push(V3(x, off.y - (mid ? 0.012 + R() * 0.01 : 0), off.z + (mid ? R() * 0.008 : 0)));
      }
      const col = [C.black, C.dgrey, C.grey, C.white, C.yellow, C.dgrey][Math.floor(R() * 6)];
      tubePath(B.paint, Mu, pts, 0.007 + R() * 0.005, { color: col, rs: 5 });
    }
    for (let x = -len / 2 + 0.1; x < len / 2; x += clipStep) box(B.metal, mul(Mu, T(x, 0, 0.03)), 0.025, 0.09, 0.07, { color: C.steel, ao: 0.8 });
    if (o.tray) for (const sy of [-1, 1]) box(B.metal, mul(Mu, T(0, sy * 0.055, 0.03)), len, 0.006, 0.07, { color: C.steel });
  };

  const cryoBag = (zone, Mu, len, rad, seed, o = {}) => {
    const R = rand(seed), B = zone.B;
    const rig = zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null;
    const nL = 72, nA = 26;
    const straps = o.straps || [0.16, 0.37, 0.6, 0.83];
    const pos = [], col = [], idx = [];
    const ph = Array.from({ length: 8 }, () => R() * 6.28);
    const redA = o.white ? -1 : 0.3 + R() * 0.08, redB = o.white ? 2 : 0.82 - R() * 0.1, band = !o.white && R() < 0.6;
    const flat = 0.56 + R() * 0.1, sag = (R() - 0.3) * 0.05, bend = (R() - 0.5) * 0.08;
    const prof = (t) => {
      const e = Math.abs(2 * t - 1);
      let rp = rad * Math.pow(Math.max(0, 1 - Math.pow(e, 40)), 0.12);
      rp *= 1 - 0.3 * Math.pow(Math.max(0, e - 0.95) / 0.05, 1.5);
      for (const st of straps) rp *= 1 - 0.16 * Math.exp(-(((t - st) / 0.012) ** 2));
      rp *= 1 + 0.06 * Math.sin(t * 9 + ph[0]) * Math.sin(t * 4 + ph[1]);
      rp *= 1 - 0.045 * Math.pow(Math.abs(Math.sin(t * len * 9 + ph[2])), 6);
      return rp;
    };
    for (let i = 0; i <= nL; i++) {
      const t = i / nL;
      const rp = prof(t);
      const red = t < redA || t > redB || (band && Math.abs(t - 0.5) < 0.025);
      const cc = red ? [0.33, 0.035, 0.028] : (Math.abs(t - 0.5) < 0.09 && o.patch ? [0.66, 0.65, 0.61] : [0.72, 0.71, 0.67]);
      const piping = Math.abs(t - redA) < 0.006 || Math.abs(t - redB) < 0.006;
      for (let j = 0; j <= nA; j++) {
        const a = (j / nA) * Math.PI * 2;
        const wob = 1 + 0.05 * Math.sin(a * 2 + ph[3]) + 0.035 * Math.sin(a * 3 + t * 13 + ph[4]) - 0.05 * Math.pow(Math.abs(Math.sin(a * 3 + t * 21 + ph[5])), 12) - 0.035 * Math.pow(Math.abs(Math.sin(t * 37 + a * 2 + ph[6])), 14);
        const r = rp * wob;
        const zz = Math.sin(a) * r * flat;
        pos.push(t * len, Math.cos(a) * r + bend * Math.sin(Math.PI * t), (zz < 0 ? zz * 0.55 : zz) + sag * Math.sin(Math.PI * t) + rad * flat * 0.45);
        const sh = piping ? 0.25 : 0.93 + 0.12 * R();
        col.push(cc[0] * sh, cc[1] * sh, cc[2] * sh);
      }
    }
    for (let i = 0; i < nL; i++) for (let j = 0; j < nA; j++) { const a2 = i * (nA + 1) + j, b2 = a2 + nA + 1; idx.push(a2, a2 + 1, b2, b2, a2 + 1, b2 + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    B.fabric.add(g, Mu, { rig, uvScale: 1 });
    const zc = rad * flat * 0.45;
    for (const st of straps) {
      const r = prof(st) * 0.97;
      const sg = new THREE.TorusGeometry(1, 0.014 / r, 4, 30).scale(r, r, r * flat).rotateY(Math.PI / 2);
      B.fabric.add(sg, mul(Mu, T(st * len, 0, zc)), { rig, color: [0.42, 0.42, 0.4] });
      box(B.metal, mul(Mu, T(st * len, 0, zc + r * flat + 0.006)), 0.034, 0.05, 0.012, { rig, color: C.steel });
      for (const sy of [-1, 1]) {
        box(B.fabric, mul(Mu, T(st * len, sy * (r + 0.04), 0.01)), 0.03, 0.09, 0.006, { rig, color: [0.38, 0.38, 0.36] });
        box(B.metal, mul(Mu, T(st * len, sy * (r + 0.09), 0.004)), 0.05, 0.03, 0.012, { rig, color: C.dark });
      }
    }
    if (o.patch) label(B, mul(Mu, T(len * 0.5, 0, zc + rad * flat + 0.004)), o.patch, rad * 1.1, rad * 0.45);
    zone.wear.push({ a: V3(0, 0, 0).applyMatrix4(Mu), b: V3(len, 0, 0).applyMatrix4(Mu), r: 0.32, k: 0.45 });
  };

  const softBox = (zone, Mu, sx, sy, sz, color, seed) => {
    const R = rand(seed), B = zone.B;
    const rig = zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null;
    const g = new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(sx, sy, sz) * 0.22);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = 1 + 0.035 * Math.sin(x * 23 + y * 11 + seed) + 0.02 * Math.sin(z * 31 + x * 7);
      p.setXYZ(i, x * w, y * (1 + (R() - 0.5) * 0.01), z * w);
    }
    g.computeVertexNormals();
    B.fabric.add(g, Mu, { rig, color });
    for (const sx2 of [-0.3, 0.3]) box(B.fabric, mul(Mu, T(sx2 * sx, 0, 0)), 0.035, sy * 1.02, sz * 1.02, { rig, color: C.dgrey });
  };

  const toggles = (zone, Mu, n, dir, o = {}) => {
    const B = zone.B, rig = o.rig;
    for (let i = 0; i < n; i++) {
      const p = dir === 'v' ? T(0, -i * (o.pitch || 0.07), 0) : T(i * (o.pitch || 0.06), 0, 0);
      const Mi = mul(Mu, p);
      box(B.paint, mul(Mi, T(0, 0, 0.004)), 0.034, 0.026, 0.008, { rig, color: C.dgrey });
      cylAB(B.metal, Mi, V3(0, 0, 0.006), V3(0, 0.008, 0.032), 0.0035, 8, { rig, color: C.alu });
      B.metal.add(new THREE.SphereGeometry(0.0055, 8, 6), mul(Mi, T(0, 0.009, 0.034)), { rig, color: C.alu });
      if (o.guard !== false) {
        B.paint.add(new THREE.TorusGeometry(0.02, 0.0032, 6, 14, Math.PI), mul(Mi, T(0, 0.0, 0.006, Math.PI / 2, 0, 0)), { rig, color: C.cream });
        for (const sx of [-1, 1]) cylAB(B.paint, Mi, V3(sx * 0.02, 0, 0.006), V3(sx * 0.02, -0.018, 0.006), 0.0032, 6, { rig, color: C.cream });
      }
      if (o.leds && i % 2 === 0) B.led.add(new THREE.CircleGeometry(0.004, 8), mul(Mi, T(0.026, 0.008, 0.0085)), { rig, color: hash1(i + (o.seed || 0)) < 0.7 ? LED.amber : LED.green });
    }
  };

  const crtBezel = (zone, Mu, w, h, slotId, kind, rigIn) => {
    const B = zone.B, rig = rigIn !== undefined ? rigIn : (zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null);
    const fw = 0.045;
    const sh = new THREE.Shape();
    const rr = 0.03, W2 = w / 2 + fw, H2 = h / 2 + fw;
    sh.moveTo(-W2 + rr, -H2); sh.lineTo(W2 - rr, -H2); sh.quadraticCurveTo(W2, -H2, W2, -H2 + rr); sh.lineTo(W2, H2 - rr); sh.quadraticCurveTo(W2, H2, W2 - rr, H2); sh.lineTo(-W2 + rr, H2); sh.quadraticCurveTo(-W2, H2, -W2, H2 - rr); sh.lineTo(-W2, -H2 + rr); sh.quadraticCurveTo(-W2, -H2, -W2 + rr, -H2);
    const hole = new THREE.Path();
    const ir = 0.018, w2 = w / 2, h2 = h / 2;
    hole.moveTo(-w2 + ir, -h2); hole.lineTo(w2 - ir, -h2); hole.quadraticCurveTo(w2, -h2, w2, -h2 + ir); hole.lineTo(w2, h2 - ir); hole.quadraticCurveTo(w2, h2, w2 - ir, h2); hole.lineTo(-w2 + ir, h2); hole.quadraticCurveTo(-w2, h2, -w2, h2 - ir); hole.lineTo(-w2, -h2 + ir); hole.quadraticCurveTo(-w2, -h2, -w2 + ir, -h2);
    sh.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
    B.metal.add(eg, mul(Mu, T(0, 0, 0.0)), { rig, color: kind === 'brass' ? C.brass : C.alu });
    for (const [sx, sy, sw, shh] of [[0, h2 + 0.002, w, 0.004], [0, -h2 - 0.002, w, 0.004], [w2 + 0.002, 0, 0.004, h], [-w2 - 0.002, 0, 0.004, h]]) box(B.paint, mul(Mu, T(sx, sy, -0.02)), sw + 0.004, shh + 0.004, 0.07, { rig, color: C.black });
    for (const [sx, sy] of [[-W2 + 0.015, -H2 + 0.015], [W2 - 0.015, -H2 + 0.015], [-W2 + 0.015, H2 - 0.015], [W2 - 0.015, H2 - 0.015]]) cylAB(B.metal, Mu, V3(sx, sy, 0.035), V3(sx, sy, 0.045), 0.0055, 8, { rig, color: C.steel });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
    disposables.push(glass.geometry);
    const o = mount(zone, mul(Mu, T(0, 0, 0.004)), 'slot.' + slotId, rig);
    o.add(glass);
    glass.receiveShadow = true;
    glass.userData.slotId = slotId;
    displaySlots.push({ id: slotId, mesh: glass, width: w, height: h, kind: kind === 'status' ? 'status' : 'crt', zone: zone.id });
  };

  const rackPanel = (zone, Mu, w, h, seed, rig) => {
    const R = rand(seed), B = zone.B;
    let y = h / 2;
    while (y > -h / 2 + 0.04) {
      const uh = Math.min(y + h / 2, [0.045, 0.09, 0.135][Math.floor(R() * 3)]);
      const cy = y - uh / 2;
      const kind = R();
      box(B.paint, mul(Mu, T(0, cy, 0.006)), w - 0.01, uh - 0.004, 0.012, { rig, color: R() < 0.5 ? C.dgrey : [0.1, 0.105, 0.11] });
      for (const sx of [-1, 1]) cylAB(B.metal, Mu, V3(sx * (w / 2 - 0.018), cy, 0.012), V3(sx * (w / 2 - 0.018), cy, 0.017), 0.004, 6, { rig, color: C.alu });
      if (kind < 0.3) {
        const nk = Math.floor(w / 0.07);
        for (let i = 0; i < nk; i++) {
          const x = -w / 2 + 0.06 + i * ((w - 0.12) / Math.max(1, nk - 1));
          cylAB(B.paint, Mu, V3(x, cy, 0.012), V3(x, cy, 0.032), 0.011, 12, { rig, color: C.black });
          box(B.metal, mul(Mu, T(x, cy + 0.006, 0.033)), 0.002, 0.008, 0.002, { rig, color: C.alu });
        }
      } else if (kind < 0.55) {
        const nk = Math.floor((w - 0.08) / 0.03);
        for (let i = 0; i < nk; i++) B.led.add(new THREE.CircleGeometry(0.0045, 8), mul(Mu, T(-w / 2 + 0.05 + i * 0.03, cy, 0.0125)), { rig, color: R() < 0.12 ? LED.amber : R() < 0.4 ? LED.green : LED.dim });
        label(B, mul(Mu, T(0, cy - uh * 0.28, 0.0125)), 'panelA', w * 0.8, uh * 0.3);
      } else if (kind < 0.75) {
        toggles(zone, mul(Mu, T(-w / 2 + 0.05, cy, 0.012)), Math.floor((w - 0.06) / 0.05), 'h', { rig, guard: false, pitch: 0.05, leds: true, seed });
      } else if (kind < 0.88) {
        label(B, mul(Mu, T(0, cy, 0.0125)), 'grill', w * 0.85, uh * 0.7);
      } else {
        label(B, mul(Mu, T(-w * 0.2, cy, 0.0125)), 'dial', uh * 3.6, uh * 0.85);
        label(B, mul(Mu, T(w * 0.3, cy, 0.0125)), 'panelB', w * 0.35, uh * 0.6);
      }
      y -= uh;
    }
  };

  const consoleUnit = (zone, Mu, w, h, cols, o = {}) => {
    const B = zone.B, rig = zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null;
    const prevRig = LABEL_RIG; LABEL_RIG = rig;
    const d = o.depth ?? 0.26;
    box(B.paint, mul(Mu, T(0, h / 2, d / 2)), w, h, d, { rig, color: [0.07, 0.075, 0.08] });
    for (const sx of [-1, 1]) {
      box(B.metal, mul(Mu, T(sx * (w / 2 - 0.012), h / 2, d + 0.008)), 0.024, h, 0.016, { rig, color: C.steel });
      for (let yy = 0.04; yy < h; yy += 0.0445) cylAB(B.metal, Mu, V3(sx * (w / 2 - 0.012), yy, d + 0.014), V3(sx * (w / 2 - 0.012), yy, d + 0.018), 0.0035, 6, { rig, color: C.dark });
    }
    box(B.metal, mul(Mu, T(0, h + 0.012, d / 2)), w + 0.02, 0.024, d + 0.02, { rig, color: C.steel });
    box(B.paint, mul(Mu, T(0, 0.05, d / 2 + 0.005)), w - 0.04, 0.1, d, { rig, color: C.black });
    const total = cols.reduce((a, c) => a + c.w, 0);
    let x = -w / 2 + 0.03;
    const inner = w - 0.06;
    for (const c of cols) {
      const cw = (c.w / total) * inner, cx = x + cw / 2;
      const y0 = c.y0 ?? 0.14, y1 = c.y1 ?? h - 0.02, ch = y1 - y0, cy = (y0 + y1) / 2;
      const F = mul(Mu, T(cx, cy, d));
      if (c.t === 'toggles') {
        box(B.paint, mul(F, T(0, 0, 0.004)), cw - 0.01, ch, 0.008, { rig, color: [0.12, 0.125, 0.13] });
        const n = Math.floor((ch - 0.06) / 0.075);
        const nc = Math.max(1, Math.floor(cw / 0.07));
        for (let k = 0; k < nc; k++) toggles(zone, mul(F, T(-cw / 2 + cw / (nc * 2) + k * (cw / nc), ch / 2 - 0.05, 0.008)), n, 'v', { rig, pitch: 0.075, leds: true, seed: (o.seed || 0) + k });
        for (let k = 0; k < n; k += 2) label(B, mul(F, T(0, ch / 2 - 0.085 - k * 0.075, 0.0085)), 'panelC', cw * 0.9, 0.018);
      } else if (c.t === 'crt') {
        box(B.paint, mul(F, T(0, 0, 0.004)), cw - 0.005, ch, 0.008, { rig, color: [0.09, 0.095, 0.1] });
        const sw = c.sw ?? Math.min(cw - 0.12, (ch - 0.14) * 1.25), sh = c.sh ?? sw * 0.78;
        crtBezel(zone, mul(F, T(0, c.dy ?? ch * 0.08, 0.012)), sw, sh, c.slot, c.kind || 'alu', rig);
        const by = (c.dy ?? ch * 0.08) - sh / 2 - 0.08;
        if (by > -ch / 2 + 0.03) {
          const nb = Math.floor((cw - 0.06) / 0.04);
          for (let k = 0; k < nb; k++) box(B.paint, mul(F, T(-cw / 2 + 0.05 + k * 0.04, by, 0.016)), 0.028, 0.022, 0.016, { rig, color: k % 4 === 0 ? C.cream : C.dgrey });
          label(B, mul(F, T(0, by - 0.03, 0.0085)), 'panelA', cw * 0.8, 0.02);
        }
      } else if (c.t === 'rack') {
        rackPanel(zone, F, cw, ch, (o.seed || 0) + Math.round(cx * 100), rig);
      } else if (c.t === 'gauges') {
        box(B.paint, mul(F, T(0, 0, 0.004)), cw - 0.01, ch, 0.008, { rig, color: C.dgrey });
        const n = Math.floor(ch / 0.12);
        for (let k = 0; k < n; k++) {
          const gy = ch / 2 - 0.07 - k * 0.12;
          cylAB(B.metal, F, V3(0, gy, 0.008), V3(0, gy, 0.03), 0.045, 24, { rig, color: C.alu });
          torus(B.metal, mul(F, T(0, gy, 0.03)), 0.043, 0.004, { rig, color: C.steel, ts: 24, rs: 5 });
          label(B, mul(F, T(0, gy, 0.0305)), 'dial', 0.076, 0.076, k % 4);
        }
      }
      x += cw;
    }
    if (o.title) label(B, mul(Mu, T(0, h - 0.035, d + 0.017)), o.title, Math.min(0.4, w * 0.4), 0.04);
    const corners = [];
    for (const cx of [-w / 2, w / 2]) for (const cy of [0, h]) for (const cz of [0, d + 0.05]) corners.push(V3(cx, cy, cz).applyMatrix4(Mu));
    LABEL_RIG = prevRig;
    return corners;
  };

  const addCollider = (list, pts, pad = 0) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) { const a = p.toArray(); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a[i] - pad); mx[i] = Math.max(mx[i], a[i] + pad); } }
    list.push({ min: mn, max: mx });
  };
  const boxCollider = (list, cx, cy, cz, sx, sy, sz, id) => { const c = { min: [cx - sx / 2, cy - sy / 2, cz - sz / 2], max: [cx + sx / 2, cy + sy / 2, cz + sz / 2] }; if (id) c.id = id; list.push(c); return c; };

  const wallM = (sigma, s, y, off = 0) => {
    const w = V3(0, 0, -sigma), v = V3(0, 1, 0), u = V3().crossVectors(v, w);
    return new THREE.Matrix4().makeBasis(u, v, w).setPosition(s, y, sigma * (HW - off));
  };

  const doorGeometry = (r) => {
    const B = localBags(LOCAL);
    const ax = T(0, 0, 0, 0, 0, Math.PI / 2);
    B.paint.add(new THREE.CylinderGeometry(r, r, 0.07, 64, 1), mul(ax), { color: [0.11, 0.115, 0.12] });
    B.paint.add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.02, 64, 1), mul(T(0.045, 0, 0), ax), { color: [0.16, 0.165, 0.17] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(B.paint, mul(T(0.06, 0, 0, a, 0, 0), T(0, r * 0.47, 0)), 0.035, r * 0.78, 0.05, { color: [0.08, 0.085, 0.09] });
      B.metal.add(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), mul(T(0.04, Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93), ax), { color: C.steel });
    }
    B.metal.add(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 24), mul(T(0.09, 0, 0), ax), { color: C.steel });
    B.paint.add(new THREE.TorusGeometry(0.24, 0.016, 8, 40).rotateY(Math.PI / 2), T(0.17, 0, 0), { color: C.black });
    for (let i = 0; i < 4; i++) cylAB(B.metal, T(0, 0, 0, i * Math.PI / 2), V3(0.12, 0, 0), V3(0.17, 0.24, 0), 0.01, 8, { color: C.steel });
    B.paint.add(new THREE.TorusGeometry(r - 0.01, 0.02, 8, 64).rotateY(Math.PI / 2), T(-0.03, 0, 0), { color: C.black });
    B.paint.add(new THREE.CylinderGeometry(0.1, 0.1, 0.075, 24), mul(T(0, r * 0.45, -r * 0.2), ax), { color: [0.02, 0.02, 0.02] });
    label(B, T(0.071, -r * 0.55, 0, 0, Math.PI / 2, 0), 'PRESSURE HATCH', 0.36, 0.06);
    label(B, T(-0.036, -r * 0.55, 0, 0, -Math.PI / 2, 0), 'PRESSURE HATCH', 0.36, 0.06);
    return B;
  };

  const hatch = (zone, id, Mu, o = {}) => {
    const B = zone.B, r = o.r ?? HR;
    const rig = zone.ring ? rigFrame(...V3().setFromMatrixPosition(Mu).toArray()) : null;
    const flangeOut = r + 0.45;
    zone.wear.push({ ring: true, c: V3().setFromMatrixPosition(Mu), n: V3(1, 0, 0).transformDirection(Mu), R: r + 0.6, r: 0.42, k: 1 });
    B.paint.add(flangeGeo(r, flangeOut, 0.05), Mu, { color: o.flangeColor || [0.6, 0.6, 0.6], rig });
    torus(B.paint, mul(Mu, T(0.07, 0, 0, 0, Math.PI / 2, 0)), r + 0.035, 0.05, { color: C.black, rig, rs: 10, ts: 96 });
    torus(B.paint, mul(Mu, T(0.058, 0, 0, 0, Math.PI / 2, 0)), r + 0.3, 0.012, { color: C.black, rig, rs: 6, ts: 96 });
    torus(B.paint, mul(Mu, T(0.058, 0, 0, 0, Math.PI / 2, 0)), r + 0.41, 0.01, { color: C.black, rig, rs: 6, ts: 96 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      cylAB(B.metal, Mu, V3(0.05, Math.cos(a) * (r + 0.17), Math.sin(a) * (r + 0.17)), V3(0.064, Math.cos(a) * (r + 0.17), Math.sin(a) * (r + 0.17)), 0.011, 6, { color: C.steel, rig });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      box(B.metal, mul(Mu, T(0.04, 0, 0, a, 0, 0), T(0, r + 0.1, 0)), 0.05, 0.08, 0.06, { color: C.dark, rig });
    }
    const depth = o.depth ?? 0.32;
    cylAB(B.metal, Mu, V3(-depth, 0, 0), V3(0.0, 0, 0), r, 72, { color: C.steel, open: true, inside: true, rig });
    if (o.label) label(B, mul(Mu, T(0.0595, r + 0.24, 0, 0, Math.PI / 2, 0)), o.label, 0.46, 0.075);
    if (o.stripes !== false) label(B, mul(Mu, T(0.0595, -r + 0.07, 0, 0, Math.PI / 2, 0)), 'stripes', 0.8, 0.05);
    box(B.metal, mul(Mu, T(0.06, 0, r + 0.12)), 0.08, 0.36, 0.1, { color: C.dark, rig });
    const pivot = new THREE.Group();
    const holder = mount(zone, mul(Mu, T(0.06, 0, r + 0.1)), 'hatch.' + id, rig);
    holder.add(pivot);
    const doorMeshes = meshFromBags(doorGeometry(r + 0.04), pivot);
    for (const m of doorMeshes) m.position.set(0, 0, -(r + 0.1));
    const sign = o.swing ?? 1;
    const maxA = o.maxAngle ?? 1.85;
    const cpos = V3().setFromMatrixPosition(Mu), cn = V3(1, 0, 0).transformDirection(Mu);
    const ext = [0, 1, 2].map(i => (Math.abs(cn.getComponent(i)) > 0.7 ? 0.14 : r + 0.05));
    const cmin = [0, 1, 2].map(i => cpos.getComponent(i) - ext[i]), cmax = [0, 1, 2].map(i => cpos.getComponent(i) + ext[i]);
    if (zone.ring && Math.abs(cn.y) < 0.7) cmin[1] = Math.max(cmin[1], 0);
    const col = { min: cmin.slice(), max: cmax.slice(), id: 'hatch.' + id, door: id, open: false };
    (zone.ring ? colliders : spaceColliders).push(col);
    const h = { id, zone: zone.id, pivot, value: 0, collider: col, set: (v) => {
      h.value = clamp01(v); pivot.rotation.y = -sign * h.value * maxA;
      col.open = h.value > 0.6;
      for (let i = 0; i < 3; i++) { col.min[i] = col.open ? 1e5 : cmin[i]; col.max[i] = col.open ? 1e5 + 0.01 : cmax[i]; }
    }, frame: E(zone, Mu) };
    h.set(o.open ?? 0);
    hatches[id] = h;
    interactables.push({ id: 'hatch.' + id, object: pivot, kind: 'hatch', set: h.set });
    return h;
  };

  const porthole = (zone, sigma, s, y, id, r = 0.2) => {
    const B = zone.B, depth = 0.56, ro = r + 0.52;
    const Mu = mul(wallM(sigma, s, y), T(0, 0, 0, 0, -Math.PI / 2, 0));
    const rig = rigFrame(s, y, sigma * HW);
    B.paint.add(flangeGeo(r, r + 0.4, 0.045, 48), Mu, { color: C.lgrey, rig });
    torus(B.paint, mul(Mu, T(0.06, 0, 0, 0, Math.PI / 2, 0)), r + 0.015, 0.03, { color: C.black, rig, ts: 48 });
    torus(B.metal, mul(Mu, T(0.054, 0, 0, 0, Math.PI / 2, 0)), r + 0.25, 0.01, { color: C.steel, rig, ts: 48 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; cylAB(B.metal, Mu, V3(0.045, Math.cos(a) * (r + 0.12), Math.sin(a) * (r + 0.12)), V3(0.06, Math.cos(a) * (r + 0.12), Math.sin(a) * (r + 0.12)), 0.009, 6, { color: C.steel, rig }); }
    cylAB(B.metal, Mu, V3(-depth, 0, 0), V3(0, 0, 0), ro, 40, { color: C.dark, open: true, inside: true, rig, r2: r });
    torus(B.paint, mul(Mu, T(-depth + 0.03, 0, 0, 0, Math.PI / 2, 0)), ro - 0.01, 0.02, { color: C.black, rig, ts: 40 });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(ro, 40), M.port);
    disposables.push(glass.geometry);
    const o = mount(zone, mul(Mu, T(-depth + 0.04, 0, 0, 0, Math.PI / 2, 0)), 'porthole.' + id, rig);
    o.add(glass);
    const skyCard = new THREE.Mesh(new THREE.CircleGeometry(ro * 3, 32), M.portSky);
    skyCard.position.set(0, 0, -1.6);
    o.add(skyCard);
    disposables.push(skyCard.geometry);
    const pos = ringToEndurance(s, y, sigma * (HW - 0.01));
    const nrm = V3(0, 0, sigma);
    portholes.push({ id, zone: zone.id, position: pos, normal: nrm, radius: r, ring: { s, y, z: sigma * HW } });
    return { s, y, sigma, r };
  };

  const buildModuleShell = (zone, mod, o) => {
    const c = mod.c, s0 = c - HL, B = zone.B;
    const na = Math.round((2 * HL) / TILE);
    const holes = o.holes || [];
    const wallSkips = o.wallSkips || [];
    const skip = (a, b) => {
      const s = s0 + a * TILE, q = PROFILE.at(b);
      for (const h of holes) {
        if (h.type === 'porthole') { if (Math.sign(q.z) === h.sigma && Math.abs(q.nz) > 0.9 && Math.hypot(s - h.s, q.y - h.y) < h.r + 0.2) return true; }
        else if (h.type === 'ceil') { if (q.ny < -0.9 && Math.hypot(s - h.s, q.z - h.z) < h.r + 0.2) return true; }
      }
      for (const w of wallSkips) if (Math.abs(q.nz) > 0.9 && Math.sign(q.z) === w.sigma && s > w.s0 && s < w.s1 && q.y < w.y1) return true;
      return false;
    };
    padSurface(B.pad, na, PROFILE.total, (a, b, P) => {
      const q = PROFILE.at(b);
      P.p.set(s0 + a * TILE, q.y, q.z); P.n.set(0, q.ny, q.nz); P.ta.set(1, 0, 0); P.tb.set(0, q.ty, q.tz); P.la = TILE; P.lb = q.l;
    }, { k: K, seed: mod.k * 31 + 5, skip });
    for (const end of [-1, 1]) {
      const se = c + end * HL;
      const zN = 18, yN = 10, yl = (H - KICK) / yN;
      padSurface(B.pad, zN, yN, (a, b, P) => {
        let z = -HW + a * TILE, y = KICK + b * yl;
        const fz = HW - FIL;
        if (y > WALL_TOP && Math.abs(z) > fz) {
          const dz = Math.abs(z) - fz, dy = y - WALL_TOP, dd = Math.hypot(dz, dy);
          if (dd > FIL - 0.004) { const k2 = (FIL - 0.004) / dd; z = Math.sign(z) * (fz + dz * k2); y = WALL_TOP + dy * k2; }
        }
        P.p.set(se, y, z); P.n.set(-end, 0, 0); P.ta.set(0, 0, 1); P.tb.set(0, 1, 0); P.la = TILE; P.lb = yl;
      }, { k: K, seed: mod.k * 17 + end + 50, skip: (a, b) => Math.hypot(-HW + a * TILE, KICK + b * yl - HY) < HR + 0.2 });
      for (const sz of [-1, 1]) box(B.metal, T(se - end * 0.004, KICK / 2, sz * (HR + 0.4 + (HW - HR - 0.4) / 2)), 0.012, KICK, HW - HR - 0.4, { color: C.steel });
      {
        const sh = new THREE.Shape();
        sh.moveTo(-HW - 0.05, -0.05); sh.lineTo(HW + 0.05, -0.05); sh.lineTo(HW + 0.05, WALL_TOP); sh.absarc(HW - FIL, WALL_TOP, FIL + 0.05, 0, Math.PI / 2, false); sh.lineTo(-HW + FIL, H + 0.05); sh.absarc(-HW + FIL, WALL_TOP, FIL + 0.05, Math.PI / 2, Math.PI, false); sh.lineTo(-HW - 0.05, -0.05);
        const hp = new THREE.Path(); hp.absarc(0, HY, HR + 0.3, 0, Math.PI * 2, true); sh.holes.push(hp);
        const bg2 = new THREE.ShapeGeometry(sh, 12);
        B.paint.add(bg2, mul(T(se + end * 0.03, 0, 0), T(0, 0, 0, 0, end > 0 ? -Math.PI / 2 : Math.PI / 2, 0)), { color: [0.03, 0.03, 0.032] });
        const tp = [];
        for (let k = 0; k <= 40; k++) { const q = PROFILE.at((k / 40) * PROFILE.total); tp.push(V3(se - end * 0.012, q.y + q.ny * 0.012, q.z + q.nz * 0.012)); }
        tubePath(B.paint, T(), tp, 0.028, { color: [0.36, 0.365, 0.37], rs: 8 });
      }
    }
    for (const sz of [-1, 1]) {
      box(B.paint, T(c, 0.11, sz * (HW - 0.03)), 2 * HL, 0.24, 0.06, { color: [0.24, 0.245, 0.25] });
      box(B.paint, T(c, 0.235, sz * (HW - 0.035)), 2 * HL, 0.012, 0.07, { color: [0.32, 0.325, 0.33] });
    }
    const gw = 0.75;
    box(B.grate, T(c, -0.015, 0), 2 * HL, 0.03, 2 * gw, { color: ONE, uv: 'box' });
    box(B.paint, T(c, -0.3, 0), 2 * HL, 0.02, 2 * gw + 0.1, { color: C.dgrey, ao: 0.5 });
    for (const sz of [-1, 1]) {
      box(B.metal, T(c, -0.01, sz * (gw + 0.02)), 2 * HL, 0.04, 0.04, { color: C.steel });
      box(B.paint, T(c, -0.16, sz * (gw + 0.06)), 2 * HL, 0.28, 0.02, { color: C.dgrey, ao: 0.5 });
      box(B.metal, T(c, -0.004, sz * (gw + 0.04 + (HW - gw - 0.04) / 2)), 2 * HL, 0.008, HW - gw - 0.04, { color: [0.42, 0.43, 0.44] });
      for (let x = -HL + 0.6; x < HL; x += 1.3) for (const zz of [gw + 0.18]) { torus(B.metal, T(c + x, 0.004, sz * zz, Math.PI / 2, 0, 0), 0.025, 0.005, { color: C.dark, ts: 14, rs: 5 }); cylAB(B.metal, T(c + x, 0, sz * zz), V3(0, 0, 0), V3(0, 0.006, 0), 0.035, 14, { color: C.steel }); }
      for (let x = -HL; x < HL - 0.01; x += 1.04) box(B.metal, T(c + x + 0.52, 0.0, sz * (gw + 0.04 + (HW - gw - 0.04) / 2)), 0.008, 0.002, HW - gw - 0.06, { color: C.dark });
    }
    for (let x = -HL + 0.52; x < HL; x += 1.04) box(B.metal, T(c + x, -0.06, 0), 0.04, 0.06, 2 * gw, { color: C.dark, ao: 0.6 });
    const R = rand(mod.k * 101);
    for (let i = 0; i < 3; i++) cylAB(B.metal, T(c, -0.2 + i * 0.05, -0.4 + i * 0.32), V3(-HL, 0, 0), V3(HL, 0, 0), 0.03 + R() * 0.02, 10, { color: [C.steel, C.alu, C.dark][i] });
    cableRun(zone, T(c, -0.24, 0.45, -Math.PI / 2, 0, 0), 2 * HL, 5, mod.k * 3 + 1);
    for (const sz of [-1, 1]) for (const fx of [-3.9, -1.3, 1.3, 3.9]) {
      const a = Math.PI / 4, n = V3(0, -Math.sin(a), -sz * Math.cos(a));
      const p = V3(c + fx, WALL_TOP + FIL * Math.sin(a), sz * (HW - FIL + FIL * Math.cos(a))).addScaledVector(n, 0.065);
      tubeFixture(zone, frameN(p, V3(1, 0, 0), n), 1.3);
    }
    cableRun(zone, T(c, H - 0.01, -1.56, Math.PI, 0, 0), 2 * HL, 6, mod.k * 5 + 2, { tray: true });
    for (let x = -HL + 0.8; x < HL; x += 1.6) {
      if (o.ceilHole && Math.abs(x) < 1.7) continue;
      box(B.paint, T(c + x, H - 0.05, 0.35), 0.56, 0.03, 0.36, { color: C.lgrey });
      label(B, T(c + x, H - 0.0655, 0.35, Math.PI / 2, 0, 0), 'grill', 0.48, 0.28);
    }
    for (const fx of [-HL, HL]) {
      zone.spots.push({ pos: V3(c + fx * 0.5, H - 0.08, 0), target: V3(c + fx * 0.5, 0, 0) });
    }
    if (o.hero) zone.spots.push({ pos: V3(c + o.hero[0], H - 0.1, -Math.sign(o.hero[2] || 1) * 0.9), target: V3(c + o.hero[0], o.hero[1], o.hero[2]) });
    colliders.push({ min: [s0, -0.5, -HW - 0.5], max: [c + HL, 0, HW + 0.5], id: zone.id + '.floor' });
    if (o.ceilHole) {
      const hc = SR + 0.05;
      colliders.push({ min: [s0, H, -HW - 0.5], max: [c - hc, H + 0.5, HW + 0.5], id: zone.id + '.ceiling' });
      colliders.push({ min: [c + hc, H, -HW - 0.5], max: [c + HL, H + 0.5, HW + 0.5], id: zone.id + '.ceiling' });
      colliders.push({ min: [c - hc, H, -HW - 0.5], max: [c + hc, H + 0.5, -hc], id: zone.id + '.ceiling' });
      colliders.push({ min: [c - hc, H, hc], max: [c + hc, H + 0.5, HW + 0.5], id: zone.id + '.ceiling' });
    } else colliders.push({ min: [s0, H, -HW - 0.5], max: [c + HL, H + 0.5, HW + 0.5], id: zone.id + '.ceiling' });
    for (const sz of [-1, 1]) colliders.push({ min: [s0, 0, sz > 0 ? HW : -HW - 0.5], max: [c + HL, H, sz > 0 ? HW + 0.5 : -HW], id: zone.id + '.wall' });
    for (const end of [-1, 1]) {
      const se = c + end * HL, a = end > 0 ? se : se - 0.4, b = end > 0 ? se + 0.4 : se;
      colliders.push({ min: [a, 0, -HW], max: [b, H, -HR * 0.8], id: zone.id + '.end' });
      colliders.push({ min: [a, 0, HR * 0.8], max: [b, H, HW], id: zone.id + '.end' });
      colliders.push({ min: [a, HY + HR * 0.85, -HR], max: [b, H, HR], id: zone.id + '.end' });
    }
    walkable.push({ id: zone.id, min: [s0 + 0.05, 0, -HW + 0.05], max: [c + HL - 0.05, 0, HW - 0.05] });
  };

  const buildTunnelShell = (zone, s0, s1, o = {}) => {
    const B = zone.B, len = s1 - s0, na = Math.max(1, Math.round(len / TILE)), la = len / na;
    const psi0 = Math.acos(HY / TR), arc = TR * (Math.PI * 2 - 2 * psi0), nb = Math.round(arc / TILE), lb = arc / nb;
    const ringsAt = o.rings || [];
    padSurface(B.pad, na, nb, (a, b, P) => {
      const psi = psi0 + (b / nb) * (Math.PI * 2 - 2 * psi0), cs = Math.cos(psi), sn = Math.sin(psi);
      P.p.set(s0 + a * la, HY - TR * cs, TR * sn); P.n.set(0, cs, -sn); P.ta.set(1, 0, 0); P.tb.set(0, sn, cs); P.la = la; P.lb = lb;
    }, { k: K, seed: Math.round(s0 * 10) + 7, puff: 0.02, skip: (a) => ringsAt.some(rs => Math.abs(s0 + a * la - rs) < 0.2) });
    const bot = new THREE.CylinderGeometry(TR + 0.01, TR + 0.01, len, 16, segs(len), true, -psi0, 2 * psi0);
    invert(bot);
    B.paint.add(bot, mul(T((s0 + s1) / 2, HY, 0), new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(1, 0, 0), V3(0, -1, 0))), { color: C.dgrey, ao: 0.45 });
    const hw = Math.sqrt(TR * TR - HY * HY);
    box(B.grate, T((s0 + s1) / 2, -0.015, 0), len, 0.03, 2 * hw, { color: ONE });
    for (const sz of [-1, 1]) box(B.metal, T((s0 + s1) / 2, -0.005, sz * (hw - 0.02)), len, 0.05, 0.05, { color: C.steel });
    for (let x = s0 + 0.5; x < s1; x += 1.0) box(B.metal, T(x, -0.07, 0), 0.04, 0.06, 2 * hw, { color: C.dark, ao: 0.6 });
    for (const rs of ringsAt) {
      const Mr = T(rs, HY, 0, 0, Math.PI / 2, 0);
      for (const dx of [-0.3, 0.3]) torus(B.paint, mul(T(rs + dx, HY, 0, 0, Math.PI / 2, 0)), TR - 0.04, 0.07, { color: C.black, ts: 96, rs: 10 });
      cylAB(B.paint, T(rs, HY, 0), V3(-0.36, 0, 0), V3(0.36, 0, 0), TR - 0.055, 72, { color: C.white, open: true, inside: true });
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (Math.sin(a) < -0.6) continue; box(B.metal, mul(Mr, T(Math.cos(a) * (TR - 0.06), Math.sin(a) * (TR - 0.06), 0, 0, 0, a)), 0.04, 0.03, 0.5, { color: C.dark }); }
      label(B, tunnelFrame(rs, 0.55, 1, 0.035), o.ringLabel || 'TO HUB', 0.3, 0.05);
    }
    for (const sz of [-1, 1]) handrail(zone, B.metal, tunnelFrame((s0 + s1) / 2, 1.62, sz, 0.02), len - 0.9, { color: C.lgrey });
    cableRun(zone, tunnelFrame((s0 + s1) / 2, 0.3, -1, 0.01), len, 6, Math.round(s0) + 9);
    for (const sz of [-1, 1]) tubeFixture(zone, tunnelFrame(s0 + len * (sz > 0 ? 0.3 : 0.7), 0.7, sz, 0.065), 1.0);
    for (const se of [s0, s1]) {
      const dir = se === s0 ? 1 : -1;
      B.paint.add(new THREE.RingGeometry(HR, TR + 0.02, 72, 2).rotateY(dir > 0 ? Math.PI / 2 : -Math.PI / 2), T(se + dir * 0.002, HY, 0), { color: C.lgrey });
    }
    zone.spots.push({ pos: V3((s0 + s1) / 2, HY + TR - 0.15, 0), target: V3((s0 + s1) / 2 + 0.5, 0, 0) });
    colliders.push({ min: [s0, -0.5, -1.5], max: [s1, 0, 1.5], id: zone.id + '.floor' });
    colliders.push({ min: [s0, HY + TR - 0.1, -1.5], max: [s1, HY + TR + 0.5, 1.5], id: zone.id + '.ceiling' });
    for (const sz of [-1, 1]) colliders.push({ min: [s0, 0, sz > 0 ? 0.78 : -1.6], max: [s1, HY + TR, sz > 0 ? 1.6 : -0.78], id: zone.id + '.wall' });
    walkable.push({ id: zone.id, min: [s0, 0, -0.55], max: [s1, 0, 0.55] });
  };

  for (const id of zoneOrder) {
    if (['lab', 'pod', 'engine', 'hab'].includes(id)) {
      const mod = MODS.find(m => m.id === id);
      mkZone(id, true, aoBox(mod.c, HL, HW, H), { mod, s0: mod.c - HL, s1: mod.c + HL });
    } else if (id === 't1' || id === 't2' || id === 't3') {
      const i = +id[1] - 1, s0 = MODS[i].c + HL, s1 = MODS[i + 1].c - HL;
      mkZone(id, true, aoTunnel(s0, s1), { s0, s1 });
    } else if (id === 'aft') {
      mkZone(id, true, aoTunnel(-HL - 1.4, -HL), { s0: -HL - 1.4, s1: -HL });
    } else if (id === 'fore') {
      mkZone(id, true, aoTunnel(3 * PITCH + HL, 3 * PITCH + HL + 1.4), { s0: 3 * PITCH + HL, s1: 3 * PITCH + HL + 1.4 });
    } else {
      mkZone(id, false, aoSpace(id));
    }
  }
  const neighbours = { aft: ['lab'], lab: ['aft', 't1', 'pod'], t1: ['lab', 'pod', 'engine'], pod: ['t1', 'lab', 't2', 'engine'], t2: ['pod', 'engine', 't1', 't3'], engine: ['t2', 'pod', 't3', 'hab'], t3: ['engine', 'hab', 't2'], hab: ['t3', 'engine', 'fore', 'spine'], fore: ['hab'], spine: ['hab', 'hub'], hub: ['spine'] };

  const Z = zones;
  const labC = MODS[0].c, podC = MODS[1].c, engC = MODS[2].c, habC = MODS[3].c;

  const labPorts = [porthole(Z.lab, 1, labC - 2.85, 1.62, 'lab.b', 0.26), porthole(Z.lab, -1, labC + 2.6, 1.62, 'lab.a', 0.26)];
  buildModuleShell(Z.lab, MODS[0], { holes: labPorts.map(p => ({ type: 'porthole', ...p })), hero: [-2.9, 0.7, 0], wallSkips: [{ sigma: 1, s0: labC + 0.06, s1: labC + 1.74, y1: 1.68 }, { sigma: -1, s0: labC - 0.79, s1: labC + 1.29, y1: 1.77 }] });
  const podPorts = [porthole(Z.pod, -1, podC + 0.0, 1.62, 'pod.a'), porthole(Z.pod, 1, podC - 3.0, 1.62, 'pod.b')];
  buildModuleShell(Z.pod, MODS[1], { holes: podPorts.map(p => ({ type: 'porthole', ...p })), hero: [0, 1.1, HW], wallSkips: [{ sigma: 1, s0: podC - 0.72, s1: podC + 0.72, y1: 1.62 }] });
  const engPorts = [porthole(Z.engine, 1, engC + 3.75, 1.62, 'engine.a'), porthole(Z.engine, 1, engC - 3.75, 1.62, 'engine.b')];
  buildModuleShell(Z.engine, MODS[2], { holes: engPorts.map(p => ({ type: 'porthole', ...p })), hero: [0, 1.0, HW], wallSkips: [{ sigma: 1, s0: engC - 2.37, s1: engC + 2.37, y1: 1.79 }] });
  const habPorts = [porthole(Z.hab, -1, habC - 0.95, 1.62, 'hab.a'), porthole(Z.hab, 1, habC + 1.15, 1.62, 'hab.b')];
  buildModuleShell(Z.hab, MODS[3], { holes: [...habPorts.map(p => ({ type: 'porthole', ...p })), { type: 'ceil', s: habC, z: 0, r: SR }], ceilHole: true, hero: [-2.2, 0.8, 1.0], wallSkips: [{ sigma: 1, s0: habC - 0.97, s1: habC + 0.37, y1: 1.84 }, { sigma: 1, s0: habC + 1.955, s1: habC + 3.445, y1: 1.69 }] });

  buildTunnelShell(Z.t1, labC + HL, podC - HL, { rings: [(labC + podC) / 2], ringLabel: 'M10 LANDING POD' });
  buildTunnelShell(Z.t2, podC + HL, engC - HL, { rings: [(podC + engC) / 2], ringLabel: 'M11 ENGINE 2' });
  buildTunnelShell(Z.t3, engC + HL, habC - HL, { rings: [(engC + habC) / 2], ringLabel: 'M00 HABITAT A' });
  buildTunnelShell(Z.aft, -HL - 1.4, -HL, {});
  buildTunnelShell(Z.fore, habC + HL, habC + HL + 1.4, {});

  const hatchM = (s, facing) => T(s, HY, 0, 0, facing > 0 ? 0 : Math.PI, 0);
  hatch(Z.lab, 'aft', hatchM(labC - HL, 1), { label: 'NO ACCESS', depth: 0.3 });
  hatch(Z.lab, 'lab', hatchM(labC + HL, -1), { label: 'M10 LANDING POD' });
  hatch(Z.pod, 'pod', hatchM(podC - HL, 1), { label: 'M10 LANDING POD', open: 1 });
  hatch(Z.engine, 'engine', hatchM(engC - HL, 1), { label: 'M11 ENGINE 2', open: 1 });
  hatch(Z.hab, 'hab', hatchM(habC - HL, 1), { label: 'M00 HABITAT A', open: 1 });
  hatch(Z.hab, 'fore', hatchM(habC + HL, -1), { label: 'NO ACCESS', depth: 0.3 });
  for (const [zid, s, f] of [['pod', podC + HL, -1], ['engine', engC + HL, -1], ['lab', null, 0]]) {
    if (s === null) continue;
    const Mu = hatchM(s, f), B = Z[zid].B;
    const orig = rigFrame(s, HY, 0);
    Z[zid].wear.push({ ring: true, c: V3(s, HY, 0), n: V3(1, 0, 0), R: HR + 0.62, r: 0.32, k: 1 });
    B.paint.add(flangeGeo(HR, HR + 0.45, 0.05), Mu, { color: [0.6, 0.6, 0.6], rig: orig });
    torus(B.paint, mul(Mu, T(0.07, 0, 0, 0, Math.PI / 2, 0)), HR + 0.035, 0.05, { color: C.black, rs: 10, ts: 96, rig: orig });
    torus(B.paint, mul(Mu, T(0.058, 0, 0, 0, Math.PI / 2, 0)), HR + 0.3, 0.012, { color: C.black, ts: 96, rig: orig });
    cylAB(B.metal, Mu, V3(-0.32, 0, 0), V3(0, 0, 0), HR, 72, { color: C.steel, open: true, inside: true });
    label(B, mul(Mu, T(0.0595, HR + 0.24, 0, 0, Math.PI / 2, 0)), zid === 'pod' ? 'M11 ENGINE 2' : 'M00 HABITAT A', 0.46, 0.075);
    label(B, mul(Mu, T(0.0595, -HR + 0.07, 0, 0, Math.PI / 2, 0)), 'stripes', 0.8, 0.05);
  }
  for (const [zid, s] of [['aft', -HL - 1.4], ['fore', habC + HL + 1.4]]) {
    const B = Z[zid].B, f = zid === 'aft' ? 1 : -1;
    B.paint.add(new THREE.CircleGeometry(TR + 0.05, 64).rotateY(f > 0 ? Math.PI / 2 : -Math.PI / 2), T(s, HY, 0), { color: [0.1, 0.105, 0.11] });
    for (let i = 0; i < 6; i++) box(B.paint, mul(T(s + f * 0.03, HY, 0, (i / 6) * Math.PI, 0, 0)), 0.04, 2 * TR - 0.1, 0.06, { color: [0.07, 0.07, 0.075] });
    label(B, T(s + f * 0.06, HY + 0.2, 0, 0, f > 0 ? Math.PI / 2 : -Math.PI / 2, 0), zid === 'aft' ? 'M08 ENGINE 1' : 'M01 LANDING POD', 0.5, 0.08);
    label(B, T(s + f * 0.06, HY - 0.1, 0, 0, f > 0 ? Math.PI / 2 : -Math.PI / 2, 0), 'NO ACCESS', 0.5, 0.08);
  }
  hatches.lab.set(0);
  [labC - HL, labC + HL, podC - HL, podC + HL, engC - HL, engC + HL, habC - HL, habC + HL].forEach((hs, i) => U.hatchP.value[i].copy(ringToEndurance(hs, HY, 0)));
  U.hatchP.value[8].copy(ringToEndurance(habC, H, 0));
  U.hatchP.value[9].set(HUB_R, 0, 0);

  const extraLights = [];
  let tallyLampPos = null, tallyLampTgt = null;
  const B_LAB = () => Z.lab.B;
  const lever = (() => {
    const HM = hatchM(labC + HL, -1);
    const Mu = mul(HM, T(0, 0.05, -(HR + 0.17)));
    const rig = rigFrame(labC + HL, HY, 0);
    const prevRig = LABEL_RIG; LABEL_RIG = rig;
    rbox(B_LAB().paint, mul(Mu, T(0.08, 0.14, 0)), 0.06, 0.46, 0.13, 0.012, { color: [0.22, 0.225, 0.23], rig });
    box(B_LAB().paint, mul(Mu, T(0.112, 0.14, 0)), 0.004, 0.36, 0.022, { color: C.black, rig });
    label(B_LAB(), mul(Mu, T(0.1125, 0.4, 0, 0, Math.PI / 2, 0)), 'MANUAL RELEASE', 0.17, 0.03);
    label(B_LAB(), mul(Mu, T(0.1125, -0.12, 0, 0, Math.PI / 2, 0)), 'PULL TO RELEASE', 0.17, 0.03);
    const lb = localBags(LOCAL);
    lb.metal.add(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 20).rotateZ(Math.PI / 2), T(0.0, 0, 0), { color: C.steel });
    box(lb.paint, T(0.035, 0.17, 0), 0.026, 0.36, 0.03, { color: C.dgrey });
    lb.paint.add(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 16), T(0.06, 0.36, 0), { color: C.yellow });
    for (let i = 0; i < 3; i++) lb.paint.add(new THREE.TorusGeometry(0.022, 0.004, 5, 16).rotateX(Math.PI / 2), T(0.06, 0.32 + i * 0.033, 0), { color: C.black });
    const holder = mount(Z.lab, mul(Mu, T(0.11, 0.0, 0)), 'lever.labHatchLever', rig);
    const pivot = new THREE.Group();
    holder.add(pivot);
    meshFromBags(lb, pivot);
    const lampM = mul(HM, T(0.8, H - HY - 0.16, -0.62));
    rbox(B_LAB().paint, lampM, 0.14, 0.09, 0.26, 0.015, { color: C.dgrey, rig });
    B_LAB().led.add(new THREE.PlaneGeometry(0.11, 0.21).rotateX(Math.PI / 2), mul(lampM, T(0, -0.046, 0)), { rig, color: [6.0, 4.6, 3.0] });
    cylAB(B_LAB().metal, lampM, V3(0, 0.04, -0.08), V3(0, 0.2, -0.08), 0.009, 6, { color: C.steel, rig });
    cylAB(B_LAB().metal, lampM, V3(0, 0.04, 0.08), V3(0, 0.2, 0.08), 0.009, 6, { color: C.steel, rig });
    const stM = mul(HM, T(0.055, HR + 0.18, 0.32));
    rbox(B_LAB().paint, mul(stM, T(0.01, 0, 0)), 0.03, 0.07, 0.07, 0.01, { color: C.black, rig });
    const status = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20).rotateY(Math.PI / 2), M.status);
    disposables.push(status.geometry);
    mount(Z.lab, mul(stM, T(0.027, 0, 0)), 'status.lab', rig).add(status);
    LABEL_RIG = prevRig;
    const lamp = new THREE.SpotLight(0xffd8a6, 0, 5, 0.85, 0.75, 2);
    lamp.name = 'endi.workLamp';
    lamp.position.copy(V3(0, -0.07, 0).applyMatrix4(mul(rig, lampM)));
    lamp.target.position.copy(V3(0, -0.15, 0.2).applyMatrix4(mul(rig, HM)));
    group.add(lamp); group.add(lamp.target);
    extraLights.push(lamp);
    Z.lab.wear.push({ a: V3(labC + HL, 1.0, HR + 0.17), b: V3(labC + HL, 1.7, HR + 0.17), r: 0.28, k: 1 });
    const api = { value: 0, lamp, set: (v) => { api.value = clamp01(v); pivot.rotation.x = -api.value * 1.55; } };
    interactables.push({ id: 'labHatchLever', object: pivot, kind: 'lever', set: api.set });
    colliders.push({ min: [labC + HL - 0.2, 0.95, HR + 0.05], max: [labC + HL, 1.75, HR + 0.35], id: 'lab.lever' });
    return api;
  })();
  const anom = (() => {
    const N = hiQ ? 5200 : 2600, R = rand(6161);
    const s0 = labC + HL - 1.35, s1 = labC + HL - 0.15, y0 = 0.6, y1 = 2.05, z0 = -0.8, z1 = 0.8, gs = 0.11, gy = 0.09;
    const P = new Float32Array(N * 3), Sn = new Float32Array(N * 3), Sd = new Float32Array(N);
    const lines = [];
    for (let i = 0; i < 46; i++) lines.push([s0 + (Math.floor(R() * ((s1 - s0) / gs)) + 0.5) * gs, y0 + (Math.floor(R() * ((y1 - y0) / gy)) + 0.5) * gy]);
    const v = V3();
    for (let i = 0; i < N; i++) {
      const ss = s0 + R() * (s1 - s0), yy = y0 + R() * (y1 - y0), zz = z0 + R() * (z1 - z0);
      ringToEndurance(ss, yy, zz, v); P.set([v.x, v.y, v.z], i * 3);
      const L = lines[Math.floor(R() * lines.length)];
      ringToEndurance(L[0], L[1], zz, v); Sn.set([v.x, v.y, v.z], i * 3);
      Sd[i] = R();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aSnap', new THREE.BufferAttribute(Sn, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(Sd, 1));
    disposables.push(g);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAnom: { value: 0 }, uI: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1080 }, uCol: { value: new THREE.Color(1.0, 0.86, 0.66) } },
      vertexShader: `attribute vec3 aSnap; attribute float aSeed; uniform float uAnom, uI, uTime, uPx; varying float vA;
void main(){
  vec3 drift = vec3(sin(uTime * 0.21 + aSeed * 41.0), cos(uTime * 0.17 + aSeed * 23.0), sin(uTime * 0.13 + aSeed * 57.0)) * 0.035;
  float k = smoothstep(aSeed * 0.6, aSeed * 0.6 + 0.4, uAnom) * step(fract(aSeed * 7.31), 0.72);
  vec3 jit = (vec3(fract(aSeed * 91.7), fract(aSeed * 53.3), fract(aSeed * 17.9)) - 0.5) * 0.014;
  vec3 p = mix(position + drift, aSnap + jit + drift * 0.05, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = uPx * 0.0028 * (0.6 + aSeed) / max(0.05, -mv.z);
  gl_PointSize = clamp(sz, 3.0, 10.0);
  vA = uI * (0.25 + 0.75 * fract(aSeed * 13.0)) * min(1.0, sz / 3.0) * min(1.0, sz / 3.0) * (0.12 + 1.1 * k) * (0.6 + 0.4 * sin(uTime * 1.3 + aSeed * 60.0));
}`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uCol * vA * smoothstep(0.5, 0.05, d), 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false; pts.name = 'lab.anomalyDust'; pts.renderOrder = 8;
    group.add(pts); Z.lab.meshes.push(pts);
    const lp = [];
    for (const [ls, ly] of lines) { ringToEndurance(ls, ly, z0, v); lp.push(v.x, v.y, v.z); ringToEndurance(ls, ly, z1, v); lp.push(v.x, v.y, v.z); }
    const lg2 = new THREE.BufferGeometry();
    lg2.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    disposables.push(lg2);
    const lmat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ln = new THREE.LineSegments(lg2, lmat);
    ln.frustumCulled = false; ln.name = 'lab.anomalyLines'; ln.renderOrder = 8;
    group.add(ln); Z.lab.meshes.push(ln);
    return { mat, lmat };
  })();

  const podLight = new THREE.PointLight(0xdcefff, 0, 1.1, 2);
  const podBLight = new THREE.PointLight(0xbfe4ff, 0, 1.3, 2);
  podBLight.name = 'endi.podBLight';
  group.add(podBLight);
  podLight.name = 'endi.podLight';
  group.add(podLight);
  const pods = [];
  const buildPod = (sigma, id) => {
    const zone = Z.lab, B = zone.B;
    const cx = labC - 2.9, cz = sigma * 1.28, len = 2.35, wid = 0.88;
    const rig = rigFrame(cx, 0, cz);
    const o = { rig };
    LABEL_RIG = rig;
    rbox(B.paint, T(cx, 0.3, cz), len, 0.6, wid, 0.05, { ...o, color: C.white });
    box(B.paint, T(cx, 0.05, cz), len - 0.1, 0.1, wid - 0.08, { ...o, color: C.dgrey });
    for (let i = 0; i < 4; i++) rbox(B.paint, T(cx - len / 2 + 0.35 + i * 0.55, 0.32, cz - sigma * (wid / 2 + 0.002)), 0.44, 0.34, 0.01, 0.004, { ...o, color: C.offwhite });
    for (let i = 0; i < 6; i++) box(B.paint, T(cx - 0.6 + i * 0.05, 0.42, cz - sigma * (wid / 2 + 0.006)), 0.025, 0.12, 0.006, { ...o, color: C.black });
    label(B, T(cx + 0.55, 0.45, cz - sigma * (wid / 2 + 0.009), 0, sigma > 0 ? Math.PI : 0, 0), id === 'A' ? 'CRYO 01' : 'CRYO 02', 0.22, 0.05);
    label(B, T(cx + 0.55, 0.38, cz - sigma * (wid / 2 + 0.009), 0, sigma > 0 ? Math.PI : 0, 0), 'barcode', 0.18, 0.04);
    rbox(B.paint, T(cx, 0.66, cz), len - 0.06, 0.12, wid - 0.06, 0.04, { ...o, color: C.lgrey });
    rbox(B.fabric, T(cx + 0.05, 0.73, cz), len - 0.3, 0.06, wid - 0.22, 0.03, { ...o, color: C.navy });
    softBox(zone, T(cx - len / 2 + 0.28, 0.79, cz), 0.3, 0.07, 0.42, C.dgrey, id === 'A' ? 3 : 4);
    for (const sx of [-1, 1]) box(B.metal, T(cx, 0.73, cz + sx * (wid / 2 - 0.03)), len - 0.1, 0.05, 0.03, { ...o, color: C.alu });
    for (let i = 0; i < 3; i++) {
      const hx = cx - 0.6 + i * 0.6;
      const pts = [V3(hx, 0.5, cz + sigma * (wid / 2 - 0.02)), V3(hx + 0.05, 0.45, cz + sigma * (wid / 2 + 0.15)), V3(hx + 0.1, 0.2, sigma * (HW - 0.12)), V3(hx + 0.12, 0.08, sigma * (HW - 0.03))];
      tubePath(B.paint, T(), pts, 0.016, { color: i === 1 ? C.yellow : C.dgrey, rig: rigFrame(hx, 0.3, cz) });
    }
    const pedM = T(cx - len / 2 - 0.16, 0, cz - sigma * 0.15);
    box(B.paint, mul(pedM, T(0, 0.55, 0)), 0.12, 1.1, 0.16, { rig, color: C.white });
    box(B.metal, mul(pedM, T(0, 1.12, 0)), 0.14, 0.04, 0.18, { rig, color: C.steel });
    const dispM = id === 'B' ? T(cx - 0.15, 0.97, cz - sigma * (wid / 2 + 0.1), -2.08, 0, Math.PI) : mul(pedM, T(0.06, 1.28, 0, 0, Math.PI / 2 + sigma * 0.5, 0), T(0, 0, 0, -0.18, 0, 0));
    if (id === 'B') { cylAB(B.metal, T(), V3(cx - 0.15, 0.62, cz - sigma * (wid / 2 + 0.02)), V3(cx - 0.15, 0.86, cz - sigma * (wid / 2 + 0.12)), 0.018, 8, { color: C.steel, rig }); }
    rbox(B.paint, mul(dispM, T(0, 0, -0.06)), 0.47, 0.38, 0.1, 0.02, { rig, color: C.dgrey });
    crtBezel(zone, dispM, 0.37, 0.28, 'pod' + id + '_status', 'status', rig);
    B.led.add(new THREE.CircleGeometry(0.006, 8), mul(dispM, T(0.17, -0.13, 0.045)), { rig, color: LED.green });
    B.led.add(new THREE.CircleGeometry(0.006, 8), mul(dispM, T(0.15, -0.13, 0.045)), { rig, color: LED.amber });
    const hingeU = T(cx, 0.8, cz + sigma * (wid / 2 - 0.02));
    const holder = mount(zone, hingeU, 'pod.' + id, rig);
    const pivot = new THREE.Group();
    holder.add(pivot);
    const lb = localBags(LOCAL);
    const lz = -sigma * (wid / 2 - 0.02);
    rbox(lb.paint, T(0, 0.12, -sigma * 0.03), len - 0.02, 0.16, 0.06, 0.02, { color: C.white });
    rbox(lb.paint, T(0, 0.12, -sigma * (wid - 0.07)), len - 0.02, 0.16, 0.06, 0.02, { color: C.white });
    for (const ex of [-1, 1]) rbox(lb.paint, T(ex * (len / 2 - 0.04), 0.12, lz), 0.08, 0.16, wid - 0.02, 0.02, { color: C.white });
    for (let i = 1; i < 4; i++) box(lb.metal, T(-len / 2 + i * (len / 4), 0.235, lz), 0.03, 0.02, wid - 0.06, { color: C.alu });
    for (const ex of [-0.4, 0.4]) box(lb.metal, T(ex, 0.06, 0), 0.08, 0.05, 0.06, { color: C.steel });
    box(lb.paint, T(len / 2 - 0.02, 0.12, lz - sigma * (wid / 2 - 0.1)), 0.06, 0.05, 0.12, { color: C.black });
    meshFromBags(lb, pivot);
    const glassG = new THREE.PlaneGeometry(len - 0.16, wid - 0.1);
    glassG.rotateX(-Math.PI / 2);
    const glass = new THREE.Mesh(glassG, M.podGlass[id === 'A' ? 0 : 1]);
    glass.position.set(0, 0.205, lz);
    glass.renderOrder = 2;
    pivot.add(glass);
    const outer = new THREE.Mesh(glassG, M.podOuter);
    outer.position.set(0, 0.222, lz);
    outer.renderOrder = 3;
    pivot.add(outer);
    disposables.push(glassG);
    if (id === 'B') podBLight.position.copy(V3(cx - 0.3, 0.9, cz).applyMatrix4(rig));
    if (id === 'B') B.led.add(new THREE.PlaneGeometry(len - 0.4, 0.012).rotateX(-Math.PI / 2), mul(T(cx, 0.795, cz - sigma * (wid / 2 - 0.05))), { rig, color: [0.35, 0.55, 0.65] });
    if (id === 'A') {
      B.led.add(new THREE.PlaneGeometry(len - 0.4, 0.012).rotateX(-Math.PI / 2), mul(T(cx, 0.795, cz - sigma * (wid / 2 - 0.05))), { rig, color: [0.5, 0.75, 0.85] });
      podLight.position.copy(V3(cx - 0.55, 0.93, cz).applyMatrix4(rig));
    }
    const fig = (() => {
      const fb = localBags(LOCAL);
      fb.paint.add(new THREE.SphereGeometry(0.1, 16, 12), T(-len / 2 + 0.3, 0.06, 0), { color: C.dgrey });
      fb.paint.add(new THREE.CapsuleGeometry(0.16, 0.5, 6, 14).rotateZ(Math.PI / 2).scale(1, 0.62, 1), T(-len / 2 + 0.78, 0.0, 0), { color: C.dgrey });
      for (const sz of [-1, 1]) {
        fb.paint.add(new THREE.CapsuleGeometry(0.065, 0.75, 4, 10).rotateZ(Math.PI / 2), T(-len / 2 + 1.5, 0.0, sz * 0.09), { color: C.dgrey });
        fb.paint.add(new THREE.CapsuleGeometry(0.045, 0.5, 4, 8).rotateZ(Math.PI / 2 - 0.08), T(-len / 2 + 0.85, 0.01, sz * 0.2), { color: C.dgrey });
      }
      const g = new THREE.Group();
      const ms = meshFromBags(fb, g);
      for (const m of ms) { m.material = M.figure; m.castShadow = false; }
      g.position.set(cx, 0.82, cz);
      const fh = mount(zone, T(), 'pod.' + id + '.figure', rig);
      fh.add(g);
      g.position.set(cx, 0.82, cz);
      g.visible = false;
      return g;
    })();
    const api = {
      id, sigma, value: 0, frost: 1, pivot, figure: fig, glass: glass.material,
      set(v) { api.value = clamp01(v); pivot.rotation.x = sigma * api.value * 1.75; },
      setFrost(v) { api.frost = clamp01(v); glass.material.userData.uPF.value = api.frost; },
      breath: id === 'A' ? 1 : 0,
    };
    api.setFrost(1);
    interactables.push({ id: 'pod' + id + 'Lid', object: pivot, kind: 'lid', set: api.set });
    LABEL_RIG = null;
    pods.push(api);
    colliders.push({ min: [cx - len / 2 - 0.25, 0, cz - wid / 2], max: [cx + len / 2, 0.8, cz + wid / 2], id: 'lab.pod' + id });
    return api;
  };
  const podA = buildPod(-1, 'A');
  const podB = buildPod(1, 'B');

  {
    const zone = Z.lab, B = zone.B;
    const cM = wallM(1, labC + 0.9, 0);
    addCollider(colliders, consoleUnit(zone, cM, 1.95, 1.8, [{ t: 'toggles', w: 0.5 }, { t: 'crt', w: 1, slot: 'consoleLab', y0: 0.75 }, { t: 'rack', w: 0.8 }], { title: 'SICK BAY', seed: 11 }));
    const mM = wallM(-1, labC + 0.25, 0);
    const rig = rigFrame(labC + 0.25, 0, -HW);
    box(B.paint, mul(mM, T(0, 0.95, 0.24)), 2.35, 1.9, 0.48, { rig, color: C.white });
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
      const dx = -0.78 + k * 0.78, dy = 0.3 + r * 0.42;
      rbox(B.paint, mul(mM, T(dx, dy, 0.485)), 0.74, 0.38, 0.02, 0.006, { rig, color: C.offwhite });
      box(B.metal, mul(mM, T(dx, dy + 0.12, 0.5)), 0.2, 0.018, 0.02, { rig, color: C.alu });
      if ((r + k) % 3 === 0) label(B, mul(mM, T(dx - 0.2, dy - 0.1, 0.496)), ['MED', 'SICK BAY', 'SAMPLE KIT', 'SPARES'][(r + k) % 4], 0.18, 0.04);
    }
    label(B, mul(mM, T(0.6, 1.82, 0.485)), 'LIFE SUPPORT', 0.4, 0.06);
    addCollider(colliders, [V3(-1.18, 0, 0).applyMatrix4(mM), V3(1.18, 1.9, 0.5).applyMatrix4(mM)]);
    handrail(zone, B.metal, mul(wallM(-1, labC - 2.9, 1.15), T(0, 0, 0)), 2.6, { rigid: true });
    handrail(zone, B.metal, mul(wallM(1, labC - 2.9, 1.15), T(0, 0, 0)), 2.6, { rigid: true });
    handrail(zone, B.metal, mul(wallM(1, labC + 3.4, 1.15), T(0, 0, 0)), 2.6, { rigid: true });
    cryoBag(zone, mul(wallM(-1, labC + 4.15, 2.15, 0.2), T(-0.9, 0, 0)), 1.7, 0.2, 21, { patch: 'CRYO 02' });
    cryoBag(zone, mul(wallM(1, labC + 3.2, 0.55, 0.22), T(-0.85, 0, 0)), 1.7, 0.21, 22, { white: true });
    softBox(zone, mul(wallM(1, labC + 4.6, 1.5, 0.2)), 0.36, 0.5, 0.36, C.white, 23);
    softBox(zone, mul(wallM(-1, labC + 4.4, 0.25, 0.2)), 0.6, 0.4, 0.38, C.cream, 24);
    label(zone.B, mul(wallM(1, labC - 4.7, 1.6, -0.02)), 'FIRE EXT', 0.16, 0.06);
    cylAB(B.paint, wallM(1, labC - 4.7, 0, 0.09), V3(0, 0.95, 0), V3(0, 1.45, 0), 0.07, 16, { color: C.yellow, rig: rigFrame(labC - 4.7, 1.2, HW - 0.09) });
  }

  {
    const zone = Z.pod, B = zone.B;
    const R = rand(1010);
    for (const sigma of [-1, 1]) {
      const segsR = sigma > 0 ? [[-4.9, -0.95], [0.95, 4.9]] : [[-4.9, -0.35], [0.35, 4.9]];
      for (const [a, b] of segsR) {
        const w = b - a, mid = podC + (a + b) / 2, rM = wallM(sigma, mid, 0), rig = rigFrame(mid, 0, sigma * HW);
        LABEL_RIG = rig;
        for (const sx of [-w / 2, w / 2]) for (const sz of [0.03, 0.6]) box(B.metal, mul(rM, T(sx, 0.95, sz)), 0.04, 1.9, 0.04, { rig, color: C.steel });
        const shelves = [0.1, 0.62, 1.2, 1.88];
        for (const sy of shelves) { box(B.metal, mul(rM, T(0, sy, 0.31)), w, 0.025, 0.62, { rig, color: C.lgrey }); box(B.metal, mul(rM, T(0, sy + 0.02, 0.61)), w, 0.04, 0.012, { rig, color: C.steel }); }
        for (let si = 0; si < 3; si++) {
          let x = -w / 2 + 0.05;
          while (x < w / 2 - 0.2) {
            const bw = 0.28 + R() * 0.45, bh = Math.min(0.5, (shelves[si + 1] - shelves[si]) - 0.05) * (0.6 + R() * 0.4), bd = 0.38 + R() * 0.2;
            if (x + bw > w / 2 - 0.04) break;
            const bc = V3(x + bw / 2, shelves[si] + 0.0125 + bh / 2, 0.04 + bd / 2);
            if (R() < 0.25) softBox(zone, mul(rM, T(bc.x, bc.y, bc.z)), bw, bh, bd, R() < 0.5 ? C.white : C.cream, Math.floor(R() * 999));
            else {
              rbox(B.paint, mul(rM, T(bc.x, bc.y, bc.z)), bw, bh, bd, 0.012, { rig, color: R() < 0.7 ? C.white : C.lgrey });
              for (const ex of [-0.3, 0.3]) box(B.paint, mul(rM, T(bc.x + ex * bw, bc.y, bc.z + bd / 2 + 0.002)), 0.04, bh * 0.9, 0.006, { rig, color: C.dgrey });
              label(B, mul(rM, T(bc.x, bc.y + bh * 0.2, bc.z + bd / 2 + 0.006)), ['CARGO 01', 'CARGO 02', 'CARGO 03', 'CARGO 04', 'SEED VAULT', 'EMBRYO BANK', 'TOOLS', 'SPARES', 'FOOD', 'WATER'][Math.floor(R() * 10)], Math.min(0.24, bw * 0.8), 0.05);
              if (R() < 0.5) label(B, mul(rM, T(bc.x, bc.y - bh * 0.2, bc.z + bd / 2 + 0.006)), 'barcode', 0.12, 0.03);
            }
            x += bw + 0.04 + R() * 0.06;
          }
          for (let k = 0; k < 2; k++) box(B.fabric, mul(rM, T(0, shelves[si] + 0.18 + k * 0.18, 0.63)), w - 0.05, 0.03, 0.006, { rig, color: C.dgrey });
        }
        addCollider(colliders, [V3(-w / 2, 0, 0).applyMatrix4(rM), V3(w / 2, 1.9, 0.64).applyMatrix4(rM)]);
        LABEL_RIG = null;
      }
    }
    addCollider(colliders, consoleUnit(zone, wallM(1, podC, 0), 1.7, 1.75, [{ t: 'rack', w: 0.7 }, { t: 'crt', w: 1, slot: 'consolePod', y0: 0.7 }, { t: 'toggles', w: 0.45 }], { title: 'CARGO 01', seed: 21 }));
    cryoBag(zone, mul(wallM(-1, podC + 0.0, 0.25, 0.1), T(-0.2, 0, 0, 0, 0, 0)), 0.5, 0.16, 31, { white: true, straps: [0.5] });
  }

  {
    const zone = Z.engine, B = zone.B;
    addCollider(colliders, consoleUnit(zone, wallM(1, engC, 0), 5.0, 1.92, [
      { t: 'rack', w: 0.55 }, { t: 'toggles', w: 0.42 }, { t: 'crt', w: 0.9, slot: 'consoleEngineA', y0: 0.62, kind: 'alu' }, { t: 'toggles', w: 0.42 },
      { t: 'crt', w: 0.9, slot: 'consoleEngineB', y0: 0.62, kind: 'brass' }, { t: 'gauges', w: 0.3 }, { t: 'rack', w: 0.6 }, { t: 'toggles', w: 0.42 }, { t: 'rack', w: 0.5 },
    ], { title: 'MAIN ENG', seed: 31, depth: 0.32 }));
    const pM = wallM(-1, engC, 0);
    const pipes = [[0.32, 0.09, C.steel], [0.62, 0.07, C.alu], [0.86, 0.05, C.yellow], [2.18, 0.08, C.steel], [1.95, 0.05, C.lgrey]];
    for (const [py, pr, pc] of pipes) {
      cylAB(B.metal, pM, V3(-HL, py, pr + 0.06), V3(HL, py, pr + 0.06), pr, 18, { color: pc });
      for (let x = -HL + 0.5; x < HL; x += 1.3) {
        torus(B.metal, mul(pM, T(x, py, pr + 0.06, 0, Math.PI / 2, 0)), pr + 0.008, 0.012, { color: C.dark, ts: 20 });
        box(B.metal, mul(pM, T(x, py, (pr + 0.06) / 2)), 0.04, 0.04, pr + 0.06, { color: C.dark });
      }
    }
    for (const vx of [-3.6, -1.2, 1.6, 4.1]) {
      const Vm = mul(pM, T(vx, 0.62, 0.21));
      const vr = rigFrame(engC + vx, 0.62, -HW + 0.21);
      cylAB(B.metal, Vm, V3(0, 0, 0), V3(0, 0, 0.12), 0.03, 12, { color: C.steel, rig: vr });
      B.paint.add(new THREE.TorusGeometry(0.11, 0.012, 8, 28), mul(Vm, T(0, 0, 0.13)), { color: C.yellow, rig: vr });
      for (let i = 0; i < 4; i++) cylAB(B.paint, mul(Vm, T(0, 0, 0.13)), V3(0, 0, 0), V3(Math.cos(i * Math.PI / 2) * 0.11, Math.sin(i * Math.PI / 2) * 0.11, 0), 0.008, 6, { color: C.yellow, rig: vr });
      label(B, mul(Vm, T(0, -0.17, -0.05)), 'ISOL VALVE', 0.16, 0.035);
    }
    for (const tx of [-2.4, 0.4, 2.9]) {
      const tr = rigFrame(engC + tx, 1.25, -HW + 0.32);
      cylAB(B.paint, mul(pM, T(tx, 0, 0.32)), V3(0, 1.0, 0), V3(0, 1.75, 0), 0.24, 24, { color: C.white, rig: tr });
      B.paint.add(new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mul(pM, T(tx, 1.75, 0.32)), { color: C.white, rig: tr });
      B.paint.add(new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mul(pM, T(tx, 1.0, 0.32)), { color: C.white, rig: tr });
      for (const by of [1.15, 1.6]) torus(B.fabric, mul(pM, T(tx, by, 0.32, Math.PI / 2, 0, 0)), 0.245, 0.014, { color: C.dgrey, rig: tr, ts: 32 });
      label(B, mul(pM, T(tx, 1.4, 0.565)), tx < 0 ? 'LOX 1' : tx < 2 ? 'HE PRESS' : 'LOX 2', 0.22, 0.05);
      label(B, mul(pM, T(tx, 1.32, 0.565)), 'stripes', 0.3, 0.03);
      addCollider(colliders, [V3(tx - 0.26, 0, 0).applyMatrix4(pM), V3(tx + 0.26, 2.0, 0.58).applyMatrix4(pM)]);
    }
    colliders.push({ min: [engC - HL, 0, -HW], max: [engC + HL, 1.0, -HW + 0.3], id: 'engine.pipes' });
    label(B, mul(pM, T(-4.6, 1.5, 0.02)), 'HIGH VOLTAGE', 0.3, 0.06);
    label(B, mul(pM, T(4.6, 1.5, 0.02)), 'COOLANT', 0.3, 0.06);
    cableRun(zone, mul(pM, T(0, 1.45, 0.02)), 2 * HL, 6, 444, { tray: true });
  }

  const hydroLeaves = [];
  const vineSpecs = [];
  const tendrils = [];
  const litter = [];
  const plantStems = [];
  const items = [];
  let tallyMesh = null;
  {
    const zone = Z.hab, B = zone.B;
    const ladderX = habC, ladderZ = -(SR - 0.2);
    const lrig = rigFrame(ladderX, 1.3, ladderZ);
    for (const sx of [-0.21, 0.21]) {
      box(B.paint, T(ladderX + sx, (H + 0.2) / 2, ladderZ), 0.035, H + 0.2, 0.05, { color: [0.16, 0.165, 0.17], rig: lrig });
      for (const wy of [0.95, 1.35, 1.75, 2.15]) box(B.metal, T(ladderX + sx, wy, ladderZ), 0.037, 0.16 + hash1(wy * 10) * 0.12, 0.052, { color: C.alu, rig: lrig });
    }
    for (let y = 0.25; y < H + 0.1; y += 0.3) {
      cylAB(B.paint, T(ladderX, y, ladderZ), V3(-0.2, 0, 0), V3(0.2, 0, 0), 0.0145, 8, { color: [0.16, 0.165, 0.17], rig: lrig });
      cylAB(B.metal, T(ladderX, y, ladderZ), V3(-0.08 - hash1(y * 7) * 0.04, 0, 0), V3(0.09, 0, 0), 0.0152, 8, { color: C.alu, rig: lrig });
    }
    zone.wear.push({ a: V3(ladderX, 0, ladderZ), b: V3(ladderX, H, ladderZ), r: 0.35, k: 0.8 });
    for (const sx of [-0.21, 0.21]) box(B.metal, T(ladderX + sx, 0.01, ladderZ), 0.08, 0.02, 0.12, { color: C.dark, rig: lrig });
    label(B, T(ladderX, 1.45, ladderZ + 0.03), 'CLIMB', 0.12, 0.035);
    label(B, T(habC + SR + 0.2, H - 0.006, 0, Math.PI / 2, 0, -Math.PI / 2), 'SPINE ACCESS', 0.44, 0.07);
    hatch(Z.hab, 'ceiling', T(habC, H, 0, 0, 0, -Math.PI / 2), { r: SR - 0.04, label: null, stripes: false, depth: 0.08, open: 0, swing: -1, maxAngle: 1.57 });

    const bunkM = wallM(-1, habC + 3.15, 0), brig = rigFrame(habC + 3.15, 0, -HW);
    LABEL_RIG = brig;
    for (const by of [0.42, 1.28]) {
      rbox(B.paint, mul(bunkM, T(0, by, 0.42)), 3.4, 0.08, 0.84, 0.02, { rig: brig, color: C.lgrey });
      rbox(B.fabric, mul(bunkM, T(0.05, by + 0.09, 0.42)), 3.2, 0.11, 0.76, 0.04, { rig: brig, color: C.blue });
      softBox(zone, mul(bunkM, T(1.42, by + 0.18, 0.42)), 0.3, 0.09, 0.55, C.white, by * 100 | 0);
      const blanket = new THREE.PlaneGeometry(1.9, 0.9, 30, 14);
      const bp = blanket.attributes.position;
      const BR = rand(by * 1000 | 0);
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i); const e = Math.max(0, Math.abs(y) - 0.32) * 1.6; bp.setZ(i, 0.04 * Math.sin(x * 5 + y * 3) + 0.02 * Math.sin(x * 13 + BR() * 0.2) - e * e * 0.6 + 0.03); }
      blanket.computeVertexNormals();
      B.fabric.add(blanket, mul(bunkM, T(-0.45, by + 0.16, 0.44, -Math.PI / 2, 0, 0)), { rig: brig, color: [0.42, 0.44, 0.4] });
      box(B.metal, mul(bunkM, T(0, by + 0.12, 0.85)), 3.4, 0.03, 0.025, { rig: brig, color: C.alu });
      label(B, mul(bunkM, T(-1.5, by - 0.02, 0.846)), by < 1 ? 'BUNK 1' : 'BUNK 2', 0.14, 0.035);
    }
    for (const sx of [-1.7, 1.7]) box(B.metal, mul(bunkM, T(sx, 0.9, 0.84)), 0.04, 1.8, 0.04, { rig: brig, color: C.steel });
    for (let i = 0; i < 14; i++) {
      const cg = new THREE.PlaneGeometry(0.25, 1.5, 3, 12);
      const cp = cg.attributes.position;
      for (let k = 0; k < cp.count; k++) cp.setZ(k, Math.sin(cp.getX(k) * 25 + i) * 0.025 + (cp.getY(k) < -0.5 ? 0.01 : 0));
      cg.computeVertexNormals();
      B.fabric.add(cg, mul(bunkM, T(0.2 + i * 0.105 - 1.5 + (i > 6 ? 1.3 : 0), 1.12, 0.9)), { rig: brig, color: [0.5, 0.52, 0.5] });
    }
    box(B.metal, mul(bunkM, T(0, 1.88, 0.9)), 3.4, 0.02, 0.02, { rig: brig, color: C.alu });
    addCollider(colliders, [V3(-1.72, 0, 0).applyMatrix4(bunkM), V3(1.72, 1.9, 0.92).applyMatrix4(bunkM)]);

    const hyM = wallM(-1, habC - 3.25, 0), hrig = rigFrame(habC - 3.25, 0, -HW);
    LABEL_RIG = hrig;
    box(B.paint, mul(hyM, T(0, 0.45, 0.28)), 3.2, 0.9, 0.56, { rig: hrig, color: C.white });
    for (let k = 0; k < 4; k++) rbox(B.paint, mul(hyM, T(-1.2 + k * 0.8, 0.45, 0.565)), 0.74, 0.8, 0.02, 0.008, { rig: hrig, color: C.offwhite });
    rbox(B.paint, mul(hyM, T(0, 0.96, 0.29)), 3.2, 0.12, 0.6, 0.02, { rig: hrig, color: C.lgrey });
    box(B.paint, mul(hyM, T(0, 1.02, 0.29)), 3.1, 0.02, 0.52, { rig: hrig, color: [0.16, 0.12, 0.08] });
    for (const sx of [-1.58, 1.58]) box(B.metal, mul(hyM, T(sx, 1.42, 0.3)), 0.03, 0.8, 0.03, { rig: hrig, color: C.steel });
    rbox(B.paint, mul(hyM, T(0, 1.83, 0.3)), 3.2, 0.05, 0.14, 0.015, { rig: hrig, color: C.white });
    B.led.add(new THREE.PlaneGeometry(3.05, 0.06), mul(hyM, T(0, 1.803, 0.3, Math.PI / 2, 0, 0)), { rig: hrig, color: [3.4, 3.0, 3.6] });
    label(B, mul(hyM, T(1.2, 0.92, 0.592)), 'HYDRO 1', 0.22, 0.05);
    label(B, mul(hyM, T(-1.2, 0.92, 0.592)), 'WATER', 0.16, 0.04);
    cylAB(B.paint, hyM, V3(-1.6, 1.0, 0.06), V3(-1.6, 2.3, 0.06), 0.015, 8, { color: C.white, rig: hrig });
    addCollider(colliders, [V3(-1.6, 0, 0).applyMatrix4(hyM), V3(1.6, 1.1, 0.6).applyMatrix4(hyM)]);
    const PR = rand(777);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
      const px = -1.4 + i * 0.255 + (PR() - 0.5) * 0.04, pz = 0.12 + row * 0.16;
      const base = V3(px, 1.03, pz).applyMatrix4(hyM);
      const nl = 5 + Math.floor(PR() * 4);
      for (let l = 0; l < nl; l++) hydroLeaves.push({ p: base.clone().add(V3(0, 0.005 + l * 0.012, 0)), dir: V3(Math.cos(l * 2.4 + i), 0.5 + PR() * 0.6, Math.sin(l * 2.4 + i)).normalize(), size: 0.018 + l * 0.008 + PR() * 0.01, birth: Math.max(0, l * 0.02 - 0.03 + PR() * 0.02), dry: PR() * PR() * 0.6, curl: (PR() - 0.5) * 0.6 });
      const nb = 14 + Math.floor(PR() * 10);
      for (let l = 0; l < nb; l++) {
        const h = 0.04 + Math.pow(PR(), 0.8) * 0.42, a2 = PR() * 6.28, rr = 0.02 + (h / 0.46) * (0.06 + PR() * 0.12);
        hydroLeaves.push({ p: base.clone().add(V3(Math.cos(a2) * rr, h, Math.sin(a2) * rr)), dir: V3(Math.cos(a2), 0.1 + PR() * 0.7, Math.sin(a2)).normalize(), size: 0.045 + PR() * 0.075, birth: 0.12 + (h / 0.46) * 0.38 + PR() * 0.08, dry: Math.min(1, PR() * PR() * 0.9 + 0.05), curl: (PR() - 0.5) * 1.4 });
      }
      for (let k = 0; k < 3; k++) plantStems.push({ base, h: 0.22 + PR() * 0.2, birth: 0.12, lean: [(PR() - 0.5) * 0.25, (PR() - 0.5) * 0.25] });
    }
    const VR = rand(4242);
    const walkVine = (x, b, hd, maxLen, step, turn) => {
      const pts = [];
      let L = 0;
      while (L < maxLen) {
        const sp = surfaceAt(x, b, 0.014);
        pts.push({ p: sp.p, n: sp.n, L, x, b, hd });
        hd += (VR() - 0.5) * turn;
        const lb = b < 0 ? TILE : PROFILE.at(Math.min(b, PROFILE.total)).l;
        x += Math.cos(hd) * step; b += (Math.sin(hd) * step) / lb;
        if (b > PROFILE.total - 3) { b = PROFILE.total - 3; hd = -Math.abs(hd); }
        { const sp2 = surfaceAt(x, b, 0); if (sp2.n.y < -0.9 && Math.hypot(x - habC, sp2.p.z) < 1.6) { hd += Math.PI; x += Math.cos(hd) * step * 2; } }
        if (b < -14) { b = -14; hd = Math.abs(hd); }
        if (x < habC - HL + 0.1) { x = habC - HL + 0.1; hd = Math.PI - hd; }
        if (x > habC + HL - 0.1) { x = habC + HL - 0.1; hd = Math.PI - hd; }
        L += step;
      }
      return pts;
    };
    for (let v = 0; v < (hiQ ? 52 : 34); v++) {
      const x = habC - 4.75 + VR() * 3.0, b = 3.3 + VR() * 0.6;
      const hd = VR() < 0.55 ? Math.PI / 2 + (VR() - 0.5) * 1.5 : -Math.PI / 2 + (VR() - 0.5) * 1.3;
      const maxLen = 2.5 + VR() * 5.5;
      const start = 0.08 + VR() * 0.2, span = 0.5 + VR() * 0.3;
      const pts = walkVine(x, b, hd, maxLen, 0.05, 0.34);
      vineSpecs.push({ pts, maxLen, start, span, r: 0.009 + VR() * 0.009, woody: true });
      for (let k = 8; k < pts.length - 4; k += 6 + Math.floor(VR() * 8)) {
        if (VR() < 0.4) continue;
        const pk = pts[k], t0 = pk.L / maxLen;
        const len = 0.35 + VR() * 1.4 * (1 - t0 * 0.6);
        const sp = walkVine(pk.x, pk.b, pk.hd + (VR() < 0.5 ? 1 : -1) * (0.7 + VR() * 0.9), len, 0.04, 0.6);
        vineSpecs.push({ pts: sp, maxLen: len, start: start + t0 * span + 0.03, span: span * 0.5 * (len / maxLen) + 0.08, r: 0.0035 + VR() * 0.003, woody: false, t0 });
      }
    }
    for (let c = 0; c < (hiQ ? 34 : 20); c++) {
      const x0 = habC - 4.7 + VR() * 3.0, len = 0.3 + VR() * 0.85, pts = [];
      const zf = -HW + 0.6 + VR() * 0.03;
      let L = 0, prev = null;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, p = V3(x0 + Math.sin(t * 3 + c) * 0.05 * t, 1.03 - t * len, zf + 0.02 + Math.sin(t * 2.3) * 0.03 + t * t * 0.08);
        if (prev) L += p.distanceTo(prev);
        pts.push({ p, n: V3(0, 0, 1), L }); prev = p;
      }
      const start = 0.18 + VR() * 0.25;
      vineSpecs.push({ pts, maxLen: L, start, span: 0.35, r: 0.003 + VR() * 0.003, woody: false, cascade: true });
    }
    for (let c = 0; c < 3; c++) {
      const sx = c === 2 ? 0.21 : -0.21, start = 0.25 + c * 0.06;
      const pts = [];
      const x0 = habC - 1.75 - c * 0.3;
      const floorPath = [V3(x0, 0.015, -HW + 0.25), V3((x0 + habC + sx) / 2, 0.015, -1.6 + c * 0.1), V3(habC + sx - 0.05, 0.015, -1.0)];
      let L = 0;
      floorPath.forEach((p, i) => { if (i) L += p.distanceTo(floorPath[i - 1]); pts.push({ p, n: V3(0, 1, 0), L }); });
      const ry = 0.03;
      for (let y = 0.02; y < H - 0.1; y += 0.025) {
        const a3 = (y / 0.32) * Math.PI * 2 + c;
        const p = V3(habC + sx + Math.cos(a3) * ry, y, -(SR - 0.2) + Math.sin(a3) * (ry + 0.01));
        L += p.distanceTo(pts[pts.length - 1].p);
        pts.push({ p, n: V3(Math.cos(a3), 0, Math.sin(a3)), L });
      }
      vineSpecs.push({ pts, maxLen: L, start, span: 0.5, r: 0.007, woody: true, climber: true });
    }
    for (const vs of vineSpecs) {
      if (!vs.woody || vs.climber) continue;
      for (let k = 6; k < vs.pts.length - 2; k += 9 + Math.floor(VR() * 9)) {
        const pk = vs.pts[k];
        const nearGrate = pk.b < 0 && Math.abs(Math.abs(pk.p.z) - 0.77) < 0.25;
        if (!nearGrate && VR() < 0.55) continue;
        const axis = nearGrate ? V3(1, 0, 0) : V3().subVectors(vs.pts[k + 1].p, pk.p).normalize();
        const center = nearGrate ? V3(pk.p.x, -0.01, Math.sign(pk.p.z) * 0.77) : pk.p.clone().addScaledVector(pk.n, 0.02);
        tendrils.push({ center, axis, r: nearGrate ? 0.03 : 0.012 + VR() * 0.01, len: 0.08 + VR() * 0.08, turns: 2 + VR() * 1.5, birth: vs.start + (pk.L / vs.maxLen) * vs.span + 0.04 });
      }
    }
    for (let i = 0; i < 6; i++) tendrils.push({ center: V3(habC - 0.6 + i * 0.16, 1.3, -HW + 0.07), axis: V3(1, 0, 0), r: 0.026, len: 0.1, turns: 2.5, birth: 0.45 + i * 0.04 });
    const LR = rand(5353);
    let tries = 0;
    while (litter.length < (hiQ ? 650 : 350) && tries < 20000) {
      tries++;
      const x = habC - 5.0 + LR() * 6.5, z = -HW + 0.05 + LR() * 3.4;
      const d = Math.hypot(Math.max(0, x - (habC - 1.6)), Math.max(0, z - (-HW + 0.6)));
      if (LR() > Math.exp(-d / 1.1)) continue;
      const onGrate = Math.abs(z) < 0.75;
      litter.push({ p: V3(x, onGrate ? 0.003 : 0.006, z), dir: V3(Math.cos(LR() * 6.28), 0.02, Math.sin(LR() * 6.28)).normalize(), size: 0.03 + LR() * 0.06, birth: 0.3 + LR() * 0.55, dry: 0.75 + LR() * 0.25, curl: (LR() - 0.5) * 1.6 });
    }

    const gM = wallM(1, habC - 3.75, 0), grig = rigFrame(habC - 3.75, 0, HW);
    LABEL_RIG = grig;
    box(B.paint, mul(gM, T(0, 0.45, 0.3)), 2.3, 0.9, 0.6, { rig: grig, color: C.white });
    rbox(B.paint, mul(gM, T(0, 0.92, 0.31)), 2.3, 0.04, 0.64, 0.01, { rig: grig, color: C.lgrey });
    for (let k = 0; k < 3; k++) rbox(B.paint, mul(gM, T(-0.76 + k * 0.76, 0.45, 0.605)), 0.72, 0.82, 0.02, 0.008, { rig: grig, color: C.offwhite });
    box(B.paint, mul(gM, T(0, 1.65, 0.18)), 2.3, 0.5, 0.36, { rig: grig, color: C.white });
    for (let k = 0; k < 4; k++) rbox(B.paint, mul(gM, T(-0.86 + k * 0.575, 1.65, 0.365)), 0.54, 0.46, 0.015, 0.006, { rig: grig, color: C.offwhite });
    cylAB(B.metal, gM, V3(0.7, 0.94, 0.08), V3(0.7, 1.18, 0.08), 0.02, 10, { color: C.alu, rig: grig });
    cylAB(B.metal, gM, V3(0.7, 1.18, 0.08), V3(0.7, 1.16, 0.22), 0.012, 8, { color: C.alu, rig: grig });
    label(B, mul(gM, T(-0.8, 1.32, 0.012)), 'GALLEY', 0.2, 0.05);
    label(B, mul(gM, T(0.7, 1.3, 0.012)), 'H2O', 0.1, 0.04);
    addCollider(colliders, [V3(-1.15, 0, 0).applyMatrix4(gM), V3(1.15, 1.9, 0.62).applyMatrix4(gM)]);
    LABEL_RIG = null;
    const tC = V3(habC - 2.2, 0, 0.9), trig = rigFrame(tC.x, 0, tC.z);
    rbox(B.paint, T(tC.x, 0.76, tC.z), 1.2, 0.04, 0.8, 0.015, { rig: trig, color: C.white });
    box(B.metal, T(tC.x, 0.74, tC.z), 1.16, 0.02, 0.76, { rig: trig, color: C.alu });
    cylAB(B.metal, T(tC.x, 0, tC.z), V3(0, 0.02, 0), V3(0, 0.74, 0), 0.05, 16, { color: C.steel, rig: trig });
    cylAB(B.metal, T(tC.x, 0, tC.z), V3(0, 0, 0), V3(0, 0.03, 0), 0.25, 24, { color: C.dark, rig: trig });
    for (const sx of [-0.85, 0.85]) {
      const sr = rigFrame(tC.x + sx, 0, tC.z);
      cylAB(B.metal, T(tC.x + sx, 0, tC.z), V3(0, 0, 0), V3(0, 0.44, 0), 0.03, 12, { color: C.steel, rig: sr });
      rbox(B.fabric, T(tC.x + sx, 0.47, tC.z), 0.42, 0.07, 0.42, 0.03, { rig: sr, color: C.dgrey });
      rbox(B.fabric, T(tC.x + sx * 1.22, 0.72, tC.z), 0.06, 0.45, 0.4, 0.025, { rig: sr, color: C.dgrey });
    }
    colliders.push({ min: [tC.x - 1.1, 0, tC.z - 0.42], max: [tC.x + 1.1, 0.8, tC.z + 0.42], id: 'hab.table' });

    addCollider(colliders, consoleUnit(zone, wallM(1, habC - 0.3, 0.0), 1.6, 1.95, [{ t: 'crt', w: 1, slot: 'missionBoard', y0: 0.85, sw: 1.36, sh: 0.82, dy: 0.05 }], { title: 'MISSION', seed: 41, depth: 0.14 }));
    addCollider(colliders, consoleUnit(zone, wallM(1, habC + 2.7, 0), 1.75, 1.8, [{ t: 'toggles', w: 0.4 }, { t: 'crt', w: 1, slot: 'commsLog', y0: 0.7 }, { t: 'rack', w: 0.6 }], { title: 'COMMS', seed: 51 }));
    const shelfM = wallM(1, habC + 2.7, 0.0, 0);
    rbox(B.paint, mul(shelfM, T(0, 0.82, 0.42)), 1.5, 0.03, 0.32, 0.01, { rig: rigFrame(habC + 2.7, 0.8, HW - 0.4), color: C.lgrey });
    const tallyU = mul(wallM(1, habC + 4.35, 1.38, 0.0), T(0, 0, 0.085));
    rbox(B.metal, mul(tallyU, T(0, 0, -0.006)), 0.98, 0.53, 0.012, 0.004, { rig: rigFrame(habC + 4.35, 1.38, HW), color: [0.5, 0.51, 0.5] });
    {
      const tr2 = rigFrame(habC + 4.35, 1.38, HW);
      const lm = mul(tallyU, T(0, 0.36, 0.1));
      for (const [bx, by] of [[-0.44, 0.22], [0.44, 0.22], [-0.44, -0.22], [0.44, -0.22]]) cylAB(B.metal, mul(tallyU, T(bx, by, 0)), V3(0, 0, -0.09), V3(0, 0, -0.005), 0.012, 8, { color: C.steel, rig: tr2 });
      rbox(B.paint, lm, 0.3, 0.05, 0.08, 0.012, { rig: tr2, color: C.dgrey });
      B.led.add(new THREE.PlaneGeometry(0.24, 0.035).rotateX(Math.PI / 2), mul(lm, T(0, -0.026, 0.01)), { rig: tr2, color: [5.0, 4.2, 3.2] });
      tallyLampPos = V3(0, 0.33, 0.13).applyMatrix4(mul(tr2, tallyU));
      tallyLampTgt = V3(0, -0.05, 0).applyMatrix4(mul(tr2, tallyU));
    }
    for (const [sx, sy] of [[-0.46, -0.24], [0.46, -0.24], [-0.46, 0.24], [0.46, 0.24]]) cylAB(B.metal, tallyU, V3(sx, sy, 0), V3(sx, sy, 0.008), 0.008, 8, { color: C.alu, rig: rigFrame(habC + 4.35, 1.38, HW) });
    const tg = new THREE.PlaneGeometry(0.9, 0.45);
    tallyMesh = new THREE.Mesh(tg, M.tally);
    disposables.push(tg);
    tallyMesh.receiveShadow = true;
    mount(zone, mul(tallyU, T(0, 0, 0.002)), 'tally').add(tallyMesh);
    handrail(zone, B.metal, wallM(1, habC + 2.7, 1.98), 1.7, { rigid: true });
    handrail(zone, B.metal, wallM(-1, habC - 0.2, 1.3), 1.0, { rigid: true });
    cryoBag(zone, mul(wallM(-1, habC + 3.1, 2.15, 0.22), T(-0.9, 0, 0)), 1.8, 0.2, 61, { patch: 'BUNK 1' });

    const itemBag = (fn) => { const lb = localBags(LOCAL); fn(lb); const g = new THREE.Group(); meshFromBags(lb, g); return g; };
    const mug = itemBag((lb) => { lb.paint.add(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20, 1), T(0, 0.05, 0), { color: C.white }); lb.paint.add(new THREE.TorusGeometry(0.028, 0.008, 6, 14, Math.PI), T(0.045, 0.05, 0, 0, 0, -Math.PI / 2), { color: C.white }); lb.paint.add(new THREE.CircleGeometry(0.036, 16).rotateX(-Math.PI / 2), T(0, 0.085, 0), { color: [0.12, 0.07, 0.04] }); });
    const book = itemBag((lb) => { box(lb.paint, T(0, 0.02, 0), 0.24, 0.04, 0.17, { color: C.cream }); box(lb.paint, T(0, 0.042, 0), 0.245, 0.004, 0.175, { color: [0.24, 0.29, 0.35] }); label(lb, T(0, 0.045, 0, -Math.PI / 2, 0, 0), 'book', 0.23, 0.06); });
    const tablet = itemBag((lb) => { rbox(lb.paint, T(0, 0.006, 0), 0.26, 0.012, 0.18, 0.01, { color: C.dgrey }); label(lb, T(0, 0.0125, 0, -Math.PI / 2, 0, 0), 'screen', 0.23, 0.15); });
    const jacket = itemBag((lb) => { const g = new THREE.PlaneGeometry(0.55, 0.7, 12, 14); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.03 * Math.sin(p.getX(i) * 14 + p.getY(i) * 6) + 0.015 * Math.sin(p.getY(i) * 23)); g.computeVertexNormals(); lb.fabric.add(g, T(0, 0.03, 0, -Math.PI / 2, 0, 0.3), { color: [0.44, 0.46, 0.42] }); });
    const photo = itemBag((lb) => { box(lb.paint, T(0, 0, 0), 0.14, 0.1, 0.008, { color: C.white }); label(lb, T(0, 0, 0.0045), 'photo', 0.12, 0.08); });
    const notes = itemBag((lb) => { box(lb.paint, T(0, 0.002, 0), 0.21, 0.004, 0.15, { color: C.cream }); label(lb, T(0, 0.0045, 0, -Math.PI / 2, 0, 0), 'notes', 0.2, 0.14); });
    const place = (obj, name, a, b) => {
      const holder = mount(zone, T(), 'item.' + name);
      holder.add(obj);
      const it = { name, obj, holder, a, b, set(aged) { const p = aged ? b : a; holder.matrix.copy(ringMatrix(p[0], p[1], p[2])).multiply(T(0, 0, 0, 0, p[3] || 0, 0)); holder.visible = p[4] !== false; holder.matrixWorldNeedsUpdate = true; } };
      it.set(false);
      items.push(it);
    };
    place(mug, 'mug', [habC - 2.0, 0.78, 0.75, 0.4], [habC + 3.1, 0.84, HW - 0.35, 1.2]);
    place(book, 'book', [habC + 3.3, 0.62, -HW + 0.4, 0.2], [habC - 2.35, 0.78, 1.0, -0.5]);
    place(tablet, 'tablet', [habC + 2.4, 0.84, HW - 0.36, 0.1], [habC - 1.8, 0.78, 1.05, 2.4]);
    place(jacket, 'jacket', [habC - 2.95, 0.5, 0.9, 1.6], [habC + 3.6, 1.47, -HW + 0.45, 0.4]);
    place(photo, 'photo', [habC + 2.0, 0.89, HW - 0.33, 3.14], [habC + 4.0, 1.75, HW - 0.035, 3.14]);
    place(notes, 'notes', [habC + 2.9, 0.84, HW - 0.4, 0.0, false], [habC + 0.3, 0.012, 0.3, 0.8]);
  }

  const spine = Z.spine;
  {
    const B = spine.B;
    const len = SPINE_X1 - SPINE_X0, na = Math.round(len / 0.125), la = len / na, nb = 56, lb = (Math.PI * 2 * SR) / nb;
    const ringAt = [SPINE_X0 + 0.45, SPINE_X0 + len * 0.34, SPINE_X0 + len * 0.67, SPINE_X1 - 0.3];
    padSurface(B.pad, na, nb, (a, b, P) => {
      const ph = (b / nb) * Math.PI * 2 + Math.PI / nb, cs = Math.cos(ph), sn = Math.sin(ph);
      P.p.set(SPINE_X0 + a * la, SR * cs, SR * sn); P.n.set(0, -cs, -sn); P.ta.set(1, 0, 0); P.tb.set(0, -sn, cs); P.la = la; P.lb = lb;
    }, { k: Math.max(2, K - 3), seed: 909, puff: 0.011, skip: (a) => ringAt.some(rx => Math.abs(SPINE_X0 + a * la - rx) < 0.2) });
    for (const rx of ringAt) {
      cylAB(B.paint, T(rx, 0, 0), V3(-0.3, 0, 0), V3(0.3, 0, 0), SR + 0.005, 72, { color: [0.12, 0.12, 0.125], open: true, inside: true });
      for (const dx of [-0.22, 0.0, 0.22]) torus(B.paint, T(rx + dx, 0, 0, 0, Math.PI / 2, 0), SR - 0.03, 0.03 + (dx === 0 ? 0.015 : 0), { color: C.black, ts: 96, rs: 8 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; box(B.metal, T(rx, Math.cos(a) * (SR - 0.06), Math.sin(a) * (SR - 0.06), a, 0, 0), 0.28, 0.03, 0.05, { color: C.dark }); }
    }
    for (const side of [-1, 1]) {
      const az = side > 0 ? Math.PI / 2 + 0.0 : -Math.PI / 2;
      const off = SR - 0.17;
      const cy = Math.cos(az) * off, cz = Math.sin(az) * off;
      const tY = -Math.sin(az), tZ = Math.cos(az);
      for (const sr of [-0.21, 0.21]) {
        const ry = cy + tY * sr, rz = cz + tZ * sr;
        box(B.metal, T((SPINE_X0 + SPINE_X1) / 2, ry, rz, az, 0, 0), len - 0.2, 0.04, 0.05, { color: [0.13, 0.135, 0.14] });
        for (let x = SPINE_X0 + 0.8; x < SPINE_X1 - 0.4; x += 0.9 + hash1(x * 13) * 0.6) box(B.metal, T(x, ry, rz, az, 0, 0), 0.12 + hash1(x * 7) * 0.2, 0.042, 0.052, { color: [0.62, 0.62, 0.6] });
        for (let x = SPINE_X0 + 0.6; x < SPINE_X1; x += 1.2) cylAB(B.metal, T(x, 0, 0), V3(0, ry, rz), V3(0, ry * (SR - 0.02) / off, rz * (SR - 0.02) / off), 0.012, 6, { color: C.dark });
      }
      for (let x = SPINE_X0 + 0.3; x < SPINE_X1 - 0.1; x += 0.32) {
        cylAB(B.paint, T(x, 0, 0), V3(0, cy - tY * 0.21, cz - tZ * 0.21), V3(0, cy + tY * 0.21, cz + tZ * 0.21), 0.013, 8, { color: [0.15, 0.155, 0.16] });
        const wv = 0.06 + hash1(x * 31) * 0.05;
        cylAB(B.metal, T(x, 0, 0), V3(0, cy - tY * wv, cz - tZ * wv), V3(0, cy + tY * (wv + 0.02), cz + tZ * (wv + 0.02)), 0.0138, 8, { color: [0.6, 0.6, 0.58] });
      }
      spine.wear.push({ a: V3(SPINE_X0, cy * 0.95, cz * 0.95), b: V3(SPINE_X1, cy * 0.95, cz * 0.95), r: 0.4, k: 0.55 });
      for (let x = SPINE_X0 + 1.0; x < SPINE_X1; x += 2.4) label(B, mul(spineFrame(x + 0.3, az, 0.03), T(0, 0, 0, 0, 0, Math.PI)), side > 0 ? 'TO HUB' : 'LADDER', 0.16, 0.04);
    }
    const R = rand(5151);
    let ti = 0;
    for (let x = SPINE_X0 + 1.6; x < SPINE_X1 - 0.8; x += 2.1) {
      for (const az0 of [0.62, Math.PI + 0.62]) {
        const az = ti % 2 ? -az0 : az0;
        const tilt = 0.55 * (ti % 3 === 0 ? 1 : -1);
        tubeFixture(spine, mul(spineFrame(x, az, 0.2), T(0, 0, 0, 0, 0, tilt), T(0, 0, 0, 0, -0.26, 0)), 0.95, { stand: true });
      }
      ti++;
    }
    for (let x = SPINE_X0 + 3.2; x < SPINE_X1 - 2.5; x += 5.6) {
      const az = Math.PI;
      cryoBag(spine, spineFrame(x, az, 0.2), 2.05, 0.27, Math.floor(R() * 1000), { patch: R() < 0.5 ? 'CRYO 01' : 'STOW' });
    }
    cryoBag(spine, spineFrame(SPINE_X1 - 4.4, Math.PI, 0.19), 2.1, 0.28, 77, { patch: 'CRYO 01' });
    cryoBag(spine, spineFrame(SPINE_X1 - 6.9, 0, 0.19), 2.05, 0.27, 78, { patch: 'STOW' });
    for (let x = SPINE_X0 + 6.2; x < SPINE_X1 - 8; x += 7.3) {
      cryoBag(spine, spineFrame(x, 0, 0.19), 2.0, 0.26, Math.floor(R() * 1000), { white: R() < 0.5 });
    }
    for (const az of [0.3, Math.PI - 0.3]) cableRun(spine, spineFrame((SPINE_X0 + SPINE_X1) / 2, az, 0.01), len - 0.6, 5, 300 + Math.round(az * 10));
    cylAB(B.metal, T(), V3(SPINE_X0 - 0.02, 0, 0), V3(HUB_R + 0.05, 0, 0), SR + 0.012, 72, { color: C.steel, open: true });
    torus(B.paint, T(SPINE_X0 + 0.03, 0, 0, 0, Math.PI / 2, 0), SR - 0.01, 0.04, { color: C.black, ts: 96, rs: 8 });
    spine.spots.push({ pos: V3(SPINE_X1 - 2.0, 0.6, 0.0), target: V3(SPINE_X0 + 8, -0.4, 0) });
    spine.spots.push({ pos: V3(SPINE_X0 + 10, -0.6, 0.3), target: V3(SPINE_X0, 0.4, 0) });
    for (const sy of [-1, 1]) {
      spaceColliders.push({ min: [SPINE_X0, sy > 0 ? SR - 0.08 : -SR - 0.5, -SR - 0.5], max: [SPINE_X1, sy > 0 ? SR + 0.5 : -SR + 0.08, SR + 0.5], id: 'spine.wall' });
      spaceColliders.push({ min: [SPINE_X0, -SR - 0.5, sy > 0 ? SR - 0.08 : -SR - 0.5], max: [SPINE_X1, SR + 0.5, sy > 0 ? SR + 0.5 : -SR + 0.08], id: 'spine.wall' });
    }
  }

  const hub = Z.hub;
  const hubPorts = [
    { id: 'spineHub', az: 0, open: true, label: 'M00 HABITAT A' },
    { id: 'hubLander1', az: Math.PI / 2, label: 'LANDER 1' },
    { id: 'hubCommand', az: Math.PI, label: 'M06 COMMAND' },
    { id: 'hubLander2', az: -Math.PI / 2, label: 'LANDER 2' },
  ];
  {
    const B = hub.B;
    const nA = 56, nZ = 18, la = (Math.PI * 2 * HUB_R) / nA, lz = (2 * HUB_HZ) / nZ;
    const angd = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    padSurface(B.pad, nZ, nA, (a, b, P) => {
      const z = -HUB_HZ + a * lz, ph = (b / nA) * Math.PI * 2, cs = Math.cos(ph), sn = Math.sin(ph);
      P.p.set(HUB_R * cs, HUB_R * sn, z); P.n.set(-cs, -sn, 0); P.ta.set(0, 0, 1); P.tb.set(-sn, cs, 0); P.la = lz; P.lb = la;
    }, { k: K, seed: 1212, skip: (a, b) => { const z = -HUB_HZ + a * lz, ph = (b / nA) * Math.PI * 2; return hubPorts.some(p => Math.hypot(angd(ph, p.az) * HUB_R, z) < SR + 0.2); } });
    for (const ez of [-1, 1]) {
      const nR = 3, r0 = SR + 0.45, lr = (HUB_R - r0) / nR, nT = 44;
      padSurface(B.pad, nT, nR, (a, b, P) => {
        const ph = (a / nT) * Math.PI * 2, r = r0 + b * lr, cs = Math.cos(ph), sn = Math.sin(ph);
        P.p.set(r * cs, r * sn, ez * HUB_HZ); P.n.set(0, 0, -ez); P.ta.set(-sn, cs, 0); P.tb.set(cs, sn, 0); P.la = (Math.PI * 2 * r) / nT; P.lb = lr;
      }, { k: K, seed: 1300 + ez });
      torus(B.metal, T(0, 0, ez * (HUB_HZ - 0.02)), HUB_R - 0.02, 0.06, { color: C.steel, ts: 128, rs: 8 });
    }
    for (const p of hubPorts) {
      const cs = Math.cos(p.az), sn = Math.sin(p.az);
      const Mp = mul(T(cs * HUB_R, sn * HUB_R, 0), new THREE.Matrix4().makeBasis(V3(-cs, -sn, 0), V3(0, 0, 1), V3(-sn, cs, 0)));
      const fl = [];
      const nFa = 64, nFr = 4;
      for (let i = 0; i <= nFr; i++) for (let j = 0; j <= nFa; j++) {
        const rr = SR + (i / nFr) * 0.48, a = (j / nFa) * Math.PI * 2;
        const arc = Math.cos(a) * rr, zz = Math.sin(a) * rr, ph = p.az + arc / HUB_R, rad = HUB_R - 0.045;
        fl.push(Math.cos(ph) * rad, Math.sin(ph) * rad, zz);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
      const fi = [];
      for (let i = 0; i < nFr; i++) for (let j = 0; j < nFa; j++) { const a = i * (nFa + 1) + j, b = a + nFa + 1; fi.push(a, b, a + 1, b, b + 1, a + 1); }
      fg.setIndex(fi); fg.computeVertexNormals();
      const nn = fg.attributes.normal;
      if (nn.getX(0) * cs + nn.getY(0) * sn > 0) invert(fg);
      B.paint.add(fg, new THREE.Matrix4(), { color: [0.58, 0.58, 0.58] });
      torus(B.paint, mul(Mp, T(0.07, 0, 0, 0, Math.PI / 2, 0)), SR + 0.03, 0.05, { color: C.black, ts: 96, rs: 10 });
      torus(B.paint, mul(Mp, T(0.05, 0, 0, 0, Math.PI / 2, 0)), SR + 0.3, 0.014, { color: C.black, ts: 96 });
      label(B, mul(Mp, T(0.05, SR + 0.24, 0, 0, Math.PI / 2, 0)), p.label, 0.46, 0.075);
      const depth = p.open ? 0.32 : 0.9;
      if (!p.open) {
        cylAB(B.metal, Mp, V3(-depth, 0, 0), V3(0.0, 0, 0), SR, 64, { color: C.steel, open: true, inside: true });
        hatch(hub, p.id, mul(Mp, T(-depth + 0.05, 0, 0)), { r: SR - 0.06, label: null, depth: 0.02, flangeColor: [0.3, 0.3, 0.3], stripes: false });
      }
      for (let k = 0; k < 2; k++) { const zz = (k ? 1 : -1) * (SR + 0.62); handrail(hub, B.metal, mul(Mp, T(0.0, zz, 0, 0, Math.PI / 2, 0), T(0, 0, 0, 0, 0, Math.PI / 2)), 1.4, { color: C.lgrey }); }
    }
    const axial = [{ id: 'hubRangerB', z: -1, label: 'DOCK PORT B' }, { id: 'hubRangerA', z: 1, label: 'DOCK PORT A', open: true }];
    for (const p of axial) {
      const Mp = T(0, 0, p.z * HUB_HZ, 0, p.z > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      B.paint.add(flangeGeo(SR, SR + 0.47, 0.05), Mp, { color: [0.58, 0.58, 0.58] });
      torus(B.paint, mul(Mp, T(0.07, 0, 0, 0, Math.PI / 2, 0)), SR + 0.03, 0.05, { color: C.black, ts: 96, rs: 10 });
      torus(B.paint, mul(Mp, T(0.058, 0, 0, 0, Math.PI / 2, 0)), SR + 0.32, 0.012, { color: C.black, ts: 96 });
      label(B, mul(Mp, T(0.0595, SR + 0.24, 0, 0, Math.PI / 2, 0)), p.label, 0.46, 0.075);
      if (!p.open) {
        cylAB(B.metal, Mp, V3(-0.5, 0, 0), V3(0, 0, 0), SR, 64, { color: C.steel, open: true, inside: true });
        hatch(hub, p.id, mul(Mp, T(-0.45, 0, 0)), { r: SR - 0.06, label: null, depth: 0.02, flangeColor: [0.3, 0.3, 0.3], stripes: false });
      }
    }
    for (const sz of [1, -1]) {
      const z0 = HUB_HZ + (sz < 0 ? 0.5 : 0), dl = DOCK_Z - z0, dna = Math.round(dl / 0.25), dla = dl / dna, dnb = 28, dlb = (Math.PI * 2 * SR) / dnb;
      padSurface(B.pad, dna, dnb, (a, b, P) => {
        const ph = (b / dnb) * Math.PI * 2, cs = Math.cos(ph), sn = Math.sin(ph);
        P.p.set(SR * cs, SR * sn, sz * (z0 + a * dla)); P.n.set(-cs, -sn, 0); P.ta.set(0, 0, sz); P.tb.set(-sn, cs, 0); P.la = dla; P.lb = dlb;
      }, { k: K, seed: 1414 + sz, puff: 0.018, skip: (a) => Math.abs(z0 + a * dla - (DOCK_Z - 0.2)) < 0.25 });
      for (const dz of [DOCK_Z - 0.3, DOCK_Z - 0.12, DOCK_Z]) torus(B.paint, T(0, 0, sz * dz), SR - 0.02, 0.035, { color: C.black, ts: 96, rs: 8 });
      cylAB(B.metal, T(), V3(0, 0, sz * (DOCK_Z - 0.62)), V3(0, 0, sz * (DOCK_Z + 0.05)), SR + 0.005, 72, { color: C.steel, open: true, inside: true });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; box(B.metal, T(Math.cos(a) * (SR - 0.05), Math.sin(a) * (SR - 0.05), sz * (DOCK_Z - 0.2), 0, 0, a), 0.06, 0.08, 0.18, { color: C.yellow }); }
      B.paint.add(new THREE.RingGeometry(SR - 0.12, SR + 0.02, 72, 1), T(0, 0, sz * (DOCK_Z + 0.04), 0, sz > 0 ? Math.PI : 0, 0), { color: C.dgrey });
      label(B, mul(T(SR - 0.04, 0, sz * (DOCK_Z - 0.75), 0, -Math.PI / 2, -Math.PI / 2), T(0, 0, 0, 0, 0, sz > 0 ? 0 : Math.PI)), sz > 0 ? 'RANGER 1' : 'RANGER 2', 0.36, 0.06);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; handrail(hub, B.metal, mul(T(Math.cos(a) * (SR - 0.02), Math.sin(a) * (SR - 0.02), sz * (z0 + DOCK_Z) / 2), new THREE.Matrix4().makeBasis(V3(0, 0, sz), V3(-Math.sin(a), Math.cos(a), 0).multiplyScalar(sz), V3(-Math.cos(a), -Math.sin(a), 0))), dl - 0.7, { color: C.lgrey }); }
      for (const sy of [-1, 1]) {
        const zA = sz > 0 ? HUB_HZ : -DOCK_Z, zB = sz > 0 ? DOCK_Z : -HUB_HZ;
        spaceColliders.push({ min: [sy > 0 ? SR - 0.08 : -SR - 0.5, -SR - 0.5, zA], max: [sy > 0 ? SR + 0.5 : -SR + 0.08, SR + 0.5, zB], id: 'dock.wall' });
        spaceColliders.push({ min: [-SR - 0.5, sy > 0 ? SR - 0.08 : -SR - 0.5, zA], max: [SR + 0.5, sy > 0 ? SR + 0.5 : -SR + 0.08, zB], id: 'dock.wall' });
      }
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8, r = HUB_R - 0.02;
      handrail(hub, B.metal, mul(T(Math.cos(a) * r, Math.sin(a) * r, 0), new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(-Math.sin(a), Math.cos(a), 0), V3(-Math.cos(a), -Math.sin(a), 0))), 3.6, { color: C.lgrey });
    }
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4 + 0.18, r = HUB_R - 0.05;
      for (const zz of [-1.1, 1.1]) tubeFixture(hub, mul(T(Math.cos(a) * r, Math.sin(a) * r, zz), new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(-Math.sin(a), Math.cos(a), 0), V3(-Math.cos(a), -Math.sin(a), 0))), 0.95);
    }
    for (const [a, zz] of [[0.6, -1.6], [2.4, 1.5], [3.9, -0.9]]) {
      const Mb = mul(frameN(V3(Math.cos(a) * (HUB_R - 0.2), Math.sin(a) * (HUB_R - 0.2), zz), V3(-Math.sin(a), Math.cos(a), 0), V3(-Math.cos(a), -Math.sin(a), 0)), T(-0.85, 0, 0));
      cryoBag(hub, Mb, 1.7, 0.2, 700 + Math.round(a * 10), { white: a > 3 });
    }
    hub.spots.push({ pos: V3(0, 1.6, -1.8), target: V3(0, -1.0, 1.5) });
    hub.spots.push({ pos: V3(-1.4, -1.2, 1.8), target: V3(1.0, 1.0, -1.2) });
    const slabWithHole = (axis, sign, half, th, holeHalf, lenAlong) => {
      const out = [];
      const o = [0, 1, 2].filter(i => i !== axis);
      const make = (a0, a1, b0, b1) => { const mn = [0, 0, 0], mx = [0, 0, 0]; mn[axis] = sign > 0 ? half - 0.05 : -half - th; mx[axis] = sign > 0 ? half + th : -half + 0.05; mn[o[0]] = a0; mx[o[0]] = a1; mn[o[1]] = b0; mx[o[1]] = b1; out.push({ min: mn, max: mx, id: 'hub.wall' }); };
      const L = lenAlong;
      if (!holeHalf) { make(-L, L, -L, L); return out; }
      make(-L, -holeHalf, -L, L); make(holeHalf, L, -L, L); make(-holeHalf, holeHalf, -L, -holeHalf); make(-holeHalf, holeHalf, holeHalf, L);
      return out;
    };
    const hh = SR * 0.8;
    spaceColliders.push(...slabWithHole(0, 1, HUB_R * 0.92, 0.5, hh, HUB_R), ...slabWithHole(0, -1, HUB_R * 0.92, 0.5, 0, HUB_R), ...slabWithHole(1, 1, HUB_R * 0.92, 0.5, 0, HUB_R), ...slabWithHole(1, -1, HUB_R * 0.92, 0.5, 0, HUB_R));
    spaceColliders.push(...slabWithHole(2, 1, HUB_HZ, 0.5, hh, HUB_R), ...slabWithHole(2, -1, HUB_HZ, 0.5, hh, HUB_R));
  }

  for (const z of Object.values(zones)) {
    const ms = meshFromBags(z.B, group);
    for (const m of ms) { m.name = `${z.id}.${m.material.name}`; z.meshes.push(m); }
    z.B = null;
    const bs = new THREE.Box3();
    for (const m of z.meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bs.union(m.geometry.boundingBox); }
    z.box = bs;
    z.center = bs.getCenter(V3());
    z.radius = bs.getSize(V3()).length() / 2;
  }

  const tallyLamp = new THREE.SpotLight(0xfff0dc, 0, 2.2, 0.75, 0.6, 2);
  tallyLamp.name = 'endi.tallyLamp';
  if (tallyLampPos) { tallyLamp.position.copy(tallyLampPos); tallyLamp.target.position.copy(tallyLampTgt); }
  group.add(tallyLamp); group.add(tallyLamp.target);
  extraLights.push(tallyLamp);
  const occMat = new THREE.MeshBasicMaterial({ name: 'endi.occluder', colorWrite: false, depthWrite: false });
  occMat.shadowSide = THREE.DoubleSide;
  const occluder = (zone, g, m) => { const o = new THREE.Mesh(g, occMat); o.applyMatrix4(m); o.castShadow = true; o.receiveShadow = false; o.layers.set(LAYER_SUN); o.name = zone.id + '.occluder'; group.add(o); zone.meshes.push(o); disposables.push(g); };
  occluder(Z.hub, new THREE.CylinderGeometry(HUB_R + 0.14, HUB_R + 0.14, 2 * HUB_HZ + 0.3, 40, 1, false), T(0, 0, 0, Math.PI / 2, 0, 0));
  for (const sz of [1, -1]) occluder(Z.hub, new THREE.CylinderGeometry(SR + 0.12, SR + 0.12, DOCK_Z - HUB_HZ + 0.2, 32, 1, false), T(0, 0, sz * (HUB_HZ + DOCK_Z) / 2 + sz * 0.1, Math.PI / 2, 0, 0));
  occluder(Z.spine, new THREE.CylinderGeometry(SR + 0.14, SR + 0.14, SPINE_X1 - SPINE_X0, 32, 1, true), T((SPINE_X0 + SPINE_X1) / 2, 0, 0, 0, 0, Math.PI / 2));
  const tubeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 16, 1);
  disposables.push(tubeGeo);
  const tubeMesh = new THREE.InstancedMesh(tubeGeo, M.tube, tubes.length);
  tubeMesh.frustumCulled = false;
  tubeMesh.name = 'tubeLights';
  {
    const m = new THREE.Matrix4(), q4 = new THREE.Quaternion(), col = new THREE.Color();
    tubes.forEach((t, i) => {
      const d = V3().subVectors(t.b, t.a), len = d.length();
      q4.setFromUnitVectors(V3(0, 1, 0), d.normalize());
      m.compose(V3().addVectors(t.a, t.b).multiplyScalar(0.5), q4, V3(1, len, 1));
      tubeMesh.setMatrixAt(i, m);
      t.m0 = m.clone();
      tubeMesh.setColorAt(i, col.setRGB(1, 1, 1));
    });
  }
  group.add(tubeMesh);
  const clutter = (() => {
    const geos = [
      new THREE.BoxGeometry(0.17, 0.035, 0.12), new THREE.CylinderGeometry(0.04, 0.036, 0.1, 14), new THREE.PlaneGeometry(0.21, 0.29, 4, 4),
      new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), new RoundedBoxGeometry(0.28, 0.12, 0.2, 2, 0.04),
    ];
    const pp = geos[2].attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, 0.02 * Math.sin(pp.getX(i) * 20) * Math.sin(pp.getY(i) * 13)); geos[2].computeVertexNormals();
    for (const g of geos) { g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); disposables.push(g); }
    const cols = [[0.5, 0.49, 0.46], [0.6, 0.6, 0.58], [0.66, 0.64, 0.57], [0.1, 0.1, 0.11], [0.4, 0.42, 0.38]];
    const R = rand(8181), defs = [];
    const floorItem = (zid, s0, s1, birth) => {
      const side = R() < 0.5 ? -1 : 1, z = R() < 0.3 ? (R() - 0.5) * 1.2 : side * (0.86 + R() * 0.3), s2 = s0 + R() * (s1 - s0);
      const zz = zid.startsWith('t') ? (R() - 0.5) * 1.0 : z;
      const type = Math.floor(R() * 5);
      const tilt = type === 1 && R() < 0.5 ? Math.PI / 2 : 0;
      defs.push({ type, zone: zid, ring: [s2, type === 2 ? 0.006 : type === 4 ? 0.06 : type === 1 ? (tilt ? 0.04 : 0.05) : type === 3 ? 0.006 : 0.018, zz], yaw: R() * 6.28, tilt: type === 3 ? Math.PI / 2 : tilt, birth, float: false });
    };
    for (const m of MODS) for (let i = 0; i < 9; i++) floorItem(m.id, m.c - HL + 0.4, m.c + HL - 0.4, 4 + R() * 46);
    for (const tid of ['t1', 't2', 't3']) { const z = zones[tid]; for (let i = 0; i < 4; i++) floorItem(tid, z.s0 + 0.5, z.s1 - 0.5, 10 + R() * 45); }
    for (let i = 0; i < 6; i++) floorItem('lab', -3.5, 3.5, 2 + R() * 20);
    for (let i = 0; i < 4; i++) defs.push({ type: 4, zone: 'lab', ring: [-2.9 + (R() - 0.5) * 1.5, 0.06, 0.55 + R() * 0.2], yaw: R() * 6.28, tilt: 0, birth: 48 + R() * 4, float: false });
    for (let i = 0; i < 20; i++) { const a = R() * 6.28, r = R() * 1.7; defs.push({ type: Math.floor(R() * 4), zone: 'hub', pos: V3(Math.cos(a) * r, Math.sin(a) * r, (R() - 0.5) * 3.6), birth: 3 + R() * 50, float: true, spin: V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), w: 0.2 + R() * 0.6, ph: R() * 6.28 }); }
    for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = R() * 0.7; defs.push({ type: Math.floor(R() * 4), zone: 'spine', pos: V3(SPINE_X0 + 1 + R() * (SPINE_X1 - SPINE_X0 - 3), Math.cos(a) * r, Math.sin(a) * r), birth: 6 + R() * 50, float: true, spin: V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), w: 0.2 + R() * 0.5, ph: R() * 6.28 }); }
    const meshes = geos.map((g, i) => {
      const n = defs.filter(d => d.type === i).length || 1;
      const im = new THREE.InstancedMesh(g, M.paint, n);
      im.frustumCulled = false; im.name = 'clutter' + i; im.count = n;
      group.add(im);
      return im;
    });
    const idx = [0, 0, 0, 0, 0];
    const col = new THREE.Color(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    for (const d of defs) {
      d.slot = idx[d.type]++;
      const c = cols[d.type]; col.setRGB(c[0] * (0.85 + R() * 0.3), c[1] * (0.85 + R() * 0.3), c[2] * (0.85 + R() * 0.3));
      meshes[d.type].setColorAt(d.slot, col);
      if (!d.float) { const fr = ringMatrix(d.ring[0], d.ring[1], d.ring[2]); d.base = fr.multiply(T(0, 0, 0, 0, d.yaw, 0)).multiply(T(0, 0, 0, d.type === 2 ? -Math.PI / 2 : d.tilt, 0, 0)); }
    }
    const apply = (years, t) => {
      for (const d of defs) {
        const on = years >= d.birth;
        if (!on) { m4.makeScale(0, 0, 0); meshes[d.type].setMatrixAt(d.slot, m4); continue; }
        if (d.float) {
          q.setFromAxisAngle(d.spin, t * d.w + d.ph);
          m4.compose(V3(d.pos.x + Math.sin(t * 0.07 + d.ph) * 0.15, d.pos.y + Math.cos(t * 0.05 + d.ph) * 0.12, d.pos.z + Math.sin(t * 0.04 + d.ph * 2) * 0.15), q, V3(1, 1, 1));
        } else m4.copy(d.base);
        meshes[d.type].setMatrixAt(d.slot, m4);
      }
      for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    };
    return { apply, meshes, hasFloat: defs.some(d => d.float) };
  })();

  let hydroMesh = null, vineMesh = null;
  {
    const lgP = [], lgI = [], NU = 5, NV = 2;
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
      const u = i / NU, v = (j / NV) * 2 - 1, w = 0.34 * Math.pow(Math.sin(Math.PI * Math.min(0.999, u * 0.97 + 0.015)), 0.75) * (1 - 0.25 * u);
      lgP.push(u, v * w, 0.1 * u * (1 - u) - Math.abs(v) * w * 0.18);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const q0 = i * (NV + 1) + j, q1 = q0 + NV + 1; lgI.push(q0, q1, q0 + 1, q1, q1 + 1, q0 + 1); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lgP, 3));
    lg.setIndex(lgI); lg.computeVertexNormals();
    disposables.push(lg);
    const VR = rand(999);
    const green = () => { const k = VR(); const c = k < 0.45 ? [0.03, 0.085, 0.025] : k < 0.85 ? [0.055, 0.13, 0.035] : [0.1, 0.19, 0.045]; const m = 0.62 + VR() * 0.4; return c.map(x => x * m); };
    const leaves = [];
    const pushLeaf = (p, n, dir, size, birth, dry, curl, lit) => leaves.push({ pos: ringToEndurance(p.x, p.y, p.z), frame: ringMatrix(p.x, p.y, p.z), dir, up: n, size, birth, dry, curl, litter: lit ? 1 : 0, col: green() });
    for (const h of hydroLeaves) pushLeaf(h.p, V3(0, 1, 0), h.dir, h.size, h.birth, h.dry, h.curl, false);
    for (const l of litter) pushLeaf(l.p, V3(0, 1, 0), l.dir, l.size, l.birth, l.dry, l.curl, true);
    const stem = { P: [], N: [], C: [], I: [], B: [] };
    const pushTube = (pts, r0, r1, rs, birth0, birthSpan, col) => {
      if (pts.length < 3) return;
      const curve = new THREE.CatmullRomCurve3(pts);
      const len = curve.getLength(), seg = Math.max(6, Math.round(len / 0.05));
      const tg = new THREE.TubeGeometry(curve, seg, 1, rs, false);
      const tp = tg.attributes.position, tn = tg.attributes.normal, base = stem.P.length / 3;
      for (let i = 0; i < tp.count; i++) {
        const ring = Math.floor(i / (rs + 1)), t = ring / seg, cpt = curve.getPointAt(Math.min(1, t));
        const rad = r0 + (r1 - r0) * t;
        const sx = cpt.x + (tp.getX(i) - cpt.x) * rad, sy = cpt.y + (tp.getY(i) - cpt.y) * rad, sz = cpt.z + (tp.getZ(i) - cpt.z) * rad;
        const th = THETA0 + sx / RF, c = Math.cos(th), sn = Math.sin(th), r = RF - sy;
        stem.P.push(r * c, r * sn, sz);
        const ns = tn.getX(i), ny = tn.getY(i);
        stem.N.push(-ns * sn - ny * c, ns * c - ny * sn, tn.getZ(i));
        stem.B.push(birth0 + t * birthSpan);
        const vv = 0.85 + 0.3 * hash1(ring * 7 + base);
        stem.C.push(col[0] * vv, col[1] * vv, col[2] * vv);
      }
      for (const ix of tg.index.array) stem.I.push(base + ix);
      tg.dispose();
    };
    for (const v of vineSpecs) {
      const pts = v.pts.map(p => p.p);
      const col = v.woody ? [0.2, 0.15, 0.1] : [0.11, 0.15, 0.05];
      pushTube(pts, v.r, v.woody ? v.r * 0.35 : v.r * 0.4, v.woody ? 5 : 4, v.start, v.span, col);
      const step = v.woody ? 1 : 1;
      for (let k = 2; k < v.pts.length - 1; k += step) {
        const pt = v.pts[k], nx = v.pts[k + 1];
        const t = pt.L / v.maxLen;
        const nearLight = pt.p.y > 1.45 && pt.p.y < 2.3 && pt.p.x < habC - 1.4;
        const nearTray = pt.p.x < habC - 1.3 && pt.p.y > 0.5 && pt.p.y < 2.2 && pt.p.z < -HW + 0.9;
        const keep = v.cascade ? 0.85 : v.climber ? 0.4 : v.woody ? 0.2 + 0.75 * Math.exp(-t * 2.0) + (nearLight ? 0.3 : 0) + (nearTray ? 0.3 : 0) : 0.6 + 0.3 * (1 - t);
        if (VR() > keep) continue;
        const along = V3().subVectors(nx.p, pt.p).normalize();
        const nL = (v.woody && t < 0.4) || nearTray ? 2 + Math.floor(VR() * 3) : 1;
        for (let side = 0; side < nL; side++) {
          const sgn = VR() < 0.5 ? -1 : 1;
          const dir = along.clone().multiplyScalar(0.2 + VR() * 0.5).add(V3().crossVectors(pt.n, along).multiplyScalar(sgn * (0.5 + VR() * 0.5))).add(pt.n.clone().multiplyScalar(0.2 + VR() * 0.7)).normalize();
          const size = (v.woody ? 0.045 + VR() * 0.07 * (1.2 - t * 0.6) : 0.03 + VR() * 0.045) * (nearLight ? 1.25 : 1);
          const dry = Math.min(1, 0.05 + 0.6 * Math.pow(VR(), 1.6) + 0.35 * (1 - t) * VR());
          pushLeaf(pt.p.clone().addScaledVector(pt.n, 0.006), pt.n.clone(), dir, size, v.start + t * v.span + 0.015, dry, (VR() - 0.5) * 1.4, false);
        }
      }
    }
    for (const td of tendrils) {
      const ax = td.axis.clone().normalize(), u1 = Math.abs(ax.y) < 0.9 ? V3(0, 1, 0).cross(ax).normalize() : V3(1, 0, 0).cross(ax).normalize(), u2 = V3().crossVectors(ax, u1);
      const pts = [];
      const n = Math.round(td.turns * 14);
      for (let i = 0; i <= n; i++) { const t = i / n, a4 = t * td.turns * Math.PI * 2, rr = td.r * (1 - 0.3 * t); pts.push(td.center.clone().addScaledVector(ax, (t - 0.5) * td.len).addScaledVector(u1, Math.cos(a4) * rr).addScaledVector(u2, Math.sin(a4) * rr)); }
      pushTube(pts, 0.0022, 0.0012, 3, td.birth, 0.05, [0.13, 0.15, 0.06]);
    }
    for (const ps of plantStems) {
      const bp = ps.base, pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(bp.clone().add(V3(ps.lean[0] * t * t + Math.sin(i * 1.3) * 0.01, t * ps.h, ps.lean[1] * t * t + Math.cos(i * 1.1) * 0.01))); }
      pushTube(pts, 0.005, 0.0018, 4, ps.birth, 0.38, [0.12, 0.16, 0.05]);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(stem.P, 3));
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(stem.N, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(stem.C, 3));
    sg.setAttribute('aBirth', new THREE.Float32BufferAttribute(stem.B, 1));
    sg.setIndex(new THREE.BufferAttribute(stem.P.length / 3 > 65535 ? new Uint32Array(stem.I) : new Uint16Array(stem.I), 1));
    sg.computeBoundingSphere();
    disposables.push(sg);
    vineMesh = new THREE.Mesh(sg, M.stem);
    vineMesh.name = 'hab.vines';
    vineMesh.castShadow = true; vineMesh.layers.enable(LAYER_PLANT);
    group.add(vineMesh); Z.hab.meshes.push(vineMesh);
    hydroMesh = new THREE.InstancedMesh(lg, M.leaf, leaves.length);
    const attr = new Float32Array(leaves.length * 4);
    const m = new THREE.Matrix4(), col = new THREE.Color(), basis = new THREE.Matrix4();
    leaves.forEach((l, i) => {
      const dx = l.dir.clone().normalize();
      const ref = Math.abs(dx.dot(l.up)) > 0.95 ? V3(1, 0, 0) : l.up;
      const zx = V3().crossVectors(dx, ref).normalize();
      const yx = V3().crossVectors(zx, dx).normalize();
      basis.makeBasis(dx, zx.clone().negate(), yx);
      const rot = l.frame.clone().setPosition(0, 0, 0).multiply(basis);
      m.copy(rot).scale(V3(l.size, l.size, l.size)).setPosition(l.pos);
      hydroMesh.setMatrixAt(i, m);
      hydroMesh.setColorAt(i, col.setRGB(l.col[0], l.col[1], l.col[2]));
      attr[i * 4] = l.birth; attr[i * 4 + 1] = l.dry; attr[i * 4 + 2] = l.curl; attr[i * 4 + 3] = l.litter;
    });
    lg.setAttribute('aLeaf', new THREE.InstancedBufferAttribute(attr, 4));
    hydroMesh.name = 'hab.leaves';
    hydroMesh.castShadow = true; hydroMesh.layers.enable(LAYER_PLANT);
    hydroMesh.computeBoundingSphere();
    group.add(hydroMesh); Z.hab.meshes.push(hydroMesh);
  }

  const shadowSize = q === 'low' ? 1024 : q === 'ultra' ? 4096 : 2048;
  const lightPool = [];
  const NPL = hiQ ? 24 : q === 'low' ? 6 : 12;
  for (let i = 0; i < NPL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 3.0, 2);
    l.name = 'endi.tubeLight' + i;
    group.add(l);
    lightPool.push({ light: l, tube: null, w: 0 });
  }
  const spotPool = [];
  const NSP = q === 'low' ? 1 : hiQ ? 3 : 2;
  for (let i = 0; i < NSP; i++) {
    const l = new THREE.SpotLight(0xffffff, 0, 9, 1.2, 0.9, 2);
    l.castShadow = true;
    l.shadow.mapSize.set(shadowSize / 2, shadowSize / 2);
    l.shadow.camera.near = 0.15; l.shadow.camera.far = 9;
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = 3;
    l.shadow.camera.layers.set(LAYER_SPOT);
    group.add(l); group.add(l.target);
    spotPool.push({ light: l, tubes: [] });
  }
  const sun = new THREE.DirectionalLight(0xfff0dc, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015; sun.shadow.radius = 1.5;
  sun.shadow.camera.layers.set(LAYER_SUN);
  group.add(sun); group.add(sun.target);

  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  disposables.push(beamGeo);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(1.0, 0.88, 0.7) }, uI: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vA; varying vec3 vU; varying float vR; varying float vL;
void main(){
  mat4 mi = modelViewMatrix * instanceMatrix;
  vec4 mv = mi * vec4(position, 1.0);
  vP = mv.xyz;
  vA = (mi * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 ay = (mi * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vL = length(ay); vU = ay / max(vL, 1e-5);
  vR = length((mi * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform vec3 uCol; uniform float uI; varying vec3 vP; varying vec3 vA; varying vec3 vU; varying float vR; varying float vL;
void main(){
  vec3 v = normalize(vP);
  float b = dot(v, vU), d1 = dot(v, vA), e = dot(vU, vA);
  float den = max(1.0 - b * b, 1e-4);
  float t = (d1 - b * e) / den, sp = (b * d1 - e) / den;
  float dist = length(v * t - vA - vU * sp);
  float k = clamp(sp / max(vL, 1e-3), 0.0, 1.0);
  float core = 1.0 - smoothstep(0.0, vR, dist);
  float a = core * core * (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.1, k) * clamp(vR * 2.0 * sqrt(max(0.0, 1.0 - dist * dist / (vR * vR))) / 0.5, 0.0, 1.0);
  gl_FragColor = vec4(uCol * max(a, 0.0) * uI, 1.0);
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, Math.max(1, portholes.length));
  beams.frustumCulled = false;
  beams.name = 'sunBeams';
  beams.renderOrder = 5;
  group.add(beams);

  const NDUST = hiQ ? 3000 : q === 'medium' ? 1800 : 900;
  const dustGeo = new THREE.BufferGeometry();
  {
    const R = rand(8080), seeds = new Float32Array(NDUST * 4);
    for (let i = 0; i < NDUST * 4; i++) seeds[i] = R();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NDUST * 3), 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    dustGeo.boundingSphere = new THREE.Sphere(V3(), 1e5);
  }
  disposables.push(dustGeo);
  const portU = Array.from({ length: 8 }, () => new THREE.Vector4());
  const portN = Array.from({ length: 8 }, () => new THREE.Vector3());
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBend: { value: 1 }, uRF: { value: RF }, uTh0: { value: THETA0 }, uAnom: { value: 0 }, uAmount: { value: 0.3 }, uPx: { value: 1080 },
      uLight: { value: 1 }, uSunI: { value: 0 }, uMin: { value: V3() }, uMax: { value: V3(1, 1, 1) }, uSun: { value: V3(0, 0, 1) }, uPorts: { value: portU }, uPortN: { value: portN }, uNP: { value: 0 },
      uCol: { value: new THREE.Color(1.0, 0.92, 0.8) },
    },
    vertexShader: `attribute vec4 aSeed;
uniform float uTime, uBend, uRF, uTh0, uAnom, uAmount, uPx, uLight, uSunI;
uniform vec3 uMin, uMax, uSun; uniform vec4 uPorts[8]; uniform vec3 uPortN[8]; uniform int uNP;
varying float vA;
void main(){
  vec3 sz = uMax - uMin;
  vec3 drift = vec3(sin(uTime * 0.07 * (0.5 + aSeed.w) + aSeed.x * 30.0), cos(uTime * 0.05 + aSeed.y * 40.0), sin(uTime * 0.06 * (0.5 + aSeed.w) + aSeed.z * 20.0)) * 0.12 + vec3(0.004, -0.0015, 0.003) * uTime * (0.3 + aSeed.w);
  vec3 q = uMin + fract(aSeed.xyz + drift / sz) * sz;
  if (uAnom > 0.0) { float g = 0.075; vec3 sn = q; sn.y = (floor(q.y / g) + 0.5) * g; sn.z = (floor(q.z / g) + 0.5) * g; q = mix(q, sn, uAnom * step(aSeed.w, 0.25 + 0.75 * uAnom)); }
  vec3 p = q;
  if (uBend > 0.5) { float th = uTh0 + q.x / uRF; float r = uRF - q.y; p = vec3(r * cos(th), r * sin(th), q.z); }
  float lit = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNP) break;
    float f = dot(uPortN[i], uSun);
    if (f <= 0.0) continue;
    vec3 d = p - uPorts[i].xyz;
    float al = dot(d, -uSun);
    if (al < 0.0) continue;
    float pr = length(d + uSun * al);
    lit += smoothstep(uPorts[i].w * 1.15, uPorts[i].w * 0.55, pr) * exp(-al * 0.22) * f;
  }
  vA = (uLight * 0.022 + lit * 1.6 * uSunI) * step(aSeed.w, uAmount) * (1.0 + uAnom * 1.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float psz = uPx * 0.0022 * (0.5 + aSeed.w) / max(0.05, -mv.z);
  gl_PointSize = clamp(psz, 3.0, 9.0);
  vA *= min(1.0, psz / 3.0) * min(1.0, psz / 3.0) * 0.6;
}`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uCol * vA * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const NSH = hiQ ? 7000 : q === 'medium' ? 4000 : 2000;
  const shGeo = new THREE.BufferGeometry();
  {
    const R = rand(9090), seeds = new Float32Array(NSH * 4);
    for (let i = 0; i < NSH * 4; i++) seeds[i] = R();
    shGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NSH * 3), 3));
    shGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    shGeo.boundingSphere = new THREE.Sphere(V3(), 1e5);
  }
  disposables.push(shGeo);
  const shP = Array.from({ length: 4 }, () => new THREE.Vector4()), shN = Array.from({ length: 4 }, () => new THREE.Vector3());
  const shMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: V3(0, 0, 1) }, uSP: { value: shP }, uSN: { value: shN }, uNum: { value: 0 }, uAnom: { value: 0 }, uI: { value: 0 }, uPx: { value: 1080 }, uFT: { value: V3(1, 0, 0) }, uFU: { value: V3(0, 1, 0) }, uFZ: { value: V3(0, 0, 1) }, uCol: { value: new THREE.Color(1.0, 0.93, 0.82) } },
    vertexShader: `attribute vec4 aSeed;
uniform float uTime, uAnom, uI, uPx; uniform vec3 uSun, uFT, uFU, uFZ; uniform vec4 uSP[4]; uniform vec3 uSN[4]; uniform int uNum;
varying float vA;
void main(){
  vA = 0.0;
  int idx = int(floor(aSeed.x * float(uNum)));
  if (uNum == 0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  idx = min(idx, uNum - 1);
  vec4 P = uSP[idx];
  vec3 dir = -uSun;
  vec3 a1 = normalize(cross(dir, abs(dir.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  vec3 a2 = cross(dir, a1);
  float along = fract(aSeed.y + uTime * 0.004 * (aSeed.w - 0.5)) * mix(3.4, 2.6, uAnom);
  float ang = aSeed.z * 6.2831 + uTime * 0.04 * (aSeed.w - 0.5);
  float rr = sqrt(fract(aSeed.w * 7.13)) * P.w * 1.05;
  vec3 p = P.xyz + dir * along + (a1 * cos(ang) + a2 * sin(ang)) * rr;
  p += (a1 * sin(uTime * 0.31 * (0.5 + aSeed.w) + aSeed.x * 40.0) + a2 * cos(uTime * 0.23 + aSeed.y * 50.0) + dir * sin(uTime * 0.17 + aSeed.z * 30.0)) * 0.012;
  vec3 rel = p - P.xyz;
  float g = 0.065;
  float ra = dot(rel, a1), rb = dot(rel, a2);
  vec3 sn = P.xyz + dir * dot(rel, dir) + a1 * (floor(ra / g) + 0.5) * g + a2 * (floor(rb / g) + 0.5) * g;
  float sel = step(fract(aSeed.w * 3.7), 0.15 + 0.85 * uAnom);
  p = mix(p, sn, uAnom * sel);
  vec3 d = p - P.xyz;
  float al = dot(d, dir);
  float perp = length(d - dir * al);
  vA = uI * smoothstep(P.w * 1.08, P.w * 0.7, perp) * exp(-max(al, 0.0) * 0.3) * step(0.0, al) * (0.35 + 0.65 * fract(aSeed.x * 17.0)) * (1.0 + uAnom * sel * 2.4);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float psz = uPx * 0.0016 * (0.6 + aSeed.w) * (1.0 + uAnom * sel * 0.6) / max(0.05, -mv.z);
  gl_PointSize = clamp(psz, 3.0, 7.0);
  vA *= min(1.0, psz / 3.0) * min(1.0, psz / 3.0) * 0.6;
}`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uCol * vA * smoothstep(0.5, 0.0, d), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const shaftDust = new THREE.Points(shGeo, shMat);
  shaftDust.frustumCulled = false;
  shaftDust.name = 'shaftDust';
  shaftDust.renderOrder = 7;
  group.add(shaftDust);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.name = 'dust';
  dust.renderOrder = 6;
  group.add(dust);

  const state = { workLamp: 1, hatchStatus: 'amber', podLight: 0.22, level: 1, flicker: 0, years: 0, sunDir: V3(0, 0, 1), sunI: 0, zone: null, time: 0, anomaly: 0, haze: 0, dust: 0.3, growth: 0.04 };
  const tubeColor = new THREE.Color().copy(TUBE_COOL);
  const LK = { tube: 30, point: 1.25, spot: 2.2, env: 0.032, beam: 1 };
  const GAIN = { lab: 3.2, pod: 3.2, engine: 3.2, hab: 3.2, t1: 1.6, t2: 1.6, t3: 1.6, aft: 1.6, fore: 1.6, spine: 1, hub: 1.4 };

  const tubeIntensity = (t) => {
    if (t.dead) return 0;
    let f = 1;
    if (t.autoFlicker) {
      const st = Math.floor(state.time * (6 + t.seed * 10) + t.seed * 50), r = hash1(st * 17 + t.index * 3);
      if (r < 0.3) f = 0.05 + r; else if (r < 0.36) f = 0.5;
    }
    if (state.flicker > 0 && t.seed < state.flicker * 0.6) {
      const st = Math.floor(state.time * (9 + t.seed * 14) + t.seed * 100);
      const r = hash1(st * 31 + t.index);
      if (r < 0.22 + state.flicker * 0.3) f = 0.08 + r * 0.4;
      f *= 0.92 + 0.08 * Math.sin(state.time * 377 + t.index);
    }
    return state.level * t.warm * t.level * f;
  };

  const setVisibleZone = (id) => {
    if (!zones[id] || state.zone === id) return;
    state.zone = id;
    const show = new Set([id, ...(neighbours[id] || [])]);
    for (const z of Object.values(zones)) {
      const v = show.has(z.id);
      for (const m of z.meshes) m.visible = v;
      for (const o of z.objects) o.visible = v;
    }
    const zone = zones[id];
    state.candidates = [...zone.tubes];
    for (const nid of neighbours[id] || []) state.candidates.push(...zones[nid].tubes);
    const pick = desiredTubes(state.viewer || zone.center);
    lightPool.forEach((lp, i) => { lp.tube = pick[i] || null; lp.w = 1; if (lp.tube) lp.light.position.copy(lp.tube.light); });
    state.desired = new Set(pick);
    let plantSpot = -1;
    if (id === 'hab' || (neighbours[id] || []).includes('hab')) {
      let bd = 1e9;
      zone.spots.forEach((s, i) => { if (i >= spotPool.length || !zone.ring) return; const d = Math.hypot(s.pos.x - (habC - 2.2), s.pos.z + 1.2); if (d < bd) { bd = d; plantSpot = i; } });
    }
    spotPool.forEach((sp, i) => {
      if (i === plantSpot) sp.light.shadow.camera.layers.enable(LAYER_PLANT); else sp.light.shadow.camera.layers.disable(LAYER_PLANT);
      const s = zone.spots[i] || zone.spots[0];
      sp.off = !s;
      if (!s) return;
      const toE = (v) => (zone.ring ? ringToEndurance(v.x, v.y, v.z) : v.clone());
      sp.light.position.copy(toE(s.pos)); sp.light.target.position.copy(toE(s.target));
      sp.light.target.updateMatrixWorld();
      sp.tubes = zone.tubes;
    });
    const zp = portholes.filter(p => show.has(p.zone)).slice(0, 8);
    dustMat.uniforms.uNP.value = zp.length;
    zp.forEach((p, i) => { portU[i].set(p.position.x, p.position.y, p.position.z, p.radius); portN[i].copy(p.normal); });
    if (zone.ring) {
      dustMat.uniforms.uBend.value = 1;
      dustMat.uniforms.uMin.value.set(zone.s0, 0.05, zone.mod ? -HW + 0.05 : -1.1);
      dustMat.uniforms.uMax.value.set(zone.s1, zone.mod ? H - 0.05 : HY + TR - 0.1, zone.mod ? HW - 0.05 : 1.1);
    } else {
      dustMat.uniforms.uBend.value = 0;
      dustMat.uniforms.uMin.value.copy(zone.box.min).addScalar(0.15);
      dustMat.uniforms.uMax.value.copy(zone.box.max).addScalar(-0.15);
    }
    placeSun();
    updateBeams();
  };

  const desiredTubes = (ref) => {
    const c = state.candidates || [];
    return [...c].sort((a, b) => a.light.distanceToSquared(ref) - b.light.distanceToSquared(ref)).slice(0, lightPool.length);
  };

  const placeSun = () => {
    const zone = zones[state.zone];
    if (!zone) return;
    const r = Math.min(zone.radius, 9) + 1;
    sun.target.position.copy(zone.center);
    sun.position.copy(zone.center).addScaledVector(state.sunDir, r + 6);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.near = 0.5; cam.far = 2 * r + 12;
    cam.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  };

  const updateBeams = () => {
    const m = new THREE.Matrix4(), qq = new THREE.Quaternion();
    const dir = state.sunDir.clone().negate();
    const show = new Set([state.zone, ...(neighbours[state.zone] || [])]);
    portholes.forEach((p, i) => {
      const f = p.normal.dot(state.sunDir);
      if (f <= 0.02 || !show.has(p.zone) || state.sunI <= 0) { m.makeScale(0, 0, 0); beams.setMatrixAt(i, m); return; }
      qq.setFromUnitVectors(V3(0, 1, 0), dir);
      const L = Math.min(4.2, 1.6 / Math.max(0.2, f));
      m.compose(p.position, qq, V3(p.radius * 0.95, L, p.radius * 0.95));
      beams.setMatrixAt(i, m);
    });
    beams.instanceMatrix.needsUpdate = true;
    const lit = portholes.filter(p => p.zone === state.zone && p.normal.dot(state.sunDir) > 0.02).slice(0, 4);
    shMat.uniforms.uNum.value = lit.length;
    lit.forEach((p, i) => { shP[i].set(p.position.x, p.position.y, p.position.z, p.radius); shN[i].copy(p.normal); });
    shMat.uniforms.uSun.value.copy(state.sunDir);
    const zz = zones[state.zone];
    if (zz && zz.ring) { const th = THETA0 + ((zz.s0 + zz.s1) / 2) / RF; shMat.uniforms.uFT.value.set(-Math.sin(th), Math.cos(th), 0); shMat.uniforms.uFU.value.set(-Math.cos(th), -Math.sin(th), 0); shMat.uniforms.uFZ.value.set(0, 0, 1); }
    else { shMat.uniforms.uFT.value.set(1, 0, 0); shMat.uniforms.uFU.value.set(0, 1, 0); shMat.uniforms.uFZ.value.set(0, 0, 1); }
  };

  const setLights = (level = 1, flicker = 0) => { state.level = Math.max(0, level); state.flicker = clamp01(flicker); };
  const setTubeLight = (i, v) => { if (tubes[i]) tubes[i].warm = clamp01(v); };
  const setSunDirection = (dir, intensity) => {
    state.sunDir.copy(dir).normalize();
    if (intensity !== undefined) state.sunI = Math.max(0, intensity);
    dustMat.uniforms.uSun.value.copy(state.sunDir);
    placeSun();
    updateBeams();
  };
  const setHatch = (id, v) => { if (hatches[id]) hatches[id].set(v); };
  const setGrowth = (g) => { state.growth = clamp01(g); U.growth.value = state.growth; };
  const setAnomaly = (v) => { state.anomaly = clamp01(v); dustMat.uniforms.uAnom.value = state.anomaly; shMat.uniforms.uAnom.value = state.anomaly; anom.mat.uniforms.uAnom.value = state.anomaly; };
  const STATUS_COL = { amber: [4, 1.7, 0.2], green: [0.35, 3.2, 0.7], off: [0.03, 0.02, 0.01] };
  const setHatchStatus = (id, v) => { state.hatchStatus = v; const c = STATUS_COL[v] || STATUS_COL.off; M.status.color.setRGB(c[0], c[1], c[2]); };
  const setWorkLamp = (v) => { state.workLamp = Math.max(0, v); };
  const setDust = (v) => { state.dust = clamp01(v); dustMat.uniforms.uAmount.value = state.dust; };

  const podTubes = tubes.filter(t => t.zone === 'lab').sort((a, b) => a.light.distanceTo(podLight.position) - b.light.distanceTo(podLight.position)).slice(0, 6);
  const setAge = (years) => {
    const y = Math.max(0, years || 0);
    state.years = y;
    const aged = y > 0;
    const dead = aged ? Math.min(0.5, 0.08 + y / 100) : 0;
    const keep = {}, keep2 = {};
    for (const t of tubes) { if (!keep[t.zone] || t.seed > keep[t.zone].seed) { keep2[t.zone] = keep[t.zone]; keep[t.zone] = t; } else if (!keep2[t.zone] || t.seed > keep2[t.zone].seed) keep2[t.zone] = t; }
    for (const t of tubes) {
      t.dead = aged && t !== keep[t.zone] && t !== keep2[t.zone] && hash1(t.index * 13 + 5) < dead;
      t.autoFlicker = aged && !t.dead && hash1(t.index * 29 + 3) < 0.1 + y / 250;
    }
    tubeColor.copy(TUBE_COOL).lerp(TUBE_WARM, 0.18 * smooth(10, 60, y));
    for (const t of tubes) t.level = 1 - 0.3 * smooth(5, 60, y) * (0.5 + t.seed);
    U.frost.value = aged ? Math.min(0.9, 0.06 + smooth(3, 62, y) * 0.84) : 0;
    U.haze.value = 0.004 + 0.03 * smooth(0, 45, y);
    setDust(aged ? 0.4 + 0.6 * smooth(0, 30, y) : 0.25);
    setGrowth(aged ? Math.min(1, 0.12 + y / 28) : 0.12);
    U.dry.value = smooth(38, 54, y);
    drawTally(M.tex.tallyCanvas, Math.floor(y));
    M.tex.tally.needsUpdate = true;
    podB.set(aged ? 0 : 1);
    podB.setFrost(aged ? 0.42 + 0.25 * smooth(30, 60, y) : 0);
    podB.figure.visible = aged;
    for (const it of items) it.set(aged);
    U.dustF.value = aged ? 0.3 + 0.7 * smooth(4, 50, y) : 0;
    U.grime.value = 0.1 + 0.9 * smooth(0, 40, y);
    U.yellow.value = 0.3 * smooth(10, 60, y);
    U.stain.value = smooth(8, 45, y);
    U.peel.value = smooth(15, 60, y);
    U.condense.value = aged ? 0.3 + 0.7 * smooth(2, 25, y) : 0;
    clutter.apply(y, state.time);
    const hm = new THREE.Matrix4(), hq = new THREE.Quaternion();
    for (const t of tubes) {
      const zone = zones[t.zone];
      const hang = aged && t.dead && hash1(t.index * 31 + 7) < 0.55;
      if (!hang) { tubeMesh.setMatrixAt(t.index, t.m0); continue; }
      const len = t.a.distanceTo(t.b), mid = V3().addVectors(t.a, t.b).multiplyScalar(0.5);
      const down = zone.ring ? V3(mid.x, mid.y, 0).normalize() : V3(hash1(t.index) - 0.5, hash1(t.index + 9) - 0.5, hash1(t.index + 19) - 0.5).normalize();
      const d = V3().subVectors(t.b, t.a).normalize().addScaledVector(down, (zone.ring ? 1.3 : 0.6) + hash1(t.index) * 0.8).normalize();
      hq.setFromUnitVectors(V3(0, 1, 0), d);
      hm.compose(t.a.clone().addScaledVector(d, len / 2), hq, V3(1, len, 1));
      tubeMesh.setMatrixAt(t.index, hm);
    }
    tubeMesh.instanceMatrix.needsUpdate = true;
  };

  let viewerZoneLock = 0;
  const zoneAt = (p) => {
    if (Math.hypot(p.x, p.y) < HUB_R + 0.3 && Math.abs(p.z) < DOCK_Z + 1) return 'hub';
    if (p.x > SPINE_X0 - 0.2 && p.x < SPINE_X1 + 0.05 && Math.hypot(p.y, p.z) < SR + 0.3) return 'spine';
    const r = enduranceToRing(p);
    for (const id of ['aft', 'lab', 't1', 'pod', 't2', 'engine', 't3', 'hab', 'fore']) { const z = zones[id]; if (r.s >= z.s0 - 0.01 && r.s <= z.s1 + 0.01) return id; }
    return state.zone || 'lab';
  };
  const setViewer = (pEndurance) => {
    if (!state.viewer) state.viewer = V3();
    state.viewer.copy(pEndurance);
    const id = zoneAt(pEndurance);
    if (id !== state.zone && viewerZoneLock <= 0) { setVisibleZone(id); viewerZoneLock = 0.25; }
  };

  let lightTick = 0;
  const update = (dt = 0.016) => {
    state.time += dt;
    viewerZoneLock -= dt;
    lightTick -= dt;
    if (lightTick <= 0 && state.viewer) { state.desired = new Set(desiredTubes(state.viewer)); lightTick = 0.2; }
    if (state.desired) {
      const covered = new Set(lightPool.map(lp => lp.tube));
      for (const lp of lightPool) {
        const want = lp.tube && state.desired.has(lp.tube);
        lp.w = want ? Math.min(1, lp.w + dt * 2.5) : Math.max(0, lp.w - dt * 2.5);
        if (lp.w === 0) {
          const next = [...state.desired].find(t => !covered.has(t));
          if (next) { covered.delete(lp.tube); lp.tube = next; covered.add(next); lp.light.position.copy(next.light); }
        }
      }
    }
    const col = new THREE.Color();
    const intens = new Float32Array(tubes.length);
    tubes.forEach((t, i) => {
      const v = tubeIntensity(t);
      intens[i] = v;
      tubeMesh.setColorAt(i, col.copy(tubeColor).multiplyScalar(LK.tube * v + 0.03));
    });
    if (tubeMesh.instanceColor) tubeMesh.instanceColor.needsUpdate = true;
    for (const lp of lightPool) {
      if (!lp.tube) { lp.light.intensity = 0; continue; }
      lp.light.intensity = LK.point * (GAIN[lp.tube.zone] ?? 1) * intens[lp.tube.index] * lp.w;
      lp.light.color.copy(tubeColor);
    }
    const zone = zones[state.zone];
    let zAvg = 0;
    if (zone && zone.tubes.length) { for (const t of zone.tubes) zAvg += intens[t.index]; zAvg /= zone.tubes.length; }
    for (const sp of spotPool) { sp.light.intensity = sp.off ? 0 : LK.spot * (GAIN[state.zone] ?? 1) * zAvg; sp.light.color.copy(tubeColor); }
    sun.intensity = state.sunI;
    beamMat.uniforms.uI.value = LK.beam * state.sunI * (0.03 + 0.03 * smooth(0, 40, state.years)) * (1 + state.anomaly);
    const envK = (0.18 + 0.5 * zAvg) * LK.env * Math.sqrt(GAIN[state.zone] ?? 1);
    for (const k of ['pad', 'metal', 'paint', 'fabric', 'grate', 'label', 'tally', 'figure', 'leaf', 'stem']) M[k].envMapIntensity = envK;
    U.hazeCol.value.copy(tubeColor).multiplyScalar(0.05 * state.level * (0.3 + zAvg) + 0.002);
    dustMat.uniforms.uTime.value = state.time;
    dustMat.uniforms.uLight.value = zAvg;
    dustMat.uniforms.uSunI.value = state.sunI * 0.25;
    shMat.uniforms.uTime.value = state.time;
    shMat.uniforms.uI.value = state.sunI * 0.07 * (0.5 + state.dust) * (1 + state.anomaly * 0.8);
    if (engine) shMat.uniforms.uPx.value = engine.height || 1080;
    if (engine) dustMat.uniforms.uPx.value = engine.height || 1080;
    M.podU.uTime.value = state.time;
    if (state.years > 0 && clutter.hasFloat && (state.zone === 'hub' || state.zone === 'spine')) clutter.apply(state.years, state.time);
    tallyLamp.intensity = state.years > 0 && state.zone === 'hab' ? 1.4 : 0;
    const wl = state.workLamp * (state.zone === 'lab' || state.zone === 't1' ? 1 : 0);
    lever.lamp.intensity = 9 * wl;
    anom.mat.uniforms.uTime.value = state.time;
    anom.mat.uniforms.uI.value = wl * 0.55;
    if (engine) anom.mat.uniforms.uPx.value = engine.height || 1080;
    const la = state.anomaly * wl * (0.035 + 0.015 * Math.sin(state.time * 2.3));
    anom.lmat.color.setRGB(1.0 * la, 0.86 * la, 0.66 * la);
    const gmw = group.matrixWorld;
    podTubes.forEach((t, i) => { M.podU.uTA.value[i].copy(t.a).applyMatrix4(gmw); M.podU.uTB.value[i].copy(t.b).applyMatrix4(gmw); M.podU.uTI.value[i] = intens[t.index] * LK.tube; });
    const lidShut = 1 - smooth(0.02, 0.25, podA.value);
    M.podGlass[0].userData.uBreath.value = podA.breath * lidShut * Math.pow(Math.max(0, Math.sin(state.time * Math.PI * 2 / 4.4)), 2);
    podLight.intensity = state.podLight * (0.3 + 0.7 * lidShut) * (state.zone === 'lab' ? 1 : 0);
    podBLight.intensity = state.years > 0 && state.zone === 'lab' ? 1.1 : 0;
  };

  const ringAnchor = (name, s, y, z, look, up) => {
    const o = new THREE.Object3D();
    o.name = name;
    const P = ringToEndurance(s, y, z);
    const frame = ringMatrix(s, y, z);
    const fwd = V3(...look).normalize().transformDirection(frame);
    const upv = V3(...(up || [0, 1, 0])).normalize().transformDirection(frame);
    const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), fwd, upv);
    o.position.copy(P);
    o.quaternion.setFromRotationMatrix(m);
    o.userData.ring = { s, y, z, look, up: up || [0, 1, 0] };
    group.add(o);
    anchors[name] = o;
    return o;
  };
  const spaceAnchor = (name, p, look, up) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.copy(p);
    const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), V3(...look).normalize(), V3(...up).normalize());
    o.quaternion.setFromRotationMatrix(m);
    group.add(o);
    anchors[name] = o;
    return o;
  };
  const podX = labC - 2.9;
  ringAnchor('podA_eye', podX - 0.85, 0.87, -1.28, [0, 1, 0], [-1, 0, 0]);
  ringAnchor('podA_sit', podX - 0.45, 1.48, -1.28, [1, -0.25, 0]);
  ringAnchor('podA_stand', podX + 0.1, 1.66, -0.42, [1, -0.1, 0.2]);
  ringAnchor('podB_view', podX + 0.4, 1.66, 0.35, [-0.3, -0.6, 0.5]);
  ringAnchor('labHatch', labC + HL - 0.9, 1.66, 0, [1, 0, 0]);
  ringAnchor('labLever', labC + HL - 0.6, 1.66, HR + 0.55, [1, -0.2, 0.2]);
  ringAnchor('corridor', podC - HL + 0.6, 1.66, 0, [1, 0, 0]);
  ringAnchor('podModule', podC, 1.66, 0, [1, 0, 0]);
  ringAnchor('engineModule', engC, 1.66, 0, [1, 0, 0]);
  ringAnchor('engineConsole', engC, 1.6, 0.9, [0, -0.15, 1]);
  ringAnchor('habitat', habC - HL + 0.7, 1.66, 0.2, [1, -0.1, 0]);
  ringAnchor('missionBoard', habC - 0.3, 1.66, 0.6, [0, -0.05, 1]);
  ringAnchor('commsConsole', habC + 2.7, 1.66, 1.0, [0, -0.2, 1]);
  ringAnchor('tallyPanel', habC + 4.35, 1.55, 1.3, [0, -0.1, 1]);
  ringAnchor('hydroponics', habC - 3.25, 1.6, -0.9, [0, -0.4, -1]);
  ringAnchor('ladderBottom', habC, 1.66, -0.4, [0, 0, -1]);
  ringAnchor('ladderTop', habC, H - 0.3, -0.55, [0, 1, 0], [-1, 0, 0]);
  spaceAnchor('spineBottom', V3(SPINE_X1 - 0.6, 0, -0.55), [-1, 0, 0], [0, 0, 1]);
  spaceAnchor('spineTop', V3(SPINE_X0 + 0.8, 0, -0.55), [-1, 0, 0], [0, 0, 1]);
  spaceAnchor('hubCenter', V3(0, 0, 0), [0, 0, 1], [1, 0, 0]);
  spaceAnchor('dockTunnel', V3(0, 0, HUB_HZ + 0.6), [0, 0, 1], [1, 0, 0]);
  spaceAnchor('rangerPortA', V3(0, 0, DOCK_Z), [0, 0, 1], [1, 0, 0]);
  spaceAnchor('rangerPortB', V3(0, 0, -DOCK_Z), [0, 0, -1], [1, 0, 0]);
  spaceAnchor('dockTunnelB', V3(0, 0, -HUB_HZ - 1.1), [0, 0, -1], [1, 0, 0]);
  const ladder = { id: 'habLadder', min: [habC - 0.3, 0, -(SR - 0.2) - 0.25], max: [habC + 0.3, H + 0.1, -(SR - 0.2) + 0.45], top: [habC, H, -(SR - 0.2)], axis: [0, 1, 0] };
  const spineLadder = { id: 'spineLadder', min: [SPINE_X0, -0.3, -SR + 0.05], max: [SPINE_X1, 0.3, -SR + 0.65], axis: [-1, 0, 0], bottom: [SPINE_X1, 0, -(SR - 0.17)], top: [SPINE_X0, 0, -(SR - 0.17)], clear: 0.3 };

  interactables.push({ id: 'commsLog', object: displaySlots.find(d => d.id === 'commsLog').mesh, kind: 'console' });
  interactables.push({ id: 'missionBoard', object: displaySlots.find(d => d.id === 'missionBoard').mesh, kind: 'console' });

  setLights(1, 0);
  setAge(0);
  podA.set(0); podA.setFrost(1);
  podB.set(1); podB.setFrost(0);
  setVisibleZone('lab');
  update(0);

  const stats = () => {
    let tris = 0, calls = 0;
    group.traverse((o) => { if (o.isMesh && o.geometry?.index) { tris += (o.geometry.index.count / 3) * (o.isInstancedMesh ? o.count : 1); calls++; } });
    return { tris, calls };
  };

  const warmup = async (renderer, scene, camera) => {
    const hidden = [];
    group.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
    const rt = new THREE.WebGLRenderTarget(64, 64);
    const prevRT = renderer.getRenderTarget();
    const zoneMeshes = new Set(Object.values(zones).flatMap(z => z.meshes));
    const prevZone = state.zone, prevViewer = state.viewer ? state.viewer.clone() : null;
    renderer.setRenderTarget(rt);
    for (const z of Object.values(zones)) {
      state.zone = null; setVisibleZone(z.id);
      state.viewer = z.center.clone();
      update(0);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(prevRT);
    state.zone = null; setVisibleZone(prevZone || 'lab');
    state.viewer = prevViewer; if (prevViewer) update(0);
    rt.dispose();
    for (const o of hidden) if (!zoneMeshes.has(o)) o.visible = false;
    return renderer.info.programs?.length ?? 0;
  };

  const dispose = () => {
    for (const g of disposables) g.dispose();
    for (const z of Object.values(zones)) for (const m of z.meshes) m.geometry.dispose();
    for (const [k, m] of Object.entries(M)) { if (k === 'tex') continue; if (Array.isArray(m)) m.forEach(x => x.dispose()); else if (m?.dispose) m.dispose(); }
    for (const t of Object.values(M.tex)) if (t?.isTexture) t.dispose();
    beamMat.dispose(); dustMat.dispose();
    envTex?.dispose();
    for (const lp of lightPool) lp.light.dispose();
    for (const sp of spotPool) sp.light.dispose();
    sun.dispose();
    group.removeFromParent();
  };

  return {
    group, anchors, portholes, displaySlots, interactables, colliders, walkable, ladder, spaceColliders, spineLadder, tubes, hatches,
    zones: Object.keys(zones), zoneBounds: Object.fromEntries(Object.values(zones).map(z => [z.id, { center: z.center, radius: z.radius, ring: z.ring, s0: z.s0, s1: z.s1 }])),
    pods: { A: podA, B: podB }, lever, items,
    ring: { RF, THETA0, PITCH, toEndurance: ringToEndurance, fromEndurance: enduranceToRing, matrix: ringMatrix, up: ringUp, modules: MODS.map(m => ({ id: m.id, k: m.k, s: m.c })) },
    setVisibleZone, setViewer, zoneAt, zoneVisible: p => { const id = zoneAt(p); return id === state.zone || (neighbours[state.zone] || []).includes(id); }, setHatch, setLights, setTubeLight, setSunDirection, setAge, setGrowth, setAnomaly, setDust,
    setLever: lever.set, setWorkLamp, setHatchStatus, setBreath: (v) => { podA.breath = Math.max(0, v); }, setPodLight: (v) => { state.podLight = Math.max(0, v); }, setPodLid: (id, v) => (id === 'B' ? podB : podA).set(v), setFrost: (id, v) => (id === 'B' ? podB : podA).setFrost(v),
    tune: { k: LK, lights: lightPool.map(l => l.light), spots: spotPool.map(s => s.light), sun, materials: M, uniforms: U },
    stats, update, dispose, warmup,
  };
}
