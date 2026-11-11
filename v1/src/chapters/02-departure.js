// Chapter 2, Departure: float forward through the dark aft cabin of the docked Ranger, take the left seat, power up by hand, pull the clamp, drift off the hub still turning with the ring, null the roll, hand over to spaceflight without a cut. History spaces: Ranger local (cabin, cockpit), Endurance inertial (undock).
import * as THREE from 'three';
import { FloatController, SeatController, FlightController } from '../core/controllers.js';
import { getSpaceRig, SPIN, seatTween, navFeed, preloadSounds, collideEndurance, viewClear, netStage } from './shared/space-rig.js';

const STEPS = ['batt', 'fuelCells', 'avionics', 'rcs'];
const SOUNDS = ['switch_1', 'switch_2', 'switch_3', 'switch_4', 'switch_off', 'button', 'beep', 'beep_double', 'avionics_boot', 'cockpit_tone', 'clamp_handle', 'clamp_release', 'latch', 'rcs', 'bump_soft', 'groan', 'hub_hum', 'breath_calm', 'hatch_servo', 'main_engine', 'main_engine_ignite', 'main_engine_shutdown', 'engine_spool', 'm_release'];
let S = null;
const _p = new THREE.Vector3();

export function pack(f) { return { p: f.position.toArray(), q: f.quaternion.toArray(), v: f.velocity.toArray(), w: f.angularVelocity.toArray() }; }

