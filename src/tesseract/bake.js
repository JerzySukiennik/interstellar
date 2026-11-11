// Tesseract geometry baking: flattens any model subtree into one indexed memory geometry (position, normal, albedo, emission) and builds vertex-clustered LODs.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Color(), _ic = new THREE.Color();

const MEANS = new WeakMap();
export function textureMean(tex) {
  if (!tex) return null;
  if (MEANS.has(tex)) return MEANS.get(tex);
  let out = null;
  try {
    const img = tex.image, srgb = tex.colorSpace === THREE.SRGBColorSpace;
    const lin = v => (srgb ? Math.pow(v, 2.2) : v);
    if (img?.data && img.width) {
      const d = img.data, n = img.width * img.height, ch = Math.round(d.length / n) || 4, step = Math.max(1, Math.floor(n / 4096));
      const sc = d instanceof Uint8Array || d instanceof Uint8ClampedArray ? 1 / 255 : 1;
      let r = 0, g = 0, b = 0, k = 0;
      for (let i = 0; i < n; i += step) { r += lin(d[i * ch] * sc); g += lin(d[i * ch + 1] * sc); b += lin(d[i * ch + 2] * sc); k++; }
      out = [r / k, g / k, b / k];
    } else if (img && (img.width || img.naturalWidth) && typeof document !== 'undefined') {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const g2 = cv.getContext('2d');
      g2.drawImage(img, 0, 0, 16, 16);
      const d = g2.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 256; i++) { r += lin(d[i * 4] / 255); g += lin(d[i * 4 + 1] / 255); b += lin(d[i * 4 + 2] / 255); }
      out = [r / 256, g / 256, b / 256];
    }
  } catch { out = null; }
  if (out && !(out[0] + out[1] + out[2] >= 0)) out = null;
  MEANS.set(tex, out);
  return out;
}

export class Baker {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.emi = []; this.idx = []; this.count = 0; }

  get empty() { return this.idx.length === 0; }

  addGeometry(geo, matrix, { color = [1, 1, 1], vertexColors = false, emit = [0, 0, 0, 0], filter = null } = {}) {
    const P = geo.attributes.position;
    if (!P || P.count === 0) return;
    let N = geo.attributes.normal;
    if (!N) { geo = geo.clone(); geo.computeVertexNormals(); N = geo.attributes.normal; }
    const C = vertexColors ? geo.attributes.color : null;
    _n.getNormalMatrix(matrix);
    const index = geo.index ? geo.index.array : null;
    const start = geo.drawRange?.start || 0;
    const end = Math.min(index ? index.length : P.count, start + (Number.isFinite(geo.drawRange?.count) ? geo.drawRange.count : Infinity));
    const base = this.count;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      _w.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_w.x, _w.y, _w.z);
      let r = color[0], g = color[1], b = color[2];
      if (C) { r *= C.getX(i); g *= C.getY(i); b *= C.getZ(i); }
      this.col.push(r, g, b);
      this.emi.push(emit[0], emit[1], emit[2], emit[3]);
    }
    this.count += P.count;
    for (let i = start; i + 2 < end; i += 3) {
      const a = index ? index[i] : i, b = index ? index[i + 1] : i + 1, c = index ? index[i + 2] : i + 2;
      if (filter) {
        _v.fromBufferAttribute(P, a).add(_w.fromBufferAttribute(P, b)).add(_w.fromBufferAttribute(P, c)).multiplyScalar(1 / 3).applyMatrix4(matrix);
        if (!filter(_v)) continue;
      }
      this.idx.push(base + a, base + b, base + c);
    }
  }

  addObject(root, rootInverse, { skip = () => false, filter = null, emitOf = defaultEmit, maxInstances = 600, tint = null } = {}) {
    root.updateWorldMatrix(true, true);
    const walk = o => {
      if (o.visible === false || skip(o)) return;
      if ((o.isMesh || o.isInstancedMesh) && o.geometry) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const mat = mats[0];
        if (mat && !mat.transparent && mat.visible !== false && !(mat.isShaderMaterial && !mat.userData?.bakeColor)) {
          const col = mat.userData?.bakeColor || (mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.7, 0.7, 0.7]);
          const tm = textureMean(mat.map);
          if (tm) { col[0] *= tm[0]; col[1] *= tm[1]; col[2] *= tm[2]; }
          if (tint) { col[0] *= tint[0]; col[1] *= tint[1]; col[2] *= tint[2]; }
          const em = emitOf(mat, o);
          const opts = { color: col, vertexColors: !!mat.vertexColors, emit: em, filter };
          _m.multiplyMatrices(rootInverse, o.matrixWorld);
          if (o.isInstancedMesh) {
            const n = Math.min(o.count, maxInstances);
            for (let i = 0; i < n; i++) {
              o.getMatrixAt(i, _mi);
              const M = _mi.clone().premultiply(_m);
              if (o.instanceColor) { o.getColorAt(i, _ic); opts.color = [col[0] * _ic.r, col[1] * _ic.g, col[2] * _ic.b]; if (em[0] + em[1] + em[2] > 0) opts.emit = [em[0] * _ic.r, em[1] * _ic.g, em[2] * _ic.b, em[3]]; }
              if (M.determinant() !== 0) this.addGeometry(o.geometry, M, opts);
            }
          } else this.addGeometry(o.geometry, _m, opts);
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
  }

  build() {
    if (this.empty) return null;
    const used = new Uint8Array(this.count);
    for (const i of this.idx) used[i] = 1;
    const remap = new Int32Array(this.count).fill(-1);
    let n = 0;
    for (let i = 0; i < this.count; i++) if (used[i]) remap[i] = n++;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), emi = new Float32Array(n * 4);
    for (let i = 0; i < this.count; i++) {
      const j = remap[i];
      if (j < 0) continue;
      for (let k = 0; k < 3; k++) { pos[j * 3 + k] = this.pos[i * 3 + k]; nor[j * 3 + k] = this.nor[i * 3 + k]; col[j * 3 + k] = this.col[i * 3 + k]; }
      for (let k = 0; k < 4; k++) emi[j * 4 + k] = this.emi[i * 4 + k];
    }
    const idx = n > 65535 ? new Uint32Array(this.idx.length) : new Uint16Array(this.idx.length);
    for (let i = 0; i < this.idx.length; i++) idx[i] = remap[this.idx[i]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aEmit', new THREE.BufferAttribute(emi, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export function defaultEmit(mat) {
  if (mat.isMeshBasicMaterial && mat.color) {
    const l = mat.color.r + mat.color.g + mat.color.b;
    if (l > 1.5 || mat.toneMapped === false) return [mat.color.r, mat.color.g, mat.color.b, 0];
    return [0, 0, 0, 0];
  }
  if (mat.emissive) {
    _e.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity ?? 1);
    if (_e.r + _e.g + _e.b > 0.06) return [_e.r, _e.g, _e.b, 0];
  }
  return [0, 0, 0, 0];
}

