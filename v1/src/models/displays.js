// Interstellar in-world phosphor displays: canvas-drawn CRT pages for every ship screen, HDR emissive glass, budgeted redraw manager.
import * as THREE from 'three';

const FONT = 'B612M';
const FONT_URLS = [['400', new URL('../../assets/fonts/B612Mono-Regular.ttf', import.meta.url)], ['700', new URL('../../assets/fonts/B612Mono-Bold.ttf', import.meta.url)]];
let fontOK = false;
let CW = 0.6;
let PUNCT = -0.005;
export const displaysReady = (async () => {
  try {
    const faces = await Promise.all(FONT_URLS.map(([w, u]) => new FontFace(FONT, `url(${u.href})`, { weight: w }).load()));
    faces.forEach(f => document.fonts.add(f));
    const c = document.createElement('canvas').getContext('2d');
    c.font = `700 100px ${FONT}`;
    CW = c.measureText('0000000000').width / 1000;
    const pm = c.measureText('.');
    if (pm.actualBoundingBoxRight != null && pm.width) PUNCT = 0.225 - ((pm.actualBoundingBoxRight - pm.actualBoundingBoxLeft) / 2) / pm.width;
  } catch (e) { console.warn('displays: font load failed', e); }
  fontOK = true;
})();

export const YEAR = 31557600;
export const MONTH = 2629800;
export const DAY = 86400;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const L = 300;
const FLOOR = 11.5;

const C = {
  bg: '#011416', hi: '#dafeff', fg: '#8ff0fa', mid: '#4cc0cd', sky: '#4db5c1', dim: '#1c5a63', fine: '#2b7f8a', faint: '#0d3036',
  ink: '#021012', amber: '#ffae38', amberDim: '#5a3a0c', red: '#ff3a22', redDim: '#4a0e06',
};
const INV = { [C.fg]: '#5cc2ce', [C.hi]: '#74d3dd', [C.amber]: '#b8761a', [C.red]: '#b82614', [C.dim]: '#1c5a63', [C.mid]: '#2f8792' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n, d) => String(Math.max(0, Math.floor(n))).padStart(d, '0');
const md = (n, b) => (b === Infinity ? n : ((n % b) + b) % b);
const sgn = (v, d = 1) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(d);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = t => t * t * (3 - 2 * t);
const isNarrow = ch => ch === '.' || ch === ',' || ch === ':';
const NARROW_RE = /[.,:]/;

function fmtRange(m) {
  const a = Math.abs(m);
  if (a < 1000) return `${a.toFixed(a < 100 ? 1 : 0)} M`;
  if (a < 1e5) return `${(a / 1000).toFixed(2)} KM`;
  if (a < 1e10) return `${Math.round(a / 1000)} KM`;
  return `${(a / 1000).toExponential(2).toUpperCase().replace('E+', 'E')} KM`;
}
function fmtRate(r) {
  if (r < 1000) return r.toFixed(r < 10 ? 2 : 0);
  return r.toExponential(2).toUpperCase().replace('E+', 'E');
}
function rateWords(r) {
  if (r < 1.5) return 'REAL TIME';
  const U = [['YEAR', YEAR], ['MONTH', MONTH], ['WEEK', 604800], ['DAY', DAY], ['HOUR', 3600], ['MIN', 60]];
  for (const [n, u] of U) {
    if (r >= u * 0.95) { const v = r / u; const vs = v < 9.95 ? String(Math.round(v * 10) / 10) : String(Math.round(v)); return `1 SEC = ${vs} ${n}${vs === '1' ? '' : 'S'}`; }
  }
  return `1 SEC = ${Math.round(r)} SEC`;
}
function fmtMS(sec) { const s = Math.max(0, sec); return `${pad(s / 60, 2)}:${pad(s % 60, 2)}`; }
function fmtYM(sec) { const t = Math.max(0, sec); return `${Math.floor(t / YEAR)}Y ${pad(md(t, YEAR) / MONTH, 2)}M`; }
function splitTime(s) {
  const t = Math.max(0, s);
  return { y: t / YEAR, mo: md(t, YEAR) / MONTH, d: md(t, MONTH) / DAY, h: md(t, DAY) / 3600, mi: md(t, 3600) / 60, s: md(t, 60) };
}
function wrap(text, cols) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      if (!w) continue;
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += ' ' + w;
      else { out.push(line); line = w; }
      while (line.length > cols) { out.push(line.slice(0, cols)); line = line.slice(cols); }
    }
    out.push(line);
  }
  return out;
}
function trunc(s, cols) {
  if (s.length <= cols) return s;
  const cut = s.slice(0, Math.max(1, cols - 2));
  const sp = cut.lastIndexOf(' ');
  return (sp > cols * 0.5 ? cut.slice(0, sp) : cut).trimEnd() + '..';
}
function sigOf(st) {
  return JSON.stringify(st, (k, v) => {
    if (k === 'source' || typeof v === 'function') return undefined;
    if (typeof v === 'number') return Math.abs(v) >= 1e6 ? Math.round(v / 1000) : Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 100) / 100;
    return v;
  });
}

class Pen {
  constructor(ctx) { this.c = ctx; this.f = ''; }
  font(size, bold) { const f = `${bold ? 700 : 400} ${size.toFixed(1)}px ${FONT}`; if (f !== this.f) { this.c.font = f; this.f = f; } }
  tw(s) { let n = 0; for (const ch of s) n += isNarrow(ch) ? 0.45 : 1; return n * CW; }
  text(s, x, y, size = 14, col = C.fg, align = 'left', bold = false) {
    const c = this.c; this.font(size, bold); c.fillStyle = col;
    if (!NARROW_RE.test(s)) { c.textAlign = align; c.fillText(s, x, y); return; }
    const cw = CW * size, w = this.tw(s) * size;
    let cx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    c.textAlign = 'left';
    let run = '';
    for (const ch of s) {
      if (isNarrow(ch)) {
        if (run) { c.fillText(run, cx, y); cx += run.length * cw; run = ''; }
        c.fillText(ch, cx + PUNCT * cw, y); cx += 0.45 * cw;
      } else run += ch;
    }
    if (run) c.fillText(run, cx, y);
  }
  fit(s, w, size) { return Math.min(size, w / Math.max(0.5, this.tw(s))); }
  box(x, y, w, h, col = C.fg, lw = 2.4) { const c = this.c; c.strokeStyle = col; c.lineWidth = lw; c.strokeRect(x, y, w, h); }
  fill(x, y, w, h, col) { this.c.fillStyle = col; this.c.fillRect(x, y, w, h); }
  line(x1, y1, x2, y2, col = C.fg, lw = 2.4) { const c = this.c; c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  poly(pts, col, fill = true, lw = 2.4) {
    const c = this.c; c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    if (fill) { c.fillStyle = col; c.fill(); } else { c.strokeStyle = col; c.lineWidth = lw; c.stroke(); }
  }
  circle(x, y, r, col, fill = false, lw = 2.4) { const c = this.c; c.beginPath(); c.arc(x, y, Math.max(0.5, r), 0, TAU); if (fill) { c.fillStyle = col; c.fill(); } else { c.strokeStyle = col; c.lineWidth = lw; c.stroke(); } }
  arc(x, y, r, a0, a1, col, lw = 2.4) { const c = this.c; c.beginPath(); c.arc(x, y, r, a0, a1); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); }
  inv(s, x, y, w, h, size = 13, col = C.fg, align = 'center') {
    this.fill(x, y, w, h, INV[col] || col);
    const tx = align === 'center' ? x + w / 2 : align === 'left' ? x + 6 : x + w - 6;
    this.text(s, tx, y + h / 2 + 0.5, this.fit(s, w - 8, Math.max(size * 1.08, Math.min(FLOOR, h * 0.8))), C.ink, align, true);
  }
  tag(s, x, y, w, h, size, col, on) {
    if (on) this.inv(s, x, y, w, h, size, col);
    else { this.box(x, y, w, h, col, 2); this.text(s, x + w / 2, y + h / 2 + 0.5, this.fit(s, w - 8, size), col, 'center', true); }
  }
  label(s, x, y, col = C.mid, size = FLOOR, align = 'left') { this.text(s, x, y, Math.max(size, FLOOR), col, align, true); }
  fine(s, x, y, align = 'left', col = C.fine, size = 8.5) { this.text(s, x, y, size, col, align, false); }
  hair(x1, y1, x2, y2, col = C.dim) { this.line(x1, y1, x2, y2, col, 1.2); }
  grid(x, y, w, h, nx, ny, col = C.faint) {
    for (let i = 1; i < nx; i++) this.line(x + w * i / nx, y + 2, x + w * i / nx, y + h - 2, col, 1.1);
    for (let j = 1; j < ny; j++) this.line(x + 2, y + h * j / ny, x + w - 2, y + h * j / ny, col, 1.1);
  }
  delta(x, y, s, col) { this.poly([x, y - s * 0.5, x + s * 0.55, y + s * 0.45, x - s * 0.55, y + s * 0.45], col, false, Math.max(2, s * 0.14)); }
  tri(x, y, s, dir, col) {
    const a = [[0, -1, -0.8, 0.6, 0.8, 0.6], [1, 0, -0.6, -0.8, -0.6, 0.8], [0, 1, -0.8, -0.6, 0.8, -0.6], [-1, 0, 0.6, -0.8, 0.6, 0.8]][dir];
    this.poly([x + a[0] * s, y + a[1] * s, x + a[2] * s, y + a[3] * s, x + a[4] * s, y + a[5] * s], col);
  }
  chevron(x, y, ang, s, col, lw = 3.4) {
    const c = this.c; c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(-s * 0.5, -s * 0.7); c.lineTo(s * 0.5, 0); c.lineTo(-s * 0.5, s * 0.7);
    c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = 'miter'; c.stroke(); c.restore();
  }
  dash(x1, y1, x2, y2, col, lw = 1.6, d = [5, 5]) { const c = this.c; c.setLineDash(d); this.line(x1, y1, x2, y2, col, lw); c.setLineDash([]); }
}

function header(p, W, title, right, rightCol = C.fg, rightInv = false) {
  const tw = Math.max(70, p.tw(title) * 13 + 16);
  p.inv(title, 8, 7, tw, 21, 13, C.fg);
  p.line(tw + 14, 17.5, W - 8, 17.5, C.dim, 1.2);
  if (right) {
    const rs = p.fit(right, W - tw - 40, 12.5);
    const rw = p.tw(right) * rs + 14;
    p.fill(W - 8 - rw - 6, 7, rw + 6, 21, C.bg);
    if (rightInv) p.inv(right, W - 8 - rw, 7, rw, 21, rs, rightCol);
    else { p.box(W - 8 - rw, 7, rw, 21, rightCol, 2); p.text(right, W - 8 - rw / 2, 18, rs, rightCol, 'center', true); }
  }
}

function softkeys(p, W, H, keys, active = -1) {
  const n = keys.length, g = 6, w = (W - 16 - g * (n - 1)) / n;
  keys.forEach((k, i) => p.tag(k, 8 + i * (w + g), H - 26, w, 19, 12, C.fg, i === active));
}

function roller(p, x, y, w, h, value, base, digits, speed, size, col = C.hi) {
  const c = p.c;
  const n = Math.floor(value), f = value - n;
  const cx = x + w / 2, cy = y + h / 2 + size * 0.04;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  if (speed > 6) {
    p.font(size, true); c.textAlign = 'center'; c.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const o = (((f * 3 + i / 5) % 1) * 2 - 1) * h * 0.8;
      c.globalAlpha = 0.22;
      c.fillText(pad(md(n + i * 7 + 3, base), digits), cx, cy + o);
    }
    c.globalAlpha = 0.55;
    c.fillText(pad(md(n, base), digits), cx, cy);
    c.globalAlpha = 0.35;
    c.fillRect(x + w * 0.12, y + 2, w * 0.76, 2); c.fillRect(x + w * 0.12, y + h - 4, w * 0.76, 2);
    c.globalAlpha = 1;
  } else {
    const k = Math.min(0.8, 0.16 + speed * 0.14);
    const t = smooth(clamp((f - (1 - k)) / k, 0, 1));
    p.text(pad(md(n, base), digits), cx, cy - t * h, size, col, 'center', true);
    if (t > 0) p.text(pad(md(n + 1, base), digits), cx, cy + (1 - t) * h, size, col, 'center', true);
  }
  c.restore();
}

function clockSource(s) {
  const src = s.source;
  const ship = src ? src.ship : s.ship;
  const end = src ? src.endurance : s.endurance;
  const rate = src ? src.rate : s.rate;
  return { ship: ship || 0, end: end || 0, rate: rate || 1 };
}

function cells(p, x0, y, W, h, fields, racing) {
  const gap = 5;
  const units = fields.reduce((a, f) => a + f.d + 0.9, 0);
  const per = (W - 8 - x0 - gap * (fields.length - 1)) / units;
  const size = Math.min(40, per / CW * 0.98, (h - 14) * 0.9);
  let x = x0;
  fields.forEach(f => {
    const w = (f.d + 0.9) * per;
    p.box(x, y, w, h, racing && f.sp > 0.05 ? C.hi : C.fg, 2.2);
    p.fine(f.k, x + 4, y + 8);
    roller(p, x + 1, y + 12, w - 2, h - 14, f.v, f.b, f.d, f.sp, size, f.col || C.hi);
    x += w + gap;
  });
}

function rowLabel(p, x, y, w, h, a, b) {
  p.box(x, y, w, h, C.fg, 2.2);
  p.text(a, x + w / 2, y + h * 0.42, p.fit(a, w - 8, 15), C.hi, 'center', true);
  p.fine(b, x + w / 2, y + h * 0.76, 'center', C.mid, 9);
}

