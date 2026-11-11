// Ranger cockpit and aft cabin after ref 04: inward shell with window tunnels, centre display stack, cream quilted walls, raised pilot seats, interactables, power and failure lighting.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, tileNoise, heightToNormal, readHeight, rng } from './hull-materials.js';
import { MeshBuilder, gridSurface, offsetConvex, sampleEdges, edgeCounts, ccw, yTop, deckNormal, rangerWindows } from './ranger.js';

const HULL_T = 0.22;
const FLOOR_X = 2.3, WALL_X = 3.2, Z0 = -3.1, Z1 = 6.48;
const doorBoxAt = () => ({ id: 'door', min: [-0.62, 0, Z1 - 0.05], max: [0.62, 1.74, Z1 + 0.1] });
const SEAT_RAISE = 0.2;
const yC = (x, z) => yTop(x, z) - HULL_T;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TEX = new Map();

function tex(canvas, repeat, srgb, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / repeat, 1 / repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}

function grayCanvas(vals, S, lo, hi) {
  const c = makeCanvas(S), x = c.getContext('2d'), img = x.createImageData(S, S);
  for (let i = 0; i < vals.length; i++) { const v = Math.max(0, Math.min(255, (lo + (hi - lo) * vals[i]) * 255)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}

function buildPanelTex(S) {
  const R = rng(911);
  const alb = makeCanvas(S), a = alb.getContext('2d');
  a.fillStyle = 'rgb(58,60,64)'; a.fillRect(0, 0, S, S);
  const n = tileNoise(S / 4, 6, 5, 912);
  a.globalAlpha = 0.06; a.drawImage(grayCanvas(n, S / 4, 0, 1), 0, 0, S, S); a.globalAlpha = 1;
  for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S, r = 1 + R() * 3; a.fillStyle = `rgba(150,150,155,${0.04 + R() * 0.1})`; a.beginPath(); a.arc(x, y, r, 0, 7); a.fill(); }
  for (let i = 0; i < 160; i++) { const x = R() * S, y = R() * S, l = 10 + R() * 120, ang = R() * Math.PI; a.strokeStyle = `rgba(130,132,138,${0.05 + R() * 0.1})`; a.lineWidth = 1; a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); a.stroke(); }
  const rough = grayCanvas(tileNoise(S / 4, 4, 4, 913), S / 4, 0.42, 0.62);
  const h = tileNoise(S, S / 2, 1, 914);
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(h, S, 0.35) };
}

function buildQuiltTex(S) {
  const cell = S / 6;
  const alb = makeCanvas(S), a = alb.getContext('2d');
  const img = a.createImageData(S, S);
  const h = new Float32Array(S * S);
  const n = tileNoise(S / 4, 8, 3, 921);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + y) / cell, v = (x - y + S) / cell;
    const fu = u - Math.floor(u), fv = v - Math.floor(v);
    const d = Math.min(fu, 1 - fu, fv, 1 - fv);
    const pillow = Math.sqrt(Math.min(1, d / 0.22));
    const seam = d < 0.018 ? 1 : 0;
    const stitch = d > 0.05 && d < 0.07 && ((Math.floor((fu + fv) * 40) & 1) === 0) ? 1 : 0;
    h[y * S + x] = pillow * 0.9 - seam * 0.2 - stitch * 0.05;
    const nn = n[(y >> 2) * (S / 4) + (x >> 2)];
    const shade = 0.78 + 0.22 * pillow - stitch * 0.08 - seam * 0.2;
    const i = (y * S + x) * 4;
    img.data[i] = (206 + nn * 12) * shade; img.data[i + 1] = (197 + nn * 12) * shade; img.data[i + 2] = (178 + nn * 10) * shade; img.data[i + 3] = 255;
  }
  a.putImageData(img, 0, 0);
  return { map: alb, roughnessMap: grayCanvas(n, S / 4, 0.75, 0.92), normalMap: heightToNormal(h, S, 6) };
}

function buildFabricTex(S) {
  const alb = makeCanvas(S), a = alb.getContext('2d');
  const img = a.createImageData(S, S);
  const h = new Float32Array(S * S);
  const n = tileNoise(S, 32, 4, 931);
  const p = S / 96;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = Math.sin((x / p) * Math.PI), wy = Math.sin((y / p) * Math.PI);
    const weave = ((Math.floor(x / p) + Math.floor(y / p)) & 1) ? wx * wx : wy * wy;
    const v = n[y * S + x];
    h[y * S + x] = weave * 0.6 + v * 0.4;
    const c = 118 + (weave - 0.5) * 22 + (v - 0.5) * 30;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  a.putImageData(img, 0, 0);
  return { map: alb, roughnessMap: grayCanvas(n, S, 0.78, 0.95), normalMap: heightToNormal(h, S, 2.5) };
}

function buildFloorTex(S) {
  const R = rng(941);
  const alb = makeCanvas(S), a = alb.getContext('2d');
  a.fillStyle = 'rgb(96,98,98)'; a.fillRect(0, 0, S, S);
  const hc = makeCanvas(S), hx = hc.getContext('2d');
  hx.fillStyle = 'rgb(90,90,90)'; hx.fillRect(0, 0, S, S);
  const pitch = S / 40;
  for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
    hx.fillStyle = 'rgb(170,170,170)'; hx.fillRect(i * pitch + pitch * 0.18, j * pitch + pitch * 0.18, pitch * 0.64, pitch * 0.64);
    a.fillStyle = `rgba(${130 + R() * 20},${130 + R() * 20},${130 + R() * 20},0.5)`; a.fillRect(i * pitch + pitch * 0.18, j * pitch + pitch * 0.18, pitch * 0.64, pitch * 0.64);
  }
  for (let i = 0; i < 260; i++) { const x = R() * S, y = R() * S, r = 6 + R() * 60; a.fillStyle = `rgba(50,48,44,${0.03 + R() * 0.07})`; a.beginPath(); a.ellipse(x, y, r * 2, r, R() * 3, 0, 7); a.fill(); }
  return { map: alb, roughnessMap: grayCanvas(tileNoise(S / 4, 4, 4, 942), S / 4, 0.5, 0.75), normalMap: heightToNormal(readHeight(hc), S, 2.2) };
}

const LABEL_WORDS = ['BATT', 'FC 1', 'FC 2', 'AVNX', 'RCS', 'PRI', 'SEC', 'ARM', 'SAFE', 'PWR', 'BUS A', 'BUS B', 'O2', 'N2', 'H2O', 'HTR', 'FAN', 'DOCK', 'CLAMP', 'LTS', 'NAV', 'AUTO', 'MAN', 'TEST', 'INT', 'EXT', 'COMM', 'DATA', 'GYRO', 'ATT', 'PITCH', 'ROLL', 'YAW', 'TRIM', 'FUEL', 'OX', 'PUMP', 'VLV', 'ISOL', 'XFEED', 'MAIN', 'APU', 'CAB P', 'TEMP', 'CO2', 'SCRUB', 'IGN', 'START', 'STOP', 'RESET', 'ENG 1', 'ENG 2', 'HYD', 'GEAR', 'UP', 'DN', 'OPEN', 'CLOSE', 'ON', 'OFF', 'MODE', 'SEL', 'CMD', 'ALT', 'RATE', 'HOLD', 'MASTER', 'CAUTION', 'EJECT', 'HATCH', 'CABIN', 'FLOOD', 'DIM', 'BRT', 'A', 'B', 'C', '1', '2', '3', 'LOCK', 'VENT', 'PRESS', 'SUIT', 'HELIUM', 'QUAD A', 'QUAD B', 'QUAD C', 'QUAD D', 'BURN', 'DEORB', 'ENTRY', 'LAND'];

function buildLabels() {
  const W = 2048, H = 1024, cols = 16, rows = 16;
  const c = makeCanvas(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(235,236,230,1)';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 34px "Helvetica Neue", Helvetica, Arial, sans-serif';
  const cw = W / cols, ch = H / rows;
  for (let i = 0; i < cols * rows; i++) x.fillText(LABEL_WORDS[i % LABEL_WORDS.length], (i % cols + 0.5) * cw, (Math.floor(i / cols) + 0.55) * ch, cw - 8);
  return { canvas: c, cols, rows };
}

function buildHazard() {
  const c = makeCanvas(256), x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#d9a91c';
  for (let i = -8; i < 8; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64 + 32, 0); x.lineTo(i * 64 + 32 + 256, 256); x.lineTo(i * 64 + 256, 256); x.fill(); }
  return c;
}

function cockpitTextures(quality) {
  if (TEX.has(quality)) return TEX.get(quality);
  const mid = quality === 'low' ? 512 : quality === 'medium' ? 1024 : 2048;
  const panel = buildPanelTex(mid), quilt = buildQuiltTex(mid), fabric = buildFabricTex(mid >= 2048 ? 1024 : mid), floor = buildFloorTex(mid);
  const labels = buildLabels();
  const out = {
    panel: { map: tex(panel.map, 1.2, true), roughnessMap: tex(panel.roughnessMap, 1.2), normalMap: tex(panel.normalMap, 1.2) },
    quilt: { map: tex(quilt.map, 0.6, true), roughnessMap: tex(quilt.roughnessMap, 0.6), normalMap: tex(quilt.normalMap, 0.6) },
    fabric: { map: tex(fabric.map, 0.3, true), roughnessMap: tex(fabric.roughnessMap, 0.3), normalMap: tex(fabric.normalMap, 0.3) },
    floor: { map: tex(floor.map, 1.0, true), roughnessMap: tex(floor.roughnessMap, 1.0), normalMap: tex(floor.normalMap, 1.0) },
    labels: Object.assign(new THREE.CanvasTexture(labels.canvas), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 }),
    labelGrid: [labels.cols, labels.rows],
    hazard: tex(buildHazard(), 0.08, true),
  };
  TEX.set(quality, out);
  return out;
}

