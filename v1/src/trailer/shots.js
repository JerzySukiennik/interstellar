// Interstellar trailer shots: each shot is data plus a small script (game chapter and bot moment, or a lookdev set-up with a directed camera move, film look and what moves in frame).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const easeOut = x => { x = Math.min(1, Math.max(0, x)); return 1 - (1 - x) * (1 - x); };
const lerp = (a, b, u) => a + (b - a) * u;
const lerpV = (a, b, u) => a.clone().lerp(b, u);

function aim(cam, pos, target, fov, up = null) {
  cam.position.copy(pos);
  if (up) cam.up.copy(up);
  cam.lookAt(target);
  if (fov && cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

async function millerKit() {
  const [{ stage }, world] = await Promise.all([import('../chapters/04-miller.js'), import('../chapters/miller/world.js')]);
  const { LZ, UPWIND, SEABED } = world;
  const SIDE = V(-UPWIND.z, 0, UPWIND.x);
  const at = (fwd, side = 0, up = 0) => LZ.clone().addScaledVector(UPWIND, fwd).addScaledVector(SIDE, side).setY(up);
  return { stage, LZ, UPWIND, SIDE, SEABED, at };
}

function undockAxisShot(camAt, fov) {
  return {
    kind: 'look', m: 'flight', params: { p: 'docked09' }, letterbox: 0, preroll: 1.0,
    setup(c) {
      const rig = c.api.rig, g = rig.player.group;
      rig.state.spin = true;
      rig.player.setLights(true);
      rig.endurance.group.rotation.z = 0.4;
      rig.endurance.group.updateMatrixWorld(true);
      rig.release(rig.player);
      c.p0 = g.position.clone(); c.q0 = g.quaternion.clone(); c.rot0 = rig.endurance.group.rotation.z;
      c.cam0 = V(...camAt); c.tgt = V(0, 0, 8);
      rig.state.exposureOverride = null;
    },
    update(c, t, dt, dur) {
      const rig = c.api.rig, g = rig.player.group, s = t + 1.0;
      rig.endurance.group.rotation.z = c.rot0 + 0.55 * s;
      g.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.55 * s)).multiply(c.q0);
      const p = c.p0.clone().applyAxisAngle(V(0, 0, 1), 0.55 * s);
      p.z += 1.2 * s + 0.9 * s * s;
      g.position.copy(p);
      const u = ease(t / dur);
      aim(rig.camera, c.cam0.clone().multiplyScalar(lerp(1.0, 0.93, u)), c.tgt.clone().add(V(0, 0, 2 * u)), fov, V(0, 1, 0));
    },
  };
}

function wadeShot(camAt, lookAt) {
  return {
    kind: 'look', m: 'miller', letterbox: 0, preroll: 1.5,
    async setup(c) {
      const K = c.K = await millerKit();
      const { createAstronaut, poseAtDistance } = await import('../models/astronaut.js');
      const ctx = c.api.ctx;
      const W0 = K.at(-120);
      c.path = [W0.clone().addScaledVector(K.UPWIND, 13).addScaledVector(K.SIDE, 1.2), W0.clone().addScaledVector(K.UPWIND, 6).addScaledVector(K.SIDE, 1.6)];
      const cam = W0.clone().addScaledVector(K.UPWIND, camAt[0]).addScaledVector(K.SIDE, camAt[1]).setY(camAt[2]);
      const tgt = K.at(lookAt[0], lookAt[1], lookAt[2]);
      const { S, W } = K.stage(ctx, 'trailer-wade', { view: 'ext', hatch: true, cam, at: tgt, fov: 34, look: 'surface', surface: 90, wx: { wind: 0.45, mist: 1 / 320, cloud: 0.6 } });
      c.S = S; c.W = W; c.cam0 = cam; c.tgt0 = tgt;
      const a = createAstronaut({ engine: c.engine, quality: c.engine.qualityName });
      a.setLight({ off: true });
      a.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      W.scene.add(a.group);
      c.astro = a; c.pose = poseAtDistance;
      for (const j of ['ankleL', 'ankleR']) W.ocean.addWake(a.joints[j], 0.3);
      for (const j of ['kneeL', 'kneeR']) W.ocean.addWake(a.joints[j], 0.2);
      c.lastPh = 0;
      await c.engine.renderer.compileAsync(W.scene, W.cam);
    },
    update(c, t, dt, dur) {
      const K = c.K, s = t + 1.5, d = s * 0.85;
      const dir = c.path[1].clone().sub(c.path[0]).normalize();
      const p = c.path[0].clone().addScaledVector(dir, d);
      c.astro.group.position.set(p.x, K.SEABED, p.z);
      c.astro.group.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      c.astro.setPose(c.pose('wade', d));
      const ph = (d / 1.24) % 1;
      if ((ph < 0.5) !== (c.lastPh < 0.5) && s > 0.1) { const foot = ph < 0.5 ? c.astro.joints.ankleR : c.astro.joints.ankleL; c.W.ocean.splash(foot.getWorldPosition(V(0, 0, 0)).setY(0), 0.9); }
      c.lastPh = ph;
      const u = ease(t / dur);
      aim(c.W.cam, c.cam0.clone().addScaledVector(K.SIDE, -0.6 * u), c.tgt0.clone().lerp(p.clone().setY(1.0), 0.25), 34, V(0, 1, 0));
    },
  };
}

function gargShot(preset, push, fov) {
  return {
    kind: 'look', m: 'gargantua', params: { shot: preset }, letterbox: 0, preroll: 0.5,
    setup(c) { c.obs0 = c.camera.position.clone(); c.tgt0 = c.controls.target.clone(); },
    update(c, t, dt, dur) {
      const u = easeOut(t / dur);
      aim(c.camera, c.obs0.clone().lerp(c.tgt0, push * u), c.tgt0, lerp(fov[0], fov[1], u));
    },
  };
}

