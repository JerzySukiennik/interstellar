// Shared exterior hull material library: procedural cached canvas textures (albedo, roughness, normal) mapped in metres, plus UV and decal helpers.
import * as THREE from 'three';

export const HULL_PERIOD = { white: 6, whitePlain: 3, blanket: 2.4, tile: 3.2, frame: 4, metal: 1.5, radiator: 1, engine: 2 };

const CACHE = new Map();

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tileNoise(size, period, octaves, seed, persistence = 0.5) {
  const out = new Float32Array(size * size);
  const R = rng(seed);
  let amp = 1, total = 0, p = period;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    const s = p / size;
    for (let y = 0; y < size; y++) {
      const fy = y * s, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % p) * p, r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x * s, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % p, c1 = (x0 + 1) % p;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp; amp *= persistence; p *= 2;
    if (p > size) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function heightToNormal(height, size, strength = 2) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const m = size - 1;
  for (let y = 0; y < size; y++) {
    const yu = ((y - 1) & m) * size, yd = ((y + 1) & m) * size, yc = y * size;
    for (let x = 0; x < size; x++) {
      const xl = (x - 1) & m, xr = (x + 1) & m;
      const dx = (height[yc + xr] - height[yc + xl]) * strength;
      const dy = (height[yu + x] - height[yd + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (yc + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function readHeight(canvas) {
  const s = canvas.width;
  const d = canvas.getContext('2d').getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}

export function wrapDraw(size, x, y, r, fn) {
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const px = x + ox * size, py = y + oy * size;
    if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
    fn(px, py);
  }
}

export function subdividePanels(R, w, h, { maxW, maxH, minS, splitP = 0.35 }) {
  const out = [];
  const rec = (x, y, rw, rh, depth) => {
    const must = rw > maxW || rh > maxH;
    if (!must && (depth > 6 || R() > splitP || (rw < minS * 2 && rh < minS * 2))) { out.push([x, y, rw, rh]); return; }
    const vert = rw / rh > 1.15 ? true : rh / rw > 1.15 ? false : R() < 0.5;
    const len = vert ? rw : rh;
    if (len < minS * 2) { out.push([x, y, rw, rh]); return; }
    const t = Math.max(minS, Math.min(len - minS, len * (0.28 + R() * 0.44)));
    if (vert) { rec(x, y, t, rh, depth + 1); rec(x + t, y, rw - t, rh, depth + 1); }
    else { rec(x, y, rw, t, depth + 1); rec(x, y + t, rw, rh - t, depth + 1); }
  };
  rec(0, 0, w, h, 0);
  return out;
}

export function drawPanelLines(ctx, panels, { width = 2, color = '#000', inset = 0 }) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (const [x, y, w, h] of panels) ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
}

export function drawRivetRow(ctx, x0, y0, x1, y1, spacing, radius, fill) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / spacing));
  ctx.fillStyle = fill;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function texFrom(canvas, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.repeat.set(1 / repeat, 1 / repeat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function grayToCanvas(values, size, lo, hi) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(255, (lo + (hi - lo) * values[i]) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function buildWhite(S) {
  const R = rng(2101);
  const k = S / HULL_PERIOD.white;
  const alb = makeCanvas(S), rough = makeCanvas(S), hgt = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d'), h = hgt.getContext('2d');
  a.fillStyle = 'rgb(234,233,230)'; a.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(140,140,140)'; r.fillRect(0, 0, S, S);
  h.fillStyle = 'rgb(160,160,160)'; h.fillRect(0, 0, S, S);
  const panels = subdividePanels(R, S, S, { maxW: 1.3 * k, maxH: 0.9 * k, minS: 0.18 * k, splitP: 0.6 });
  for (const [x, y, w, hh] of panels) {
    const tone = (R() - 0.5) * 22;
    a.fillStyle = `rgb(${234 + tone},${233 + tone},${230 + tone})`;
    a.fillRect(x, y, w, hh);
    const rv = 128 + (R() - 0.5) * 40;
    r.fillStyle = `rgb(${rv},${rv},${rv})`; r.fillRect(x, y, w, hh);
    const hv = 160 + (R() - 0.5) * 10;
    h.fillStyle = `rgb(${hv},${hv},${hv})`; h.fillRect(x, y, w, hh);
    if (R() < 0.18 && w > 0.5 * k && hh > 0.4 * k) {
      const iw = w * (0.3 + R() * 0.4), ih = hh * (0.3 + R() * 0.4);
      const ix = x + (w - iw) * R(), iy = y + (hh - ih) * R();
      h.strokeStyle = 'rgb(110,110,110)'; h.lineWidth = Math.max(1, 0.005 * k); h.strokeRect(ix, iy, iw, ih);
      a.strokeStyle = 'rgba(68,68,66,0.55)'; a.lineWidth = Math.max(1, 0.004 * k); a.strokeRect(ix, iy, iw, ih);
      const fr = 0.007 * k;
      for (const [fx, fy] of [[ix + fr * 2, iy + fr * 2], [ix + iw - fr * 2, iy + fr * 2], [ix + fr * 2, iy + ih - fr * 2], [ix + iw - fr * 2, iy + ih - fr * 2]]) {
        a.fillStyle = 'rgba(116,116,114,0.9)'; a.beginPath(); a.arc(fx, fy, fr, 0, 7); a.fill();
        h.fillStyle = 'rgb(150,150,150)'; h.beginPath(); h.arc(fx, fy, fr, 0, 7); h.fill();
      }
    }
  }
  const sw = Math.max(1.5, 0.006 * k);
  drawPanelLines(h, panels, { width: sw * 1.4, color: 'rgb(40,40,40)' });
  drawPanelLines(a, panels, { width: sw, color: 'rgba(58,58,57,0.9)' });
  drawPanelLines(a, panels, { width: sw * 0.7, color: 'rgba(250,248,240,0.35)', inset: sw * 1.1 });
  drawPanelLines(r, panels, { width: sw * 1.6, color: 'rgb(200,200,200)' });
  const rs = 0.07 * k, rr = Math.max(1, 0.0045 * k), off = 0.022 * k;
  for (const [x, y, w, hh] of panels) {
    if (R() < 0.6) {
      const yy = y + off;
      drawRivetRow(a, x + off, yy, x + w - off, yy, rs, rr, 'rgba(108,108,106,0.9)');
      drawRivetRow(h, x + off, yy, x + w - off, yy, rs, rr, 'rgb(185,185,185)');
    }
    if (R() < 0.35) {
      const xx = x + off;
      drawRivetRow(a, xx, y + off, xx, y + hh - off, rs, rr, 'rgba(108,108,106,0.9)');
      drawRivetRow(h, xx, y + off, xx, y + hh - off, rs, rr, 'rgb(185,185,185)');
    }
  }
  for (let i = 0; i < 420; i++) {
    const x = R() * S, y = R() * S, len = (0.1 + R() * 1.2) * k, wdt = (0.005 + R() * 0.05) * k;
    const al = 0.03 + R() * 0.08;
    wrapDraw(S, x, y + len / 2, len, (px, py) => {
      const g = a.createLinearGradient(px, py, px, py + len);
      g.addColorStop(0, `rgba(88,88,86,${al})`); g.addColorStop(1, 'rgba(88,88,86,0)');
      a.fillStyle = g; a.fillRect(px - wdt / 2, py, wdt, len);
      r.fillStyle = `rgba(210,210,210,${al * 1.5})`; r.fillRect(px - wdt / 2, py, wdt, len * 0.6);
    });
  }
  for (let i = 0; i < 260; i++) {
    const x = R() * S, y = R() * S, rad = (0.004 + R() * 0.03) * k;
    wrapDraw(S, x, y, rad * 3, (px, py) => {
      { const g0 = 78 + R() * 36; a.fillStyle = `rgba(${g0},${g0},${g0 - 2},${0.05 + R() * 0.15})`; }
      a.beginPath(); a.ellipse(px, py, rad * (1 + R() * 2), rad, R() * 3, 0, 7); a.fill();
    });
  }
  const n = tileNoise(S / 4, 6, 5, 77);
  const nc = grayToCanvas(n, S / 4, 0, 1);
  a.globalCompositeOperation = 'multiply'; a.globalAlpha = 0.22; a.drawImage(nc, 0, 0, S, S);
  a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1;
  r.globalAlpha = 0.25; r.drawImage(nc, 0, 0, S, S); r.globalAlpha = 1;
  const height = readHeight(hgt);
  const fine = tileNoise(S, S / 4, 1, 99);
  for (let i = 0; i < height.length; i++) height[i] += fine[i] * 0.012;
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 3.2) };
}

function buildTile(S) {
  const R = rng(1414);
  const k = S / HULL_PERIOD.tile;
  const tile = 0.1 * k, gap = Math.max(1.5, 0.004 * k);
  const n = Math.round(S / tile);
  const ts = S / n;
  const alb = makeCanvas(S), rough = makeCanvas(S), hgt = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d'), h = hgt.getContext('2d');
  a.fillStyle = 'rgb(14,14,15)'; a.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(230,230,230)'; r.fillRect(0, 0, S, S);
  h.fillStyle = 'rgb(30,30,30)'; h.fillRect(0, 0, S, S);
  const big = new Float32Array(64);
  for (let i = 0; i < 64; i++) big[i] = R();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const zone = big[(Math.floor(i / n * 8) % 8) * 8 + (Math.floor(j / n * 8) % 8)];
    const v = 34 + (R() - 0.5) * 5 + zone * 5;
    a.fillStyle = `rgb(${v},${v},${v + 1.5})`;
    a.fillRect(i * ts + gap / 2, j * ts + gap / 2, ts - gap, ts - gap);
    const rv = 135 + R() * 28 + zone * 18;
    r.fillStyle = `rgb(${rv},${rv},${rv})`;
    r.fillRect(i * ts + gap / 2, j * ts + gap / 2, ts - gap, ts - gap);
    const g = h.createRadialGradient(i * ts + ts / 2, j * ts + ts / 2, ts * 0.25, i * ts + ts / 2, j * ts + ts / 2, ts * 0.72);
    const hv = 175 + (R() - 0.5) * 30;
    g.addColorStop(0, `rgb(${hv},${hv},${hv})`); g.addColorStop(1, 'rgb(120,120,120)');
    h.fillStyle = g;
    h.fillRect(i * ts + gap / 2, j * ts + gap / 2, ts - gap, ts - gap);
  }
  const seam = ts * 8;
  h.strokeStyle = 'rgb(0,0,0)'; h.lineWidth = gap * 2.5;
  a.strokeStyle = 'rgb(8,8,9)'; a.lineWidth = gap * 2;
  for (let p = 0; p <= S; p += seam) {
    for (const c of [h, a]) { c.beginPath(); c.moveTo(p, 0); c.lineTo(p, S); c.moveTo(0, p); c.lineTo(S, p); c.stroke(); }
  }
  const height = readHeight(hgt);
  const sp = tileNoise(S, S / 2, 1, 5);
  const ad = a.getImageData(0, 0, S, S);
  for (let i = 0; i < height.length; i++) {
    height[i] += sp[i] * 0.05;
    const s = sp[i] > 0.92 ? 14 : 0;
    ad.data[i * 4] += s; ad.data[i * 4 + 1] += s; ad.data[i * 4 + 2] += s;
  }
  a.putImageData(ad, 0, 0);
  for (let i = 0; i < 120; i++) {
    const x = R() * S, y = R() * S, len = (0.3 + R() * 1.2) * k, w = (0.02 + R() * 0.1) * k;
    wrapDraw(S, x, y + len / 2, len, (px, py) => {
      a.fillStyle = `rgba(70,66,60,${0.03 + R() * 0.05})`; a.fillRect(px - w / 2, py, w, len);
    });
  }
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 2.6) };
}

