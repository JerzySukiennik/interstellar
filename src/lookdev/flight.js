// Lookdev for the flight chapters: the shared space rig with presets that jump straight to each beat (cockpit dark and powered, undock, refs 25, 09, 10, 13, 14, first Gargantua, docking alignment, four dive stages, ejection).
import { SeatController } from '../core/controllers.js';
import { Clock, MONTH } from '../core/clock.js';
import { getSpaceRig, BH, planetAt } from '../chapters/shared/space-rig.js';
import { BORE_INV } from '../chapters/shared/cockpit-rig.js';
import { transitObserver, transitAttitudeBh, transitPitch, transitDistance, lookFrame, lowOrbitFrame, LAPSE } from '../chapters/03-spaceflight.js';
import { returnObserver, returnPath } from '../chapters/05-return.js';
import { diveObserver, diveAttitudeBh, diveLook, CROSS, DIVE_UP } from '../chapters/06-gargantua.js';

const noopLoop = { set() {}, stop() {} };
const audio = new Proxy({}, { get: (_, k) => (k === 'loop' || k === 'synth' ? () => noopLoop : k === 'has' ? () => false : () => {}) });

export const FLIGHT_PRESETS = {
  seat0: { kind: 'seat', power: 0, rot: 0.1, yaw: 0.05, pitch: -0.24 },
  seat1: { kind: 'seat', power: 1, rot: 0.1, yaw: 0.05, pitch: -0.26 },
  seat24: { kind: 'seat', power: 1, rot: 1.2, yaw: 0.55, pitch: -0.32, fov: 52 },
  undock: { kind: 'undock', power: 1, rot: 0.6, yaw: 0.3, pitch: 0.25 },
  nose25: { kind: 'nose25', power: 1 },
  docked09: { kind: 'docked09', power: 1, rot: 0.9 },
  dockview: { kind: 'seat', power: 1, rot: 3.6, yaw: 0, pitch: 0.95 },
  first: { kind: 'first', power: 1, pitch: -0.12 },
  heavy: { kind: 'heavy', power: 1, pitch: 0 },
  rear: { kind: 'transit', u: 0.13, rear: true, power: 1 },
  transit: { kind: 'transit', u: 0.45, power: 1, pitch: 0 },
  orbit13: { kind: 'transit', u: 0.985, power: 1, pitch: -0.12 },
  entry: { kind: 'transit', u: 1, entry: 0.5, power: 1 },
  glint14: { kind: 'return', u: 0.7, power: 1 },
  dockalign: { kind: 'dockalign', power: 1 },
  dive1: { kind: 'dive', t: 6 }, dive2: { kind: 'dive', t: 15 }, wall: { kind: 'dive', t: 22 }, dive3: { kind: 'dive', t: CROSS + 0.1 }, dive4: { kind: 'dive', t: 28 }, dive5: { kind: 'dive', t: 33 },
  eject: { kind: 'eject', t: 3 },
};

