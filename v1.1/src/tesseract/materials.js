// Tesseract shaders: memory rooms (captured daylight, cutaway clip, amber edges, fog to black), fine world-lines, glow points (beads, dust), snapshot panes and ghost craft.
import * as THREE from 'three';

const FOG = `
uniform vec2 uFog;
float fogK(vec3 w){ float d = distance(w, cameraPosition); return exp(-pow(max(d - uFog.x, 0.0) / uFog.y, 1.35)); }`;

const MEM_VERT = `
attribute vec4 aEmit;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vE;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  #ifdef USE_INSTANCING
  w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
  vN = normalize(mat3(modelMatrix) * normal);
  #endif
  vW = w.xyz; vC = color; vE = aEmit;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const MEM_FRAG = `
uniform mat4 uClip; uniform float uFade, uLevel, uWrap, uSweep, uPower, uAge, uTime, uFlicker, uEdgeW;
uniform vec3 uKeyDir, uKeyCol, uSky, uGround, uSweepCol, uEdge, uTint;
uniform vec4 uLamp; uniform vec3 uLampCol; uniform vec4 uCut; uniform vec3 uCutC;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vE;
${FOG}
void main(){
  vec3 q = (uClip * vec4(vW, 1.0)).xyz;
  vec3 aq = abs(q);
  float m = max(aq.x, max(aq.y, aq.z));
  if (m > 1.0) discard;
  float cutE = 0.0;
  if (uCut.w > -900.0) { float dc = dot(vW - uCutC, uCut.xyz) - uCut.w; if (dc > 0.0) discard; cutE = smoothstep(-0.14, 0.0, dc); }
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = dot(n, uKeyDir);
  float key = max(0.0, (ndl + uWrap) / (1.0 + uWrap));
  vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 d = uLamp.xyz - vW;
  float r2 = dot(d, d);
  float lamp = uLamp.w > 0.0 ? (max(0.0, dot(n, d * inversesqrt(r2 + 1e-4))) * 0.75 + 0.25) / (1.0 + r2 / (uLamp.w * uLamp.w)) : 0.0;
  vec3 albedo = vC * uTint;
  float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 37.0 + sin(uTime * 13.0) * 3.0)) * step(0.6, fract(sin(floor(uTime * 9.0)) * 43758.5));
  vec3 col = albedo * (hemi + uKeyCol * key + uLampCol * lamp) * flick * (1.0 - 0.4 * m * m);
  float em = vE.a < 0.5 ? 1.0 : vE.a < 1.5 ? uSweep : uPower;
  col += vE.rgb * em * (vE.a < 0.5 ? flick : 1.0);
  col += uSweepCol * uSweep * (vE.a > 0.5 && vE.a < 1.5 ? 6.0 : 0.0);
  float lu = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lu) * vec3(0.86, 0.95, 1.08), uAge * 0.45) * (1.0 - 0.42 * uAge);
  float edge = smoothstep(1.0 - uEdgeW, 1.0, m);
  float rim = smoothstep(1.0 - uEdgeW * 0.18, 1.0, m);
  col = mix(col, uEdge * (0.35 + 0.65 * edge), edge * 0.9) + uEdge * (rim * 1.6 + cutE * 1.1);
  col *= fogK(vW) * uFade * uLevel;
  gl_FragColor = vec4(col, 1.0);
}`;

export function memoryMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    name: 'tess_memory',
    vertexShader: MEM_VERT, fragmentShader: MEM_FRAG, vertexColors: true, side: THREE.FrontSide,
    uniforms: {
      uClip: { value: new THREE.Matrix4() }, uFade: { value: 1 }, uLevel: { value: 1 }, uWrap: { value: 0.6 }, uSweep: { value: 0 }, uPower: { value: 1 }, uAge: { value: 0 }, uTime: { value: 0 }, uFlicker: { value: 0 }, uEdgeW: { value: 0.12 },
      uKeyDir: { value: new THREE.Vector3(0.3, 0.9, 0.3).normalize() }, uKeyCol: { value: new THREE.Color(0.6, 0.6, 0.6) }, uSky: { value: new THREE.Color(0.5, 0.5, 0.5) }, uGround: { value: new THREE.Color(0.1, 0.1, 0.1) },
      uSweepCol: { value: new THREE.Color(1.0, 0.7, 0.4) }, uEdge: { value: new THREE.Color(1.6, 0.85, 0.36) }, uTint: { value: new THREE.Color(1, 1, 1) },
      uLamp: { value: new THREE.Vector4(0, 0, 0, 0) }, uCut: { value: new THREE.Vector4(0, 0, 0, -999) }, uCutC: { value: new THREE.Vector3() }, uLampCol: { value: new THREE.Color(0, 0, 0) }, uFog: { value: new THREE.Vector2(18, 70) },
      ...o.uniforms,
    },
  });
}

const LINE_VERT = `
uniform float uPixel, uTime, uFold, uArrive; uniform vec4 uRipple;
attribute vec3 aTan; attribute float aSide; attribute vec4 aInfo;
varying float vS; varying vec3 vW; varying vec4 vInfo;
void main(){
  vec3 w = position;
  if (uFold > 0.0) { vec3 rel = w - cameraPosition; w = cameraPosition + rel * (1.0 - uFold * 0.92) / (1.0 + uFold * length(rel) * 0.04); }
  if (uRipple.w > 0.0) { float r = length(w - uRipple.xyz); float k = r - uRipple.w * 34.0; w.y += exp(-k * k / 60.0) * 0.6 * sin(r * 0.6) * exp(-uRipple.w * 0.35); }
  vec3 toCam = w - cameraPosition;
  float dist = length(toCam);
  vec3 side = cross(aTan, toCam / max(dist, 1e-3));
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  float width = max(aInfo.w, uPixel * dist * 1.3);
  vInfo = vec4(aInfo.x * (aInfo.w / width), aInfo.yz, uArrive);
  vS = aSide;
  w += side * aSide * width * 1.6;
  vW = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const LINE_FRAG = `
uniform float uTime, uRange, uFold, uReveal; uniform vec3 uCol; uniform vec4 uFocus;
varying float vS; varying vec3 vW; varying vec4 vInfo;
void main(){
  float prof = exp(-vS * vS * 2.4);
  float d = distance(vW, cameraPosition);
  float fade = exp(-pow(d / uRange, 1.5));
  float u = vInfo.y;
  float pulse = exp(-pow((fract(u * 3.0 - uTime * 0.05 + vInfo.z * 0.37) - 0.5) * 9.0, 2.0));
  float near = 0.2 + 1.25 * exp(-pow((vW.x - cameraPosition.x) / 6.0, 2.0));
  float I = vInfo.x * prof * fade * (0.75 + 0.9 * pulse) * near * uReveal * (1.0 + uFold * 10.0);
  gl_FragColor = vec4(uCol * I, 1.0);
}`;

export function worldlineMaterial() {
  return new THREE.ShaderMaterial({
    name: 'tess_worldline', vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    uniforms: {
      uPixel: { value: 0.001 }, uTime: { value: 0 }, uFold: { value: 0 }, uArrive: { value: 0 }, uRange: { value: 80 }, uReveal: { value: 1 },
      uCol: { value: new THREE.Color(2.1, 1.62, 1.12) }, uRipple: { value: new THREE.Vector4() }, uFocus: { value: new THREE.Vector4() },
    },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

const PT_VERT = `
uniform float uPx, uTime, uBox, uFold, uAlignR; uniform vec4 uAlign; uniform vec3 uCell; uniform float uMode, uArrive;
attribute vec4 aP; attribute vec4 aQ;
varying float vI; varying vec3 vCol;
void main(){
  vec3 w = aP.xyz;
  float I = aQ.y;
  if (uMode > 0.5) {
    vec3 drift = vec3(sin(uTime * 0.05 + aQ.z * 6.0), sin(uTime * 0.043 + aQ.z * 9.0), cos(uTime * 0.037 + aQ.z * 4.0)) * 0.6;
    w = cameraPosition + (fract((aP.xyz + drift - cameraPosition) / uBox + 0.5) - 0.5) * uBox;
    vec3 c = mod(w + uCell * 0.5, uCell) - uCell * 0.5;
    vec3 e = abs(abs(c) - uCell * 0.5);
    float beam = exp(-min(min(length(e.yz), length(e.xz)), length(e.xy)) / 1.4);
    if (uAlign.w > 0.0) {
      float k = uAlign.w * exp(-pow(distance(w, uAlign.xyz) / uAlignR, 2.0));
      vec3 snapped = vec3(w.x, floor(w.y / 0.22 + 0.5) * 0.22, floor(w.z / 0.36 + 0.5) * 0.36);
      w = mix(w, snapped, k);
      I *= 1.0 + 5.0 * k;
    }
    float dc = distance(w, cameraPosition);
    I *= (0.18 + beam * 1.6) * smoothstep(uBox * 0.5, uBox * 0.3, dc) * smoothstep(0.4, 1.4, dc);
    vCol = vec3(1.0, 0.7, 0.42);
  } else {
    float s = 0.5 + 0.5 * sin(uTime * (0.8 + aQ.z) + aQ.z * 31.0);
    I *= 0.75 + 0.25 * s;
    vCol = aQ.w > 0.5 ? vec3(1.0, 0.92, 0.8) : vec3(1.0, 0.7, 0.38);
  }
  if (uFold > 0.0) { vec3 rel = w - cameraPosition; w = cameraPosition + rel * (1.0 - uFold * 0.92) / (1.0 + uFold * length(rel) * 0.04); }
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float dist = -mv.z;
  float size = aQ.x / max(dist, 0.1) * uPx;
  float s2 = max(size, 2.2);
  vI = I * (size * size) / (s2 * s2) * exp(-pow(dist / 120.0, 1.5)) * (1.0 + uFold * 8.0) * (1.0 - uArrive);
  gl_PointSize = s2;
  gl_Position = projectionMatrix * mv;
}`;

const PT_FRAG = `
varying float vI; varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.2) - exp(-3.2);
  gl_FragColor = vec4(vCol * vI * a, 1.0);
}`;

export function pointsMaterial(mode = 0) {
  return new THREE.ShaderMaterial({
    name: mode ? 'tess_dust' : 'tess_beads', vertexShader: PT_VERT, fragmentShader: PT_FRAG,
    uniforms: { uPx: { value: 500 }, uTime: { value: 0 }, uBox: { value: 26 }, uFold: { value: 0 }, uArrive: { value: 0 }, uMode: { value: mode }, uCell: { value: new THREE.Vector3(20, 16, 24) }, uAlign: { value: new THREE.Vector4() }, uAlignR: { value: 10 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
}

const PANE_VERT = `
varying vec2 vUv; varying vec3 vW; varying float vFace;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec3 n = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0)); vFace = dot(n, cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const PANE_FRAG = `
uniform sampler2D map; uniform float uGain, uFade, uFold, uHas; uniform vec3 uEdge; uniform vec2 uCrop;
varying vec2 vUv; varying vec3 vW; varying float vFace;
${FOG}
void main(){
  vec2 e = min(vUv, 1.0 - vUv);
  float border = min(e.x * 16.0 / 9.0, e.y);
  float inner = smoothstep(0.012, 0.03, border);
  vec2 uv = vec2(vUv.x, mix(1.0 - uCrop.y, 1.0 - uCrop.x, vUv.y));
  vec3 img = uHas > 0.5 ? texture2D(map, uv).rgb : vec3(0.4, 0.32, 0.24);
  img = pow(img, vec3(1.5)) * uGain * 0.45;
  vec3 col = vFace > 0.0 ? img * uGain * inner : vec3(dot(img, vec3(0.3))) * uEdge * 0.25 * inner;
  col += uEdge * (1.0 - inner) * 2.2;
  col *= fogK(vW) * uFade * (1.0 + uFold * 6.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export function paneMaterial(tex) {
  return new THREE.ShaderMaterial({
    name: 'tess_pane', vertexShader: PANE_VERT, fragmentShader: PANE_FRAG, side: THREE.DoubleSide,
    uniforms: { map: { value: tex }, uHas: { value: tex ? 1 : 0 }, uGain: { value: 2.4 }, uCrop: { value: new THREE.Vector2(0, 1) }, uFade: { value: 1 }, uFold: { value: 0 }, uEdge: { value: new THREE.Color(1.5, 0.8, 0.34) }, uFog: { value: new THREE.Vector2(26, 80) } },
  });
}

const GC_VERT = `
attribute float aOpacity;
varying vec3 vN; varying vec3 vV; varying float vA;
void main(){
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = cameraPosition - w.xyz; vA = aOpacity;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GC_FRAG = `
uniform vec3 uTint; uniform float uGain;
varying vec3 vN; varying vec3 vV; varying float vA;
void main(){
  if (vA <= 0.002) discard;
  float ndv = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.2);
  float cover = clamp((0.06 + 0.7 * rim) * vA, 0.0, 0.95);
  gl_FragColor = vec4(uTint * uGain * (0.15 + rim) * cover, cover);
}`;

export function ghostCraftMaterial() {
  return new THREE.ShaderMaterial({
    name: 'tess_ghost_craft', vertexShader: GC_VERT, fragmentShader: GC_FRAG,
    uniforms: { uTint: { value: new THREE.Color(1.0, 0.72, 0.42) }, uGain: { value: 1.8 } },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

