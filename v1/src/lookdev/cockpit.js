// Lookdev for the Ranger cockpit: interior inside the full exterior hull, hard window key, power and failure states, camera presets matching refs 04, 26, 24.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHullMaterials } from '../models/hull-materials.js';
import { createRanger } from '../models/ranger.js';
import { createRangerCockpit } from '../models/ranger-cockpit.js';
import { createDisplay, createDisplayManager, displaysReady } from '../models/displays.js';

export const COCKPIT_PRESETS = {
  c04: { pos: [0, 1.36, 1.4], target: [0, 1.02, -2.2], fov: 74, key: [0.25, 1, -0.35], sky: 'day' },
  c26: { pos: [0.05, 1.5, 0.75], target: [0, 1.05, -2.6], fov: 50, key: [-0.2, 0.55, -1], sky: 'day', letterbox: 1 },
  c24: { pos: [0.3, 1.2, -0.45], target: [-1.05, 0.92, -2.05], fov: 52, key: [0.7, 0.8, -0.5], sky: 'space' },
  pilot: { pos: [-0.85, 1.4, -0.8], target: [-0.85, 1.4, -3.0], fov: 70, key: [0.3, 1, -0.6], sky: 'day' },
  pilotSpace: { pos: [-0.85, 1.4, -0.8], target: [-0.85, 1.25, -3.0], fov: 62, key: [0.3, 1, -0.6], sky: 'space' },
  overhead: { pos: [-0.85, 1.4, -0.8], target: [-1.6, 2.2, -1.0], fov: 70, key: [0.2, 1, -0.4], sky: 'space' },
  cabin: { pos: [0.4, 1.4, -0.2], target: [-0.6, 0.9, 5.5], fov: 66, key: [-0.4, 1, 0.3], sky: 'space' },
  hatch: { pos: [0.3, 1.35, 3.0], target: [0, 0.9, 6.5], fov: 60, key: [-0.4, 1, 0.3], sky: 'space' },
};

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const film = engine.film;
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv;
  scene.environmentIntensity = 0.06;

  const key = new THREE.DirectionalLight(0xfff8ee, 13);
  key.castShadow = true;
  const ss = engine.quality?.shadowSize || 4096;
  key.shadow.mapSize.set(ss, ss);
  const sc = key.shadow.camera;
  sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 0.5; sc.far = 40;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.012;
  scene.add(key, key.target);
  const skyFill = new THREE.HemisphereLight(0xcfe0ff, 0x101010, 0);
  scene.add(skyFill);

  const skyU = { day: { value: 0 } };
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false, uniforms: skyU,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float day; varying vec3 vDir; void main(){ float y = vDir.y; vec3 up = mix(vec3(1.25,1.32,1.4), vec3(0.62,0.72,0.86), smoothstep(0.0, 0.7, y)); vec3 haze = vec3(1.45,1.5,1.55); vec3 sea = mix(vec3(0.34,0.4,0.44), vec3(0.1,0.13,0.15), smoothstep(-0.02, -0.5, y)); float band = sin(y * 900.0 + vDir.x * 40.0) * 0.02 * smoothstep(-0.6, -0.02, y); vec3 c = y > 0.0 ? mix(haze, up, smoothstep(0.0, 0.12, y)) : mix(haze, sea + band, smoothstep(0.0, 0.04, -y)); gl_FragColor = vec4(c * day * 0.4, 1.0); }',
  }));
  scene.add(backdrop);

  const materials = createHullMaterials({ renderer: engine.renderer, quality: engine.qualityName });
  const ranger = await createRanger({ engine, quality: engine.qualityName, materials });
  scene.add(ranger.group);
  const cockpit = await createRangerCockpit({ engine, quality: engine.qualityName, materials, ranger });
  ranger.group.add(cockpit.group);
  engine.onUpdate((dt) => { ranger.update(dt); cockpit.update(dt); });

  const KINDS = { mainL1: 'attitude', mainL2: 'nav', mainL3: 'systems', mainR1: 'engine', mainR2: 'dock', mainR3: 'clock', centre1: 'systems', centre2: 'engine', centre3: 'clock', centre4: 'cryo', centre5: 'attitude', centre6: 'beacon', centre7: 'log', centre8: 'recorder', centre9: 'board', overhead: 'systems', overheadL: 'text', overheadR: 'engine', sideL: 'nav', sideR: 'dock' };
  const displays = [];
  if (params.get('disp') !== '0') {
    await displaysReady;
    const manager = createDisplayManager({ engine, budgetMs: 2.5, maxDistance: 8 });
    for (const s of cockpit.displaySlots) {
      const d = createDisplay(KINDS[s.id] || 'systems', { width: s.width, height: s.height, envMap: scene.environment });
      d.mount(s);
      s.display = d;
      d.setPower(+(params.get('power') ?? 1));
      manager.add(d);
      displays.push(d);
    }
    engine.onUpdate((dt) => manager.update(dt, camera));
  }

  const setPreset = (name) => {
    const p = COCKPIT_PRESETS[name] || COCKPIT_PRESETS.c04;
    const d = new THREE.Vector3(...p.key).normalize();
    key.position.copy(d.multiplyScalar(25));
    key.target.position.set(0, 1, -0.5);
    if (p.sky === 'day') {
      skyU.day.value = 1;
      skyFill.intensity = 0.45;
      skyFill.groundColor.set(0x4a4b4c);
      cockpit.setBounce(+(params.get('bounce') ?? 0.3));
      key.intensity = 8;
      scene.environmentIntensity = 0.04;
    } else {
      skyU.day.value = 0;
      skyFill.intensity = 0;
      skyFill.groundColor.set(0x101010);
      cockpit.setBounce(+(params.get('bounce') ?? 0.05));
      key.intensity = 13;
      scene.environmentIntensity = 0.02;
    }
    film.look('cockpit', 0, { exposure: +(params.get('exp') ?? 1.0), letterbox: p.letterbox ?? 0 });
    camera.fov = p.fov; camera.near = 0.02; camera.far = 2000; camera.updateProjectionMatrix();
    camera.position.set(...p.pos);
    controls.target.set(...p.target);
    controls.update();
    return name;
  };

  cockpit.setPower(+(params.get('power') ?? 1));
  cockpit.setFailure(+(params.get('failure') ?? 0));
  if (params.get('helmet') === '0') cockpit.takeHelmet();
  for (const id of (params.get('on') || '').split(',').filter(Boolean)) cockpit.set(id, 1, true);
  if (params.has('hatch')) cockpit.set('hatch', +params.get('hatch'), true);
  setPreset(params.get('preset') || 'c04');
  await engine.renderer.compileAsync(scene, camera);

  return { ranger, cockpit, displays, setPreset, presets: Object.keys(COCKPIT_PRESETS), stats: () => ({ ...cockpit.stats(), exterior: ranger.stats() }) };
}
