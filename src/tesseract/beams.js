// Tesseract extrusions: every memory's set slit-scanned into colour strips and swept along its time axis as dense bundles of striped boards with stepped ends, glass sheets, cross-bundles to the neighbouring memories and mirrored levels, an endless history-seeded lattice, the world-line written into the stripes.
import * as THREE from 'three';

const BINS = 256, TRACE = 512;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export function buildStrips(runs, palette) {
  const rows = runs.length * 3;
  const data = new Uint8Array(BINS * Math.max(1, rows) * 4);
  runs.forEach((run, ri) => {
    const room = run.rooms[0], box = run.set.box;
    const mn = box.center.clone().sub(box.half), sz = box.half.clone().multiplyScalar(2);
    const acc = [0, 1, 2].map(() => new Float32Array(BINS * 5));
    const add = (geo, M) => {
      const P = geo.attributes.position, C = geo.attributes.color, E = geo.attributes.aEmit;
      if (!P || !C) return;
      const step = Math.max(1, Math.floor(P.count / 70000));
      for (let i = 0; i < P.count; i += step) {
        _v.fromBufferAttribute(P, i).applyMatrix4(M);
        const lx = (_v.x - mn.x) / sz.x, ly = (_v.y - mn.y) / sz.y, lz = (_v.z - mn.z) / sz.z;
        if (lx < 0 || lx >= 1 || ly < 0 || ly >= 1 || lz < 0 || lz >= 1) continue;
        const r = C.getX(i), g = C.getY(i), b = C.getZ(i);
        const e = E ? E.getX(i) + E.getY(i) + E.getZ(i) : 0;
        const er = e > 0.05 ? E.getX(i) / e : 0, eg = e > 0.05 ? E.getY(i) / e : 0, eb = e > 0.05 ? E.getZ(i) / e : 0;
        const l = [lx, ly, lz];
        for (let a = 0; a < 3; a++) {
          const k = Math.min(BINS - 1, Math.floor(l[a] * BINS)) * 5, A = acc[a];
          if (e > 0.05) { A[k] += er * 0.8; A[k + 1] += eg * 0.8; A[k + 2] += eb * 0.8; A[k + 3] += Math.min(1, e / 8); A[k + 4] += 1; }
          else { A[k] += r; A[k + 1] += g; A[k + 2] += b; A[k + 4] += 1; }
        }
      }
    };
    for (const mesh of room.meshes) add(mesh.geometry, mesh.matrix.clone().premultiply(_m.makeTranslation(-room.center.x, -room.center.y, -room.center.z)));
    if (room.craft && run.set.craft) add(run.set.craft.geo, new THREE.Matrix4().compose(room.center.clone().negate().add(room.center), _q.identity(), _s.setScalar(run.set.scale)));
    const pal = (palette && palette[run.kind]) || [[0.42, 0.3, 0.14], [0.56, 0.47, 0.22], [0.7, 0.62, 0.42], [0.2, 0.14, 0.08]];
    for (let a = 0; a < 3; a++) {
      const A = acc[a];
      const out = new Float32Array(BINS * 4);
      let last = -1;
      for (let k = 0; k < BINS; k++) if (A[k * 5 + 4] > 0) { const w = 1 / A[k * 5 + 4]; for (let c = 0; c < 4; c++) out[k * 4 + c] = A[k * 5 + c] * w; last = k; } else out[k * 4 + 3] = -1;
      for (let pass = 0; pass < 2; pass++) for (let k = 0; k < BINS; k++) {
        const kk = pass ? BINS - 1 - k : k;
        if (out[kk * 4 + 3] >= 0) { last = kk; continue; }
        if (last >= 0 && out[last * 4 + 3] >= 0) for (let c = 0; c < 4; c++) out[kk * 4 + c] = out[last * 4 + c];
      }
      const sm = new Float32Array(BINS * 4);
      for (let k = 0; k < BINS; k++) for (let c = 0; c < 4; c++) {
        let v = 0, w = 0;
        for (let d = -2; d <= 2; d++) { const kk = Math.min(BINS - 1, Math.max(0, k + d)); const ww = 3 - Math.abs(d); v += Math.max(0, out[kk * 4 + c]) * ww; w += ww; }
        sm[k * 4 + c] = v / w;
      }
      for (let k = 0; k < BINS; k++) {
        const o = ((ri * 3 + a) * BINS + k) * 4;
        let r = sm[k * 4], g = sm[k * 4 + 1], b = sm[k * 4 + 2], e = Math.max(0, sm[k * 4 + 3]);
        if (!(r + g + b > 0)) { const p = pal[k % pal.length]; r = p[0]; g = p[1]; b = p[2]; }
        const j = 0.8 + 0.4 * hash(ri * 977 + a * 131 + Math.floor(k / 3));
        r *= j; g *= j; b *= j;
        data[o] = Math.round(Math.sqrt(Math.min(1, r)) * 255); data[o + 1] = Math.round(Math.sqrt(Math.min(1, g)) * 255); data[o + 2] = Math.round(Math.sqrt(Math.min(1, b)) * 255);
        data[o + 3] = Math.round(Math.min(1, e) * 255);
      }
    }
  });
  const tex = new THREE.DataTexture(data, BINS, Math.max(1, rows), THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function buildTrace(runs, figureAt) {
  const data = new Uint8Array(TRACE * Math.max(1, runs.length) * 4);
  runs.forEach((run, ri) => {
    const m = run.mem, box = run.set.box;
    const mn = box.center.clone().sub(box.half), sz = box.half.clone().multiplyScalar(2);
    for (let i = 0; i < TRACE; i++) {
      const t = m.t0 + (i + 0.5) / TRACE * m.dur;
      const o = (ri * TRACE + i) * 4;
      const c = figureAt(run, t);
      if (!c) continue;
      data[o] = Math.round(THREE.MathUtils.clamp((c.x - mn.x) / sz.x, 0, 1) * 255);
      data[o + 1] = Math.round(THREE.MathUtils.clamp((c.y - mn.y) / sz.y, 0, 1) * 255);
      data[o + 2] = Math.round(THREE.MathUtils.clamp((c.z - mn.z) / sz.z, 0, 1) * 255);
      data[o + 3] = 255;
    }
  });
  const tex = new THREE.DataTexture(data, TRACE, Math.max(1, runs.length), THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const BEAM_VERT = `
uniform vec3 uTile; uniform float uArrive, uFold, uGlass; uniform vec3 uFwd; uniform vec4 uRipple; uniform vec4 uRegion; uniform vec3 uTarget;
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
varying vec3 vW; varying vec3 vN; flat varying vec4 vA; flat varying vec4 vB; flat varying vec4 vC; varying vec3 vL; flat varying vec3 vH;
void main(){
  vec3 c = instanceMatrix[3].xyz;
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  int ax = int(iA.x + 0.5);
  if (iB.z > 0.5) {
    vec3 wr = c + uTile * floor((cameraPosition - c) / uTile + 0.5);
    if (ax == 0) wr.x = cameraPosition.x + c.x; else if (ax == 1) wr.y = cameraPosition.y + c.y; else wr.z = cameraPosition.z + c.z;
    c = wr;
    bool inY = abs(c.y) < uRegion.w;
    bool inZ = c.z > uRegion.x - 13.0 && c.z < uRegion.y + 13.0;
    if (inY && inZ && (ax != 1 || abs(c.y) < uRegion.w * 0.5)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  }
  vec3 dir = ax == 0 ? vec3(1.0, 0.0, 0.0) : ax == 1 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  if (uFold > 0.0) {
    float h = fract(sin(iB.y * 78.233) * 43758.5);
    c += dir * (h - 0.5) * 2.0 * uFold * uFold * (30.0 + 90.0 * h);
    c = mix(c, uTarget, uFold * uFold * 0.65);
  }
  vec3 w = c + position * sc;
  vL = position * sc; vH = sc * 0.5;
  if (uRipple.w > 0.0) {
    float r = length(c - uRipple.xyz);
    float k = r - uRipple.w * 30.0;
    w += dir * exp(-k * k / 80.0) * 0.9 * exp(-uRipple.w * 0.3) * sin(iB.y * 3.7);
  }
  if (uArrive > 0.0) {
    vec3 rel = w - cameraPosition;
    float a = dot(rel, uFwd);
    w = cameraPosition + rel + uFwd * a * uArrive * 7.0;
  }
  vW = w; vN = normal; vA = iA; vB = iB; vC = iC;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const BEAM_FRAG = `
uniform sampler2D uStrip, uTrace; uniform samplerCube uEnv; uniform float uEnvOn;
uniform float uRows, uRuns, uTime, uFold, uArrive, uReveal, uRange, uGlass, uGain; uniform vec2 uRun[16]; uniform vec4 uRipple; uniform vec3 uTarget, uCamUp, uCamRight;
varying vec3 vW; varying vec3 vN; flat varying vec4 vA; flat varying vec4 vB; flat varying vec4 vC; varying vec3 vL; flat varying vec3 vH;
float h1(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
vec3 paletteMap(vec3 raw, float v){
  float l = dot(raw, vec3(0.3, 0.55, 0.15));
  float mx = max(raw.r, max(raw.g, raw.b)), mn = min(raw.r, min(raw.g, raw.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  float lv = clamp(pow(max(l, 0.0), 0.55) * v, 0.0, 1.4);
  vec3 tob = vec3(0.2, 0.1, 0.035), oli = vec3(0.5, 0.49, 0.15), gol = vec3(1.0, 0.76, 0.2), cre = vec3(1.12, 1.02, 0.76);
  vec3 neu = lv < 0.3 ? mix(tob * 0.35, tob, lv / 0.3) : lv < 0.58 ? mix(tob, oli, (lv - 0.3) / 0.28) : lv < 0.8 ? mix(oli, gol, (lv - 0.58) / 0.22) : mix(gol, cre, clamp((lv - 0.8) / 0.3, 0.0, 1.0));
  vec3 hue = raw / max(mx, 1e-3);
  vec3 acc;
  if (hue.b > hue.r && hue.g > hue.r * 1.05) acc = vec3(0.16, 0.62, 0.6);
  else if (hue.r > hue.g * 1.25) acc = vec3(1.05, 0.46, 0.12);
  else if (hue.g >= hue.r && hue.g > hue.b) acc = vec3(0.5, 0.56, 0.24);
  else acc = gol;
  acc *= 0.35 + 0.9 * clamp(mx * v, 0.0, 1.3);
  return mix(neu, acc, smoothstep(0.18, 0.5, sat));
}
void main(){
  int ax = int(vA.x + 0.5);
  int lay = int(vB.x + 0.5);
  vec3 n = normalize(vN);
  vec3 an = abs(n);
  int na = an.x > 0.5 ? 0 : an.y > 0.5 ? 1 : 2;
  int q = 3 - ax - lay;
  int b = na == ax ? lay : (na == lay ? q : lay);
  float c = b == 0 ? vW.x : b == 1 ? vW.y : vW.z;
  float along = ax == 0 ? vW.x : ax == 1 ? vW.y : vW.z;
  vec3 ctr = vW - vL;
  float cc = b == 0 ? ctr.x : b == 1 ? ctr.y : ctr.z;
  float u = b == lay ? (c - cc + vC.x) / vC.y : (c - cc + vC.z) / vC.w;
  float row = (vA.y * 3.0 + float(b) + 0.5) / uRows;
  vec4 st = texture2D(uStrip, vec2(clamp(u, 0.002, 0.998), row));
  vec3 raw = st.rgb * st.rgb;
  float sid = floor(u * 160.0) + vB.y * 3.0;
  float rF = fwidth(u) * 160.0;
  float fk = smoothstep(0.1, 0.4, rF);
  float k2 = smoothstep(0.1, 0.4, rF * 0.25), k3 = smoothstep(0.1, 0.4, rF * 0.0625);
  float hs = h1(sid);
  float s2 = h1(floor(u * 40.0) + vB.y * 1.7 + 5.0), s3 = h1(floor(u * 10.0) + vB.y * 2.3 + 9.0);
  float slat = mix(0.55 + 0.95 * hs * hs, 1.0, fk) * mix(0.55 + 0.9 * s2, 1.0, k2);
  float board = 0.55 + 0.9 * h1(vB.y * 7.31);
  vec3 alb = paletteMap(raw, board * mix(0.6 + 0.8 * s3, 1.0, k3) * mix(0.8 + 0.4 * s2, 1.0, k2));
  float glint = step(0.993, hs) * (1.0 - smoothstep(0.08, 0.3, rF)) * vB.w * smoothstep(0.1, 0.4, abs(dot(n, normalize(cameraPosition - vW))));
  vec3 e3 = vH - abs(vL);
  float ed = na == 0 ? min(e3.y, e3.z) : na == 1 ? min(e3.x, e3.z) : min(e3.x, e3.y);
  float rimW = max(0.05, fwidth(ed) * 2.0);
  float rim = (1.0 - smoothstep(0.0, rimW, ed)) * (0.05 / rimW);
  vec3 V = normalize(cameraPosition - vW);
  vec3 T = ax == 0 ? vec3(1.0, 0.0, 0.0) : ax == 1 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 Lh = normalize(uCamUp * 0.75 + uCamRight * 0.25 + V * 0.35);
  vec3 H = normalize(Lh + V);
  float th = dot(T, H);
  float aniso = pow(sqrt(max(0.0, 1.0 - th * th)), 60.0) * smoothstep(0.04, 0.3, abs(dot(n, V)));
  float fres = 0.04 + 0.96 * pow(1.0 - abs(dot(n, V)), 5.0);
  vec3 env = uEnvOn > 0.5 ? textureLod(uEnv, reflect(-V, n), 3.0).rgb : vec3(0.25, 0.18, 0.1);
  float dT = distance(vW, uTarget);
  float pulse = exp(-pow((fract((dT + uTime * 5.0) / 48.0) - 0.5) * 48.0 / 3.0, 2.0)) * (0.45 + 0.6 * exp(-dT / 70.0));
  alb = mix(alb, vec3(0.16, 0.58, 0.56) * (0.7 + 0.6 * s3), step(0.986, hs) * step(0.5, s2) * (1.0 - fk));
  vec3 col = alb * (0.42 + 0.2 * max(0.0, dot(n, Lh))) * slat;
  col += alb * 0.25 * rim;
  col += (alb * 1.2 + vec3(0.3, 0.24, 0.12)) * aniso * 1.1 * slat;
  col += env * min(fres, 0.6) * 0.45 + alb * fres * 0.12;
  col += raw * st.a * 1.1;
  col += vec3(1.5, 1.32, 1.0) * glint * 1.6;
  col *= 1.0 + pulse * 0.55;
  if (ax == 0 && vA.z >= 0.0 && b != 0) {
    vec2 rp = uRun[int(vA.z + 0.5)];
    float s = ((vW.x - rp.x) / 20.0 + 0.5) / rp.y;
    if (s > 0.0 && s < 1.0) {
      vec4 tr = texture2D(uTrace, vec2(s, (vA.z + 0.5) / uRuns));
      float uf = b == 1 ? tr.g : tr.b;
      float d = abs(u - uf);
      float w = max(0.004, fwidth(u) * 0.9);
      float streak = tr.a * exp(-d * d / (w * w)) * (0.004 / w);
      float now = exp(-pow((vW.x - cameraPosition.x) / 5.0, 2.0));
      col += vec3(2.2, 1.85, 1.4) * streak * (0.3 + 2.2 * now);
    }
  }
  if (uRipple.w > 0.0) { float r = distance(vW, uRipple.xyz); float k = r - uRipple.w * 30.0; col *= 1.0 + exp(-k * k / 40.0) * 2.0 * exp(-uRipple.w * 0.3); }
  float dist = distance(vW, cameraPosition);
  float fog = exp(-pow(dist / uRange, 1.45));
  float arrive = uArrive > 0.0 ? mix(1.0, rim * 4.0, uArrive) : 1.0;
  col *= vA.w * uGain * fog * uReveal * (1.0 + uFold * 4.0) * arrive;
  if (uGlass > 0.5) {
    float a = clamp((0.05 + fres * 0.5) * fog, 0.0, 0.6);
    gl_FragColor = vec4(col * 0.35 + env * fres * 0.4 * fog, a);
  } else gl_FragColor = vec4(col, 1.0);
}`;

export const PALETTE = {};

function beamMaterial(strip, trace, rows, runs, glass) {
  return new THREE.ShaderMaterial({
    name: glass ? 'tess_glass' : 'tess_beams', vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    uniforms: {
      uStrip: { value: strip }, uTrace: { value: trace }, uEnv: { value: null }, uEnvOn: { value: 0 }, uRows: { value: rows }, uRuns: { value: Math.max(1, runs.length) },
      uRun: { value: Array.from({ length: 16 }, (_, i) => runs[i] ? new THREE.Vector2(runs[i].x0, runs[i].mem.M) : new THREE.Vector2(0, 1)) },
      uTime: { value: 0 }, uFold: { value: 0 }, uArrive: { value: 0 }, uReveal: { value: 1 }, uRange: { value: 105 }, uGlass: { value: glass ? 1 : 0 }, uGain: { value: 1 },
      uTile: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3(0, 0, -1) }, uRipple: { value: new THREE.Vector4() }, uRegion: { value: new THREE.Vector4() },
      uTarget: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3(0, 1, 0) }, uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    },
    ...(glass ? { transparent: true, depthWrite: false, blending: THREE.NormalBlending } : {}),
  });
}

export function buildBeams({ runs, cell, strip, trace, quality = 'ultra', seed = 19 }) {
  const list = [[], [], []], glass = [[], [], []], bundles = [];
  let sd = (Math.abs(seed | 0) % 2147483646) + 1;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const P2 = [[1, 2], [0, 2], [0, 1]];
  const boards = quality === 'low' ? [6, 10] : [8, 22];
  const bundle = (ax, cx, cy, cz, sx, sy, sz, mem, gain, generic = 0, lay = null) => {
    const size = [sx, sy, sz], ctr = [cx, cy, cz];
    const [pa, pb] = P2[ax];
    const L = lay ?? (size[pa] >= size[pb] ? pa : pb);
    const Q = 3 - ax - L;
    if (!generic) bundles.push({ min: ctr.map((v, i) => v - size[i] / 2), max: ctr.map((v, i) => v + size[i] / 2) });
    const n = Math.max(3, Math.min(boards[1], Math.round(size[L] / (0.16 + rnd() * 0.12)), boards[0] + Math.floor(rnd() * (boards[1] - boards[0] + 1))));
    const w = []; let tot = 0;
    for (let i = 0; i < n; i++) { const x = 0.5 + Math.pow(rnd(), 1.4) * 1.5; w.push(x); tot += x; }
    let acc = -size[L] / 2;
    const gid = Math.floor(rnd() * 97);
    for (let i = 0; i < n; i++) {
      const th = w[i] / tot * size[L];
      const gap = th > 0.2 && rnd() < 0.25 ? 0.025 : 0;
      const bs = size.slice(), bc = ctr.slice();
      bs[L] = Math.max(0.02, th - gap);
      bc[L] = ctr[L] + acc + th / 2;
      const depth = size[Q] * (rnd() < 0.3 ? 0.84 + 0.12 * rnd() : 1);
      bs[Q] = depth;
      bc[Q] = ctr[Q] + (size[Q] - depth) * (rnd() - 0.5);
      const e0 = (0.3 + rnd() * 1.4) * (rnd() < 0.6 ? 1 : 0), e1 = (0.3 + rnd() * 1.4) * (rnd() < 0.6 ? 1 : 0);
      bs[ax] = Math.max(0.5, size[ax] - e0 - e1);
      bc[ax] = ctr[ax] + (e0 - e1) / 2;
      const minL = (bc[L] - bs[L] / 2) - (ctr[L] - size[L] / 2), minQ = (bc[Q] - bs[Q] / 2) - (ctr[Q] - size[Q] / 2);
      list[ax].push({ c: bc, s: bs, A: [ax, Math.max(0, mem), mem < 0 || generic ? -1 : mem, gain], B: [L, gid + i * 0.37, generic, rnd() < 0.5 ? 1 : 0], C: [-(minL - bs[L] / 2) + 0 - bs[L] / 2 + minL + 0, size[L], 0, size[Q]], rel: { L, Q, minL, minQ, bc, bs } });
      acc += th;
    }
    if (rnd() < 0.16) {
      const gs = size.slice(), gc = ctr.slice();
      gs[Q] = 0.025; gc[Q] = ctr[Q] + (rnd() < 0.5 ? -1 : 1) * (size[Q] / 2 + 0.25 + rnd() * 0.5);
      gs[L] = size[L] * (0.6 + 0.5 * rnd());
      glass[ax].push({ c: gc, s: gs, A: [ax, Math.max(0, mem), -1, gain * 0.8], B: [Q === L ? L : 3 - ax - Q, gid + 99, generic, 0], C: [0, 0, 0, 0], rel: { L: 3 - ax - Q, Q, minL: (gc[3 - ax - Q] - gs[3 - ax - Q] / 2) - (ctr[3 - ax - Q] - size[3 - ax - Q] / 2), minQ: 0, bc: gc, bs: gs, sizeL: size[3 - ax - Q], sizeQ: size[Q] } });
    }
  };
  const D = cell.x;
  runs.forEach((run, ri) => {
    const box = run.set.box, c = box.center, h = box.half;
    const z = run.z, x0 = run.x0 - D / 2, x1 = run.x1 + D / 2;
    const ext = 70, len = x1 - x0 + ext * 2, cx = (x0 + x1) / 2;
    const zw = Math.min(10.5, h.z + 1.6);
    for (const lv of [0, 1, -1]) {
      const yc = lv === 0 ? c.y : lv * cell.y - c.y;
      const g = lv === 0 ? 1 : 0.5;
      const bot = yc - h.y - 0.05, top = yc + h.y + 0.05;
      bundle(0, cx, bot - 1.75, z + c.z, len, 3.5, zw * 2, ri, g, 0, 1);
      bundle(0, cx + 3, top + 1.7, z + c.z + 0.6, len - 6, 3.4, zw * 1.9, ri, g * 0.95, 0, 1);
      if (lv !== 0) continue;
      for (let k = 0; k <= run.mem.M; k++) {
        const gx = run.x0 + (k - 0.5) * D;
        const gapLen = D - 2 * h.x - 0.6;
        if (gapLen > 0.8) for (const sz of [-1, 1]) {
          bundle(0, gx, bot + h.y * 0.4, z + c.z + sz * (h.z + 0.8), gapLen, h.y * 0.8, 1.4, ri, 0.9, 0, 1);
          bundle(0, gx, top - h.y * 0.13, z + c.z + sz * (h.z + 0.8), gapLen, h.y * 0.26, 1.4, ri, 0.85, 0, 1);
        }
        if (k % 2 === 0) for (const sz of [-1, 1]) bundle(1, gx + (rnd() - 0.5) * 2, yc, z + c.z + sz * (zw + 2.0), 3.2 + rnd() * 0.8, cell.y * 3, 3 + rnd() * 1.0, ri, 0.85, 0, 0);
        else if (ri < runs.length - 1) {
          const z2 = runs[ri + 1].z;
          bundle(2, gx, bot - 5.2, (z + z2) / 2, 3.6, 3.2, z2 - z - 2 * zw + 2, ri + (k % 4 === 1 ? 0 : 1), 0.85, 0, 1);
          if (rnd() < 0.5) bundle(2, gx + 2.5, top + 5.0, (z + z2) / 2, 3.0, 3.4, z2 - z - 2 * zw + 2, ri + 1, 0.8, 0, 1);
        }
      }
    }
  });
  const zs = runs.map(r => r.z);
  const region = new THREE.Vector4(zs.length ? Math.min(...zs) : 0, zs.length ? Math.max(...zs) : 0, 0, cell.y * 1.5);
  const TX = 12, TY = 7, TZ = 20;
  const tile = new THREE.Vector3(TX * cell.x, TY * cell.y, TZ * cell.z);
  const nm = Math.max(1, runs.length);
  const mem = () => runs.length ? Math.floor(rnd() * nm) : -1;
  for (let j = 0; j < TY; j++) for (let r = 0; r < TZ; r++) {
    const y = (j - 3) * cell.y, zc = (r - 10) * cell.z;
    const hz = 5 + rnd() * 5;
    bundle(0, 0, y - 4 - rnd() * 1.5, zc, tile.x * 1.6, 3 + rnd() * 1.2, hz * 2, mem(), 0.62 + rnd() * 0.3, 1, 1);
    bundle(0, 0, y + 4 + rnd() * 1.5, zc + (rnd() - 0.5) * 3, tile.x * 1.6, 3 + rnd() * 1.0, hz * 1.7, mem(), 0.6 + rnd() * 0.3, 1, 1);
    if (rnd() < 0.55) bundle(0, 0, y, zc + hz + 2, tile.x * 1.6, 3.5 + rnd() * 2, 3 + rnd(), mem(), 0.55 + rnd() * 0.3, 1, 1);
  }
  for (let i = 0; i < TX; i++) for (let r = 0; r < TZ; r++) if (rnd() < 0.6) {
    const x = (i + 0.5) * cell.x, zc = (r - 10) * cell.z + 12 * (rnd() < 0.5 ? -1 : 1) * 0.8;
    bundle(1, x, 0, zc, 3.2 + rnd() * 1.2, tile.y * 1.6, 3 + rnd() * 1.2, mem(), 0.6 + rnd() * 0.3, 1, 0);
  }
  for (let i = 0; i < TX; i++) for (let j = 0; j < TY; j++) if (rnd() < 0.65) {
    const x = (i + 0.5) * cell.x, y = (j - 3) * cell.y + cell.y * 0.5;
    bundle(2, x, y, 0, 3.4 + rnd(), 3 + rnd() * 1.2, tile.z * 1.6, mem(), 0.6 + rnd() * 0.3, 1, 1);
  }
  const rows = Math.max(1, runs.length * 3);
  const mat = beamMaterial(strip, trace, rows, runs, false);
  const gmat = beamMaterial(strip, trace, rows, runs, true);
  for (const M of [mat, gmat]) { M.uniforms.uTile.value.copy(tile); M.uniforms.uRegion.value.copy(region); }
  const make = (L, ax, m, name) => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const iA = new Float32Array(L.length * 4), iB = new Float32Array(L.length * 4), iC = new Float32Array(L.length * 4);
    const mesh = new THREE.InstancedMesh(g, m, Math.max(1, L.length));
    L.forEach((b, i) => {
      _m.compose(_v.set(b.c[0], b.c[1], b.c[2]), _q.identity(), _s.set(b.s[0], b.s[1], b.s[2]));
      mesh.setMatrixAt(i, _m);
      const R = b.rel;
      const sizeL = R.sizeL ?? (b.C[1]), sizeQ = R.sizeQ ?? (b.C[3]);
      iA.set(b.A, i * 4); iB.set(b.B, i * 4);
      iC.set([R.minL + R.bs[R.L] / 2, sizeL || 1, R.minQ + R.bs[R.Q] / 2, sizeQ || 1], i * 4);
    });
    if (!L.length) mesh.count = 0;
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4));
    g.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 4));
    mesh.frustumCulled = false;
    mesh.name = name + 'xyz'[ax];
    return mesh;
  };
  const meshes = [0, 1, 2].map(ax => make(list[ax], ax, mat, 'tess_beams_'));
  const glassMeshes = [0, 1, 2].map(ax => make(glass[ax], ax, gmat, 'tess_glass_'));
  glassMeshes.forEach(m => { m.renderOrder = 3; });
  return { meshes: [...meshes, ...glassMeshes], material: mat, glass: gmat, bundles, count: list[0].length + list[1].length + list[2].length };
}

export async function captureEnvironment(renderer, scene, at, materials) {
  if (!renderer?.isWebGLRenderer) return null;
  const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(0.1, 400, rt);
  cam.position.copy(at);
  scene.add(cam);
  cam.update(renderer, scene);
  scene.remove(cam);
  for (const m of materials) { m.uniforms.uEnv.value = rt.texture; m.uniforms.uEnvOn.value = 1; }
  return rt;
}
