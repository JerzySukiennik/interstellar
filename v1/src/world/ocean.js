// Miller's Planet surface: endless knee-deep ocean, the kilometre wave with mist and spray, ripple simulation, wading interaction.
import * as THREE from 'three';
import { createMillerSky, MILLER_SKY_GLSL } from './miller-sky.js';

export const SEABED = -0.55;
const G = 12.75;
const DEPTH = 0.55;
const NO_MAX = 40;
const FACE_S = 3.0;
const CAP_U = 0.0021;
const EDGE_U = 0.0017;

const TIERS = {
  low: { na: 160, nu: 200, nz: 220, nu2: 120, nz2: 140, nv: 16, nof: 24, sim: 256, veilZ: 140, particles: 1024, zNear: 7 },
  medium: { na: 256, nu: 280, nz: 300, nu2: 150, nz2: 180, nv: 18, nof: 32, sim: 384, veilZ: 200, particles: 2048, zNear: 5 },
  high: { na: 320, nu: 360, nz: 400, nu2: 180, nz2: 220, nv: 20, nof: 40, sim: 512, veilZ: 260, particles: 4096, zNear: 3.5 },
  ultra: { na: 384, nu: 440, nz: 480, nu2: 200, nz2: 240, nv: 20, nof: 40, sim: 512, veilZ: 300, particles: 4096, zNear: 3 },
};

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;
const mod2pi = x => x - TAU * Math.floor(x / TAU);

const MEANDER = [[85, 0.00029, 1.3], [140, 0.000113, 4.1], [30, 0.00093, 0.4]];
const HSCALE = [[0.065, 0.00134, 2.2], [0.045, 0.00273, 0.7], [0.03, 0.0049, 4.0], [0.03, 0.00041, 1.1]];
const MEANDER0 = MEANDER.reduce((s, [a, k, p]) => s + a * Math.sin(p), 0);
const meander = z => MEANDER.reduce((s, [a, k, p]) => s + a * Math.sin(z * k + p), 0) - MEANDER0;
const hscale = z => HSCALE.reduce((s, [a, k, p]) => s + a * Math.sin(z * k + p), 1);

function buildProfile() {
  const D = Math.PI / 180;
  const L0 = 0.5, Lf = 1.5, Lc = 0.16, Lb = 7.5, Lmax = L0 + Lf + Lc + 18;
  const theta = l => {
    if (l < L0) return 0;
    l -= L0;
    if (l < Lf) { const u = l / Lf; return D * (54 * ss(0, 0.26, u) + 44 * Math.pow(ss(0.45, 1, u), 1.4)); }
    l -= Lf;
    if (l < Lc) return D * (98 - 120 * ss(0, 1, l / Lc));
    l -= Lc;
    const u = Math.min(1, l / Lb);
    return -D * (1.2 + 20.8 * Math.pow(1 - u, 1.35));
  };
  const step = 0.0004;
  const P = [{ l: 0, s: 0, h: 0, t: 0 }];
  let l = 0, s = 0, h = 0;
  while (l < Lmax) {
    const th = theta(l + step * 0.5);
    s += Math.cos(th) * step; h += Math.sin(th) * step; l += step;
    if (l > L0 + Lf + Lc && h <= 0) { P.push({ l, s, h: 0, t: theta(l) }); break; }
    P.push({ l, s, h, t: theta(l) });
  }
  let hmax = 0, iCrest = 0;
  P.forEach((p, i) => { if (p.h > hmax) { hmax = p.h; iCrest = i; } });
  let m = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    p.l /= hmax; p.s = (p.s - L0) / hmax; p.h /= hmax;
    if (i > 0) {
      const dl = p.l - P[i - 1].l;
      const hu = Math.min(1, Math.max(0, p.h));
      m += dl / (i <= iCrest ? 1 - 0.82 * Math.pow(hu, 0.8) : 0.35 + 0.65 * (1 - hu));
    }
    p.m = m;
  }
  const sMin = P[0].s - 0.02, sMax = P[P.length - 1].s + 0.02;
  const TW = 2048;
  const env = new Float32Array(TW).fill(-1);
  for (const p of P) {
    const k = Math.round((p.s - sMin) / (sMax - sMin) * (TW - 1));
    if (k >= 0 && k < TW) env[k] = Math.max(env[k], p.h);
  }
  env[0] = 0; env[TW - 1] = 0;
  for (let k = 1; k < TW - 1; k++) {
    if (env[k] >= 0) continue;
    let a = k - 1, b = k + 1;
    while (b < TW - 1 && env[b] < 0) b++;
    for (let j = k; j < b; j++) env[j] = env[a] + (env[b] - env[a]) * (j - a) / (b - a);
    k = b;
  }
  for (let k = 0; k < TW; k++) if (P[0].s > sMin + (sMax - sMin) * k / (TW - 1)) env[k] = 0;
  const ds = (sMax - sMin) / (TW - 1);
  const tex = new Float32Array(TW * 4);
  for (let k = 0; k < TW; k++) {
    const a = env[Math.max(0, k - 1)], b = env[Math.min(TW - 1, k + 1)];
    tex[k * 4] = env[k];
    tex[k * 4 + 1] = (b - a) / (2 * ds);
  }
  const carry = Float32Array.from(env);
  for (let k = TW - 2; k >= 0; k--) carry[k] = Math.max(carry[k], carry[k + 1] - 6 * ds);
  const lookup = s => {
    const u = Math.min(1, Math.max(0, (s - sMin) / (sMax - sMin))) * (TW - 1);
    const i = Math.min(TW - 2, Math.floor(u)), f = u - i;
    return carry[i] + (carry[i + 1] - carry[i]) * f;
  };
  return { P, iCrest, crest: P[iCrest], sMin, sMax, TW, env, tex, lookup };
}

function sampleProfile(prof, nu) {
  const { P, iCrest } = prof;
  let ia = P.findIndex(p => p.h >= EDGE_U);
  let ib = P.length - 1;
  while (ib > iCrest && P[ib].h < EDGE_U) ib--;
  const la = P[ia].l, lc = P[iCrest].l;
  const w = p => (p.l <= lc + 0.25 ? 1 + 2.5 * Math.exp(-(((p.l - la) / 0.06) ** 2)) + 1.2 * Math.exp(-(((p.l - lc) / 0.07) ** 2)) : 0.16);
  const cdf = [0];
  for (let i = ia + 1; i <= ib; i++) cdf.push(cdf[cdf.length - 1] + w(P[i]) * (P[i].l - P[i - 1].l));
  const total = cdf[cdf.length - 1];
  const out = [];
  let j = 0;
  for (let n = 0; n < nu; n++) {
    const target = total * n / (nu - 1);
    while (j < cdf.length - 2 && cdf[j + 1] < target) j++;
    const f = cdf[j + 1] > cdf[j] ? Math.min(1, Math.max(0, (target - cdf[j]) / (cdf[j + 1] - cdf[j]))) : 0;
    const a = P[ia + j], b = P[ia + Math.min(j + 1, cdf.length - 1)];
    const lerp = (x, y) => x + (y - x) * f;
    out.push({ s: lerp(a.s, b.s), h: lerp(a.h, b.h), t: lerp(a.t, b.t), l: lerp(a.l, b.l), m: lerp(a.m, b.m) });
  }
  for (let n = 0; n < nu; n++) out[n].dl = Math.abs(out[Math.min(nu - 1, n + 1)].l - out[Math.max(0, n - 1)].l) * 0.5;
  return out;
}

function zGrid(nz, nearSpacing, zMax) {
  let lo = 1e-4, hi = 1;
  for (let it = 0; it < 60; it++) {
    const c = (lo + hi) / 2;
    if ((nearSpacing / c) * Math.sinh(c * nz / 2) > zMax) hi = c; else lo = c;
  }
  const c = (lo + hi) / 2, A = nearSpacing / c;
  const z = [];
  for (let j = 0; j <= nz; j++) z.push(A * Math.sinh(c * (j - nz / 2)));
  return { z, A, c };
}