function drawClock(p, W, H, s, t) {
  const { ship, end, rate } = clockSource(s);
  const racing = rate > 50;
  header(p, W, s.title || 'MISSION CLOCK', racing ? rateWords(rate) : 'SYNC 1 : 1', racing ? C.amber : C.dim, racing);
  if (racing && (t * 2) % 1 < 0.6) p.fill(W - 8 - (p.tw(rateWords(rate)) * 12.5 + 14) - 18, 11, 10, 13, C.amber);
  const LW = 66, x0 = 8 + LW + 6;
  const sh = splitTime(ship);
  rowLabel(p, 8, 36, LW, 44, 'SHIP', 'LOCAL');
  cells(p, x0, 36, W, 44, [
    { k: 'HR', v: Math.max(0, ship) / 3600, b: 100, d: 2, sp: 1 / 3600 },
    { k: 'MIN', v: sh.mi, b: 60, d: 2, sp: 1 / 60 },
    { k: 'SEC', v: sh.s, b: 60, d: 2, sp: 1 },
  ], false);
  const en = splitTime(end);
  rowLabel(p, 8, 86, LW, 50, 'ENDUR', 'ELAPSED');
  cells(p, x0, 86, W, 50, [
    { k: 'YR', v: en.y, b: Infinity, d: 3, sp: rate / YEAR },
    { k: 'MO', v: en.mo, b: 12, d: 2, sp: rate / MONTH },
    { k: 'DY', v: en.d, b: 31, d: 2, sp: rate / DAY },
    { k: 'HR', v: en.h, b: 24, d: 2, sp: rate / 3600 },
    { k: 'MIN', v: en.mi, b: 60, d: 2, sp: rate / 60 },
  ], racing);
  const by = 144, bh = 104;
  const dialR = Math.min(46, bh / 2 - 4), dcx = W - 8 - dialR - 4, dcy = by + bh / 2;
  const dw = dcx - dialR - 12 - 8;
  const hc = racing ? C.amber : C.hi;
  p.box(8, by, dw, bh, racing ? C.amber : C.fg, racing ? 3 : 2.4);
  p.delta(20, by + 13, 12, racing ? C.amber : C.mid);
  p.label('ENDURANCE AHEAD BY', 32, by + 13, racing ? C.amber : C.mid);
  const dlt = Math.max(0, end - ship), ds = splitTime(dlt);
  const dsize = Math.min(58, (dw - 24) / (8.4 * CW), bh * 0.56);
  const ry = by + 26, rhh = dsize * 1.12;
  for (let i = 1; i < 4; i++) p.hair(14, by + bh * i / 4, dw + 2, by + bh * i / 4, C.faint);
  let x = 16;
  [[ds.y, Infinity, 2, rate / YEAR, 'Y'], [ds.mo, 12, 2, rate / MONTH, 'M'], [ds.d, 31, 2, rate / DAY, 'D']].forEach(([v, b, d, sp, u]) => {
    const w = d * CW * dsize + 4;
    roller(p, x, ry, w, rhh, v, b, d, sp, dsize, hc);
    x += w + 1;
    p.text(u, x, ry + rhh / 2 + 3, dsize * 0.5, hc, 'left', true);
    x += dsize * 0.5 * CW + dsize * 0.2;
  });
  p.fine(`DIFF ${(dlt / YEAR).toFixed(4)} YR`, dw + 2, by + bh - 9, 'right');
  const ey = en.mo, mi = Math.floor(ey);
  for (let i = 0; i < 12; i++) {
    const a0 = -Math.PI / 2 + i * TAU / 12 + 0.05, a1 = a0 + TAU / 12 - 0.1;
    p.arc(dcx, dcy, dialR - 7, a0, a1, i < mi ? C.hi : C.faint, 11);
    if (i === mi) p.arc(dcx, dcy, dialR - 7, a0, a0 + (a1 - a0) * (ey - mi), C.hi, 11);
  }
  p.circle(dcx, dcy, dialR, C.fg, false, 2);
  p.circle(dcx, dcy, dialR - 15, C.dim, false, 1.2);
  for (let i = 0; i < 60; i++) { const a = i * TAU / 60; p.hair(dcx + Math.cos(a) * (dialR + 2), dcy + Math.sin(a) * (dialR + 2), dcx + Math.cos(a) * (dialR + (i % 5 ? 4 : 7)), dcy + Math.sin(a) * (dialR + (i % 5 ? 4 : 7)), C.fine); }
  const yrs = Math.floor(en.y);
  p.text(pad(yrs, 2), dcx, dcy - 3, p.fit(pad(yrs, 2), dialR * 1.1, 26), C.hi, 'center', true);
  p.fine('END YR', dcx, dcy + 15, 'center', C.mid, 9);
  const sy = H - 44, bx = 52, barw = W - 8 - bx - 80;
  p.label('RATE', 12, sy + 9, C.mid);
  p.box(bx, sy + 2, barw, 13, C.fg, 2);
  const lr = v => clamp(Math.log10(Math.max(1, v)) / 8, 0, 1);
  p.fill(bx + 3, sy + 5, (barw - 6) * lr(rate), 7, racing ? C.amber : C.fg);
  [['SEC', 1], ['MIN', 60], ['HR', 3600], ['DAY', DAY], ['MO', MONTH], ['YR', YEAR]].forEach(([n, v]) => {
    const xx = bx + barw * lr(v);
    p.hair(xx, sy + 15, xx, sy + 21, C.fine);
    p.fine(n, xx, sy + 27, 'center');
  });
  p.text(fmtRate(rate), W - 10, sy + 9, 13, racing ? C.amber : C.hi, 'right', true);
  p.fine('SEC / SEC', W - 10, sy + 25, 'right');
}

function drawWrist(p, W, H, s, t) {
  const { ship, end, rate } = clockSource(s);
  const racing = rate > 50;
  const sh = splitTime(ship), en = splitTime(end), dl = splitTime(Math.max(0, end - ship));
  const rowH = (H - 24) / 3;
  const lw = 58, x0 = 8 + lw;
  const avail = W - x0 - 10;
  const rowDraw = (y, lab, segs, col = C.hi, frame = C.fg) => {
    p.box(6, y, W - 12, rowH, frame, 3);
    p.text(lab, 8 + lw / 2, y + rowH / 2, 19, frame === C.fg ? C.mid : frame, 'center', true);
    const chars = segs.reduce((a, g) => a + (g.u ? p.tw(g.u) / CW * 0.55 : g.d), 0) + segs.length * 0.15;
    const size = Math.min(rowH * 0.82, avail / (chars * CW));
    let x = x0 + (avail - chars * CW * size) / 2;
    segs.forEach(g => {
      if (g.u) { p.text(g.u, x, y + rowH / 2 + 2, size * 0.55, col, 'left', true); x += p.tw(g.u) * size * 0.55 + size * CW * 0.15; return; }
      const w = g.d * CW * size;
      roller(p, x, y + 4, w, rowH - 8, g.v, g.b, g.d, g.sp, size, col);
      x += w + size * CW * 0.15;
    });
  };
  rowDraw(6, 'SHP', [{ v: Math.max(0, ship) / 3600, b: 100, d: 2, sp: 1 / 3600 }, { u: ':' }, { v: sh.mi, b: 60, d: 2, sp: 1 / 60 }, { u: ':' }, { v: sh.s, b: 60, d: 2, sp: 1 }]);
  rowDraw(12 + rowH, 'END', [{ v: en.y, b: 100, d: 2, sp: rate / YEAR }, { u: 'Y' }, { v: en.mo, b: 12, d: 2, sp: rate / MONTH }, { u: 'M' }]);
  const y3 = 18 + rowH * 2;
  rowDraw(y3, 'DIF', [{ v: dl.y, b: 100, d: 2, sp: rate / YEAR }, { u: 'Y' }, { v: dl.mo, b: 12, d: 2, sp: rate / MONTH }, { u: 'M' }, { v: dl.d, b: 31, d: 2, sp: rate / DAY }, { u: 'D' }], racing ? C.amber : C.hi, racing ? C.amber : C.fg);
  if (racing && (t * 2) % 1 < 0.6) p.fill(W - 22, y3 + 6, 12, 12, C.amber);
}

const BOOT_LINES = ['ROM CHECKSUM', 'CPU A / CPU B', 'MEMORY 512K', 'DATA BUS 1553', 'IMU ALIGN', 'STAR TRACKER', 'RCS DRIVERS', 'DISPLAY UNIT'];

function drawBoot(p, W, H, s, t, d) {
  const bt = d._bootT;
  const dur = s.duration || 4.5;
  const lines = s.lines || BOOT_LINES;
  const k = bt / dur;
  if (bt < 0.35) { if ((bt * 6) % 1 < 0.5) p.fill(12, 12, 10, 16, C.hi); return; }
  header(p, W, s.title || 'RANGER AVIONICS', s.unit || 'DU 2', C.fg);
  p.label('BOOT SEQUENCE  REV 4.12', 10, 42, C.mid);
  const per = (dur * 0.62) / lines.length;
  const lh = Math.min(22, (H - 150) / lines.length);
  lines.forEach((ln, i) => {
    const lt = bt - 0.45 - i * per;
    if (lt < 0) return;
    const y = 60 + i * lh;
    const typed = ln.slice(0, Math.floor(lt * 40));
    p.text(typed, 12, y, 13, C.fg, 'left', true);
    if (lt > per * 0.7) {
      const fail = s.fail === i;
      const dots = '.'.repeat(Math.max(0, Math.floor((W - 110 - p.tw(ln) * 13) / (13 * CW * 0.45))));
      p.text(dots, 12 + p.tw(ln) * 13, y, 13, C.dim, 'left', false);
      if (fail) p.inv('FAIL', W - 70, y - 9, 58, 18, 12, C.amber);
      else p.text('OK', W - 41, y, 14, C.hi, 'center', true);
    } else if ((t * 4) % 1 < 0.5) p.fill(12 + p.tw(typed) * 13 + 2, y - 7, 8, 14, C.hi);
  });
  const by = H - 82;
  ['MEM', 'BUS', 'I/O'].forEach((b, i) => {
    const f = clamp((k - 0.35 - i * 0.12) / 0.4, 0, 1);
    const y = by + i * 20;
    p.label(b, 12, y + 7, C.mid);
    p.box(52, y, W - 124, 14, C.fg, 2);
    const segs = 24, sw = (W - 130) / segs;
    for (let j = 0; j < Math.floor(f * segs); j++) p.fill(55 + j * sw, y + 3, sw - 2, 8, C.fg);
    p.text(`${pad(f * 100, 3)}%`, W - 40, y + 7, 12, C.hi, 'center', true);
  });
  if (k > 0.92) p.inv(s.done || 'ONLINE', W / 2 - 70, H / 2 - 18, 140, 36, 22, C.hi);
}

function drawAttitude(p, W, H, s) {
  const pitch = s.pitch || 0, roll = s.roll || 0, yaw = s.yaw || 0;
  const rates = s.rates || {};
  header(p, W, 'ATTITUDE', s.mode || 'RCS DIRECT');
  const rightW = Math.max(112, W * 0.29);
  const r = Math.min((H - 64) / 2, (W - rightW - 70) / 2);
  const cx = 28 + r, cy = 38 + (H - 38) / 2 + 4;
  const c = p.c;
  c.save();
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
  c.translate(cx, cy); c.rotate(-roll * DEG);
  const ppd = r / 45, hy = pitch * ppd;
  p.fill(-r * 2, hy - r * 4, r * 4, r * 4, C.sky);
  const yw = ((yaw % 30) + 30) % 30;
  for (let k = -3; k <= 3; k++) {
    const lon = (k * 30 - yw) * DEG;
    if (Math.cos(lon) <= 0.05) continue;
    const x = r * Math.sin(lon);
    p.line(x, hy, x, hy + r * 3, C.faint, 1.4);
    p.line(x, hy - r * 3, x, hy, '#3ea3ae', 1.4);
  }
  for (let deg = -90; deg <= 90; deg += 5) {
    if (!deg) continue;
    const y = hy - deg * ppd;
    if (Math.abs(y) > r + 10) continue;
    const col = deg > 0 ? C.ink : C.fg;
    if (deg % 10) { p.line(-r * 0.1, y, r * 0.1, y, col, 1.2); continue; }
    const big = deg % 30 === 0;
    const len = big ? r * 0.5 : r * 0.26;
    p.line(-len, y, len, y, col, big ? 3 : 2);
    if (big) {
      p.text(String(Math.abs(deg)), -len - 6, y + 1, 12, col, 'right', true);
      p.text(String(Math.abs(deg)), len + 6, y + 1, 12, col, 'left', true);
    }
  }
  p.line(-r * 2, hy, r * 2, hy, C.hi, 3.2);
  c.restore();
  p.circle(cx, cy, r, C.fg, false, 3);
  for (let a = -60; a <= 60; a += 5) {
    const an = (a - 90) * DEG, major = [0, 10, 20, 30, 45, 60].includes(Math.abs(a));
    if (!major) { p.hair(cx + Math.cos(an) * (r + 3), cy + Math.sin(an) * (r + 3), cx + Math.cos(an) * (r + 7), cy + Math.sin(an) * (r + 7), C.fine); continue; }
    const l = a % 30 === 0 ? 14 : 8;
    p.line(cx + Math.cos(an) * (r + 3), cy + Math.sin(an) * (r + 3), cx + Math.cos(an) * (r + 3 + l), cy + Math.sin(an) * (r + 3 + l), C.fg, a === 0 ? 3.4 : 2.2);
  }
  const ra = (-roll - 90) * DEG;
  const tx = cx + Math.cos(ra) * (r - 2), ty = cy + Math.sin(ra) * (r - 2);
  const nx = Math.cos(ra), ny = Math.sin(ra);
  p.poly([tx, ty, tx - nx * 15 - ny * 9, ty - ny * 15 + nx * 9, tx - nx * 15 + ny * 9, ty - ny * 15 - nx * 9], C.hi);
  const ws = r * 0.5;
  p.line(cx - ws, cy, cx - ws * 0.35, cy, C.ink, 9); p.line(cx + ws * 0.35, cy, cx + ws, cy, C.ink, 9);
  p.line(cx - ws, cy, cx - ws * 0.35, cy, C.amber, 5); p.line(cx + ws * 0.35, cy, cx + ws, cy, C.amber, 5);
  p.fill(cx - 5, cy - 5, 10, 10, C.ink); p.fill(cx - 3, cy - 3, 6, 6, C.amber);
  p.fine(`HDG ${pad(((yaw % 360) + 360) % 360, 3)}`, cx - r, cy + r + 2, 'left');
  const x0 = W - 8 - rightW, rowH = (H - 46) / 3;
  const max = s.maxRate || 10;
  [['ROLL', roll, rates.roll], ['PITCH', pitch, rates.pitch], ['YAW', yaw, rates.yaw]].forEach(([lab, ang, rt], i) => {
    const y = 38 + i * (rowH + 4);
    p.box(x0, y, rightW, rowH, C.fg, 2.4);
    p.label(lab, x0 + 6, y + 11, C.mid);
    p.fine(`${sgn(rt || 0, 1)}°/S`, x0 + rightW - 6, y + 11, 'right', C.mid, 10);
    const as = `${sgn(ang, 1)}°`;
    p.text(as, x0 + rightW - 8, y + rowH * 0.52, p.fit(as, rightW - 16, 25), C.hi, 'right', true);
    const bx = x0 + 8, bw = rightW - 16, byy = y + rowH - 15;
    p.box(bx, byy, bw, 9, C.dim, 1.2);
    for (let k = 1; k < 8; k++) p.hair(bx + bw * k / 8, byy - 2, bx + bw * k / 8, byy, C.fine);
    const f = clamp((rt || 0) / max, -1, 1);
    const mid = bx + bw / 2;
    p.fill(Math.min(mid, mid + f * bw / 2), byy + 2, Math.abs(f * bw / 2), 5, Math.abs(rt || 0) > max * 0.8 ? C.amber : C.fg);
    p.line(mid, byy - 3, mid, byy + 12, C.fg, 2);
  });
}