function tessShot(view) {
  return {
    kind: 'look', m: 'tesseract', params: { view }, letterbox: 0, preroll: 1.0,
    setup(c) { c.p0 = c.camera.position.clone(); c.t0 = c.controls.target.clone(); },
    update(c, t, dt, dur) {
      const u = ease((t + 1) / (dur + 1));
      const dir = c.t0.clone().sub(c.p0).normalize();
      aim(c.camera, c.p0.clone().addScaledVector(dir, lerp(-1.2, 1.6, u)), c.t0, null, V(0, 1, 0));
    },
  };
}

export const SHOTS = {
  wake: {
    kind: 'game', ch: 'awakening', seed: 3, letterbox: 1,
    at: c => c.g.director.beat === 'lid', offset: 7.3, preroll: 0.6,
  },
  corridor: {
    kind: 'game', ch: 'awakening', seed: 3, letterbox: 1,
    at: c => c.g.director.beat === 'ring', offset: 6.0, preroll: 0.8,
  },
  spine: {
    kind: 'game', ch: 'awakening', seed: 3, letterbox: 1, fade: { in: 0.25, out: 0.25 },
    at: c => c.g.director.beat === 'ladder', offset: 2.5, preroll: 0.8,
  },
  cockpit: {
    kind: 'game', ch: 'departure', seed: 2, letterbox: 1,
    async setup(c) { const { getSpaceRig } = await import('../chapters/shared/space-rig.js'); c.rig = await getSpaceRig(c.g); },
    at: c => c.rig.cockpitRig.power.fuelCells, offset: 1.6, preroll: 0.8,
  },
  undock: undockAxisShot([12, -16, 78], 46),
  orbit: {
    kind: 'look', m: 'flight', params: { p: 'nose25' }, letterbox: 0, preroll: 1.0,
    async setup(c) {
      const sf = await import('../chapters/03-spaceflight.js');
      const { BH, planetAt } = await import('../chapters/shared/space-rig.js');
      const { BORE_INV } = await import('../chapters/shared/cockpit-rig.js');
      const rig = c.api.rig, g = rig.player.group;
      const q0w = sf.lookFrame(rig.planetDirWorld(), V(0, 1, 0)).multiply(BORE_INV);
      const q0bh = BH.S.clone().invert().multiply(q0w);
      const u = 0.985, obs = sf.transitObserver(u);
      rig.sky.setObserver(obs);
      rig.sky.setPlanet(planetAt(obs, { cover: 0.62, atmosphereGain: 0.6, light: obs.clone().negate().normalize().addScaledVector(BH.P.clone().sub(obs).normalize(), -0.75).normalize() }));
      g.quaternion.copy(BH.S).multiply(sf.transitAttitudeBh(u, q0bh));
      g.position.set(0, -0.9, 30).addScaledVector(BH.F.clone().sub(BH.E).normalize().applyQuaternion(BH.S), 9000);
      rig.endurance.group.visible = false; rig.other.group.visible = false;
      rig.player.setEngine(0.3);
      rig.state.bounce = 1.2;
      rig.state.exposureBase = 1.0; rig.state.exposureOverride = 1.0;
      rig.refreshEnv();
      g.updateMatrixWorld(true);
      c.g = g;
    },
    update(c, t, dt, dur) {
      const u = ease((t + 1.0) / (dur + 1.0));
      const m = c.g.matrixWorld;
      const pos = lerpV(V(1.1, 2.45, 0.6), V(0.7, 2.25, -1.2), u).applyMatrix4(m);
      const tgt = V(-0.6, 0.9, -40).applyMatrix4(m);
      aim(c.api.rig.camera, pos, tgt, 55, V(0, 1, 0).applyQuaternion(c.g.quaternion));
    },
  },
  wade: wadeShot([2, 5.5, 1.3], [-60, -1, 1.1]),
  wave: {
    kind: 'look', m: 'miller', letterbox: 0, preroll: 1.0,
    async setup(c) {
      const K = c.K = await millerKit();
      const cam = K.at(-22, -34, 2.6), tgt = K.at(30, 20, 15);
      const { S, W } = K.stage(c.api.ctx, 'trailer-wave', { view: 'ext', hatch: true, recorder: true, cam, at: tgt, fov: 40, look: 'wave', wave: 620, run: true, wx: { wind: 0.9, mist: 1 / 1400, cloud: 0.8, draw: 0.6 } });
      S.wave.speed = 22; W.ocean.setWave({ x: S.wave.x, speed: 22 });
      c.S = S; c.W = W; c.cam0 = cam; c.tgt0 = tgt;
    },
    update(c, t, dt, dur) {
      const u = ease(t / dur), K = c.K;
      aim(c.W.cam, c.cam0.clone().addScaledVector(K.UPWIND, 3 * u).add(V(0, -0.3 * u, 0)), lerpV(c.tgt0, K.at(30, 20, 19), u), 40, V(0, 1, 0));
    },
  },
  reveal: gargShot('12', 0.06, [23, 21]),
  dive: { kind: 'look', m: 'gargantua', params: { dive: '18.5', play: '' }, letterbox: 0, preroll: 0.3 },
  tesseract: tessShot('run'),

  hub: {
    kind: 'game', ch: 'awakening', seed: 3, letterbox: 1,
    at: c => c.g.director.beat === 'zero-g', offset: 1.0, preroll: 0.8,
  },
  revealFrontal: gargShot('11', 0.12, [16, 14]),
  tessSelf: tessShot('self'),
};
