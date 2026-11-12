// Miller chapter effects: graded looks per beat, helmet visor rim, water on the windows, buffet, the raised forearm with wrist displays, the recorder held up to read.
import * as THREE from 'three';
import { LOOKS } from '../../core/post.js';

const KEYS = ['exposure', 'bloomStrength', 'bloomRadius', 'halation', 'vignette', 'ca', 'saturation', 'contrast', 'letterbox'];
const COLS = ['tintShadow', 'tintHigh'];
const SURFACE = { exposure: 1.05, bloomStrength: 0.06, bloomRadius: 0.7, halation: 0.22, vignette: 0.42, ca: 0.0012, saturation: 0.82, contrast: 0.2, letterbox: 0, tintShadow: [0.0, 0.006, 0.012], tintHigh: [0.012, 0.004, -0.008] };
const CK = LOOKS.cockpit;
export const LOOK = {
  cloud: { ...CK, exposure: 1.12, saturation: 0.62, contrast: 0.16, bloomStrength: 0.12, letterbox: 1, tintShadow: [0.0, 0.004, 0.006], tintHigh: [0.0, 0.002, 0.002] },
  descent: { ...CK, exposure: 1.18, saturation: 0.72, contrast: 0.22, letterbox: 1, tintShadow: [0.0, 0.008, 0.006], tintHigh: [0.002, 0.002, -0.002] },
  seat: { ...CK, exposure: 1.25, saturation: 0.78, contrast: 0.24, letterbox: 1, tintShadow: [0.0, 0.006, 0.006], tintHigh: [0.002, 0.002, -0.002] },
  cabin: { ...CK, exposure: 1.32, saturation: 0.8, contrast: 0.24, letterbox: 1, tintShadow: [0.0, 0.006, 0.006], tintHigh: [0.002, 0.002, -0.002] },
  hatch: { ...CK, exposure: 1.05, saturation: 0.8, contrast: 0.22, letterbox: 0.6, bloomStrength: 0.09, halation: 0.35, tintShadow: [0.0, 0.01, 0.006], tintHigh: [-0.004, 0.002, -0.004] },
  surface: SURFACE,
  rear: { ...SURFACE, exposure: 1.02, saturation: 0.9, contrast: 0.26 },
  mountains: { ...SURFACE },
  wave: { ...SURFACE, exposure: 1.05, saturation: 0.78, contrast: 0.24, vignette: 0.48, tintShadow: [0.0, 0.004, 0.018], tintHigh: [-0.006, -0.001, 0.004] },
  escape: { ...CK, exposure: 1.15, saturation: 0.72, contrast: 0.26, letterbox: 1, tintShadow: [0.0, 0.006, 0.01], tintHigh: [0.008, 0.004, -0.006] },
  climb: { ...CK, exposure: 1.08, saturation: 0.78, contrast: 0.24, letterbox: 0, bloomStrength: 0.09, tintShadow: [0.0, 0.004, 0.018], tintHigh: [-0.006, -0.001, 0.004] },
  carried: { ...CK, exposure: 1.4, saturation: 0.62, contrast: 0.2, letterbox: 1, vignette: 0.7, tintShadow: [0.0, 0.012, 0.01], tintHigh: [0.0, 0.004, 0.0] },
  drift: { ...CK, exposure: 1.22, saturation: 0.7, contrast: 0.24, letterbox: 1, tintShadow: [0.0, 0.01, 0.008], tintHigh: [0.004, 0.003, -0.004] },
};

export class Looks {
  constructor(film) { this.film = film; this.cur = null; this.tw = null; this.exposureMul = 1; this.viewMul = 1; this._mul = 1; }

  snapshot() {
    const f = this.film, o = {};
    for (const k of KEYS) o[k] = f[k];
    for (const k of COLS) o[k] = f[k].toArray();
    return o;
  }

