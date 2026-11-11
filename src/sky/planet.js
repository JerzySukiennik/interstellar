// Miller's Planet from space: analytic sphere with procedural cloud deck, dark ocean glint and thin atmosphere, lit by Gargantua as a large area light.
import * as THREE from 'three';

const VERT = `
varying vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = `
precision highp float;
precision highp int;
uniform vec3 uCenter;
uniform float uRadius, uAtm, uLightSize, uPower, uPixAng, uCover, uMie, uAtmGain;
uniform vec3 uLight, uLightColor, uOcean, uCloudCol, uScatter, uSeed;
uniform mat3 uRot;
varying vec3 vWorld;
const float PI = 3.14159265;

uvec3 pcg3(uvec3 v){ v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return v; }
float h31(vec3 p){ return float(pcg3(uvec3(ivec3(p) + 1048576)).x) * (1.0 / 4294967295.0); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = h31(i), b = h31(i + vec3(1, 0, 0)), c = h31(i + vec3(0, 1, 0)), d = h31(i + vec3(1, 1, 0));
  float e = h31(i + vec3(0, 0, 1)), g = h31(i + vec3(1, 0, 1)), h = h31(i + vec3(0, 1, 1)), k = h31(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float area(float x, float s){ return x >= s ? x : (x <= -s ? 0.0 : (x + s) * (x + s) / (4.0 * s)); }

vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yzz) * p.zyx); }
float cellv(vec3 p){
  vec3 i = floor(p), f = p - i;
  float d = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + h33(i + o) * 0.85 + 0.075 - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
vec2 clouds(vec3 P, float fp, int maxOct, int cellOct){
  vec3 q = P * 5.0 + uSeed;
  vec3 w = vec3(vnoise(q * 0.9), vnoise(q * 0.9 + 11.3), vnoise(q * 0.9 + 23.9)) - 0.5;
  q += w * 0.35;
  float cov = vnoise(P * 2.0 + uSeed.zxy + 7.0) * 0.6 + vnoise(P * 5.0 + 3.0) * 0.4 + 0.12 * sin(P.y * 9.0 + w.x * 3.0);
  float n = 0.0, a = 0.5, f = 2.0, norm = 0.0;
  for (int i = 0; i < 13; i++) {
    if (i >= maxOct) break;
    float fade = 1.0 - smoothstep(0.22, 0.5, fp * 5.0 * f);
    float v = fade > 0.0 ? mix(0.5, vnoise(q * f + float(i) * 3.17), fade) : 0.5;
    n += a * v; norm += a; a *= 0.55; f *= 2.03;
  }
  n /= norm;
  float cell = 0.5 * 0.62;
  float cf1 = 1.0 - smoothstep(0.2, 0.45, fp * 5.0 * 22.0);
  if (cellOct > 0 && cf1 > 0.0) cell = mix(0.5, cellv(q * 22.0), cf1) * 0.62;
  float cf2 = 1.0 - smoothstep(0.2, 0.45, fp * 5.0 * 64.0);
  cell += (cellOct > 1 && cf2 > 0.0 ? mix(0.5, cellv(q * 64.0 + 4.1), cf2) : 0.5) * 0.38;
  float field = 0.68 * n + 0.32 * cell;
  float t = 0.6 - (cov - 0.5) * 0.55 - (uCover - 0.5) * 0.4;
  return vec2(smoothstep(t - 0.025, t + 0.025, field), clamp(0.45 + (field - t) * 4.5, 0.0, 1.3));
}

vec2 sphere(vec3 ro, vec3 rd, float R){
  float b = dot(ro, rd), c = dot(ro, ro) - R * R, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main(){
  vec3 rd = normalize(vWorld - cameraPosition);
  vec3 ro = (cameraPosition - uCenter) / uRadius;
  float Ra = 1.0 + uAtm;
  vec2 ta = sphere(ro, rd, Ra);
  if (ta.y <= 0.0) discard;
  vec2 tp = sphere(ro, rd, 1.0);
  bool hit = tp.x > 0.0;
  float t0 = max(ta.x, 0.0);
  float t1 = hit ? tp.x : ta.y;
  vec3 L = uLight;
  float s = sin(uLightSize);
  vec3 lightRad = uLightColor * uPower;
  float kAtm = 0.24 / uAtm;
  float ds = (t1 - t0) / 6.0;
  float od = 0.0;
  vec3 ins = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec3 pos = ro + rd * (t0 + (float(i) + 0.5) * ds);
    float r = length(pos);
    float h = clamp((r - 1.0) / uAtm, 0.0, 1.0);
    float dens = exp(-h * 6.0);
    float mu = dot(pos / r, L);
    float vis = smoothstep(-0.18 - s, 0.22, mu);
    ins += dens * ds * vis * exp(-od * kAtm * uScatter);
    od += dens * ds;
  }
  float c = dot(rd, L);
  float g = 0.76;
  float phase = 0.75 * (1.0 + c * c) * 0.06 + uMie * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) * 0.02;
  vec3 scat = ins * kAtm * uScatter * phase * lightRad * uAtmGain;
  vec3 trans = exp(-od * kAtm * uScatter);
  if (!hit) {
    float a = 1.0 - exp(-od * kAtm * 0.4);
    gl_FragColor = vec4(scat, a);
    return;
  }
  vec3 pw = ro + rd * tp.x;
  vec3 n = normalize(pw);
  vec3 P = uRot * n;
  float mv = max(dot(n, -rd), 0.02);
  float fp = uPixAng * tp.x * uRadius / uRadius / sqrt(mv);
  float muL = dot(n, L);
  float irr = area(muL, s);
  vec3 col = vec3(0.0);
  if (muL > -s - 0.05) {
    vec2 c0 = clouds(P, fp, 12, 2);
    float d0 = c0.x;
    vec3 Tl = L - n * muL;
    float tl = length(Tl);
    Tl = tl > 1e-5 ? Tl / tl : vec3(0.0);
    vec2 c1 = clouds(normalize(P + uRot * Tl * 0.0035), fp * 2.5, 7, 1);
    float d1 = c1.x;
    float relief = clamp(0.85 + (c0.y - c1.y) * (1.2 + 2.5 * (1.0 - clamp(muL, 0.0, 1.0))), 0.25, 1.4);
    vec3 cloud = uCloudCol / PI * irr * relief * (0.35 + 0.6 * c0.y);
    vec3 V = -rd;
    vec3 Hh = normalize(L + V);
    float nh = max(dot(n, Hh), 0.0);
    float al = 0.22 + 0.5 * s;
    float a2 = al * al;
    float dn = nh * nh * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dn * dn);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
    float shadowOnSea = exp(-d1 * 1.6);
    float ov = vnoise(P * 3.0 + 1.7) * 0.6 + vnoise(P * 11.0 + 5.3) * 0.4;
    vec3 oc = mix(uOcean * vec3(0.8, 0.95, 1.25), uOcean * vec3(1.15, 1.05, 0.85), ov) * (0.75 + 0.5 * ov);
    vec3 ocean = oc / PI * irr + vec3(D * F * 0.6 / (4.0 * max(mv, 0.15))) * irr * shadowOnSea;
    col = mix(ocean, cloud, d0) * lightRad;
  }
  gl_FragColor = vec4(col * trans + scat, 1.0);
}`;

export function createPlanet({ distance = 100 } = {}) {
  const uniforms = {
    uCenter: { value: new THREE.Vector3(0, 0, -distance) },
    uRadius: { value: 1 },
    uAtm: { value: 0.006 },
    uLight: { value: new THREE.Vector3(0, 0, -1) },
    uLightColor: { value: new THREE.Color(1.0, 0.95, 0.88) },
    uLightSize: { value: 0.3 },
    uPower: { value: 13 },
    uPixAng: { value: 0.001 },
    uCover: { value: 0.6 },
    uMie: { value: 1 },
    uAtmGain: { value: 1 },
    uOcean: { value: new THREE.Color(0.028, 0.042, 0.05) },
    uCloudCol: { value: new THREE.Color(0.7, 0.69, 0.66) },
    uScatter: { value: new THREE.Vector3(0.62, 0.8, 1.0) },
    uSeed: { value: new THREE.Vector3(3.1, 7.7, 1.9) },
    uRot: { value: new THREE.Matrix3() },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.BackSide,
    transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  mesh.visible = false;
  const state = {
    direction: new THREE.Vector3(0, 0, -1), angularRadius: 0.01, distance: null, spin: 0, angle: 0,
    axis: new THREE.Vector3(0.1, 1, 0.2).normalize(), lightRadius: 9, power: 13, light: null,
  };
  const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Vector3(), _w = new THREE.Vector3();

  function set(o = {}) {
    if (o.direction) state.direction.copy(o.direction).normalize();
    if (o.angularRadius !== undefined) state.angularRadius = THREE.MathUtils.clamp(o.angularRadius, 1e-4, 1.5);
    if (o.distance !== undefined) state.distance = o.distance;
    if (o.spin !== undefined) state.spin = o.spin;
    if (o.angle !== undefined) state.angle = o.angle;
    if (o.axis) state.axis.copy(o.axis).normalize();
    if (o.cover !== undefined) uniforms.uCover.value = o.cover;
    if (o.atmosphere !== undefined) uniforms.uAtm.value = o.atmosphere;
    if (o.atmosphereGain !== undefined) uniforms.uAtmGain.value = o.atmosphereGain;
    if (o.power !== undefined) state.power = o.power;
    if (o.seed) uniforms.uSeed.value.copy(o.seed);
    if (o.light !== undefined) state.light = o.light ? o.light.clone().normalize() : null;
    if (o.visible !== undefined) mesh.visible = o.visible; else mesh.visible = true;
  }

  function update({ skyQuaternion, observer, pixAng, dt = 0, lightColor }) {
    state.angle += state.spin * dt;
    _w.copy(state.direction).applyQuaternion(skyQuaternion);
    const R = distance * Math.sin(state.angularRadius);
    uniforms.uCenter.value.copy(_w).multiplyScalar(distance);
    uniforms.uRadius.value = R;
    mesh.position.copy(uniforms.uCenter.value);
    mesh.scale.setScalar(R * (1 + uniforms.uAtm.value) * 1.04);
    mesh.updateMatrixWorld();
    if (state.distance) _c.copy(state.direction).multiplyScalar(state.distance).add(observer); else _c.copy(observer);
    const dc = Math.max(_c.length(), 1.01);
    if (state.light) uniforms.uLight.value.copy(state.light).applyQuaternion(skyQuaternion);
    else uniforms.uLight.value.copy(_c).multiplyScalar(-1 / dc).applyQuaternion(skyQuaternion);
    uniforms.uLightSize.value = THREE.MathUtils.clamp(Math.atan(state.lightRadius / dc), 0.01, 0.9);
    uniforms.uPower.value = state.power;
    uniforms.uPixAng.value = pixAng;
    if (lightColor) uniforms.uLightColor.value.copy(lightColor);
    _qs.setFromAxisAngle(state.axis, state.angle);
    _q.copy(skyQuaternion).multiply(_qs).invert();
    uniforms.uRot.value.setFromMatrix4(_m.makeRotationFromQuaternion(_q));
  }

  function createMirror() {
    const m = new THREE.Mesh(geometry, material);
    m.renderOrder = 10;
    m.frustumCulled = false;
    m.onBeforeRender = () => { m.position.copy(mesh.position); m.scale.copy(mesh.scale); m.visible = mesh.visible; m.updateMatrixWorld(); };
    return m;
  }

  function dispose() { geometry.dispose(); material.dispose(); }

  return { mesh, uniforms, state, set, update, createMirror, dispose };
}
