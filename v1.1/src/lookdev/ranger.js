// Lookdev for the Ranger exterior: hard warm key on black (space) or overcast Miller look, camera presets matching the reference stills.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHullMaterials } from '../models/hull-materials.js';
import { createRanger } from '../models/ranger.js';

const az = (deg, el, dist, t) => {
  const a = deg * Math.PI / 180, e = el * Math.PI / 180;
  return { pos: [t[0] + Math.sin(a) * Math.cos(e) * dist, t[1] + Math.sin(e) * dist, t[2] + Math.cos(a) * Math.cos(e) * dist], target: t };
};

export const RANGER_PRESETS = {
  r21: { ...az(47, 31, 33, [0.5, 0.5, -0.5]), fov: 23, look: 'space', key: [0.45, 1, 0.55], gear: 0 },
  r23: { ...az(92, 1.5, 34, [0, 0.0, 0]), fov: 22, look: 'overcast', gear: 1, water: true },
  r18: { ...az(0, 2, 26, [0, 0.2, 0]), fov: 24, look: 'overcast', gear: 1, hatch: 1, ramp: 1, water: true },
  profile: { ...az(92, 2.5, 82, [0, 0.0, 0]), fov: 9.5, look: 'overcast', gear: 1, water: true },
  profileSpace: { ...az(90, 0, 82, [0, 0.4, 0]), fov: 9.5, look: 'space', key: [0.8, 0.9, 0.2], gear: 0 },
  below: { ...az(30, -35, 30, [0, 0, 0]), fov: 30, look: 'space', key: [0.4, -0.6, -0.6], gear: 1 },
  ramp: { ...az(35, 6, 14, [0, -0.6, 9]), fov: 40, look: 'overcast', gear: 1, hatch: 1, ramp: 1, water: true },
  r17: { ...az(-18, 12, 40, [0, 0.4, 0]), fov: 22, look: 'overcast', gear: 1, water: true },
  r14: { pos: [-3.2, -4.6, 9.5], target: [1.2, -0.8, -2.5], fov: 52, look: 'space', key: [0.55, -0.35, -0.75] },
  r25: { pos: [1.7, 3.05, -0.4], target: [-4.6, 1.2, -4.8], fov: 55, look: 'space', key: [-0.45, 0.6, 0.35] },
  r09: { pos: [-6.5, -5.5, 16], target: [0, 0.8, 0], fov: 40, look: 'space', key: [0.3, 0.2, 1] },
  rear: { ...az(20, 14, 18, [0, 0.6, 4]), fov: 35, look: 'space', key: [0.3, 0.7, 1], hatch: 0 },
  top: { pos: [0, 42, 0.01], target: [0, 0, 0], fov: 26, look: 'space', key: [0.2, 1, 0.3] },
  side: { ...az(90, 0, 40, [0, 0.6, 0]), fov: 26, look: 'space', key: [1, 0.6, 0.2] },
  engine: { ...az(-28, 6, 20, [0, 0.6, 5]), fov: 34, look: 'space', key: [-0.4, 0.8, 0.5], engine: 1 },
};

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const film = engine.film;
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const skyScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(1.05, 1.02, 0.95); vec3 hor = vec3(0.92, 0.9, 0.84); vec3 sea = vec3(0.10, 0.12, 0.115); vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor * 0.5, sea, clamp(-h * 4.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0); }',
  });
  skyScene.add(new THREE.Mesh(skyGeo, skyMat));
  const overcastEnv = pmrem.fromScene(skyScene, 0).texture;

  const key = new THREE.DirectionalLight(0xfff0d8, 6.0);
  key.castShadow = true;
  const ss = engine.quality?.shadowSize || 4096;
  key.shadow.mapSize.set(ss, ss);
  const sc = key.shadow.camera;
  sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 0.5; sc.far = 60;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.025;
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight(0xdedcd4, 0x2a2e2c, 0);
  scene.add(hemi);
  const bounce = new THREE.DirectionalLight(0x9fb4d0, 0);
  scene.add(bounce, bounce.target);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x161c1c, roughness: 0.45, metalness: 0, envMapIntensity: 0.14 }));
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  water.visible = false;
  scene.add(water);

  const materials = createHullMaterials({ renderer: engine.renderer, quality: engine.qualityName });
  const ranger = await createRanger({ engine, quality: engine.qualityName, materials });
  scene.add(ranger.group);
  engine.onUpdate((dt) => ranger.update(dt));

  const setLook = (look, keyDir) => {
    if (look === 'overcast') {
      scene.background = new THREE.Color(0.86, 0.84, 0.78);
      scene.environment = overcastEnv;
      scene.environmentIntensity = 1.0;
      key.intensity = 0.9; key.color.set(0xf4efe6);
      key.position.set(-6, 20, 4);
      hemi.intensity = 0.6;
      bounce.intensity = 0;
      Object.assign(film, { exposure: 0.95, bloomStrength: 0.06, saturation: 0.55, contrast: 0.12, vignette: 0.45, letterbox: 0, grain: 0.04 });
      scene.fog = new THREE.FogExp2(new THREE.Color(0.8, 0.79, 0.74), 0.006);
    } else {
      scene.background = new THREE.Color(0, 0, 0);
      scene.environment = roomEnv;
      scene.environmentIntensity = 0.04;
      key.intensity = 13; key.color.set(0xfff8ee);
      const d = new THREE.Vector3(...(keyDir || [0.45, 1, 0.55])).normalize();
      key.position.copy(d.multiplyScalar(30));
      hemi.intensity = 0;
      bounce.intensity = 0;
      film.look('space');
      film.letterbox = 0;
      scene.fog = null;
    }
    key.target.position.set(0, 0.5, 0);
  };

  const setPreset = (name) => {
    const p = RANGER_PRESETS[name] || RANGER_PRESETS.r21;
    setLook(params.get('look') || p.look, p.key);
    const look = params.get('look') || p.look;
    ranger.setStance?.(params.get('stance') || (p.water ? 'landed' : 'flight'));
    ranger.setGear(p.gear ?? +(params.get('gear') ?? 0));
    ranger.setHatch(p.hatch ?? +(params.get('hatch') ?? 0));
    ranger.setEngine(p.engine ?? +(params.get('engine') ?? 0));
    ranger.setRamp(p.ramp ?? +(params.get('ramp') ?? 0));
    ranger.setLights(params.get('lights') !== '0');
    water.visible = !!p.water && look === 'overcast';
    water.position.y = -ranger.gearHeight + 0.55;
    ranger.group.position.y = 0;
    camera.fov = p.fov; camera.near = 0.05; camera.far = 2000; camera.updateProjectionMatrix();
    camera.position.set(...p.pos);
    controls.target.set(...p.target);
    controls.update();
    return name;
  };

  setPreset(params.get('preset') || 'r21');
  if (params.has('lod')) ranger.setLOD(true);
  await engine.renderer.compileAsync(scene, camera);

  return {
    ranger, materials, setPreset, setLook, presets: Object.keys(RANGER_PRESETS),
    stats: () => ranger.stats(),
  };
}