export function cluster(geo, cell = 0.1) {
  const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, C = geo.attributes.color.array, E = geo.attributes.aEmit.array;
  const I = geo.index.array, n = P.length / 3;
  const map = new Map(), rep = new Int32Array(n);
  const acc = [];
  const inv = 1 / cell;
  for (let i = 0; i < n; i++) {
    const nx = Nn[i * 3], ny = Nn[i * 3 + 1], nz = Nn[i * 3 + 2];
    const oct = (nx > 0.35 ? 1 : nx < -0.35 ? 2 : 0) + (ny > 0.35 ? 3 : ny < -0.35 ? 6 : 0) + (nz > 0.35 ? 9 : nz < -0.35 ? 18 : 0);
    const key = `${Math.floor(P[i * 3] * inv)},${Math.floor(P[i * 3 + 1] * inv)},${Math.floor(P[i * 3 + 2] * inv)},${oct}`;
    let k = map.get(key);
    if (k === undefined) { k = acc.length / 14; map.set(key, k); for (let j = 0; j < 14; j++) acc.push(0); }
    const o = k * 14;
    acc[o] += P[i * 3]; acc[o + 1] += P[i * 3 + 1]; acc[o + 2] += P[i * 3 + 2];
    acc[o + 3] += nx; acc[o + 4] += ny; acc[o + 5] += nz;
    acc[o + 6] += C[i * 3]; acc[o + 7] += C[i * 3 + 1]; acc[o + 8] += C[i * 3 + 2];
    acc[o + 9] += E[i * 4]; acc[o + 10] += E[i * 4 + 1]; acc[o + 11] += E[i * 4 + 2]; acc[o + 12] += E[i * 4 + 3];
    acc[o + 13] += 1;
    rep[i] = k;
  }
  const m = acc.length / 14;
  const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), emi = new Float32Array(m * 4);
  for (let k = 0; k < m; k++) {
    const o = k * 14, w = 1 / acc[o + 13];
    pos[k * 3] = acc[o] * w; pos[k * 3 + 1] = acc[o + 1] * w; pos[k * 3 + 2] = acc[o + 2] * w;
    const l = Math.hypot(acc[o + 3], acc[o + 4], acc[o + 5]) || 1;
    nor[k * 3] = acc[o + 3] / l; nor[k * 3 + 1] = acc[o + 4] / l; nor[k * 3 + 2] = acc[o + 5] / l;
    col[k * 3] = acc[o + 6] * w; col[k * 3 + 1] = acc[o + 7] * w; col[k * 3 + 2] = acc[o + 8] * w;
    for (let j = 0; j < 4; j++) emi[k * 4 + j] = acc[o + 9 + j] * w;
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < I.length; i += 3) {
    const a = rep[I[i]], b = rep[I[i + 1]], c = rep[I[i + 2]];
    if (a === b || b === c || a === c) continue;
    const key = a < b ? (b < c ? `${a},${b},${c}` : a < c ? `${a},${c},${b}` : `${c},${a},${b}`) : (a < c ? `${b},${a},${c}` : b < c ? `${b},${c},${a}` : `${c},${b},${a}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(emi, 4));
  g.setIndex(m > 65535 ? new THREE.BufferAttribute(new Uint32Array(out), 1) : new THREE.BufferAttribute(new Uint16Array(out), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function triCount(g) { return g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0; }

export function featurePoints(geo, count = 120, seed = 3) {
  const P = geo.attributes.position.array, n = P.length / 3;
  const bb = geo.boundingBox;
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = [];
  const grid = new Set();
  const cell = Math.max(0.25, (bb.max.y - bb.min.y) / 14);
  for (let tries = 0; out.length < count * 3 && tries < count * 40; tries++) {
    const i = Math.floor(rnd() * n);
    const y = P[i * 3 + 1], z = P[i * 3 + 2];
    const key = `${Math.round(y / cell)},${Math.round(z / cell)}`;
    if (grid.has(key)) continue;
    grid.add(key);
    out.push(P[i * 3], y, z);
  }
  return new Float32Array(out);
}
