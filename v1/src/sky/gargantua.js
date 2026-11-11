// Gargantua: Schwarzschild null-geodesic ray tracer with a volumetric, shear-wound accretion disk, full-resolution lensed stars and a wide halo.
import * as THREE from 'three';

export const GARGANTUA_QUALITY = {
  low: { scale: 0.45, steps: 170, k: 0.095, slab: 4, shadow: 0, detail2: 0, ringaa: 1 },
  medium: { scale: 0.6, steps: 260, k: 0.07, slab: 6, shadow: 1, detail2: 0, ringaa: 1 },
  high: { scale: 0.66, steps: 340, k: 0.058, slab: 9, shadow: 1, detail2: 1, ringaa: 1 },
  ultra: { scale: 0.78, steps: 420, k: 0.05, slab: 12, shadow: 1, detail2: 1, ringaa: 1 },
  env: { scale: 1, steps: 120, k: 0.12, slab: 3, shadow: 0, detail2: 0, ringaa: 0 },
};

const FULL_VERT = `
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const TRACE_VERT = `
varying vec3 vDir;
varying vec2 vUv;
void main(){
  vec2 ndc = position.xy;
  vec3 cd = vec3((ndc.x + projectionMatrix[2][0]) / projectionMatrix[0][0], (ndc.y + projectionMatrix[2][1]) / projectionMatrix[1][1], -1.0);
  vDir = transpose(mat3(viewMatrix)) * cd;
  vUv = ndc * 0.5 + 0.5;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const DISK_GEN_FRAG = `
precision highp float;
varying vec2 vUv;
uint pcg(uvec2 v){ v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; return v.x ^ v.y; }
vec2 grad(vec2 i, vec2 per){ i = mod(i, per); float a = float(pcg(uvec2(i) + uvec2(7u, 911u))) * (6.2831853 / 4294967295.0); return vec2(cos(a), sin(a)); }
float gnoise(vec2 p, vec2 per){
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i, per), f), b = dot(grad(i + vec2(1.0, 0.0), per), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0), per), f - vec2(0.0, 1.0)), d = dot(grad(i + vec2(1.0, 1.0), per), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}
float fbm(vec2 uv, vec2 f, int oct, float gain){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * gnoise(uv * f, f); f *= 2.0; a *= gain; }
  return s;
}
float ridge(vec2 uv, vec2 f, int oct, float gain){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; float n = 1.0 - abs(gnoise(uv * f, f)); s += a * n * n; f *= 2.0; a *= gain; }
  return s;
}
void main(){
  vec2 s = vec2(vUv.x + vUv.y, vUv.y);
  float w1 = fbm(s + vec2(0.13, 0.71), vec2(2.0, 6.0), 3, 0.5);
  float w2 = fbm(s + vec2(0.61, 0.17), vec2(3.0, 14.0), 3, 0.5);
  vec2 q = s + vec2(w1 * 0.06, w2 * 0.004);
  float a1 = fbm(q, vec2(4.0, 28.0), 5, 0.62);
  float a2 = ridge(q + 0.31, vec2(6.0, 36.0), 4, 0.6);
  float r = clamp(0.5 + 0.95 * a1 + 0.6 * (a2 - 0.4), 0.0, 1.0);
  float e1 = fbm(q + vec2(0.57, 0.23), vec2(3.0, 20.0), 5, 0.6);
  float g = clamp(0.5 + 1.0 * e1, 0.0, 1.0);
  float b = clamp(0.5 + 0.8 * fbm(s + 0.41, vec2(6.0, 16.0), 4, 0.55), 0.0, 1.0);
  float a = clamp(0.5 + 0.95 * fbm(q + vec2(0.77, 0.39), vec2(12.0, 72.0), 3, 0.62), 0.0, 1.0);
  gl_FragColor = vec4(r, g, b, a);
}`;

const TRACE_FRAG = `
precision highp float;
precision highp int;
uniform vec3 uObs;
uniform mat3 uWorldToBh;
uniform float uTime, uBend, uPlunge, uPixAng, uK;
uniform sampler2D uDisk;
uniform float uRin, uRout, uGain, uDoppler, uSpin, uThick, uOpacity, uTexR0, uTexL, uPeriod, uSelfShadow, uThin, uBand, uTail, uFlare, uRingAA, uExitK, uDetail;
varying vec3 vDir;
varying vec2 vUv;
layout(location = 0) out highp vec4 oCol;
layout(location = 1) out highp vec4 oDir;
const float RB = 40.0;
const float TAU = 6.28318530718;

float Fw(float l, float b){ float q = l * l + b * b; return l * (2.0 * l * l + 3.0 * b * b) / (q * sqrt(q)); }
float wf(float b){ return 0.5 / b * uBend * (1.0 + 1.4726 * uBend / b); }
float diskH(float rc){ return uThick * (0.018 + 0.024 * rc) * (1.0 + uFlare * smoothstep(uRin * 2.0, uRin * 4.5, rc)); }

vec3 ramp(float t){
  vec3 c0 = vec3(0.27, 0.17, 0.1), c1 = vec3(0.82, 0.5, 0.27), c2 = vec3(1.0, 0.78, 0.58), c3 = vec3(1.0, 0.95, 0.9);
  if (t < 0.4) return mix(c0, c1, smoothstep(0.12, 0.4, t));
  if (t < 0.68) return mix(c1, c2, smoothstep(0.4, 0.68, t));
  return mix(c2, c3, smoothstep(0.68, 0.95, t));
}

float erfa(float x){ float x2 = x * x; return sign(x) * sqrt(1.0 - exp(-x2 * (1.27324 + 0.147 * x2) / (1.0 + 0.147 * x2))); }

vec4 tap(float ua, float ub, float wa, float rn, float sc, float v, float lod){
  vec4 A = textureLod(uDisk, vec2(ua * sc, v), lod), B = textureLod(uDisk, vec2(ub * sc, v), lod);
  return 0.5 + (mix(B, A, wa) - 0.5) * rn;
}

void diskSample(vec3 q, float dyl, float dl, vec3 v, float path, float fpk, inout vec3 col, inout float T){
  float rc = length(q.xz);
  if (rc < uRin * 0.75 || rc > uRout) return;
  float H = diskH(rc);
  float phi = atan(q.z, q.x);
  float om = uSpin * pow(rc, -1.5);
  float P = uPeriod * pow(rc / uRin, 1.5);
  float ta = mod(uTime, P), tb = mod(uTime + 0.5 * P, P);
  float sw = sin(3.14159265 * ta / P);
  float wa = sw * sw;
  float rn = inversesqrt(wa * wa + (1.0 - wa) * (1.0 - wa));
  float ua = (phi - om * ta) / TAU, ub = (phi - om * tb) / TAU + 0.5;
  float vv = log(rc / uTexR0) / uTexL;
  float fp = uPixAng * path * fpk / sqrt(max(abs(v.y), 0.04));
  float lod0 = log2(max(fp / (rc * 0.0028), 1e-4));
  float a0 = 1.0 - smoothstep(4.0, 6.5, lod0);
  vec4 s = 0.5 + (tap(ua, ub, wa, rn, 1.0, vv, min(lod0, 5.5)) - 0.5) * a0;
  float l1 = lod0 + 2.0, a1 = 1.0 - smoothstep(3.0, 4.5, l1);
  if (a1 > 0.0) s += (tap(ua, ub, wa, rn, 4.0, vv * 4.0 + 0.13, max(l1, 0.0)) - 0.5) * 0.7 * a1 * uDetail;
  float l2 = lod0 + 4.0, a2 = 1.0 - smoothstep(3.0, 4.5, l2);
  if (a2 > 0.0) s += (tap(ua, ub, wa, rn, 16.0, vv * 16.0 + 0.29, max(l2, 0.0)) - 0.5) * 0.55 * a2 * uDetail;
#if DETAIL2
  float l3 = lod0 + 6.0, a3 = 1.0 - smoothstep(3.0, 4.5, l3);
  if (a3 > 0.0) s += (tap(ua, ub, wa, rn, 64.0, vv * 64.0 + 0.47, max(l3, 0.0)) - 0.5) * 0.45 * a3 * uDetail;
  float l4 = lod0 + 8.0, a4 = 1.0 - smoothstep(3.0, 4.5, l4);
  if (a4 > 0.0) s += (tap(ua, ub, wa, rn, 256.0, vv * 256.0 + 0.61, max(l4, 0.0)) - 0.5) * 0.35 * a4 * uDetail;
#endif
  float S = clamp(s.r, 0.0, 1.0), E = clamp(s.g, 0.0, 1.0), F = clamp(s.a, 0.0, 1.0);
  float x = clamp((rc - uRin) / (uRout - uRin), 0.0, 1.0);
  float rise = smoothstep(uRin * 0.8, uRin * 1.25, rc);
  float fall = 1.0 - smoothstep(uRout * 0.45, uRout, rc);
  float outer = smoothstep(0.08, 0.5, x);
  float fil = S * (0.6 + 0.8 * F);
  float near = 1.0 - smoothstep(0.6, 3.5, path);
  float dens = rise * fall * mix(0.35 + 0.65 * fil, 2.2 * fil * fil, near);
  dens *= mix(1.0, smoothstep(0.2, 0.75, fil), smoothstep(0.5, 0.95, x));
  dens *= mix(1.0, uThin, smoothstep(uRin * 2.0, uRin * 3.6, rc));
  float yc = (s.b - 0.5) * H * 0.9;
  float Hz = H * (0.7 + 0.5 * fil * outer);
  float z = (q.y - yc) / Hz;
  float dz = dyl / Hz;
  float vert = abs(dz) > 1e-3 ? 0.5116 * (erfa(1.7320508 * (z + 0.5 * dz)) - erfa(1.7320508 * (z - 0.5 * dz))) / dz : exp(-z * z * 3.0);
  float sigma = dens * vert * uOpacity / H;
  if (sigma < 1e-5) return;
  float heat = clamp(0.55 + 0.9 * (E - 0.5) + mix(0.7, 1.6, near) * (fil - 0.5), 0.04, 1.8);
  vec3 c = ramp(pow(uRin / rc, 0.75) * (0.86 + 0.22 * heat));
  float rq = uRin / rc;
  float sc = 0.5 + 0.5 * dot(vec3(q.x, 0.0, q.z) / rc, -v);
  float scat = 0.08 + 1.5 * sc * sc * sc;
  float I = uGain * (pow(rq, 1.2) * (1.0 - smoothstep(uRin * uBand * 0.82, uRin * uBand * 1.12, rc)) * 0.9 + uTail * pow(rq, 1.3) * smoothstep(uRin * 1.6, uRin * 2.6, rc)) * heat * mix(0.5, 1.0, vert);
  I *= mix(1.0, scat * mix(0.6, 6.0, 1.0 - smoothstep(0.03, 0.2, abs(v.y))), outer);
#if SHADOW
  if (outer > 0.0) {
    float s1 = tap(ua, ub, wa, rn, 1.0, log(rc * 0.92 / uTexR0) / uTexL, min(lod0 + 1.0, 5.5)).r;
    float occ = smoothstep(0.35, 0.8, s1) * outer * exp(-z * z * 0.8);
    I *= mix(1.0, exp(-occ * uSelfShadow), 0.85);
  }
#endif
  float beta = min(sqrt(0.5 / max(rc - 1.0, 0.6)), 0.7);
  vec3 ph = vec3(-q.z, 0.0, q.x) / rc;
  float D = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(ph, -v));
  I *= pow(D, uDoppler);
  float a = 1.0 - exp(-sigma * dl);
  col += T * a * c * I;
  T *= 1.0 - a;
}

vec3 bendToward(vec3 v, vec3 n, float d){ return normalize(v * cos(d) + n * sin(d)); }

vec3 aberrate(vec3 dir, vec3 p){
  float r0 = length(p);
  vec3 rh = p / r0;
  return normalize(dir - rh * dot(dir, rh) * (1.0 - sqrt(max(1.0 - 1.0 / r0, 1e-4))));
}

vec3 traceDir(vec3 dir, int maxSteps, out vec3 vEsc, out float tEsc){
  vEsc = dir;
  tEsc = 0.0;
  vec3 p = uObs;
  float r0 = length(p);
  vec3 col = vec3(0.0);
  float T = 1.0;
  if (r0 < 1.002) return vec3(0.0);
  vec3 v = aberrate(dir, p);
  float path = 0.0;
  int state = 0;
  vec3 v0 = v;
  float RD = max(uRout * 1.1, 6.0);
  if (r0 > RB) {
    float tca = -dot(p, v);
    vec3 pc = p + v * tca;
    float b = max(length(pc), 1e-4);
    if (tca < 0.0 || b > RD) {
      v = bendToward(v, -pc / b, wf(b) * (2.0 - Fw(-tca, b)));
      state = 1;
    } else {
      float le = -sqrt(RB * RB - b * b);
      float d = wf(b) * (Fw(le, b) - Fw(-tca, b));
      p = pc + v * le;
      path = tca + le;
      v = bendToward(v, -pc / b, d);
    }
  }
  if (state == 0) {
    vec3 L = cross(p, v);
    float h2 = dot(L, L) * 1.5 * uBend;
    float rr2 = dot(p, p);
    vec3 acc = -h2 * p / (rr2 * rr2 * sqrt(rr2));
    float rcap = min(1.5 * uBend, uRin * 0.75);
    float rexit = clamp(uExitK * sqrt(h2 / (1.5 * uBend)), RD, RB);
    bool inSlab = false;
    float sAcc = 0.0, sDel = 1.0;
    for (int i = 0; i < STEPS; i++) {
      if (i >= maxSteps) break;
      float r = length(p);
      float rv = dot(p, v);
      if (rv > 0.0 && r > rexit) { state = 1; break; }
      if (r < 1.0 || (rv < 0.0 && r < rcap)) { state = 2; break; }
      float dt = uK * r * (0.4 + 0.6 * smoothstep(1.45, 3.6, r));
      v += acc * (0.5 * dt);
      vec3 pn = p + v * dt;
      float rn2 = dot(pn, pn);
      acc = -h2 * pn / (rn2 * rn2 * sqrt(rn2));
      v += acc * (0.5 * dt);
      vec3 seg = pn - p;
      float chord = length(seg);
      float rcm = length((p.xz + pn.xz) * 0.5);
      bool hit = false;
      if (rcm > uRin * 0.7 && rcm < uRout * 1.05) {
        float Hs = diskH(rcm) * 1.6;
        float ya = p.y, yb = pn.y;
        if (max(ya, yb) > -Hs && min(ya, yb) < Hs) {
          float dy = yb - ya;
          float s0 = 0.0, s1 = 1.0;
          if (abs(dy) > 1e-7) { float t1 = (Hs - ya) / dy, t2 = (-Hs - ya) / dy; s0 = max(0.0, min(t1, t2)); s1 = min(1.0, max(t1, t2)); }
          if (s1 > s0) {
            hit = true;
            vec3 vn = seg / chord;
            if (!inSlab || s0 > 0.0) { inSlab = true; sAcc = 0.0; sDel = max(Hs * 0.9, 2.0 * Hs / max(abs(vn.y), 0.02) / float(SLAB)); }
            float fpk = min(1.0 + 2.0 * (1.0 - dot(v0, vn)), 3.0);
            float ov = (s1 - s0) * chord;
            float dl = min(sDel, max(Hs * 0.5, 0.18 * (path + s0 * chord)));
            float d = dl - sAcc;
            for (int k = 0; k < 10; k++) {
              if (d > ov) break;
              float sm = s0 + (d - 0.5 * dl) / chord;
              diskSample(p + seg * sm, vn.y * dl, dl, vn, path + sm * chord, fpk, col, T);
              dl = min(sDel, max(Hs * 0.5, 0.18 * (path + (s0 + d / chord) * chord)));
              d += dl;
            }
            sAcc = ov - (d - dl);
            if (s1 < 1.0) {
              if (sAcc > 1e-4) { float sm = s1 - 0.5 * sAcc / chord; diskSample(p + seg * sm, vn.y * sAcc, sAcc, vn, path + sm * chord, fpk, col, T); }
              inSlab = false;
              sAcc = 0.0;
            }
          }
        }
      }
      if (!hit) inSlab = false;
      path += chord;
      p = pn;
      if (T < 0.004) { state = 2; break; }
    }
    if (state == 0) state = length(p) < 4.0 ? 2 : 1;
    if (state == 1) {
      v = normalize(v);
      float l = dot(p, v);
      vec3 pc = p - v * l;
      float b = max(length(pc), 1e-4);
      v = bendToward(v, -pc / b, wf(b) * (2.0 - Fw(l, b)));
    }
  }
  vEsc = normalize(v);
  tEsc = state == 1 ? T : 0.0;
  return col;
}

void main(){
  vec3 wd = normalize(vDir);
  vec3 ddx = dFdx(wd), ddy = dFdy(wd);
  vec3 dir = normalize(uWorldToBh * wd);
  int n = 1;
#if RINGAA
  float r0 = length(uObs);
  float b = r0 > 1.002 ? length(cross(uObs, aberrate(dir, uObs))) : 0.0;
  if (abs(b - 2.6 * uBend) < uRingAA * max(r0, 3.0) * uPixAng) n = RINGN;
#endif
  vec3 v0E = dir, acc = vec3(0.0);
  float t0E = 0.0, wsum = 0.0;
  for (int k = 0; k < RINGN; k++) {
    if (k >= n) break;
    float a = float(k) * 1.5707963 + (k > 4 ? 1.2490 : 0.4636);
    float rr = k == 0 ? 0.0 : (RINGN > 5 ? (k > 4 ? 0.85 : 0.42) : 0.65);
    vec3 vE;
    float tE;
    vec3 c = traceDir(normalize(uWorldToBh * (wd + ddx * (cos(a) * rr) + ddy * (sin(a) * rr))), k == 0 ? STEPS : 220, vE, tE);
    if (k == 0) { v0E = vE; t0E = tE; }
    float w = k == 0 ? 2.0 : 1.0;
    acc += w * c / (1.0 + max(c.r, max(c.g, c.b)));
    wsum += w;
  }
  acc /= wsum;
  vec3 col = acc / max(1.0 - max(acc.r, max(acc.g, acc.b)), 1e-4);
  float fade = 1.0 - smoothstep(0.86, 1.0, uPlunge);
  oCol = vec4(min(col * fade, vec3(60000.0)), 1.0);
  oDir = vec4(v0E, t0E * fade);
}`;

const COMPOSITE_FRAG = `
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform sampler2D uDir;
uniform vec2 uSize, uRes;
uniform float uStars, uPixFull, uSharp;
uniform mat3 uWorldToBh, uPrevBhToCam;
uniform vec4 uProj;
varying vec3 vDir;
varying vec2 vUv;
uvec3 pcg3(uvec3 v){ v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return v; }
vec3 hash3(vec3 p){ return vec3(pcg3(uvec3(ivec3(p) + 65536))) * (1.0 / 4294967295.0); }
vec3 starLayer(vec3 d, vec3 jx, vec3 jy, vec2 vel, float N, float prob, float seed, float gain){
  vec3 c = floor(d * N);
  vec3 h = hash3(c + seed);
  if (h.x > prob) return vec3(0.0);
  vec3 h2 = hash3(c + seed + 71.0);
  vec3 sp = normalize(c + 0.3 + 0.4 * h2);
  vec3 dd = sp - d;
  float a = dot(jx, jx), b = dot(jx, jy), e = dot(jy, jy);
  float det = max(a * e - b * b, 1e-26);
  float rx = dot(jx, dd), ry = dot(jy, dd);
  vec2 s = vec2(e * rx - b * ry, a * ry - b * rx) / det;
  vec2 sg = -0.5 * vel;
  float L2 = dot(sg, sg);
  float t = L2 > 1e-4 ? clamp(-dot(s, sg) / L2, 0.0, 1.0) : 0.0;
  vec2 o = s + sg * t;
  float w = exp(-dot(o, o) * 2.0) / (1.0 + sqrt(L2) * 0.9);
  float mu = clamp(uPixFull * uPixFull / sqrt(det), 0.15, 3.0);
  float m2 = h.y * h.y, m4 = m2 * m2;
  float mag = 0.01 + 2.6 * m4 * m4;
  vec3 tint = mix(vec3(1.0, 0.82, 0.64), vec3(0.8, 0.88, 1.0), h.z);
  return tint * mag * w * mu * gain;
}
vec4 dirAt(vec2 uv){
  vec2 sp = uv * uSize - 0.5;
  vec2 i = floor(sp), f = sp - i;
  ivec2 ii = ivec2(i), mx = ivec2(uSize) - 1;
  vec4 a = texelFetch(uDir, clamp(ii, ivec2(0), mx), 0), b = texelFetch(uDir, clamp(ii + ivec2(1, 0), ivec2(0), mx), 0);
  vec4 c = texelFetch(uDir, clamp(ii + ivec2(0, 1), ivec2(0), mx), 0), d = texelFetch(uDir, clamp(ii + ivec2(1, 1), ivec2(0), mx), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  vec2 sp = vUv * uSize;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  if (uSharp < 0.5) {
    vec2 g = 1.0 - f;
    w0 = g * g * g / 6.0; w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0; w3 = f * f * f / 6.0; w2 = 1.0 - w0 - w1 - w3;
  }
  vec2 w12 = w1 + w2;
  vec2 p0 = (t1 - 1.0) / uSize, p3 = (t1 + 2.0) / uSize, p12 = (t1 + w2 / w12) / uSize;
  vec3 c = textureLod(uTex, vec2(p0.x, p0.y), 0.0).rgb * w0.x * w0.y + textureLod(uTex, vec2(p12.x, p0.y), 0.0).rgb * w12.x * w0.y + textureLod(uTex, vec2(p3.x, p0.y), 0.0).rgb * w3.x * w0.y
         + textureLod(uTex, vec2(p0.x, p12.y), 0.0).rgb * w0.x * w12.y + textureLod(uTex, vec2(p12.x, p12.y), 0.0).rgb * w12.x * w12.y + textureLod(uTex, vec2(p3.x, p12.y), 0.0).rgb * w3.x * w12.y
         + textureLod(uTex, vec2(p0.x, p3.y), 0.0).rgb * w0.x * w3.y + textureLod(uTex, vec2(p12.x, p3.y), 0.0).rgb * w12.x * w3.y + textureLod(uTex, vec2(p3.x, p3.y), 0.0).rgb * w3.x * w3.y;
  ivec2 ip = ivec2(floor(sp)), mx = ivec2(uSize) - 1;
  vec3 lo = vec3(1e9), hi = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 t = texelFetch(uTex, clamp(ip + ivec2(i, j), ivec2(0), mx), 0).rgb;
    lo = min(lo, t); hi = max(hi, t);
  }
  c = clamp(c, lo, hi);
  vec4 de = dirAt(vUv);
  if (de.w > 0.001 && uStars > 0.0) {
    vec3 d = normalize(de.xyz);
    vec3 jx = dFdx(d), jy = dFdy(d);
    float lim = 40.0 * uPixFull;
    if (dot(jx, jx) < lim * lim && dot(jy, jy) < lim * lim) {
      vec3 bh0 = uWorldToBh * normalize(vDir);
      vec3 pc = uPrevBhToCam * bh0;
      vec2 vel = vec2(0.0);
      if (pc.z < -1e-3) {
        vec2 ndcPrev = vec2(uProj.x * pc.x / -pc.z - uProj.z, uProj.y * pc.y / -pc.z - uProj.w);
        vel = (vUv * 2.0 - 1.0 - ndcPrev) * 0.5 * uRes;
        if (dot(vel, vel) > 4096.0) vel = vec2(0.0);
      }
      c += de.w * uStars * (starLayer(d, jx, jy, vel, 70.0, 0.05, 0.0, 1.0) + starLayer(d, jx, jy, vel, 190.0, 0.018, 311.0, 0.4));
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const HALO_FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform float uHalo;
uniform vec3 uHaloTint;
varying vec2 vUv;
vec3 bs(float lod){
  vec2 sz = vec2(textureSize(uTex, int(lod)));
  vec2 p = vUv * sz - 0.5, i = floor(p), f = p - i;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0, w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0, w2 = 1.0 - w0 - w1 - w3;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / sz, h1 = (i + 1.5 + w3 / g1) / sz;
  return (textureLod(uTex, vec2(h0.x, h0.y), lod).rgb * g0.x + textureLod(uTex, vec2(h1.x, h0.y), lod).rgb * g1.x) * g0.y
       + (textureLod(uTex, vec2(h0.x, h1.y), lod).rgb * g0.x + textureLod(uTex, vec2(h1.x, h1.y), lod).rgb * g1.x) * g1.y;
}
void main(){
  vec3 h = bs(3.0) * 0.14 + bs(4.0) * 0.2 + bs(5.0) * 0.22 + bs(6.0) * 0.22 + bs(7.0) * 0.22;
  gl_FragColor = vec4(min(h, vec3(60000.0)) * uHalo * uHaloTint, 1.0);
}`;

function fullscreenGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

function makeDiskTexture(renderer, size = 2048) {
  const rt = new THREE.WebGLRenderTarget(size, size / 2, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({ vertexShader: FULL_VERT, fragmentShader: DISK_GEN_FRAG, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(fullscreenGeometry(), mat);
  mesh.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(mesh, cam);
  renderer.setRenderTarget(prev);
  mat.dispose(); mesh.geometry.dispose();
  return rt;
}

export function createGargantua({ renderer, quality = 'high' } = {}) {
  const diskRT = makeDiskTexture(renderer);
  const geo = fullscreenGeometry();
  const uniforms = {
    uObs: { value: new THREE.Vector3(0, 2, 60) },
    uWorldToBh: { value: new THREE.Matrix3() },
    uTime: { value: 0 },
    uBend: { value: 1 },
    uPlunge: { value: 0 },
    uPixAng: { value: 0.001 },
    uK: { value: 0.07 },
    uDisk: { value: diskRT.texture },
    uRin: { value: 2.55 },
    uRout: { value: 11.5 },
    uGain: { value: 300 },
    uDoppler: { value: 1.7 },
    uSpin: { value: 0.8 },
    uThick: { value: 0.42 },
    uOpacity: { value: 3.0 },
    uStars: { value: 1 },
    uTexR0: { value: 1.6 },
    uTexL: { value: Math.log(30 / 1.6) },
    uPeriod: { value: 30 },
    uSelfShadow: { value: 1.6 },
    uThin: { value: 0.16 },
    uBand: { value: 2.25 },
    uTail: { value: 0.06 },
    uFlare: { value: 0.2 },
    uRingAA: { value: 1.8 },
    uExitK: { value: 1.6 },
    uDetail: { value: 1 },
    uHalo: { value: 0.24 },
    uHaloTint: { value: new THREE.Color(0.86, 0.93, 1.08) },
  };
  const makeTrace = q => new THREE.ShaderMaterial({
    vertexShader: TRACE_VERT, fragmentShader: TRACE_FRAG, uniforms, glslVersion: THREE.GLSL3,
    defines: { STEPS: q.steps, SLAB: q.slab, SHADOW: q.shadow, DETAIL2: q.detail2, RINGAA: q.ringaa, RINGN: q.scale < 0.65 ? 9 : 5 }, depthTest: false, depthWrite: false,
  });
  let settings = GARGANTUA_QUALITY[quality] || GARGANTUA_QUALITY.high;
  let traceMat = makeTrace(settings);
  const traceMesh = new THREE.Mesh(geo, traceMat);
  traceMesh.frustumCulled = false;
  const target = new THREE.WebGLRenderTarget(2, 2, {
    count: 2, type: THREE.HalfFloatType, depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
  });
  const dirTex = target.textures[1];
  dirTex.type = THREE.FloatType;
  dirTex.minFilter = THREE.NearestFilter;
  dirTex.magFilter = THREE.NearestFilter;
  dirTex.generateMipmaps = false;
  const prevBhToCam = new THREE.Matrix3();
  const compositeMat = new THREE.ShaderMaterial({
    vertexShader: TRACE_VERT, fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uTex: { value: target.textures[0] }, uDir: { value: dirTex }, uSize: { value: new THREE.Vector2(2, 2) }, uRes: { value: new THREE.Vector2(2, 2) },
      uStars: uniforms.uStars, uPixFull: { value: 0.001 }, uSharp: { value: 1 }, uWorldToBh: uniforms.uWorldToBh, uPrevBhToCam: { value: prevBhToCam }, uProj: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    depthTest: false, depthWrite: false,
  });
  const compositeMesh = new THREE.Mesh(geo, compositeMat);
  compositeMesh.frustumCulled = false;
  compositeMesh.renderOrder = -1000;
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: FULL_VERT, fragmentShader: HALO_FRAG,
    uniforms: { uTex: { value: target.textures[0] }, uHalo: uniforms.uHalo, uHaloTint: uniforms.uHaloTint },
    depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
  });
  const haloMesh = new THREE.Mesh(geo, haloMat);
  haloMesh.frustumCulled = false;
  haloMesh.renderOrder = 20;
  const _q = new THREE.Quaternion();
  const _m4 = new THREE.Matrix4();
  const _m3 = new THREE.Matrix3();
  const _c3 = new THREE.Matrix3();
  const lastM = new THREE.Matrix3();
  let hasPrev = false;

  function setQuality(name) {
    const q = GARGANTUA_QUALITY[name];
    if (!q || q === settings) return;
    settings = q;
    traceMat.dispose();
    traceMat = makeTrace(q);
    traceMesh.material = traceMat;
  }

  function setSkyRotation(q) {
    _q.copy(q).invert();
    uniforms.uWorldToBh.value.setFromMatrix4(_m4.makeRotationFromQuaternion(_q));
  }

  function render(r, camera, width, height) {
    const w = Math.max(2, Math.round(width * settings.scale));
    const h = Math.max(2, Math.round(height * settings.scale));
    const cu = compositeMat.uniforms;
    if (target.width !== w || target.height !== h) { target.setSize(w, h); cu.uSize.value.set(w, h); }
    cu.uRes.value.set(width, height);
    uniforms.uK.value = settings.k;
    cu.uSharp.value = settings.scale >= 0.65 ? 1 : 0;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (camera.zoom || 1);
    uniforms.uPixAng.value = 2 * tanH / h;
    cu.uPixFull.value = 2 * tanH / height;
    const P = camera.projectionMatrix.elements;
    cu.uProj.value.set(P[0], P[5], P[8], P[9]);
    _c3.setFromMatrix4(camera.matrixWorld);
    _m3.multiplyMatrices(uniforms.uWorldToBh.value, _c3).transpose();
    prevBhToCam.copy(hasPrev ? lastM : _m3);
    lastM.copy(_m3);
    hasPrev = true;
    const prev = r.getRenderTarget();
    r.setRenderTarget(target);
    r.render(traceMesh, camera);
    r.setRenderTarget(prev);
  }

  function createEnvMesh() {
    const m = new THREE.Mesh(geo, makeTrace(GARGANTUA_QUALITY.env));
    m.frustumCulled = false;
    m.renderOrder = -1000;
    m.onBeforeRender = () => { uniforms.uK.value = GARGANTUA_QUALITY.env.k; uniforms.uPixAng.value = 2 / 256; };
    return m;
  }

  function measure(r, camera, width, height, frames = 20) {
    const buf = new Uint16Array(4);
    render(r, camera, width, height);
    r.readRenderTargetPixels(target, 0, 0, 1, 1, buf);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) render(r, camera, width, height);
    r.readRenderTargetPixels(target, 0, 0, 1, 1, buf);
    const t1 = performance.now();
    r.readRenderTargetPixels(target, 0, 0, 1, 1, buf);
    const t2 = performance.now();
    return { msPerFrame: (t1 - t0 - (t2 - t1)) / frames, width: target.width, height: target.height };
  }

  function dispose() {
    traceMat.dispose(); compositeMat.dispose(); haloMat.dispose(); geo.dispose(); target.dispose(); diskRT.dispose();
  }

  return {
    uniforms, target, compositeMesh, haloMesh, traceMesh, diskTexture: diskRT.texture,
    get settings() { return settings; },
    setQuality, setSkyRotation, render, createEnvMesh, measure, dispose,
    setObserver(v) { uniforms.uObs.value.copy(v); },
    setPlunge(x) { uniforms.uPlunge.value = x; uniforms.uBend.value = 1 + 0.8 * x * x; },
    setTime(t) { uniforms.uTime.value = t; },
  };
}
