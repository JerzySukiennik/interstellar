// Space sky rig: Gargantua, lensed stars and Miller's Planet in the background layer, key light toward the hole, PMREM environment.
import * as THREE from 'three';
import { createGargantua } from './gargantua.js';
import { createPlanet } from './planet.js';

export function createSpaceSky({ engine, quality = engine.qualityName || 'high', envSize = 256 } = {}) {
  const renderer = engine.renderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, engine.aspect, 0.05, 2000);
  const gargantua = createGargantua({ renderer, quality });
  const planet = createPlanet({ distance: 100 });
  scene.add(gargantua.compositeMesh, planet.mesh, gargantua.haloMesh);

  const observer = new THREE.Vector3(0, 2, 60);
  const skyRotation = new THREE.Quaternion();
  const lightDirection = new THREE.Vector3();
  const lightColor = new THREE.Color(0xfff8ee);
  const planetLight = new THREE.Color(1.0, 0.95, 0.88);
  const _q = new THREE.Quaternion();
  let lightIntensity = 13;
  let lightAngularRadius = 0.3;
  let plunge = 0;
  let time = 0;
  let mainCamera = null;
  let dtPending = 0;
  let starLevel = 1;

  const envScene = new THREE.Scene();
  envScene.add(gargantua.createEnvMesh(), planet.createMirror());
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  function derive() {
    gargantua.setObserver(observer);
    gargantua.setSkyRotation(skyRotation);
    gargantua.setPlunge(plunge);
    gargantua.uniforms.uStars.value = starLevel * Math.pow(THREE.MathUtils.clamp(1 / Math.max(engine.film.exposure, 1e-3), 1, 40), 0.75);
    const r = Math.max(observer.length(), 1.001);
    lightDirection.copy(observer).multiplyScalar(-1 / r).applyQuaternion(skyRotation);
    const fall = 1 - THREE.MathUtils.smoothstep(plunge, 0.8, 1.0);
    lightIntensity = 13 * fall;
    lightAngularRadius = THREE.MathUtils.clamp(Math.atan(gargantua.uniforms.uRout.value * 0.6 / r), 0.02, 1.4);
  }

  function syncCamera(main) {
    if (!main) return;
    main.getWorldQuaternion(camera.quaternion);
    if (camera.fov !== main.fov || camera.aspect !== main.aspect || camera.zoom !== main.zoom) {
      camera.fov = main.fov; camera.aspect = main.aspect; camera.zoom = main.zoom ?? 1;
      camera.updateProjectionMatrix();
    }
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld();
  }

  function updatePlanet(dt) {
    const pixAng = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (camera.zoom || 1) / engine.height;
    planet.update({ skyQuaternion: skyRotation, observer, pixAng, dt, lightColor: planetLight });
  }

  const offPre = engine.onPreRender((r, cam) => {
    if (engine.background?.scene !== scene) return;
    syncCamera(mainCamera || cam);
    derive();
    updatePlanet(dtPending);
    dtPending = 0;
    gargantua.render(r, camera, engine.width, engine.height);
  });

  const envScenes = new Set();
  function refreshEnvironment() {
    derive();
    updatePlanet(0);
    const rt = pmrem.fromScene(envScene, 0, 0.05, 2000, { size: envSize });
    const old = envRT;
    envRT = rt;
    api.environment = rt.texture;
    for (const sc of envScenes) sc.environment = rt.texture;
    old?.dispose();
    return rt.texture;
  }

  const api = {
    scene, camera, gargantua, planet, observer, skyRotation, lightDirection, lightColor, planetLight,
    environment: null,
    get lightIntensity() { return lightIntensity; },
    get lightAngularRadius() { return lightAngularRadius; },
    get plunge() { return plunge; },
    get time() { return time; },
    update(main, dt = 0) {
      mainCamera = main || mainCamera;
      time += dt;
      dtPending += dt;
      gargantua.setTime(time);
      syncCamera(mainCamera);
      derive();
    },
    setObserver(v) { observer.copy(v); derive(); },
    setSkyRotation(q) { skyRotation.copy(q); derive(); },
    setPlanet(o) { planet.set(o); updatePlanet(0); },
    setPlunge(x) { plunge = THREE.MathUtils.clamp(x, 0, 1); derive(); },
    setQuality(name) { gargantua.setQuality(name); },
    setDisk(o = {}) {
      if (o.stars !== undefined) starLevel = o.stars;
      const u = gargantua.uniforms;
      for (const [k, n] of [['inner', 'uRin'], ['outer', 'uRout'], ['gain', 'uGain'], ['doppler', 'uDoppler'], ['spin', 'uSpin'], ['thickness', 'uThick'], ['opacity', 'uOpacity'], ['halo', 'uHalo'], ['detail', 'uDetail'], ['tail', 'uTail'], ['selfShadow', 'uSelfShadow']]) if (o[k] !== undefined) u[n].value = o[k];
    },
    worldToBh(v, out = new THREE.Vector3()) { return out.copy(v).applyQuaternion(_q.copy(skyRotation).invert()); },
    bhToWorld(v, out = new THREE.Vector3()) { return out.copy(v).applyQuaternion(skyRotation); },
    directionToGargantua(out = new THREE.Vector3()) { return out.copy(lightDirection); },
    refreshEnvironment,
    attachEnvironment(sc) { envScenes.add(sc); if (!envRT) refreshEnvironment(); sc.environment = envRT.texture; return () => envScenes.delete(sc); },
    async compile() { await renderer.compileAsync(scene, camera); await renderer.compileAsync(envScene, camera); },
    measure(frames = 20) { syncCamera(mainCamera || engine.camera); derive(); return gargantua.measure(renderer, camera, engine.width, engine.height, frames); },
    attach() { engine.setBackground(scene, camera); },
    dispose() {
      offPre();
      gargantua.dispose(); planet.dispose(); pmrem.dispose();
      for (const sc of envScenes) if (sc.environment === envRT?.texture) sc.environment = null;
      envRT?.dispose();
      if (engine.background?.scene === scene) engine.setBackground(null);
    },
  };
  derive();
  return api;
}