function waveGeometry(samples, nz, nearSpacing, zMax) {
  const { z, A, c } = zGrid(nz, nearSpacing, zMax);
  const nu = samples.length, nzv = z.length;
  const pos = new Float32Array(nu * nzv * 3), a1 = new Float32Array(nu * nzv * 4), a2 = new Float32Array(nu * nzv * 4);
  let k = 0;
  for (let j = 0; j < nzv; j++) {
    for (let i = 0; i < nu; i++, k++) {
      const p = samples[i];
      pos[k * 3 + 2] = z[j];
      a1.set([p.s, p.h, -Math.sin(p.t), Math.cos(p.t)], k * 4);
      a2.set([p.l, p.m, p.dl, i / (nu - 1)], k * 4);
    }
  }
  const idx = new Uint32Array((nu - 1) * (nzv - 1) * 6);
  let q = 0;
  for (let j = 0; j < nzv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, d = a + nu, e = d + 1;
      idx.set([a, d, b, b, d, e], q); q += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aProf', new THREE.BufferAttribute(a1, 4));
  g.setAttribute('aProf2', new THREE.BufferAttribute(a2, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  g.userData.zc = c; g.userData.zA = A;
  return g;
}

function radialGeometry(na, rMin, rMax) {
  const lnq = TAU / na;
  const rings = Math.ceil(Math.log(rMax / rMin) / lnq) + 1;
  const pos = new Float32Array((1 + rings * na) * 3);
  for (let i = 0; i < rings; i++) {
    const r = rMin * Math.exp(lnq * i);
    for (let j = 0; j < na; j++) {
      const a = (j + (i % 2) * 0.5) * lnq, k = 1 + i * na + j;
      pos[k * 3] = r * Math.cos(a); pos[k * 3 + 2] = r * Math.sin(a);
    }
  }
  const idx = new Uint32Array(na * 3 + (rings - 1) * na * 6);
  let q = 0;
  for (let j = 0; j < na; j++) idx.set([0, 1 + (j + 1) % na, 1 + j], (q += 3) - 3);
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < na; j++) {
      const a = 1 + i * na + j, b = 1 + i * na + (j + 1) % na, c = 1 + (i + 1) * na + j, d = 1 + (i + 1) * na + (j + 1) % na;
      idx.set([a, b, c, b, d, c], q); q += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return { geometry: g, gridK: lnq };
}

function veilGeometry(zs, nv, layers) {
  const n = zs.length;
  const pos = new Float32Array(n * nv * layers * 3), av = new Float32Array(n * nv * layers * 2);
  const idx = [];
  let k = 0;
  for (let L = 0; L < layers; L++) {
    const o = k;
    for (let j = 0; j < n; j++) for (let i = 0; i < nv; i++, k++) { pos[k * 3 + 2] = zs[j]; av[k * 2] = i / (nv - 1); av[k * 2 + 1] = L; }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < nv - 1; i++) {
      const a = o + j * nv + i, b = a + 1, c = a + nv, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aV', new THREE.BufferAttribute(av, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return g;
}

const COMMON = `
#define SEABED -0.55
uniform vec4 uOct[NO];
uniform vec4 uPh[NO];
uniform float uWarp;
uniform vec3 uOrigin;
uniform vec4 uWaves[2];
uniform float uCap;
uniform float uLevel;
uniform float uSteep;
uniform sampler2D uProfile;
uniform vec4 uProfRange;
uniform vec3 uBody;
uniform vec3 uSSS;
uniform vec3 uSeabed;
uniform float uFoamAlb;
uniform float uReflK;
uniform vec2 uSharp;
uniform vec3 uBodyDeep;
uniform vec4 uWaveAir;
float wMean(float sh){ float x2 = sh * sh; return exp(-sh) * (1.0 + x2 / 4.0 + x2 * x2 / 64.0 + x2 * x2 * x2 / 2304.0 + x2 * x2 * x2 * x2 / 147456.0); }
float wMeander(float z){ return 85.0 * sin(z * 0.00029 + 1.3) + 140.0 * sin(z * 0.000113 + 4.1) + 30.0 * sin(z * 0.00093 + 0.4) - (-20.9738); }
float wMeanderD(float z){ return 85.0 * 0.00029 * cos(z * 0.00029 + 1.3) + 140.0 * 0.000113 * cos(z * 0.000113 + 4.1) + 30.0 * 0.00093 * cos(z * 0.00093 + 0.4); }
float wHScale(float z){ return 1.0 + 0.065 * sin(z * 0.00134 + 2.2) + 0.045 * sin(z * 0.00273 + 0.7) + 0.03 * sin(z * 0.0049 + 4.0) + 0.03 * sin(z * 0.00041 + 1.1); }
float wHScaleD(float z){ return 0.065 * 0.00134 * cos(z * 0.00134 + 2.2) + 0.045 * 0.00273 * cos(z * 0.00273 + 0.7) + 0.03 * 0.0049 * cos(z * 0.0049 + 4.0) + 0.03 * 0.00041 * cos(z * 0.00041 + 1.1); }
float wJag(float z){ return 0.5 * 0.022 * sin(z * 0.0071 + 0.3) + 0.016 * sin(z * 0.0167 + 2.1) + 0.004 * sin(z * 0.029 + 4.4); }
vec2 profEnv(float s){
  float u = clamp((s - uProfRange.x) * uProfRange.y, 0.0, 1.0) * (uProfRange.z - 1.0);
  float i = min(floor(u), uProfRange.z - 2.0);
  float f = u - i;
  vec2 a = texelFetch(uProfile, ivec2(int(i), 0), 0).rg;
  vec2 b = texelFetch(uProfile, ivec2(int(i) + 1, 0), 0).rg;
  return mix(a, b, f);
}
vec2 wDraw(float sm, float H){
  float c = sm + 0.09 * H;
  float w = 0.075 * H;
  float g = exp(-c * c / (w * w));
  return vec2(-0.36 * g, 0.72 * c / (w * w) * g);
}
float oceanWave(vec2 xz, out float prox, out float slope){
  float h = 0.0; prox = 0.0; slope = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 W = uWaves[i];
    if (W.z < 0.5) continue;
    float H = W.y * wHScale(xz.y + W.w);
    float sm = xz.x - (W.x + wMeander(xz.y + W.w));
    vec2 e = profEnv(sm / H);
    float below = step(e.x, uCap);
    vec2 dd = wDraw(sm, H);
    h += min(e.x, uCap) * H + dd.x;
    slope += e.y * below + dd.y;
    prox = max(prox, sm < 0.0 ? exp(sm / (0.28 * H)) : 1.0 - smoothstep(0.0, 0.3, sm / H));
  }
  return h;
}
float chopV(vec2 p, float spacing, vec2 sel){
  float h = 0.0; vec2 q = p;
  for (int i = 0; i < NV; i++) {
    vec4 o = uOct[i];
    float x = dot(o.xy, q) * o.z + dot(uPh[i].xy, sel);
    float sh = 1.0 + (uPh[i].w - 1.0) * sel.x;
    float w = exp(sh * (sin(x) - 1.0));
    float dw = sh * w * cos(x);
    float f = clamp(6.2831853 / (o.z * spacing) * 0.25 - 0.5, 0.0, 1.0);
    h += o.w * f * (w - wMean(sh));
    q += o.xy * (dw * o.w * uWarp);
  }
  return h;
}
float chopF(vec2 p, float fp, vec2 sel, float rp, int nmax, float shk, out vec2 g, out float var){
  float h = 0.0; g = vec2(0.0); var = 0.0; vec2 q = p;
  for (int i = 0; i < NOF; i++) {
    if (i >= nmax) { var += uPh[i].z * rp * rp * 0.15; break; }
    vec4 o = uOct[i];
    float f = clamp(0.8 / (o.z * fp) - 1.0, 0.0, 1.0);
    if (f <= 0.0) { var += uPh[i].z * rp * rp; break; }
    float x = dot(o.xy, q) * o.z + dot(uPh[i].xy, sel);
    float sh = i < NV ? 1.0 + (uPh[i].w - 1.0) * sel.x : shk;
    float w = exp(sh * (sin(x) - 1.0));
    float dw = sh * w * cos(x);
    float a = o.w * f * (o.z > 4.0 ? rp : 1.0);
    h += a * (w - wMean(sh));
    g += (a * o.z * dw) * o.xy;
    float sl = o.w * o.z;
    var += (1.0 - f) * sl * sl * 0.3;
    q += o.xy * (dw * o.w * uWarp);
  }
  return h;
}
vec3 wIrr(){ return mSkyTop * 0.72 + mSkyHorizon * 0.28 + mGlowCol * 0.3; }
float wOcc(vec3 p){
  float o = 1.0;
  for (int i = 0; i < 2; i++) {
    vec4 W = uWaves[i];
    if (W.z < 0.5) continue;
    float dx = W.x + wMeander(p.z + W.w) + 0.35 * W.y - p.x;
    if (dx <= 0.0) continue;
    float s = sin(max(atan(W.y * 0.9 - p.y, dx), 0.0));
    o -= 0.16 * s * s;
  }
  return max(o, 0.72);
}
vec3 wReflWave(vec3 p, vec3 R, vec3 sky){
  for (int i = 0; i < 2; i++) {
    vec4 W = uWaves[i];
    if (W.z < 0.5 || R.x < 1e-3) continue;
    float H = W.y * wHScale(p.z + W.w);
    float xf = W.x + wMeander(p.z + W.w) + 0.3 * H;
    float t = (xf - p.x) / R.x;
    if (t <= 0.0) continue;
    float y = p.y + R.y * t;
    float m = 1.0 - smoothstep(H * 0.62, H * 0.95, y);
    float T = exp(-millerOptical(p, p + R * t));
    vec3 wc = mix(millerInscatter(R), (mSkyTop * 0.75 + mSkyHorizon * 0.25) * 0.62, T);
    sky = mix(sky, wc, m);
  }
  return sky;
}
vec3 waterShade(vec3 p, vec3 N, vec3 V, float rough, float lift, float foam, float occ, vec3 bodyC, float rk){
  float nv = clamp(dot(N, V), 0.0, 1.0);
  nv = max(nv, min(sqrt(rough * rough + 0.016) * 0.7, 0.5));
  float F = (0.02 + 0.98 * pow(1.0 - nv, 5.0)) * uReflK * rk;
  vec3 R0 = reflect(-V, N);
  vec3 R = normalize(vec3(R0.x, abs(R0.y) * 0.6 + 0.012, R0.z));
  vec3 irr = wIrr() * occ;
  vec3 refl = wReflWave(p, R, millerSkyR(R));
  refl = mix(refl, mix(uBody * irr * 2.0, millerHazeColor(R0), 0.55), smoothstep(0.02, -0.25, R0.y));
  float sky = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = bodyC * irr * (0.35 + 0.65 * sky * sky) + uSSS * irr * lift;
  vec3 c = mix(body, refl, F);
  return mix(c, irr * uFoamAlb, clamp(foam, 0.0, 1.0));
}
`;

const OCEAN_VERT = MILLER_SKY_GLSL + COMMON + `
uniform sampler2D uSim;
uniform vec4 uSimP;
uniform float uGridK;
uniform float uSpC;
uniform vec4 uPhL[NO];
varying vec3 vW;
varying vec2 vLag;
#ifdef PATCH
varying vec3 vWorldP;
#endif
float chopLag(vec2 p, float spacing, int which){
  float h = 0.0; vec2 q = p;
  for (int i = 0; i < NV; i++) {
    vec4 o = uOct[i];
    float x = dot(o.xy, q) * o.z + (which == 0 ? uPhL[i].x : uPhL[i].y);
    float sh = uPh[i].w;
    float w = exp(sh * (sin(x) - 1.0));
    float dw = sh * w * cos(x);
    float f = clamp(6.2831853 / (o.z * spacing) * 0.25 - 0.5, 0.0, 1.0);
    h += o.w * f * (w - wMean(sh));
    q += o.xy * (dw * o.w * uWarp);
  }
  return h;
}
float simH(vec2 xz){
  vec2 su = (xz - uSimP.xy) / uSimP.z + 0.5;
  vec2 e = min(su, 1.0 - su);
  float f = smoothstep(0.0, 0.08, min(e.x, e.y));
  return f > 0.0 ? textureLod(uSim, su, 0.0).r * f : 0.0;
}
void main(){
  vec2 lp = position.xz;
  vec2 xz = lp + uOrigin.xz;
  float sp = uSpC > 0.0 ? uSpC : max(length(lp), 0.4) * uGridK;
  float prox, sl;
  float wh = oceanWave(xz, prox, sl);
  float amp = (1.0 + uSteep * prox) * clamp((0.55 + uLevel) / 0.45, 0.85, 1.0);
  float h = chopV(lp, sp, vec2(1.0, 0.0)) * amp + wh + uLevel + simH(xz);
  float spL = max(sp, 0.08);
  vLag = length(lp) < 600.0 ? vec2(chopLag(lp, spL, 0), chopLag(lp, spL, 1)) * amp : vec2(-1.0);
  h = max(h, SEABED + 0.012);
  vW = vec3(xz.x, h, xz.y);
#ifdef PATCH
  vec4 wwp = modelMatrix * vec4(vW, 1.0);
  vWorldP = wwp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wwp;
#else
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
#endif
}`;

const OCEAN_FRAG = MILLER_SKY_GLSL + COMMON + `
uniform sampler2D uSim;
uniform vec4 uSimP;
uniform vec4 uRings[8];
uniform vec4 uWind;
uniform vec4 uFoamQ;
uniform vec4 uFoamK;
uniform sampler2D uRipple;
uniform vec4 uRipK;
uniform vec2 uRipO[3];
uniform vec4 uShade[4];
uniform vec4 uShadeB[4];
varying vec3 vW;
varying vec2 vLag;
#ifdef PATCH
varying vec3 vWorldP;
uniform mat4 modelMatrix;
#endif
void wRipple(vec2 xz, float T, float an, float sl, vec2 off, float fp, float rk, inout vec2 g, inout float var){
  vec2 cs = vec2(cos(an), sin(an));
  mat2 Rm = mat2(cs.x, cs.y, -cs.y, cs.x);
  vec4 rt = texture(uRipple, (Rm * (xz - uOrigin.xz)) / T + off);
  float fd = clamp(T / (fp * 70.0) - 0.4, 0.0, 1.0);
  g += (transpose(Rm) * rt.xy) * sl * rk * fd;
  var += (1.0 - fd) * sl * sl * rk * rk;
}
void main(){
  vec3 p = vW;
#ifdef PATCH
  vec3 pw = vWorldP;
#else
  vec3 pw = p;
#endif
  vec3 V = cameraPosition - pw;
  float dist = length(V);
  V /= dist;
  vec2 lp = p.xz - uOrigin.xz;
  float fp = max(max(length(dFdx(p.xz)), length(dFdy(p.xz))), 1e-4);
  float prox, sl;
  oceanWave(p.xz, prox, sl);
  float amp = (1.0 + uSteep * prox) * clamp((0.55 + uLevel) / 0.45, 0.85, 1.0);
  vec2 g; float var;
  vec2 wd = uWind.xy;
  vec2 pf = p.xz - (wd * (0.3 + 0.6 * uWind.z) + vec2(uWind.w * 3.5, 0.0)) * mTime;
  float slickN = texture(mNoise, pf / 52.0 + 0.13).b * 0.65 + texture(mNoise, pf / 17.0 + 0.71).a * 0.35;
  float rough = mix(0.5, smoothstep(0.34, 0.64, slickN), 1.0 - smoothstep(150.0, 800.0, dist));
  float rp = mix(0.6, 1.2, rough);
  float hc = chopF(lp, fp, vec2(1.0, 0.0), rp, uRipK.w > 0.5 ? 22 : NOF, uSharp.x, g, var) * amp;
  if (uRipK.w > 0.5) {
    float rk = rp * uRipK.x;
    wRipple(p.xz, 2.9, 0.6, 0.2, uRipO[0], fp, rk, g, var);
    wRipple(p.xz, 1.07, 2.3, 0.165, uRipO[1], fp, rk, g, var);
    wRipple(p.xz, 0.41, 4.1, 0.115, uRipO[2], fp, rk, g, var);
  }
  g *= amp; var *= amp * amp;
  g.x += sl;
  vec2 su = (p.xz - uSimP.xy) / uSimP.z + 0.5;
  vec2 se = min(su, 1.0 - su);
  float sf = smoothstep(0.0, 0.08, min(se.x, se.y));
  float simFoam = 0.0;
  if (sf > 0.0) {
    float tx = uSimP.w / uSimP.z;
    vec4 c0 = textureLod(uSim, su, 0.0);
    float hl = textureLod(uSim, su - vec2(tx, 0.0), 0.0).r, hr = textureLod(uSim, su + vec2(tx, 0.0), 0.0).r;
    float hd = textureLod(uSim, su - vec2(0.0, tx), 0.0).r, hu = textureLod(uSim, su + vec2(0.0, tx), 0.0).r;
    float lodf = clamp(uSimP.w * 3.0 / fp - 1.0, 0.0, 1.0);
    g += vec2(hr - hl, hu - hd) / (2.0 * uSimP.w) * sf * lodf;
    simFoam = c0.b * sf;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec2 ax = vec2(dot(pf, wd), dot(pf, vec2(-wd.y, wd.x)));
  float streak = texture(mNoise, ax * vec2(1.0 / 64.0, 1.0 / 10.0)).g * 0.65 + texture(mNoise, ax * vec2(1.0 / 23.0, 1.0 / 4.5) + 0.41).g * 0.35;
  float patches = texture(mNoise, pf / 170.0 + 0.3).b;
  vec2 af = ax * vec2(0.55, 1.0);
  float fg1 = texture(mNoise, af / 3.6 + 0.21).g, fg2 = texture(mNoise, af / 1.35 + 0.47).g, fl = texture(mNoise, af / 2.2 + 0.05).r;
  float blot = clamp(fg1 * 0.75 + fg2 * 0.45 - 0.18, 0.0, 1.0);
  float lace = smoothstep(0.15, 0.6, blot) * (0.55 + 0.45 * fg2) * (1.0 - 0.45 * fl);
  float jit = (patches - 0.5) * uFoamQ.w * 1.5 + (blot - 0.4) * uFoamQ.w;
  float wcNow = smoothstep(uFoamQ.y, uFoamQ.z, hc / sqrt(amp) + jit);
  float wcLag = max(smoothstep(uFoamQ.y, uFoamQ.z, vLag.x / sqrt(amp) + jit) * 0.8, smoothstep(uFoamQ.y, uFoamQ.z, vLag.y / sqrt(amp) + jit) * 0.5);
  float wc = max(wcNow, wcLag) * uFoamK.x * (0.6 + 0.6 * rough);
  float st = smoothstep(0.6, 0.9, streak) * uFoamK.y * (0.35 + 1.8 * prox + 0.8 * uWind.w) * smoothstep(-0.2, 0.6, patches) * (0.5 + 0.5 * rough);
  float dz = smoothstep(0.78, 1.0, prox) * step(0.5, uWaves[0].z + uWaves[1].z);
  float drawn = smoothstep(0.42, 0.8, texture(mNoise, vec2(p.z / 6.5, (p.x - mTime * 9.0) / 44.0)).g * 0.7 + texture(mNoise, vec2(p.z / 2.1, (p.x - mTime * 13.0) / 15.0) + 0.3).g * 0.4);
  float boil = smoothstep(0.82, 1.0, prox) * uFoamK.z * 0.5 + dz * drawn * 0.9;
  float rf = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 R = uRings[i];
    if (R.w <= 0.0) continue;
    float age = mTime - R.z;
    if (age < 0.0 || age > 7.0) continue;
    float rad = 0.15 + (0.45 + 0.6 * sqrt(R.w)) * sqrt(age);
    float d = length(p.xz - R.xy);
    float wdt = 0.06 + 0.12 * age + 0.03 * R.w;
    float x = (d - rad) / wdt;
    rf += min(sqrt(R.w), 2.0) * (exp(-x * x) * 0.8 + exp(-d * d / (rad * rad)) * 0.35) * exp(-age * (0.5 + 1.1 / max(R.w, 0.3)));
  }
  float foam = (wc + st + boil) * lace * 1.3 + clamp(simFoam * uFoamK.w, 0.0, 1.2) * (0.35 + 0.8 * lace) + rf * (0.3 + 0.8 * lace);
  float lift = smoothstep(uFoamQ.x, uFoamQ.z, hc);
  float occ = wOcc(p);
  float shd = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 S0 = uShade[i], S1 = uShadeB[i];
    if (S1.z <= 0.0) continue;
    vec2 dd = p.xz - S0.xy;
    vec2 cs = vec2(cos(S1.w), sin(S1.w));
    vec2 q = vec2(dot(dd, cs), dot(dd, vec2(-cs.y, cs.x))) / S0.zw;
    shd = max(shd, S1.z * (1.0 - smoothstep(0.55, 1.15, length(q))));
  }
  occ *= 1.0 - 0.6 * shd;
#ifdef PATCH
  N = normalize(mat3(modelMatrix) * N);
#endif
  vec3 col = waterShade(p, N, V, sqrt(var), lift, foam, occ, uBody, 1.0);
  col *= 1.0 - 0.45 * shd;
  float depth = p.y - SEABED;
  float wet = (1.0 - smoothstep(0.012, 0.2, depth)) * smoothstep(0.2, 0.55, texture(mNoise, p.xz / 7.0 + 0.4).b + 0.25);
  float silt = texture(mNoise, p.xz / 2.3).a * 0.6 + texture(mNoise, p.xz / 0.7 + 0.2).b * 0.4;
  vec3 bed = uSeabed * wIrr() * occ * (0.65 + 0.7 * silt);
  vec3 sheen = millerSkyR(normalize(reflect(-V, normalize(vec3(-g.x * 0.3, 1.0, -g.y * 0.3))))) * (0.02 + 0.98 * pow(1.0 - clamp(dot(V, vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 5.0)) * 0.35;
  col = mix(col, bed + sheen, wet * 0.75);
  col = mix(col, millerInscatter(-V) * 1.02, dz * dz * 0.35 * smoothstep(0.2, 0.8, drawn + patches * 0.4));
  if (!gl_FrontFacing) {
    float cw = clamp(dot(-N, V), 0.0, 1.0);
    col = mix(mMurk * 1.4, wIrr() * 0.8 * occ, smoothstep(0.3, 0.9, cw));
  }
  col = millerHaze(col, pw);
  gl_FragColor = vec4(col, 1.0);
}`;

const WAVE_VERT = MILLER_SKY_GLSL + COMMON + `
attribute vec4 aProf;
attribute vec4 aProf2;
uniform vec4 uW;
uniform vec2 uZGrid;
uniform float uFaceAmp;
uniform float uFlow;
uniform float uWPh;
varying vec3 vW;
varying vec3 vN;
varying vec4 vInfo;
varying float vM;
#ifdef PATCH
varying vec3 vWorldP;
#endif
const vec4 BD[8] = vec4[8](vec4(0.25, 0.97, 0.0045, 8.5), vec4(0.6, 0.8, 0.0072, 6.5), vec4(-0.4, 0.92, 0.01208, 5.2), vec4(0.85, 0.53, 0.0203, 3.2), vec4(-0.7, 0.71, 0.0331, 2.0), vec4(0.3, 0.95, 0.0524, 1.25), vec4(-0.5, 0.87, 0.0838, 0.7), vec4(0.75, 0.66, 0.1366, 0.38));
float bigDispV(float z, float l, float sp){
  float h = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 b = BD[i];
    float f = clamp(6.2831853 / (b.z * sp) * 0.25 - 0.5, 0.0, 1.0);
    h += b.w * f * sin(dot(b.xy, vec2(z, (l - uFlow * 0.6) * 0.3)) * b.z + float(i) * 1.7);
  }
  return h;
}
void main(){
  float zl = position.z;
  float z = zl + uW.w;
  float zp = z + uWPh;
  float hs = wHScale(zp);
  float H = uW.y * hs;
  float base = uW.x + wMeander(zp);
  float a = wMeanderD(zp) + aProf.x * uW.y * wHScaleD(zp);
  float b = aProf.y * uW.y * wHScaleD(zp);
  vec3 N = normalize(vec3(aProf.z, aProf.w, -(aProf.z * a + aProf.w * b)));
  float hm = aProf.y * H;
  float capm = uCap * H;
  float mode = smoothstep(capm, capm + 60.0, hm);
  float jag = wJag(zp) * smoothstep(0.7, 1.0, aProf.y) * H;
  vec3 wp = vec3(base + aProf.x * H, hm + jag, z);
  float lm = aProf2.x * H;
  float dist = length(wp - cameraPosition);
  float spz = uZGrid.x * sqrt(uZGrid.y * uZGrid.y + zl * zl);
  float sp = max(max(spz, aProf2.z * H), dist * 0.0012);
  float hw = 0.0;
  if (mode < 0.999) {
    float prox, sl;
    oceanWave(wp.xz, prox, sl);
    hw = chopV(wp.xz - uOrigin.xz, sp, vec2(1.0, 0.0)) * (1.0 + uSteep * prox);
  }
  float hf = 0.0;
  if (mode > 0.001) {
    vec2 q = vec2(z - uOrigin.z + 0.42 * lm, (lm - uFlow * 0.6) * 0.36) / ${FACE_S.toFixed(1)};
    float fm = smoothstep(capm + 4.0, capm + 70.0, hm);
    hf = chopV(q, sp / ${FACE_S.toFixed(1)}, vec2(0.0, 1.0)) * ${FACE_S.toFixed(1)} * uFaceAmp + bigDispV(z, lm, sp) * fm;
  }
  wp += mix(vec3(0.0, hw, 0.0), N * hf, mode);
  vW = wp;
  vN = N;
  vInfo = vec4(lm, H, aProf.y, mode);
  vM = aProf2.y * H;
#ifdef PATCH
  vec4 wwp = modelMatrix * vec4(wp, 1.0);
  vWorldP = wwp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wwp;
#else
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
#endif
}`;

const WAVE_FRAG = MILLER_SKY_GLSL + COMMON + `
uniform vec4 uW;
uniform float uFaceAmp;
uniform float uFlow;
uniform vec4 uFoamQ;
uniform vec4 uFaceFoam;
uniform float uWaveMist;
uniform sampler2D uRipple;
uniform float uWPh;
varying vec3 vW;
varying vec3 vN;
varying vec4 vInfo;
varying float vM;
#ifdef PATCH
varying vec3 vWorldP;
uniform mat4 modelMatrix;
#endif
const vec4 BD[8] = vec4[8](vec4(0.25, 0.97, 0.0045, 8.5), vec4(0.6, 0.8, 0.0072, 6.5), vec4(-0.4, 0.92, 0.01208, 5.2), vec4(0.85, 0.53, 0.0203, 3.2), vec4(-0.7, 0.71, 0.0331, 2.0), vec4(0.3, 0.95, 0.0524, 1.25), vec4(-0.5, 0.87, 0.0838, 0.7), vec4(0.75, 0.66, 0.1366, 0.38));
vec2 bigDispG(float z, float l, float fp){
  vec2 g = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 b = BD[i];
    float f = clamp(3.14159265 / (b.z * fp) - 1.0, 0.0, 1.0);
    g += b.w * b.z * f * cos(dot(b.xy, vec2(z, (l - uFlow * 0.6) * 0.3)) * b.z + float(i) * 1.7) * vec2(b.x, b.y * 0.3);
  }
  return g;
}
float wVein(vec2 fu, vec2 wq, float T, float L, float fpf, float Wm){
  vec2 m = fu / vec2(T, T * 8.0) + wq * (0.25 + 0.15 * L) + vec2(0.23, 0.61) * L;
  float r = 1.0 - abs(2.0 * texture(mNoise, m).a - 1.0);
  float wl = Wm * 9.0 / T;
  float wa = 9.0 * fpf * 1.2 / T;
  float w = max(wl, wa);
  float ln = smoothstep(1.0 - w, 1.0 - w * 0.35, r) * clamp(wl / w * 1.6, 0.0, 1.0);
  float fade = clamp(1.6 - wa / (wl * 3.0), 0.0, 1.0);
  return mix(wl * 1.1, ln, fade);
}
void main(){
  vec3 p = vW;
#ifdef PATCH
  vec3 pw = vWorldP;
#else
  vec3 pw = p;
#endif
  vec3 V = cameraPosition - pw;
  float dist = length(V);
  V /= dist;
  float lm = vInfo.x, H = vInfo.y, hu = vInfo.z, mode = vInfo.w;
  float air = clamp(uWaveAir.x, 0.0, 1.0);
  float hkm = 0.82 - 0.5 * air;
  float hks = (1.0 - 0.9 * air) * (0.06 + 0.94 * exp(-max(p.y, 0.0) / 100.0));
  vec2 fc = vec2(p.z - uOrigin.z, lm);
  float fpf = max(length(fwidth(fc)), 1e-3);
  vec2 dFdxF = vec2(dFdx(fc.x) + 0.42 * dFdx(fc.y), dFdx(fc.y));
  vec2 dFdyF = vec2(dFdy(fc.x) + 0.42 * dFdy(fc.y), dFdy(fc.y));
  float fpw = max(length(fwidth(p.xz)), 1e-4);
  if (!gl_FrontFacing) {
    vec3 c = mMurk * 2.5 + uBody * wIrr() * 0.5 * smoothstep(-0.5, 1.0, -V.y);
    gl_FragColor = vec4(millerHaze(c, pw), 1.0);
    return;
  }
  float mist0 = smoothstep(0.82, 0.98, hu - 0.05);
  if (mist0 > 0.999) {
    gl_FragColor = vec4(millerHazeK(millerInscatter(-V), pw, hkm, hks), 1.0);
    return;
  }
  vec3 Nb = normalize(vN);
  vec3 Tl = normalize(vec3(Nb.y, -Nb.x, 0.0));
  vec3 Tz = cross(Tl, Nb);
  float capm = uCap * H;
  float hm = p.y;
  vec3 N = Nb;
  float var = 0.0, hc = 0.0;
  if (mode > 0.001) {
    float fm = smoothstep(capm + 4.0, capm + 70.0, hm);
    vec2 bg = bigDispG(p.z, lm, fpf) * fm;
    vec2 gq; float vq;
    float hq = chopF(vec2(fc.x + 0.42 * fc.y, (fc.y - uFlow * 0.6) * 0.36) / ${FACE_S.toFixed(1)}, fpf * 0.75 / ${FACE_S.toFixed(1)}, vec2(0.0, 1.0), 1.0, NOFACE, 1.0, gq, vq);
    gq *= uFaceAmp;
    vec2 sq = vec2(fc.x + 0.42 * fc.y, fc.y - uFlow * 0.4);
    vec2 swq = texture(mNoise, sq / vec2(160.0, 900.0)).ba - 0.5;
    vec2 st1 = textureGrad(uRipple, sq / vec2(7.0, 64.0) + swq * 1.7, dFdxF / vec2(7.0, 64.0), dFdyF / vec2(7.0, 64.0)).xy;
    vec2 st2 = textureGrad(uRipple, sq / vec2(23.0, 190.0) + 0.37 + swq * 0.9, dFdxF / vec2(23.0, 190.0), dFdyF / vec2(23.0, 190.0)).xy;
    float sf1 = clamp(7.0 / (fpf * 28.0) - 0.4, 0.0, 1.0), sf2 = clamp(23.0 / (fpf * 28.0) - 0.4, 0.0, 1.0);
    vec2 sg = st1 / vec2(7.0, 64.0) * 7.0 * 0.22 * sf1 + st2 / vec2(23.0, 190.0) * 23.0 * 0.18 * sf2;
    var += ((1.0 - sf1) * 0.05 + (1.0 - sf2) * 0.03) * mode;
    vec2 gf = vec2(gq.x, gq.x * 0.42 + gq.y * 0.36) + bg + vec2(sg.x, sg.x * 0.42 + sg.y) * 1.4;
    N = normalize(Nb - (gf.x * Tz + gf.y * Tl) * mode);
    var += vq * uFaceAmp * uFaceAmp * mode;
    hc += hq * uFaceAmp * mode;
  }
  float prox = 1.0;
  if (mode < 0.999) {
    float sl;
    oceanWave(p.xz, prox, sl);
    float amp = 1.0 + uSteep * prox;
    vec2 gw; float vw;
    float hw = chopF(p.xz - uOrigin.xz, fpw, vec2(1.0, 0.0), 1.0, NOFACE, 1.0, gw, vw) * amp;
    gw *= amp;
    N = normalize(N - vec3(gw.x, 0.0, gw.y) * (1.0 - mode));
    var += vw * amp * amp * (1.0 - mode);
    hc += hw * (1.0 - mode);
  }
  vec2 fu = vec2(p.z + 0.42 * lm, vM - uFlow);
  vec2 wq = texture(mNoise, fu * vec2(1.0 / 700.0, 1.0 / 2100.0)).ba - 0.5;
  vec2 pvv = texture(mNoise, fu * vec2(1.0 / 1100.0, 1.0 / 1700.0) + 0.2).ba;
  float pv = pvv.x, pv2 = pvv.y;
  float slick = smoothstep(0.5, 0.7, pv * 0.7 + pv2 * 0.3) * 0.3;
  float veins = max(max(wVein(fu, wq, 520.0, 0.0, fpf, 3.0), wVein(fu, wq, 180.0, 1.0, fpf, 1.2) * 0.8), wVein(fu, wq, 60.0, 2.0, fpf, 0.45) * 0.6);
  float veinBreak = texture(mNoise, fu / vec2(19.0, 55.0) + 0.3).g;
  veins *= (0.6 + 0.4 * smoothstep(0.2, 0.6, veinBreak)) * smoothstep(0.004, 0.05, hu) * uFaceFoam.x;
  veins *= 0.6 + 0.4 * smoothstep(0.3, 0.6, pv * 0.6 + pv2 * 0.6);
  vec2 bu = vec2(p.z, vM - uFlow * 1.7);
  vec3 bb = texture(mNoise, bu / vec2(46.0, 80.0)).gba;
  float b1 = bb.x, b2 = bb.z, b3 = bb.y;
  float tz = 1.0 - smoothstep(capm + 3.0, capm + 45.0 + 45.0 * b3, hm);
  float bf = b1 * 0.8 + b2 * 0.2;
  float boil = tz * uFaceFoam.y * (0.7 * wVein(bu, wq, 90.0, 3.0, fpf, 1.0) + 0.3 * smoothstep(0.5, 0.85, b1 * 0.8 + b3 * 0.3));
  float v3 = veinBreak;
  float v2 = b2;
  float caps = smoothstep(uFoamQ.x, uFoamQ.z, hc) * uFaceFoam.z * mode * (0.12 + 1.6 * smoothstep(0.03, 0.35, veins)) * (0.5 + 0.5 * v2);
  caps *= 1.0 - smoothstep(0.35, 1.3, fpf);
  float crestW = smoothstep(0.78, 1.0, hu) * uFaceFoam.w * (0.5 + 0.5 * bf);
  float foam = clamp(max(veins, boil) + caps + crestW, 0.0, 1.0);
  float lift = smoothstep(0.0, 1.0, hc / max(uFoamQ.z * uFaceAmp, 1e-3)) * 0.6 * (1.0 - mode);
#ifdef PATCH
  N = normalize(mat3(modelMatrix) * N);
#endif
  vec3 col = waterShade(p, N, V, sqrt(var), lift, foam, mix(wOcc(p), 1.0, mode), mix(uBody, uBodyDeep, mode), mix(1.0, 0.8 - 0.08 * slick, mode));
  col *= mix(vec3(1.0), vec3(0.9, 0.97, 1.08) * uWaveAir.y, mode);
  float mist = smoothstep(0.82, 0.98, hu + (pv2 - 0.5) * 0.06 + (pv - 0.5) * 0.04);
  vec3 ins = millerInscatter(-V);
  col = mix(col, ins, uWaveMist * (1.0 - exp(-dist / 2500.0)) * (1.0 - air));
  col = mix(col, ins * 1.02, tz * (0.06 + 0.1 * b3) * smoothstep(0.3, 0.8, b1 + 0.2));
  col = mix(col, ins, mist);
  col = millerHazeK(col, pw, hkm, hks);
  gl_FragColor = vec4(col, 1.0);
}`;

const VEIL_VERT = MILLER_SKY_GLSL + COMMON + `
attribute vec2 aV;
uniform vec4 uW;
uniform vec4 uVeil;
uniform vec4 uVeil2;
uniform float uWPh;
varying vec3 vW;
varying float vV;
varying vec3 vNs;
void main(){
  float z = position.z + uW.w;
  float zp = z + uWPh;
  float H = uW.y * wHScale(zp);
  float base = uW.x + wMeander(zp);
  float v = aV.x, L = aV.y;
  float bend = v * v;
  float s = uVeil.x + uVeil.z * (v * 0.6 + bend * 0.4) - L * 0.028 * uVeil2.w;
  float h = uVeil.y + uVeil.w * v + L * 0.012 + wJag(zp) * uVeil2.y * (1.0 - v * 0.5);
  vW = vec3(base + s * H, h * H, z);
  vV = v;
  vNs = normalize(vec3(-uVeil.w, uVeil.z, 0.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const VEIL_FRAG = MILLER_SKY_GLSL + COMMON + `
uniform vec4 uW;
uniform vec4 uVeil;
uniform vec4 uVeil2;
uniform float uFlow;
varying vec3 vW;
varying float vV;
varying vec3 vNs;
void main(){
  vec3 p = vW;
  vec3 V = normalize(cameraPosition - p);
  float v = vV;
  float sp = uVeil2.z;
  float n = texture(mNoise, vec2(p.z / 640.0, v * 0.8 - mTime * sp)).b * 0.6 + texture(mNoise, vec2(p.z / 210.0, v * 1.9 - mTime * sp * 2.3) + 0.3).b * 0.4;
  float dens = smoothstep(0.4, 0.8, n + 0.25 * (1.0 - v) - 0.1);
  dens *= pow(1.0 - v, 1.4) * smoothstep(0.0, 0.1, v);
  float ef = smoothstep(0.04, 0.45, abs(dot(vNs, V)));
  float a = clamp(dens * uVeil2.x * ef * smoothstep(15.0, 160.0, length(cameraPosition - p)), 0.0, 1.0);
  vec3 col = mix(wIrr() * 0.92, millerInscatter(-V) * 1.05, uVeil2.y);
  col = millerHaze(col, p);
  gl_FragColor = vec4(col, a);
}`;

const SPRAY_VERT = MILLER_SKY_GLSL + `
attribute vec3 aP0;
attribute vec3 aV;
attribute vec4 aT;
uniform float uPx;
uniform vec2 uWindV;
uniform vec2 uRes;
varying float vA;
varying vec3 vW;
varying vec3 vS;
void main(){
  float age = mTime - aT.x;
  if (age < 0.0 || age > aT.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vW = vec3(0.0); vS = vec3(1.0, 0.0, 1.0); return; }
  float k = 1.8;
  float ek = exp(-k * age);
  vec3 gk = vec3(uWindV.x, -12.75, uWindV.y) / k;
  vec3 p = aP0 + (aV - gk) * (1.0 - ek) / k + gk * age;
  vec3 vel = (aV - gk) * ek + gk;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * (viewMatrix * vec4(p + vel * 0.022, 1.0));
  vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * 0.5 * uRes;
  float base = clamp(aT.z * uPx / max(-mv.z, 0.05), 1.0, 48.0);
  float len = min(length(d), 64.0);
  float sz = base + len;
  gl_Position = c0;
  gl_PointSize = sz;
  vS = vec3(len > 0.01 ? d / max(length(d), 1e-4) : vec2(1.0, 0.0), base / sz);
  vA = (1.0 - age / aT.y) * smoothstep(0.0, 0.03, age) * smoothstep(-0.1, 0.05, p.y - aP0.y + 0.15) * aT.w * clamp(base / 2.0, 0.35, 1.0);
  vW = p;
}`;

const SPRAY_FRAG = MILLER_SKY_GLSL + `
varying float vA;
varying vec3 vW;
varying vec3 vS;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  vec2 dir = vS.xy;
  float along = dot(c, dir);
  float across = dot(c, vec2(-dir.y, dir.x)) / max(vS.z, 0.02);
  float r2 = along * along + across * across;
  if (r2 > 1.0 || vA <= 0.0) discard;
  float a = (1.0 - r2) * vA * 0.85;
  vec3 col = (mSkyTop * 0.9 + mSkyHorizon * 0.3) * (0.9 + 0.2 * along);
  gl_FragColor = vec4(millerHaze(col, vW), a);
}`;

const SIM_FRAG = `
precision highp float;
#define NS 16
uniform sampler2D uPrev;
uniform vec2 uShift;
uniform float uTexel;
uniform float uC2;
uniform float uDamp;
uniform float uFoamDecay;
uniform vec4 uSrc[NS];
uniform vec4 uSrcB[NS];
uniform int uNSrc;
varying vec2 vUv;
vec4 S(vec2 q){
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0);
  return texture(uPrev, q);
}
void main(){
  vec2 q = vUv + uShift;
  vec4 c = S(q);
  float lap = S(q - vec2(uTexel, 0.0)).r + S(q + vec2(uTexel, 0.0)).r + S(q - vec2(0.0, uTexel)).r + S(q + vec2(0.0, uTexel)).r - 4.0 * c.r;
  float hn = c.r + (c.r - c.g) * uDamp + uC2 * lap;
  float foam = c.b * uFoamDecay;
  for (int i = 0; i < NS; i++) {
    if (i >= uNSrc) break;
    vec4 s = uSrc[i];
    vec4 sb = uSrcB[i];
    vec2 d = (vUv - s.xy) / s.z;
    float d2 = dot(d, d);
    float gs = exp(-d2 * 2.0);
    hn += s.w * gs + dot(sb.xy, d) * gs * sb.w;
    float rr = sqrt(d2) - 1.0;
    foam += sb.z * (exp(-rr * rr * 5.0) + 0.4 * gs);
  }
  vec2 e = min(vUv, 1.0 - vUv);
  float ef = smoothstep(0.0, 0.05, min(e.x, e.y));
  hn = clamp(hn * ef, -0.2, 0.2);
  gl_FragColor = vec4(hn, c.r * ef, min(foam, 1.6) * ef, 1.0);
}`;

const BED_VERT = MILLER_SKY_GLSL + `
uniform vec3 uOrigin;
varying vec3 vW;
void main(){
  vW = vec3(position.x + uOrigin.x, -0.55, position.z + uOrigin.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const BED_FRAG = MILLER_SKY_GLSL + `
uniform vec3 uSeabed;
varying vec3 vW;
void main(){
  float silt = texture(mNoise, vW.xz / 2.3).a * 0.6 + texture(mNoise, vW.xz / 0.7 + 0.2).b * 0.4;
  float rip = texture(mNoise, vW.xz / 0.35 + 0.5).a;
  vec3 c = uSeabed * (mSkyTop * 0.72 + mSkyHorizon * 0.28) * (0.5 + 0.6 * silt + 0.25 * rip) * 1.6;
  gl_FragColor = vec4(millerHaze(c, vW), 1.0);
}`;

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const RIP_LAYERS = [[2.9, 0.6], [1.07, 2.3], [0.41, 4.1]];

const RIPPLE_FRAG = `
precision highp float;
precision highp int;
varying vec2 vUv;
uvec2 pcg2(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
vec2 rnd(int i){ return vec2(pcg2(uvec2(uint(i) * 747796405u + 2891336453u, uint(i) * 277803737u + 101u))) * (1.0 / 4294967296.0); }
void main(){
  vec2 uv = vUv;
  float h = 0.0, s2 = 0.0, g2 = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 72; i++) {
    vec2 r = rnd(i), r2 = rnd(i + 1000);
    float rad = 5.0 * pow(9.0, r.x);
    float a = r.y * 6.2831853;
    vec2 k = floor(vec2(cos(a), sin(a)) * rad + 0.5);
    if (dot(k, k) < 4.0) k = vec2(2.0, 1.0);
    float A = pow(length(k), -1.15);
    float x = 6.2831853 * dot(k, uv) + r2.x * 6.2831853;
    h += A * sin(x);
    g += A * cos(x) * 6.2831853 * k;
    s2 += A * A * 0.5;
    g2 += A * A * 19.739 * dot(k, k);
  }
  float n = 1.0 / (sqrt(s2) * 2.2);
  float hn = clamp(h * n, -1.5, 1.5);
  float rr = sqrt(hn * hn + 0.015);
  float e = 0.35 * hn + 0.65 * (1.0 - rr);
  vec2 gs = (0.35 - 0.65 * hn / rr) * g * n;
  float rmsG = sqrt(g2) * n * 0.9;
  gl_FragColor = vec4(gs / rmsG, e, hn);
}`;

function createRippleTexture(renderer, size) {
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const mat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: RIPPLE_FRAG, depthTest: false, depthWrite: false });
  const tri = new THREE.Mesh(geo, mat);
  tri.frustumCulled = false;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(tri, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(prev);
  geo.dispose(); mat.dispose();
  return rt;
}


const WIND_ANG = Math.atan2(0.32, -1);
const wMeanJS = sh => { const x2 = sh * sh; return Math.exp(-sh) * (1 + x2 / 4 + x2 * x2 / 64 + x2 * x2 * x2 / 2304 + x2 * x2 * x2 * x2 / 147456); };
let PROFILE = null;
const getProfile = () => PROFILE || (PROFILE = buildProfile());

function buildOctaves() {
  const oct = [];
  let lam = 34;
  const ratio = Math.pow(34 / 0.015, 1 / (NO_MAX - 1));
  for (let i = 0; i < NO_MAX; i++) {
    const k = TAU / lam, lp = 1.1;
    const s = lam > lp ? 0.36 * Math.pow(lp / lam, 2.0) : lam > 0.5 ? 0.36 * Math.pow(lam / lp, 0.3) : 0.3 * Math.pow(lam / 0.5, 0.22);
    const spread = lam > 6 ? 0.5 : lam > 0.8 ? 1.45 : 1.7;
    const a = WIND_ANG + spread * Math.sin(i * 2.399963 + 0.7) + (hash(i + 3) - 0.5) * 0.25;
    const sh = lam > 0.45 && lam < 2.4 ? 1.75 : 1;
    oct.push({ dx: Math.cos(a), dz: Math.sin(a), k, amp0: s / k, amp: s / k, sh, mean: wMeanJS(sh), omega: Math.sqrt(G * k * Math.tanh(k * DEPTH)), omegaF: Math.sqrt(G * k / FACE_S), ph0: hash(i) * TAU, phF: hash(i + 50) * TAU });
    lam /= ratio;
  }
  return { oct, uOct: oct.map(() => new THREE.Vector4()), uPh: oct.map(() => new THREE.Vector4()), uPhL: oct.map(() => new THREE.Vector4()) };
}

function chopAt(oct, x, z, t, nv, warp) {
  let h = 0, qx = x, qz = z;
  for (let i = 0; i < nv; i++) {
    const o = oct[i];
    const ph = o.k * (o.dx * qx + o.dz * qz) - o.omega * t + o.ph0;
    const w = Math.exp(o.sh * (Math.sin(ph) - 1)), dw = o.sh * w * Math.cos(ph);
    h += o.amp * (w - o.mean);
    qx += o.dx * dw * o.amp * warp;
    qz += o.dz * dw * o.amp * warp;
  }
  return h;
}

function octaveWind(O, wind, nv, warp) {
  const wa = 0.25 + 0.75 * wind;
  O.oct.forEach(o => { o.amp = o.amp0 * wa * (o.k > 6 ? 0.7 + 0.3 * wind / 0.55 : 1); });
  let tail = 0;
  for (let i = NO_MAX - 1; i >= 0; i--) { const sl = O.oct[i].amp * O.oct[i].k; tail += sl * sl * 0.3; O.uPh[i].z = tail; O.uPh[i].w = O.oct[i].sh; }
  O.oct.forEach((o, i) => O.uOct[i].set(o.dx, o.dz, o.k, o.amp));
  const hs = [];
  for (let i = 0; i < 3000; i++) hs.push(chopAt(O.oct, hash(i * 3 + 1) * 400 - 200, hash(i * 7 + 2) * 400 - 200, 0, nv, warp));
  hs.sort((a, b) => a - b);
  const q = f => hs[Math.floor(f * (hs.length - 1))];
  const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
  const sd = Math.sqrt(hs.reduce((a, b) => a + (b - mean) ** 2, 0) / hs.length);
  return [q(0.8), q(0.994 - 0.014 * wind), q(0.999), sd];
}

function octavePhases(O, ox, oz, t) {
  for (let i = 0; i < NO_MAX; i++) {
    const o = O.oct[i], sp = o.k * (o.dx * ox + o.dz * oz) + o.ph0;
    O.uPh[i].x = mod2pi(sp - o.omega * t);
    O.uPh[i].y = mod2pi(o.k * (o.dx * oz / FACE_S) - o.omegaF * t + o.phF);
    O.uPhL[i].set(mod2pi(sp - o.omega * (t - 0.9)), mod2pi(sp - o.omega * (t - 2.2)), 0, 0);
  }
}

function ripOffsets(arr, ox, oz, wx, wz, t) {
  RIP_LAYERS.forEach(([T, an], L) => {
    const c = Math.cos(an), sn = Math.sin(an), sp = 0.12 + 0.05 * L;
    const x = ox - wx * t * sp, z = oz - wz * t * sp;
    const u = (c * x - sn * z) / T + 0.37 * L, v = (sn * x + c * z) / T + 0.11 * L;
    arr[L].set(u - Math.floor(u), v - Math.floor(v));
  });
}

function makeShared(U, O, prof, profTex) {
  return {
    ...U,
    uOct: { value: O.uOct }, uPh: { value: O.uPh }, uWarp: { value: 0.55 },
    uOrigin: { value: new THREE.Vector3() },
    uWaves: { value: [new THREE.Vector4(6000, 1200, 0, 0), new THREE.Vector4(20000, 1050, 0, 3700)] },
    uCap: { value: CAP_U }, uLevel: { value: 0 }, uSteep: { value: 1.3 },
    uProfile: { value: profTex }, uProfRange: { value: new THREE.Vector4(prof.sMin, 1 / (prof.sMax - prof.sMin), prof.TW, 0) },
    uBody: { value: new THREE.Color(0.072, 0.106, 0.104) },
    uSSS: { value: new THREE.Color(0.02, 0.03, 0.03) },
    uSeabed: { value: new THREE.Color(0.05, 0.056, 0.052) },
    uFoamAlb: { value: 1.0 }, uSharp: { value: new THREE.Vector2(2.4, wMeanJS(2.4)) }, uBodyDeep: { value: new THREE.Color(0.006, 0.009, 0.015) }, uReflK: { value: 0.8 }, uWaveMist: { value: 0.12 },
    uFoamQ: { value: new THREE.Vector4(0.1, 0.2, 0.3, 0.05) },
    uFlow: { value: 0 },
    uWaveAir: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
}

function makeProfileTexture(prof) {
  const t = new THREE.DataTexture(prof.tex, prof.TW, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function createMillerSurface({ engine, wind = 0.55, quality, second = true, glowDir } = {}) {
  const renderer = engine.renderer;
  const tierName = quality || engine.qualityName || 'high';
  const T = TIERS[tierName] || TIERS.ultra;
  const sky = createMillerSky({ engine, glowDir });
  const U = sky.uniforms;
  const group = new THREE.Group();
  group.name = 'miller-surface';

  const prof = getProfile();
  const profTex = makeProfileTexture(prof);
  const windAng = WIND_ANG;
  const O = buildOctaves();
  const oct = O.oct;
  const shared = makeShared(U, O, prof, profTex);
  const defines = { NO: NO_MAX, NV: T.nv, NOF: T.nof, NOFACE: Math.min(T.nof, 24) };

  const simN = T.sim, simSize = 64, simTexel = simSize / simN;
  const simRT = [0, 1].map(() => new THREE.WebGLRenderTarget(simN, simN, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }));
  const simOrigin = new THREE.Vector2();
  const uSimP = { value: new THREE.Vector4(0, 0, simSize, simTexel) };
  const uSim = { value: simRT[0].texture };
  const rings = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0));
  let ringSlot = 0;

  const shadeA = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 1));
  const shadeB = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0));
  const shades = [];
  const rippleRT = createRippleTexture(renderer, tierName === 'low' ? 512 : 1024);
  const radial = radialGeometry(T.na, 0.15, 160000);
  const oceanMat = new THREE.ShaderMaterial({
    defines: { ...defines }, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, side: THREE.DoubleSide,
    uniforms: { ...shared, uSim, uSimP, uGridK: { value: radial.gridK }, uSpC: { value: 0 }, uPhL: { value: O.uPhL }, uRings: { value: rings }, uWind: { value: new THREE.Vector4(Math.cos(windAng), Math.sin(windAng), wind, 0) }, uRipple: { value: rippleRT.texture }, uRipK: { value: new THREE.Vector4(1, 0, 0, 1) }, uRipO: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] }, uFoamK: { value: new THREE.Vector4(1, 0.6, 1, 0) }, uShade: { value: shadeA }, uShadeB: { value: shadeB } },
  });
  const ocean = new THREE.Mesh(radial.geometry, oceanMat);
  ocean.frustumCulled = false;
  ocean.renderOrder = 1;
  ocean.name = 'miller-ocean';
  group.add(ocean);

  const samples = sampleProfile(prof, T.nu);
  const samples2 = sampleProfile(prof, T.nu2);
  const waveGeo = waveGeometry(samples, T.nz, T.zNear, 60000);
  const waveGeo2 = waveGeometry(samples2, T.nz2, T.zNear * 6, 60000);
  const faceFoam = new THREE.Vector4(1, 1, 1.0, 0.6);
  const makeWaveMat = (geo, idx) => new THREE.ShaderMaterial({
    defines: { ...defines }, vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, side: THREE.DoubleSide,
    uniforms: { ...shared, uW: { value: new THREE.Vector4() }, uZGrid: { value: new THREE.Vector2(geo.userData.zc, geo.userData.zA) }, uFaceAmp: { value: 1.35 }, uFaceFoam: { value: faceFoam }, uRipple: { value: rippleRT.texture }, uIdx: { value: idx }, uWPh: { value: idx ? 3700 : 0 } },
  });
  const waves = [waveGeo, waveGeo2].map((geo, i) => {
    const m = new THREE.Mesh(geo, makeWaveMat(geo, i));
    m.frustumCulled = false;
    m.renderOrder = 0;
    m.name = i ? 'miller-wave-2' : 'miller-wave';
    group.add(m);
    return m;
  });

  const zv = zGrid(T.veilZ, T.zNear * 4, 60000).z;
  const crestU = prof.crest;
  const veilDefs = [
    { nv: 14, layers: 3, veil: [crestU.s - 0.02, 0.965, -0.34, 0.44], veil2: [0.45, 1.0, 0.004, 1] },
    { nv: 12, layers: 3, veil: [0.025, 0.0, -0.03, 0.045], veil2: [0.18, 0.0, 0.07, 0.45] },
  ];
  const veils = [];
  for (let w = 0; w < 2; w++) {
    for (const vd of veilDefs) {
      const geo = veilGeometry(zv, vd.nv, vd.layers);
      const mat = new THREE.ShaderMaterial({
        defines: { ...defines }, vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { ...shared, uW: { value: new THREE.Vector4() }, uVeil: { value: new THREE.Vector4(...vd.veil) }, uVeil2: { value: new THREE.Vector4(...vd.veil2) }, uWPh: { value: w ? 3700 : 0 } },
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = 10;
      m.userData.wave = w;
      group.add(m);
      veils.push(m);
    }
  }

  const PN = T.particles;
  const pGeo = new THREE.BufferGeometry();
  const aP0 = new THREE.BufferAttribute(new Float32Array(PN * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aV = new THREE.BufferAttribute(new Float32Array(PN * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aT = new THREE.BufferAttribute(new Float32Array(PN * 4).fill(-1e6), 4).setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PN * 3), 3));
  pGeo.setAttribute('aP0', aP0); pGeo.setAttribute('aV', aV); pGeo.setAttribute('aT', aT);
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const pMat = new THREE.ShaderMaterial({ vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, transparent: true, depthWrite: false, uniforms: { ...U, uPx: { value: 500 }, uWindV: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1920, 1080) } } });
  const spray = new THREE.Points(pGeo, pMat);
  spray.frustumCulled = false;
  spray.renderOrder = 11;
  group.add(spray);
  let pSlot = 0;

  group.add(sky.mesh);

  const bedGeo = radialGeometry(96, 0.3, 160).geometry;
  const bedMat = new THREE.ShaderMaterial({ vertexShader: BED_VERT, fragmentShader: BED_FRAG, side: THREE.DoubleSide, uniforms: { ...U, uOrigin: shared.uOrigin, uSeabed: shared.uSeabed } });
  const seabedMesh = new THREE.Mesh(bedGeo, bedMat);
  seabedMesh.frustumCulled = false;
  seabedMesh.renderOrder = 2;
  seabedMesh.visible = true;
  seabedMesh.name = 'miller-seabed';
  group.add(seabedMesh);

  const simGeo = new THREE.BufferGeometry();
  simGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  simGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const simSrc = Array.from({ length: 16 }, () => new THREE.Vector4());
  const simSrcB = Array.from({ length: 16 }, () => new THREE.Vector4());
  const simMat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: SIM_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uTexel: { value: 1 / simN }, uC2: { value: 0 }, uDamp: { value: 0.985 }, uFoamDecay: { value: 0.997 }, uSrc: { value: simSrc }, uSrcB: { value: simSrcB }, uNSrc: { value: 0 } },
  });
  const simQuad = new THREE.Mesh(simGeo, simMat);
  simQuad.frustumCulled = false;
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  {
    const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const rt of simRT) { renderer.setRenderTarget(rt); renderer.clear(true, false, false); }
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  }
  let simCur = 0, simAcc = 0, simReady = false;
  const pendingSrc = [];

  const state = { time: 0, wind, drawdown: 0, flowSpeed: 30, under: 0, mist: 1 / 420, subOverride: null, primed: false };
  const wave = {
    x: 6000, speed: 0, height: 1200, visible: false, second, gap: 14000, height2: 1050,
    timeToReach(x, z = 0) {
      if (!this.visible) return Infinity;
      const d = this.x + meander(z) - x;
      return this.speed > 0 ? d / this.speed : (d > 0 ? Infinity : 0);
    },
  };
  const wakes = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camPos = new THREE.Vector3();

  function chopCPU(x, z, nv = T.nv) { return chopAt(oct, x, z, state.time, nv, shared.uWarp.value); }

  function waveParts(x, z) {
    let hOcean = 0, env = -Infinity, prox = 0;
    const W = shared.uWaves.value;
    for (let i = 0; i < 2; i++) {
      if (W[i].z < 0.5) continue;
      const H = W[i].y * hscale(z + W[i].w), sm = x - (W[i].x + meander(z + W[i].w));
      const e = prof.lookup(sm / H);
      const c = sm + 0.09 * H, w = 0.075 * H;
      hOcean += Math.min(e, CAP_U) * H - 0.36 * Math.exp(-c * c / (w * w));
      if (e > CAP_U) env = Math.max(env, e * H);
      prox = Math.max(prox, sm < 0 ? Math.exp(sm / (0.28 * H)) : 1 - ss(0, 0.3, sm / H));
    }
    return { hOcean, env, prox };
  }

  function heightAt(x, z) {
    const wp = waveParts(x, z);
    const h = chopCPU(x, z) * (1 + shared.uSteep.value * wp.prox) * Math.min(1, Math.max(0.85, (0.55 + shared.uLevel.value) / 0.45)) + wp.hOcean + shared.uLevel.value;
    return Math.max(Math.max(h, wp.env), SEABED + 0.012);
  }

  function setWind(w) {
    state.wind = Math.min(1, Math.max(0, w));
    shared.uFoamQ.value.set(...octaveWind(O, state.wind, T.nv, shared.uWarp.value));
    oceanMat.uniforms.uWind.value.z = state.wind;
    oceanMat.uniforms.uFoamK.value.set(0.3 + 0.5 * state.wind, 1.8 * Math.max(0, state.wind - 0.4), 1, 1);
    applyMist();
    shared.uWaveMist.value = 0.02 + 0.05 * state.wind;
  }

  function applyMist() { sky.setSprayHaze(state.mist * (0.6 + 0.4 * state.wind / 0.55)); }

  function setMist(density) {
    state.mist = Math.max(0, density);
    applyMist();
  }

  function setSubmerged(v) { state.subOverride = v === null || v === undefined ? null : Math.min(1, Math.max(0, v)); }

  function setDrawdown(d) {
    state.drawdown = Math.min(1, Math.max(0, d));
    shared.uLevel.value = -0.5 * state.drawdown;
    oceanMat.uniforms.uWind.value.w = state.drawdown;
  }

  function setWave({ x, speed, height, visible, second: sec, gap, height2 } = {}) {
    if (x !== undefined) wave.x = x;
    if (speed !== undefined) wave.speed = speed;
    if (height !== undefined) wave.height = height;
    if (visible !== undefined) wave.visible = visible;
    if (sec !== undefined) wave.second = sec;
    if (gap !== undefined) wave.gap = gap;
    if (height2 !== undefined) wave.height2 = height2;
    syncWave();
  }

  function syncWave() {
    const W = shared.uWaves.value;
    W[0].set(wave.x, wave.height, wave.visible ? 1 : 0, 0);
    W[1].set(wave.x + wave.gap, wave.height2, wave.visible && wave.second ? 1 : 0, 3700);
    waves.forEach((m, i) => { m.visible = !state.primed || W[i].z > 0.5; m.material.uniforms.uW.value.set(W[i].x, W[i].y, W[i].z, camPos.z); });
    veils.forEach(m => { const i = m.userData.wave; m.visible = !state.primed || W[i].z > 0.5; m.material.uniforms.uW.value.set(W[i].x, W[i].y, W[i].z, camPos.z); });
  }

  function spawnParticles(p, n, speed, size, life, alpha = 1, spreadUp = 1) {
    const s0 = pSlot;
    for (let i = 0; i < n; i++) {
      const k = pSlot; pSlot = (pSlot + 1) % PN;
      const a = Math.random() * TAU, up = (0.55 + Math.random() * 0.45) * spreadUp, out = Math.sqrt(Math.max(0, 1 - up * up));
      const v = speed * (0.4 + Math.random() * 0.8);
      aP0.setXYZ(k, p.x + (Math.random() - 0.5) * size * 4, p.y, p.z + (Math.random() - 0.5) * size * 4);
      aV.setXYZ(k, Math.cos(a) * out * v, up * v * 1.3, Math.sin(a) * out * v);
      aT.setXYZW(k, state.time + Math.random() * 0.06, life * (0.6 + Math.random() * 0.7), size * (0.5 + Math.random()), alpha);
    }
    const mark = (attr, isz) => {
      if (s0 + n <= PN) attr.addUpdateRange(s0 * isz, n * isz); else attr.clearUpdateRanges();
      attr.needsUpdate = true;
    };
    mark(aP0, 3); mark(aV, 3); mark(aT, 4);
  }

  function splash(position, strength = 1) {
    const st = Math.max(0.05, strength);
    const y = position.y !== undefined ? Math.max(position.y, heightAt(position.x, position.z)) : heightAt(position.x, position.z);
    const p = new THREE.Vector3(position.x, y, position.z);
    spawnParticles(p, Math.min(700, Math.round(170 * Math.pow(st, 0.75))), 2.0 * Math.pow(st, 0.35), 0.016 * Math.pow(st, 0.25), 0.9, 1);
    spawnParticles(p, Math.min(200, Math.round(40 * Math.pow(st, 0.7))), 1.1 * Math.pow(st, 0.3), 0.05 * Math.pow(st, 0.3), 0.7, 0.55, 0.8);
    if (st > 2) spawnParticles(p, Math.min(400, Math.round(12 * st)), 3.4 * Math.pow(st, 0.3), 0.14 * Math.pow(st, 0.3), 1.8, 0.5);
    rings[ringSlot].set(p.x, p.z, state.time, st);
    ringSlot = (ringSlot + 1) % rings.length;
    pendingSrc.push({ x: p.x, z: p.z, r: 0.42 * Math.sqrt(st), h: -0.035 * Math.min(st, 6), vx: 0, vz: 0, dip: 0, foam: 1.3 * Math.min(st, 3) });
  }

  function addShade(object, { width = 10, length = 16, strength = 0.85 } = {}) {
    const sh = { object, width, length, strength };
    if (shades.length < 4) shades.push(sh);
    return { remove() { const i = shades.indexOf(sh); if (i >= 0) shades.splice(i, 1); } };
  }

  function addWake(object, radius = 0.18) {
    const wk = { object, radius, prev: new THREE.Vector3(), vel: new THREE.Vector3(), init: false, phase: Math.random() * TAU };
    wakes.push(wk);
    return { remove() { const i = wakes.indexOf(wk); if (i >= 0) wakes.splice(i, 1); } };
  }

  function update(dt, camera) {
    dt = Math.min(dt, 0.1);
    state.primed = true;
    state.time += dt;
    sky.update(dt);
    if (wave.visible && wave.speed) wave.x -= wave.speed * dt;
    shared.uFlow.value += dt * Math.max(wave.speed, state.flowSpeed) * 0.55;
    camera.getWorldPosition(camPos);
    shared.uOrigin.value.copy(camPos);
    octavePhases(O, camPos.x, camPos.z, state.time);
    syncWave();
    const wv = oceanMat.uniforms.uWind.value;
    ripOffsets(oceanMat.uniforms.uRipO.value, camPos.x, camPos.z, wv.x, wv.y, state.time);
    pMat.uniforms.uRes.value.set(engine.width || 1920, engine.height || 1080);
    seabedMesh.visible = !state.primed || state.under > 0.01;
    for (let i = 0; i < 4; i++) {
      const sh = shades[i];
      if (!sh) { shadeB[i].z = 0; continue; }
      sh.object.getWorldPosition(tmp);
      sh.object.getWorldDirection(tmp2);
      const above = tmp.y - heightAt(tmp.x, tmp.z);
      shadeA[i].set(tmp.x, tmp.z, sh.length * 0.5, sh.width * 0.5);
      shadeB[i].set(0, 0, sh.object.visible === false ? 0 : sh.strength * (1 - ss(2, 9, above)), Math.atan2(tmp2.z, tmp2.x));
    }
    pMat.uniforms.uWindV.value.set(wv.x * 3 * state.wind, wv.y * 3 * state.wind);
    pMat.uniforms.uPx.value = camera.isPerspectiveCamera ? engine.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) : 500;
    const hc = heightAt(camPos.x, camPos.z);
    const target = state.subOverride !== null ? state.subOverride : camPos.y < hc - 0.03 ? 1 : 0;
    state.under += (target - state.under) * Math.min(1, dt * 12);
    sky.setUnder(state.under > 0.01 ? state.under : 0);
    for (const wk of wakes) {
      wk.object.getWorldPosition(tmp);
      if (!wk.init) { wk.prev.copy(tmp); wk.init = true; }
      wk.vel.copy(tmp).sub(wk.prev).divideScalar(Math.max(dt, 1e-3));
      wk.prev.copy(tmp);
      const wh = heightAt(tmp.x, tmp.z);
      if (wk.object.visible === false || tmp.y - wh > 2.5 || tmp.y < SEABED - 3) continue;
      const vs = wk.prevH === undefined ? 0 : Math.min(2, Math.abs(wh - wk.prevH) / Math.max(dt, 1e-3));
      wk.prevH = wh;
      const rx = wk.vel.x - wv.x * vs * 1.2, rz = wk.vel.z - wv.y * vs * 1.2;
      const sp = Math.min(3, Math.hypot(rx, rz));
      const dir = sp > 0.01 ? [rx / sp, rz / sp] : [0, 0];
      pendingSrc.push({ x: tmp.x, z: tmp.z, r: wk.radius, h: 0.0016 * Math.sin(state.time * 7 + wk.phase) * (0.5 + state.wind), vx: dir[0], vz: dir[1], dip: 0.004 * sp, foam: (0.35 + 0.7 * sp + 0.8 * vs) * dt * (0.5 + state.wind) });
    }
    simReady = true;
    simAcc += dt;
  }

  function stepSim() {
    if (!simReady) return;
    simReady = false;
    const steps = Math.min(3, Math.floor(simAcc * 60));
    if (steps <= 0) return;
    simAcc -= steps / 60;
    const prev = renderer.getRenderTarget();
    const nx = Math.round(camPos.x / simTexel) * simTexel, nz = Math.round(camPos.z / simTexel) * simTexel;
    const shift = [(nx - simOrigin.x) / simSize, (nz - simOrigin.y) / simSize];
    simOrigin.set(nx, nz);
    const u = simMat.uniforms;
    const c = 1.15, dtS = 1 / 60;
    u.uC2.value = (c * dtS / simTexel) ** 2;
    u.uFoamDecay.value = Math.exp(-dtS / (6 + 6 * (1 - state.wind)));
    for (let s = 0; s < steps; s++) {
      const src = s === 0 ? pendingSrc.splice(0, 16) : [];
      src.forEach((e, i) => {
        simSrc[i].set((e.x - simOrigin.x) / simSize + 0.5, (e.z - simOrigin.y) / simSize + 0.5, Math.max(e.r, simTexel * 1.5) / simSize, e.h);
        simSrcB[i].set(e.vx, e.vz, e.foam, e.dip);
      });
      u.uNSrc.value = src.length;
      u.uShift.value.set(s === 0 ? shift[0] : 0, s === 0 ? shift[1] : 0);
      u.uPrev.value = simRT[simCur].texture;
      simCur ^= 1;
      renderer.setRenderTarget(simRT[simCur]);
      renderer.render(simQuad, simCam);
    }
    pendingSrc.length = 0;
    renderer.setRenderTarget(prev);
    uSim.value = simRT[simCur].texture;
    uSimP.value.set(simOrigin.x, simOrigin.y, simSize, simTexel);
  }
  const unsub = engine.onPreRender(() => stepSim());

  function occlusionAt(x, z) {
    let o = 1;
    for (const W of shared.uWaves.value) {
      if (W.z < 0.5) continue;
      const dx = W.x + meander(z + W.w) + 0.35 * W.y - x;
      if (dx <= 0) continue;
      const s = Math.sin(Math.max(Math.atan2(W.y * 0.9, dx), 0));
      o -= 0.16 * s * s;
    }
    return Math.max(o, 0.72);
  }

  setWind(wind);
  syncWave();

  return {
    group, sky, update, heightAt, setWave, wave, setDrawdown, splash, addWake, addShade, setWind, setMist, setSubmerged, occlusionAt,
    setCloudDeck: o => sky.setCloudDeck(o),
    prime() {
      state.primed = false;
      group.traverse(o => { if (o.isMesh || o.isPoints) o.visible = true; });
    },
    setWaveAir(clarity = 0, faceTone = 1) { shared.uWaveAir.value.x = Math.min(1, Math.max(0, clarity)); shared.uWaveAir.value.y = faceTone; },
    setSkyColors: o => sky.setColors(o),
    setClouds: o => sky.setClouds(o),
    setHaze: o => sky.setHaze(o),
    setWaterColors({ body, sss, deep, seabed, reflectance } = {}) {
      const set = (u, v) => { if (v) u.value.setRGB(...v); };
      set(shared.uBody, body); set(shared.uSSS, sss); set(shared.uBodyDeep, deep); set(shared.uSeabed, seabed);
      if (reflectance !== undefined) shared.uReflK.value = reflectance;
    },
    environment: sky.environment, keyLight: sky.keyLight, applyHaze: sky.applyHaze,
    seabed: SEABED, profile: prof, materials: { ocean: oceanMat, waves: waves.map(w => w.material), veils: veils.map(v => v.material), spray: pMat },
    _debug: { simRT, oceanMat },
    get state() { return { ...state, waveX: wave.x }; },
    dispose() {
      unsub();
      group.removeFromParent();
      [radial.geometry, waveGeo, waveGeo2, pGeo, simGeo, bedGeo, ...veils.map(v => v.geometry)].forEach(g => g.dispose());
      [oceanMat, pMat, simMat, bedMat, ...waves.map(w => w.material), ...veils.map(v => v.material)].forEach(m => m.dispose());
      simRT.forEach(r => r.dispose());
      rippleRT.dispose();
      profTex.dispose();
      sky.dispose();
    },
  };
}

