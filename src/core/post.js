// Interstellar film pipeline: HDR scene target (MSAA) -> mip-chain bloom with halation -> ACES grade, vignette, letterbox, fade. Clean image: no grain, only an invisible 1/255 dither against banding.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN_FRAG = `
precision highp float;
uniform sampler2D tSrc; uniform vec2 texel; uniform float karis; uniform float threshold;
varying vec2 vUv;
vec3 s(vec2 o){ return min(texture2D(tSrc, vUv + o * texel).rgb, vec3(2000.0)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
  vec3 col;
  if (karis > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = 0.125 / (1.0 + luma(g0)), w1 = 0.125 / (1.0 + luma(g1)), w2 = 0.125 / (1.0 + luma(g2)), w3 = 0.125 / (1.0 + luma(g3)), w4 = 0.5 / (1.0 + luma(g4));
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
    float lu = luma(col);
    col *= smoothstep(threshold * 0.5, threshold * 1.5 + 1e-4, lu);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const UP_FRAG = `
precision highp float;
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; uniform float radius;
varying vec2 vUv;
void main(){
  vec3 t = texture2D(tSrc, vUv).rgb * 4.0;
  t += (texture2D(tSrc, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(texel.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, texel.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, texel.y)).rgb) * 2.0;
  t += texture2D(tSrc, vUv + texel).rgb + texture2D(tSrc, vUv - texel).rgb + texture2D(tSrc, vUv + vec2(texel.x, -texel.y)).rgb + texture2D(tSrc, vUv + vec2(-texel.x, texel.y)).rgb;
  t *= 0.0625;
  gl_FragColor = vec4(mix(texture2D(tBase, vUv).rgb, t, radius), 1.0);
}`;

const FINAL_FRAG = `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform vec2 res; uniform float time;
uniform float exposure, bloomStrength, halation, grain, vignette, ca, letterbox, fade, saturation, contrast, streak;
uniform vec3 fadeColor, tintShadow, tintHigh;
varying vec2 vUv;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 aces(vec3 v){
  v = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * v;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  v = a / b;
  v = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * v;
  return clamp(v, 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 d = vUv - 0.5;
  vec2 off = d * ca * (0.4 + dot(d, d) * 2.4);
  vec3 col = vec3(texture2D(tScene, vUv - off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + off).b);
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  if (streak > 0.0) {
    vec3 st = vec3(0.0);
    for (int i = -4; i <= 4; i++) { float fi = float(i); st += texture2D(tBloom, vUv + vec2(fi * 0.022, 0.0)).rgb * exp(-fi * fi * 0.16); }
    bloom += st * 0.3 * streak * vec3(0.75, 0.9, 1.25);
  }
  bloom *= mix(vec3(1.0), vec3(1.12, 0.92, 0.74), halation);
  col = mix(col, bloom, bloomStrength);
  col *= exposure;
  float asp = res.x / res.y;
  float vg = length(d * vec2(min(asp, 2.0) / 1.6, 1.0));
  col *= mix(1.0, pow(max(1.0 - vg * vg * 1.15, 0.0), 1.6), vignette);
  col = aces(col * 1.35);
  float lu = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lu), col, saturation);
  col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
  col += tintShadow * (1.0 - smoothstep(0.0, 0.45, lu)) * smoothstep(0.0, 0.06, lu) + tintHigh * smoothstep(0.5, 1.0, lu);
  col = toSRGB(clamp(col, 0.0, 1.0));
  float n = hash(gl_FragCoord.xy + vec2(fract(time * 7.13) * 91.7, fract(time * 3.71) * 53.3)) + hash(gl_FragCoord.yx + vec2(17.3 + fract(time * 5.31) * 37.1, 41.9 + fract(time * 9.17) * 71.3)) - 1.0;
  col += n * (0.6 / 255.0);
  col = mix(col, fadeColor, fade);
  float bar = max(0.0, (1.0 - asp / 2.39) * 0.5) * letterbox;
  float edge = 1.5 / res.y;
  col *= smoothstep(bar - edge, bar + edge, vUv.y) * smoothstep(bar - edge, bar + edge, 1.0 - vUv.y);
  gl_FragColor = vec4(col, 1.0);
}`;

const METER_FRAG = `
precision highp float;
uniform sampler2D tSrc;
varying vec2 vUv;
void main(){
  float l = dot(texture2D(tSrc, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
  float v = clamp((log2(max(l, 1e-5)) + 16.0) / 32.0, 0.0, 1.0) * 255.0;
  float hi = floor(v);
  gl_FragColor = vec4(hi / 255.0, v - hi, 0.0, 1.0);
}`;

export const LOOKS = {
  space: { exposure: 1.0, bloomStrength: 0.085, bloomRadius: 0.75, halation: 0.2, vignette: 0.5, ca: 0.0, saturation: 0.82, contrast: 0.36, tintShadow: [0.0, 0.001, 0.004], tintHigh: [0.0, 0.003, 0.008] },
  cockpit: { exposure: 1.0, bloomStrength: 0.1, bloomRadius: 0.75, halation: 0.3, vignette: 0.55, ca: 0.0, saturation: 0.86, contrast: 0.3, tintShadow: [0.0, 0.002, 0.005], tintHigh: [0.004, 0.003, 0.0] },
  interior: { exposure: 1.0, bloomStrength: 0.07, bloomRadius: 0.7, halation: 0.25, vignette: 0.5, ca: 0.0, saturation: 0.9, contrast: 0.24, tintShadow: [0.0, 0.004, 0.005], tintHigh: [0.0, 0.002, 0.004] },
};

const TWEENABLE = ['exposure', 'bloomStrength', 'bloomRadius', 'bloomThreshold', 'halation', 'grain', 'vignette', 'ca', 'letterbox', 'fade', 'saturation', 'contrast', 'streak'];
const TWEEN_COLORS = ['fadeColor', 'tintShadow', 'tintHigh'];

export class FilmPipeline {
  constructor(renderer, { msaa = 4, bloomLevels = 7 } = {}) {
    this.renderer = renderer;
    this.msaa = msaa;
    this.bloomLevels = bloomLevels;
    this.exposure = 1.0;
    this.bloomStrength = 0.085;
    this.bloomRadius = 0.75;
    this.bloomThreshold = 0.0;
    this.halation = 0.2;
    this.grain = 0.0;
    this.vignette = 0.5;
    this.ca = 0.0;
    this.letterbox = 0.0;
    this.fade = 0.0;
    this.saturation = 0.82;
    this.contrast = 0.36;
    this.streak = 0.0;
    this.fadeColor = new THREE.Color(0, 0, 0);
    this.tintShadow = new THREE.Color(0.0, 0.001, 0.004);
    this.tintHigh = new THREE.Color(0.0, 0.003, 0.008);
    this._tweens = [];
    this._time = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this._tri = new THREE.Mesh(geo, null);
    this._tri.frustumCulled = false;
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this._down = mk(DOWN_FRAG, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, karis: { value: 0 }, threshold: { value: 0 } });
    this._up = mk(UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 0.7 } });
    this._final = mk(FINAL_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, res: { value: new THREE.Vector2() }, time: { value: 0 },
      exposure: { value: 1 }, bloomStrength: { value: 0 }, halation: { value: 0 }, grain: { value: 0 }, vignette: { value: 0 }, ca: { value: 0 },
      letterbox: { value: 0 }, fade: { value: 0 }, saturation: { value: 1 }, contrast: { value: 0 }, streak: { value: 0 },
      fadeColor: { value: this.fadeColor }, tintShadow: { value: this.tintShadow }, tintHigh: { value: this.tintHigh },
    });
    this.sceneRT = null;
    this._mips = [];
    this._ups = [];
    this.meter = 0.18;
    this.meterReady = false;
    this.auto = null;
    this.autoCap = Infinity;
    this._meterMat = mk(METER_FRAG, { tSrc: { value: null } });
    this._meterRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this._meterBuf = new Uint8Array(8 * 8 * 4);
    this._meterBusy = false;
    this._meterFrame = 0;
  }

  setAutoExposure(opts) {
    this.auto = opts ? { key: 0.14, min: 0.3, max: 2.0, up: 2.5, down: 0.8, ...opts } : null;
  }

  lumaGrid(out) {
    if (!this.meterReady) return null;
    const g = out || (this._luma ||= new Float32Array(64)), buf = this._meterBuf;
    const e = this.exposure * 1.35, c = this.contrast, f = this.fade, fc = this.fadeColor;
    const fl = fc ? 0.2126 * fc.r + 0.7152 * fc.g + 0.0722 * fc.b : 0;
    for (let i = 0; i < 64; i++) {
      const x = Math.pow(2, ((buf[i * 4] + buf[i * 4 + 1] / 255) / 255) * 32 - 16) * e;
      let y = Math.min(1, Math.max(0, (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081)));
      y += (y * y * (3 - 2 * y) - y) * c;
      y = y <= 0.0031308 ? y * 12.92 : 1.055 * Math.pow(y, 1 / 2.4) - 0.055;
      g[i] = y + (fl - y) * f;
    }
    return g;
  }

  _meter() {
    if (this._meterBusy || (this._meterFrame++ % 4) !== 0 || typeof this.renderer.readRenderTargetPixelsAsync !== 'function') return;
    const src = this._mips[this._mips.length - 1];
    if (!src) return;
    this._meterMat.uniforms.tSrc.value = src.texture;
    this._blit(this._meterMat, this._meterRT);
    this._meterBusy = true;
    let read;
    try { read = this.renderer.readRenderTargetPixelsAsync(this._meterRT, 0, 0, 8, 8, this._meterBuf); } catch (e) { this._meterBusy = false; return; }
    if (!read || typeof read.then !== 'function') { this._meterBusy = false; return; }
    read.then(() => {
      let sum = 0;
      for (let i = 0; i < 64; i++) sum += (this._meterBuf[i * 4] + this._meterBuf[i * 4 + 1] / 255) / 255;
      this.meter = Math.pow(2, (sum / 64) * 32 - 16);
      this.meterReady = true;
      this._meterBusy = false;
    }, () => { this._meterBusy = false; });
  }

  setSize(w, h, fullW = w, fullH = h) {
    this.width = w; this.height = h;
    this.sceneRT?.dispose();
    this._mips.forEach(t => t.dispose());
    this._ups.forEach(t => t.dispose());
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.msaa, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this._mips = []; this._ups = [];
    let mw = Math.max(w, fullW), mh = Math.max(h, fullH);
    for (let i = 0; i < this.bloomLevels; i++) {
      mw = Math.max(2, Math.floor(mw / 2)); mh = Math.max(2, Math.floor(mh / 2));
      const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this._mips.push(new THREE.WebGLRenderTarget(mw, mh, o));
      if (i < this.bloomLevels - 1) this._ups.push(new THREE.WebGLRenderTarget(mw, mh, o));
      if (mw <= 2 || mh <= 2) break;
    }
  }

  to(params, seconds = 1, ease = 'smooth') {
    for (const k of Object.keys(params)) {
      this._tweens = this._tweens.filter(t => t.k !== k);
      if (TWEEN_COLORS.includes(k)) {
        const target = params[k].isColor ? params[k] : new THREE.Color(params[k]);
        if (seconds <= 0) { this[k].copy(target); continue; }
        this._tweens.push({ k, color: true, from: this[k].clone(), to: target.clone(), t: 0, d: seconds, ease });
      } else if (TWEENABLE.includes(k)) {
        if (seconds <= 0) { this[k] = params[k]; continue; }
        this._tweens.push({ k, from: this[k], to: params[k], t: 0, d: seconds, ease });
      }
    }
    return new Promise(r => setTimeout(r, Math.max(0, seconds) * 1000));
  }

  look(name, seconds = 0, overrides = {}) {
    const base = LOOKS[name];
    if (!base) return Promise.resolve();
    const p = { ...base, ...overrides };
    for (const k of TWEEN_COLORS) if (Array.isArray(p[k])) p[k] = new THREE.Color().setRGB(p[k][0], p[k][1], p[k][2]);
    return this.to(p, seconds);
  }

  update(dt) {
    this._time += dt;
    for (const tw of this._tweens) {
      tw.t = Math.min(1, tw.t + dt / tw.d);
      const x = tw.ease === 'linear' ? tw.t : tw.t * tw.t * (3 - 2 * tw.t);
      if (tw.color) this[tw.k].lerpColors(tw.from, tw.to, x); else this[tw.k] = tw.from + (tw.to - tw.from) * x;
    }
    this._tweens = this._tweens.filter(tw => tw.t < 1);
    if (this.auto && this.meterReady && !this._tweens.some(tw => tw.k === 'exposure')) {
      const a = this.auto;
      const target = Math.min(a.max, this.autoCap, Math.max(Math.min(a.min, this.autoCap), a.key / Math.max(this.meter, 1e-5)));
      const tau = target > this.exposure ? a.up : a.down;
      this.exposure += (target - this.exposure) * (1 - Math.exp(-dt / Math.max(tau, 0.01)));
    }
  }

  _blit(mat, target) {
    this._tri.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._tri, this._cam);
  }

  render(layers) {
    const r = this.renderer;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    for (const L of layers) {
      if (!L || !L.scene || !L.camera) continue;
      r.render(L.scene, L.camera);
      if (L.clearDepthAfter) r.clearDepth();
    }
    let src = this.sceneRT;
    for (let i = 0; i < this._mips.length; i++) {
      const u = this._down.uniforms;
      u.tSrc.value = src.texture; u.texel.value.set(1 / src.width, 1 / src.height); u.karis.value = i === 0 ? 1 : 0; u.threshold.value = this.bloomThreshold;
      this._blit(this._down, this._mips[i]);
      src = this._mips[i];
    }
    this._meter();
    let prev = this._mips[this._mips.length - 1];
    for (let i = this._ups.length - 1; i >= 0; i--) {
      const u = this._up.uniforms;
      u.tSrc.value = prev.texture; u.tBase.value = this._mips[i].texture; u.texel.value.set(1 / prev.width, 1 / prev.height); u.radius.value = this.bloomRadius;
      this._blit(this._up, this._ups[i]);
      prev = this._ups[i];
    }
    const f = this._final.uniforms;
    f.tScene.value = this.sceneRT.texture; f.tBloom.value = prev.texture; f.res.value.set(this.width, this.height); f.time.value = this._time;
    for (const k of ['exposure', 'bloomStrength', 'halation', 'grain', 'vignette', 'ca', 'letterbox', 'fade', 'saturation', 'contrast', 'streak']) f[k].value = this[k];
    this._blit(this._final, null);
    r.autoClear = prevAuto;
  }
}
