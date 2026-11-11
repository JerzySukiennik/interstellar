// Miller's Planet overcast sky, shared aerial haze, procedural noise atlas, reflection environment and key light.
import * as THREE from 'three';

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE_FRAG = `
precision highp float;
precision highp int;
varying vec2 vUv;
uniform float uSeed;
uvec2 pcg2(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
vec2 rnd(ivec2 c, int per, uint salt){
  c = (c + per * 64) % per;
  uint s = uint(uSeed) * 7919u + salt * 104729u;
  return vec2(pcg2(uvec2(c) + uvec2(s, s * 3u + 17u))) * (1.0 / 4294967296.0);
}
vec2 grd(ivec2 c, int per, uint salt){ float a = rnd(c, per, salt).x * 6.2831853; return vec2(cos(a), sin(a)); }
float gn(vec2 p, int per, uint salt){
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grd(i, per, salt), f);
  float b = dot(grd(i + ivec2(1, 0), per, salt), f - vec2(1.0, 0.0));
  float c = dot(grd(i + ivec2(0, 1), per, salt), f - vec2(0.0, 1.0));
  float d = dot(grd(i + ivec2(1, 1), per, salt), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int per, int oct, uint salt){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= oct) break;
    s += a * gn(p, per, salt + uint(o));
    n += a; p *= 2.0; per *= 2; a *= 0.5;
  }
  return s / n;
}
vec2 worley(vec2 p, int per, uint salt){
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
  float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      ivec2 c = i + ivec2(x, y);
      vec2 o = vec2(float(x), float(y)) + rnd(c, per, salt) - f;
      float d = dot(o, o);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(vec2(f1, f2));
}
void main(){
  vec2 uv = vUv;
  vec2 w = vec2(fbm(uv * 4.0, 4, 5, 1u), fbm(uv * 4.0 + vec2(3.7, 1.9), 4, 5, 20u));
  vec2 A = worley(uv * 12.0 + w * 2.4, 12, 3u);
  float lace1 = exp(-(A.y - A.x) * 11.0);
  vec2 w2 = vec2(fbm(uv * 8.0 + 1.3, 8, 4, 40u), fbm(uv * 8.0 + 7.1, 8, 4, 50u));
  vec2 B = worley(uv * 30.0 + w2 * 3.2, 30, 6u);
  float lace2 = exp(-(B.y - B.x) * 8.0);
  vec2 C2 = worley(uv * 70.0 + w2 * 5.0, 70, 9u);
  float lace3 = exp(-(C2.y - C2.x) * 6.0);
  float lace = clamp(lace1 * 0.8 + lace2 * 0.5 + lace3 * 0.3 - 0.06, 0.0, 1.0);
  float pn = fbm(uv * 8.0 + w, 8, 6, 70u) * 1.6 + 0.5;
  float fine = fbm(uv * 64.0 + w2, 64, 3, 130u) * 1.6 + 0.5;
  float foam = clamp(smoothstep(0.42, 0.8, pn) * (0.75 + 0.25 * fine) + lace2 * 0.25 * smoothstep(0.3, 0.6, pn), 0.0, 1.0);
  float lo = clamp(fbm(uv * 4.0, 4, 8, 90u) * 1.6 + 0.5, 0.0, 1.0);
  float mid = clamp(fbm(uv * 16.0, 16, 6, 110u) * 1.6 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(lace, foam, lo, mid);
}`;