const NAV_TARGETS = ['ENDURANCE', 'MILLER', 'GARGANTUA'];

function approach(cl) { return cl >= 0 ? ['APPROACH', `${Math.abs(cl).toFixed(Math.abs(cl) < 100 ? 1 : 0)} M/S`, C.hi] : ['RECEDING', `${Math.abs(cl).toFixed(Math.abs(cl) < 100 ? 1 : 0)} M/S`, C.amber]; }

function drawNav(p, W, H, s, t) {
  const targets = s.targets || NAV_TARGETS;
  const tgt = s.target || targets[1];
  header(p, W, 'NAVIGATION', `TGT ${tgt}`);
  const lw = Math.max(104, W * 0.27);
  targets.forEach((n, i) => {
    const y = 38 + i * 32;
    if (n === tgt) { p.inv(n, 8, y, lw, 26, 13, C.fg); p.box(6, y - 2, lw + 4, 30, C.hi, 1.4); }
    else p.tag(n, 8, y, lw, 26, 13, C.fg, false);
  });
  const az = s.bearing || 0, el = s.elevation || 0;
  const err = s.alignError ?? Math.hypot(az, el);
  const tol = s.tolerance ?? 2;
  const aligned = err <= tol;
  const sy = 38 + targets.length * 32 + 4;
  [['BRG', `${sgn(az, 1)}°`], ['ELV', `${sgn(el, 1)}°`], ['ERR', `${err.toFixed(1)}°`]].forEach(([k, v], i) => {
    const y = sy + i * 22;
    if (y + 20 > H - 46) return;
    p.label(k, 12, y + 9, C.mid);
    p.text(v, 8 + lw - 4, y + 9, 13, k === 'ERR' ? (aligned ? C.hi : C.amber) : C.hi, 'right', true);
    p.hair(8, y + 19, 8 + lw, y + 19, C.faint);
  });
  const fx = lw + 18, fy = 38, fw = W - 8 - fx, fh = H - 46 - 50 - fy;
  p.box(fx, fy, fw, fh, C.fg, 2.4);
  const fcx = fx + fw / 2, fcy = fy + fh / 2, fov = s.fov || 30;
  const sx = (fw / 2 - 6) / fov, sy2 = (fh / 2 - 6) / fov;
  for (let a = -fov + 5; a < fov; a += 5) {
    if (!a) continue;
    p.hair(fcx + a * sx, fy + 2, fcx + a * sx, fy + fh - 2, C.faint);
    p.hair(fx + 2, fcy - a * sy2, fx + fw - 2, fcy - a * sy2, C.faint);
  }
  p.dash(fx, fcy, fx + fw, fcy, C.dim, 1.4, [3, 5]);
  p.dash(fcx, fy, fcx, fy + fh, C.dim, 1.4, [3, 5]);
  for (let a = -fov; a <= fov; a += 10) {
    const x = fcx + a * sx, y = fcy - a * sy2;
    p.line(x, fy, x, fy + (a % 30 ? 5 : 9), C.fg, 2); p.line(x, fy + fh, x, fy + fh - (a % 30 ? 5 : 9), C.fg, 2);
    p.line(fx, y, fx + (a % 30 ? 5 : 9), y, C.fg, 2); p.line(fx + fw, y, fx + fw - (a % 30 ? 5 : 9), y, C.fg, 2);
  }
  p.fine(`FOV ±${fov}°`, fx + 6, fy + fh - 7);
  const tr = Math.max(9, tol * Math.min(sx, sy2));
  if (aligned) p.circle(fcx, fcy, tr, INV[C.fg], true);
  p.circle(fcx, fcy, tr, aligned ? C.hi : C.fg, false, 2.4);
  p.line(fcx - tr - 14, fcy, fcx - tr - 3, fcy, C.fg, 2.4); p.line(fcx + tr + 3, fcy, fcx + tr + 14, fcy, C.fg, 2.4);
  const mx = fcx + az * sx, my = fcy - el * sy2;
  const inside = Math.abs(az) <= fov && Math.abs(el) <= fov;
  if (inside) {
    if (!aligned) p.dash(fcx, fcy, mx, my, C.mid, 1.6, [4, 4]);
    const q = 12;
    p.poly([mx, my - q, mx + q, my, mx, my + q, mx - q, my], C.hi, false, 3.2);
    p.fill(mx - 3, my - 3, 6, 6, C.hi);
    const right = mx > fcx + fw * 0.2;
    p.text(tgt, mx + (right ? -18 : 18), my - 18, 11.5, C.hi, right ? 'right' : 'left', true);
  } else {
    const ang = Math.atan2(-el, az);
    const ex = fcx + clamp(Math.cos(ang) * fw, -fw / 2 + 18, fw / 2 - 18), ey = fcy + clamp(Math.sin(ang) * fh, -fh / 2 + 18, fh / 2 - 18);
    p.chevron(ex, ey, ang, 16, C.amber, 4);
    p.chevron(ex - Math.cos(ang) * 9, ey - Math.sin(ang) * 9, ang, 16, C.amber, 4);
    p.text(`${sgn(az, 0)}°`, ex - Math.cos(ang) * 34, ey - Math.sin(ang) * 24, 12, C.amber, 'center', true);
  }
  const burn = s.burn || {};
  const cue = burn.cue || null;
  const blink = (t * 2.5) % 1 < 0.6;
  if (cue === 'BURN') {
    const bh2 = 24, byy = fy + fh - bh2 - 6;
    if (aligned) {
      const dvr = burn.dvRemaining ?? burn.dv;
      const msg = `BURN${dvr != null ? `   DV ${Math.round(dvr)} M/S` : ''}`;
      if (blink) p.inv(msg, fx + 6, byy, fw - 12, bh2, 15, C.hi);
      else { p.fill(fx + 6, byy, fw - 12, bh2, C.bg); p.box(fx + 6, byy, fw - 12, bh2, C.hi, 2.4); p.text(msg, fcx, byy + bh2 / 2 + 1, p.fit(msg, fw - 24, 15), C.hi, 'center', true); }
    } else {
      p.fill(fx + 6, byy, fw - 12, bh2, C.bg);
      p.box(fx + 6, byy, fw - 12, bh2, C.amber, 2.4);
      p.text('ALIGN TO BURN', fcx, byy + bh2 / 2 + 1, p.fit('ALIGN TO BURN', fw - 24, 15), C.amber, 'center', true);
    }
  }
  const ry = fy + fh + 6, rw = (fw - 6) / 2;
  p.box(fx, ry, rw, 44, C.fg, 2.4);
  p.label('RANGE', fx + 6, ry + 11, C.mid);
  const rs = fmtRange(s.range ?? 0);
  p.text(rs, fx + rw - 6, ry + 30, p.fit(rs, rw - 12, 20), C.hi, 'right', true);
  const [ak, av, acol] = approach(s.closing ?? 0);
  p.box(fx + rw + 6, ry, rw, 44, C.fg, 2.4);
  p.label(ak, fx + rw + 12, ry + 11, acol === C.amber ? C.amber : C.mid);
  p.text(av, fx + 2 * rw, ry + 30, p.fit(av, rw - 12, 20), acol, 'right', true);
  const by = H - 34;
  if (!cue) p.tag('NO BURN', 8, by, lw, 26, 13, C.dim, false);
  else if (cue === 'BURN') p.tag(aligned ? 'BURN' : 'ALIGN', 8, by, lw, 26, 15, aligned ? C.hi : C.amber, aligned && blink);
  else if (cue === 'CUTOFF') p.inv('CUTOFF', 8, by, lw, 26, 14, C.amber);
  else p.tag(cue, 8, by, lw, 26, 14, C.fg, cue === 'HOLD');
  const bx = lw + 18, bw = W - 8 - bx;
  p.box(bx, by, bw, 26, C.fg, 2.4);
  p.label('TGO', bx + 6, by + 13, C.mid);
  p.text(burn.tgo != null ? fmtMS(burn.tgo) : '--:--', bx + 40, by + 13.5, 14, C.hi, 'left', true);
  const dvx = bx + 40 + 4 * 14 * CW + 20, dvw = bx + bw - 8 - dvx;
  if (dvw > 40) {
    p.label('DV', dvx, by + 13, C.mid);
    p.box(dvx + 24, by + 8, dvw - 24, 10, C.dim, 1.2);
    const f = burn.dv ? clamp(1 - (burn.dvRemaining ?? burn.dv) / burn.dv, 0, 1) : 0;
    p.fill(dvx + 26, by + 10, (dvw - 28) * f, 6, C.fg);
  }
}

