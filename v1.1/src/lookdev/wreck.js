// Lookdev for the Lander wreck on Miller's sea: overcast surface and haze, wading-eye presets at 30, 8 and 2 m, the ref 19 framing, a recorder close-up and a GPU benchmark.
import { createMillerSurface, SEABED } from '../world/ocean.js';
import { createHullMaterials } from '../models/hull-materials.js';
import { createWreck, WRECK } from '../models/wreck.js';
import { createDisplay, displaysReady } from '../models/displays.js';
import { filmFor } from './ocean.js';

const D2R = Math.PI / 180;
const EYE = SEABED + WRECK.EYE;

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  camera.near = 0.03;
  camera.far = 30000;
  camera.updateProjectionMatrix();
  const surf = createMillerSurface({ engine, wind: +(params.get('wind') || 0.42) });
  scene.add(surf.group);
  scene.environment = surf.environment;
  scene.environmentIntensity = 1.0;
  scene.add(surf.keyLight, surf.keyLight.target);

  const materials = createHullMaterials({ renderer: engine.renderer, quality: engine.qualityName });
  const wreck = await createWreck({ engine, quality: engine.qualityName, materials });
  scene.add(wreck.group);
  wreck.group.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) surf.applyHaze(m); }); });
  wreck.pieces.forEach(p => { if (p.floating || ['panel', 'gearStrut', 'ribArc', 'cornerSkin'].includes(p.name)) surf.addWake(p.object, p.wake || p.radius * 0.8); });

  await displaysReady;
  const display = createDisplay('recorder', { width: wreck.displaySlots[0].width, height: wreck.displaySlots[0].height, resolution: 512, envMap: surf.environment });
  display.mount(wreck.displaySlots[0]);
  display.setState({ unit: 'LANDER 1', elapsedMinutes: 47.2 });
  display.setReflection(0.5);
  setTimeout(() => display.setPower(1), 300);

  const suitMat = surf.applyHaze(new THREE.MeshStandardMaterial({ color: 0xdedbd3, roughness: 0.72 }));
  const people = [0, 1].map(() => { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.34, 6, 16), suitMat); p.visible = false; scene.add(p); surf.addWake(p, 0.2); return p; });

  let ranger = null;
  if (params.get('ranger') === '1') {
    try {
      const { createRanger } = await import('../models/ranger.js');
      const r = await createRanger({ engine, quality: engine.qualityName, materials });
      r.setGear?.(1);
      r.group.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { if (!m.isShaderMaterial && !m.isRawShaderMaterial) surf.applyHaze(m); }); });
      ranger = r;
      scene.add(r.group);
    } catch (e) { console.warn('ranger:', e.message); }
  }

  wreck.group.updateMatrixWorld(true);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const rec = wp(wreck.anchors.recorderGrab), panel = wp(wreck.pieces.find(p => p.name === 'panel').object);
  const look = (pos, tgt, fov, yawOff = 0, pitchOff = 0, pitchAbs = null) => {
    const d = new THREE.Vector3().subVectors(tgt, pos);
    const yaw = Math.atan2(d.x, d.z) + yawOff * D2R, dist = Math.hypot(d.x, d.z), pitch = pitchAbs !== null ? pitchAbs * D2R : Math.atan2(d.y, dist) + pitchOff * D2R;
    const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(pos);
    controls.target.copy(pos).addScaledVector(f, Math.max(2, d.length()));
    camera.fov = fov; camera.updateProjectionMatrix();
    controls.update();
  };
  const PRESETS = {
    far: () => { look(new THREE.Vector3(7, EYE, 29), new THREE.Vector3(-1.5, 0.6, 0), 45); return { people: [[-0.8, 2.6], [1.0, 3.4]], mist: 1 / 260 }; },
    mid: () => { look(new THREE.Vector3(1.2, EYE, 7.2), new THREE.Vector3(-2.2, 0.7, -0.6), 55); return { people: [[-4.3, 4.5]], mist: 1 / 260 }; },
    near: () => { look(new THREE.Vector3(rec.x + 0.3, EYE, rec.z + 1.95), rec, 62, 8); return { people: [], mist: 1 / 260 }; },
    ref19: () => { look(new THREE.Vector3(panel.x + 2.4, 2.3, panel.z + 12.3), panel.clone().setY(1.2), 40, 7.5, 0, -12); return { people: [[panel.x - 1.4, panel.z + 6.2], [panel.x - 2.3, panel.z + 1.2]], mist: 1 / 200, ranger: [panel.x - 16, panel.z - 80] }; },
    recorder: () => { look(new THREE.Vector3(rec.x + 0.18, rec.y + 0.22, rec.z + 0.72), rec.clone().add(new THREE.Vector3(0, -0.12, 0)), 50); return { people: [], mist: 1 / 260 }; },
    side: () => { look(new THREE.Vector3(9.5, EYE, -2.5), new THREE.Vector3(-1.5, 0.8, -1.5), 55); return { people: [], mist: 1 / 260 }; },
    top: () => { look(new THREE.Vector3(0.5, 22, 9), new THREE.Vector3(-0.5, 0, 0.5), 60); return { people: [], mist: 1 / 600 }; },
    back: () => { look(new THREE.Vector3(-3.5, EYE, -9.5), new THREE.Vector3(-1.5, 0.8, -1.0), 55); return { people: [], mist: 1 / 260 }; },
  };
  const F = filmFor('19');
  const setFilm = () => {
    Object.assign(engine.film, { letterbox: 0, exposure: F.exposure, bloomStrength: F.bloomStrength, bloomRadius: F.bloomRadius, bloomThreshold: F.bloomThreshold, halation: F.halation, vignette: F.vignette, ca: F.ca, saturation: F.saturation, contrast: F.contrast, streak: 0 });
    engine.film.tintShadow.setRGB(...F.tintShadow);
    engine.film.tintHigh.setRGB(...F.tintHigh);
    if (params.has('exp')) engine.film.exposure = +params.get('exp');
  };
  let current = '';
  const preset = (name) => {
    const P = (PRESETS[name] || PRESETS.mid)();
    current = name;
    people.forEach((p, i) => { const s = P.people?.[i]; p.visible = !!s && params.get('people') !== '0'; if (s) p.position.set(s[0], SEABED + 0.95, s[1]); });
    surf.setMist(params.has('mist') ? 1 / +params.get('mist') : P.mist);
    surf.setWave({ visible: false, speed: 0 });
    surf.setDrawdown(0);
    if (ranger) { const r = P.ranger || [-14, -40]; ranger.group.position.set(r[0], SEABED + (ranger.gearHeight || 2.6), r[1]); ranger.group.rotation.set(0, 2.3, 0); }
    setFilm();
    return name;
  };
  preset(params.get('p') || 'mid');

  let t = 0, stepT = 0;
  engine.onUpdate(dt => {
    t += dt;
    surf.update(dt, camera);
    wreck.update(dt, surf.heightAt);
    ranger?.update?.(dt);
    const ph = t % 1.6;
    wreck.setStrobe(ph < 0.09 ? 1 : 0);
    display.update(dt);
    if ((stepT += dt) > 0.5) { stepT = 0; const p = people.find(q => q.visible); if (p) surf.splash(new THREE.Vector3(p.position.x, 0, p.position.z + 0.15), 0.6); }
  });

  surf.update(1 / 60, camera);
  wreck.update(1 / 60, surf.heightAt);
  await engine.renderer.compileAsync(scene, camera);
  console.log('wreck stats', JSON.stringify(wreck.stats()));

  const settle = ms => new Promise(r => setTimeout(r, ms));
  async function bench(ms = 1500) {
    const res = { size: `${engine.width}x${engine.height}`, tier: engine.qualityName };
    engine.gpuMs = 0; await settle(ms);
    res.full = +engine.gpuMs.toFixed(2); res.calls = engine.lastInfo.calls; res.tris = engine.lastInfo.triangles;
    wreck.group.visible = false;
    engine.gpuMs = 0; await settle(ms);
    res.noWreck = +engine.gpuMs.toFixed(2);
    wreck.group.visible = true;
    res.wreckMs = +(res.full - res.noWreck).toFixed(2);
    return res;
  }

  return { surf, wreck, display, people, ranger, preset, presets: Object.keys(PRESETS), bench, get current() { return current; } };
}
