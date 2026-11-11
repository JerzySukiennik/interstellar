// Lookdev astronaut: ref-matched views (front 02, head 03, back 01), all modes animating, solid batch row, ghost time-slice trail.
import { createAstronaut, createAstronautBatch, createAstronautNear, poseFor, lerpPose, MODES, CYCLE } from '../models/astronaut.js';

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition * 0.0); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `
uniform vec3 top, horizon, bottom, sunDir, sunCol; uniform float sunPow;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h * 6.0, 0.0, 1.0), 0.5));
  c += sunCol * pow(max(dot(d, normalize(sunDir)), 0.0), sunPow);
  gl_FragColor = vec4(c, 1.0);
}`;

function sky(THREE, o) {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(...o.top) }, horizon: { value: new THREE.Color(...o.horizon) }, bottom: { value: new THREE.Color(...o.bottom) },
      sunDir: { value: new THREE.Vector3(...(o.sunDir || [0, 1, 0])) }, sunCol: { value: new THREE.Color(...(o.sunCol || [0, 0, 0])) }, sunPow: { value: o.sunPow || 64 },
    },
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), m);
  s.frustumCulled = false;
  return s;
}

const LOOKS = {
  miller: { top: [0.85, 0.8, 0.72], horizon: [1.25, 1.18, 1.08], bottom: [0.05, 0.06, 0.06], sunDir: [0.3, 0.8, 0.5], sunCol: [0.4, 0.35, 0.3], sunPow: 6 },
  sunset: { top: [0.05, 0.06, 0.09], horizon: [2.4, 1.3, 0.65], bottom: [0.04, 0.035, 0.035], sunDir: [-0.9, 0.18, 0.5], sunCol: [30, 16, 7], sunPow: 300 },
};

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const view = params.get('view') || 'front';
  const film = engine.film;
  const fixedPhase = params.has('phase') ? +params.get('phase') : null;
  const modeParam = params.get('mode');
  const amount = params.has('amount') ? +params.get('amount') : 1;
  const setCam = (p, t, fov) => { camera.position.set(...p); controls.target.set(...t); camera.fov = fov; camera.updateProjectionMatrix(); controls.update(); };
  const disposers = [];
  let hero = null, batch = null;

  function environment(look) {
    const envScene = new THREE.Scene();
    envScene.add(sky(THREE, look));
    const pmrem = new THREE.PMREMGenerator(engine.renderer);
    scene.environment = pmrem.fromScene(envScene, 0, 1, 1000).texture;
    pmrem.dispose();
    scene.add(sky(THREE, look));
  }
  function water(y, color = [0.02, 0.026, 0.026]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: new THREE.Color(...color), roughness: 0.55, metalness: 0, envMapIntensity: 0.35 }));
    w.rotation.x = -Math.PI / 2; w.position.y = y; w.receiveShadow = true;
    scene.add(w);
    return w;
  }
  function key(color, intensity, pos, size = 3) {
    const l = new THREE.DirectionalLight(new THREE.Color(...color), intensity);
    l.position.set(...pos);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const c = l.shadow.camera; c.left = c.bottom = -size; c.right = c.top = size; c.near = 0.5; c.far = 40;
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02;
    scene.add(l);
    return l;
  }

  const animated = [];
  function animateHero(mode) {
    animated.push((t) => {
      const m = mode === 'cycle' ? MODES[Math.floor(t / 6) % MODES.length] : mode;
      const ph = fixedPhase ?? (t / CYCLE[m]);
      hero.animate(m, ph, m === 'reach' ? 0.5 + 0.5 * Math.sin(t * 1.5) : amount);
    });
  }

  if (view === 'ghost') {
    scene.background = new THREE.Color(0, 0, 0);
    film.letterbox = 0; film.vignette = 0.35;
    const N = +(params.get('n') || 40), spacing = +(params.get('spacing') || 0.34), pause = +(params.get('pause') || 8), side = params.has('side');
    batch = createAstronautBatch({ engine, max: N + pause });
    if (params.get('tint')) batch.setTint(new THREE.Color('#' + params.get('tint')));
    scene.add(batch.group);
    if (side) setCam([3.0, 1.1, -spacing * N * 0.5], [0, 1.0, -spacing * N * 0.5], 50);
    else if (params.has('far')) setCam([10, 3, 30], [0, 1, -6], 40);
    else setCam([2.4, 1.7, 3.4], [0, 1.0, -3.5], 38);
    const useViewer = params.has('viewer');
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(1, 1, 1);
    const fill = () => {
      if (useViewer) batch.setViewer(camera.position);
      let k = 0;
      const place = (s, ph, op) => {
        const x = side ? 0 : 1.6 * Math.sin(s * 0.22), z = -s, dx = side ? 0 : 1.6 * 0.22 * Math.cos(s * 0.22);
        Q.setFromAxisAngle(Y, Math.atan2(-dx, 1));
        P.set(x, 0, z);
        batch.setInstance(k++, M.compose(P, Q, S), poseFor('wade', s / 1.24, 1), op);
      };
      for (let i = 0; i < N; i++) place(i * spacing, 0, i === 0 ? 2 : Math.pow(1 - i / N, 1.4));
      for (let j = 0; j < pause; j++) place(2 * spacing + j * 0.002, 0, 0.9);
      batch.setCount(N + pause);
    };
    fill();
    if (useViewer) engine.onUpdate(fill);
  } else if (view === 'room') {
    const { memoryMaterial } = await import('../tesseract/materials.js');
    film.letterbox = 0;
    const kind = params.get('light') || 'lab';
    const LIGHT = {
      lab: { sky: [0.06, 0.061, 0.064], ground: [0.014, 0.012, 0.01], key: [0.25, 1, 0.15], keyCol: [0.1, 0.095, 0.088], wrap: 0.5, lamp: [0.85, 0.79, 0.68], lampR: 2.6 },
      aged: { sky: [0.24, 0.25, 0.27], ground: [0.06, 0.05, 0.045], key: [0.2, 1, 0.1], keyCol: [0.28, 0.28, 0.28], wrap: 0.7, lamp: [1.1, 0.95, 0.75], lampR: 2.6 },
      cockpit: { sky: [0.06, 0.065, 0.07], ground: [0.02, 0.02, 0.022], key: [-0.75, 0.6, 0.1], keyCol: [0.5, 0.48, 0.45], wrap: 0.25, lamp: [0.2, 0.42, 0.46], lampR: 1.8 },
      ocean: { sky: [0.95, 0.95, 0.9], ground: [0.34, 0.36, 0.35], key: [0.25, 1, 0.2], keyCol: [0.25, 0.25, 0.24], wrap: 1.0, lamp: [0, 0, 0], lampR: 0 },
    }[kind];
    const mat = memoryMaterial();
    const U = mat.uniforms;
    U.uSky.value.setRGB(...LIGHT.sky); U.uGround.value.setRGB(...LIGHT.ground); U.uKeyCol.value.setRGB(...LIGHT.keyCol); U.uWrap.value = LIGHT.wrap;
    U.uKeyDir.value.set(...LIGHT.key).normalize(); U.uLampCol.value.setRGB(...LIGHT.lamp);
    U.uLamp.value.set(0, 2.7, 0, LIGHT.lampR); U.uClip.value.makeScale(1 / 6, 1 / 6, 1 / 6); U.uEdgeW.value = 0;
    const box = new THREE.BoxGeometry(4.4, 3.0, 6, 22, 15, 30).toNonIndexed();
    box.translate(0, 1.5, 0);
    const pa = box.attributes.position, nrm = box.attributes.normal, cols = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), x = pa.getX(i), z = pa.getZ(i);
      const q = Math.abs(Math.sin(x * 4.2) * Math.sin(y * 4.2 + z * 4.2));
      const c = nrm.getY(i) > 0.5 ? [0.32, 0.31, 0.3] : [0.78 - 0.08 * q, 0.75 - 0.08 * q, 0.68 - 0.08 * q];
      cols.set(c, i * 3);
      nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    }
    const idx = box.attributes.position.array;
    for (let i = 0; i < pa.count; i += 3) for (let k = 0; k < 3; k++) { const t = idx[(i + 1) * 3 + k]; idx[(i + 1) * 3 + k] = idx[(i + 2) * 3 + k]; idx[(i + 2) * 3 + k] = t; }
    box.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    box.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(pa.count * 4), 4));
    scene.add(new THREE.Mesh(box, mat));
    const lampM = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(...LIGHT.lamp).multiplyScalar(6) }));
    lampM.position.set(0, 2.98, 0); scene.add(lampM);
    const pm = new THREE.PMREMGenerator(engine.renderer);
    const envScene = new THREE.Scene();
    const envMat = memoryMaterial(); Object.assign(envMat.uniforms, {}); for (const k of ['uSky', 'uGround', 'uKeyCol', 'uKeyDir', 'uLamp', 'uLampCol', 'uClip']) envMat.uniforms[k].value.copy(U[k].value); envMat.uniforms.uWrap.value = U.uWrap.value; envMat.uniforms.uEdgeW.value = 0;
    envScene.add(new THREE.Mesh(box, envMat), lampM.clone());
    const roomEnv = pm.fromScene(envScene, 0.02, 0.05, 50).texture;
    pm.dispose();
    const N = +(params.get('n') || 1);
    const near = createAstronautNear({ engine, count: N, envMap: roomEnv });
    near.setLightFromRoom(U);
    scene.add(near.group);
    const mode = modeParam || 'stand';
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const yaw = +(params.get('yaw') || 0.5);
    const placeAll = t => {
      for (let i = 0; i < N; i++) {
        const ph = fixedPhase !== null ? fixedPhase + i / N : t / CYCLE[mode];
        Q.setFromAxisAngle(Y, yaw);
        P.set((i - (N - 1) / 2) * 0.9, mode === 'float' || mode === 'swim' ? 0.6 : 0, 0);
        near.setInstance(i, M.compose(P, Q, S), poseFor(mode, ph, mode === 'reach' ? 1 : amount), 1);
      }
      near.setCount(N);
    };
    animated.push(placeAll);
    hero = { dispose: () => near.dispose() };
    const dist = +(params.get('dist') || 2);
    setCam([Math.sin(0.35) * dist, 1.45, Math.cos(0.35) * dist], [0, 1.12, 0], 50);
  } else if (view === 'strip') {
    environment(LOOKS.miller);
    film.letterbox = 0;
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.95, 0.92, 0.86), new THREE.Color(0.12, 0.13, 0.12), 1.4));
    key([1, 0.96, 0.9], 2.2, [4, 7, 3], 8);
    const mode = modeParam || 'walk', N = +(params.get('n') || 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.2, 0.2), roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const lines = [];
    for (let z = -2; z <= 4; z += 0.1) lines.push(-8, 0.002, z, 8, 0.002, z);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x555555 })));
    const near = createAstronautNear({ engine, count: N });
    near.setLight({ off: true });
    scene.add(near.group);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const lift = { float: 0.7, swim: 0.7, tumble: 1.0 }[mode] || 0;
    const turn = params.has('front') ? 0 : -Math.PI / 2;
    for (let i = 0; i < N; i++) {
      Q.setFromAxisAngle(Y, turn);
      P.set((i - (N - 1) / 2) * 1.25, lift, 0);
      near.setInstance(i, M.compose(P, Q, S), poseFor(mode, (fixedPhase ?? 0) + i / N, 1), 1);
    }
    near.setCount(N);
    hero = { dispose: () => near.dispose() };
    setCam([0, 1.3, (N * 1.25) * 0.95 + 1.5], [0, 0.95, 0], 40);
  } else if (view === 'float33') {
    film.letterbox = 0;
    scene.background = new THREE.Color(0.02, 0.015, 0.012);
    const near = createAstronautNear({ engine, count: 1 });
    near.setLight({ sky: [0.12, 0.1, 0.08], ground: [0.05, 0.035, 0.025], keyDir: [-0.4, 0.8, 0.5], keyColor: [1.1, 0.85, 0.6], wrap: 0.35, lamp: { position: [1.5, 2.2, 1.5], radius: 2.5, color: [0.6, 0.45, 0.3] } });
    scene.add(near.group);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -1.25), P = new THREE.Vector3(0, 0.4, 0), S = new THREE.Vector3(1, 1, 1);
    animated.push(t => near.setInstance(0, M.compose(P, Q, S), poseFor('float', fixedPhase ?? t / CYCLE.float, 1), 1));
    hero = { dispose: () => near.dispose() };
    setCam([0.6, 1.6, 2.6], [0, 1.3, 0], 40);
  } else if (view === 'modes') {
    environment(LOOKS.miller);
    film.letterbox = 0;
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.95, 0.92, 0.86), new THREE.Color(0.12, 0.13, 0.12), 1.2));
    key([1, 0.96, 0.9], 2.2, [3, 7, 5], 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.18, 0.18, 0.18), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    hero = createAstronaut({ engine, quality: engine.qualityName });
    scene.add(hero.group);
    animateHero(modeParam || 'cycle');
    batch = createAstronautBatch({ engine, max: MODES.length, look: 'solid' });
    scene.add(batch.group);
    batch.setCount(MODES.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    const lift = { float: 0.9, swim: 0.9, tumble: 1.1, climb: 0.05 };
    animated.push((t) => {
      MODES.forEach((m, i) => {
        const ph = fixedPhase ?? t / CYCLE[m];
        const pose = poseFor(m, ph, m === 'reach' ? 0.5 + 0.5 * Math.sin(t * 1.5) : 1);
        P.set(-6.75 + i * 1.5, lift[m] || 0, -2.5);
        batch.setInstance(i, M.compose(P, Q, S), pose, 1);
      });
    });
    setCam([0, 2.2, 7.5], [0, 0.9, -1], 45);
  } else {
    const back = view === 'back';
    environment(back ? LOOKS.sunset : LOOKS.miller);
    film.letterbox = 0;
    if (back) {
      scene.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.42, 0.42), new THREE.Color(0.08, 0.06, 0.05), 0.9));
      key([1.0, 0.6, 0.34], 9, [-5, 1.4, -1.2], 3);
      scene.environmentIntensity = 0.45;
      water(0.36, [0.02, 0.022, 0.025]);
    } else {
      scene.add(new THREE.HemisphereLight(new THREE.Color(0.95, 0.92, 0.86), new THREE.Color(0.1, 0.11, 0.1), 1.5));
      key([1, 0.96, 0.9], 1.8, [-2.5, 6, 5]);
      scene.environmentIntensity = 0.8;
      water(view === 'front' ? 0.42 : 0.0);
    }
    hero = createAstronaut({ engine, quality: engine.qualityName });
    scene.add(hero.group);
    const mode = modeParam || (back ? 'wade' : 'stand');
    if (fixedPhase !== null || params.has('still')) hero.animate(mode, fixedPhase ?? 0.15, amount);
    else animateHero(mode);
    if (view === 'head') { hero.group.rotation.y = -0.35; setCam([0.55, 1.68, 1.55], [0, 1.6, 0], 30); }
    else if (back) { hero.group.rotation.y = -0.2; setCam([0.55, 1.15, -3.2], [0.05, 1.1, 0], 35); }
    else { hero.group.rotation.y = 0.12; setCam([0.0, 1.32, 2.75], [0, 1.33, 0], 30); }
  }

  if (hero) disposers.push(() => hero.dispose());
  if (batch) disposers.push(() => batch.dispose());
  if (animated.length) engine.onUpdate((dt, t) => animated.forEach(f => f(t)));
  animated.forEach(f => f(0));
  await engine.renderer.compileAsync(scene, camera);
  return { hero, batch, poseFor, lerpPose, dispose: () => disposers.forEach(d => d()) };
}