function drawDock(p, W, H, s, t) {
  const off = s.offset || { x: 0, y: 0 };
  const range = s.range ?? 40, own = s.rollRate ?? 0, st = s.stationRate ?? 5.3;
  const diff = own - st;
  const matched = s.matched ?? Math.abs(diff) < 0.1;
  const lat = Math.hypot(off.x, off.y);
  const alignTol = s.alignTolerance ?? 0.15;
  const aligned = lat <= alignTol;
  const state = s.state || (!aligned ? 'ALIGN AXIS' : !matched ? 'MATCH ROLL' : 'AUTO CLOSE');
  const good = state === 'AUTO CLOSE' || state === 'LATCHED' || state === 'CAPTURE' || state === 'IN WINDOW';
  header(p, W, 'DOCKING', state, good ? C.hi : C.fg, good);
  const fs = Math.min(H - 46, W * 0.62), fx = 8, fy = 38;
  const fcx = fx + fs / 2, fcy = fy + fs / 2;
  p.box(fx, fy, fs, fs, C.fg, 2.4);
  p.grid(fx, fy, fs, fs, 10, 10);
  p.dash(fx, fcy, fx + fs, fcy, C.dim, 1.4, [3, 5]); p.dash(fcx, fy, fcx, fy + fs, C.dim, 1.4, [3, 5]);
  const full = s.scale || (lat > 100 ? 300 : lat > 30 ? 100 : lat > 10 ? 30 : lat > 3 ? 10 : lat > 1 ? 3 : 1);
  const R = fs * 0.44;
  p.circle(fcx, fcy, R, C.fg, false, 2.4);
  p.c.setLineDash([6, 6]); p.circle(fcx, fcy, R * 0.62, C.dim, false, 1.6); p.c.setLineDash([]);
  p.circle(fcx, fcy, R * 0.2, aligned ? C.hi : C.fg, false, 2.4);
  for (let i = 0; i < 36; i++) { const a = i * TAU / 36; p.hair(fcx + Math.cos(a) * (R + 2), fcy + Math.sin(a) * (R + 2), fcx + Math.cos(a) * (R + (i % 9 ? 5 : 10)), fcy + Math.sin(a) * (R + (i % 9 ? 5 : 10)), i % 9 ? C.fine : C.fg); }
  const rr = Math.max(R * 0.2, R * 0.62 * clamp(2.5 / Math.max(range, 0.1), 0, 1));
  const lim = fs / 2 - rr - 14;
  const ox = fcx + clamp(off.x / full * R, -lim, lim), oy = fcy - clamp(off.y / full * R, -lim, lim);
  p.circle(ox, oy, rr, C.hi, false, 3.4);
  const roll = (s.rollPhase || 0) * DEG;
  for (let i = 0; i < 4; i++) { const a = roll + i * Math.PI / 2; p.line(ox + Math.cos(a) * (rr + 2), oy + Math.sin(a) * (rr + 2), ox + Math.cos(a) * (rr + 12), oy + Math.sin(a) * (rr + 12), C.hi, 3.4); }
  p.line(ox - 7, oy, ox + 7, oy, C.hi, 2.4); p.line(ox, oy - 7, ox, oy + 7, C.hi, 2.4);
  if (!aligned) {
    const dx = fcx - ox, dy = fcy - oy, dl = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const n = lat > full * 0.5 ? 3 : lat > full * 0.15 ? 2 : 1;
    const ex = fcx + dx / dl * (fs / 2 - 16), ey = fcy + dy / dl * (fs / 2 - 16);
    for (let i = 0; i < n; i++) p.chevron(ex - Math.cos(ang) * i * 9, ey - Math.sin(ang) * i * 9, ang, 14, C.amber, 3.6);
    p.fine('TRANSLATE', fcx, fy + (dy < 0 ? fs - 22 : 22), 'center', C.amber, 10);
  }
  p.label(`±${full} M`, fx + 6, fy + fs - 10, C.mid);
  p.fine(`X ${sgn(off.x, 2)}  Y ${sgn(off.y, 2)}`, fx + fs - 6, fy + 9, 'right', C.fg, 10);
  const x0 = fx + fs + 10, cw = W - 8 - x0;
  const bh = 40;
  const [ak, av, acol] = approach(s.closing ?? 0);
  [['RANGE', fmtRange(range), C.hi, C.mid], [ak, av, acol, acol === C.amber ? C.amber : C.mid]].forEach(([k, v, col, kc], i) => {
    const y = fy + i * (bh + 5);
    p.box(x0, y, cw, bh, C.fg, 2.4);
    p.label(k, x0 + 6, y + 11, kc);
    p.text(v, x0 + cw - 6, y + 28, p.fit(v, cw - 12, 18), col, 'right', true);
  });
  const dy0 = fy + 2 * (bh + 5), dh = H - 8 - 30 - dy0;
  p.box(x0, dy0, cw, dh, C.fg, 2.4);
  p.label('ROLL RPM', x0 + 6, dy0 + 11, C.mid);
  const dr = Math.min(cw / 2 - 12, dh / 2 - 14), dcx = x0 + cw / 2, dcy = dy0 + 16 + dh / 2;
  const a0 = 135 * DEG, sweep = 270 * DEG, vmax = 10;
  const va = v => a0 + clamp(v / vmax, 0, 1) * sweep;
  p.arc(dcx, dcy, dr, a0, a0 + sweep, C.fg, 2.4);
  for (let v = 0; v <= vmax * 2; v++) {
    const a = va(v / 2), l = v % 10 ? (v % 2 ? 3 : 5) : 9;
    if (v % 2) p.hair(dcx + Math.cos(a) * dr, dcy + Math.sin(a) * dr, dcx + Math.cos(a) * (dr - l), dcy + Math.sin(a) * (dr - l), C.fine);
    else p.line(dcx + Math.cos(a) * dr, dcy + Math.sin(a) * dr, dcx + Math.cos(a) * (dr - l), dcy + Math.sin(a) * (dr - l), C.fg, 2);
  }
  p.arc(dcx, dcy, dr + 5, va(st - 0.1), va(st + 0.1), matched ? C.hi : C.mid, 6);
  const sa = va(st);
  const sx = dcx + Math.cos(sa) * (dr + 7), syy = dcy + Math.sin(sa) * (dr + 7);
  p.poly([sx, syy, sx + Math.cos(sa) * 10 - Math.sin(sa) * 6, syy + Math.sin(sa) * 10 + Math.cos(sa) * 6, sx + Math.cos(sa) * 10 + Math.sin(sa) * 6, syy + Math.sin(sa) * 10 - Math.cos(sa) * 6], C.hi);
  const oa = va(own);
  p.line(dcx, dcy, dcx + Math.cos(oa) * (dr - 4), dcy + Math.sin(oa) * (dr - 4), C.hi, 3.4);
  p.circle(dcx, dcy, 4, C.hi, true);
  p.text(own.toFixed(2), dcx, dcy + dr * 0.55, 12, C.hi, 'center', true);
  p.fine(`STN ${st.toFixed(2)}`, dcx, dcy + dr * 0.55 + 13, 'center');
  const by = H - 34;
  if (matched) p.inv('ROLL MATCHED', x0, by, cw, 26, 13, C.hi);
  else if (s.autoRoll) p.tag('ROLL AUTO', x0, by, cw, 26, 13, C.fg, false);
  else {
    const col = Math.abs(diff) > 2 ? C.amber : C.hi;
    p.box(x0, by, cw, 26, col, 2.4);
    const n = Math.abs(diff) > 1 ? 3 : Math.abs(diff) > 0.3 ? 2 : 1;
    const dir = diff < 0 ? 0 : Math.PI;
    for (let i = 0; i < n; i++) p.chevron(x0 + 14 + i * 9, by + 13, dir, 12, col, 3);
    const txt = `${sgn(-diff, 2)}`;
    p.text(txt, x0 + cw - 8, by + 13.5, p.fit(txt, cw - 50, 15), col, 'right', true);
  }
}

const LV = { OFF: 0, false: 0, undefined: 0, null: 0, STBY: 1, SAFE: 1, OK: 1, NOMINAL: 1, ON: 1, true: 1, RUN: 1, LOCKED: 1, SEALED: 1, CLOSED: 1, RELEASED: 1, ARMED: 1, READY: 1, START: 2, BOOT: 2, MOVING: 2, CYCLING: 2, OPEN: 2, LOW: 2, DRAIN: 2, DEGRADED: 2, 'NO BUS': 2, 'REQ FC': 2, FLOODED: 3, FAIL: 3, FAULT: 3 };
const lvCol = l => [C.dim, C.fg, C.amber, C.red][l];
const lvOf = v => LV[String(v)] ?? 1;
const stStr = v => (v === true ? 'ON' : v === false || v == null ? 'OFF' : String(v));

function icon(p, kind, x, y, sz, col, on) {
  const h = sz / 2, lw = 2.4;
  switch (kind) {
    case 'batt': p.box(x - h, y - h * 0.6, sz, h * 1.2, col, lw); p.fill(x - h * 0.55, y - h * 0.95, h * 0.35, h * 0.35, col); p.fill(x + h * 0.2, y - h * 0.95, h * 0.35, h * 0.35, col); if (on) p.fill(x - h + 4, y - h * 0.6 + 4, sz - 8, h * 1.2 - 8, col); break;
    case 'bus': p.line(x - h, y, x + h, y, col, 4); for (const k of [-0.6, 0, 0.6]) p.fill(x + k * h - 3, y - 7, 6, 14, col); break;
    case 'fc': p.box(x - h, y - h * 0.75, sz, h * 1.5, col, lw); for (const k of [-0.45, 0, 0.45]) p.line(x + k * h, y - h * 0.5, x + k * h, y + h * 0.5, col, on ? 3.4 : 1.6); break;
    case 'chip': p.box(x - h * 0.6, y - h * 0.6, h * 1.2, h * 1.2, col, lw); for (const k of [-0.3, 0.3]) { p.line(x - h, y + k * h, x - h * 0.6, y + k * h, col, 2); p.line(x + h * 0.6, y + k * h, x + h, y + k * h, col, 2); p.line(x + k * h, y - h, x + k * h, y - h * 0.6, col, 2); p.line(x + k * h, y + h * 0.6, x + k * h, y + h, col, 2); } if (on) p.fill(x - h * 0.3, y - h * 0.3, h * 0.6, h * 0.6, col); break;
    case 'rcs': p.box(x - h * 0.4, y - h * 0.4, h * 0.8, h * 0.8, col, lw); for (let d = 0; d < 4; d++) { const dx = [0, 1, 0, -1][d], dy = [-1, 0, 1, 0][d]; p.tri(x + dx * h * 0.8, y + dy * h * 0.8, h * 0.28, d, col); } break;
    case 'clamp': p.poly([x - h, y - h * 0.7, x - h * 0.2, y - h * 0.7, x - h * 0.2, y - h * 0.35, x - h * 0.6, y - h * 0.35, x - h * 0.6, y + h * 0.35, x - h * 0.2, y + h * 0.35, x - h * 0.2, y + h * 0.7, x - h, y + h * 0.7], col, !!on, lw); p.poly([x + h, y - h * 0.7, x + h * 0.2, y - h * 0.7, x + h * 0.2, y - h * 0.35, x + h * 0.6, y - h * 0.35, x + h * 0.6, y + h * 0.35, x + h * 0.2, y + h * 0.35, x + h * 0.2, y + h * 0.7, x + h, y + h * 0.7], col, !!on, lw); break;
    case 'hatch': p.circle(x, y, h * 0.9, col, false, 3); p.circle(x, y, h * 0.35, col, !!on, 2.4); p.line(x - h * 0.9, y, x + h * 0.9, y, col, 2); break;
    case 'eng': p.poly([x - h * 0.35, y - h, x + h * 0.35, y - h, x + h * 0.35, y - h * 0.5, x + h * 0.95, y + h * 0.8, x - h * 0.95, y + h * 0.8, x - h * 0.35, y - h * 0.5], col, false, lw); if (on) p.poly([x - h * 0.55, y + h * 0.55, x + h * 0.55, y + h * 0.55, x + h * 0.25, y - h * 0.3, x - h * 0.25, y - h * 0.3], col); break;
    case 'planet': p.circle(x, y, h, col, false, 3); p.c.save(); p.c.beginPath(); p.c.arc(x, y, h - 1, 0, TAU); p.c.clip(); for (const k of [-0.45, 0, 0.45]) p.line(x - h, y + k * h + h * 0.1, x + h, y + k * h - h * 0.1, col, 2); p.c.restore(); break;
    case 'ping': p.fill(x - 2, y - h * 0.2, 4, h * 1.2, col); p.circle(x, y - h * 0.3, 3, col, true); if (on) { p.arc(x, y - h * 0.3, h * 0.5, -2.4, -0.74, col, 2.2); p.arc(x, y - h * 0.3, h * 0.85, -2.4, -0.74, col, 2.2); } break;
    default: p.box(x - h, y - h, sz, sz, col, lw);
  }
}

function sysModel(s) {
  const asList = (v, n) => (Array.isArray(v) ? v : Array(n).fill(v));
  const eng = asList(s.engines ?? 'OFF', 2).map(stStr);
  const fc = asList(s.fuelCells ?? false, 3).map(stStr);
  let A, B;
  if (Array.isArray(s.buses)) { A = s.buses.includes('A') ? 'ON' : 'OFF'; B = s.buses.includes('B') ? 'ON' : 'OFF'; }
  else if (s.buses && typeof s.buses === 'object') { A = stStr(s.buses.A); B = stStr(s.buses.B); }
  else { A = B = stStr(s.buses ?? false); }
  const batt = typeof s.battery === 'number' ? `${pad(s.battery * 100, 2)}%` : stStr(s.battery);
  const battLv = typeof s.battery === 'number' ? (s.battery > 0.15 ? 1 : 2) : lvOf(batt);
  const busA = lvOf(A) === 1, busB = lvOf(B) === 1, anyBus = busA || busB;
  const fcOn = fc.map(v => lvOf(v) === 1);
  const nFc = fcOn.filter(Boolean).length;
  const need = (v, lv) => {
    if (lv === 0 || lv === 3) return [v, lv];
    if (!anyBus) return ['NO BUS', 2];
    return [v, lv];
  };
  const engS = eng.map(e => { let [v, l] = need(e, lvOf(e)); if (l && l < 3 && (e === 'RUN' || e === 'START') && nFc === 0) [v, l] = ['REQ FC', 2]; return [v, l]; });
  const busS = [A, B].map((v, i) => { const l = lvOf(v); if (l === 1 && !battLv && nFc === 0) return ['NO SRC', 2]; return [v, l]; });
  return { eng, fc, fcOn, nFc, A, B, busA, busB, anyBus, batt, battLv, engS, busS, flooded: eng.includes('FLOODED') };
}