function buildFrame(S) {
  const R = rng(3131);
  const k = S / HULL_PERIOD.frame;
  const alb = makeCanvas(S), rough = makeCanvas(S), hgt = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d'), h = hgt.getContext('2d');
  const n = tileNoise(S / 2, 8, 5, 31);
  const nc = grayToCanvas(n, S / 2, 0, 1);
  a.fillStyle = 'rgb(46,47,50)'; a.fillRect(0, 0, S, S);
  a.globalAlpha = 0.035; a.globalCompositeOperation = 'lighter'; a.drawImage(nc, 0, 0, S, S); a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1;
  r.drawImage(grayToCanvas(n, S / 2, 0.4, 0.5), 0, 0, S, S);
  h.fillStyle = 'rgb(160,160,160)'; h.fillRect(0, 0, S, S);
  const panels = subdividePanels(R, S, S, { maxW: 2.2 * k, maxH: 2.2 * k, minS: 0.5 * k, splitP: 0.3 });
  drawPanelLines(h, panels, { width: Math.max(1.5, 0.006 * k), color: 'rgb(60,60,60)' });
  drawPanelLines(a, panels, { width: Math.max(1, 0.004 * k), color: 'rgba(6,6,7,0.9)' });
  for (let i = 0; i < 90; i++) {
    const x = R() * S, y = R() * S, l = (0.02 + R() * 0.2) * k, ang = R() * Math.PI;
    a.strokeStyle = `rgba(90,92,96,${0.08 + R() * 0.15})`; a.lineWidth = 1;
    a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); a.stroke();
  }
  const height = readHeight(hgt);
  const fine = tileNoise(S, S / 4, 1, 44);
  for (let i = 0; i < height.length; i++) height[i] += fine[i] * 0.015;
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 2.4) };
}