class Frame {
  constructor(origin, right, upHint) {
    this.o = origin.clone();
    this.r = right.clone().normalize();
    this.n = new THREE.Vector3().crossVectors(this.r, upHint).normalize();
    this.u = new THREE.Vector3().crossVectors(this.n, this.r).normalize();
    this.basis = new THREE.Matrix4().makeBasis(this.r, this.u, this.n);
  }
  p(u, v, w = 0) { return this.o.clone().addScaledVector(this.r, u).addScaledVector(this.u, v).addScaledVector(this.n, w); }
  m(u, v, w = 0, local = null) { const m = this.basis.clone().setPosition(this.p(u, v, w)); return local ? m.multiply(local) : m; }
  q() { return new THREE.Quaternion().setFromRotationMatrix(this.basis); }
}

function tilted(origin, right, tiltDeg) {
  const r = right.clone().normalize();
  const n0 = new THREE.Vector3().crossVectors(r, V(0, 1, 0)).normalize();
  const t = tiltDeg * Math.PI / 180;
  const up = V(0, Math.cos(t), 0).addScaledVector(n0, -Math.sin(t));
  return new Frame(origin, r, up);
}

const rotX = (a) => new THREE.Matrix4().makeRotationX(a);
const rotY = (a) => new THREE.Matrix4().makeRotationY(a);
const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