function drawSystems(p, W, H, s, t) {
  const m = sysModel(s);
  const caution = s.caution || null;
  header(p, W, 'SYSTEMS', m.flooded ? 'ENG FAIL' : caution ? 'CAUTION' : 'NOMINAL', m.flooded ? C.red : caution ? C.amber : C.dim, m.flooded);
  const [av, avl] = (() => { const v = stStr(s.avionics); const l = lvOf(v); return l && l < 3 && !m.anyBus ? ['NO BUS', 2] : [v, l]; })();
  const [rc, rcl] = (() => { const v = stStr(s.rcs); const l = lvOf(v); return l && l < 3 && !m.anyBus ? ['NO BUS', 2] : [v, l]; })();
  const volts = on => (on ? '28.4 V' : '0.0 V');
  const blocks = [
    ['BATT', 'batt', m.batt, m.battLv, m.battLv ? '26.1 V' : '--'],
    ['BUS A', 'bus', ...m.busS[0], volts(m.busA)],
    ['BUS B', 'bus', ...m.busS[1], volts(m.busB)],
    ['AVIONICS', 'chip', av, avl, avl === 1 ? '4.2 A' : '--'],
    ['FC 1', 'fc', m.fc[0], lvOf(m.fc[0]), m.fcOn[0] ? '1.4 KW' : '--'],
    ['FC 2', 'fc', m.fc[1], lvOf(m.fc[1]), m.fcOn[1] ? '1.4 KW' : '--'],
    ['FC 3', 'fc', m.fc[2], lvOf(m.fc[2]), m.fcOn[2] ? '1.3 KW' : '--'],
    ['RCS', 'rcs', rc, rcl, rcl === 1 ? '16 THR' : '--'],
    ['CLAMPS', 'clamp', stStr(s.clamps || 'LOCKED'), lvOf(stStr(s.clamps || 'LOCKED')), ''],
    ['HATCH', 'hatch', stStr(s.hatch || 'SEALED'), lvOf(stStr(s.hatch || 'SEALED')), ''],
    ['ENG L', 'eng', ...m.engS[0], m.engS[0][1] === 1 && m.eng[0] === 'RUN' ? 'PC 2.1' : ''],
    ['ENG R', 'eng', ...m.engS[1], m.engS[1][1] === 1 && m.eng[1] === 'RUN' ? 'PC 2.1' : ''],
  ];
  const cols = 4, g = 8, bw = (W - 16 - g * (cols - 1)) / cols, bh = Math.min(64, (H - 38 - 50 - 2 * 10) / 3);
  const pos = i => [8 + (i % cols) * (bw + g), 38 + Math.floor(i / cols) * (bh + 10)];
  const [, ay] = pos(0), my = ay + bh / 2;
  const seg = (i, lit) => { const [x1] = pos(i), [x2] = pos(i + 1); p.line(x1 + bw, my, x2, my, lit ? C.fg : C.faint, 4); };
  seg(0, m.battLv > 0 && m.busA);
  seg(1, m.busA && m.busB);
  seg(2, m.anyBus && avl === 1);
  for (let i = 0; i < 3; i++) {
    const [fx] = pos(4 + i);
    p.line(fx + bw / 2, ay + bh, fx + bw / 2, ay + bh + 10, m.fcOn[i] && m.anyBus ? C.fg : C.faint, 4);
  }
  blocks.forEach(([lab, ic, val, lv, fine], i) => {
    const [x, y] = pos(i);
    const col = lvCol(lv);
    const blinkOff = lv === 3 && (t * 2) % 1 > 0.65;
    p.fill(x, y, bw, bh, C.bg);
    p.box(x, y, bw, bh, col, lv ? 2.6 : 1.6);
    const isz = Math.min(26, bh * 0.42);
    icon(p, ic, x + 8 + isz / 2, y + bh * 0.58, isz, col, lv === 1);
    p.text(lab, x + bw - 6, y + 12, p.fit(lab, bw - 14, FLOOR), lv ? C.mid : C.dim, 'right', true);
    if (fine) p.fine(fine, x + 5, y + 10, 'left', lv ? C.fine : C.faint);
    const vw = bw - isz - 18;
    if (lv === 3 || lv === 2) { const tw = Math.min(vw, p.tw(val) * 13 + 10); if (!blinkOff) p.inv(val, x + bw - 6 - tw, y + bh - 24, tw, 18, 13, col); }
    else p.text(val, x + bw - 6, y + bh - 15, p.fit(val, vw, 15), lv ? C.hi : C.dim, 'right', true);
  });
  const by = H - 48, bwid = W - 16, bht = 40;
  if (m.flooded) {
    p.box(8, by, bwid, bht, C.red, 3);
    p.text('ENGINES FLOODED', 16, by + 12, p.fit('ENGINES FLOODED', bwid * 0.48, 13), C.red, 'left', true);
    const dr = s.drain ?? 0, tot = s.drainTotal || Math.max(dr, 1);
    const rate = s.source?.rate ?? s.rate ?? MONTH;
    p.box(16, by + 24, bwid * 0.46 - 16, 9, C.amberDim, 1.2);
    p.fill(18, by + 26, (bwid * 0.46 - 20) * clamp(dr / tot, 0, 1), 5, C.amber);
    p.label('DRAIN', 8 + bwid * 0.5, by + 12, C.amber);
    p.text(fmtMS(dr), W - 16, by + 13, 20, C.amber, 'right', true);
    const cost = `= ${fmtYM(dr * rate)} ENDURANCE`;
    p.text(cost, W - 16, by + 31, p.fit(cost, bwid * 0.5, 12), C.amber, 'right', true);
  } else if (caution) {
    p.box(8, by, bwid, bht, C.amber, 2.4);
    p.text(caution, W / 2, by + bht / 2, p.fit(caution, bwid - 16, 15), C.amber, 'center', true);
  } else {
    const missing = [];
    if (!m.battLv) missing.push('BATT');
    else if (!m.anyBus) missing.push('BUS');
    else if (m.nFc < 3) missing.push(`FC ${3 - m.nFc}`);
    p.box(8, by, bwid, bht, C.dim, 1.6);
    const msg = s.message || (missing.length ? `REQ ${missing.join(' ')}` : 'ALL SYSTEMS NOMINAL');
    p.text(msg, W / 2, by + bht / 2, p.fit(msg, bwid - 16, 14), missing.length && !s.message ? C.fg : C.fg, 'center', true);
  }
}

