// Chapter 6, Gargantua: the second Ranger's aft cabin, a short power-up, undock from port B, target Gargantua and burn, then the directed dive: the disk as a floor and a wall of light, the plane crossing, lensing rings, the cockpit failing display by display, the canopy cracking, the guarded eject, thrown clear into streaks of light, silence at the horizon. History spaces: Ranger local (cabin, cockpit), Endurance inertial (undock), Schwarzschild radii (dive, ejection; hole at origin, disk in XZ).
import * as THREE from 'three';
import { FloatController, SeatController, FlightController, frames } from '../core/controllers.js';
import { BORE_INV } from './shared/cockpit-rig.js';
import { getSpaceRig, SPIN, BH, seatTween, navFeed, roundVec, preloadSounds, collideEndurance, viewClear, netStage } from './shared/space-rig.js';
import { lookFrame } from './03-spaceflight.js';

export const DIVE_UP = 0.0;
export const CROSS = 25, CRACK = 31, EJECT_AT = 36, FALL_OUT = 7;
const HORIZON_FROM = 110 - CROSS;
const UPQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -DIVE_UP);
const KEYS = [[0, 30, 1.3, 0], [8, 17, 0.95, 0.25], [12, 13.5, 0.55, 0.42], [20, 9.6, 0.42, 0.82], [CROSS, 7.2, 0, 1.12], [28, 6.0, -0.75, 1.36], [33, 4.4, -1.05, 1.74], [38, 3.2, -0.95, 2.15], [52, 2.5, -0.8, 2.8]];
const SOUNDS = ['m_horizon', 'eject_blast', 'decompression', 'main_engine_ignite', 'main_engine_shutdown', 'hub_hum', 'breath_calm', 'switch_1', 'switch_3', 'switch_2', 'switch_4', 'button', 'beep', 'avionics_boot', 'cockpit_tone', 'clamp_handle', 'clamp_release', 'latch', 'rcs', 'main_engine', 'alarm', 'alarm_short', 'warn_beep', 'canopy_crack', 'breath_stress', 'heartbeat', 'buffet', 'entry_rumble', 'bump_soft', 'groan'];
let S = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp;

function cr1(a, b, c, d, u) { const u2 = u * u, u3 = u2 * u; return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3); }
export function diveObserver(t, out = new THREE.Vector3()) {
  t = clamp(t, 0, KEYS[KEYS.length - 1][0]);
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  const k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = (t - k1[0]) / (k2[0] - k1[0]);
  const r = cr1(k0[1], k1[1], k2[1], k3[1], u), y = cr1(k0[2], k1[2], k2[2], k3[2], u), ph = cr1(k0[3], k1[3], k2[3], k3[3], u);
  return out.set(r * Math.sin(ph), y, r * Math.cos(ph));
}
export function diveAttitudeBh(t, obs, out = new THREE.Quaternion()) {
  const toHole = obs.clone().negate().normalize();
  const level = toHole.clone().setY(0).normalize();
  const tangent = new THREE.Vector3(obs.z, 0, -obs.x).normalize();
  const skim = smooth(t, 9, 13) * (1 - smooth(t, 20, 24));
  const fwd = toHole.clone().lerp(level, skim).addScaledVector(tangent, 0.18 * smooth(t, 22, 27) - 0.1 * smooth(t, 30, 38));
  fwd.y -= 0.16 * smooth(t, 20, 23) * (1 - smooth(t, 24.5, 27));
  fwd.normalize();
  const roll = -1.05 * smooth(t, 23, 28) + 0.6 * smooth(t, 30, 37);
  return lookFrame(fwd, new THREE.Vector3(0, 1, 0).applyAxisAngle(fwd, roll), out).multiply(BORE_INV).multiply(UPQ);
}
const EXPO = [[0, 0.42], [12, 0.16], [20, 0.1], [23, 0.06], [24, 0.03], [25, 0.012], [27, 0.005], [40, 0.005]];
function expoAt(t) {
  let i = 0;
  while (i < EXPO.length - 2 && t > EXPO[i + 1][0]) i++;
  const [t0, e0] = EXPO[i], [t1, e1] = EXPO[i + 1], u = clamp((t - t0) / (t1 - t0), 0, 1);
  return Math.exp(Math.log(e0) + (Math.log(e1) - Math.log(e0)) * u);
}
export function diveLook(t) {
  return {
    failure: smooth(t, 15, 38), plunge: 0.9 * smooth(t, 26, 42), exposure: expoAt(t),
    flood: Math.exp(-Math.pow((t - CROSS) / 0.9, 2)), near: smooth(t, 6, CROSS) * (1 - smooth(t, CROSS, CROSS + 5)), after: smooth(t, CROSS, CROSS + 1.5),
  };
}