  set(name, seconds = 2, over = {}) {
    const to = { ...(typeof name === 'string' ? LOOK[name] : name), ...over };
    this.name = typeof name === 'string' ? name : 'custom';
    const from = this.cur || this.snapshot();
    if (seconds <= 0) { this.cur = to; this.tw = null; this.apply(to); return; }
    this.tw = { from, to, t: 0, d: seconds };
  }

  apply(p) {
    const f = this.film;
    for (const k of KEYS) if (p[k] !== undefined) f[k] = p[k];
    f.exposure = (p.exposure ?? f.exposure) * this._mul;
    for (const k of COLS) if (p[k]) f[k].setRGB(p[k][0], p[k][1], p[k][2]);
  }

  update(dt) {
    this._mul += (this.exposureMul * this.viewMul - this._mul) * Math.min(1, dt * 1.6);
    if (this.tw) {
      const T = this.tw;
      T.t = Math.min(T.d, T.t + dt);
      const u = T.t / T.d, e = u * u * (3 - 2 * u), o = {};
      for (const k of KEYS) o[k] = (T.from[k] ?? T.to[k]) + ((T.to[k] ?? T.from[k]) - (T.from[k] ?? T.to[k])) * e;
      for (const k of COLS) { const a = T.from[k] || T.to[k], b = T.to[k] || a; o[k] = [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * e); }
      this.cur = o;
      if (T.t >= T.d) this.tw = null;
    }
    if (this.cur) this.apply(this.cur);
  }
}

const HELMET_FRAG = `
uniform float uOn;
uniform float uAspect;
uniform vec3 uSky;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uAspect;
  float ax = uAspect * 1.1, ay = 1.06;
  float top = p.y > 0.0 ? 0.9 : 1.1;
  vec2 q = vec2(abs(p.x) / ax, abs(p.y) / (ay * top));
  float d = pow(pow(q.x, 3.4) + pow(q.y, 3.4), 1.0 / 3.4);
  float a = smoothstep(0.96, 1.16, d);
  float rim = smoothstep(1.0, 1.08, d) * (1.0 - smoothstep(1.12, 1.3, d));
  vec3 lining = vec3(0.006, 0.007, 0.008);
  vec3 shell = uSky * (0.05 + 0.1 * smoothstep(0.0, 1.0, p.y));
  vec3 col = mix(lining, shell, rim * 0.6);
  float glint = exp(-pow((p.x - 0.55 * uAspect) * 1.4, 2.0) - pow((p.y - 0.62) * 5.0, 2.0)) * 0.035;
  gl_FragColor = vec4(col + uSky * glint, clamp(a * 0.9 + glint, 0.0, 1.0) * uOn);
}`;

export function createHelmet(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uAspect: { value: 16 / 9 }, uSky: { value: new THREE.Color(0.55, 0.52, 0.47) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: HELMET_FRAG, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.name = 'helmetRim';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e7;
  mesh.visible = false;
  scene.add(mesh);
  let on = 0, target = 0;
  return {
    mesh,
    set(v) { target = v ? 1 : 0; },
    get on() { return target > 0; },
    update(dt, cam) {
      on += (target - on) * Math.min(1, dt * 2.5);
      mesh.visible = on > 0.01;
      if (!mesh.visible) return;
      const z = 0.06, h = 2 * z * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      mesh.position.set(0, 0, -z).applyQuaternion(cam.quaternion).add(cam.position);
      mesh.quaternion.copy(cam.quaternion);
      mesh.scale.set(h * cam.aspect, h, 1);
      mat.uniforms.uAspect.value = cam.aspect;
      mat.uniforms.uOn.value = on;
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); mesh.removeFromParent(); },
  };
}