export const MILLER_SKY_GLSL = `
uniform vec3 mSkyTop;
uniform vec3 mSkyHorizon;
uniform vec3 mGlowDir;
uniform vec3 mGlowCol;
uniform vec3 mMurk;
uniform vec4 mHaze;
uniform vec4 mCloud;
uniform vec4 mCloud2;
uniform float mTime;
uniform sampler2D mNoise;
uniform vec4 mDeck;
uniform vec3 mDeckCol;
uniform vec3 mFarSea;
float millerGlow(vec3 d){
  float g = max(dot(d, mGlowDir), 0.0);
  return 0.4 * g * g + 0.5 * pow(g, 6.0) + 0.55 * pow(g, 36.0);
}
vec3 millerHazeColor(vec3 d){
  vec3 h = normalize(vec3(d.x, 0.06, d.z) + vec3(0.0, 1e-5, 0.0));
  return mSkyHorizon + mGlowCol * millerGlow(h) * 0.6;
}
vec3 millerSkyBase(vec3 d){
  float e = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(mSkyHorizon, mSkyTop, smoothstep(0.0, 1.0, pow(e, 0.55)));
  return c + mGlowCol * millerGlow(d);
}
vec2 millerCloudUV(vec3 d){
  float e = max(d.y, 0.0);
  float hc = clamp(mDeck.x - cameraPosition.y, 40.0, mDeck.x);
  return (d.xz * (hc / max(e, 0.035)) + cameraPosition.xz) * (mCloud.y / mDeck.x) * 0.45 + mCloud.zw * mTime;
}
float millerCloudN(vec2 cp, float lod){
  float b = textureLod(mNoise, cp, lod).b * 0.5 + textureLod(mNoise, cp * 2.3 + vec2(0.31, 0.77), lod).b * 0.2;
  float cell = textureLod(mNoise, cp * 1.3 + b * 0.5 + vec2(0.4, 0.2), lod).a;
  return b + cell * 0.3 + textureLod(mNoise, cp * 4.3 + vec2(0.11, 0.53), lod).a * 0.08 - 0.06;
}
vec3 millerClouds(vec3 d, vec3 base){
  float e = max(d.y, 0.0);
  vec2 cp = millerCloudUV(d);
  float lod = clamp(log2(1.0 + 0.04 / max(e, 0.01)), 0.0, 6.0);
  float n = millerCloudN(cp, lod);
  float th = smoothstep(0.36, 0.7, n);
  float vis = smoothstep(0.02, 0.3, e) * mCloud.x;
  float g = millerGlow(d);
  float rim = smoothstep(0.25, 0.45, n) * (1.0 - smoothstep(0.45, 0.75, n));
  vec3 c = base * (1.0 + vis * (0.1 - mCloud2.x * th + 0.12 * rim));
  c += mGlowCol * g * vis * (1.0 - th) * mCloud2.y;
  return c;
}
vec3 millerSky(vec3 d){
  vec3 hz = millerHazeColor(d);
  vec3 s = millerClouds(d, millerSkyBase(d));
  return mix(hz, s, smoothstep(0.0, 0.13, d.y));
}
vec3 millerSkyR(vec3 d){
  vec3 hz = millerHazeColor(d);
  float e = max(d.y, 0.0);
  float n = millerCloudN(millerCloudUV(d), 4.5);
  float th = smoothstep(0.36, 0.7, n);
  float vis = smoothstep(0.02, 0.3, e) * mCloud.x;
  vec3 base = millerSkyBase(d);
  vec3 c = base * (1.0 + vis * (0.1 - mCloud2.x * th)) + mGlowCol * millerGlow(d) * vis * (1.0 - th) * mCloud2.y;
  return mix(hz, c, smoothstep(0.0, 0.13, d.y));
}
vec3 millerInscatter(vec3 d){
  return mix(millerHazeColor(d), millerSkyBase(d), smoothstep(0.03, 0.6, d.y));
}
float millerLayer(float cy, float py, float L, float dens, float b){
  cy = max(cy, -20.0); py = max(py, -20.0);
  float dy = py - cy;
  float e0 = exp(-b * cy), e1 = exp(-b * py);
  float r = abs(b * dy) > 1e-3 ? (e0 - e1) / (b * dy) : e0 * (1.0 - 0.5 * b * dy);
  return dens * L * r;
}
float millerSlab(float cy, float py, float L, float y0, float y1){
  float dy = py - cy;
  if (abs(dy) < 1e-3) return (cy >= y0 && cy <= y1) ? L : 0.0;
  float a = clamp((y0 - cy) / dy, 0.0, 1.0), b = clamp((y1 - cy) / dy, 0.0, 1.0);
  return abs(b - a) * L;
}
float millerDeckOptical(vec3 c, vec3 p){
  float L = length(p - c);
  return millerSlab(c.y, p.y, L, mDeck.x, mDeck.y) * mDeck.z + millerSlab(c.y, p.y, L, mDeck.x - 380.0, mDeck.x) * mDeck.w;
}
float millerOpticalK(vec3 c, vec3 p, float km, float ks){
  float L = length(p - c);
  return millerLayer(c.y, p.y, L, mHaze.x * km, mHaze.y) + millerLayer(c.y, p.y, L, mHaze.w * ks, mCloud2.z) + millerDeckOptical(c, p);
}
float millerOptical(vec3 c, vec3 p){ return millerOpticalK(c, p, 1.0, 1.0); }
vec3 millerHazeK(vec3 col, vec3 p, float km, float ks){
  vec3 dv = p - cameraPosition;
  float L = length(dv);
  vec3 d = dv / max(L, 1e-3);
  float od = millerOpticalK(cameraPosition, p, km, ks);
  float dk = millerDeckOptical(cameraPosition, p);
  float T = exp(-od);
  col = mix(mix(millerInscatter(d), mDeckCol, dk / max(od, 1e-4)), col, T);
  return mix(col, mMurk * (1.0 + 2.2 * max(d.y, 0.0)), mHaze.z * (1.0 - exp(-L * 0.9)));
}
vec3 millerHaze(vec3 col, vec3 p){ return millerHazeK(col, p, 1.0, 1.0); }
`;

