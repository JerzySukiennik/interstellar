// Chapter 5, Return (to port A, or mirrored to port B for the co-op second pilot): out of the white cloud above Miller, ascent time-lapse with the clock settling back to one, the aged Endurance as a glint, docking by getting in front of the hub (by hand or with the held assist), automatic capture with roll match and a tail-first close, unstrap, float aft, open the hatch. History spaces: Endurance inertial (transit, docking), Ranger local (docked cockpit, cabin).
import * as THREE from 'three';
import { FlightController, SeatController, FloatController } from '../core/controllers.js';
import { TRANSIT } from '../core/clock.js';
import { BORE_INV } from './shared/cockpit-rig.js';
import { getSpaceRig, BH, SPIN, planetAt, navFeed, roundVec, preloadSounds, collideEndurance, viewClear, netStage } from './shared/space-rig.js';
import { lookFrame, lowOrbitFrame } from './03-spaceflight.js';

export const LAPSE = 16, CLIMB = 4.5, CLOSE = 8;
const DOCK_PEAK = 180;
export const WINDOW = { lateral: 6, near: 22, far: 110, speed: 4.5, align: 0.45, hold: 46 };
export const START = new THREE.Vector3(-2600, 900, -5200), CTRL = new THREE.Vector3(-3400, 600, 1800), APPROACH = new THREE.Vector3(7, -5, 92);
const SOUNDS = ['buffet', 'entry_rumble', 'rcs', 'main_engine', 'docking_latch', 'latch', 'beep', 'beep_double', 'hatch_servo', 'bump_soft', 'cockpit_tone', 'switch_off', 'breath_calm', 'main_engine_ignite', 'main_engine_shutdown', 'm_transit'];
const RPM = 60 / (Math.PI * 2);
let S = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const smooth = THREE.MathUtils.smoothstep;
const ease = u => u * u * (3 - 2 * u);
const mz = v => { if (S.sz < 0) { v.x = -v.x; v.z = -v.z; } return v; };

export function returnObserver(u, out = new THREE.Vector3()) {
  const e = ease(THREE.MathUtils.clamp(u, 0, 1));
  const C = BH.P.clone().addScaledVector(BH.n, BH.Rp * 14).addScaledVector(BH.E.clone().sub(BH.P), 0.3);
  const k = 1 - e;
  return out.set(0, 0, 0).addScaledVector(BH.F, k * k).addScaledVector(C, 2 * k * e).addScaledVector(BH.E, e * e);
}
export function returnPath(u, out = new THREE.Vector3()) {
  const e = 1 - Math.pow(1 - THREE.MathUtils.clamp(u, 0, 1), 2.4);
  const k = 1 - e;
  return out.set(0, 0, 0).addScaledVector(START, k * k).addScaledVector(CTRL, 2 * k * e).addScaledVector(APPROACH, e * e);
}