function buildMetal(S) {
  const R = rng(5151);
  const alb = makeCanvas(S), rough = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d');
  a.fillStyle = 'rgb(168,170,174)'; a.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(85,85,85)'; r.fillRect(0, 0, S, S);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    let v = 0;
    const base = R();
    for (let x = 0; x < S; x++) { v = v * 0.985 + (R() - 0.5) * 0.15; height[y * S + x] = base * 0.5 + v * 0.5; }
  }
  for (let i = 0; i < 1200; i++) {
    const y = R() * S, x = R() * S, len = 20 + R() * S * 0.5, l = 140 + R() * 60;
    a.fillStyle = `rgba(${l},${l + 2},${l + 5},${0.05 + R() * 0.1})`; a.fillRect(x, y, len, 1);
    const rv = 60 + R() * 70; r.fillStyle = `rgba(${rv},${rv},${rv},0.35)`; r.fillRect(x, y, len, 1 + R() * 2);
    if (x + len > S) { a.fillRect(x - S, y, len, 1); r.fillRect(x - S, y, len, 2); }
  }
  const n = tileNoise(S / 4, 4, 4, 51);
  r.globalAlpha = 0.3; r.drawImage(grayToCanvas(n, S / 4, 0.2, 0.55), 0, 0, S, S); r.globalAlpha = 1;
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 0.6) };
}

