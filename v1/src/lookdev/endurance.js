// Lookdev: Endurance exterior on black space under a hard warm key, presets matching refs 06, 09, 25 and 10, optional docked Ranger for scale.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHullMaterials } from '../models/hull-materials.js';
import { createEndurance } from '../models/endurance.js';

const PRESETS = {
  r06: { pos: [22, -16, 162], target: [2, 0, 0], up: [0, 1, 0], fov: 33, key: [-0.5, 0.55, 0.65], ranger: true, ranger2: true },
  r07: { pos: [0, 0, 150], target: [0, 0, 0], up: [0, 1, 0], fov: 36, key: [0, 0.3, 1] },
  r09: { pos: [6, -9, 27], target: [-3, 9, 0], up: [0, 1, 0], fov: 56, key: [0.5, 0.6, 0.6], ranger: true },
  r25: { pos: [3.5, -2.0, 26], target: [-6, 24, 2], up: [0, 0.3, 1], fov: 48, key: [-0.3, -0.5, 0.8], ranger: true },
  fly10: { pos: [6, -24, 13.5], target: [0, -32, 0], up: [0, 1, 0], fov: 55, key: [0.6, 0.4, 0.7] },
  flyEngine: { pos: [-8, -26, -14], target: [-12, -30, -3], up: [0, 1, 0], fov: 55, key: [0.2, 0.5, -0.8], engines: 1 },
  lander: { pos: [16, 15, 15], target: [0, 6.5, 0], up: [0, 1, 0], fov: 48, key: [0.5, 0.75, 0.45] },
  hubCore: { pos: [9, -7, 11], target: [0, 0, 1], up: [0, 1, 0], fov: 50, key: [0.6, 0.5, 0.6] },
  hub: { pos: [14, 10, 18], target: [0, 0, 0], up: [0, 1, 0], fov: 42, key: [0.6, 0.6, 0.5], ranger: true },
  r10: { pos: [120, -60, -950], target: [0, 0, 0], up: [0, 1, 0], fov: 8, key: [0.7, 0.1, 0.7], engines: 1 },
  aft: { pos: [30, -20, -150], target: [0, 0, 0], up: [0, 1, 0], fov: 34, key: [0.4, 0.5, -0.7], engines: 1 },
  side: { pos: [150, 30, 40], target: [0, 0, 0], up: [0, 0, 1], fov: 30, key: [0.5, 0.5, 0.7] },
};

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const name = params.get('view') || 'r06';
  const P = PRESETS[name] || PRESETS.r06;
  const materials = createHullMaterials({ renderer: engine.renderer, quality: engine.qualityName });
  const tb = performance.now();
  const api = await createEndurance({ engine, materials });
  window.__buildMs = Math.round(performance.now() - tb);
  scene.add(api.group);
  scene.background = new THREE.Color(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = +(params.get('env') || 0.04);
  const k = (params.get('key') || P.key.join(',')).split(',').map(Number);
  const key = new THREE.DirectionalLight(0xfff8ee, +(params.get('ki') || 13));
  key.position.set(k[0], k[1], k[2]).normalize().multiplyScalar(120);
  key.castShadow = true;
  const ss = engine.quality?.shadowSize || 4096;
  key.shadow.mapSize.set(ss, ss);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -48; sc.right = sc.top = 48; sc.near = 40; sc.far = 220;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04;
  scene.add(key, key.target);
  const bounce = new THREE.DirectionalLight(0x8fa6c4, +(params.get('bounce') || 0));
  bounce.position.set(-k[0], -k[1] - 0.5, -k[2]).normalize().multiplyScalar(100);
  scene.add(bounce);
  engine.film.look('space');
  engine.film.letterbox = params.has('lb') ? 1 : 0;
  if (params.has('exp')) engine.film.exposure = +params.get('exp');
  api.setEngines(+(params.get('engines') ?? P.engines ?? 0));
  if (params.has('windows')) api.setWindows(+params.get('windows'));
  if ((P.ranger || params.has('ranger')) && !params.has('noranger')) {
    try {
      const { createRanger } = await import('../models/ranger.js');
      const rg = await createRanger({ engine, materials });
      const dock = rg.anchors?.dockPort;
      const port = api.anchors.rangerPortA;
      api.group.add(rg.group);
      rg.group.updateMatrixWorld(true);
      rg.group.quaternion.copy(port.quaternion);
      const off = dock ? dock.position.clone().applyQuaternion(port.quaternion) : new THREE.Vector3(0, 0, -8);
      rg.group.position.copy(port.position).sub(off);
      window.__ranger = rg;
      if (P.ranger2 || params.has('ranger2')) {
        const rg2 = await createRanger({ engine, materials });
        const pb = api.anchors.rangerPortB;
        api.group.add(rg2.group);
        rg2.group.quaternion.copy(pb.quaternion);
        const off2 = dock ? dock.position.clone().applyQuaternion(pb.quaternion) : new THREE.Vector3(0, 0, 8);
        rg2.group.position.copy(pb.position).sub(off2);
      }
    } catch (e) { console.warn('ranger not attached', e.message); }
  }
  camera.near = 0.1; camera.far = 5000;
  camera.fov = +(params.get('fov') || P.fov);
  camera.up.set(...P.up).normalize();
  const up = camera.up.clone();
  const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
  const wrap = new THREE.Group();
  scene.remove(api.group); wrap.add(api.group); scene.add(wrap);
  wrap.quaternion.copy(q);
  key.position.applyQuaternion(q); bounce.position.applyQuaternion(q);
  camera.up.set(0, 1, 0);
  camera.position.set(...P.pos).applyQuaternion(q);
  controls.target.set(...P.target).applyQuaternion(q);
  camera.updateProjectionMatrix();
  controls.update();
  const spin = params.has('spin');
  engine.onUpdate((dt) => { if (spin) api.group.rotation.z += dt * 0.55; api.update(dt); });
  await engine.renderer.compileAsync(scene, camera);
  window.__stats = () => ({ ...api.stats(), info: engine.lastInfo });
  return api;
}
