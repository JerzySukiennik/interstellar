// Lookdev for the Miller's Planet surface: ocean, sky and the wave with reference-matched presets, scale stand-ins and a GPU benchmark.
import { createMillerSurface, createSeaPatch, createWaveRidge, SEABED } from '../world/ocean.js';

const D2R = Math.PI / 180;
const SKY_NEUTRAL = { top: [0.43, 0.44, 0.43], horizon: [0.5, 0.51, 0.495], glow: [0.1, 0.1, 0.09] };
const SKY_CREAM = { top: [0.47, 0.445, 0.4], horizon: [0.53, 0.49, 0.415], glow: [0.2, 0.17, 0.12] };
const SKY_BRIGHT = { top: [0.62, 0.575, 0.5], horizon: [0.86, 0.78, 0.66], glow: [0.3, 0.24, 0.16] };
const PRESETS = {
  '19': { sky: SKY_NEUTRAL, mist: 1 / 230, cloud: 0.12, eye: [0, 1.4, 0], yaw: 0, pitch: -13.5, fov: 40, wave: null, wind: 0.42, layout: 'wade', film: { exposure: 1.08, saturation: 0.92, contrast: 0.2, tintShadow: [0.0, 0.012, 0.006], tintHigh: [-0.008, 0.002, -0.004] } },
  '18': { sky: SKY_BRIGHT, reflect: 0.5, mist: 1 / 650, cloud: 1.4, eye: [0, 0.7, 34], yaw: 90, pitch: -2.5, fov: 30, wave: null, wind: 0.5, layout: 'rear', film: { exposure: 1.02, saturation: 0.9, contrast: 0.26 } },
  '16': { sky: SKY_CREAM, mist: 1 / 520, cloud: 0.15, eye: [0, 6.2, 0], yaw: 85, pitch: 11, fov: 40, wave: 520, wind: 0.85, layout: 'nose', film: { exposure: 1.25, saturation: 0.7 } },
  '17': { sky: SKY_CREAM, mist: 1 / 950, haze: 30000, cloud: 0.1, eye: [0, 3.0, 0], yaw: 69.5, pitch: 8, fov: 40, wave: 260, wind: 0.9, layout: 'ranger17', film: { exposure: 1.05, saturation: 0.78, contrast: 0.24, tintShadow: [0.0, 0.004, 0.018], tintHigh: [-0.006, -0.001, 0.004] } },
  fp: { mist: 1 / 900, eye: [0, SEABED + 1.75, 0], yaw: 0, pitch: 14, fov: 62, wave: 300, wind: 0.75, layout: 'wade', film: { exposure: 1.0, saturation: 0.8 } },
  far: { mist: 1 / 700, eye: [0, SEABED + 1.75, 0], yaw: 8, pitch: 4, fov: 45, wave: 8000, wind: 0.6, layout: 'wade', film: { exposure: 1.05, saturation: 0.8 } },
  wall: { mist: 1 / 1600, eye: [0, SEABED + 1.75, 0], yaw: 0, pitch: 36, fov: 70, wave: 200, wind: 0.95, layout: 'wade', film: { exposure: 1.0, saturation: 0.75 } },
  alt: { mist: 1 / 700, cloud: 0.9, eye: [0, 1500, 0], yaw: 8, pitch: -14, fov: 55, wave: 9000, wind: 0.7, layout: 'wade', film: { exposure: 1.05, saturation: 0.82 } },
  below: { mist: 1 / 600, cloud: 1.2, eye: [0, 1950, 0], yaw: 8, pitch: -4, fov: 55, wave: 11000, wind: 0.7, layout: 'wade', film: { exposure: 1.05, saturation: 0.82 } },
  deck: { mist: 1 / 600, cloud: 1.0, eye: [0, 2330, 0], yaw: 8, pitch: -20, fov: 55, wave: 11000, wind: 0.7, layout: 'wade', film: { exposure: 1.05, saturation: 0.82 } },
  sub: { mist: 1 / 1400, cloud: 1.0, eye: [0, -0.35, 0], yaw: 0, pitch: 25, fov: 70, wave: -40, wind: 1.0, layout: 'wade', film: { exposure: 1.0, saturation: 0.8 } },
  eye: { sky: SKY_NEUTRAL, mist: 1 / 620, cloud: 0.15, eye: [0, SEABED + 1.75, 0], yaw: 0, pitch: 'auto', fov: 60, wave: 2000, wind: 0.7, layout: 'wade', film: { exposure: 1.05, saturation: 0.82 } },
  '03': { sky: SKY_BRIGHT, mist: 1 / 450, cloud: 0.6, eye: [0, 1.3, 0], yaw: 35, pitch: 2, fov: 45, wave: null, wind: 0.6, layout: 'none', film: { exposure: 1.2, saturation: 0.86 } },
  patch: { sky: SKY_NEUTRAL, mist: 1 / 600, cloud: 0.2, eye: [0, 16, 34], yaw: 90, pitch: -24, fov: 50, wave: null, wind: 0.6, layout: 'none', film: { exposure: 1.1, saturation: 0.86 } },
  impact: { mist: 1 / 1400, eye: [0, SEABED + 1.75, 0], yaw: 0, pitch: 48, fov: 75, wave: 25, wind: 1.0, layout: 'wade', film: { exposure: 1.0, saturation: 0.75 } },
};