function buildRadiator(S) {
  const k = S / HULL_PERIOD.radiator;
  const pitch = Math.max(6, Math.round(0.03 * k));
  const n = Math.round(S / pitch), p = S / n;
  const alb = makeCanvas(S), rough = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d');
  const height = new Float32Array(S * S);
  const R = rng(6161);
  const cell = S / 8;
  const prof = new Float32Array(S);
  for (let y = 0; y < S; y++) { const t = (y % p) / p; prof[y] = t < 0.72 ? Math.sin(t / 0.72 * Math.PI) : 0; }
  a.fillStyle = 'rgb(38,39,42)'; a.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(105,105,105)'; r.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    const pr = prof[y];
    for (let x = 0; x < S; x++) {
      const cx = x % cell;
      const edge = cx < cell * 0.04 || cx > cell * 0.96 ? 0 : 1;
      height[y * S + x] = pr * edge;
    }
    if (prof[y] > 0) {
      const l = 70 + prof[y] * 75 + (R() - 0.5) * 6;
      a.fillStyle = `rgb(${l},${l + 1},${l + 3})`;
      for (let c = 0; c < 8; c++) a.fillRect(c * cell + cell * 0.04, y, cell * 0.92, 1);
    }
  }
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 3) };
}

function buildEngine(S) {
  const alb = makeCanvas(S), rough = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d');
  const n = tileNoise(S / 2, 4, 5, 717);
  const img = a.createImageData(S / 2, S / 2);
  for (let y = 0; y < S / 2; y++) for (let x = 0; x < S / 2; x++) {
    const i = y * S / 2 + x;
    const t = (y / (S / 2) + n[i] * 0.5) % 1;
    const band = 0.5 + 0.5 * Math.sin(t * Math.PI * 4);
    const c0 = [74, 68, 62], c1 = [92, 70, 52], c2 = [52, 58, 78];
    const m = band, b2 = n[i];
    img.data[i * 4] = c0[0] * (1 - m) + (c1[0] * (1 - b2) + c2[0] * b2) * m;
    img.data[i * 4 + 1] = c0[1] * (1 - m) + (c1[1] * (1 - b2) + c2[1] * b2) * m;
    img.data[i * 4 + 2] = c0[2] * (1 - m) + (c1[2] * (1 - b2) + c2[2] * b2) * m;
    img.data[i * 4 + 3] = 255;
  }
  const half = makeCanvas(S / 2);
  half.getContext('2d').putImageData(img, 0, 0);
  a.drawImage(half, 0, 0, S, S);
  r.drawImage(grayToCanvas(n, S / 2, 0.3, 0.6), 0, 0, S, S);
  const height = tileNoise(S, 32, 3, 718);
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 1.2) };
}