export default async function ({ engine, THREE, params }) {
  const clock = new Clock();
  clock.endurance = 37 * 12 * MONTH; clock.ship = 3600;
  const ctx = { engine, film: engine.film, audio, clock, state: { years: 0 }, director: null, interact: null, history: null };
  const rig = await getSpaceRig(ctx);
  const cr = rig.cockpitRig, cam = rig.camera, g = rig.player.group;
  rig.activate();
  const film = engine.film;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let seat = null, extra = null;
  const eye0 = cr.eyes.pilot.position.clone();
  engine.onUpdate((dt) => { if (seat) seat.update(dt, { look: () => ({ x: 0, y: 0 }), down: () => false, mouseDown: () => false, pressed: () => false, axis: () => ({ x: 0, y: 0 }) }); extra?.(dt); });

  const sitAt = (yaw = 0, pitch = -0.1, fov = 62) => {
    cam.fov = fov; cam.updateProjectionMatrix();
    seat = new SeatController({ camera: cam, ...cr.sit('pilot'), yaw, pitch });
  };
  const free = (pos, target, fov, up = V(0, 1, 0)) => {
    seat = null;
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.copy(pos); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld();
  };

  function set(name, over = {}) {
    const prm = { has: k => k in over || params.has(k), get: k => (k in over ? String(over[k]) : params.get(k)) };
    const P = FLIGHT_PRESETS[name] || FLIGHT_PRESETS.seat1;
    extra = null;
    cr.reset(); rig.resetSky(); rig.stopSound(); cr.setDisplayGain(1);
    rig.state.auto = true; rig.state.exposureOverride = null; rig.state.starsOverride = null; rig.state.exposureBase = 1.15; rig.state.glintAuto = true; rig.state.bounce = 0; rig.state.diskI = 0;
    rig.endurance.group.visible = true; rig.other.group.visible = true;
    rig.setAge(prm.has('age') ? +prm.get('age') : 0);
    rig.state.meter = { key: 0.16, min: 0.42, max: 1.6, up: 1.4, down: 0.9 };
    rig.setupDocked({ playerPort: 'A', otherPort: 'B' });
    rig.player.setEngine(0); rig.player.setLights(true);
    rig.endurance.group.rotation.z = +(prm.get('rot') ?? P.rot ?? 0);
    rig.state.spin = prm.has('spin');
    film.look('cockpit', 0); film.to({ letterbox: prm.has('lb') ? 1 : 0, fade: 0, streak: 0 }, 0);
    if (P.power) { cr.powerUp(['batt', 'fuelCells', 'avionics', 'rcs']); cr.setSwitch('engineStart', true, { silent: true }); }
    const yaw = +(prm.get('yaw') ?? P.yaw ?? 0), pitch = +(prm.get('pitch') ?? P.pitch ?? 0), fov = +(prm.get('fov') ?? P.fov ?? 62);
    cr.eyes.pilot.position.copy(eye0).add(V(0, 0.1, -0.2).multiplyScalar(+(prm.get('lean') || 0)));
    if (P.kind === 'seat') sitAt(yaw, pitch, fov);
    else if (P.kind === 'undock') {
      rig.release(rig.player);
      g.position.z += 9; g.rotation.z += 0.4;
      cr.setSystems({ clamps: 'RELEASED' });
      sitAt(yaw, pitch, fov);
    } else if (P.kind === 'nose25') {
      rig.release(rig.player);
      rig.endurance.group.rotation.z = 0;
      const mod = V(Math.cos(-Math.PI / 2) * 32, Math.sin(-Math.PI / 2) * 32, 0);
      g.quaternion.setFromEuler(new THREE.Euler(0.05, -0.35, 0.12));
      const camLocal = V(1.7, 3.05, -0.4), tgtLocal = V(-4.6, 1.2, -4.8);
      const dirW = tgtLocal.clone().sub(camLocal).normalize().applyQuaternion(g.quaternion);
      g.position.copy(mod).addScaledVector(dirW, -26).sub(camLocal.clone().applyQuaternion(g.quaternion)).add(V(0, 0, 8));
      g.updateMatrixWorld(true);
      free(camLocal.clone().applyMatrix4(g.matrixWorld), tgtLocal.clone().applyMatrix4(g.matrixWorld), 55, V(0, 1, 0).applyQuaternion(g.quaternion));
      placePlanet({ down: 1.05, side: -0.55, angularRadius: 1.0, cover: 0.85, lightLift: 1.3 });
      rig.state.exposureBase = 1.0;
      film.look('space', 0);
    } else if (P.kind === 'docked09') {
      rig.endurance.group.updateMatrixWorld(true);
      const m = rig.endurance.group.matrixWorld;
      free(V(6, -9, 27).applyMatrix4(m), V(-3, 9, 0).applyMatrix4(m), 56, V(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(m)));
      placePlanet({ down: 0.4, side: 0.55, angularRadius: 1.15, cover: 1.0, lightLift: 1.3 });
      rig.state.exposureBase = 1.0;
      film.look('space', 0);
    } else if (P.kind === 'first') {
      rig.release(rig.player);
      g.position.set(-12, 8, 78);
      g.quaternion.copy(lookFrame(rig.sky.lightDirection.clone(), V(0, 1, 0))).multiply(BORE_INV);
      cr.setSystems({ clamps: 'RELEASED' });
      sitAt(yaw, pitch, fov);
      film.look('space', 0, { bloomStrength: 0.2 });
      rig.state.exposureBase = 1.0;
    } else if (P.kind === 'heavy') {
      rig.release(rig.player);
      const gd = rig.sky.lightDirection.clone();
      g.position.copy(gd).multiplyScalar(-62).add(V(0, 6, 10));
      g.quaternion.copy(lookFrame(gd.clone().sub(V(0, 0.08, 0.1)).normalize(), V(0, 1, 0))).multiply(BORE_INV);
      sitAt(yaw, pitch, fov);
      rig.state.exposureBase = 1.0;
      rig.state.spin = true;
      film.look('space', 0, { bloomStrength: 0.2 });
    } else if (P.kind === 'transit') {
      rig.release(rig.player);
      const q0w = lookFrame(rig.planetDirWorld(), V(0, 1, 0)).multiply(BORE_INV);
      const q0bh = BH.S.clone().invert().multiply(q0w);
      const u = P.u, obs = transitObserver(u);
      if (P.entry) obs.copy(BH.F).addScaledVector(BH.n, -BH.Rp * 0.012 * P.entry);
      rig.sky.setObserver(obs);
      const pl = planetAt(obs, { cover: 0.62, atmosphereGain: THREE.MathUtils.lerp(1, 0.6, THREE.MathUtils.smoothstep(u, 0.6, 1)), light: u > 0.55 ? obs.clone().negate().normalize().addScaledVector(BH.P.clone().sub(obs).normalize(), -0.75 * THREE.MathUtils.smoothstep(u, 0.55, 1)).normalize() : null });
      if (P.entry) pl.angularRadius = Math.min(1.5, pl.angularRadius + P.entry * 0.3);
      rig.sky.setPlanet(pl);
      const qbh = transitAttitudeBh(u, q0bh);
      if (P.entry) qbh.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.35 * THREE.MathUtils.smoothstep(P.entry, 0, 0.8)));
      g.quaternion.copy(BH.S).multiply(qbh);
      const dir = BH.F.clone().sub(BH.E).normalize().applyQuaternion(BH.S);
      const dist = transitDistance(u * LAPSE);
      g.position.set(0, -0.9, 30).addScaledVector(dir, dist);
      rig.endurance.group.visible = dist < 15000;
      rig.other.group.visible = dist < 1500;
      rig.player.setEngine(u < 0.85 ? 1 : 0.3);
      rig.state.bounce = THREE.MathUtils.smoothstep(u, 0.6, 1) * 1.2;
      film.look('space', 0);
      rig.state.exposureBase = 1.0;
      if (u > 0.8) rig.state.exposureOverride = 1.0;
      if (P.entry) { rig.plasma.set(THREE.MathUtils.smoothstep(P.entry, 0.05, 0.6) * 0.7, 1.3); rig.state.diskI = THREE.MathUtils.smoothstep(P.entry, 0.1, 0.7) * 3; rig.diskLight.color.setRGB(1, 0.5, 0.22); rig.state.diskDir.set(0, -0.3, -1).applyQuaternion(g.quaternion).normalize().negate(); rig.state.exposureOverride = 1 + P.entry * 0.5; }
      rig.refreshEnv();
      if (P.rear) {
        g.position.set(0, -0.9, 30).addScaledVector(dir, transitDistance(+(prm.get('rt') ?? 3.2)));
        g.updateMatrixWorld(true);
        const cp = V(2.2, 6.5, 0).applyMatrix4(g.matrixWorld);
        free(cp, V(0, 1.5, 8).applyMatrix4(g.matrixWorld).lerp(rig.world.position, 0.85), 62, V(0, 1, 0).applyQuaternion(g.quaternion));
        rig.player.setEngine(1);
        rig.state.exposureOverride = 1.0; rig.state.starsOverride = 0.15;
      } else sitAt(yaw, pitch + transitPitch(u), fov);
    } else if (P.kind === 'return') {
      rig.release(rig.player);
      rig.setAge(+(prm.get('age') ?? 37));
      const u = P.u, obs = returnObserver(u);
      rig.sky.setObserver(obs);
      rig.sky.setPlanet(planetAt(obs, { cover: 0.62 }));
      g.position.copy(returnPath(u));
      g.quaternion.copy(lookFrame(rig.world.position.clone().sub(g.position).normalize(), V(0, 1, 0))).multiply(BORE_INV);
      rig.state.glintAuto = false;
      rig.state.glint = THREE.MathUtils.smoothstep(u, 0.4, 0.6) * THREE.MathUtils.smoothstep(g.position.length(), 300, 1100);
      film.look('space', 0);
      rig.state.exposureBase = 1.0;
      rig.refreshEnv();
      sitAt(yaw, pitch, fov);
    } else if (P.kind === 'dockalign') {
      rig.release(rig.player);
      rig.setAge(+(prm.get('age') ?? 37));
      g.position.set(0.6, -0.4, 38);
      g.quaternion.identity();
      cr.setMode('dock');
      cr.setDock({ offset: { x: 0.6, y: -0.4 }, range: 24.5, closing: 0.4, rollRate: 5.0, stationRate: 5.25, rollPhase: 12 });
      sitAt(yaw, pitch, fov);
      rig.state.exposureBase = 1.1;
      rig.state.spin = true;
    } else if (P.kind === 'dive' || P.kind === 'eject') {
      rig.release(rig.player);
      rig.setAge(37);
      const t = P.kind === 'dive' ? +(prm.get('t') ?? P.t) : 37;
      const q0w = lookFrame(rig.sky.lightDirection.clone(), V(0, 1, 0)).multiply(BORE_INV);
      g.quaternion.copy(q0w);
      g.position.set(0, 0, -9000);
      rig.endurance.group.visible = false; rig.other.group.visible = false;
      const obs = diveObserver(t), L = diveLook(t);
      const qbh = diveAttitudeBh(t, obs);
      rig.sky.setSkyRotation(q0w.clone().multiply(qbh.clone().invert()));
      rig.sky.setObserver(obs);
      rig.sky.setPlanet({ visible: false, direction: V(0, 0, -1), angularRadius: 0.0005 });
      rig.sky.setPlunge(L.plunge);
      cr.setFailure(L.failure);
      cr.powerUp(['batt', 'fuelCells', 'avionics', 'rcs']); rig.state.meter = { key: 0.08, min: 0.1, max: 0.24, up: 1.2, down: 1.6 }; rig.state.exposureOverride = t < 10 ? null : L.exposure; cr.setDisplayGain(t < 10 ? 1 : Math.min(60, 0.3 / L.exposure));
      rig.state.diskI = 1.5 + 22 * L.near + 900 * L.flood + 60 * L.after;
      rig.diskLight.color.setRGB(1, 0.78, 0.55);
      rig.state.diskDir.set(0, Math.sign(obs.y || 1), 0).applyQuaternion(rig.sky.skyRotation);
      if (t >= 31) rig.crack.set(THREE.MathUtils.smoothstep(t, 31, 33.5), (0.5 + 0.4 * THREE.MathUtils.smoothstep(t, 31, 40)) * Math.min(60, 0.3 / L.exposure));
      film.look('space', 0, { bloomStrength: 0.16 });
      rig.refreshEnv();
      sitAt(yaw, pitch + DIVE_UP, +(prm.get('fov') ?? 70));
      if (P.kind === 'eject') {
        const u = P.t / 6.5;
        rig.sky.setObserver(obs.clone().setLength(THREE.MathUtils.lerp(obs.length(), 1.01, Math.pow(u, 1.6))));
        rig.sky.setPlunge(THREE.MathUtils.lerp(L.plunge, 1, Math.pow(u, 1.3)));
        g.updateMatrixWorld(true);
        const eye = cr.eyes.pilot.getWorldPosition(V(0, 0, 0));
        const up = V(0, 1, 0).applyQuaternion(g.quaternion);
        free(eye.clone().addScaledVector(up, 7.5 * P.t), eye.clone().addScaledVector(up, -3).add(V(0, 0, -4).applyQuaternion(g.quaternion)), 62, V(0.4, 0.2, 1).applyQuaternion(g.quaternion));
        cr.setFailure(1); rig.crack.set(0);
        rig.state.exposureOverride = THREE.MathUtils.lerp(0.2, 0.34, THREE.MathUtils.smoothstep(u, 0.3, 1));
        rig.state.diskI = 1.6 * (1 - u);
        film.to({ streak: 0.7, bloomStrength: 0.24, halation: 0.3 }, 0);
      }
    }
    if (prm.has('exp')) rig.state.exposureOverride = +prm.get('exp');
    rig.state.exposure = rig.state.exposureOverride ?? rig.state.exposureBase;
    return name;
  }

  function placePlanet(o) {
    cam.updateMatrixWorld();
    const inv = rig.sky.skyRotation.clone().invert();
    const e = cam.matrixWorld.elements;
    const r = V(e[0], e[1], e[2]).applyQuaternion(inv), u = V(e[4], e[5], e[6]).applyQuaternion(inv), f = V(-e[8], -e[9], -e[10]).applyQuaternion(inv);
    const down = u.clone().multiplyScalar(-Math.cos(o.side)).addScaledVector(r, Math.sin(o.side));
    const dir = f.clone().multiplyScalar(Math.cos(o.down)).addScaledVector(down, Math.sin(o.down)).normalize();
    const light = rig.sky.observer.clone().normalize().negate().addScaledVector(dir, -o.lightLift).normalize();
    rig.sky.setPlanet({ direction: dir, angularRadius: o.angularRadius, cover: o.cover, light });
    rig.state.bounce = 1.0;
  }

  set(params.get('p') || 'seat1');
  await rig.compile();
  return { rig, set, presets: Object.keys(FLIGHT_PRESETS), measure: n => rig.sky.measure(n), stats: () => ({ gpuMs: +engine.gpuMs.toFixed(2), calls: engine.lastInfo.calls, tris: engine.lastInfo.triangles, exposure: engine.film.exposure, gFill: rig.state.gFill, hull: rig.state.hullFill, dm: cr.manager?.stats }) };
}