function drawEngine(p, W, H, s, t, d) {
  const thr = clamp(s.throttle ?? 0, 0, 1), fuel = clamp(s.fuel ?? 1, 0, 1);
  const tmax = s.thrustMax || 980, thrust = s.thrust ?? thr * tmax;
  const state = s.state || (thrust > 1 ? 'RUN' : 'OFF');
  const flooded = state === 'FLOODED';
  header(p, W, 'MAIN ENGINES', state, flooded ? C.red : state === 'RUN' ? C.hi : C.dim, flooded || state === 'RUN');
  const tapes = [['THR', thr, `${pad(thr * 100, 3)}%`, null], ['KN', thrust / tmax, `${Math.round(thrust)}`, thr], ['FUEL', fuel, `${pad(fuel * 100, 2)}%`, null]];
  const tw = Math.min(54, (W * 0.55 - 16) / 3 - 18), ty = 50, th = H - 50 - 56;
  tapes.forEach(([lab, f, val, cmd], i) => {
    const x = 26 + i * (tw + 26);
    p.label(lab, x + tw / 2, 42, C.mid, FLOOR, 'center');
    p.box(x, ty, tw, th, C.fg, 2.4);
    for (let k = 0; k <= 20; k++) { const y = ty + th - th * k / 20; if (k % 2) p.hair(x - 4, y, x, y, C.fine); else p.line(x - (k % 10 ? 6 : 11), y, x, y, C.fg, 2); }
    const low = lab === 'FUEL' && f < 0.15;
    const segs = 20, sh = (th - 6) / segs;
    const nf = Math.round(clamp(f, 0, 1) * segs);
    for (let k = 0; k < nf; k++) p.fill(x + 4, ty + th - 3 - (k + 1) * sh + 1.5, tw - 8, sh - 3, low ? C.amber : C.fg);
    if (lab === 'FUEL') { const y = ty + th - th * 0.15; p.line(x - 4, y, x + tw + 4, y, C.amber, 2); }
    if (cmd != null) { const y = ty + th - th * cmd; p.tri(x + tw + 8, y, 7, 3, C.hi); }
    p.box(x - 8, ty + th + 8, tw + 16, 26, low ? C.amber : C.fg, 2.4);
    p.text(val, x + tw / 2, ty + th + 21.5, p.fit(val, tw + 10, 16), low ? C.amber : C.hi, 'center', true);
  });
  const rx = 26 + 3 * (tw + 26), rw = W - 8 - rx;
  const ch = s.chamber || [thr, thr];
  ['L', 'R'].forEach((side, i) => {
    const w = (rw - 6) / 2, x = rx + i * (w + 6), y = 38, h = 100;
    const lv = flooded ? 3 : ch[i] > 0.02 ? 1 : 0;
    p.box(x, y, w, h, lvCol(lv), 2.4);
    p.label(side, x + 6, y + 11, C.mid);
    icon(p, 'eng', x + w / 2, y + 48, Math.min(40, w * 0.55), lvCol(lv), lv === 1);
    p.text(flooded ? 'FLOOD' : `${pad(ch[i] * 100, 3)}`, x + w / 2, y + h - 14, p.fit('FLOOD', w - 10, 15), lv === 3 ? C.red : lv ? C.hi : C.dim, 'center', true);
  });
  const hist = d._hist || (d._hist = []);
  if (!hist.length || hist[hist.length - 1] !== thr) { hist.push(thr); if (hist.length > 40) hist.shift(); }
  const iy = 144;
  [['BURN', s.burnTime != null ? fmtMS(s.burnTime) : '--:--'], ['PC KPA', `${Math.round(s.pressure ?? thr * 2100)}`], ['FUEL KG', `${Math.round(s.fuelKg ?? fuel * 8400)}`]].forEach(([k, v], i) => {
    const y = iy + i * 30;
    p.box(rx, y, rw, 26, C.fg, 2);
    p.label(k, rx + 6, y + 13, C.mid);
    p.text(v, rx + rw - 6, y + 13.5, p.fit(v, rw * 0.45, 15), C.hi, 'right', true);
  });
  const gy = iy + 92, gh = H - 8 - gy;
  if (gh > 18) {
    p.box(rx, gy, rw, gh, C.dim, 1.2);
    p.grid(rx, gy, rw, gh, 8, 2);
    const c = p.c; c.beginPath();
    hist.forEach((v, i) => { const x = rx + 3 + (rw - 6) * i / 39, y = gy + gh - 3 - v * (gh - 6); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.strokeStyle = C.fg; c.lineWidth = 1.6; c.stroke();
    p.fine('THR HIST', rx + 4, gy + 8);
  }
}

function drawBeacon(p, W, H, s, t) {
  const brg = s.bearing ?? 0, dist = s.distance ?? 180, str = clamp(s.strength ?? 0.8, 0, 1);
  header(p, W, 'LOCATOR', s.id || 'LANDER 1');
  const cx = W / 2, cy = H - 78, R = Math.min(W / 2 - 30, cy - 52);
  const ringMax = [20, 50, 100, 200, 500, 1000, 2000, 5000, 1e4, 2e4, 5e4, 1e5].find(v => v >= dist) || Math.pow(10, Math.ceil(Math.log10(dist)));
  const lab = v => (v >= 1000 ? `${v / 1000} KM` : `${v} M`);
  for (let k = 1; k < 4; k++) p.arc(cx, cy, R * k / 4, Math.PI, TAU, C.faint, 1.1);
  p.arc(cx, cy, R, Math.PI, TAU, C.fg, 3);
  p.arc(cx, cy, R * 0.5, Math.PI, TAU, C.dim, 1.8);
  p.line(cx - R - 4, cy, cx + R + 4, cy, C.fg, 2.4);
  p.text(lab(ringMax), cx + 4, cy - R + 12, 11.5, C.mid, 'left', true);
  p.text(lab(ringMax / 2), cx + 4, cy - R * 0.5 + 12, 11.5, C.mid, 'left', true);
  for (let a = -90; a <= 90; a += 5) {
    const an = (a - 90) * DEG;
    if (a % 10) { p.hair(cx + Math.cos(an) * R, cy + Math.sin(an) * R, cx + Math.cos(an) * (R + 4), cy + Math.sin(an) * (R + 4), C.fine); continue; }
    const l = a % 30 ? 6 : 12;
    p.line(cx + Math.cos(an) * R, cy + Math.sin(an) * R, cx + Math.cos(an) * (R + l), cy + Math.sin(an) * (R + l), C.fg, a % 30 ? 2 : 3);
    if (a % 30 === 0 && Math.abs(a) < 90) p.text(String(Math.abs(a)), cx + Math.cos(an) * (R + 22), cy + Math.sin(an) * (R + 22) + 2, 11.5, C.mid, 'center', true);
  }
  p.tri(cx, cy - 4, 10, 0, C.hi);
  const period = s.period || 1;
  const ph = (t / period) % 1;
  const on = ph < 0.18;
  const behind = Math.abs(brg) > 90;
  if (!behind) {
    const ba = (brg - 90) * DEG;
    const rr = R * clamp(dist / ringMax, 0, 1);
    const bx = cx + Math.cos(ba) * rr, by = cy + Math.sin(ba) * rr;
    p.dash(cx, cy, cx + Math.cos(ba) * R, cy + Math.sin(ba) * R, C.mid, 1.6, [4, 5]);
    const c = p.c;
    c.save(); c.beginPath(); c.rect(0, 30, W, cy - 30); c.clip();
    for (const k of [0, 0.5]) {
      const q = (ph + k) % 1;
      c.globalAlpha = (1 - q) * 0.9;
      p.circle(bx, by, 6 + q * R * 0.45, C.hi, false, 3 - q * 2);
    }
    c.globalAlpha = 1; c.restore();
    p.fill(bx - 7, by - 7, 14, 14, on ? C.hi : C.fg);
  } else {
    const side = brg > 0 ? 1 : -1;
    const ex = cx + side * (R - 14), ey = cy - 26;
    for (let i = 0; i < 3; i++) p.chevron(ex + side * (i * 12 - 12), ey, side > 0 ? 0 : Math.PI, 22, C.amber, 5);
    const tt = `TURN ${side > 0 ? 'R' : 'L'} ${Math.round(Math.abs(brg))}°`;
    p.text(tt, cx, cy - R * 0.32, p.fit(tt, R * 1.4, 26), C.amber, 'center', true);
    p.label('SIGNAL BEHIND', cx, cy - R * 0.32 + 22, C.amber, FLOOR, 'center');
  }
  const yb = cy + 10, bh = H - 8 - yb, w3 = (W - 16 - 12) / 3;
  p.box(8, yb, w3 * 1.3, bh, C.fg, 2.4);
  p.label('DIST', 14, yb + 11, C.mid);
  const ds = fmtRange(dist);
  p.text(ds, 8 + w3 * 1.3 - 8, yb + bh * 0.62, p.fit(ds, w3 * 1.3 - 16, 30), C.hi, 'right', true);
  const x2 = 8 + w3 * 1.3 + 6, w2 = w3 * 0.85;
  p.box(x2, yb, w2, bh, behind ? C.amber : C.fg, 2.4);
  p.label('BRG', x2 + 6, yb + 11, behind ? C.amber : C.mid);
  const bs = `${sgn(brg, 0)}°`;
  p.text(bs, x2 + w2 - 6, yb + bh * 0.62, p.fit(bs, w2 - 12, 22), behind ? C.amber : C.hi, 'right', true);
  const x3 = x2 + w2 + 6, wl = W - 8 - x3;
  p.box(x3, yb, wl, bh, C.fg, 2.4);
  p.label('SIG', x3 + 6, yb + 11, C.mid);
  for (let i = 0; i < 5; i++) {
    const hh = 6 + i * 5, x = x3 + 8 + i * ((wl - 16) / 5);
    const lit = str > i / 5;
    p.fill(x, yb + bh - 7 - hh, (wl - 16) / 5 - 4, hh, lit ? (on && i === Math.floor(str * 5 - 0.01) ? C.hi : C.fg) : C.faint);
  }
  if (s.status) p.text(`"${s.status}"`, W - 10, 44, 11.5, C.fg, 'right', true);
}

function ecg(ph) {
  const g = (x, m, w) => Math.exp(-((x - m) * (x - m)) / (w * w));
  return 0.12 * g(ph, 0.12, 0.035) - 0.12 * g(ph, 0.255, 0.012) + 1.0 * g(ph, 0.28, 0.012) - 0.28 * g(ph, 0.305, 0.014) + 0.25 * g(ph, 0.52, 0.05);
}

function drawCryo(p, W, H, s, t) {
  const status = s.status || 'STASIS';
  const dead = status === 'NO LIFE SIGNS';
  const empty = status === 'EMPTY';
  header(p, W, `CRYO POD ${s.pod || '02'}`, status, dead ? C.red : status === 'THAW' ? C.amber : empty ? C.dim : C.fg, dead || status === 'THAW');
  const pw = Math.min(W * 0.34, 150), px = 8, py = 38, ph = H - 38 - 100;
  p.box(px, py, pw, ph, C.fg, 2.4);
  p.grid(px, py, pw, ph, 6, 6);
  const cw = pw - 30, ch = ph - 22, ccx = px + pw / 2, ccy = py + ph / 2;
  const c = p.c;
  c.beginPath(); c.roundRect(ccx - cw / 2, ccy - ch / 2, cw, ch, cw * 0.45); c.fillStyle = C.bg; c.fill(); c.strokeStyle = C.fg; c.lineWidth = 3; c.stroke();
  c.beginPath(); c.roundRect(ccx - cw / 2 + 7, ccy - ch / 2 + 7, cw - 14, ch - 14, cw * 0.38); c.strokeStyle = C.dim; c.lineWidth = 1.2; c.stroke();
  if (!empty) {
    const fc = dead ? C.mid : C.fg;
    p.circle(ccx, ccy - ch * 0.3, cw * 0.13, fc, true);
    p.fill(ccx - cw * 0.2, ccy - ch * 0.19, cw * 0.4, ch * 0.33, fc);
    p.fill(ccx - cw * 0.17, ccy + ch * 0.16, cw * 0.14, ch * 0.24, fc);
    p.fill(ccx + cw * 0.03, ccy + ch * 0.16, cw * 0.14, ch * 0.24, fc);
  }
  for (let i = 0; i < 6; i++) p.line(ccx - cw / 2 + 4, ccy - ch * 0.35 + i * ch * 0.14, ccx - cw / 2 + 10, ccy - ch * 0.35 + i * ch * 0.14, C.dim, 2);
  const tx = px + pw + 10, tw = W - 8 - tx;
  const hr = dead || empty ? null : s.heartRate ?? 4;
  const rows = [
    ['OCCUPANT', s.occupant || 'WREN, A.'],
    ['CYCLE', String(s.cycles ?? 1).padStart(3, '0')],
    ['AGE', s.age != null ? `${s.age.toFixed(1)} YR` : '--'],
    ['CORE TEMP', s.temp != null ? `${s.temp.toFixed(1)} K` : '--'],
    ['HEART', hr == null ? '-- BPM' : `${hr.toFixed(1)} BPM`],
  ];
  const rh = ph / rows.length;
  rows.forEach(([k, v], i) => {
    const y = py + i * rh;
    p.box(tx, y, tw, rh - 4, C.fg, 2);
    p.label(k, tx + 6, y + (rh - 4) / 2, C.mid);
    p.text(v, tx + tw - 6, y + (rh - 4) / 2 + 1, p.fit(v, tw * 0.52, 15), k === 'HEART' && hr == null ? C.dim : C.hi, 'right', true);
  });
  const gy = py + ph + 8, gh = H - 8 - gy;
  p.box(8, gy, W - 16, gh, C.fg, 2.4);
  p.grid(8, gy, W - 16, gh, 16, 4);
  p.label('ECG', 14, gy + 11, C.mid);
  const baseY = gy + gh * 0.62, amp = gh * 0.5;
  c.beginPath();
  const x0 = 12, x1 = W - 12, n = 140, span = 6;
  const head = (t / span) % 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = x0 + (x1 - x0) * u;
    const age = ((head - u) % 1 + 1) % 1;
    const ts = t - age * span;
    const v = hr == null ? (hash(Math.floor(ts * 30)) - 0.5) * 0.02 : ecg(((ts * hr / 60) % 1 + 1) % 1);
    const y = baseY - v * amp;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.strokeStyle = dead ? C.fg : C.hi; c.lineWidth = 2.6; c.stroke();
  const hx = x0 + (x1 - x0) * head;
  p.fill(hx, gy + 3, 18, gh - 6, C.bg);
  p.fill(hx - 3, baseY - 3 - (hr == null ? 0 : ecg(((t * hr / 60) % 1 + 1) % 1) * amp), 6, 6, C.hi);
  if (dead) p.inv('NO LIFE SIGNS', W - 8 - 150, gy + 4, 146, 18, 12, C.red);
}

const BOARD_WORLDS = [
  { name: 'MILLER', beacon: 'ACTIVE', data: 'ALL GOOD', dist: '0.21 AU', orbit: 'GARGANTUA' },
  { name: 'HALE', beacon: 'INTERMIT', data: 'PARTIAL', dist: '1.9 AU', orbit: 'GARGANTUA' },
  { name: 'VOSS', beacon: 'SILENT', data: '--', dist: '4.6 AU', orbit: 'PANTAGRUEL' },
];

function drawBoard(p, W, H, s, t) {
  const worlds = s.worlds || BOARD_WORLDS;
  const sel = s.selected ?? 0;
  header(p, W, 'MISSION BOARD', `CANDIDATES ${worlds.length}`);
  const g = 8, cw = (W - 16 - g * (worlds.length - 1)) / worlds.length, cy = 38, chh = H - 38 - 76;
  worlds.forEach((w, i) => {
    const x = 8 + i * (cw + g);
    const selected = i === sel;
    p.box(x, cy, cw, chh, selected ? C.hi : C.fg, selected ? 3.4 : 2.2);
    const pr = Math.min(cw * 0.22, chh * 0.16);
    icon(p, 'planet', x + cw / 2, cy + 10 + pr, pr * 2, selected ? C.hi : C.fg);
    const ny = cy + 18 + pr * 2;
    p.inv(w.name, x + 6, ny, cw - 12, 22, 14, selected ? C.hi : C.fg);
    const rows = [['BEACON', w.beacon], ['DATA', w.data], ['DIST', w.dist]];
    const rh = (cy + chh - (ny + 28) - 4) / rows.length;
    rows.forEach(([k, v], j) => {
      const y = ny + 28 + j * rh;
      p.label(k, x + 7, y + rh * 0.5, C.mid, FLOOR);
      const lv = v === 'SILENT' || v === 'LOST' || v === '--' ? 0 : v === 'INTERMIT' ? 2 : 1;
      const col = lv === 0 ? C.dim : lv === 2 ? C.amber : C.hi;
      p.text(v, x + cw - 7, y + rh * 0.5 + 1, p.fit(v, cw - 14 - p.tw(k) * FLOOR - 6, 13), col, 'right', true);
      if (j < rows.length - 1) p.hair(x + 6, y + rh, x + cw - 6, y + rh, C.faint);
    });
    if (w.beacon === 'ACTIVE') icon(p, 'ping', x + cw - 14, cy + 16, 18, C.fg, (t % 1.2) < 0.5);
  });
  const ny = H - 70, nh = 62;
  p.box(8, ny, W - 16, nh, C.fg, 2.4);
  const note = s.note || { from: 'MILLER BEACON', text: 'ALL GOOD', ping: true };
  p.label(`${note.from}  LAST TRANSMISSION`, 16, ny + 12, C.mid);
  const txt = `"${note.text}"`;
  p.text(txt, 16, ny + 38, p.fit(txt, W * 0.55, 24), C.hi, 'left', true);
  const pingAge = s.pingAge != null ? s.pingAge : (t % (s.pingPeriod || 6));
  const ps = `PING ${fmtMS(pingAge)} AGO`;
  p.text(ps, W - 16, ny + 38, 12, C.fg, 'right', true);
  if (pingAge < 0.6) p.fill(W - 16 - p.tw(ps) * 12 - 18, ny + 33, 10, 10, C.hi);
}

const LOG_DEMO = [
  { t: 'T+00y 01m', title: 'FIRST MONTH. CLEAN SIGNAL FROM THE SURFACE.', text: 'Telemetry nominal. I can see you on the long lens.', read: true },
  { t: 'T+00y 04m', title: 'STILL AT THE HATCH.', text: 'Four months and you have not moved from the ramp.', read: false },
];

function drawLog(p, W, H, s, t, d) {
  const entries = s.entries || LOG_DEMO;
  const unread = entries.filter(e => !e.read).length;
  if (s.mode === 'reader') return drawLogReader(p, W, H, s, entries, d);
  header(p, W, 'MESSAGES', `UNREAD ${pad(unread, 2)}`, unread ? C.hi : C.dim, unread > 0);
  p.label(`FROM ${s.from || 'DR. A. WREN'}`, 10, 42, C.mid);
  p.fine(`${entries.length} ENTRIES`, W - 12, 42, 'right');
  const top = 54, bot = H - 32, rh = s.rowHeight || 27;
  const vis = Math.floor((bot - top) / rh);
  const sel = clamp(s.selected ?? 0, 0, Math.max(0, entries.length - 1));
  const maxScroll = Math.max(0, entries.length - vis);
  const want = clamp(sel - Math.floor(vis / 2), 0, maxScroll);
  d._scroll = d._scroll == null ? want : d._scroll;
  d._scrollTarget = want;
  const sc = d._scroll;
  const c = p.c;
  c.save(); c.beginPath(); c.rect(0, top - 1, W, bot - top + 2); c.clip();
  const first = Math.floor(sc);
  for (let i = first; i < Math.min(entries.length, first + vis + 2); i++) {
    const e = entries[i];
    const y = top + (i - sc) * rh;
    const isSel = i === sel;
    if (isSel) { p.fill(8, y + 1, W - 30, rh - 3, INV[C.fg]); p.box(7, y, W - 28, rh - 1, C.hi, 1.6); }
    else p.hair(8, y + rh - 1, W - 22, y + rh - 1, C.faint);
    const col = isSel ? C.ink : e.read ? C.fg : C.hi;
    if (!e.read) p.fill(14, y + rh / 2 - 5, 10, 10, col); else p.box(15, y + rh / 2 - 4, 8, 8, isSel ? C.ink : C.dim, 1.6);
    p.text(e.t, 32, y + rh / 2 + 1, 13, col, 'left', true);
    const tx = 32 + p.tw(e.t) * 13 + 12;
    const cols = Math.floor((W - 30 - tx - 4) / (12.5 * CW));
    p.text(trunc(e.title, cols), tx, y + rh / 2 + 1, 12.5, isSel ? C.ink : e.read ? C.mid : C.fg, 'left', true);
  }
  c.restore();
  p.box(W - 18, top, 8, bot - top, C.dim, 1.2);
  if (entries.length > vis) {
    const hh = (bot - top - 4) * vis / entries.length, yy = top + 2 + (bot - top - 4 - hh) * (sc / maxScroll || 0);
    p.fill(W - 16, yy, 4, hh, C.fg);
  }
  softkeys(p, W, H, ['UP', 'DOWN', 'OPEN'], -1);
}

function drawLogReader(p, W, H, s, entries, d) {
  const i = clamp(s.selected ?? 0, 0, Math.max(0, entries.length - 1));
  const e = entries[i] || { t: '', title: '', text: '' };
  const tsize = 15;
  const tcols = Math.floor((W - 20) / (tsize * CW));
  const tl = wrap(e.title, tcols).slice(0, 2);
  const ry = 44 + tl.length * 19 - 4;
  const avail = H - 36 - ry - 10;
  let size = s.textSize || 14;
  if (!s.textSize) for (let z = 20; z >= 14; z -= 1) { const n = wrap(e.text, Math.floor((W - 22) / (z * CW))).length; if (n * z * 1.45 <= avail) { size = z; break; } }
  const lh = size * 1.45;
  const cols = Math.floor((W - 22) / (size * CW));
  const lines = wrap(e.text, cols);
  const per = Math.max(1, Math.floor(avail / lh));
  const pages = Math.max(1, Math.ceil(lines.length / per));
  const pg = clamp(s.page ?? 0, 0, pages - 1);
  d.meta.pages = pages; d.meta.page = pg;
  header(p, W, `LOG ${pad(i + 1, 3)}`, `${e.t}   ${pg + 1}/${pages}`, C.hi, true);
  tl.forEach((ln, k) => p.text(ln, 10, 44 + k * 19, tsize, C.hi, 'left', true));
  p.line(8, ry, W - 8, ry, C.dim, 1.2);
  lines.slice(pg * per, pg * per + per).forEach((ln, k) => p.text(ln, 11, ry + 14 + k * lh, size, C.fg, 'left', false));
  softkeys(p, W, H, [pg > 0 ? 'PREV' : '', pg < pages - 1 ? 'NEXT' : '', 'BACK'], -1);
}

function drawRecorder(p, W, H, s, t) {
  header(p, W, 'DATA RECORDER', s.unit || 'LANDER 1');
  const el = (s.elapsedMinutes ?? 47.2) * 60;
  const rate = s.rate ?? MONTH;
  p.box(8, 38, W - 16, 90, C.fg, 2.4);
  p.label('ELAPSED SINCE ARRIVAL  /  LOCAL', 16, 50, C.mid);
  const big = `${pad(el / 3600, 2)}:${pad((el / 60) % 60, 2)}:${pad(el % 60, 2)}`;
  const bs = p.fit(big, W * 0.66, 56);
  p.text(big, 18, 92, bs, C.hi, 'left', true);
  p.fine('HR  MIN  SEC', 18 + p.tw(big) * bs + 8, 106);
  const ry = 134, rw = (W - 22) / 2;
  const rows = [
    ['ARRIVAL', s.arrival || 'LOCAL 00:00:00', C.hi, C.mid],
    ['ORBIT EQUIV', fmtYM(el * rate), C.amber, C.amber],
    ['SIGNAL', s.signal || 'LOOP "ALL GOOD"', C.amber, C.mid],
  ];
  if (s.firstHeard) rows.push(['FIRST HEARD', s.firstHeard, C.hi, C.mid]);
  rows.forEach(([k, v, col, kc], i) => {
    const x = 8 + (i % 2) * (rw + 6), y = ry + Math.floor(i / 2) * 42;
    p.box(x, y, rw, 38, col === C.amber && k === 'ORBIT EQUIV' ? C.amber : C.fg, 2.2);
    p.label(k, x + 6, y + 11, kc);
    p.text(v, x + rw - 6, y + 27, p.fit(v, rw - 12, k === 'ORBIT EQUIV' ? 17 : 13.5), col, 'right', true);
  });
  const entries = s.entries || [{ t: '+00:00', text: 'TOUCHDOWN. HULL BREACH AFT.' }, { t: '+00:06', text: 'BEACON ARMED. AUTO REPEAT.' }, { t: '+00:31', text: 'WATER LEVEL RISING' }];
  const ey = ry + Math.ceil(rows.length / 2) * 42 + 2, lh = 19, maxN = Math.max(1, Math.floor((H - 8 - ey) / lh));
  const show = entries.slice(-maxN);
  const cols = Math.floor((W - 92) / (12 * CW));
  show.forEach((e, k) => {
    const y = ey + 8 + k * lh;
    const last = k === show.length - 1;
    p.text(e.t, 12, y, 12, C.mid, 'left', true);
    const tx = trunc(e.text, cols);
    p.text(tx, 80, y, 12, last ? C.hi : C.fg, 'left', last);
    if (last && (t * 2) % 1 < 0.55) p.fill(80 + p.tw(tx) * 12 + 3, y - 6, 7, 12, C.hi);
  });
}

function drawText(p, W, H, s, t) {
  if (s.title) header(p, W, s.title, s.right || null);
  const size = s.size || 15, lh = size * 1.45;
  let y = s.title ? 46 : 16;
  const lines = s.lines || [];
  let lastX = 10, lastLh = lh;
  for (const ln of lines) {
    const o = typeof ln === 'string' ? { text: ln } : ln;
    const col = o.color === 'amber' ? C.amber : o.color === 'red' ? C.red : o.color === 'dim' ? C.mid : o.color === 'hi' ? C.hi : C.fg;
    const sz = Math.max(FLOOR, o.size || size);
    const llh = sz * 1.45;
    for (const w of wrap(o.text, Math.max(4, Math.floor((W - 20) / (sz * CW))))) {
      if (y > H - 10) break;
      if (o.inverse) p.inv(w, 8, y - sz * 0.7, Math.min(W - 16, p.tw(w) * sz + 14), sz * 1.4, sz, col, 'left');
      else p.text(w, 10, y, sz, col, 'left', o.bold ?? true);
      lastX = 10 + p.tw(w) * sz;
      y += llh; lastLh = llh;
    }
  }
  if (s.cursor && (t * 2) % 1 < 0.55) p.fill(lastX + 4, y - lastLh - 7, 8, 14, C.hi);
}

function compactRows(kind, s) {
  switch (kind) {
    case 'clock': case 'wrist': {
      const { ship, end, rate } = clockSource(s); const racing = rate > 50; const sh = splitTime(ship), dl = splitTime(Math.max(0, end - ship));
      return { title: s.title || 'CLOCK', right: racing ? rateWords(rate) : 'SYNC', rc: racing ? C.amber : C.dim, rows: [['SHIP', `${pad(ship / 3600, 2)}:${pad(sh.mi, 2)}:${pad(sh.s, 2)}`, C.hi], ['ENDUR', fmtYM(end), C.hi], ['DIFF', `${pad(dl.y, 2)}Y ${pad(dl.mo, 2)}M`, racing ? C.amber : C.hi]] };
    }
    case 'attitude': return { title: 'ATT', right: s.mode || 'RCS', rows: [['ROLL', `${sgn(s.roll || 0, 1)}°`, C.hi], ['PITCH', `${sgn(s.pitch || 0, 1)}°`, C.hi], ['YAW', `${sgn(s.yaw || 0, 1)}°`, C.hi]] };
    case 'nav': { const err = s.alignError ?? Math.hypot(s.bearing || 0, s.elevation || 0); const [ak, av, ac] = approach(s.closing ?? 0); const cue = s.burn?.cue; return { title: 'NAV', right: s.target || 'MILLER', rows: [['RANGE', fmtRange(s.range ?? 0), C.hi], [ak, av, ac], cue ? [cue === 'BURN' && err > (s.tolerance ?? 2) ? 'ALIGN' : 'CUE', cue === 'BURN' && err > (s.tolerance ?? 2) ? `${err.toFixed(1)}°` : cue, cue === 'BURN' && err <= (s.tolerance ?? 2) ? C.hi : C.amber] : ['ERR', `${err.toFixed(1)}°`, err <= (s.tolerance ?? 2) ? C.hi : C.amber]] }; }
    case 'dock': { const off = s.offset || { x: 0, y: 0 }; const diff = (s.rollRate ?? 0) - (s.stationRate ?? 5.3); const matched = s.matched ?? Math.abs(diff) < 0.1; return { title: 'DOCK', right: s.state || '', rows: [['RANGE', fmtRange(s.range ?? 40), C.hi], ['OFFSET', `${Math.hypot(off.x, off.y).toFixed(2)} M`, Math.hypot(off.x, off.y) > (s.alignTolerance ?? 0.15) ? C.amber : C.hi], ['ROLL', matched ? 'MATCHED' : `${sgn(-diff, 2)}`, matched ? C.hi : C.amber]] }; }
    case 'systems': { const m = sysModel(s); return { title: 'SYS', right: m.flooded ? 'ENG FAIL' : 'PWR', rc: m.flooded ? C.red : C.dim, rows: [['BUS', `${m.busA ? 'A' : '-'} ${m.busB ? 'B' : '-'}`, m.anyBus ? C.hi : C.dim], ['FC', `${m.nFc}/3`, m.nFc === 3 ? C.hi : m.nFc ? C.amber : C.dim], ['ENG', m.flooded ? `DRAIN ${fmtMS(s.drain ?? 0)}` : m.eng[0], m.flooded ? C.red : C.hi]] }; }
    case 'engine': return { title: 'ENG', right: s.state || '', rows: [['THR', `${pad((s.throttle ?? 0) * 100, 3)}%`, C.hi], ['KN', `${Math.round(s.thrust ?? (s.throttle ?? 0) * (s.thrustMax || 980))}`, C.hi], ['FUEL', `${pad((s.fuel ?? 1) * 100, 2)}%`, (s.fuel ?? 1) < 0.15 ? C.amber : C.hi]] };
    case 'beacon': { const brg = s.bearing ?? 0; return { title: 'LOC', right: s.id || '', rows: [['DIST', fmtRange(s.distance ?? 0), C.hi], ['BRG', Math.abs(brg) > 90 ? `TURN ${brg > 0 ? 'R' : 'L'}${Math.round(Math.abs(brg))}` : `${sgn(brg, 0)}°`, Math.abs(brg) > 90 ? C.amber : C.hi], ['SIG', `${pad((s.strength ?? 0) * 100, 2)}%`, C.hi]] }; }
    case 'cryo': { const dead = s.status === 'NO LIFE SIGNS'; return { title: `POD ${s.pod || '02'}`, right: '', rows: [['STATUS', s.status || 'STASIS', dead ? C.red : C.hi], ['AGE', s.age != null ? `${s.age.toFixed(1)} YR` : '--', C.hi], ['HEART', dead || s.heartRate == null ? '--' : `${s.heartRate.toFixed(1)}`, C.hi]] }; }
    case 'recorder': { const el = (s.elapsedMinutes ?? 47.2) * 60; return { title: 'RECORDER', right: s.unit || '', rows: [['LOCAL', `${pad(el / 3600, 2)}:${pad((el / 60) % 60, 2)}:${pad(el % 60, 2)}`, C.hi], ['ORBIT', fmtYM(el * (s.rate ?? MONTH)), C.amber], ['SIGNAL', 'ALL GOOD', C.amber]] }; }
    case 'board': { const w = (s.worlds || BOARD_WORLDS)[s.selected ?? 0] || BOARD_WORLDS[0]; return { title: 'BOARD', right: w.name, rows: [['BEACON', w.beacon, C.hi], ['DATA', w.data, C.hi], ['DIST', w.dist, C.hi]] }; }
    default: return null;
  }
}

function drawCompact(p, W, H, cr, t) {
  header(p, W, cr.title, cr.right || null, cr.rc || C.fg, cr.rc === C.amber || cr.rc === C.red);
  const rh = (H - 40) / 3;
  cr.rows.forEach(([k, v, col], i) => {
    const y = 36 + i * rh;
    p.box(8, y, W - 16, rh - 6, col === C.amber || col === C.red ? col : C.fg, 2.6);
    p.text(k, 16, y + (rh - 6) / 2, p.fit(k, W * 0.3, 20), col === C.amber || col === C.red ? col : C.mid, 'left', true);
    p.text(v, W - 16, y + (rh - 6) / 2 + 1, p.fit(v, W * 0.6, rh * 0.62), col, 'right', true);
  });
}

const DRAW = { clock: drawClock, wrist: drawWrist, boot: drawBoot, attitude: drawAttitude, nav: drawNav, dock: drawDock, systems: drawSystems, engine: drawEngine, beacon: drawBeacon, cryo: drawCryo, board: drawBoard, log: drawLog, recorder: drawRecorder, text: drawText, dead: () => {} };

const ANIM_HZ = {
  clock: s => (clockSource(s).rate > 50 ? 20 : 4),
  wrist: s => (clockSource(s).rate > 50 ? 20 : 4),
  boot: () => 15,
  attitude: () => 0,
  nav: s => (s.burn?.cue === 'BURN' ? 5 : 0),
  dock: () => 0,
  systems: s => (sysModel(s).flooded ? 4 : 0),
  engine: () => 0,
  beacon: () => 10,
  cryo: () => 10,
  board: () => 4,
  log: () => 0,
  recorder: () => 4,
  text: s => (s.cursor ? 4 : 0),
  dead: () => 0,
};

const VERT = `
varying vec2 vUv; varying vec3 vVN; varying vec3 vVP;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVP = mv.xyz;
  vVN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map; uniform vec2 res; uniform float power, openX, openY, glitch, time, gain, curve, scan, refl, seed, envIntensity, reflCap;
uniform vec3 glowTint, envTint, phos, blackLevel;
#ifdef USE_ENV
uniform samplerCube envMap; uniform float envLod;
#endif
varying vec2 vUv; varying vec3 vVN; varying vec3 vVP;
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
void main(){
  vec2 c = vUv * 2.0 - 1.0;
  vec2 cc = c * (1.0 + curve * vec2(c.y * c.y, c.x * c.x));
  float m = pow(pow(abs(cc.x), 10.0) + pow(abs(cc.y), 10.0), 0.1);
  float mask = 1.0 - smoothstep(0.985, 1.0, m);
  vec2 uv = cc * 0.5 + 0.5;
  float g = glitch;
  float tf = floor(time * 14.0);
  float band = floor(uv.y * 22.0);
  float tear = step(1.0 - g * 0.55, h2(vec2(band, tf)));
  uv.x += tear * (h2(vec2(band, tf + 3.0)) - 0.5) * 0.3 * g;
  uv.x += sin(uv.y * 160.0 + time * 50.0) * 0.003 * g;
  float drop = 1.0 - step(1.0 - g * 0.4, h2(vec2(floor(uv.y * 48.0), tf + 11.0))) * 0.92;
  float collapse = smoothstep(0.72, 0.98, g);
  float sy = min(openY, mix(1.0, 0.006, collapse));
  float sx = openX;
  vec2 q = vec2((uv.x - 0.5) / max(sx, 0.001) + 0.5, (uv.y - 0.5) / max(sy, 0.001) + 0.5);
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  float boost = min(1.0 / max(sy, 0.06), 6.0) * min(1.0 / max(sx, 0.2), 2.0);
  vec3 tex = texture2D(map, q).rgb;
  vec3 ghost = texture2D(map, q - vec2(2.5 / res.x, 0.0)).rgb;
  vec3 g1 = texture2D(map, q, 2.0).rgb;
  vec3 g2 = texture2D(map, q, 4.0).rgb;
  vec3 g3 = texture2D(map, q, 5.5).rgb;
  float gw = 1.0 - smoothstep(0.3, 0.75, dot(g1, vec3(0.2126, 0.7152, 0.0722)));
  vec3 col = (tex + ghost * 0.10 * gw) * phos + (g1 * 0.24 + g2 * 0.2 + g3 * 0.14) * glowTint * gw;
  float sl = q.y * res.y * 0.5;
  float fw = fwidth(sl);
  float sa = scan * (1.0 - smoothstep(0.4, 0.95, fw));
  col *= 1.0 - sa * (0.5 + 0.5 * cos(sl * 6.2831853));
  float r2 = dot(c, c);
  col *= 1.0 - 0.22 * r2;
  col += blackLevel * (1.0 - 0.5 * r2) * step(0.001, power);
  if (collapse > 0.0) col += vec3(0.6, 0.95, 1.0) * collapse * exp(-abs(uv.y - 0.5) * 900.0) * step(abs(uv.x - 0.5), 0.5 * (1.0 - collapse * 0.4)) * 0.8;
  col *= gain * power * boost * inside * drop * mask;
  vec3 N = normalize(vVN); vec3 V = normalize(-vVP);
  if (!gl_FrontFacing) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fr = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
  vec3 R = normalize((vec4(reflect(-V, N), 0.0) * viewMatrix).xyz);
  vec3 env = mix(vec3(0.004, 0.0045, 0.005), vec3(0.03, 0.032, 0.034), smoothstep(-0.3, 0.9, R.y));
#ifdef USE_ENV
  env = textureLod(envMap, R, envLod).rgb;
#endif
  vec3 rc = env * envIntensity * envTint * fr * refl;
  float cap = reflCap * mix(1.0, 0.6, step(0.001, power));
  rc = cap * (1.0 - exp(-rc / cap));
  col += rc;
  gl_FragColor = vec4(col, 1.0);
}`;

let seedN = 1;

export function createDisplay(kind = 'text', { width = 0.2, height = 0.15, resolution, envMap = null, envIntensity = null, compact = null } = {}) {
  let rw, rh;
  if (Array.isArray(resolution)) [rw, rh] = resolution;
  else { rw = resolution || clamp(Math.round(width * 3600 / 16) * 16, 256, 1024); rh = Math.round(rw * height / width); }
  const canvas = document.createElement('canvas');
  canvas.width = rw; canvas.height = rh;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, rw, rh);
  const pen = new Pen(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  const uniforms = {
    map: { value: texture }, res: { value: new THREE.Vector2(rw, rh) }, power: { value: 0 }, openX: { value: 0 }, openY: { value: 0 },
    glitch: { value: 0 }, time: { value: 0 }, gain: { value: 2.1 }, curve: { value: 0.035 }, scan: { value: 0.32 }, refl: { value: 0.25 }, seed: { value: (seedN++ * 17.13) % 97 },
    envIntensity: { value: envIntensity ?? 1 }, reflCap: { value: 0.022 },
    glowTint: { value: new THREE.Color(0.18, 0.9, 1.0) }, phos: { value: new THREE.Color(0.66, 1.0, 1.04) }, envTint: { value: new THREE.Color(1, 1, 1) },
    blackLevel: { value: new THREE.Color(0.0, 0.0062, 0.0076) },
    envMap: { value: null }, envLod: { value: 3 },
  };
  let autoEnv = envIntensity == null;
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, defines: {} });
  material.onBeforeRender = (r, scene) => { if (autoEnv && scene) uniforms.envIntensity.value = scene.environmentIntensity ?? 1; };
  const useEnv = env => {
    const on = !!(env && (env.isCubeTexture || env.mapping === THREE.CubeReflectionMapping || env.image?.depth === 6 || env.isRenderTargetTexture));
    uniforms.envMap.value = on ? env : null;
    if (on) { const sz = env.image?.width || env.image?.[0]?.width || 256; uniforms.envLod.value = Math.max(1, Math.log2(sz) * 0.42); }
    if (on !== ('USE_ENV' in material.defines)) { if (on) material.defines.USE_ENV = ''; else delete material.defines.USE_ENV; material.needsUpdate = true; }
  };
  useEnv(envMap);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = `display:${kind}`;
  const scale = rh / L, W = rw / scale;
  let target = kind === 'dead' ? 0 : 1, level = 0, openT = 0, glitchV = 0, drawnOnce = false;
  const d = {
    kind, texture, material, mesh, canvas, state: {}, meta: {}, managed: false, width, height,
    uploadBytes: Math.round(rw * rh * 4 * 1.33), compact: compact ?? height < 0.13,
    dirty: true, _t: 0, _last: -1, _next: 0, _bootT: 0, _scroll: null, _scrollTarget: 0, _host: null, _sig: '',
    mount(slot) {
      const host = slot.mesh || slot.object || slot;
      const w = slot.width || width, h = slot.height || height;
      host.updateMatrixWorld?.();
      const geo = host.geometry;
      let thin = false;
      if (geo && geo.attributes?.uv) {
        geo.computeBoundingBox();
        const s = new THREE.Vector3(); geo.boundingBox.getSize(s);
        thin = s.z < 1e-4 * Math.max(s.x, s.y, 1e-6) || geo.type === 'PlaneGeometry';
      }
      if (thin && host.isMesh) {
        d._prevMaterial = host.material; host.material = material; d.mesh = host;
      } else {
        if (w !== width || h !== height) { mesh.geometry.dispose(); mesh.geometry = new THREE.PlaneGeometry(w, h); }
        const z = geo?.boundingBox ? geo.boundingBox.max.z + 0.0006 : 0.0006;
        mesh.position.set(0, 0, z); mesh.rotation.set(0, 0, 0);
        host.add(mesh); d.mesh = mesh;
      }
      if (compact == null) d.compact = h < 0.13;
      d._host = host; d.slot = slot;
      if (slot.kind && slot.kind !== d.kind && DRAW[slot.kind] && d.kind === 'text' && !Object.keys(d.state).length) d.setKind(slot.kind);
      return d;
    },
    setKind(k, st = {}) {
      d.kind = DRAW[k] ? k : 'text';
      d.state = { ...st };
      d._sig = sigOf(d.state);
      d._scroll = null; d.meta = {}; d._hist = null;
      if (d.kind === 'boot') d._bootT = 0;
      if (d.kind === 'dead') target = 0;
      d.dirty = true;
      return d;
    },
    setState(partial = {}) {
      if (partial.kind && partial.kind !== d.kind) { const { kind: k, ...rest } = partial; return d.setKind(k, rest); }
      if (d.kind === 'boot' && partial.start) { d._bootT = 0; d.dirty = true; }
      Object.assign(d.state, partial);
      const sg = sigOf(d.state);
      if (sg !== d._sig) { d._sig = sg; d.dirty = true; }
      return d;
    },
    setPower(v) { const nt = d.kind === 'dead' ? 0 : clamp(v, 0, 1); if (nt !== target) { target = nt; d.dirty = true; } return d; },
    setGlitch(v) { glitchV = clamp(v, 0, 1); uniforms.glitch.value = glitchV; return d; },
    setReflection(strength = 0.25, color, envMap, envI) {
      uniforms.refl.value = strength;
      if (color) uniforms.envTint.value.set(color);
      if (envMap !== undefined) useEnv(envMap);
      if (typeof envI === 'number') { autoEnv = false; uniforms.envIntensity.value = envI; } else if (envI === null) autoEnv = true;
      return d;
    },
    setCompact(v) { d.compact = v == null ? d.height < 0.13 : !!v; d.dirty = true; return d; },
    get power() { return level; },
    hz() {
      const a = glitchV > 0.15 ? 10 : (ANIM_HZ[d.kind]?.(d.state) || 0);
      return d._scroll != null && Math.abs(d._scroll - d._scrollTarget) > 0.01 ? Math.max(a, 20) : a;
    },
    wantsDraw(now) {
      if (!fontOK) return false;
      if (level < 0.002 && target === 0 && drawnOnce) return false;
      if (d.dirty && now - d._last >= 0.09) return true;
      const hz = d.hz();
      return hz > 0 && now >= d._next;
    },
    draw() {
      if (!fontOK) return;
      const t = d._t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, rw, rh);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
      pen.f = '';
      if (d._scroll != null) d._scroll += (d._scrollTarget - d._scroll) * Math.min(1, (t - (d._drawT ?? t)) * 10 + 0.05);
      d._drawT = t;
      const useCompact = (d.state.compact ?? d.compact) && d.kind !== 'boot';
      const cr = useCompact ? compactRows(d.kind, d.state) : null;
      try { if (cr) drawCompact(pen, W, L, cr, t); else DRAW[d.kind](pen, W, L, d.state, t, d); } catch (e) { console.error('display draw', d.kind, e); d.kind = 'text'; }
      if (glitchV > 0.2) {
        const n = Math.floor(glitchV * 7);
        for (let i = 0; i < n; i++) {
          const y = Math.random() * L, h = 4 + Math.random() * 16;
          if (Math.random() < 0.5) { pen.fill(0, y, W, h, C.bg); pen.text('#'.repeat(3 + Math.floor(Math.random() * 20)).replace(/#/g, () => String.fromCharCode(48 + Math.floor(Math.random() * 42))), Math.random() * W * 0.5, y + h / 2, 12, C.fg, 'left', true); }
          else pen.fill(Math.random() * W, y, Math.random() * W * 0.4, h * 0.4, C.fg);
        }
      }
      texture.needsUpdate = true;
      d.dirty = false;
      drawnOnce = true;
    },
    update(dt) {
      d._t += dt;
      if (d.kind === 'boot') {
        d._bootT += dt;
        const dur = d.state.duration || 4.5;
        if (d._bootT > dur + 0.5 && d.state.next) {
          const { next, nextState, onDone } = d.state;
          d.setKind(next, nextState || {});
          onDone?.(d);
        }
      }
      const prev = level;
      level += (target - level) * Math.min(1, dt * (target > level ? 3.5 : 7));
      if (Math.abs(target - level) < 0.002) level = target;
      if (target > 0 && prev === 0) openT = 0;
      openT = target > 0 ? openT + dt : Math.max(0, openT - dt * 3);
      uniforms.openX.value = smooth(clamp(openT / 0.18, 0, 1));
      uniforms.openY.value = smooth(clamp((openT - 0.12) / 0.3, 0, 1)) * 0.997 + 0.003;
      uniforms.power.value = level * (target > 0 && openT < 0.7 ? 1 + 0.6 * Math.exp(-openT * 6) : 1);
      uniforms.time.value = d._t;
      if (!d.managed && d.wantsDraw(d._t)) { d.draw(); d._last = d._t; d._next = d._t + 1 / Math.max(1, d.hz()); }
    },
    dispose() {
      texture.dispose(); material.dispose(); mesh.geometry.dispose();
      if (d._prevMaterial && d._host) d._host.material = d._prevMaterial;
      if (mesh.parent) mesh.parent.remove(mesh);
    },
  };
  if (!DRAW[d.kind]) d.kind = 'text';
  if (kind === 'boot') d._bootT = 0;
  return d;
}

export function createDisplayManager({ engine, budgetMs = 0.9, maxDistance = 6 } = {}) {
  const list = [];
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), cp = new THREE.Vector3(), tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const stats = { ms: 0, avgMs: 0, peakMs: 0, draws: 0, visible: 0, frames: 0, uploadKB: 0, avgUploadKB: 0 };
  let now = 0;
  const visible = d => {
    const m = d.mesh;
    if (!m) return false;
    m.getWorldPosition(wp);
    if (wp.distanceTo(cp) > (d.maxDistance || maxDistance)) return false;
    nrm.setFromMatrixColumn(m.matrixWorld, 2).normalize();
    if (nrm.dot(tmp.copy(cp).sub(wp)) < 0) return false;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    return frustum.intersectsObject(m);
  };
  return {
    engine, stats, displays: list,
    add(d) {
      d.managed = true; d._next = now + Math.random() * 0.12; list.push(d);
      if (fontOK) { d.draw(); d._last = now; try { engine?.renderer?.initTexture?.(d.texture); } catch (e) { } }
      return d;
    },
    remove(d) { const i = list.indexOf(d); if (i >= 0) list.splice(i, 1); d.managed = false; },
    prewarm() { for (const d of list) { d.draw(); try { engine?.renderer?.initTexture?.(d.texture); } catch (e) { } } },
    update(dt, camera) {
      now += dt;
      for (const d of list) d.update(dt);
      if (camera) {
        camera.updateMatrixWorld();
        m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(m4);
        camera.getWorldPosition(cp);
      }
      const due = [];
      let vis = 0;
      for (const d of list) {
        if (camera && !visible(d)) continue;
        vis++;
        if (d.wantsDraw(now)) due.push(d);
      }
      due.sort((a, b) => (b.dirty - a.dirty) || (a._next - b._next));
      const t0 = performance.now();
      let n = 0, ms = 0, up = 0;
      for (const d of due) {
        if (n > 0 && ms > budgetMs) break;
        d.draw();
        up += d.uploadBytes;
        const hz = Math.max(1, d.hz());
        d._last = now;
        d._next = Math.max(d._next + 1 / hz, now + 0.5 / hz);
        n++;
        ms = performance.now() - t0;
      }
      stats.ms = ms; stats.draws = n; stats.visible = vis; stats.frames++;
      stats.uploadKB = up / 1024;
      stats.avgMs += (ms - stats.avgMs) * 0.05;
      stats.avgUploadKB += (stats.uploadKB - stats.avgUploadKB) * 0.05;
      stats.peakMs = Math.max(stats.peakMs * 0.995, ms);
    },
  };
}