export async function createRangerCockpit({ engine, quality, materials, ranger } = {}) {
  const doorBox = doorBoxAt();
  const q = quality || engine?.qualityName || 'ultra';
  const T = cockpitTextures(q);
  const hull = materials || ranger?.materials || {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const own = [];
  const M = {
    panel: std({ name: 'ck.panel', ...T.panel, color: 0xffffff, roughness: 1, metalness: 0.25, normalScale: new THREE.Vector2(0.5, 0.5) }),
    trim: std({ name: 'ck.trim', ...T.panel, color: new THREE.Color(2.2, 2.2, 2.25), roughness: 1, metalness: 0.1, normalScale: new THREE.Vector2(0.5, 0.5) }),
    ceiling: std({ name: 'ck.ceiling', ...T.panel, color: new THREE.Color(6.5, 6.4, 6.2), roughness: 1, metalness: 0.05, normalScale: new THREE.Vector2(0.4, 0.4) }),
    quilt: std({ name: 'ck.quilt', ...T.quilt, color: 0xffffff, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1, 1) }),
    fabric: std({ name: 'ck.fabric', ...T.fabric, color: new THREE.Color(0.42, 0.52, 0.78), roughness: 1, metalness: 0 }),
    slate: std({ name: 'ck.slate', ...T.fabric, color: new THREE.Color(0.55, 0.6, 0.7), roughness: 1, metalness: 0 }),
    webbing: std({ name: 'ck.webbing', ...T.fabric, color: new THREE.Color(0.38, 0.4, 0.44), roughness: 1, metalness: 0 }),
    stitch: std({ name: 'ck.stitch', color: 0x6d7378, roughness: 0.8 }),
    floor: std({ name: 'ck.floor', ...T.floor, color: 0xffffff, roughness: 1, metalness: 0.3, normalScale: new THREE.Vector2(0.8, 0.8) }),
    grate: std({ name: 'ck.grate', color: 0x24262a, roughness: 0.55, metalness: 0.7 }),
    under: std({ name: 'ck.under', color: 0x060708, roughness: 0.85, metalness: 0.2 }),
    knob: std({ name: 'ck.knob', color: 0x0f1011, roughness: 0.38, metalness: 0.1 }),
    metal: hull.metal || std({ name: 'ck.metal', color: 0xaaaaaa, roughness: 0.35, metalness: 1 }),
    rubber: hull.rubber || std({ name: 'ck.rubber', color: 0x0d0d0e, roughness: 0.88 }),
    hazard: std({ name: 'ck.hazard', map: T.hazard, roughness: 0.55, metalness: 0 }),
    helmet: std({ name: 'ck.helmet', color: 0xe6e4de, roughness: 0.32, metalness: 0 }),
    visor: new THREE.MeshPhysicalMaterial({ name: 'ck.visor', color: 0x0b0a08, roughness: 0.05, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.03 }),
    labels: std({ name: 'ck.labels', map: T.labels, emissiveMap: T.labels, emissive: 0x000000, alphaTest: 0.35, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  own.push(...Object.entries(M).filter(([k, m]) => m !== hull[k]).map(([, m]) => m));

  const group = new THREE.Group();
  group.name = 'RangerCockpit';
  const B = new MeshBuilder();
  const R = rng(4242);
  const windows = ranger?.windows || rangerWindows();
  if (ranger?.parts?.innerDoor) ranger.parts.innerDoor.visible = false;

  const add = (key, geom, matrix, opts) => { B.geometry(key, geom, matrix, opts); geom.dispose(); };
  const box = (key, sx, sy, sz, m) => add(key, new THREE.BoxGeometry(sx, sy, sz), m);
  const rbox = (key, sx, sy, sz, r, m, seg = 2) => add(key, new RoundedBoxGeometry(sx, sy, sz, seg, Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4)), m);
  const cyl = (key, r0, r1, h, m, seg = 16, open = false) => add(key, new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), m);
  const tube = (key, pts, r, seg = 48, radial = 8) => add(key, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => (p.isVector3 ? p : V(...p)))), seg, r, radial, false), null);

  const lamps = [];
  const lamp = (matrix, size, color, opts = {}) => {
    const lit = opts.base ?? (R() < 0.32 ? 1 : 0.06);
    lamps.push({ matrix, size, color, t0: opts.t0 ?? R() * 0.6 + 0.3, death: opts.death ?? 0.15 + R() * 0.85, kind: opts.kind || 'lamp', base: lit });
  };
  const AMBER = [1, 0.5, 0.1], CYAN = [0.35, 0.85, 1], GREEN = [0.35, 1, 0.45], WHITE = [1, 0.93, 0.82], REDC = [1, 0.06, 0.02];
  const pickColor = () => { const r = R(); return r < 0.5 ? AMBER : r < 0.72 ? WHITE : r < 0.88 ? GREEN : CYAN; };

  const [LC, LR] = T.labelGrid;
  const label = (frame, u, v, w, h, idx = Math.floor(R() * LC * LR), lift = 0.0015) => {
    const cx = idx % LC, cy = Math.floor(idx / LC);
    const u0 = cx / LC, u1 = (cx + 1) / LC, v1 = 1 - cy / LR, v0 = 1 - (cy + 1) / LR;
    const P = (a, b) => frame.p(u + a * w, v + b * h, lift).toArray();
    const n = frame.n.toArray();
    B.triO('labels', P(-0.5, -0.5), P(0.5, -0.5), P(0.5, 0.5), n, n, n, n, [u0, v0], [u1, v0], [u1, v1]);
    B.triO('labels', P(-0.5, -0.5), P(0.5, 0.5), P(-0.5, 0.5), n, n, n, n, [u0, v0], [u1, v1], [u0, v1]);
  };
  const toggle = (frame, u, v, down = R() < 0.5) => {
    cyl('metal', 0.0068, 0.0068, 0.006, frame.m(u, v, 0.003, rotX(Math.PI / 2)), 6);
    cyl('knob', 0.009, 0.009, 0.002, frame.m(u, v, 0.001, rotX(Math.PI / 2)), 10);
    cyl('metal', 0.0021, 0.0032, 0.024, frame.m(u, v, 0.006, rotX(Math.PI / 2 + (down ? -0.45 : 0.45)).multiply(tr(0, 0.012, 0))), 8);
  };
  const knob = (frame, u, v, r = 0.012) => {
    cyl('knob', r, r * 1.08, 0.016, frame.m(u, v, 0.008, rotX(Math.PI / 2)), 18);
    cyl('metal', r * 1.35, r * 1.35, 0.003, frame.m(u, v, 0.0015, rotX(Math.PI / 2)), 18);
    box('stitch', 0.002, r * 0.9, 0.003, frame.m(u, v + r * 0.45, 0.0165, rotZ(R() * 2 - 1)));
  };
  const button = (frame, u, v, w, h, color) => { box('knob', w + 0.006, h + 0.006, 0.004, frame.m(u, v, 0.002)); lamp(frame.m(u, v, 0.006), [w, h, 0.004], color || pickColor()); };
  const screw = (frame, u, v) => cyl('metal', 0.0045, 0.0045, 0.003, frame.m(u, v, 0.0015, rotX(Math.PI / 2)), 8);
  const switchField = (frame, u0, v0, u1, v1, opts = {}) => {
    const pu = opts.pu || 0.045, pv = opts.pv || 0.062;
    const cols = Math.max(1, Math.floor((u1 - u0) / pu)), rows = Math.max(1, Math.floor((v1 - v0) / pv));
    const du = (u1 - u0) / cols, dv = (v1 - v0) / rows;
    for (let j = 0; j < rows; j++) {
      const rowType = R();
      for (let i = 0; i < cols; i++) {
        const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.55) * dv, r = R();
        if (rowType < 0.55) { if (r < 0.88) toggle(frame, u, v + 0.006); }
        else if (rowType < 0.72) { if (r < 0.7) knob(frame, u, v + 0.006, 0.0105 + R() * 0.004); }
        else if (r < 0.92) button(frame, u, v + 0.006, du * 0.62, dv * 0.42);
        label(frame, u, v - dv * 0.34, du * 0.85, dv * 0.2);
      }
      if (opts.rules !== false) box('trim', u1 - u0, 0.0025, 0.0012, frame.m((u0 + u1) / 2, v0 + j * dv, 0.0006));
    }
  };
  const buttonBlock = (frame, u, v, cols, rows, s = 0.022, color) => {
    const g = s * 1.25;
    rbox('panel', cols * g + 0.012, rows * g + 0.012, 0.012, 0.003, frame.m(u, v, 0.006));
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const uu = u + (i - (cols - 1) / 2) * g, vv = v + (j - (rows - 1) / 2) * g;
      box('knob', s + 0.003, s + 0.003, 0.004, frame.m(uu, vv, 0.014));
      lamp(frame.m(uu, vv, 0.0175), [s, s * 0.8, 0.004], color || pickColor());
    }
  };
  const slab = (frame, w, h, d = 0.05, depth = 0.4, key = 'panel') => {
    rbox(key, w, h, d, 0.012, frame.m(0, 0, -d / 2), 3);
    if (depth > 0) box('panel', w - 0.02, h - 0.02, depth, frame.m(0, 0, -d - depth / 2));
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) screw(frame, su * (w / 2 - 0.018), sv * (h / 2 - 0.018));
  };
  const detailFace = (frame, w, h, opts = {}) => {
    const cols = Math.max(1, Math.round(w / (opts.pw || 0.42))), rows = Math.max(1, Math.round(h / (opts.ph || 0.3)));
    const cw = w / cols, ch = h / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const u = -w / 2 + (i + 0.5) * cw, v = -h / 2 + (j + 0.5) * ch, pw = cw - 0.03, ph = ch - 0.03, r = R();
      rbox('panel', pw, ph, 0.01, 0.004, frame.m(u, v, 0.005), 1);
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) screw(frame, u + su * (pw / 2 - 0.014), v + sv * (ph / 2 - 0.014));
      if (r < 0.35) { for (let k = 0; k < 9; k++) box('knob', pw * 0.7, 0.006, 0.006, frame.m(u, v - ph * 0.3 + k * ph * 0.075, 0.012)); }
      else if (r < 0.6) label(frame, u, v + ph * 0.25, Math.min(0.12, pw * 0.5), 0.018, undefined, 0.0115);
    }
  };

  const displaySlots = [];
  const slot = (id, frame, u, v, w, h, kind = 'mfd', keys = true, border = 0.03) => {
    const W2 = w / 2 + border, H2 = h / 2 + border + (keys ? 0.024 : 0);
    const shape = new THREE.Shape();
    shape.moveTo(-W2, -H2); shape.lineTo(W2, -H2); shape.lineTo(W2, H2); shape.lineTo(-W2, H2); shape.lineTo(-W2, -H2);
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 - 0.004, -h / 2 - 0.004); hole.lineTo(-w / 2 - 0.004, h / 2 + 0.004); hole.lineTo(w / 2 + 0.004, h / 2 + 0.004); hole.lineTo(w / 2 + 0.004, -h / 2 - 0.004); hole.lineTo(-w / 2 - 0.004, -h / 2 - 0.004);
    shape.holes.push(hole);
    add('panel', new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 }), frame.m(u, v + (keys ? -0.012 : 0), 0.0));
    box('under', w + 0.01, h + 0.01, 0.02, frame.m(u, v, -0.012));
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl('metal', 0.0035, 0.0035, 0.003, frame.m(u + su * (W2 - 0.009), v + (keys ? -0.012 : 0) + sv * (H2 - 0.009), 0.02, rotX(Math.PI / 2)), 8);
    if (keys) {
      const nk = Math.max(3, Math.round(w / 0.06));
      for (let k = 0; k < nk; k++) {
        const uu = u + (k - (nk - 1) / 2) * (w / nk);
        box('knob', 0.022, 0.012, 0.007, frame.m(uu, v - h / 2 - 0.02, 0.021));
        lamp(frame.m(uu, v - h / 2 - 0.02, 0.0252), [0.016, 0.004, 0.002], WHITE, { base: 0.35 });
      }
    }
    const mat = new THREE.MeshStandardMaterial({ name: 'slot.' + id, color: 0x020505, roughness: 0.15, metalness: 0, emissive: 0x000000 });
    own.push(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.name = 'slot_' + id;
    frame.m(u, v, 0.006).decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.receiveShadow = true;
    group.add(mesh);
    displaySlots.push({ id, mesh, width: w, height: h, kind, deathAt: 0.2 + R() * 0.75, display: null });
  };

  {
    const floorRegion = ccw([[-FLOOR_X, Z0 + 0.02], [FLOOR_X, Z0 + 0.02], [FLOOR_X, Z1], [-FLOOR_X, Z1]]);
    const holes = [];
    const rects = [];
    for (let z = -1.55; z < 1.65; z += 0.6) { rects.push([-0.56, z, -0.3, z + 0.48]); rects.push([0.3, z, 0.56, z + 0.48]); }
    for (let z = -1.55; z < 0.05; z += 0.6) { rects.push([-2.15, z, -1.35, z + 0.48]); rects.push([1.35, z, 2.15, z + 0.48]); }
    for (let z = 2.0; z < 5.9; z += 0.62) { rects.push([-0.95, z, -0.15, z + 0.5]); rects.push([0.15, z, 0.95, z + 0.5]); }
    for (const r of rects) {
      const pts = [], rr = 0.1;
      for (const [cx, cz, a0] of [[r[2] - rr, r[1] + rr, -Math.PI / 2], [r[2] - rr, r[3] - rr, 0], [r[0] + rr, r[3] - rr, Math.PI / 2], [r[0] + rr, r[1] + rr, Math.PI]]) for (let k = 0; k <= 4; k++) { const a = a0 + k / 4 * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
      holes.push({ poly: ccw(pts), r });
    }
    gridSurface(B, 'floor', floorRegion, holes.map(h => h.poly), 0.3, (x, z) => [x, 0, z], () => [0, 1, 0], (x, z) => [x, z], () => [0, 1, 0]);
    for (const h of holes) {
      const P = h.poly, n = P.length, c = [(h.r[0] + h.r[2]) / 2, (h.r[1] + h.r[3]) / 2];
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n];
        B.quadO('panel', [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], -0.06, b[1]], [a[0], -0.06, a[1]], [c[0] - a[0], 0, c[1] - a[1]]);
      }
      const inner = offsetConvex(h.poly, -0.012);
      for (let i = 0; i < inner.length; i++) { const a = inner[i], b = inner[(i + 1) % inner.length]; B.quadO('trim', [a[0], 0.004, a[1]], [b[0], 0.004, b[1]], [b[0], 0.0, b[1]], [a[0], 0.0, a[1]], [0, 1, 0]); }
    }
    B.quadO('under', [-FLOOR_X, -0.24, Z0], [FLOOR_X, -0.24, Z0], [FLOOR_X, -0.24, Z1], [-FLOOR_X, -0.24, Z1], [0, 1, 0]);
    for (let z = -2.5; z < 6.4; z += 0.6) box('grate', 2 * FLOOR_X, 0.06, 0.05, tr(0, -0.17, z + 0.29));
    for (const x of [-1.2, -0.2, 0.2, 1.2]) box('grate', 0.05, 0.1, Z1 - Z0, tr(x, -0.15, (Z0 + Z1) / 2));
    for (const [x, r] of [[-0.42, 0.025], [-0.46, 0.018], [0.44, 0.03], [0.6, 0.02], [-0.7, 0.022]]) tube('rubber', [[x, -0.19, Z0 + 0.1], [x + 0.05, -0.2, 1.0], [x - 0.04, -0.19, 4.0], [x, -0.19, Z1 - 0.1]], r, 32, 6);
  }

  const sec = (s, z) => {
    const top = yC(s * WALL_X, z);
    const mid = Math.min(0.92, top - 0.12);
    return [[s * FLOOR_X, 0, z], [s * 2.95, mid, z], [s * WALL_X, top, z]];
  };
  {
    const zs = [];
    for (let z = Z0; z < Z1 - 1e-6; z += 0.25) zs.push(z);
    zs.push(Z1);
    for (const s of [-1, 1]) for (let i = 0; i < zs.length - 1; i++) {
      const a = sec(s, zs[i]), b = sec(s, zs[i + 1]);
      for (let j = 0; j < 2; j++) B.quadO('quilt', a[j], b[j], b[j + 1], a[j + 1], [-s, 0.3, 0]);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const za = -1.65 + k * 0.56, zb = za + 0.52;
      const WF = new Frame(V(s * (FLOOR_X + 0.577 * 0.62), 0.817 * 0.62, (za + zb) / 2), V(0, 0, s), V(s * 0.577, 0.817, 0));
      rbox('quilt', zb - za, 0.86, 0.07, 0.03, WF.m(0, 0, 0.035), 3);
      for (let d = -0.24; d < 0.24; d += 0.02) box('stitch', 0.011, 0.002, 0.002, WF.m(d, 0.41, 0.071));
    }
    const ceilRegion = ccw([[-WALL_X, Z0], [WALL_X, Z0], [WALL_X, Z1], [-WALL_X, Z1]]);
    const openings = windows.map(w => offsetConvex(w.poly, 0.04));
    gridSurface(B, 'ceiling', ceilRegion, openings, 0.12, (x, z) => [x, yC(x, z), z], (x, z) => deckNormal(x, z).map(v => -v), (x, z) => [x, z], (x, z) => deckNormal(x, z).map(v => -v));
    for (let k = 0; k < windows.length; k++) {
      const w = windows[k];
      const counts = edgeCounts(w.poly, 0.08);
      const O = sampleEdges(openings[k], counts), G = sampleEdges(w.glass, counts);
      const B1 = sampleEdges(offsetConvex(w.poly, 0.075), counts), B2 = sampleEdges(offsetConvex(w.poly, 0.1), counts);
      const n = O.length;
      const c = w.glass.reduce((a, p) => [a[0] + p[0] / w.glass.length, a[1] + p[1] / w.glass.length], [0, 0]);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const inward = [c[0] - O[i][0], 0, c[1] - O[i][1]];
        const g0 = [G[i][0], w.yPlane(...G[i]), G[i][1]], g1 = [G[j][0], w.yPlane(...G[j]), G[j][1]];
        const o0 = [O[i][0], yC(...O[i]) - 0.022, O[i][1]], o1 = [O[j][0], yC(...O[j]) - 0.022, O[j][1]];
        const b0 = [B1[i][0], yC(...B1[i]) - 0.022, B1[i][1]], b1 = [B1[j][0], yC(...B1[j]) - 0.022, B1[j][1]];
        const c0 = [B2[i][0], yC(...B2[i]) + 0.005, B2[i][1]], c1 = [B2[j][0], yC(...B2[j]) + 0.005, B2[j][1]];
        B.quadO('trim', o0, o1, g1, g0, [inward[0], -0.4, inward[2]]);
        B.quadO('trim', b0, b1, o1, o0, [0, -1, 0]);
        B.quadO('trim', c0, c1, b1, b0, [-inward[0], -0.6, -inward[2]]);
      }
    }
    {
      const block = windows.map(w => offsetConvex(w.poly, 0.11));
      const okR = (x, z) => !block.some(P => { for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false; } return true; });
      const rib = (a, b, wd = 0.04, dp = 0.022) => {
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (!okR(...a) || !okR(...b) || !okR(...m)) return false;
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, px = -dz / l * wd / 2, pz = dx / l * wd / 2;
        const P = (x, z, d) => [x, yC(x, z) - d, z];
        const a0 = P(a[0] + px, a[1] + pz, dp), a1 = P(a[0] - px, a[1] - pz, dp), b0 = P(b[0] + px, b[1] + pz, dp), b1 = P(b[0] - px, b[1] - pz, dp);
        B.quadO('trim', a0, b0, b1, a1, [0, -1, 0]);
        B.quadO('trim', P(a[0] + px, a[1] + pz, 0), P(b[0] + px, b[1] + pz, 0), b0, a0, [px, -0.2, pz]);
        B.quadO('trim', a1, b1, P(b[0] - px, b[1] - pz, 0), P(a[0] - px, a[1] - pz, 0), [-px, -0.2, -pz]);
        return true;
      };
      for (let z = -2.55; z < Z1 - 0.2; z += 0.55) for (let x = -WALL_X + 0.05; x < WALL_X - 0.1; x += 0.1) rib([x, z], [x + 0.1, z]);
      for (const x of [-2.55, -1.62, 1.62, 2.55]) for (let z = Z0 + 0.1; z < Z1 - 0.1; z += 0.1) rib([x, z], [x, z + 0.1], 0.03, 0.016);
      for (const x of [-1.5, -0.36, 0.36, 1.5]) {
        let run = null;
        for (let z = -0.6; z < Z1 - 0.4; z += 0.1) {
          const ok = okR(x, z) && okR(x, z + 0.1) && okR(x - 0.05, z) && okR(x + 0.05, z);
          if (ok && run === null) run = z;
          if ((!ok || z + 0.1 >= Z1 - 0.4) && run !== null) {
            const z1 = z;
            if (z1 - run > 0.45) {
              for (let zz = run; zz < z1 - 0.05; zz += 0.1) {
                const y = yC(x, zz + 0.05);
                box('trim', 0.07, 0.035, 0.1, tr(x, y - 0.02, zz + 0.05));
              }
              const ym = yC(x, (run + z1) / 2) - 0.04;
              lamps.push({ matrix: new THREE.Matrix4().makeRotationX(Math.atan2(yC(x, z1) - yC(x, run), z1 - run) * -1).setPosition(x, ym, (run + z1) / 2), size: [0.022, 0.022, z1 - run - 0.1], color: WHITE, t0: 0.2, death: 0.4 + R() * 0.5, kind: 'strip', base: 0.55 });
            }
            run = null;
          }
        }
      }
    }
    const shellSection = (z) => {
      const pts = [[-FLOOR_X, 0], [FLOOR_X, 0]];
      const s1 = sec(1, z), s0 = sec(-1, z);
      pts.push([s1[1][0], s1[1][1]], [s1[2][0], s1[2][1]]);
      for (let x = WALL_X - 0.2; x > -WALL_X + 0.1; x -= 0.2) pts.push([x, yC(x, z)]);
      pts.push([s0[2][0], s0[2][1]], [s0[1][0], s0[1][1]]);
      return pts;
    };
    add('panel', new THREE.ShapeGeometry(new THREE.Shape(shellSection(Z0 + 0.001).map(([x, y]) => new THREE.Vector2(x, y)))), tr(0, 0, Z0 + 0.001));
    const rear = new THREE.Shape(shellSection(Z1).map(([x, y]) => new THREE.Vector2(x, y)));
    const dh = new THREE.Path();
    dh.moveTo(-0.62, 0.0); dh.lineTo(-0.62, 1.74); dh.lineTo(0.62, 1.74); dh.lineTo(0.62, 0.0); dh.lineTo(-0.62, 0.0);
    rear.holes.push(dh);
    add('quilt', new THREE.ShapeGeometry(rear), tr(0, 0, Z1), { flip: true });
  }

  const seats = {};
  const strapSeg = (base, pts, w = 0.045) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = V(...pts[i]).applyMatrix4(base), b = V(...pts[i + 1]).applyMatrix4(base);
      const len = b.distanceTo(a);
      const m = new THREE.Matrix4().lookAt(a, b, V(0, 1, 0)).setPosition(a.clone().add(b).multiplyScalar(0.5));
      box('webbing', w, 0.005, len + 0.004, m);
    }
  };
  const buildSeat = (id, x, z, opts = {}) => {
    const y0 = opts.raise || 0;
    const base = tr(x, y0, z);
    const L = (m) => base.clone().multiply(m);
    if (y0 > 0) {
      rbox('panel', 0.7, y0, 0.95, 0.02, tr(x, y0 / 2, z - 0.05), 2);
      box('floor', 0.66, 0.004, 0.9, tr(x, y0 + 0.002, z - 0.05));
      for (const sx of [-0.31, 0.31]) for (const sz of [-0.45, 0.35]) cyl('metal', 0.008, 0.008, 0.005, tr(x + sx, y0 + 0.004, z + sz), 8);
    }
    for (const sx of [-0.16, 0.16]) { box('metal', 0.04, 0.03, 0.72, L(tr(sx, 0.015, 0.02))); for (let k = 0; k < 6; k++) cyl('metal', 0.006, 0.006, 0.006, L(tr(sx, 0.032, -0.3 + k * 0.12)), 6); }
    for (const sgn of [-1, 1]) for (const sx of [-0.13, 0.13]) box('metal', 0.022, 0.022, 0.42, L(tr(sx, 0.18, 0.0).multiply(rotX(sgn * 0.62))));
    cyl('metal', 0.012, 0.012, 0.3, L(tr(0, 0.18, 0.0)).multiply(rotZ(Math.PI / 2)), 8);
    rbox('panel', 0.44, 0.04, 0.5, 0.012, L(tr(0, 0.35, 0)));
    const pan = L(tr(0, 0.43, 0).multiply(rotX(-0.1)));
    rbox('fabric', 0.34, 0.075, 0.46, 0.03, pan, 3);
    for (const sx of [-1, 1]) tube('fabric', [pan.clone().multiply(tr(sx * 0.2, 0.02, 0.22)), pan.clone().multiply(tr(sx * 0.205, 0.045, 0.0)), pan.clone().multiply(tr(sx * 0.2, 0.06, -0.21))].map(m => new THREE.Vector3().setFromMatrixPosition(m)), 0.042, 16, 10);
    for (let k = 0; k < 3; k++) for (let d = -0.2; d < 0.2; d += 0.02) box('stitch', 0.0022, 0.002, 0.011, pan.clone().multiply(tr(-0.1 + k * 0.1, 0.039, d)));
    const back = L(tr(0, 0.44, 0.24).multiply(rotX(0.2)));
    const bp = (u, v, w) => new THREE.Vector3(u, v, w).applyMatrix4(back);
    rbox('slate', 0.44, 0.9, 0.04, 0.012, back.clone().multiply(tr(0, 0.45, 0.025)));
    for (let k = 0; k < 4; k++) box('stitch', 0.36, 0.004, 0.003, back.clone().multiply(tr(0, 0.2 + k * 0.2, 0.046)));
    rbox('fabric', 0.32, 0.8, 0.06, 0.026, back.clone().multiply(tr(0, 0.44, -0.025)), 3);
    for (const sx of [-1, 1]) tube('fabric', [bp(sx * 0.19, 0.06, -0.03), bp(sx * 0.205, 0.3, -0.07), bp(sx * 0.2, 0.6, -0.06), bp(sx * 0.18, 0.82, -0.03)], 0.048, 20, 10);
    for (let k = 0; k < 6; k++) for (let d = -0.15; d < 0.15; d += 0.02) box('stitch', 0.011, 0.0022, 0.002, back.clone().multiply(tr(d, 0.14 + k * 0.11, -0.056)));
    rbox('webbing', 0.32, 0.34, 0.022, 0.009, back.clone().multiply(tr(0, 0.42, 0.058)), 2);
    for (const sx of [-1, 1]) cyl('metal', 0.011, 0.011, 0.88, back.clone().multiply(tr(sx * 0.225, 0.45, 0.04)), 8);
    for (const sx of [-0.07, 0.07]) cyl('metal', 0.009, 0.009, 0.18, back.clone().multiply(tr(sx, 0.94, 0.0)), 8);
    rbox('slate', 0.26, 0.18, 0.09, 0.03, back.clone().multiply(tr(0, 1.06, -0.012)), 3);
    for (const sx of [-1, 1]) rbox('slate', 0.04, 0.17, 0.11, 0.016, back.clone().multiply(tr(sx * 0.15, 1.06, -0.02).multiply(rotY(sx * -0.3))), 2);
    for (let d = -0.1; d < 0.1; d += 0.02) box('stitch', 0.011, 0.0022, 0.002, back.clone().multiply(tr(d, 1.06, -0.058)));
    const bk = (u, v, w = -0.065) => V(u, v, w).applyMatrix4(back).applyMatrix4(base.clone().invert()).toArray();
    const buckle = [0, 0.52, -0.1];
    for (const sx of [-1, 1]) {
      strapSeg(base, [bk(sx * 0.09, 0.8, -0.05), bk(sx * 0.1, 0.55), bk(sx * 0.09, 0.3), bk(sx * 0.06, 0.1), [sx * 0.05, 0.55, 0.05], buckle]);
      strapSeg(base, [[sx * 0.22, 0.5, 0.12], [sx * 0.18, 0.54, 0.02], [sx * 0.07, 0.535, -0.06], buckle]);
      box('metal', 0.05, 0.012, 0.03, L(tr(...bk(sx * 0.1, 0.45, -0.07))));
    }
    strapSeg(base, [[0, 0.49, -0.24], [0, 0.52, -0.18], buckle]);
    cyl('metal', 0.045, 0.045, 0.014, L(tr(...buckle).multiply(rotX(0.25))), 20);
    cyl('knob', 0.02, 0.02, 0.018, L(tr(buckle[0], buckle[1] + 0.006, buckle[2]).multiply(rotX(0.25))), 14);
    if (opts.arms) for (const sx of [-1, 1]) {
      box('metal', 0.03, 0.2, 0.03, L(tr(sx * 0.27, 0.52, 0.12)));
      rbox('fabric', 0.07, 0.05, 0.4, 0.02, L(tr(sx * 0.27, 0.64, -0.02)), 2);
      rbox('panel', 0.08, 0.05, 0.14, 0.012, L(tr(sx * 0.27, 0.64, -0.27)), 2);
    }
    seats[id] = { pos: V(x, y0, z), eye: V(x, y0 + 1.2, z - 0.05) };
    if (opts.footrest) {
      const fz = -0.62;
      for (const sx of [-0.15, 0.15]) {
        tube('metal', [[x + sx, y0 + 0.02, z - 0.2], [x + sx, y0 + 0.08, z + fz + 0.12], [x + sx, y0 * 0.3 + 0.3, z + fz]], 0.016, 12, 6);
        box('metal', 0.03, 0.04, 0.3, tr(x + sx, y0 + 0.02, z - 0.35));
      }
      for (let k = 0; k < 4; k++) box('metal', 0.3, 0.014, 0.025, tr(x, y0 * 0.3 + 0.08 + k * 0.06, z + fz + 0.12 - k * 0.04));
      cyl('metal', 0.012, 0.012, 0.32, tr(x, y0 * 0.3 + 0.3, z + fz).multiply(rotZ(Math.PI / 2)), 8);
    }
  };
  buildSeat('pilot', -0.85, -0.75, { footrest: true, raise: SEAT_RAISE, arms: true });
  buildSeat('copilot', 0.85, -0.75, { footrest: true, raise: SEAT_RAISE, arms: true });
  buildSeat('rearL', -1.55, 1.0);
  buildSeat('rearR', 1.55, 1.0);

  const pilotF = tilted(V(-0.97, 0.66, -1.98), V(1, 0, 0), 32);
  const copF = tilted(V(0.97, 0.66, -1.98), V(1, 0, 0), 32);
  for (const [F, sgn] of [[pilotF, -1], [copF, 1]]) {
    slab(F, 1.22, 0.46, 0.05, 0.5);
    rbox('panel', 1.26, 0.025, 0.12, 0.008, F.m(0, 0.24, 0.04, rotX(-0.25)), 2);
    const top = F.p(0, 0.23, 0), bz = -3.05;
    box('panel', 1.24, 0.02, Math.abs(bz - top.z), new THREE.Matrix4().makeRotationX(-Math.atan2(top.y - 0.52, top.z - bz)).setPosition(F.o.x, (top.y + 0.52) / 2, (top.z + bz) / 2));
    const id = sgn < 0 ? 'mainL' : 'mainR';
    for (let k = 0; k < 3; k++) slot(id + (k + 1), F, (k - 1) * 0.395, 0.015, 0.27, 0.2, 'mfd', true, 0.025);
    for (let k = 0; k < 16; k++) { const u = -0.56 + k * 0.0747; cyl('knob', 0.008, 0.008, 0.012, F.m(u, 0.185, 0.006, rotX(Math.PI / 2)), 12); lamp(F.m(u, 0.185, 0.0125), [0.009, 0.009, 0.002], pickColor()); }
    switchField(F, -0.58, -0.225, -0.14, -0.135, { pu: 0.04 });
    switchField(F, 0.14, -0.225, 0.58, -0.135, { pu: 0.04 });
    buttonBlock(F, 0, -0.18, 6, 2, 0.018);
    box('panel', 1.2, 0.4, 0.02, new THREE.Matrix4().makeRotationX(0.95).setPosition(F.o.x, 0.35, -2.05));
    box('panel', 1.24, 0.45, 0.03, tr(F.o.x, 0.23, -2.42));
    for (const px of [-0.2, 0.2]) {
      const m = tr(F.o.x + px, 0.06, -2.3).multiply(rotX(-0.9));
      rbox('metal', 0.1, 0.24, 0.02, 0.006, m.clone().multiply(tr(0, 0.12, 0)));
      box('rubber', 0.09, 0.2, 0.006, m.clone().multiply(tr(0, 0.12, 0.012)));
    }
  }
  for (const s of [-1, 1]) {
    const inner = V(s * 1.6, 0.66, -1.98), outer = V(s * 2.25, 0.6, -1.5);
    const right = s < 0 ? inner.clone().sub(outer) : outer.clone().sub(inner);
    const WF = tilted(inner.clone().add(outer).multiplyScalar(0.5), right, 28);
    const w = inner.distanceTo(outer) + 0.04;
    slab(WF, w, 0.46, 0.05, 0.45);
    slot(s < 0 ? 'sideL' : 'sideR', WF, s * 0.07, 0.04, 0.24, 0.18, 'mfd', false, 0.025);
    buttonBlock(WF, s * -0.29, 0.06, 2, 5, 0.02);
    switchField(WF, -w / 2 + 0.04, -0.21, w / 2 - 0.04, -0.09, { pu: 0.04 });
  }

  const centreF = tilted(V(0, 0.9, -2.06), V(1, 0, 0), 10);
  {
    const F = centreF;
    slab(F, 0.8, 0.68, 0.05, 0.45);
    let n = 1;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) slot('centre' + (n++), F, (i - 1) * 0.232, 0.19 - j * 0.19, 0.2, 0.15, 'small', false, 0.016);
    for (const s of [-1, 1]) for (let k = 0; k < 10; k++) { button(F, s * 0.372, 0.28 - k * 0.062, 0.018, 0.03); }
    lamps.push({ matrix: F.m(0, 0.312, 0.006), size: [0.07, 0.014, 0.004], color: REDC, t0: 0, death: 2, kind: 'caution', base: 0 });
    rbox('knob', 0.1, 0.03, 0.03, 0.006, F.m(0, 0.312, 0.0));
  }
  const pedF = tilted(V(0, 0.56, -1.62), V(1, 0, 0), 58);
  {
    rbox('panel', 0.64, 0.5, 0.78, 0.02, tr(0, 0.25, -1.98), 3);
    rbox('panel', 0.64, 0.46, 0.05, 0.015, pedF.m(0, 0, -0.025), 2);
    box('panel', 0.62, 0.3, 0.3, tr(0, 0.38, -1.75));
    detailFace(new Frame(V(0, 0.22, -1.585), V(1, 0, 0), V(0, 1, 0)), 0.6, 0.4, { pw: 0.3, ph: 0.2 });
    for (const s of [-1, 1]) detailFace(new Frame(V(s * 0.321, 0.25, -1.98), V(0, 0, -s), V(0, 1, 0)), 0.74, 0.46, { pw: 0.37, ph: 0.23 });
    switchField(pedF, -0.29, 0.12, 0.29, 0.21, { pu: 0.045, pv: 0.09 });
  }
  {
    const az0 = -1.45, az1 = 1.7;
    rbox('panel', 0.5, 0.12, az1 - az0, 0.02, tr(0, 0.06, (az0 + az1) / 2), 2);
    for (let z = az0 + 0.02; z < az1 - 0.2; z += 0.3) rbox('knob', 0.46, 0.035, 0.28, 0.01, tr(0, 0.13, z + 0.14), 2);
  }

  const ovA = V(0, 1.27, -1.93), ovB = V(0, 1.78, -0.55);
  const ovhF = new Frame(ovA.clone().add(ovB).multiplyScalar(0.5), V(1, 0, 0), ovB.clone().sub(ovA).normalize());
  {
    const len = ovA.distanceTo(ovB);
    rbox('panel', 0.56, len, 0.06, 0.015, ovhF.m(0, 0, -0.03), 3);
    for (let z = -1.95; z + 0.125 < -0.56; z += 0.12) {
      const yb = ovA.y + (z - ovA.z) / (ovB.z - ovA.z) * (ovB.y - ovA.y);
      const lo = yb + 0.075, hi = yC(0.28, z) + 0.02;
      if (hi > lo) box('panel', 0.53, hi - lo, 0.125, tr(0, (lo + hi) / 2, z + 0.06));
    }
    switchField(ovhF, -0.25, -0.78, 0.25, 0.3, { pu: 0.05, pv: 0.07 });
    slot('overhead', ovhF, 0, 0.55, 0.22, 0.16, 'mfd', false, 0.022);
    for (const s of [-1, 1]) {
      const sf = new Frame(V(s * 0.281, 1.4, -1.3), V(0, 0, -s), V(0, 1, 0));
      switchField(sf, -0.55, -0.06, 0.55, 0.08, { pu: 0.06, pv: 0.07, rules: false });
      const pod = tilted(V(s * 0.36, 1.62, -1.3), V(0.85, 0, s * -0.53), -38);
      rbox('panel', 0.24, 0.2, 0.06, 0.01, pod.m(0, 0, -0.03), 2);
      slot(s < 0 ? 'overheadL' : 'overheadR', pod, 0, 0, 0.16, 0.12, 'small', false, 0.018);
      tube('metal', [pod.p(0, 0.1, -0.05), V(s * 0.3, 1.72, -1.35), V(s * 0.28, yC(0.28, -1.3) - 0.03, -1.3)], 0.014, 10, 6);
    }
  }

  for (const s of [-1, 1]) {
    for (let z = -1.9; z < 6.0; z += 0.9) {
      const v = 1.06;
      const p0 = V(s * (FLOOR_X + 0.577 * v), 0.817 * v, z), n = V(-s * 0.817, 0.577, 0);
      tube('metal', [p0, p0.clone().addScaledVector(n, 0.05), p0.clone().addScaledVector(n, 0.05).add(V(0, 0, 0.22)), p0.clone().add(V(0, 0, 0.22))], 0.011, 12, 6);
    }
    tube('rubber', [[s * 2.95, 0.96, Z0 + 0.3], [s * 2.97, 0.98, 1.5], [s * 2.96, 0.96, 5.8]], 0.02, 48, 6);
    for (let z = -2.4; z < 5.8; z += 0.6) box('metal', 0.05, 0.06, 0.03, tr(s * 2.95, 0.95, z));
  }

  const helmetGroup = new THREE.Group();
  helmetGroup.name = 'helmet';
  {
    const lx = -1.95;
    rbox('panel', 0.7, 1.7, 1.25, 0.02, tr(lx - 0.05, 0.85, 2.9), 3);
    box('under', 0.02, 1.5, 1.08, tr(lx + 0.31, 0.85, 2.9));
    box('trim', 0.64, 0.02, 1.15, tr(lx, 1.22, 2.9));
    box('trim', 0.64, 0.02, 1.15, tr(lx, 0.55, 2.9));
    const HB = new MeshBuilder();
    const hadd = (key, geom, m) => { HB.geometry(key, geom, m); geom.dispose(); };
    hadd('helmet', new THREE.SphereGeometry(0.165, 40, 28), new THREE.Matrix4().makeScale(1, 1.06, 1.1));
    hadd('visor', new THREE.SphereGeometry(0.168, 32, 20, -Math.PI * 0.32 + Math.PI / 2, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.3), rotY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, 1.06, 1.1)));
    hadd('knob', new THREE.TorusGeometry(0.168, 0.012, 8, 48, Math.PI * 1.2), rotY(Math.PI / 2).multiply(rotX(-0.2)).multiply(rotZ(-0.05)));
    for (const s of [-1, 1]) hadd('metal', new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), tr(0, 0, s * 0.18).multiply(rotX(Math.PI / 2)));
    hadd('metal', new THREE.TorusGeometry(0.13, 0.018, 10, 40), tr(0, -0.16, 0).multiply(rotX(Math.PI / 2)));
    for (const m of HB.meshes(M)) helmetGroup.add(m);
    helmetGroup.position.set(lx + 0.02, 1.4, 2.65);
    group.add(helmetGroup);
    rbox('helmet', 0.3, 0.42, 0.22, 0.05, tr(lx - 0.02, 0.8, 3.2));
    box('webbing', 0.32, 0.04, 0.24, tr(lx - 0.02, 0.62, 3.2));
    for (const [z0, z1] of [[3.7, 4.8], [4.9, 6.0]]) {
      rbox('panel', 0.62, 1.15, z1 - z0, 0.015, tr(-1.98, 0.58, (z0 + z1) / 2), 2);
      for (const y of [0.25, 0.9]) { box('metal', 0.03, 0.05, 0.08, tr(-1.66, y, z0 + 0.15)); box('metal', 0.03, 0.05, 0.08, tr(-1.66, y, z1 - 0.15)); }
      cyl('metal', 0.012, 0.012, 0.18, tr(-1.655, 0.62, (z0 + z1) / 2), 8);
      label(new Frame(V(-1.665, 0.95, (z0 + z1) / 2), V(0, 0, -1), V(0, 1, 0)), 0, 0, 0.14, 0.04);
    }
    for (const [z0, z1, y0, y1] of [[1.95, 3.1, 0, 0.6], [1.95, 3.1, 0.62, 1.22], [3.15, 4.3, 0, 0.6], [3.15, 4.3, 0.62, 1.22], [4.35, 5.6, 0, 1.22]]) {
      rbox('panel', 0.6, y1 - y0 - 0.02, z1 - z0 - 0.02, 0.012, tr(1.95, (y0 + y1) / 2, (z0 + z1) / 2), 2);
      rbox('trim', 0.02, y1 - y0 - 0.12, z1 - z0 - 0.12, 0.006, tr(1.645, (y0 + y1) / 2, (z0 + z1) / 2), 2);
      for (const zz of [z0 + 0.1, z1 - 0.1]) box('metal', 0.025, 0.06, 0.04, tr(1.64, (y0 + y1) / 2, zz));
      label(new Frame(V(1.633, y1 - 0.08, (z0 + z1) / 2), V(0, 0, 1), V(0, 1, 0)), 0, 0, 0.16, 0.04);
    }
    for (const s of [-1, 1]) {
      const x = s * 0.55;
      tube('metal', [[x, yC(x, 1.8) - 0.005, 1.8], [x, yC(x, 1.9) - 0.09, 1.9], [x, yC(x, 4.0) - 0.09, 4.0], [x, yC(x, 6.0) - 0.09, 6.0], [x, yC(x, 6.1) - 0.005, 6.1]], 0.016, 64, 8);
      tube('hazard', [[s * 0.75, 0.25, Z1 - 0.01], [s * 0.75, 0.25, Z1 - 0.08], [s * 0.75, 1.5, Z1 - 0.08], [s * 0.75, 1.5, Z1 - 0.01]], 0.017, 24, 8);
    }
    const bF = new Frame(V(1.05, 1.35, Z1 - 0.005), V(-1, 0, 0), V(0, 1, 0));
    slab(bF, 0.34, 0.26, 0.03, 0);
    for (let k = 0; k < 4; k++) button(bF, -0.12 + k * 0.08, 0.05, 0.03, 0.02, k === 0 ? GREEN : AMBER);
    switchField(bF, -0.15, -0.12, 0.15, -0.0, { pu: 0.05, pv: 0.1 });
    box('hazard', 1.5, 0.06, 0.01, tr(0, 1.84, Z1 - 0.01));
  }

  const interactables = [];
  const state = {};
  const parts = {};
  const mkPart = (name, build, parent = group) => {
    const g = new THREE.Group(); g.name = name;
    const PB = new MeshBuilder();
    build(PB);
    for (const m of PB.meshes(M)) g.add(m);
    parent.add(g);
    return g;
  };
  const primB = (PB) => ({
    box: (key, sx, sy, sz, m) => { const g = new THREE.BoxGeometry(sx, sy, sz); PB.geometry(key, g, m); g.dispose(); },
    rbox: (key, sx, sy, sz, r, m) => { const g = new RoundedBoxGeometry(sx, sy, sz, 2, r); PB.geometry(key, g, m); g.dispose(); },
    cyl: (key, r0, r1, h, m, seg = 14) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); PB.geometry(key, g, m); g.dispose(); },
    torus: (key, r, t, arc, m) => { const g = new THREE.TorusGeometry(r, t, 8, 24, arc); PB.geometry(key, g, m); g.dispose(); },
  });
  const setValue = (id, v, instant = false) => { const s = state[id]; if (!s) return; s.target = Math.max(0, Math.min(1, v)); if (instant) { s.v = s.target; s.apply(s.v); } };
  const toggleValue = (id) => { const s = state[id]; if (!s) return; setValue(id, s.target > 0.5 ? 0 : 1); };
  const register = (id, kind, object, apply, init = 0) => {
    object.userData.interactId = id;
    state[id] = { v: init, target: init, apply, speed: 4 };
    apply(init);
    const api = { id, kind, object, set: (v, instant) => setValue(id, v, instant), toggle: () => toggleValue(id) };
    interactables.push(api);
    return api;
  };

  const guarded = (id, F, u, v) => {
    const root = new THREE.Group();
    root.position.copy(F.p(u, v, 0)); root.quaternion.copy(F.q());
    group.add(root);
    mkPart(id + '_base', (PB) => {
      const p = primB(PB);
      p.rbox('knob', 0.05, 0.07, 0.008, 0.003, tr(0, 0, 0.004));
      p.cyl('metal', 0.008, 0.008, 0.008, tr(0, 0, 0.012).multiply(rotX(Math.PI / 2)), 6);
      for (const s of [-1, 1]) p.box('metal', 0.006, 0.012, 0.016, tr(s * 0.021, -0.03, 0.012));
    }, root);
    const guardPivot = new THREE.Group(); guardPivot.position.set(0, -0.03, 0.02); root.add(guardPivot);
    mkPart(id + '_guard', (PB) => {
      const p = primB(PB);
      p.box('hazard', 0.036, 0.058, 0.003, tr(0, 0.03, 0.016));
      for (const s of [-1, 1]) p.box('hazard', 0.003, 0.058, 0.018, tr(s * 0.018, 0.03, 0.007));
      p.box('hazard', 0.036, 0.003, 0.018, tr(0, 0.059, 0.007));
    }, guardPivot);
    const levPivot = new THREE.Group(); levPivot.position.set(0, 0, 0.016); root.add(levPivot);
    mkPart(id + '_lever', (PB) => {
      const p = primB(PB);
      p.cyl('metal', 0.0028, 0.004, 0.03, tr(0, 0, 0.015).multiply(rotX(Math.PI / 2)), 10);
      p.cyl('metal', 0.0045, 0.0045, 0.006, tr(0, 0, 0.031).multiply(rotX(Math.PI / 2)), 10);
    }, levPivot);
    label(F, u, v - 0.05, 0.05, 0.012, LABEL_WORDS.indexOf(id === 'batt' ? 'BATT' : id === 'fuelCells' ? 'FC 1' : id === 'avionics' ? 'AVNX' : 'RCS'));
    lamps.push({ matrix: F.m(u, v + 0.045, 0.004), size: [0.014, 0.008, 0.003], color: GREEN, t0: 0, death: 2, kind: 'status:' + id, base: 1 });
    return register(id, 'toggle', root, (x) => { guardPivot.rotation.x = -smooth(0, 0.45, x) * 1.9; levPivot.rotation.x = 0.5 - smooth(0.45, 1, x) * 1.0; });
  };
  ['batt', 'fuelCells', 'avionics', 'rcs'].forEach((id, k) => guarded(id, pedF, -0.18 + k * 0.12, 0.0));

  {
    const root = new THREE.Group();
    root.position.copy(pedF.p(0, -0.14, 0)); root.quaternion.copy(pedF.q());
    group.add(root);
    mkPart('engineStart_ring', (PB) => { primB(PB).cyl('hazard', 0.03, 0.03, 0.016, tr(0, 0, 0.008).multiply(rotX(Math.PI / 2)), 24); }, root);
    const cap = mkPart('engineStart_cap', (PB) => { primB(PB).cyl('knob', 0.019, 0.019, 0.014, tr(0, 0, 0.007).multiply(rotX(Math.PI / 2)), 20); }, root);
    lamps.push({ matrix: pedF.m(0, -0.14, 0.0205), size: [0.026, 0.026, 0.002], color: AMBER, t0: 0, death: 2, kind: 'status:engineStart', base: 1 });
    label(pedF, 0, -0.185, 0.06, 0.014, LABEL_WORDS.indexOf('START'));
    register('engineStart', 'button', root, (x) => { cap.position.z = 0.008 - x * 0.007; });
  }
  {
    const root = new THREE.Group();
    root.position.set(-0.42, yC(-0.42, -0.3) - 0.01, -0.3);
    group.add(root);
    const handle = mkPart('clamp_handle', (PB) => {
      const p = primB(PB);
      p.cyl('metal', 0.012, 0.012, 0.26, tr(0, -0.13, 0), 12);
      p.cyl('hazard', 0.018, 0.018, 0.2, tr(0, -0.265, 0).multiply(rotZ(Math.PI / 2)), 16);
      for (const s of [-1, 1]) p.cyl('knob', 0.02, 0.02, 0.025, tr(s * 0.11, -0.265, 0).multiply(rotZ(Math.PI / 2)), 14);
    }, root);
    mkPart('clamp_mount', (PB) => { const p = primB(PB); p.rbox('panel', 0.14, 0.03, 0.12, 0.008, tr(0, 0.01, 0)); p.cyl('metal', 0.022, 0.022, 0.02, tr(0, -0.012, 0), 16); }, root);
    register('clamp', 'handle', handle, (x) => { const a = smooth(0, 0.5, x), b = smooth(0.5, 1, x); handle.position.y = -a * 0.11; handle.rotation.y = b * Math.PI / 2; });
  }
  {
    const root = new THREE.Group();
    root.position.set(-0.85, SEAT_RAISE + 0.41, -1.03);
    group.add(root);
    mkPart('eject_guard', (PB) => { const p = primB(PB); p.torus('metal', 0.065, 0.007, Math.PI, tr(0, 0.0, -0.01)); for (const s of [-1, 1]) p.box('metal', 0.012, 0.03, 0.03, tr(s * 0.065, -0.01, 0.0)); }, root);
    const h = mkPart('eject_handle', (PB) => { const p = primB(PB); p.torus('hazard', 0.045, 0.011, Math.PI, tr(0, 0.0, -0.02).multiply(rotX(-0.4))); for (const s of [-1, 1]) p.cyl('knob', 0.012, 0.012, 0.03, tr(s * 0.045, -0.012, -0.012), 10); }, root);
    register('eject', 'handle', h, (x) => { h.position.set(0, x * 0.06, -x * 0.05); h.rotation.x = -x * 0.5; });
  }
  {
    const hinge = new THREE.Group();
    hinge.position.set(0.68, 0, Z1 - 0.04);
    group.add(hinge);
    const door = mkPart('hatch_door', (PB) => {
      const p = primB(PB);
      p.rbox('trim', 1.32, 1.84, 0.07, 0.02, tr(-0.68, 0.9, 0));
      p.rbox('panel', 1.1, 1.6, 0.02, 0.01, tr(-0.68, 0.9, -0.04));
      for (let k = 0; k < 6; k++) p.box('metal', 0.04, 0.05, 0.04, tr(-1.3, 0.25 + k * 0.28, -0.02));
      for (const y of [0.35, 1.45]) p.box('metal', 0.08, 0.16, 0.05, tr(-0.02, y, -0.01));
      p.box('hazard', 1.2, 0.05, 0.004, tr(-0.68, 1.68, -0.052));
      const g = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 32); PB.geometry('under', g, tr(-0.68, 1.3, -0.04).multiply(rotX(Math.PI / 2))); g.dispose();
      p.torus('metal', 0.17, 0.012, Math.PI * 2, tr(-0.68, 1.3, -0.05));
    }, hinge);
    const leverPivot = new THREE.Group();
    leverPivot.position.set(-1.12, 0.95, -0.07);
    door.add(leverPivot);
    mkPart('hatch_lever', (PB) => {
      const p = primB(PB);
      p.cyl('metal', 0.03, 0.03, 0.04, tr(0, 0, -0.02).multiply(rotX(Math.PI / 2)), 18);
      p.box('metal', 0.04, 0.3, 0.025, tr(0, 0.15, -0.035));
      p.cyl('hazard', 0.02, 0.02, 0.09, tr(0, 0.3, -0.06).multiply(rotX(Math.PI / 2)), 12);
    }, leverPivot);
    register('hatch', 'lever', leverPivot, (x) => { leverPivot.rotation.z = -smooth(0, 0.35, x) * Math.PI / 2; hinge.rotation.y = -smooth(0.35, 1, x) * 1.75; doorBox.min[1] = x > 0.6 ? 1e5 : 0; doorBox.max[1] = x > 0.6 ? 1e5 + 0.01 : 1.74; });
    parts.hatchDoor = door;
  }
  {
    const root = new THREE.Group();
    root.position.set(-0.85 - 0.27, SEAT_RAISE + 0.665, -0.75 - 0.27);
    group.add(root);
    mkPart('stick_boot', (PB) => { const p = primB(PB); p.cyl('rubber', 0.03, 0.04, 0.035, tr(0, 0.017, 0), 16); }, root);
    const piv = new THREE.Group(); piv.position.set(0, 0.035, 0); root.add(piv);
    mkPart('stick', (PB) => {
      const p = primB(PB);
      p.cyl('metal', 0.011, 0.013, 0.12, tr(0, 0.06, 0), 12);
      p.rbox('knob', 0.04, 0.1, 0.048, 0.015, tr(0, 0.15, 0.0));
      p.cyl('knob', 0.007, 0.007, 0.01, tr(0, 0.205, -0.012), 10);
      p.box('hazard', 0.012, 0.02, 0.02, tr(0, 0.14, -0.026));
    }, piv);
    parts.stick = piv;
    interactables.push({ id: 'stick', kind: 'stick', object: piv, set: (v) => setStick(v, 0), toggle: () => {} });
  }
  {
    const root = new THREE.Group();
    root.position.set(-0.85 + 0.27, SEAT_RAISE + 0.665, -0.75 - 0.27);
    group.add(root);
    mkPart('throttle_gate', (PB) => { const p = primB(PB); p.rbox('knob', 0.05, 0.02, 0.2, 0.006, tr(0, 0.01, 0)); for (let k = 0; k < 5; k++) p.box('metal', 0.06, 0.004, 0.003, tr(0, 0.021, -0.08 + k * 0.04)); }, root);
    const piv = new THREE.Group(); root.add(piv);
    mkPart('throttle', (PB) => {
      const p = primB(PB);
      p.box('metal', 0.012, 0.13, 0.016, tr(0, 0.065, 0));
      p.rbox('knob', 0.07, 0.04, 0.05, 0.016, tr(0.015, 0.14, 0));
      p.box('hazard', 0.016, 0.008, 0.052, tr(0.045, 0.14, 0));
    }, piv);
    parts.throttle = piv;
    register('throttle', 'lever', piv, (x) => { piv.rotation.x = 0.45 - x * 0.9; });
  }
  {
    const root = tr(0.85 + 0.27, SEAT_RAISE + 0.665, -1.02);
    cyl('rubber', 0.03, 0.04, 0.035, root.clone().multiply(tr(0, 0.017, 0)), 16);
    cyl('metal', 0.011, 0.013, 0.12, root.clone().multiply(tr(0, 0.095, 0)), 12);
    rbox('knob', 0.04, 0.1, 0.048, 0.015, root.clone().multiply(tr(0, 0.185, 0)));
  }

  const lampGeo = new THREE.BoxGeometry(1, 1, 1);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
  lampMesh.name = 'lamps';
  const S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), Q3 = new THREE.Quaternion();
  lamps.forEach((l, i) => { l.matrix.decompose(P3, Q3, S3); lampMesh.setMatrixAt(i, new THREE.Matrix4().compose(P3, Q3, V(...l.size))); lampMesh.setColorAt(i, new THREE.Color(0, 0, 0)); });
  lampMesh.instanceMatrix.needsUpdate = true;
  group.add(lampMesh);
  own.push(lampGeo, lampMat);

  for (const m of B.meshes(M)) group.add(m);

  const sparkPts = [];
  for (let i = 0; i < 24; i++) { const F = [pilotF, copF, centreF, ovhF, pedF][i % 5]; sparkPts.push(F.p((R() - 0.5) * 0.5, (R() - 0.5) * 0.3, 0.02)); }
  const sparkGeo = new THREE.OctahedronGeometry(0.012, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, sparkPts.length);
  sparks.name = 'sparks';
  sparkPts.forEach((p, i) => { sparks.setMatrixAt(i, new THREE.Matrix4().compose(p, new THREE.Quaternion(), V(0, 0, 0))); sparks.setColorAt(i, new THREE.Color(0, 0, 0)); });
  sparks.frustumCulled = false;
  group.add(sparks);
  own.push(sparkGeo, sparkMat);

  const lights = {
    flood: new THREE.PointLight(0xdfe8ff, 0, 4.5, 2),
    panel: new THREE.PointLight(0x8fe6ff, 0, 2.2, 2),
    cabin: new THREE.PointLight(0xe9eef4, 0, 6, 2),
    caution: new THREE.PointLight(0xff2a10, 0, 1.2, 2),
    bounce: new THREE.PointLight(0xd8e2ee, 0, 6.5, 1.1),
  };
  lights.flood.position.set(0, 1.75, -0.8);
  lights.panel.position.set(0, 0.95, -1.5);
  lights.cabin.position.set(0, 1.6, 3.8);
  lights.caution.position.copy(centreF.p(0, 0.312, 0.06));
  lights.bounce.position.set(0, 0.55, -0.2);
  for (const l of Object.values(lights)) { l.castShadow = false; group.add(l); }
  const LIGHT_MAX = { flood: 0.9, panel: 0.6, cabin: 1.6, caution: 0.9 };

  group.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material !== M.labels) { o.castShadow = true; o.receiveShadow = true; } });

  const anchors = {};
  const anchor = (name, p, look = [0, 0, -1]) => { const o = new THREE.Object3D(); o.name = name; o.position.copy(p); o.lookAt(p.clone().add(V(...look))); group.add(o); anchors[name] = o; return o; };
  anchor('pilotEye', seats.pilot.eye);
  anchor('seatPilot', seats.pilot.pos);
  anchor('seatCopilot', seats.copilot.pos);
  anchor('seatRearL', seats.rearL.pos);
  anchor('seatRearR', seats.rearR.pos);
  anchor('copilotEye', seats.copilot.eye);
  anchor('rearLEye', seats.rearL.eye);
  anchor('rearREye', seats.rearR.eye);
  anchor('rearCam', V(0, 1.32, 1.35));
  anchor('cabinEntry', V(0, 0, Z1 - 0.45), [0, 0, -1]);
  anchors.helmet = helmetGroup;

  const colliders = [
    { id: 'floor', min: [-FLOOR_X, -0.3, Z0], max: [FLOOR_X, 0, Z1] },
    { id: 'wallL', min: [-3.4, 0, Z0], max: [-FLOOR_X, 2.6, Z1] },
    { id: 'wallR', min: [FLOOR_X, 0, Z0], max: [3.4, 2.6, Z1] },
    { id: 'front', min: [-3.2, 0, Z0 - 0.2], max: [3.2, 0.9, -1.88] },
    { id: 'centreConsole', min: [-0.4, 0, -2.4], max: [0.4, 0.72, -1.55] },
    { id: 'aisleSpine', min: [-0.25, 0, -1.45], max: [0.25, 0.16, 1.7] },
    { id: 'overhead', min: [-0.3, 1.1, -1.95], max: [0.3, 2.1, -0.55] },
    { id: 'pilotPlatform', min: [-1.2, 0, -1.25], max: [-0.5, SEAT_RAISE, -0.3] },
    { id: 'copilotPlatform', min: [0.5, 0, -1.25], max: [1.2, SEAT_RAISE, -0.3] },
    { id: 'suitLocker', min: [-2.4, 0, 2.25], max: [-1.6, 1.7, 3.55] },
    { id: 'lockersL', min: [-2.4, 0, 3.7], max: [-1.66, 1.16, 6.0] },
    { id: 'lockersR', min: [1.64, 0, 1.95], max: [2.4, 1.22, 5.6] },
    { id: 'rearL', min: [-3.2, 0, Z1 - 0.05], max: [-0.62, 2.4, Z1 + 0.1] },
    { id: 'rearR', min: [0.62, 0, Z1 - 0.05], max: [3.2, 2.4, Z1 + 0.1] },
    { id: 'rearTop', min: [-0.62, 1.74, Z1 - 0.05], max: [0.62, 2.4, Z1 + 0.1] },
    doorBox,
  ];
  for (const [id, s] of Object.entries(seats)) colliders.push({ id: 'seat_' + id, min: [s.pos.x - 0.3, s.pos.y, s.pos.z - 0.3], max: [s.pos.x + 0.3, s.pos.y + 0.55, s.pos.z + 0.35] }, { id: 'seatback_' + id, min: [s.pos.x - 0.3, s.pos.y + 0.45, s.pos.z + 0.2], max: [s.pos.x + 0.3, s.pos.y + 1.45, s.pos.z + 0.48] });
  for (let z = Z0; z < Z1; z += 0.5) {
    let lo = 9;
    for (let x = -2.5; x <= 2.5; x += 0.5) lo = Math.min(lo, yC(x, z), yC(x, z + 0.5));
    colliders.push({ id: 'ceil' + z.toFixed(1), min: [-3.2, lo, z], max: [3.2, lo + 0.6, z + 0.5] });
  }
  const walkable = [{ id: 'cabinFloor', min: [-FLOOR_X + 0.1, 0, -1.4], max: [FLOOR_X - 0.1, 0, Z1 - 0.1] }];

  const live = { power: 0, failure: 0, t: 0, sparkT: new Float32Array(sparkPts.length), dirty: true, stickX: 0, stickY: 0 };
  const col = new THREE.Color();
  const applyDisplays = () => {
    const p = live.power, f = live.failure;
    for (const s of displaySlots) {
      const d = s.display;
      if (!d) continue;
      const dead = f > s.deathAt;
      d.setPower?.(dead ? 0 : p);
      d.setGlitch?.(f > 0 ? Math.max(0, Math.min(1, (f - s.deathAt + 0.28) / 0.28)) * (dead ? 0 : 1) : 0);
      if (d.kind === 'systems' && d.setState) {
        const c = f > 0.6 ? 'HULL BREACH' : f > 0.08 ? 'MASTER CAUTION' : null;
        if (d.state?.caution !== c) d.setState({ caution: c });
      }
    }
  };
  const applyLamps = () => {
    const p = live.power, f = live.failure;
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      let k = 0;
      if (l.kind === 'caution') k = f > 0.04 ? (Math.sin(live.t * 12) > 0 ? 9 : 0.3) : 0;
      else if (l.kind.startsWith('status:')) { const id = l.kind.slice(7); k = (state[id]?.v > 0.9 ? 1 : 0) * smooth(0.05, 0.2, p) * 6; }
      else {
        const on = smooth(l.t0 * 0.9, l.t0 * 0.9 + 0.08, p);
        const alive = f > l.death ? 0 : 1;
        const flick = f > 0 ? (0.55 + 0.45 * Math.sin(live.t * (40 + i % 7 * 9) + i)) * (Math.sin(live.t * 3.1 + i * 1.7) > 1 - f * 1.6 ? 0.1 : 1) : 1;
        k = on * alive * flick * (l.kind === 'strip' ? 3.2 : 6) * l.base;
      }
      col.setRGB(l.color[0] * k, l.color[1] * k, l.color[2] * k);
      lampMesh.setColorAt(i, col);
    }
    lampMesh.instanceColor.needsUpdate = true;
    const flick = f > 0 ? 0.7 + 0.3 * Math.sin(live.t * 47) * Math.sin(live.t * 13.3) : 1;
    const dead = 1 - smooth(0.6, 1, f);
    lights.flood.intensity = LIGHT_MAX.flood * smooth(0.1, 0.5, p) * flick * dead;
    lights.panel.intensity = LIGHT_MAX.panel * smooth(0.3, 0.9, p) * flick * dead;
    lights.cabin.intensity = LIGHT_MAX.cabin * smooth(0.05, 0.35, p) * flick * (1 - smooth(0.3, 0.7, f));
    lights.caution.intensity = f > 0.04 ? LIGHT_MAX.caution * (Math.sin(live.t * 12) > 0 ? 1 : 0.1) : 0;
    M.labels.emissive.setScalar(0.3 * smooth(0.2, 0.6, p) * flick * dead);
  };
  const setPower = (p) => { live.power = Math.max(0, Math.min(1, p)); applyLamps(); applyDisplays(); };
  const setFailure = (f) => { live.failure = Math.max(0, Math.min(1, f)); applyLamps(); applyDisplays(); };
  const setBounce = (v) => { lights.bounce.intensity = Math.max(0, v) * 2.4; };
  const setStick = (x, y) => {
    live.stickX = Math.max(-1, Math.min(1, x)); live.stickY = Math.max(-1, Math.min(1, y));
    parts.stick.rotation.set(-live.stickY * 0.32, 0, -live.stickX * 0.32);
  };
  const setThrottle = (v) => setValue('throttle', v, true);
  setPower(0);

  const sparkM = new THREE.Matrix4(), sparkQ = new THREE.Quaternion(), sparkColor = new THREE.Color(1, 0.8, 0.5);
  let tris = 0, calls = 0;
  group.traverse(o => { if (o.isMesh) { tris += o.geometry.attributes.position.count / 3 * (o.isInstancedMesh ? o.count : 1); calls++; } });
  const helmetHome = { parent: group, pos: helmetGroup.position.clone(), quat: helmetGroup.quaternion.clone() };

  return {
    group, anchors, displaySlots, interactables, colliders, walkable, lights, seats,
    helmet: helmetGroup,
    takeHelmet() { helmetGroup.removeFromParent(); return helmetGroup; },
    restoreHelmet() { helmetHome.parent.add(helmetGroup); helmetGroup.position.copy(helmetHome.pos); helmetGroup.quaternion.copy(helmetHome.quat); return helmetGroup; },
    set: setValue, toggle: toggleValue, get: (id) => state[id]?.v ?? 0,
    setStick, setThrottle, setPower, setFailure, setBounce,
    get power() { return live.power; }, get failure() { return live.failure; },
    stats: () => ({ triangles: Math.round(tris), meshes: calls, lamps: lamps.length }),
    update(dt) {
      live.t += dt;
      for (const s of Object.values(state)) if (s.v !== s.target) { const d = s.target - s.v; s.v += Math.sign(d) * Math.min(Math.abs(d), dt * s.speed); s.apply(s.v); live.dirty = true; }
      if (live.failure > 0 || live.dirty) { applyLamps(); live.dirty = false; }
      if (live.failure > 0.15) {
        for (let i = 0; i < sparkPts.length; i++) {
          if (live.sparkT[i] <= 0 && Math.random() < dt * live.failure * 0.6) live.sparkT[i] = 0.05 + Math.random() * 0.07;
          const on = live.sparkT[i] > 0;
          live.sparkT[i] -= dt;
          sparkM.compose(sparkPts[i], sparkQ.random(), on ? V(1, 1, 1).multiplyScalar(0.6 + Math.random()) : V(0, 0, 0));
          sparks.setMatrixAt(i, sparkM);
          sparks.setColorAt(i, on ? col.copy(sparkColor).multiplyScalar(40) : col.setRGB(0, 0, 0));
        }
        sparks.instanceMatrix.needsUpdate = true; sparks.instanceColor.needsUpdate = true;
      }
    },
    dispose() { group.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); own.forEach(o => o.dispose?.()); },
  };
}