export default {
  id: 'departure',

  async load(ctx) {
    const rig = await getSpaceRig(ctx);
    S = { rig, flags: {}, flight: null, still: 0, port: ctx.net?.port || 'A' };
  },

  enter(ctx) {
    const { film, history, interact, audio, ui } = ctx;
    const rig = S.rig, cr = rig.cockpitRig;
    rig.state.hold = false;
    rig.flight = null;
    rig.stopSound();
    cr.reset();
    rig.resetSky();
    rig.setAge(0);
    rig.state.spin = true;
    rig.state.focus = rig.player.group;
    rig.setupDocked({ playerPort: S.port, otherPort: S.port === 'A' ? 'B' : 'A' });
    rig.player.setEngine(0); rig.player.setLights(false); rig.player.setLOD(false); rig.other.setLights(false);
    netStage(ctx, rig);
    rig.endurance.group.visible = true;
    rig.state.exposureBase = 1.15; rig.state.exposureOverride = null; rig.state.starsOverride = null; rig.state.auto = true;
    rig.activate();
    film.look('cockpit', 0);
    film.to({ letterbox: 1, fadeColor: 0x000000 }, 0);
    preloadSounds(ctx, 'cockpit', SOUNDS);
    if (ctx.view) ctx.view.clear = viewClear(S.rig);
    const cfg = cr.cabin('entry');
    S.ctl = new FloatController({ camera: rig.camera, ...cfg, interact, onBump: e => audio.sfx('bump_soft', { volume: Math.min(0.6, e.speed * 0.5) }) });
    ctx.controller = S.ctl;
    cr.registerInteractables(interact, {
      seat: () => { S.flags.seat = true; cr.enable('seat', false); },
      clamp: () => { S.flags.clamp = true; },
    }, { enabled: ['seat'] });
    interact.setRoots([rig.player.group]);
    ui.reticle(true);
    ui.teach('float', null, { when: () => S && !S.flags.seat, doing: 'float', enough: 2.5, delay: 1.5 });
    ui.teach('departure.seat', 'float forward to the left seat', { when: () => S && !S.flags.seat, done: () => S.flags.seat, delay: 5 });
    ui.teach('departure.power', 'power up   use the switch that blinks amber', { when: () => S?.flags.seated, done: () => cr.power.rcs, delay: 2.5 });
    ui.teach('departure.clamp', 'release the docking clamp   it blinks amber', { when: () => S?.flags.seated && cr.power.booted, done: () => S.flags.clamp, delay: 2.5 });
    if (!history.has('enter_ranger')) history.event('enter_ranger', { port: S.port });
    history.beginSegment('cabin', { chapter: 'departure', space: 'cabin', mode: 'float', frame: 'ranger-local' });
    audio.ambience('hub_hum', { volume: 0.16, fade: 3 });
    audio.ambience('breath_calm', { volume: 0.14, fade: 4 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    const c = ctx.controller, rig = S.rig;
    if (!c) return;
    c.update(dt, ctx.input);
    if (S.flight) {
      collideEndurance(rig, S.flight);
      const st = S.flight.state;
      rig.cockpitRig.setFlight(st);
      rig.flightSound(st, dt);
      navFeed(rig, rig.player.group, 'MILLER');
    }
    ctx.history.sample(dt, S.flight ? rig.toInertial(c.position, _p) : c.position, c.quaternion, S.flight ? { w: Math.round(S.flight.angularVelocity.z * 100) / 100 } : undefined);
  },

  exit(ctx) {
    ctx.ui.hint(null);
    ctx.audio.ambience('hub_hum', { volume: 0, fade: 3 });
  },

  dispose() { S = null; },

  async auto(ctx, bot) {
    await bot.lookAround?.(2.5);
    await bot.moveTo([0, 1.1, 1.1], { tol: 0.4, vmax: 1.2 });
    await bot.use('seat');
    await bot.until(() => S.flags.seated, 20, 'seated');
    await bot.linger?.(1.5);
    for (const id of STEPS) { await bot.use(id); await bot.wait(id === 'avionics' ? 1.5 : 0.6); if (id === 'avionics') await bot.linger?.(3); }
    await bot.until(() => S.rig.cockpitRig.power.booted, 20, 'avionics boot');
    await bot.use('clamp');
    await bot.until(() => S.flight, 20, 'undock');
    await bot.lookAround?.(3);
    await bot.wait(3);
    await bot.shot('departure');
    await bot.hold('KeyR', () => S.flags.rolled, 60, 'roll null');
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
  audio.sfx('bump_soft', { volume: 0.35 });
  await s.until(() => tw.done);
  ctx.controller = seat;
  S.seat = seat;
  S.flags.seated = true;
  history.event('sit', { seat: 'left' });
  history.beginSegment('cockpit', { chapter: 'departure', space: 'cockpit', mode: 'seat', frame: 'ranger-local' });
  s.beat('switches');
  for (let i = 0; i < STEPS.length; i++) {
    const id = STEPS[i];
    cr.enable(id, true);
    await s.until(() => cr.power[id]);
    cr.enable(id, false);
    history.event('switch', { id, index: i });
    if (id === 'batt') rig.player.setLights(true);
    if (id === 'avionics') s.fork(async f => { await f.until(() => cr.power.booted); history.snapshot('powered'); });
  }
  await s.until(() => cr.power.booted);
  cr.setText('sideL', { title: 'COMMS', lines: ['ENDURANCE  LINK OK', 'CLAMP RELEASE AUTHORISED', 'WREN: GOOD LUCK.'], cursor: true });
  cr.enable('clamp', true);
  s.beat('clamp');
  await s.until(() => S.flags.clamp);
  history.event('switch', { id: 'clamp', index: STEPS.length });
  await s.wait(0.55);
  s.beat('undock');
  audio.sfx('clamp_release', { volume: 1 });
  ctx.input.rumble?.(0.5, 0.25);
  audio.sfx('latch', { volume: 0.6, rate: 0.8 });
  cr.setSystems({ clamps: 'RELEASED' });
  history.event('undock', {});
  history.snapshot('undock');
  audio.music('m_release', { fade: 5, volume: 0.75 });
  audio.ambience('hub_hum', { volume: 0, fade: 4 });
  const g = rig.player.group;
  rig.release(g);
  const wWorld = new THREE.Vector3(0, 0, SPIN);
  const v = new THREE.Vector3().crossVectors(wWorld, g.position).add(new THREE.Vector3(0, 0, S.port === 'A' ? 0.32 : -0.32));
  const wBody = wWorld.clone().applyQuaternion(g.quaternion.clone().invert());
  S.flight = new FlightController({ body: g, camera: rig.camera, eye: cr.eyes.pilot, interact: ctx.interact, preset: 'space', velocity: v, angularVelocity: wBody, alignTarget: () => cr.alignDir(g.quaternion, rig.planetDirWorld()), rotAccel: 0.18, maxRate: 0.6 });
  S.flight.head.yaw = S.seat.yaw; S.flight.head.pitch = S.seat.pitch;
  ctx.controller = S.flight;
  rig.flight = S.flight;
  history.beginSegment('undock', { chapter: 'departure', space: 'orbit', mode: 'fly', frame: 'endurance-inertial' });
  s.beat('roll');
  s.fork(async f => { await f.wait(2.5); if (!S.flags.rolled) ui.guide('the ship still turns with the station   hold [R] to stop the roll'); });
  await s.until(() => { S.still = Math.abs(S.flight.angularVelocity.z) < 0.02 ? S.still + 1 : 0; return S.still > 10; });
  S.flags.rolled = true;
  S.flight.rotAccel = 0.55; S.flight.maxRate = 0.45;
  ui.hint(null); ui.guide(null);
  audio.sfx('beep', { volume: 0.2 });
  history.event('roll_null', { rate: Math.round(S.flight.angularVelocity.z * 1000) / 1000 });
  history.snapshot('roll_null');
  await s.wait(2.5);
  ctx.state.ranger = pack(S.flight);
  rig.state.hold = true;
  ctx.director.next({ fade: 0, fadeIn: 0 });
}