const FILM_BASE = { exposure: 1, bloomStrength: 0.07, bloomRadius: 0.7, bloomThreshold: 0, halation: 0.45, vignette: 0.45, ca: 0.0018, saturation: 0.9, contrast: 0.2, tintShadow: [0, 0.006, 0.012], tintHigh: [0.012, 0.004, -0.008] };
export function filmFor(key, extra) { return { ...FILM_BASE, ...(PRESETS[key] || PRESETS['19']).film, ...(extra || {}) }; }

function viewDir(yaw, pitch) {
  const y = yaw * D2R, p = pitch * D2R;
  return [Math.cos(y) * Math.cos(p), Math.sin(p), -Math.sin(y) * Math.cos(p)];
}

function standInRanger(THREE, mats) {
  const g = new THREE.Group();
  const hullGeo = new THREE.BoxGeometry(10, 3.4, 16, 4, 2, 6);
  const pos = hullGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i), t = (z + 8) / 16, y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (0.18 + 0.82 * t));
    pos.setY(i, y > 0 ? -1.7 + (y + 1.7) * (0.35 + 0.65 * t) : y);
  }
  hullGeo.translate(0, 1.7, 0);
  hullGeo.computeVertexNormals();
  g.add(new THREE.Mesh(hullGeo, mats.dark));
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 9), mats.white);
  top.position.set(0, 3.1, 1.5);
  top.rotation.x = -0.11;
  g.add(top);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.4), mats.white);
  hatch.position.set(0, 0.2, 8.1);
  g.add(hatch);
  for (const [x, z] of [[-3.8, 5.5], [3.8, 5.5], [0, -5.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.9, 10), mats.metal);
    leg.position.set(x, -0.6, z);
    leg.userData.leg = true;
    g.add(leg);
  }
  return g;
}

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  camera.near = 0.08;
  camera.far = 30000;
  camera.updateProjectionMatrix();
  const surf = createMillerSurface({ engine, wind: 0.55 });
  scene.add(surf.group);
  scene.environment = surf.environment;
  scene.environmentIntensity = 1.0;
  scene.add(surf.keyLight, surf.keyLight.target);

  const mats = {
    dark: surf.applyHaze(new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.42, metalness: 0.35 })),
    white: surf.applyHaze(new THREE.MeshStandardMaterial({ color: 0xd9d6ce, roughness: 0.55, metalness: 0.05 })),
    metal: surf.applyHaze(new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.5, metalness: 0.7 })),
    suit: surf.applyHaze(new THREE.MeshStandardMaterial({ color: 0xdedbd3, roughness: 0.72 })),
    wreck: surf.applyHaze(new THREE.MeshStandardMaterial({ color: 0x5d625c, roughness: 0.6, metalness: 0.2 })),
  };

  let ranger = null, rangerApi = null;
  if (params.get('ranger') !== 'box') {
    try {
      const [{ createHullMaterials }, { createRanger }] = await Promise.all([import('../models/hull-materials.js'), import('../models/ranger.js')]);
      const materials = createHullMaterials({ renderer: engine.renderer, quality: engine.qualityName });
      rangerApi = await createRanger({ engine, quality: engine.qualityName, materials });
      rangerApi.setGear(1);
      rangerApi.group.traverse(o => { if (o.material) [].concat(o.material).forEach(mt => { if (!mt.isShaderMaterial && !mt.isRawShaderMaterial) surf.applyHaze(mt); }); });
      ranger = rangerApi.group;
    } catch (e) { console.warn('ranger stand-in:', e.message); ranger = null; rangerApi = null; }
  }
  const usingModel = !!ranger;
  if (ranger) surf.addShade(ranger, { width: 9, length: 15, strength: 0.8 });
  if (!ranger) ranger = standInRanger(THREE, mats);
  scene.add(ranger);

  const people = [0, 1].map(() => {
    const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.34, 6, 16), mats.suit);
    scene.add(p);
    return p;
  });
  const wreck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.35), mats.wreck);
  scene.add(wreck);
  const wakes = [...people, wreck].map(o => surf.addWake(o, o === wreck ? 0.6 : 0.2));
  if (rangerApi) ['gearFootL', 'gearFootR', 'gearFootN'].forEach(k => rangerApi.anchors?.[k] && surf.addWake(rangerApi.anchors[k], 0.3));
  else ranger.traverse(o => { if (o.userData.leg) surf.addWake(o, 0.25); });

  const place = (obj, x, z, yaw = 0, bottom = SEABED, half = 0.95) => { obj.position.set(x, bottom + half, z); obj.rotation.set(0, yaw, 0); obj.visible = true; };
  const placeRanger = (x, z, noseDir, bottom = 0.7) => {
    ranger.position.set(x, usingModel ? SEABED + rangerApi.gearHeight : bottom, z);
    ranger.rotation.set(0, Math.atan2(-noseDir[0], -noseDir[2]), 0);
    ranger.visible = true;
  };

  function layout(name, eye, d) {
    people.forEach(p => { p.visible = false; });
    wreck.visible = false;
    ranger.visible = false;
    if (name === 'wade') {
      place(people[0], eye[0] + 6.2, eye[2] - 0.4, 0.3);
      place(people[1], eye[0] + 10.5, eye[2] + 1.1, -0.2);
      wreck.position.set(eye[0] + 13, 0.45, eye[2] + 4.1); wreck.rotation.set(0.05, 0.4, -0.06); wreck.visible = true;
      placeRanger(eye[0] + 46, eye[2] + 8, [-0.35, 0, -0.94], 0.55);
    } else if (name === 'rear') {
      placeRanger(0, 0, [0, 0, -1], 0.75);
      place(people[0], 0, 7.4, 0, 0.75, 0.95);
    } else if (name === 'nose') {
      const n = [d[0], 0, d[2]];
      const l = Math.hypot(n[0], n[2]); n[0] /= l; n[2] /= l;
      const yaw = Math.atan2(-n[0], -n[2]) + 0.45;
      const nd = [-Math.sin(yaw), 0, -Math.cos(yaw)];
      placeRanger(eye[0] + nd[0] * 9 + 5.5 * nd[2], eye[2] + nd[2] * 9 - 5.5 * nd[0], nd, 0.2);
    } else if (name === 'ranger17') {
      const yaw = 69.5 * D2R + 0.15;
      const fx = Math.cos(yaw), fz = -Math.sin(yaw);
      placeRanger(eye[0] + fx * 40, eye[2] + fz * 40, [fx, 0, fz], 1.2);
    }
  }

  const ws = +(params.get('ws') || 40);
  let layoutName = '';
  function preset(key, overrides = {}) {
    const P = { ...(PRESETS[key] || PRESETS['19']), ...overrides };
    const wdist = params.has('wd') ? +params.get('wd') : params.has('t') ? +params.get('t') * ws : P.wave;
    if (P.pitch === 'auto') P.pitch = Math.min(32, Math.max(2.5, Math.atan2(560, Math.max(wdist || 2000, 1)) / D2R));
    const d = viewDir(P.yaw, P.pitch);
    camera.position.set(...P.eye);
    controls.target.set(P.eye[0] + d[0] * 50, P.eye[1] + d[1] * 50, P.eye[2] + d[2] * 50);
    camera.fov = P.fov;
    camera.updateProjectionMatrix();
    controls.update();
    surf.setWind(P.wind);
    surf.sky.uniforms.mCloud.value.x = P.cloud ?? 1;
    surf.setSkyColors(P.sky || SKY_CREAM);
    surf.setWaterColors({ reflectance: P.reflect ?? 0.8 });
    surf.setWaveAir(+(params.get('air') || 0));
    surf.sky.uniforms.mHaze.value.x = 1 / (P.haze ?? 10000);
    surf.setMist(params.has('mist') ? 1 / +params.get('mist') : P.mist);
    surf.setDrawdown(+(params.get('dd') || (P.wave && P.wave < 600 ? 0.6 : 0)));
    let dist = P.wave;
    if (params.has('wd')) dist = +params.get('wd');
    if (params.has('t')) dist = +params.get('t') * ws;
    if (dist !== null && dist !== undefined) surf.setWave({ x: P.eye[0] + dist, visible: true, speed: params.has('run') ? ws : 0, height: +(params.get('wh') || 1200) });
    else surf.setWave({ visible: false, speed: 0 });
    layout(P.layout, P.eye, d);
    layoutName = P.layout;
    const F = filmFor(key, overrides.film);
    Object.assign(engine.film, { letterbox: 0, exposure: F.exposure, bloomStrength: F.bloomStrength, bloomRadius: F.bloomRadius, bloomThreshold: F.bloomThreshold, halation: F.halation, vignette: F.vignette, ca: F.ca, saturation: F.saturation, contrast: F.contrast, streak: 0 });
    engine.film.tintShadow.setRGB(...F.tintShadow);
    engine.film.tintHigh.setRGB(...F.tintHigh);
    if (params.has('exp')) engine.film.exposure = +params.get('exp');
    return P;
  }

  const key = params.get('p') || params.get('preset') || '19';
  preset(key);
  let memory = null;
  if (key === 'patch') {
    surf.group.visible = false;
    const light = { top: SKY_NEUTRAL.top, horizon: SKY_NEUTRAL.horizon, glow: SKY_NEUTRAL.glow };
    const patch = createSeaPatch({ engine, size: 40, time: 3, light });
    const ridge = createWaveRidge({ engine, height: 60, length: 320, time: 3, light });
    ridge.group.position.set(-14, -0.2, -40);
    ridge.group.rotation.y = Math.PI / 2;
    scene.add(patch.group, ridge.group);
    memory = { patch, ridge };
    engine.onUpdate(dt => { patch.update(dt); ridge.update(dt); });
  }
  if (params.has('wind')) surf.setWind(+params.get('wind'));

  let t = 0, stepT = 0, stepN = 0;
  const walk = params.has('walk');
  engine.onUpdate(dt => {
    t += dt;
    if (walk) {
      const p = people[0];
      p.position.x += dt * 0.9 * Math.cos(t * 0.3);
      p.position.z += dt * 0.9 * Math.sin(t * 0.3);
      if ((stepT += dt) > 0.75) { stepT = 0; surf.splash(new THREE.Vector3(p.position.x, 0, p.position.z), 0.8); }
    }
    if (layoutName === 'wade' && !params.has('nosteps')) {
      stepT += dt;
      if (stepT > 0.42) {
        stepT = 0;
        const p = people[stepN++ % 2];
        if (p.visible) surf.splash(new THREE.Vector3(p.position.x - 0.25, 0, p.position.z + (stepN % 4 < 2 ? 0.16 : -0.16)), 0.7);
      }
    }
    if (params.has('splash') && Math.floor(t / 2.5) !== Math.floor((t - dt) / 2.5)) surf.splash(new THREE.Vector3(camera.position.x + 6 + Math.random() * 3, 0, camera.position.z + (Math.random() - 0.5) * 4), 1 + Math.random() * 4);
    surf.update(dt, camera);
    rangerApi?.update?.(dt);
    if (wreck.visible) {
      const h = surf.heightAt(wreck.position.x, wreck.position.z);
      wreck.position.y += (Math.max(h + 0.75, SEABED + 1.2) - wreck.position.y) * Math.min(1, dt * 2);
    }
  });

  surf.update(1 / 60, camera);
  surf.prime();
  await engine.renderer.compileAsync(scene, camera);

  const settle = ms => new Promise(r => setTimeout(r, ms));
  async function gpuTime(ms) {
    engine.gpuMs = 0;
    await settle(ms);
    return +engine.gpuMs.toFixed(2);
  }

  async function bench(ms = 1500) {
    const res = { size: `${engine.width}x${engine.height}`, tier: engine.qualityName };
    res.full = await gpuTime(ms);
    res.calls = engine.lastInfo.calls; res.tris = engine.lastInfo.triangles;
    const saved = surf.group.children.map(o => o.visible);
    surf.group.children.forEach(o => { if (o.name.startsWith('miller-wave') || (o.material?.transparent && !o.isPoints)) o.visible = false; });
    res.noWave = await gpuTime(ms);
    surf.group.children.forEach((o, i) => { o.visible = saved[i]; });
    surf.group.visible = false;
    res.noSurface = await gpuTime(ms);
    surf.group.visible = true;
    res.surfaceMs = +(res.full - res.noSurface).toFixed(2);
    res.waveMs = +(res.full - res.noWave).toFixed(2);
    return res;
  }

  return { surf, memory, preset, bench, filmFor, presets: PRESETS, ranger, rangerApi, people, wreck, wakes, usingModel };
}