export default {
  id: 'gargantua',

  async load(ctx) {
    const rig = await getSpaceRig(ctx);
    const debris = new THREE.Group();
    debris.name = 'canopyDebris';
    const dm = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.55, metalness: 0.3 });
    for (let i = 0; i < 6; i++) debris.add(new THREE.Mesh(new THREE.BoxGeometry(0.7 + Math.random() * 0.5, 0.06, 0.5 + Math.random() * 0.5), dm));
    rig.scene.add(debris);
    await ctx.engine.renderer.compileAsync?.(debris, rig.camera, rig.scene);
    debris.visible = false;
    S = { rig, flags: {}, flight: null, still: 0, dive: null, burnHeld: 0, debris, port: ctx.net?.port || 'B' };
  },

  enter(ctx) {
    const { film, history, interact, audio, ui, clock } = ctx;
    const rig = S.rig, cr = rig.cockpitRig;
    preloadSounds(ctx, 'dive', SOUNDS);
    if (ctx.view) ctx.view.clear = viewClear(S.rig);
    rig.state.hold = false;
    rig.stopSound(); cr.reset(); rig.resetSky();
    rig.state.spin = true;
    rig.setAge(Math.max(ctx.state.years || 0, clock.years()));
    rig.setupDocked({ playerPort: S.port, otherPort: S.port === 'A' ? 'B' : 'A' });
    rig.endurance.group.visible = true; rig.other.group.visible = true;
    netStage(ctx, rig);
    rig.player.setEngine(0); rig.player.setLights(false); rig.player.setLOD(false); rig.other.setLights(false);
    rig.state.focus = rig.player.group;
    rig.state.exposureBase = 1.15; rig.state.exposureOverride = null; rig.state.starsOverride = null; rig.state.auto = true;
    rig.activate();
    film.look('cockpit', 0);
    film.to({ letterbox: 1, fadeColor: 0x000000, streak: 0 }, 0);
    const cfg = cr.cabin('entry');
    S.ctl = new FloatController({ camera: rig.camera, ...cfg, interact, onBump: e => audio.sfx('bump_soft', { volume: Math.min(0.6, e.speed * 0.5) }) });
    ctx.controller = S.ctl;
    cr.registerInteractables(interact, {
      seat: () => { S.flags.seat = true; cr.enable('seat', false); },
      clamp: () => { S.flags.clamp = true; },
      eject: () => { S.flags.eject = true; },
      avionics: () => { if (cr.power.avionics) { cr.setSwitch('fuelCells', true, { silent: true, snap: false }); cr.setSwitch('rcs', true, { silent: true, snap: false }); } },
    }, { enabled: ['seat'] });
    interact.setRoots([rig.player.group]);
    ui.reticle(true);
    ui.teach('float', null, { when: () => S && !S.flags.seat, doing: 'float', enough: 2.5, delay: 1.5 });
    ui.teach('steer', null, { when: () => !!S?.guideOn && !S.dive, doing: 'look', enough: 2, limit: 6 });
    ui.teach('gargantua.seat', 'float forward to the left seat', { when: () => S && !S.flags.seat, done: () => S.flags.seat, delay: 5 });
    ui.teach('gargantua.power', 'power up   use the switch that blinks amber', { when: () => S?.flags.seated, done: () => cr.power.avionics, delay: 2.5 });
    ui.teach('gargantua.clamp', 'release the docking clamp   it blinks amber', { when: () => S?.flags.seated && cr.power.booted, done: () => S.flags.clamp, delay: 2.5 });
    history.beginSegment('cabin2', { chapter: 'gargantua', space: 'cabin', mode: 'float', frame: 'ranger-local' });
    audio.ambience('hub_hum', { volume: 0.1, fade: 3 });
    audio.ambience('breath_calm', { volume: 0.16, fade: 4 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    const rig = S.rig, cr = rig.cockpitRig, c = ctx.controller;
    if (S.dive) {
      dive(ctx, dt);
      ctx.controller.update(dt, ctx.input);
      afterDive(ctx);
      const r = Math.round(rig.sky.observer.length() * 100) / 100;
      ctx.history.sample(dt, rig.sky.observer, S.camBh, S.dive.ejected ? { r } : { r, f: Math.round(cr.failure * 100) / 100 });
      return;
    }
    if (S.flight) {
      S.flight.update(dt, ctx.input);
      collideEndurance(rig, S.flight);
      const st = S.flight.state;
      cr.setFlight(st);
      rig.flightSound(st, dt);
      const aim = navFeed(rig, rig.player.group, 'GARGANTUA');
      S.burnHeld = aim.error < 2.9 && S.flight.throttle > 0.7 ? S.burnHeld + dt : 0;
      if (S.guideOn && !S.dive) ctx.ui.guide(Math.abs(S.flight.angularVelocity.z) > 0.02 ? 'the ship still turns with the station   hold [R] to stop the roll' : aim.error >= 2.9 ? 'hold [T] to turn to Gargantua' : 'aligned on Gargantua   hold [Shift] to burn');
      ctx.history.sample(dt, rig.toInertial(S.flight.position), S.flight.quaternion);
    } else if (c) { c.update(dt, ctx.input); ctx.history.sample(dt, c.position, c.quaternion); }
  },

  exit(ctx) {
    const a = ctx.audio;
    S.rig.stopSound(); S.rig.cockpitRig.silence();
    for (const id of ['hub_hum', 'breath_calm', 'breath_stress', 'heartbeat', 'buffet', 'entry_rumble']) a.ambience(id, { volume: 0, fade: 0.2 });
    a.muffle(0, 0.5);
    ctx.film.to({ streak: 0 }, 0);
    S.whoosh?.stop(0.2);
    S.offShift?.();
    S.rig.cockpitRig.setDisplayGain(1);
    S.rig.state.shadowMode = 'auto';
    S.rig.state.meter = { key: 0.16, min: 0.42, max: 1.6, up: 1.4, down: 0.9 };
    ctx.ui.hint(null);
  },

  dispose() { S.debris.removeFromParent(); S.debris.children.forEach(m => m.geometry.dispose()); S.debris.children[0]?.material.dispose(); S = null; },

  async auto(ctx, bot) {
    await bot.lookAround?.(2);
    await bot.moveTo([0, 1.1, 1.1], { tol: 0.4, vmax: 1.2 });
    await bot.use('seat');
    await bot.until(() => S.flags.seated, 20, 'seated');
    await bot.use('batt'); await bot.wait(0.6);
    await bot.use('avionics');
    await bot.until(() => S.rig.cockpitRig.power.booted, 20, 'avionics boot');
    await bot.use('clamp');
    await bot.until(() => S.flight, 20, 'undock');
    await bot.wait(2);
    ctx.input.setKey('KeyR', true);
    await bot.hold('KeyT', () => S.flight.alignError < 0.03 && Math.abs(S.flight.angularVelocity.z) < 0.02, 60, 'align on Gargantua');
    ctx.input.setKey('KeyT', true);
    await bot.hold('ShiftLeft', () => S.dive, 40, 'burn');
    bot.release('KeyT', 'KeyR');
    await bot.linger?.(8);
    await bot.until(() => S.flags.crossed, 60, 'disk cross');
    await bot.shot('gargantua');
    await bot.use('eject', { timeout: 60 });
    await bot.until(() => S.flags.horizon, 30, 'horizon');
  },
};

async function run(ctx, s) {
  const { history, audio, film, ui } = ctx;
  const rig = S.rig, cr = rig.cockpitRig;
  s.beat('cabin');
  await s.until(() => S.flags.seat);
  const seat = new SeatController({ camera: rig.camera, ...cr.sit('pilot') });
  const tw = seatTween(rig, rig.camera, seat, 1.5);
  ctx.controller = tw;
  await s.until(() => tw.done);
  ctx.controller = seat;
  S.seat = seat;
  S.flags.seated = true;
  history.event('sit', { seat: 'left', ranger: 2 });
  history.beginSegment('cockpit2', { chapter: 'gargantua', space: 'cockpit', mode: 'seat', frame: 'ranger-local' });
  s.fork(async () => { try { await ctx.director.prepare?.('tesseract'); } catch (e) { console.warn('[gargantua] tesseract prepare', e); } });
  s.beat('switches');
  cr.setChecklist([['BATT BUS', false], ['AVIONICS', false], ['CLAMP RELEASE', false]]);
  for (const id of ['batt', 'avionics']) {
    cr.enable(id, true);
    await s.until(() => cr.power[id]);
    cr.enable(id, false);
    history.event('switch', { id, ranger: 2 });
    if (id === 'batt') rig.player.setLights(true);
  }
  await s.until(() => cr.power.booted);
  cr.setChecklist([['BATT BUS', true], ['AVIONICS', true], ['CLAMP RELEASE', false]]);
  cr.setText('sideL', { title: 'COMMS', lines: ['ENDURANCE  NO CREW', 'TGT GARGANTUA', 'NO RETURN PLOT'], cursor: true });
  cr.setNav({ target: 'GARGANTUA' });
  cr.enable('clamp', true);
  await s.until(() => S.flags.clamp);
  await s.wait(0.5);
  s.beat('undock');
  audio.sfx('clamp_release', { volume: 1 });
  cr.setSystems({ clamps: 'RELEASED' });
  history.event('undock2', {});
  history.snapshot('undock2');
  audio.ambience('hub_hum', { volume: 0, fade: 3 });
  const g = rig.player.group;
  rig.release(g);
  const wWorld = new THREE.Vector3(0, 0, SPIN);
  const v = new THREE.Vector3().crossVectors(wWorld, g.position).add(new THREE.Vector3(0, 0, S.port === 'A' ? 0.32 : -0.32));
  S.flight = new FlightController({ body: g, camera: rig.camera, eye: cr.eyes.pilot, interact: ctx.interact, preset: 'space', velocity: v, angularVelocity: wWorld.clone().applyQuaternion(g.quaternion.clone().invert()), alignTarget: () => cr.alignDir(g.quaternion, rig.sky.lightDirection), rotAccel: 0.3, maxRate: 0.6 });
  S.flight.head.yaw = seat.yaw; S.flight.head.pitch = seat.pitch;
  ctx.controller = S.flight;
  history.beginSegment('undock2', { chapter: 'gargantua', space: 'orbit', mode: 'fly', frame: 'endurance-inertial' });
  s.beat('target');
  s.fork(async k => { await k.wait(3); if (!S.dive) S.guideOn = true; });
  await s.until(() => S.burnHeld > 1.2);
  S.guideOn = false;
  ui.hint(null); ui.guide(null);
  s.beat('dive');
  history.event('burn_start', { target: 'gargantua', p: roundVec(g.position) });
  history.snapshot('dive_start');
  audio.music('m_horizon', { fade: 2.5, volume: 1, from: HORIZON_FROM });
  film.look('space', 4, { bloomStrength: 0.16 });
  film.to({ exposure: film.exposure }, 0);
  film.to({ letterbox: 0 }, 3.5);
  const q0w = g.quaternion.clone(), S0 = rig.sky.skyRotation.clone();
  S.dive = { t: 0, q0w, q0bh: S0.clone().invert().multiply(q0w), p0: rig.toInertial(g.position), fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(q0w), lastObs: BH.E.clone() };
  S.camBh = new THREE.Quaternion();
  S.flight.controls = false; S.flight.enabled = false;
  const ds = new SeatController({ camera: rig.camera, ...cr.sit('pilot'), yaw: S.flight.head.yaw, pitch: S.flight.head.pitch });
  rig.camera.fov = 70; rig.camera.updateProjectionMatrix();
  rig.state.meter = { key: 0.08, min: 0.1, max: 0.24, up: 1.2, down: 1.6 };
  S.dive.seat = ds; S.dive.pitch0 = ds.pitch; S.dive.yaw0 = ds.yaw; S.dive.steer = true;
  ctx.controller = ds;
  rig.state.auto = true;
  history.beginSegment('dive', { chapter: 'gargantua', space: 'gargantua', mode: 'seat', frame: 'schwarzschild' });
  const offFail = cr.onFail((id, index) => {
    history.event('display_fail', { id, index });
    if (index === 0 || index === 11) history.snapshot(index === 0 ? 'first_failure' : 'last_failure');
  });
  audio.ambience('breath_stress', { volume: 0.0, fade: 1 });
  await s.until(() => S.dive.t >= 10);
  history.snapshot('disk_floor');
  audio.ambience('breath_stress', { volume: 0.35, fade: 6 });
  audio.ambience('buffet', { volume: 0.25, fade: 6 });
  await s.until(() => S.dive.t >= 17.5);
  history.snapshot('disk_wall');
  await s.until(() => rig.sky.observer.y <= 0);
  S.flags.crossed = true;
  history.event('disk_cross', { r: Math.round(rig.sky.observer.length() * 100) / 100 });
  history.snapshot('disk_cross');
  const rumble = audio.loop('entry_rumble', { volume: 0.9, fade: 0.4 });
  s.fork(async k => { await k.wait(3.5); rumble.stop(3); });
  audio.ambience('heartbeat', { volume: 0.45, fade: 3 });
  await s.until(() => S.dive.t >= CRACK);
  rig.crack.set(0.05);
  audio.sfx('canopy_crack', { volume: 1 });
  history.event('canopy_crack', { r: Math.round(rig.sky.observer.length() * 100) / 100 });
  history.snapshot('lensing');
  await s.until(() => S.dive.t >= EJECT_AT);
  cr.enable('eject', true);
  s.fork(async k => { await k.wait(4); if (!S.flags.eject) ui.guide('eject   look down for the handle and hold [E]'); });
  await s.until(() => S.flags.eject);
  offFail();
  ui.hint(null); ui.guide(null);
  s.beat('eject');
  const r = rig.sky.observer.length();
  const gq = rig.player.group.getWorldQuaternion(new THREE.Quaternion());
  const inv = rig.sky.skyRotation.clone().invert();
  const dirBh = new THREE.Vector3(0, 1, 0).applyQuaternion(gq).applyQuaternion(inv);
  const qBh = inv.clone().multiply(gq);
  history.event('eject', { r: Math.round(r * 100) / 100, dir: roundVec(dirBh, 1000), rangerQ: qBh.toArray().map(v => Math.round(v * 1000) / 1000), frame: 'schwarzschild' });
  history.snapshot('eject');
  if (audio.has?.('eject_blast')) { audio.sfx('eject_blast', { volume: 1 }); audio.sfx('decompression', { volume: 0.9 }); }
  else { audio.sfx('canopy_crack', { volume: 1, rate: 0.8 }); audio.sfx('clamp_release', { volume: 1, rate: 0.7 }); S.whoosh = audio.synth('whoosh', { volume: 0.5, fade: 0.2, freq: 500 }); }
  audio.muffle(0.55, 0.3);
  audio.ambience('buffet', { volume: 0, fade: 0.4 });
  audio.ambience('breath_stress', { volume: 0.7, fade: 0.5 });
  eject(ctx);
  history.beginSegment('ejected', { chapter: 'gargantua', space: 'gargantua', mode: 'float', frame: 'schwarzschild' });
  film.to({ bloomStrength: 0.24 }, 2);
  await s.until(() => S.dive.ejected.t >= FALL_OUT * 0.55);
  history.snapshot('streaks');
  await s.until(() => S.dive.ejected.t >= FALL_OUT);
  S.flags.horizon = true;
  history.event('horizon', { r: Math.round(rig.sky.observer.length() * 1000) / 1000 });
  audio.music(null, { fade: 0.04 });
  audio.stopAll?.(0.04);
  S.whoosh?.stop(0.04);
  rig.cockpitRig.silence();
  film.to({ fade: 1 }, 0.12);
  await s.wait(2.2);
  ctx.director.next({ fade: 0.05, fadeIn: 3 });
}

function eject(ctx) {
  const rig = S.rig, D = S.dive, cam = rig.camera;
  const g = rig.player.group;
  g.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion);
  const p = cam.getWorldPosition(new THREE.Vector3()), q = cam.getWorldQuaternion(new THREE.Quaternion());
  const ctl = new FloatController({ camera: cam, frame: frames.flat(), preset: 'suit', position: p, quaternion: q, velocity: up.clone().multiplyScalar(11).addScaledVector(fwd, -2.5), interact: ctx.interact });
  ctl.tumble = new THREE.Vector3(2.4, 0.9, 3.1);
  const yTop = rig.player.shape?.yTop || (() => 2.3);
  const deb = S.debris;
  deb.visible = true;
  deb.children.forEach((m, i) => {
    const x = (i % 3 - 1) * 0.9, z = -2.4 + Math.floor(i / 3) * 1.3;
    m.position.set(x, yTop(x, z) + 0.05, z).applyMatrix4(g.matrixWorld);
    m.quaternion.copy(g.quaternion);
    m.userData.v = up.clone().multiplyScalar(9 + Math.random() * 6).addScaledVector(fwd, -1 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4));
    m.userData.w = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
  });
  D.ejected = { t: 0, ctl, rv: up.clone().multiplyScalar(-6).addScaledVector(fwd, 3), rw: new THREE.Vector3(0.5, 0.2, 0.8), obs0: rig.sky.observer.clone(), plunge0: rig.sky.plunge };
  S.offShift = rig.onShift(d => { ctl.position.sub(d); for (const m of deb.children) m.position.sub(d); });
  ctx.controller = ctl;
  rig.cockpitRig.setFailure(1);
  rig.crack.set(0);
  rig.state.focus = g;
  rig.state.shadowMode = 'tight';
}