export function createDecalAtlas(size = 1024) {
  const c = makeCanvas(size);
  const x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  const cell = size / 4;
  const font = (px, w = 700) => `${w} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  x.fillStyle = 'rgba(28,28,30,0.92)';
  x.font = font(cell * 0.42); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('RF-31D', cell * 1, cell * 0.5);
  x.font = font(cell * 0.2, 600);
  x.fillText('NO STEP', cell * 2.5, cell * 0.3);
  x.fillText('RESCUE', cell * 3.5, cell * 0.3);
  x.font = font(cell * 0.075, 600);
  x.fillText('CAUTION  HOT EXHAUST', cell * 2.5, cell * 0.72);
  x.fillText('PUSH TO OPEN', cell * 3.5, cell * 0.72);
  for (let i = 0; i < 10; i++) {
    x.fillStyle = i % 2 ? 'rgba(20,20,20,0.95)' : 'rgba(214,168,30,0.95)';
    x.beginPath(); const s = cell / 5;
    x.moveTo(i * s * 0.5, cell); x.lineTo(i * s * 0.5 + s * 0.5, cell); x.lineTo(i * s * 0.5 + s * 0.5 - cell * 0.4, cell * 2); x.lineTo(i * s * 0.5 - cell * 0.4, cell * 2); x.fill();
  }
  x.save(); x.beginPath(); x.rect(0, cell, cell, cell); x.clip();
  for (let i = -4; i < 12; i++) { x.fillStyle = i % 2 ? '#1a1a1a' : '#d9a91c'; x.beginPath(); x.moveTo(i * cell / 6, cell); x.lineTo(i * cell / 6 + cell / 12, cell); x.lineTo(i * cell / 6 + cell / 12 + cell, cell * 2); x.lineTo(i * cell / 6 + cell, cell * 2); x.fill(); }
  x.restore();
  const fx = cell, fy = cell * 1.2, fw = cell * 0.9, fh = cell * 0.6;
  for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? '#e8e8e8' : '#a8272d'; x.fillRect(fx, fy + i * fh / 13, fw, fh / 13 + 0.5); }
  x.fillStyle = '#26365e'; x.fillRect(fx, fy, fw * 0.42, fh * 7 / 13);
  x.fillStyle = '#e8e8e8';
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(fx + 6 + i * fw * 0.08, fy + 6 + j * fh * 0.1, 1.6, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(28,28,30,0.9)'; x.lineWidth = 3;
  x.beginPath(); x.arc(cell * 2.5, cell * 1.5, cell * 0.32, 0, 7); x.stroke();
  x.font = font(cell * 0.11, 600); x.fillStyle = 'rgba(28,28,30,0.9)'; x.fillText('AIRLOCK', cell * 2.5, cell * 1.5);
  x.fillStyle = 'rgba(206,120,34,0.95)'; x.fillRect(cell * 3.08, cell * 1.38, cell * 0.84, cell * 0.24);
  x.fillStyle = 'rgba(20,20,20,0.95)'; x.font = font(cell * 0.1, 700); x.fillText('FUEL CELL VENT', cell * 3.5, cell * 1.5);
  x.fillStyle = 'rgba(28,28,30,0.85)'; x.font = font(cell * 0.06, 500); x.textAlign = 'left';
  const lines = ['RCS QUAD B  P/N 31D-4410', 'SERVICE PANEL  TORQUE 14 NM', 'DO NOT PAINT  SENSOR', 'GND PWR  28 VDC', 'O2 FILL  MAX 3000 PSI', 'N2O4  OXIDIZER'];
  lines.forEach((l, i) => x.fillText(l, cell * 0.08, cell * 2.1 + i * cell * 0.13));
  x.strokeStyle = 'rgba(28,28,30,0.85)'; x.lineWidth = 2;
  for (let i = 0; i < 6; i++) x.strokeRect(cell * 1.1 + (i % 3) * cell * 0.3, cell * 2.15 + Math.floor(i / 3) * cell * 0.35, cell * 0.22, cell * 0.22);
  x.fillStyle = 'rgba(28,28,30,0.9)';
  x.beginPath(); x.moveTo(cell * 2.5, cell * 2.1); x.lineTo(cell * 2.85, cell * 2.75); x.lineTo(cell * 2.15, cell * 2.75); x.fill();
  x.fillStyle = 'rgba(214,168,30,1)';
  x.beginPath(); x.moveTo(cell * 2.5, cell * 2.2); x.lineTo(cell * 2.77, cell * 2.7); x.lineTo(cell * 2.23, cell * 2.7); x.fill();
  x.fillStyle = 'rgba(28,28,30,0.9)'; x.font = font(cell * 0.3, 800); x.textAlign = 'center'; x.fillText('!', cell * 2.5, cell * 2.52);
  x.fillStyle = 'rgba(28,28,30,0.9)';
  x.beginPath(); x.arc(cell * 3.5, cell * 2.5, cell * 0.3, 0, 7); x.fill();
  x.fillStyle = 'rgba(226,222,211,1)'; x.font = font(cell * 0.09, 700); x.fillText('RANGER 2', cell * 3.5, cell * 2.5);
  return c;
}

export const DECAL_CELLS = {
  callsign: [0, 0, 2, 1], noStep: [2, 0, 1, 0.5], rescue: [3, 0, 1, 0.5], hotExhaust: [2, 0.5, 1, 0.5], pushOpen: [3, 0.5, 1, 0.5],
  stripes: [0, 1, 1, 1], flag: [1, 1, 1, 0.75], airlock: [2, 1, 1, 1], vent: [3, 1.3, 1, 0.4],
  stencil: [0, 2, 1, 1], boxes: [1, 2, 1, 1], warning: [2, 2, 1, 1], roundel: [3, 2, 1, 1],
};

export function decalUV(cell) {
  const [cx, cy, cw, ch] = DECAL_CELLS[cell];
  return [cx / 4, 1 - (cy + ch) / 4, (cx + cw) / 4, 1 - cy / 4];
}

export function boxProjectUV(geometry, { scale = 1, offset = [0, 0], rotate = 0 } = {}) {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const c = Math.cos(rotate), s = Math.sin(rotate);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = (u * c - v * s) * scale + offset[0];
    uv[i * 2 + 1] = (u * s + v * c) * scale + offset[1];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}


function buildWhitePlain(S) {
  const R = rng(2202);
  const k = S / HULL_PERIOD.whitePlain;
  const alb = makeCanvas(S), rough = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d');
  a.fillStyle = 'rgb(234,233,230)'; a.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(132,132,132)'; r.fillRect(0, 0, S, S);
  const n = tileNoise(S / 4, 4, 5, 2203);
  const nc = grayToCanvas(n, S / 4, 0, 1);
  a.globalCompositeOperation = 'multiply'; a.globalAlpha = 0.16; a.drawImage(nc, 0, 0, S, S);
  a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1;
  r.globalAlpha = 0.3; r.drawImage(nc, 0, 0, S, S); r.globalAlpha = 1;
  for (let i = 0; i < 520; i++) {
    const x = R() * S, y = R() * S, len = (0.05 + R() * 0.9) * k, wdt = (0.003 + R() * 0.03) * k;
    const al = 0.025 + R() * 0.07;
    wrapDraw(S, x, y + len / 2, len, (px, py) => {
      const g = a.createLinearGradient(px, py, px, py + len);
      g.addColorStop(0, `rgba(86,86,84,${al})`); g.addColorStop(1, 'rgba(86,86,84,0)');
      a.fillStyle = g; a.fillRect(px - wdt / 2, py, wdt, len);
      r.fillStyle = `rgba(205,205,205,${al * 1.4})`; r.fillRect(px - wdt / 2, py, wdt, len * 0.6);
    });
  }
  for (let i = 0; i < 700; i++) {
    const x = R() * S, y = R() * S, rad = (0.002 + R() * 0.018) * k;
    wrapDraw(S, x, y, rad * 3, (px, py) => {
      { const g0 = 80 + R() * 36; a.fillStyle = `rgba(${g0},${g0},${g0 - 2},${0.04 + R() * 0.14})`; }
      a.beginPath(); a.ellipse(px, py, rad * (1 + R() * 2), rad, R() * 3, 0, 7); a.fill();
    });
  }
  for (let i = 0; i < 140; i++) {
    const x = R() * S, y = R() * S, l = (0.01 + R() * 0.12) * k, ang = R() * Math.PI;
    a.strokeStyle = `rgba(250,248,242,${0.1 + R() * 0.2})`; a.lineWidth = 1;
    a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); a.stroke();
  }
  const h = tileNoise(S, S / 4, 1, 2204);
  const d = tileNoise(S / 2, 16, 3, 2205);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = h[y * S + x] * 0.012 + d[(y >> 1) * (S / 2) + (x >> 1)] * 0.05;
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(h, S, 3.0) };
}

function buildBlanket(S) {
  const R = rng(4404);
  const k = S / HULL_PERIOD.blanket;
  const alb = makeCanvas(S), rough = makeCanvas(S), hgt = makeCanvas(S);
  const a = alb.getContext('2d'), r = rough.getContext('2d'), h = hgt.getContext('2d');
  a.fillStyle = 'rgb(40,41,43)'; a.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(160,160,160)'; r.fillRect(0, 0, S, S);
  h.fillStyle = 'rgb(40,40,40)'; h.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S - 1) {
    const rh = Math.min(S - y, Math.round((0.14 + R() * 0.22) * k));
    let x = -Math.round(R() * 0.2 * k);
    while (x < S) {
      const rw = Math.round((0.18 + R() * 0.32) * k);
      const tone = 40 + R() * 16, rv = 110 + R() * 90;
      a.fillStyle = `rgb(${tone},${tone + 1},${tone + 3})`; a.fillRect(x + 2, y + 2, rw - 4, rh - 4);
      r.fillStyle = `rgb(${rv},${rv},${rv})`; r.fillRect(x + 2, y + 2, rw - 4, rh - 4);
      const g = h.createRadialGradient(x + rw / 2, y + rh / 2, 0, x + rw / 2, y + rh / 2, Math.max(rw, rh) * 0.62);
      g.addColorStop(0, 'rgb(220,220,220)'); g.addColorStop(0.7, 'rgb(170,170,170)'); g.addColorStop(1, 'rgb(90,90,90)');
      h.fillStyle = g; h.fillRect(x + 2, y + 2, rw - 4, rh - 4);
      if (R() < 0.5) { h.strokeStyle = 'rgb(110,110,110)'; h.lineWidth = 1.5; h.beginPath(); h.moveTo(x + rw / 2, y + 4); h.lineTo(x + rw / 2, y + rh - 4); h.stroke(); }
      x += rw;
    }
    y += rh;
  }
  const height = readHeight(hgt);
  const w = tileNoise(S, S / 4, 1, 4405);
  const img = a.getImageData(0, 0, S, S);
  for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
    const i = yy * S + xx;
    const weave = ((xx >> 1) + (yy >> 1)) & 1 ? 0.5 + 0.5 * Math.sin(xx * 1.7) : 0.5 + 0.5 * Math.sin(yy * 1.7);
    height[i] += weave * 0.04 + w[i] * 0.03;
    const d = (weave - 0.5) * 6;
    img.data[i * 4] += d; img.data[i * 4 + 1] += d; img.data[i * 4 + 2] += d;
  }
  a.putImageData(img, 0, 0);
  return { map: alb, roughnessMap: rough, normalMap: heightToNormal(height, S, 2.2) };
}

export const GRIME_CELLS = { streak: [0, 0], streakThin: [1, 0], streakWide: [2, 0], blotch: [3, 0], halo: [0, 1], edge: [1, 1], scuff: [2, 1], scuffDots: [3, 1] };

export function grimeUV(cell) {
  const [cx, cy] = GRIME_CELLS[cell];
  return [cx / 4, 1 - (cy + 1) / 4, (cx + 1) / 4, 1 - cy / 4];
}

export function createGrimeAtlas(size = 1024) {
  const R = rng(3303);
  const c = makeCanvas(size), x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  const cs = size / 4;
  const cell = (cx, cy, fn) => { x.save(); x.beginPath(); x.rect(cx * cs, cy * cs, cs, cs); x.clip(); x.translate(cx * cs, cy * cs); fn(); x.restore(); };
  const streaks = (count, wMin, wMax, alpha, rgb) => {
    for (let i = 0; i < count; i++) {
      const cx = cs * (0.5 + (R() - 0.5) * 0.55 * (R() < 0.5 ? 0.4 : 1)), w = cs * (wMin + R() * (wMax - wMin)), len = cs * (0.45 + R() * 0.55);
      const g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(${rgb},${alpha * (0.6 + R() * 0.4)})`); g.addColorStop(0.35 + R() * 0.3, `rgba(${rgb},${alpha * 0.45})`); g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g;
      x.beginPath(); x.moveTo(cx - w * 0.3, 0); x.lineTo(cx + w * 0.3, 0); x.lineTo(cx + w * 0.5 + (R() - 0.5) * w, len); x.lineTo(cx - w * 0.5 + (R() - 0.5) * w, len); x.fill();
    }
  };
  cell(0, 0, () => streaks(14, 0.04, 0.16, 0.22, '70,70,68'));
  cell(1, 0, () => streaks(6, 0.015, 0.05, 0.35, '54,54,53'));
  cell(2, 0, () => streaks(22, 0.08, 0.3, 0.12, '78,78,76'));
  cell(3, 0, () => { for (let i = 0; i < 40; i++) { const px = cs * (0.5 + (R() - 0.5) * 0.6), py = cs * (0.5 + (R() - 0.5) * 0.6), r = cs * (0.03 + R() * 0.16); const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(76,76,74,${0.06 + R() * 0.1})`); g.addColorStop(1, 'rgba(76,76,74,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } });
  { const img = x.createImageData(cs, cs); for (let j = 0; j < cs; j++) for (let i = 0; i < cs; i++) { const u = Math.abs(i / cs * 2 - 1), v = Math.abs(j / cs * 2 - 1), m = Math.max(u, v); const t = m < 0.7 || m > 0.98 ? 0 : Math.sin((m - 0.7) / 0.28 * Math.PI) ** 1.5; const k = (j * cs + i) * 4; img.data[k] = 66; img.data[k + 1] = 66; img.data[k + 2] = 64; img.data[k + 3] = t * (55 + R() * 45); } x.putImageData(img, 0, cs); }
  cell(1, 1, () => { const g = x.createLinearGradient(0, 0, 0, cs); g.addColorStop(0, 'rgba(64,64,62,0.5)'); g.addColorStop(0.5, 'rgba(64,64,62,0.12)'); g.addColorStop(1, 'rgba(64,64,62,0)'); x.fillStyle = g; x.fillRect(0, 0, cs, cs); });
  cell(2, 1, () => { for (let i = 0; i < 160; i++) { const px = R() * cs, py = cs * (0.2 + R() * 0.6), l = cs * (0.02 + R() * 0.25); x.strokeStyle = `rgba(190,192,196,${0.08 + R() * 0.3})`; x.lineWidth = 0.6 + R() * 1.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + l, py + (R() - 0.5) * cs * 0.04); x.stroke(); } });
  cell(3, 1, () => { for (let i = 0; i < 260; i++) { const px = R() * cs, py = cs * (0.3 + R() * 0.4), r = 0.5 + R() * 2.5; x.fillStyle = `rgba(170,172,176,${0.1 + R() * 0.35})`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); } });
  return c;
}

function buildAll(size, small) {
  return {
    white: buildWhite(size),
    whitePlain: buildWhitePlain(small),
    blanket: buildBlanket(small),
    grime: createGrimeAtlas(1024),
    tile: buildTile(size),
    frame: buildFrame(small),
    metal: buildMetal(small),
    radiator: buildRadiator(small),
    engine: buildEngine(small),
    decal: createDecalAtlas(small),
  };
}

export function createHullMaterials({ renderer, quality = 'high' } = {}) {
  const q = typeof quality === 'string' ? quality : 'high';
  const size = q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
  const small = q === 'low' ? 512 : q === 'medium' ? 1024 : 2048;
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const key = `${size}`;
  if (!CACHE.has(key)) {
    const c = buildAll(size, small);
    const t = {};
    for (const name of ['white', 'whitePlain', 'blanket', 'tile', 'frame', 'metal', 'radiator', 'engine']) {
      const rc = c[name].roughnessMap;
      let rough = rc;
      if (rc.width > 2048) {
        rough = makeCanvas(rc.width / 2);
        rough.getContext('2d').drawImage(rc, 0, 0, rc.width / 2, rc.width / 2);
        c[name].roughnessMap = rough;
      }
      t[name] = {
        map: texFrom(c[name].map, { srgb: true, repeat: HULL_PERIOD[name], aniso }),
        roughnessMap: texFrom(rough, { repeat: HULL_PERIOD[name], aniso }),
        normalMap: texFrom(c[name].normalMap, { repeat: HULL_PERIOD[name], aniso }),
      };
    }
    const d = new THREE.CanvasTexture(c.decal);
    d.colorSpace = THREE.SRGBColorSpace; d.anisotropy = aniso;
    t.decal = d;
    const gr = new THREE.CanvasTexture(c.grime);
    gr.colorSpace = THREE.SRGBColorSpace; gr.anisotropy = aniso;
    t.grime = gr;
    t.canvases = c;
    CACHE.set(key, t);
  }
  const t = CACHE.get(key);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    white: std({ name: 'hull.white', color: 0xffffff, ...t.white, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7) }),
    whitePlain: std({ name: 'hull.whitePlain', color: 0xffffff, ...t.whitePlain, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) }),
    grime: std({ name: 'hull.grime', map: t.grime, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    blanket: std({ name: 'hull.blanket', color: 0xffffff, ...t.blanket, roughness: 1, metalness: 0.05, normalScale: new THREE.Vector2(0.9, 0.9) }),
    tile: std({ name: 'hull.tile', color: 0xffffff, ...t.tile, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1, 1) }),
    frame: std({ name: 'hull.frame', color: 0xffffff, ...t.frame, roughness: 1, metalness: 0.05, normalScale: new THREE.Vector2(0.6, 0.6) }),
    metal: std({ name: 'hull.metal', color: 0xffffff, ...t.metal, roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.4, 0.4) }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'hull.glass', color: 0x030405, roughness: 0.04, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.02, envMapIntensity: 1.2 }),
    radiator: std({ name: 'hull.radiator', color: 0xffffff, ...t.radiator, roughness: 1, metalness: 0.25, normalScale: new THREE.Vector2(1, 1) }),
    rubber: std({ name: 'hull.rubber', color: 0x0d0d0e, roughness: 0.88, metalness: 0 }),
    engine: std({ name: 'hull.engine', color: 0xffffff, ...t.engine, roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.5, 0.5) }),
    decal: std({ name: 'hull.decal', map: t.decal, transparent: true, alphaTest: 0.02, depthWrite: false, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  mats.textures = t;
  mats.period = HULL_PERIOD;
  mats.uv = boxProjectUV;
  return mats;
}