const SKY_VERT = `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main(){
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const SKY_FRAG = MILLER_SKY_GLSL + `
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = millerSky(d);
  vec3 cam = cameraPosition;
  if (d.y < 0.0 && cam.y > 2.0) {
    vec3 hit = cam + d * min(cam.y / -d.y, 400000.0);
    float od = millerOptical(cam, hit);
    float dk = millerDeckOptical(cam, hit);
    c = mix(mix(millerInscatter(d), mDeckCol, dk / max(od, 1e-4)), mFarSea * (mSkyTop * 0.75 + mSkyHorizon * 0.25), exp(-od));
  }
  float inDeck = 0.0;
  if (cam.y > mDeck.x - 380.0) {
    float far = d.y > 0.0 ? (mDeck.y + 10.0 - cam.y) / max(d.y, 1e-3) : (cam.y - mDeck.x + 380.0) / max(-d.y, 1e-3);
    vec3 e = cam + d * clamp(far, 0.0, 40000.0);
    float dk = millerDeckOptical(cam, e);
    inDeck = 1.0 - exp(-dk);
    if (cam.y > mDeck.y && d.y > 0.0) inDeck = 0.0;
  }
  c = mix(c, mDeckCol * (1.0 + 0.12 * d.y), inDeck);
  c = mix(c, mMurk * (1.0 + 2.2 * max(d.y, 0.0)), mHaze.z);
  gl_FragColor = vec4(c, 1.0);
}`;

const ENV_VERT = `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const ENV_FRAG = MILLER_SKY_GLSL + `
uniform vec3 uSea;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c;
  if (d.y >= 0.0) c = millerSky(d);
  else {
    vec3 hz = millerHazeColor(d);
    float t = pow(clamp(1.0 + d.y * 3.0, 0.0, 1.0), 3.0);
    c = mix(uSea * (mSkyTop * 0.8 + mSkyHorizon * 0.2), hz, t);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const HAZE_VERT_CHUNK = `#include <project_vertex>
  {
    vec4 mhw = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      mhw = batchingMatrix * mhw;
    #endif
    #ifdef USE_INSTANCING
      mhw = instanceMatrix * mhw;
    #endif
    vMillerW = (modelMatrix * mhw).xyz;
  }`;

export function createMillerNoise(renderer, size = 1024, seed = 17) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: NOISE_FRAG, uniforms: { uSeed: { value: seed } }, depthTest: false, depthWrite: false });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const tri = new THREE.Mesh(geo, mat);
  tri.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(tri, cam);
  renderer.setRenderTarget(prev);
  geo.dispose(); mat.dispose();
  return rt;
}

export function createMillerSky({ engine, renderer = engine.renderer, noiseSize, glowDir = [-0.32, 0.5, -0.8], env = true } = {}) {
  const tier = engine?.qualityName || 'high';
  const noise = createMillerNoise(renderer, noiseSize || (tier === 'high' || tier === 'ultra' ? 2048 : 1024));
  const uniforms = {
    mSkyTop: { value: new THREE.Color(0.47, 0.445, 0.4) },
    mSkyHorizon: { value: new THREE.Color(0.53, 0.49, 0.415) },
    mGlowDir: { value: new THREE.Vector3(...glowDir).normalize() },
    mGlowCol: { value: new THREE.Color(0.2, 0.17, 0.12) },
    mMurk: { value: new THREE.Color(0.018, 0.03, 0.027) },
    mHaze: { value: new THREE.Vector4(1 / 10000, 1 / 900, 0, 1 / 1430) },
    mCloud: { value: new THREE.Vector4(1.0, 0.11, 0.0016, 0.0007) },
    mCloud2: { value: new THREE.Vector4(0.5, 0.6, 1 / 40, 0) },
    mTime: { value: 0 },
    mNoise: { value: noise.texture },
    mDeck: { value: new THREE.Vector4(2200, 3800, 1 / 35, 1 / 2600) },
    mDeckCol: { value: new THREE.Color(0.6, 0.585, 0.545) },
    mFarSea: { value: new THREE.Color(0.12, 0.17, 0.16) },
  };

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(triGeo, skyMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e6;
  mesh.name = 'miller-sky';
  mesh.onBeforeRender = (r, s, cam) => {
    skyMat.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    skyMat.uniforms.uCamWorld.value.copy(cam.matrixWorld);
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({ uniforms: { ...uniforms, uSea: { value: new THREE.Color(0.17, 0.2, 0.185) } }, vertexShader: ENV_VERT, fragmentShader: ENV_FRAG, side: THREE.BackSide, depthWrite: false });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), envMat));
  let envRT = null;
  const api = {
    uniforms, noise: noise.texture, mesh,
    environment: null,
    keyLight: new THREE.DirectionalLight(0xfff0dc, 1.6),
    glsl: MILLER_SKY_GLSL,
    refreshEnvironment() {
      const t = uniforms.mTime.value;
      const old = envRT;
      envRT = pmrem.fromScene(envScene, 0, 0.1, 200);
      uniforms.mTime.value = t;
      api.environment = envRT.texture;
      old?.dispose();
      return api.environment;
    },
    applyHaze(material) {
      if (material.userData.millerHaze) return material;
      material.userData.millerHaze = true;
      const prev = material.onBeforeCompile;
      material.onBeforeCompile = (shader, r) => {
        prev?.call(material, shader, r);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vMillerW;\n' + shader.vertexShader.replace('#include <project_vertex>', HAZE_VERT_CHUNK);
        shader.fragmentShader = 'varying vec3 vMillerW;\n' + MILLER_SKY_GLSL + shader.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = millerHaze(gl_FragColor.rgb, vMillerW);\n#include <fog_fragment>');
      };
      const key = material.customProgramCacheKey;
      material.customProgramCacheKey = function () { return key.call(this) + '|millerHaze'; };
      material.needsUpdate = true;
      return material;
    },
    hazeTransmittance(from, to) {
      const L = from.distanceTo(to);
      const layer = (cy, py, dens, b) => {
        cy = Math.max(cy, -20); py = Math.max(py, -20);
        const dy = py - cy, e0 = Math.exp(-b * cy), e1 = Math.exp(-b * py);
        const r = Math.abs(b * dy) > 1e-3 ? (e0 - e1) / (b * dy) : e0 * (1 - 0.5 * b * dy);
        return dens * L * r;
      };
      const h = uniforms.mHaze.value;
      return Math.exp(-(layer(from.y, to.y, h.x, h.y) + layer(from.y, to.y, h.w, uniforms.mCloud2.value.z)));
    },
    setUnder(v) { uniforms.mHaze.value.z = v; },
    setCloudDeck({ base, top, density, scud } = {}) {
      const d = uniforms.mDeck.value;
      if (base !== undefined) d.x = base;
      if (top !== undefined) d.y = top;
      if (density !== undefined) d.z = density;
      if (scud !== undefined) d.w = scud;
    },
    setAltitude() {},
    setColors({ top, horizon, glow, deck } = {}) {
      const set = (u, v) => { if (v) (Array.isArray(v) ? u.value.setRGB(...v) : u.value.copy(v)); };
      set(uniforms.mSkyTop, top); set(uniforms.mSkyHorizon, horizon); set(uniforms.mGlowCol, glow); set(uniforms.mDeckCol, deck);
    },
    setClouds({ coverage, darkness, scale } = {}) {
      if (coverage !== undefined) uniforms.mCloud.value.x = coverage;
      if (scale !== undefined) uniforms.mCloud.value.y = scale;
      if (darkness !== undefined) uniforms.mCloud2.value.x = darkness;
    },
    setHaze({ density, falloff } = {}) {
      if (density !== undefined) uniforms.mHaze.value.x = density;
      if (falloff !== undefined) uniforms.mHaze.value.y = falloff;
    },
    setSprayHaze(d) { uniforms.mHaze.value.w = d; },
    update(dt) { uniforms.mTime.value += dt; },
    dispose() {
      triGeo.dispose(); skyMat.dispose(); envMat.dispose(); envScene.children[0].geometry.dispose();
      envRT?.dispose(); pmrem.dispose(); noise.dispose();
    },
  };
  const kd = uniforms.mGlowDir.value;
  api.keyLight.position.copy(kd).multiplyScalar(1000);
  api.keyLight.target.position.set(0, 0, 0);
  api.keyLight.name = 'miller-key';
  if (env) api.refreshEnvironment();
  return api;
}