function dive(ctx, dt) {
  const rig = S.rig, D = S.dive, sky = rig.sky, cr = rig.cockpitRig, g = rig.player.group;
  const E = D.ejected;
  if (!E) D.t += dt;
  const t = D.t;
  const L = diveLook(t);
  const obs = diveObserver(t);
  if (E) {
    E.t += dt;
    const u = clamp(E.t / FALL_OUT, 0, 1);
    obs.copy(E.obs0).setLength(THREE.MathUtils.lerp(E.obs0.length(), 1.01, Math.pow(u, 1.6)));
    sky.setPlunge(THREE.MathUtils.lerp(E.plunge0, 1, Math.pow(u, 1.3)));
    const settle = smooth(E.t, FALL_OUT - 2.2, FALL_OUT - 0.6);
    E.ctl.tumble.multiplyScalar(Math.exp(-dt * (0.5 + 4 * settle)));
    const tq = _q.setFromEuler(new THREE.Euler(E.ctl.tumble.x * dt, E.ctl.tumble.y * dt, E.ctl.tumble.z * dt));
    E.ctl.quaternion.multiply(tq);
    if (E.t < 1.2) { const k = 0.05 * (1 - E.t / 1.2); E.ctl.quaternion.multiply(_q2.setFromEuler(new THREE.Euler((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k))); }
    g.position.addScaledVector(E.rv, dt);
    g.quaternion.multiply(_q2.setFromEuler(new THREE.Euler(E.rw.x * dt, E.rw.y * dt, E.rw.z * dt)));
    for (const m of S.debris.children) { m.position.addScaledVector(m.userData.v, dt); m.quaternion.multiply(_q2.setFromEuler(new THREE.Euler(m.userData.w.x * dt, m.userData.w.y * dt, m.userData.w.z * dt))); }
    const spin = E.ctl.tumble.length();
    ctx.film.streak = clamp(spin / 2.2, 0, 1) * (1 - settle) + settle;
    ctx.film.halation = 0.3;
    rig.state.exposureOverride = THREE.MathUtils.lerp(0.2, 0.34, smooth(u, 0.3, 1));
    rig.state.diskI = 1.6 * (1 - u);
  } else {
    if (D.steer) {
      const l = ctx.input.look();
      if (Math.abs(l.x) + Math.abs(l.y) > 0.004) D.steer = false;
      const k = smooth(t, 0, 6);
      D.seat.pitch = THREE.MathUtils.lerp(D.pitch0, DIVE_UP, k); D.seat.yaw = THREE.MathUtils.lerp(D.yaw0, 0, k);
      if (t > 6) D.steer = false;
    }
    sky.setPlunge(L.plunge);
    cr.setFailure(L.failure);
    rig.state.exposureOverride = t < 10 ? null : L.exposure;
    cr.setDisplayGain(clamp(0.3 / Math.max(ctx.film.exposure, 1e-3), 1, 60));
    const qbh = diveAttitudeBh(t, obs, _q2);
    const qs = _q.copy(D.q0bh).slerp(qbh, smooth(t, 0, 5));
    sky.setSkyRotation(new THREE.Quaternion().copy(D.q0w).multiply(qs.clone().invert()));
    const dist = 30 * t * t;
    rig.toLocal(_w.copy(D.p0).addScaledVector(D.fwd, dist), g.position);
    rig.endurance.group.visible = dist < 6000;
    if (!rig.state.netShip) rig.other.group.visible = dist < 1500;
    const crack = rig.crack;
    if (t >= CRACK) crack.set(smooth(t, CRACK, CRACK + 2.5), (0.5 + 0.4 * smooth(t, CRACK, 40)) * clamp(0.3 / Math.max(ctx.film.exposure, 1e-3), 1, 60));
    D.shake = 0.0015 + 0.006 * L.near + 0.02 * L.flood + 0.004 * smooth(t, CROSS, 34);
    rig.state.diskI = 1.5 + 22 * L.near + 900 * L.flood + 60 * L.after;
    rig.player.setEngine(clamp(1 - t / 6, 0, 1));
    rig.flightSound({ throttle: clamp(1 - t / 6, 0, 1) }, dt);
  }
  sky.setObserver(obs);
  sky.setPlanet({ visible: false, direction: BH.P.clone().sub(obs).normalize(), angularRadius: 0.0005 });
  rig.diskLight.color.setRGB(1, 0.78, 0.55);
  rig.state.diskDir.set(0, Math.sign(obs.y || 1), 0).applyQuaternion(sky.skyRotation);
  rig.state.starsOverride = null;
  if (D.lastObs.distanceTo(obs) > Math.max(0.3, obs.length() * 0.08)) { D.lastObs.copy(obs); rig.state.envDirty = true; }
}

function afterDive(ctx) {
  const rig = S.rig, D = S.dive, cam = rig.camera;
  const k = D.ejected ? 0 : D.shake || 0;
  if (k > 0) { cam.quaternion.multiply(_q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k))); cam.updateMatrixWorld(); }
  S.camBh.copy(rig.sky.skyRotation).invert().multiply(cam.getWorldQuaternion(_q));
}