const WET_VERT = `
varying vec3 vL;
void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WET_FRAG = `
uniform sampler2D uNoise;
uniform float uTime, uWet, uSheet, uFlow;
uniform vec3 uSky, uMurk;
varying vec3 vL;
void main(){
  vec2 p = vL.xz;
  float run = uTime * uFlow;
  float s1 = texture2D(uNoise, vec2(p.x * 0.9, p.y * 0.16 - run * 0.11)).r;
  float s2 = texture2D(uNoise, vec2(p.x * 2.1 + 0.37, p.y * 0.34 - run * 0.23)).r;
  float streak = smoothstep(0.32, 0.8, s1) * 0.65 + smoothstep(0.4, 0.85, s2) * 0.45;
  float beads = smoothstep(0.62, 0.9, texture2D(uNoise, p * 1.7 + vec2(0.0, -run * 0.02)).g);
  float w = clamp(streak * uWet + beads * uWet * 0.35, 0.0, 1.0);
  vec3 col = uSky * (1.05 + 0.5 * streak);
  float a = w * 0.11;
  float bub = smoothstep(0.7, 0.95, texture2D(uNoise, p * 2.6 + vec2(run * 0.05, run * 0.09)).r);
  col = mix(col, uMurk + uSky * 0.05 * bub, uSheet);
  a = mix(a, 0.82 + 0.1 * bub, uSheet);
  gl_FragColor = vec4(col, a);
}`;

export function createWindowWater(W) {
  const list = (W.ranger.windows || []);
  if (!W.real || !list.length) return { update() {}, set() {}, dispose() {} };
  const pos = [];
  for (const w of list) {
    const n = w.normal, gp = w.glass.map(q => [q[0] - n[0] * 0.014, w.yPlane(q[0], q[1]) - n[1] * 0.014, q[1] - n[2] * 0.014]);
    for (let k = 1; k < gp.length - 1; k++) pos.push(...gp[0], ...gp[k], ...gp[k + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const U = { uNoise: { value: W.ocean.sky?.uniforms?.mNoise?.value || null }, uTime: { value: 0 }, uWet: { value: 0 }, uSheet: { value: 0 }, uFlow: { value: 1 }, uSky: { value: new THREE.Color(0.62, 0.6, 0.55) }, uMurk: { value: new THREE.Color(0.012, 0.03, 0.027) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: WET_VERT, fragmentShader: WET_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'windowWater';
  mesh.renderOrder = 20;
  W.ranger.group.add(mesh);
  const target = { wet: 0, sheet: 0, flow: 1 };
  return {
    mesh,
    set(o) { Object.assign(target, o); },
    update(dt) {
      U.uTime.value += dt;
      const k = Math.min(1, dt * 1.5);
      U.uWet.value += (target.wet - U.uWet.value) * k;
      U.uSheet.value += (target.sheet - U.uSheet.value) * Math.min(1, dt * (target.sheet > U.uSheet.value ? 6 : 0.8));
      U.uFlow.value += (target.flow - U.uFlow.value) * k;
      mesh.visible = U.uWet.value > 0.005 || U.uSheet.value > 0.005;
    },
    dispose() { g.dispose(); mat.dispose(); mesh.removeFromParent(); },
  };
}

export function createShake() {
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  let t = 0, amp = 0, target = 0, kick = 0;
  return {
    set(a) { target = a; },
    kick(a) { kick = Math.max(kick, a); },
    get amount() { return amp + kick; },
    apply(cam, dt) {
      t += dt;
      amp += (target - amp) * Math.min(1, dt * 2);
      kick *= Math.exp(-dt * 3);
      const a = amp + kick;
      if (a < 1e-4) return;
      const n = (f, p) => Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.31 + p * 1.7) * 0.3 + Math.sin(t * f * 5.7 + p * 0.3) * 0.1;
      e.set(n(7.1, 0.3) * 0.006 * a, n(5.3, 1.9) * 0.005 * a, n(6.2, 4.1) * 0.008 * a, 'YXZ');
      cam.quaternion.multiply(q.setFromEuler(e));
      cam.position.y += n(9.7, 2.2) * 0.012 * a;
      cam.updateMatrixWorld();
    },
  };
}

export async function createWrist(ctx, W) {
  const rig = new THREE.Group();
  rig.name = 'forearm';
  rig.visible = false;
  W.scene.add(rig);
  const st = { raised: 0, target: 0, held: 0, bearing: 0, dist: 0, label: 'BCN' };
  let time = null, strip = null;
  const info = { device: new THREE.Vector3(0, -0.165, 0.08), normal: new THREE.Vector3(0, 0, 1) };
  if (W.real) {
    const { createAstronaut } = await import('../../models/astronaut.js');
    const a = createAstronaut({ engine: ctx.engine, quality: ctx.engine.qualityName });
    const fore = a.joints.elbowL;
    fore.removeFromParent();
    fore.position.set(0, 0, 0);
    rig.add(fore);
    W.astronaut = a;
    const dev = fore.children.find(o => o.isMesh && /device/.test(o.name));
    if (dev) {
      dev.geometry.computeBoundingBox();
      dev.geometry.boundingBox.getCenter(info.device);
      info.normal.set(info.device.x, 0, info.device.z).normalize();
    }
    fore.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    const n = info.normal, X = new THREE.Vector3(0, -1, 0), Y = new THREE.Vector3().crossVectors(n, X);
    const basis = new THREE.Matrix4().makeBasis(X, Y, n);
    const mount = (kind, w, h, offAxis, push) => {
      const d = W.createDisplay(kind, { width: w, height: h, resolution: kind === 'wrist' ? [384, 276] : [384, 128] });
      d.mesh.quaternion.setFromRotationMatrix(basis);
      d.mesh.position.copy(info.device).addScaledVector(n, push).add(new THREE.Vector3(0, offAxis, 0));
      d.mesh.renderOrder = 2;
      fore.add(d.mesh);
      d.setReflection(0.25, undefined, undefined, 0.5);
      d.setPower(1);
      return d;
    };
    time = mount('wrist', 0.052, 0.0374, 0, 0.0045);
    time.setState({ source: ctx.clock });
    strip = mount('text', 0.05, 0.0167, 0.048, -0.004);
    strip.setState({ size: 30, lines: [] });
  }
  const camM = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const D = new THREE.Vector3(-0.025, -0.045, -0.3), F = new THREE.Vector3(0.55, 0.62, -0.56).normalize();
  const localA = new THREE.Matrix4(), tgt = new THREE.Matrix4();
  const nc = new THREE.Vector3(), cross = new THREE.Vector3();
  const pose = (raise, out, q) => {
    const d = D.clone().add(new THREE.Vector3(-0.05, -0.32, 0.06).multiplyScalar(1 - raise));
    const f = F.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.6 * (1 - raise)).normalize();
    nc.copy(d).negate().addScaledVector(f, d.dot(f)).normalize();
    cross.crossVectors(f, nc);
    tgt.makeBasis(f, nc, cross);
    const ln = info.normal, la = new THREE.Vector3(0, -1, 0);
    localA.makeBasis(la, ln, new THREE.Vector3().crossVectors(la, ln));
    const R = tgt.clone().multiply(localA.clone().transpose());
    q.setFromRotationMatrix(R);
    out.copy(d).sub(info.device.clone().applyQuaternion(q));
    return out;
  };
  let acc = 0;
  return {
    rig, info,
    get raised() { return st.raised; },
    get reading() { return st.raised > 0.9 && st.held > 0.6; },
    set target(v) { st.target = v; },
    setBearing(b, dist, label = 'BCN') { st.bearing = b; st.dist = dist; st.label = label; },
    update(dt, cam, pitch) {
      const want = st.target > 0 && pitch < (st.raised > 0.5 ? -0.42 : -0.6);
      st.raised += ((want ? 1 : 0) - st.raised) * Math.min(1, dt * (want ? 4.5 : 6));
      st.held = want && st.raised > 0.9 ? st.held + dt : 0;
      rig.visible = st.raised > 0.02;
      if (!rig.visible) return;
      const r = st.raised * st.raised * (3 - 2 * st.raised);
      pose(r, pa, qa);
      camM.compose(cam.position, cam.quaternion, new THREE.Vector3(1, 1, 1));
      pb.copy(pa).applyMatrix4(camM);
      qb.copy(cam.quaternion).multiply(qa);
      rig.position.copy(pb); rig.quaternion.copy(qb);
      rig.updateMatrixWorld(true);
      if ((acc += dt) > 0.25 && strip) {
        acc = 0;
        const b = Math.round(st.bearing);
        strip.setState({ lines: [{ text: `${st.label} ${b >= 0 ? '+' : '-'}${String(Math.abs(b)).padStart(3, '0')}°`, color: 'hi', size: 30 }, { text: `${String(Math.round(st.dist)).padStart(4, ' ')} M`, size: 26 }] });
      }
      time?.update(dt); strip?.update(dt);
    },
    dispose() { time?.dispose(); strip?.dispose(); rig.removeFromParent(); W.astronaut?.dispose(); },
  };
}

export function createRecorderDisplay(W, ctx) {
  if (!W.real) return { setState() {}, update() {}, dispose() {}, setPower() {} };
  const d = W.createDisplay('recorder', { width: 0.17, height: 0.115, resolution: [512, 346] });
  if (W.wreck.display) d.mount(W.wreck.display); else d.mount({ mesh: W.wreck.face, width: 0.17, height: 0.115, kind: 'recorder' });
  d.setReflection(0.3, undefined, undefined, 0.5);
  d.setPower(1);
  return d;
}

export async function createBody(ctx, W) {
  const rig = new THREE.Group();
  rig.name = 'body';
  rig.visible = false;
  W.scene.add(rig);
  if (!W.real) return { rig, update() {}, setThird() {}, dispose() {}, ankles: [] };
  const { createAstronaut } = await import('../../models/astronaut.js');
  const a = createAstronaut({ engine: ctx.engine, quality: ctx.engine.qualityName });
  rig.add(a.group);
  const hidden = [];
  a.joints.head.traverse(o => { if (o.isMesh) { o.visible = false; hidden.push(o); } });
  for (const o of a.joints.spine.children) if (o.isMesh && /_(metal|dark)$/.test(o.name)) { o.visible = false; hidden.push(o); }
  let third = false;
  a.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  a.group.updateMatrixWorld(true);
  const eye = a.anchors.eye.getWorldPosition(new THREE.Vector3());
  const leftArm = a.joints.shoulderL;
  const e = new THREE.Euler(), off = new THREE.Vector3(), fwd = new THREE.Vector3();
  let phase = 0;
  return {
    rig, astronaut: a, ankles: [a.joints.ankleL, a.joints.ankleR],
    setThird(on) { if (on === third) return; third = on; for (const o of hidden) o.visible = on; },
    update(dt, cam, ctl, mode, armUp) {
      rig.visible = mode !== 'none';
      if (!rig.visible) return;
      e.setFromQuaternion(cam.quaternion, 'YXZ');
      rig.rotation.set(0, e.y + Math.PI, 0);
      fwd.set(-Math.sin(e.y), 0, -Math.cos(e.y));
      off.set(eye.x, eye.y + 0.02, eye.z + 0.11).applyEuler(rig.rotation);
      rig.position.copy(cam.position).sub(off).addScaledVector(fwd, -0.04 * Math.max(0, -e.x));
      const sp = ctl ? Math.hypot(ctl.velocity.x, ctl.velocity.z) : 0;
      phase = ctl ? (ctl._phase / (Math.PI * 2)) % 1 : phase;
      a.animate(mode, (phase + 1) % 1, Math.min(1, sp / 0.9));
      leftArm.visible = third || !armUp;
      rig.updateMatrixWorld(true);
    },
    dispose() { rig.removeFromParent(); a.dispose(); },
  };
}