export default {
  id: 'return',

  async load(ctx) {
    const rig = await getSpaceRig(ctx);
    const port = ctx.net?.port || 'A';
    S = { rig, flags: {}, phase: 'climb', t: 0, port, sz: port === 'A' ? 1 : -1 };
  },

  enter(ctx) {
    const { film, history, interact, audio, clock } = ctx;
    const rig = S.rig, cr = rig.cockpitRig;
    preloadSounds(ctx, 'flight', SOUNDS);
    if (ctx.view) ctx.view.clear = viewClear(S.rig);
    rig.state.hold = false;
    rig.stopSound(); cr.reset(); rig.resetSky();
    rig.state.spin = true;
    S.years = clock.years();
    rig.setAge(S.years);
    rig.setupDocked({ playerPort: S.port, otherPort: S.port === 'A' ? 'B' : 'A' });
    rig.release(rig.player.group);
    rig.endurance.group.visible = true; rig.other.group.visible = true;
    netStage(ctx, rig);
    rig.player.setLights(true); rig.player.setEngine(0.6); rig.player.setLOD(false);
    cr.powerUp(['batt', 'fuelCells', 'avionics', 'rcs']);
    cr.setSwitch('engineStart', true, { silent: true });
    cr.setSystems({ clamps: 'READY', engines: ctx.state.waveHit ? ['RUN', 'FAULT'] : 'RUN' });
    cr.setText('sideL', { title: 'COMMS', lines: ['ENDURANCE  NO CARRIER', 'HAILING...', `MET ${clock.format.ymd(clock.endurance)}`], cursor: true });
    cr.setMode('nav');
    if (clock.rate > 1.01) clock.rampTo(1, CLIMB + 3);
    rig.activate();
    rig.state.focus = rig.player.group;
    rig.state.auto = true; rig.state.exposureBase = 1.0; rig.state.exposureOverride = 1.3; rig.state.starsOverride = 0;
    film.look('space', 0, { bloomStrength: 0.12 });
    film.to({ letterbox: 0, fadeColor: 0xf2f0ea, fade: 1 }, 0);
    const g = rig.player.group;
    rig.toLocal(mz(START.clone()), g.position);
    rig.sky.setObserver(BH.F);
    S.q0bh = lowOrbitFrame(BH.F, new THREE.Quaternion(), { pitch: -0.05, roll: 0.25 }).multiply(BORE_INV);
    g.quaternion.copy(rig.sky.skyRotation).multiply(S.q0bh);
    S.flight = new FlightController({ body: g, camera: rig.camera, eye: cr.eyes.pilot, interact, preset: 'space', alignTarget: new THREE.Vector3(0, 0, -S.sz), rotAccel: 0.55, maxRate: 0.7 });
    S.flight.controls = false;
    S.seat = new SeatController({ camera: rig.camera, ...cr.sit('pilot') });
    ctx.controller = S.seat;
    cr.registerInteractables(interact, {
      seat: () => { S.flags.unstrap = true; },
      hatch: () => { S.flags.hatch = true; },
    }, { enabled: [] });
    cr.setLabel('seat', 'release the harness');
    interact.setRoots([g]);
    ctx.ui.reticle(false);
    ctx.ui.teach('steer', null, { when: () => S?.phase === 'dock' && S.flight.controls, doing: 'look', enough: 2, delay: 1.5, limit: 6 });
    ctx.ui.teach('return.unstrap', 'docked   press [E] to release the harness', { when: () => S?.phase === 'docked', done: () => S.flags.unstrap, delay: 3.5 });
    ctx.ui.teach('float', null, { when: () => S?.phase === 'cabin', doing: 'float', enough: 2.5, delay: 1.5 });
    ctx.ui.teach('return.hatch', 'float to the rear hatch', { when: () => S?.phase === 'cabin', done: () => S.flags.hatch, delay: 4 });
    history.beginSegment('return-transit', { chapter: 'return', space: 'transit', mode: 'fly', frame: 'endurance-inertial' });
    audio.ambience('buffet', { volume: 0.6, fade: 0.2 });
    audio.ambience('entry_rumble', { volume: 0.5, fade: 0.2 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    S.t += dt;
    const rig = S.rig, f = S.flight, cr = rig.cockpitRig;
    if (S.phase === 'climb' || S.phase === 'lapse') lapse(ctx, dt);
    else if (S.phase === 'dock' || S.phase === 'lock') {
      dockAssist(ctx, dt);
      f.update(dt, ctx.input);
      collideEndurance(S.rig, f);
      dockFeed(ctx);
      rig.flightSound(S.assist ? { ...f.state, rcs: S.assistRcs } : f.state, dt);
      dockGuide(ctx);
    } else if (S.phase === 'close') { close(ctx, dt); dockFeed(ctx); }
    if (ctx.controller !== f) ctx.controller.update(dt, ctx.input);
    if (S.phase === 'docked' && S.canUnstrap && !S.flags.unstrap && ctx.input.pressed('KeyE')) S.flags.unstrap = true;
    if (S.phase === 'climb' || S.phase === 'lapse' || S.phase === 'dock' || S.phase === 'lock') cr.setFlight(f.state);
    const c = ctx.controller, g = rig.player.group;
    if (S.phase === 'docked' || S.phase === 'cabin') ctx.history.sample(dt, c.position, c.quaternion);
    else ctx.history.sample(dt, rig.toInertial(g.getWorldPosition(_v), _v), g.getWorldQuaternion(_q));
  },

  exit(ctx) { S.rig.stopSound(); ctx.audio.ambience('buffet', { volume: 0, fade: 0.5 }); ctx.audio.ambience('entry_rumble', { volume: 0, fade: 0.5 }); ctx.ui.hint(null); ctx.ui.guide(null); ctx.ui.mark(null); },

  dispose() { S = null; },

  async auto(ctx, bot) {
    await bot.until(() => S.phase === 'lapse', 60, 'breakout');
    await bot.lookAround?.(3);
    await bot.until(() => S.t > CLIMB + LAPSE * 0.6, 60, 'glint');
    bot.sight?.(() => S.rig.world.position, 4);
    await bot.until(() => S.phase === 'dock', 60, 'arrival');
    bot.speed(5);
    await bot.hold('KeyT', () => S.phase !== 'dock', 240, 'docking assist');
    await bot.until(() => S.phase === 'docked', 80, 'docked');
    bot.speed(10);
    await bot.wait(1.5);
    await bot.lookAround?.(3);
    await bot.shot('return');
    await bot.use('seat');
    await bot.until(() => S.phase === 'cabin', 10, 'unstrapped');
    await bot.moveTo([0, 1.1, 5.0], { tol: 0.45, vmax: 1.2 });
    await bot.use('hatch');
  },
};

function lapse(ctx, dt) {
  const rig = S.rig, f = S.flight, sky = rig.sky, g = f.body;
  const tl = Math.max(0, S.t - CLIMB);
  const u = S.phase === 'lapse' ? Math.min(1, tl / LAPSE) : 0;
  const k = S.phase === 'lapse' ? Math.min(dt, Math.max(0, LAPSE - (tl - dt))) / LAPSE : 0;
  if (k > 0) ctx.clock.advance(TRANSIT.ship * k, TRANSIT.endurance * k);
  const climbObs = BH.F.clone().addScaledVector(BH.n, BH.Rp * 0.12 * Math.min(1, S.t / CLIMB));
  const obs = S.phase === 'climb' ? climbObs : returnObserver(u).lerp(climbObs, 1 - smooth(u, 0, 0.04));
  sky.setObserver(obs);
  const lift = 1 - smooth(u, 0.1, 0.5);
  sky.setPlanet(planetAt(obs, { cover: 0.62, atmosphereGain: 0.6 + 0.4 * (1 - lift), light: lift > 0.02 ? obs.clone().negate().normalize().addScaledVector(BH.P.clone().sub(obs).normalize(), -0.75 * lift).normalize() : null }));
  if (!S.lastObs || S.lastObs.distanceTo(obs) > 0.4) { S.lastObs = obs.clone(); rig.state.envDirty = true; }
  const p = mz(returnPath(u, _v));
  const ahead = mz(returnPath(Math.min(1, u + 0.02), _w)).sub(p);
  S.rig.toLocal(p, g.position);
  const qTravel = lookFrame(ahead.lengthSq() > 1e-6 ? ahead.clone().normalize() : new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Quaternion());
  const toEnd = lookFrame(new THREE.Vector3().copy(rig.world.position).sub(g.position).normalize(), new THREE.Vector3(0, 1, 0));
  const qa = new THREE.Quaternion().copy(sky.skyRotation).multiply(S.q0bh).slerp(qTravel, smooth(u, 0.15, 0.5)).slerp(toEnd, smooth(u, 0.6, 0.95));
  g.quaternion.copy(qa);
  const shake = S.phase === 'climb' ? 0.01 * (1 - S.t / CLIMB) : 0;
  if (shake > 0) g.quaternion.multiply(_q2.setFromEuler(new THREE.Euler((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)));
  if (u < 1) f.velocity.copy(ahead).multiplyScalar(40);
  else f.velocity.set(0, 0, -0.6).applyQuaternion(g.quaternion);
  f.angularVelocity.set(0, 0, 0);
  f.throttle = S.phase === 'climb' ? 1 : 1 - smooth(u, 0.2, 0.5);
  rig.player.setEngine(f.throttle);
  rig.plasma.set((1 - smooth(S.t, 0, CLIMB * 0.7)) * 1.6, S.t);
  rig.state.bounce = (1 - smooth(u, 0.2, 0.6)) * 1.2;
  rig.state.diskI = 0;
  rig.state.exposureOverride = u < 0.5 ? THREE.MathUtils.lerp(1.3, 1.0, smooth(S.t, 0, CLIMB)) : null;
  rig.state.starsOverride = u < 0.4 ? 0 : null;
  rig.state.glintAuto = false;
  const dE = g.position.distanceTo(rig.world.position);
  rig.state.glint = smooth(u, 0.4, 0.6) * smooth(dE, 300, 1100);
  f.update(0, ctx.input);
  navFeed(rig, g, 'ENDURANCE', { closing: f.velocity.length() });
  rig.flightSound({ throttle: f.throttle * 0.7 }, dt);
}

function dockAssist(ctx, dt) {
  const rig = S.rig, f = S.flight;
  const p = mz(rig.toInertial(f.body.position, _v));
  const lock = S.phase === 'lock';
  S.assist = lock || (f.controls && ctx.input.down('KeyT'));
  if (lock) { S.lockT += dt; f.rollTarget = _w.set(0, 0, SPIN).applyQuaternion(_q.copy(f.quaternion).invert()).z; } else f.rollTarget = 0;
  f.assist.rollNullLatch = S.assist;
  f.assist.alignLatch = lock;
  S.assistAct = 0;
  (S.assistRcs ||= new THREE.Vector3()).set(0, 0, 0);
  if (!S.assist) return;
  const backOff = !lock && p.z < WINDOW.near + 2;
  const want = _w.set(backOff ? 0 : -p.x, backOff ? 0 : -p.y, (lock ? S.lockZ : WINDOW.hold) - p.z).multiplyScalar(lock ? 0.9 : 0.4);
  const vmax = lock ? 2.2 : 5;
  if (want.length() > vmax) want.setLength(vmax);
  mz(want);
  S.assistAct = Math.min(1, want.distanceTo(f.velocity) * 0.5);
  S.assistRcs.copy(want).sub(f.velocity).applyQuaternion(_q.copy(f.quaternion).invert());
  if (S.assistRcs.length() > 1e-3) S.assistRcs.setLength(S.assistAct);
  f.velocity.lerp(want, 1 - Math.exp(-dt * (lock ? 2.4 : 1.2)));
}

function inWindow(p, f) {
  return Math.hypot(p.x, p.y) < WINDOW.lateral && p.z > WINDOW.near && p.z < WINDOW.far && f.alignError < WINDOW.align && f.velocity.length() < WINDOW.speed;
}

function dockWindow() { return inWindow(mz(S.rig.toInertial(S.flight.body.position)), S.flight); }

function lockReady() {
  const f = S.flight, p = mz(S.rig.toInertial(f.body.position));
  return Math.hypot(p.x, p.y) < 0.8 && Math.abs(p.z - S.lockZ) < 1.2 && f.velocity.length() < 0.5 && f.alignError < 0.05 && Math.abs(f.angularVelocity.z - f.rollTarget) < 0.03;
}

function dockGuide(ctx) {
  const rig = S.rig, ui = ctx.ui, f = S.flight;
  if (S.phase === 'lock') { ui.guide('docking computer has control   let go'); ui.mark(null); return; }
  const p = mz(rig.toInertial(f.body.position));
  const range = p.length();
  const lat = Math.hypot(p.x, p.y);
  ui.guide(S.abort ? 'too close   [S] back off' : S.assist ? 'docking assist   keep holding [T]' : lat < WINDOW.lateral && p.z > WINDOW.near && p.z < WINDOW.far ? (f.velocity.length() >= WINDOW.speed ? 'slow down   hold [T] for docking assist' : 'face the hub   hold [T] for docking assist') : 'get in front of the hub   hold [T] for docking assist');
  ui.mark(rig.camera, rig.world.position, 'Endurance', `${range < 1000 ? Math.round(range) + ' m' : (range / 1000).toFixed(1) + ' km'}`, { hideWithin: range < 400 ? 9 : 0 });
}

function dockFeed(ctx) {
  const rig = S.rig, f = S.flight, cr = rig.cockpitRig;
  const lp = rig.toInertial(rig.player.group.getWorldPosition(new THREE.Vector3()));
  const q = rig.player.group.getWorldQuaternion(new THREE.Quaternion());
  const right = _v.set(1, 0, 0).applyQuaternion(q), up = _w.set(0, 1, 0).applyQuaternion(q);
  const off = new THREE.Vector3(lp.x, lp.y, 0);
  mz(lp);
  const own = S.phase === 'close' ? SPIN : new THREE.Vector3().copy(f.angularVelocity).applyQuaternion(q).z;
  const roll = Math.atan2(up.x, up.y) + rig.endurance.group.rotation.z;
  const range = S.phase === 'close' ? S.closeRange : Math.max(0, lp.z - 13.5);
  const lat = Math.hypot(lp.x, lp.y);
  S.abort = S.phase === 'dock' && lp.z < 20 && lat < 10;
  const state = S.phase === 'close' ? (S.closeT > CLOSE - 0.5 ? 'LATCHED' : 'AUTO CLOSE') : S.phase === 'lock' ? 'CAPTURE' : S.abort ? 'ABORT  BACK OFF' : lat < WINDOW.lateral && lp.z > WINDOW.near && lp.z < WINDOW.far ? 'IN WINDOW' : 'ALIGN AXIS';
  cr.setDock({ offset: { x: off.dot(right), y: off.dot(up) }, range, closing: S.phase === 'close' ? S.closeSpeed : -f.velocity.z * S.sz, rollRate: Math.abs(own) * RPM, stationRate: SPIN * RPM, rollPhase: THREE.MathUtils.radToDeg(roll), matched: S.phase !== 'dock' && Math.abs(Math.abs(own) - SPIN) < 0.05, autoRoll: S.phase === 'dock', alignTolerance: WINDOW.lateral, state });
}

function close(ctx, dt) {
  const rig = S.rig, c = S.closeFrom, g = rig.player.group;
  S.closeT = Math.min(CLOSE, S.closeT + dt);
  const t = S.closeT;
  const a = ease(THREE.MathUtils.clamp(t / 3.2, 0, 1)), b = ease(THREE.MathUtils.clamp((t - 2.6) / (CLOSE - 2.6), 0, 1));
  const hold = c.p.clone(); hold.z = S.sz * (Math.max(c.p.z * S.sz, 24) + 1.5);
  const pos = c.p.clone().lerp(hold, a).lerp(S.dockPose.position, b);
  g.position.copy(pos);
  g.quaternion.copy(c.q).multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * a));
  g.quaternion.slerp(S.dockPose.quaternion, b);
  S.closeRange = Math.max(0, (pos.z - S.dockPose.position.z) * S.sz);
  S.closeSpeed = S.prevZ != null ? (S.prevZ - pos.z) * S.sz / Math.max(dt, 1e-3) : 0;
  S.prevZ = pos.z;
  const turn = t < 1.3 ? 1 : t > 1.9 && t < 3.2 ? -1 : 0, push = t > 2.7 && t < 4.4 ? 1 : t > CLOSE - 1.9 && t < CLOSE - 0.4 ? -1 : 0;
  rig.flightSound({ quaternion: g.quaternion, throttle: 0, rcs: _v.set(0, 0, push * 0.8), angAccel: _w.set(0, turn * 0.9, 0) }, dt);
  const mark = [20, 10, 5, 2, 1].filter(m => S.closeRange <= m).length;
  if (S.lastMark != null && mark > S.lastMark) { ctx.audio.sfx('beep', { volume: 0.2 }); rig.cockpitRig.setText('sideL', { title: 'DOCKING', lines: [`RANGE ${S.closeRange.toFixed(1)} M`, `CLOSING ${S.closeSpeed.toFixed(2)} M/S`, 'ROLL MATCHED'], cursor: false }); }
  S.lastMark = mark;
  S.flight.update(0, ctx.input);
}

async function run(ctx, s) {
  const { history, audio, film, clock, ui } = ctx;
  const rig = S.rig, cr = rig.cockpitRig, f = S.flight;
  s.beat('climb');
  film.to({ fade: 0 }, 3.2);
  s.fork(async k => { await k.wait(1.2); audio.music('m_transit', { fade: 4, volume: 0.6 }); });
  await s.until(() => S.t >= CLIMB);
  audio.ambience('buffet', { volume: 0, fade: 2 });
  audio.ambience('entry_rumble', { volume: 0, fade: 3 });
  film.to({ fadeColor: 0x000000 }, 0);
  history.snapshot('breakout');
  S.phase = 'lapse';
  s.beat('lapse');
  await s.until(() => S.t >= CLIMB + LAPSE * 0.72);
  history.snapshot('endurance_glint');
  await s.until(() => S.t >= CLIMB + LAPSE);
  rig.state.glintAuto = true;
  rig.state.exposureOverride = null; rig.state.starsOverride = null;
  rig.refreshEnv();
  S.phase = 'dock';
  f.controls = true;
  f.head.yaw = S.seat.yaw; f.head.pitch = S.seat.pitch;
  ctx.controller = f;
  rig.player.setEngine(0);
  cr.setMode('dock');
  audio.music(null, { fade: 6 });
  audio.music('m_dock', { fade: 5, volume: 0.8, from: DOCK_PEAK - 100 });
  history.beginSegment('docking', { chapter: 'return', space: 'orbit', mode: 'fly', frame: 'endurance-inertial' });
  s.beat('dock');
  await s.until(dockWindow);
  audio.sfx('beep_double', { volume: 0.3 });
  S.lockT = 0;
  S.lockZ = THREE.MathUtils.clamp(mz(rig.toInertial(f.body.position)).z, 30, 60);
  f.controls = false;
  S.phase = 'lock';
  if (ctx.view) ctx.view.ship = rig.player.group;
  history.event('dock_capture', { p: roundVec(rig.toInertial(f.body.position)) });
  s.beat('lock');
  await s.until(() => (S.lockT > 3 && lockReady()) || S.lockT > 14);
  ui.guide(null); ui.mark(null);
  S.phase = 'close';
  audio.music('m_dock', { fade: 2, volume: 0.95, from: DOCK_PEAK - CLOSE });
  if (ctx.view) ctx.view.hold = true;
  S.assist = false;
  f.assist.rollNullLatch = false; f.assist.alignLatch = false;
  audio.sfx('beep', { volume: 0.3 });
  f.enabled = false;
  rig.endurance.group.attach(rig.player.group);
  S.closeFrom = { p: rig.player.group.position.clone(), q: rig.player.group.quaternion.clone() };
  S.dockPose = rig.dockPose(rig.player, S.port);
  S.closeT = 0; S.prevZ = null;
  S.seat.yaw = f.head.yaw; S.seat.pitch = f.head.pitch;
  ctx.controller = S.seat;
  s.beat('close');
  await s.until(() => S.closeT >= CLOSE);
  rig.stopSound();
  audio.sfx('docking_latch', { volume: 0.9 });
  ctx.input.rumble?.(0.6, 0.3);
  audio.sfx('latch', { volume: 0.6, rate: 0.85 });
  S.phase = 'docked';
  if (ctx.view) { ctx.view.ship = null; ctx.view.hold = false; }
  ctx.state.years = Math.round(clock.years() * 1000) / 1000;
  history.event('dock', { years: ctx.state.years, p: roundVec(rig.player.group.position) });
  history.snapshot('dock');
  cr.setSystems({ clamps: 'LOCKED', engines: 'OFF' });
  cr.setSwitch('engineStart', false, { silent: true });
  history.beginSegment('docked', { chapter: 'return', space: 'cockpit', mode: 'seat', frame: 'ranger-local' });
  s.beat('docked');
  await s.wait(2.5);
  cr.setText('sideL', { title: 'COMMS', lines: ['ENDURANCE  DOCKED', 'NO REPLY FROM CREW', `ELAPSED ${clock.format.years(clock.endurance - clock.ship)} Y`], cursor: true });
  cr.enable('seat', true);
  S.canUnstrap = true;
  if (cr.objOf('seat')?.userData.interact) cr.objOf('seat').userData.interact.radius = 3;
  await s.until(() => S.flags.unstrap);
  cr.enable('seat', false);
  audio.sfx('latch', { volume: 0.5 });
  const cfg = cr.stand('pilot');
  S.float = new FloatController({ camera: rig.camera, ...cfg, interact: ctx.interact, quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.85), onBump: e => audio.sfx('bump_soft', { volume: Math.min(0.6, e.speed * 0.5) }) });
  ctx.controller = S.float;
  S.phase = 'cabin';
  ui.reticle(true);
  history.beginSegment('cabin-return', { chapter: 'return', space: 'cabin', mode: 'float', frame: 'ranger-local' });
  s.beat('cabin');
  cr.enable('hatch', true);
  await s.until(() => S.flags.hatch);
  history.event('exit_ranger', { port: S.port });
  await s.wait(1.4);
  ctx.director.next({ fade: 1.5 });
}