function memoryLight(sky, { top, horizon, glow, haze = 0, exposure = 1 } = {}) {
  sky.setColors({ top, horizon, glow });
  sky.uniforms.mHaze.value.set(haze, 1 / 900, 0, 0);
  sky.uniforms.mCloud.value.x = 0;
  return exposure;
}

export function waveProfile({ height = 1200, samples = 256 } = {}) {
  const prof = getProfile();
  const pts = sampleProfile(prof, samples).map(q => ({ s: q.s * height, h: q.h * height, nx: -Math.sin(q.t), ny: Math.cos(q.t), l: q.l * height }));
  return {
    height,
    points: pts,
    crest: { s: prof.crest.s * height, h: height },
    envelope: sm => prof.lookup(sm / height) * height,
  };
}

export function createSeaPatch({ engine, size = 40, quality, time = 0, frozen = false, wind = 0.55, segments, light } = {}) {
  const renderer = engine.renderer;
  const tierName = quality || engine.qualityName || 'high';
  const T = TIERS[tierName] || TIERS.ultra;
  const sky = createMillerSky({ engine, env: false, noiseSize: 1024 });
  const U = sky.uniforms;
  const prof = getProfile();
  const profTex = makeProfileTexture(prof);
  const O = buildOctaves();
  const shared = makeShared(U, O, prof, profTex);
  shared.uFoamQ.value.set(...octaveWind(O, wind, T.nv, shared.uWarp.value));
  const rippleRT = createRippleTexture(renderer, 512);
  const blank = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  blank.needsUpdate = true;
  const N = segments || (tierName === 'low' ? 96 : tierName === 'medium' ? 160 : 256);
  const geo = new THREE.PlaneGeometry(size, size, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 2;
  const uRipO = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  const mat = new THREE.ShaderMaterial({
    defines: { NO: NO_MAX, NV: T.nv, NOF: T.nof, NOFACE: Math.min(T.nof, 24), PATCH: 1 },
    vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, side: THREE.DoubleSide,
    uniforms: {
      ...shared, uSim: { value: blank }, uSimP: { value: new THREE.Vector4(1e9, 1e9, 64, 0.125) }, uGridK: { value: 0 }, uSpC: { value: size / N }, uPhL: { value: O.uPhL },
      uRings: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uShade: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 1)) }, uShadeB: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      uWind: { value: new THREE.Vector4(Math.cos(WIND_ANG), Math.sin(WIND_ANG), wind, 0) },
      uRipple: { value: rippleRT.texture }, uRipK: { value: new THREE.Vector4(1, 0, 0, 1) }, uRipO: { value: uRipO },
      uFoamK: { value: new THREE.Vector4(0.3 + 0.5 * wind, 1.8 * Math.max(0, wind - 0.4), 1, 1) },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'miller-sea-patch';
  const group = new THREE.Group();
  group.add(mesh);
  const st = { time, frozen };
  const sync = () => {
    U.mTime.value = st.time;
    octavePhases(O, 0, 0, st.time);
    ripOffsets(uRipO, 0, 0, Math.cos(WIND_ANG), Math.sin(WIND_ANG), st.time);
  };
  if (light) memoryLight(sky, light);
  else memoryLight(sky, {});
  sync();
  return {
    group, mesh, material: mat,
    get time() { return st.time; },
    update(dt) { if (!st.frozen) st.time += dt; sync(); },
    setTime(t) { st.time = t; sync(); },
    setFrozen(f) { st.frozen = !!f; },
    setLight(o) { memoryLight(sky, o); },
    setWind(w) { shared.uFoamQ.value.set(...octaveWind(O, Math.min(1, Math.max(0, w)), T.nv, shared.uWarp.value)); },
    heightAt(x, z) { return Math.max(chopAt(O.oct, x, z, st.time, T.nv, shared.uWarp.value), SEABED + 0.012); },
    dispose() { geo.dispose(); mat.dispose(); rippleRT.dispose(); blank.dispose(); profTex.dispose(); sky.dispose(); group.removeFromParent(); },
  };
}

export function createWaveRidge({ engine, height = 1200, length = 4000, quality, time = 0, frozen = false, light } = {}) {
  const k = height / 1200;
  const H = 1200, Lf = length / k;
  const tierName = quality || engine.qualityName || 'high';
  const T = TIERS[tierName] || TIERS.ultra;
  const sky = createMillerSky({ engine, env: false, noiseSize: 1024 });
  const U = sky.uniforms;
  const prof = getProfile();
  const profTex = makeProfileTexture(prof);
  const O = buildOctaves();
  const shared = makeShared(U, O, prof, profTex);
  shared.uFoamQ.value.set(...octaveWind(O, 0.8, T.nv, shared.uWarp.value));
  shared.uWaves.value[0].set(0, H, 1, 0);
  shared.uWaves.value[1].set(0, H, 0, 0);
  const rippleRT = createRippleTexture(engine.renderer, 512);
  const geo = waveGeometry(sampleProfile(prof, T.nu2), Math.round(T.nz2 * 0.6), Math.max(2, Lf / T.nz2), Lf / 2);
  const mat = new THREE.ShaderMaterial({
    defines: { NO: NO_MAX, NV: T.nv, NOF: T.nof, NOFACE: Math.min(T.nof, 24), PATCH: 1 },
    vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, side: THREE.DoubleSide,
    uniforms: { ...shared, uW: { value: new THREE.Vector4(0, H, 1, 0) }, uZGrid: { value: new THREE.Vector2(geo.userData.zc, geo.userData.zA) }, uFaceAmp: { value: 1.35 }, uFaceFoam: { value: new THREE.Vector4(1, 1, 1, 0.6) }, uRipple: { value: rippleRT.texture }, uWPh: { value: 0 } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'miller-wave-ridge';
  mesh.scale.setScalar(k);
  const group = new THREE.Group();
  group.add(mesh);
  const st = { time, frozen };
  const sync = () => {
    U.mTime.value = st.time;
    shared.uFlow.value = st.time * 30 * 0.55;
    octavePhases(O, 0, 0, st.time);
  };
  memoryLight(sky, light || {});
  sync();
  return {
    group, mesh, material: mat, profile: waveProfile({ height }),
    update(dt) { if (!st.frozen) st.time += dt; sync(); },
    setTime(t) { st.time = t; sync(); },
    setFrozen(f) { st.frozen = !!f; },
    setLight(o) { memoryLight(sky, o); },
    dispose() { geo.dispose(); mat.dispose(); rippleRT.dispose(); profTex.dispose(); sky.dispose(); group.removeFromParent(); },
  };
}
