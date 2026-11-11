// Chapter 3, Spaceflight: free Newtonian flight around the turning Endurance, the first full sight of Gargantua past the ring, align on Miller and hold the burn, a directed time-lapse transit (the Endurance falls away to a glint, Gargantua and the planet grow, low orbit), entry into white cloud. History space: Endurance inertial (metres, hub at origin, spin axis Z).
import * as THREE from 'three';
import { FlightController, SeatController } from '../core/controllers.js';
import { TRANSIT } from '../core/clock.js';
import { BORE_INV, BORE_Q } from './shared/cockpit-rig.js';
import { getSpaceRig, BH, planetAt, occludedByEndurance, navFeed, roundVec, preloadSounds, collideEndurance, viewClear, netStage } from './shared/space-rig.js';

export const LAPSE = 30, ENTRY = 9, REAR = [2.2, 7.6];
const SOUNDS = ['rcs', 'main_engine', 'main_engine_ignite', 'main_engine_shutdown', 'buffet', 'entry_rumble', 'beep', 'cockpit_tone', 'breath_calm'];
let S = null;
const _ip = new THREE.Vector3();
const _mk = new THREE.Vector3();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const smooth = THREE.MathUtils.smoothstep;
const ease = u => u * u * u * (u * (u * 6 - 15) + 10);

export function transitObserver(u, out = new THREE.Vector3()) {
  const e = ease(THREE.MathUtils.clamp(u, 0, 1));
  const C = BH.P.clone().addScaledVector(BH.E.clone().sub(BH.P), 0.22).addScaledVector(BH.n, BH.Rp * 9);
  const a = BH.E, b = C, c = BH.F;
  const k = 1 - e;
  return out.set(0, 0, 0).addScaledVector(a, k * k).addScaledVector(b, 2 * k * e).addScaledVector(c, e * e);
}

export function lowOrbitFrame(obs, out = new THREE.Quaternion(), { pitch = 0.2, roll = -0.3, yaw = 0 } = {}) {
  const up = obs.clone().sub(BH.P).normalize();
  const hole = obs.clone().negate().normalize();
  const f = hole.clone().addScaledVector(up, -hole.dot(up)).normalize().applyAxisAngle(up, yaw);
  const fwd = f.multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).normalize();
  return lookFrame(fwd, up.applyAxisAngle(fwd, roll), out);
}

export function lookFrame(fwdBh, upBh, out = new THREE.Quaternion()) {
  const f = fwdBh.clone().normalize();
  const r = new THREE.Vector3().crossVectors(f, upBh).normalize();
  const u = new THREE.Vector3().crossVectors(r, f);
  _m.makeBasis(r, u, f.clone().negate());
  return out.setFromRotationMatrix(_m);
}

export const TRANSIT_UP = 0;
export function transitDistance(t) { const u = Math.min(1, t / LAPSE); return 9000 * Math.pow(u, 2.2) + 12 * Math.min(t, 3) * Math.min(t, 3) + 40 * Math.max(0, t - 3); }
export function transitPitch(u) { return TRANSIT_UP * smooth(u, 0.05, 0.2) * (1 - smooth(u, 0.62, 0.86)); }
export function transitAttitudeBh(u, q0bh, out = new THREE.Quaternion()) {
  const obs = transitObserver(u);
  const toP = BH.P.clone().sub(obs).normalize(), hole = obs.clone().negate().normalize();
  const mid = lookFrame(toP.clone().lerp(hole, 0.3), new THREE.Vector3(0, 1, 0).applyAxisAngle(toP, -0.42));
  const end = lowOrbitFrame(obs, new THREE.Quaternion(), { pitch: 0.06, roll: -0.42, yaw: 0.3 });
  const a = smooth(u, 0.0, 0.25), b = smooth(u, 0.55, 0.95);
  out.slerpQuaternions(q0bh.clone().multiply(BORE_Q), mid, a);
  if (b > 0) out.slerp(end, b);
  return out.multiply(_q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -transitPitch(u))).multiply(BORE_INV);
}

export default {
  id: 'spaceflight',

  async load(ctx) {
    const rig = await getSpaceRig(ctx);
    S = { rig, flags: {}, burnHeld: 0, lapse: null, held: 0 };
  },

  enter(ctx) {
    const { film, history, interact, audio } = ctx;
    const rig = S.rig, cr = rig.cockpitRig;
    preloadSounds(ctx, 'flight', SOUNDS);
    if (ctx.view) ctx.view.clear = viewClear(S.rig);
    rig.activate();
    const seamless = !!rig.flight && rig.state.hold && rig.player.group.parent === rig.scene;
    rig.state.hold = false;
    if (seamless) S.flight = rig.flight;
    else {
      rig.stopSound(); cr.reset(); rig.resetSky(); rig.setAge(0); rig.state.spin = true;
      const port = ctx.net?.port || 'A', sz = port === 'A' ? 1 : -1;
      rig.setupDocked({ playerPort: port, otherPort: port === 'A' ? 'B' : 'A' });
      rig.release(rig.player.group);
      cr.powerUp(['batt', 'fuelCells', 'avionics', 'rcs']);
      cr.setSystems({ clamps: 'RELEASED' });
      rig.player.setLights(true);
      const st = ctx.state.ranger || { p: [0.4 * sz, -0.9, 34 * sz], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sz > 0 ? Math.PI : 0).toArray(), v: [0, 0, 0.3 * sz], w: [0, 0, 0] };
      rig.player.group.position.fromArray(st.p);
      rig.player.group.quaternion.fromArray(st.q);
      S.flight = new FlightController({ body: rig.player.group, camera: rig.camera, eye: cr.eyes.pilot, interact, preset: 'space', velocity: st.v, angularVelocity: st.w, rotAccel: 0.55, maxRate: 0.45 });
      film.look('cockpit', 0);
      film.to({ letterbox: 1, fadeColor: 0x000000 }, 0);
      audio.music('m_release', { fade: 3, volume: 0.6 });
    }
    rig.flight = null;
    netStage(ctx, rig);
    S.flight.alignTarget = () => cr.alignDir(S.flight.body.quaternion, rig.planetDirWorld());
    S.flight.controls = true; S.flight.enabled = true; S.flight.rotAccel = 0.55; S.flight.maxRate = 0.45;
    rig.state.focus = rig.player.group;
    rig.state.exposureBase = 1.15; rig.state.auto = true; rig.state.exposureOverride = null; rig.state.starsOverride = null;
    ctx.controller = S.flight;
    cr.registerInteractables(interact, {}, { enabled: [] });
    interact.setRoots([rig.player.group]);
    cr.setText('sideL', { title: 'COMMS', lines: ['ENDURANCE  LINK OK', 'TGT MILLER  BEACON ALL GOOD', 'ALIGN, THEN BURN'], cursor: true });
    cr.setMode('nav');
    ctx.ui.reticle(false);
    ctx.ui.teach('steer', null, { when: () => !!S && !S.lapse && !S.burnStarted, doing: 'look', enough: 2, delay: 2.5, limit: 7 });
    history.beginSegment('flight', { chapter: 'spaceflight', space: 'orbit', mode: 'fly', frame: 'endurance-inertial' });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    const rig = S.rig, f = S.flight, cr = rig.cockpitRig;
    if (S.lapse) lapse(ctx, dt);
    else {
      f.update(dt, ctx.input);
      collideEndurance(rig, f);
      const aim = navFeed(rig, f.body, 'MILLER');
      const ok = aim.error < 2.9 && f.throttle > 0.7;
      S.burnHeld = ok ? S.burnHeld + dt : 0;
      cr.setFlight(f.state);
      rig.flightSound(f.state, dt);
      if (S.guided && !S.burnStarted) { ctx.ui.mark(rig.camera, rig.planetDirWorld(_mk), 'Miller', '', { direction: true, hideWithin: 9 }); ctx.ui.guide(aim.error < 2.9 ? 'aligned on Miller   hold [Shift] to burn' : 'hold [T] to turn to Miller'); }
    }
    if (S.fovT != null && !S.lapse) { S.fovT += dt; const k = THREE.MathUtils.smoothstep(S.fovT, 0, 4) * (1 - THREE.MathUtils.smoothstep(S.fovT, 14, 20)); const fv = 62 - 12 * k; if (Math.abs(rig.camera.fov - fv) > 0.01) { rig.camera.fov = fv; rig.camera.updateProjectionMatrix(); } }
    if (ctx.controller !== f) ctx.controller.update(dt, ctx.input);
    if (S.lapse && ctx.controller === S.seat) S.lapse.offP = S.seat.pitch - transitPitch(Math.min(1, S.lapse.t / LAPSE));
    ctx.history.sample(dt, rig.toInertial(f.position, _ip), f.quaternion, { throttle: Math.round(f.throttle * 10) / 10 });
  },

  exit(ctx) { S.rig.stopSound(); ctx.audio.ambience('buffet', { volume: 0, fade: 1 }); ctx.audio.ambience('entry_rumble', { volume: 0, fade: 1 }); },

  dispose() { S = null; },

  async auto(ctx, bot) {
    await bot.wait(1.5);
    await bot.lookAround?.(3);
    await bot.hold('KeyT', () => S.flight.alignError < 0.03, 90, 'align on Miller');
    await bot.until(() => ctx.history.has('first_gargantua'), 30, 'first gargantua');
    bot.sight?.(() => S.rig.camera.position.clone().addScaledVector(S.rig.sky.lightDirection, 200), 6);
    await bot.linger?.(6);
    await bot.wait(2);
    await bot.shot('spaceflight');
    ctx.input.setKey('KeyT', true);
    await bot.hold('ShiftLeft', () => S.lapse, 40, 'burn');
    ctx.input.setKey('KeyT', false);
  },
};

function revealCheck(ctx) {
  const rig = S.rig, cam = rig.camera;
  cam.getWorldDirection(_v);
  const ld = rig.sky.lightDirection;
  const a = Math.acos(THREE.MathUtils.clamp(_v.dot(ld), -1, 1));
  return a < 0.5;
}

async function reveal(ctx, forced = false) {
  if (S.flags.revealed) return;
  S.flags.revealed = true;
  const { history, audio, film } = ctx;
  history.event('first_gargantua', { forced, p: roundVec(S.flight.position) });
  history.snapshot('first_gargantua');
  audio.music('m_gargantua', { fade: 3, volume: 0.9 });
  film.look('cockpit', 3);
  film.to({ exposure: film.exposure }, 0);
  film.to({ letterbox: 0 }, 3.2);
  S.rig.state.exposureBase = 1.0;
  S.fovT = 0;
}

async function run(ctx, s) {
  const { history, audio, film, clock } = ctx;
  const rig = S.rig, cr = rig.cockpitRig, f = S.flight;
  s.beat('free');
  s.fork(async k => {
    let last = ctx.director.time;
    await k.until(() => { const dt = ctx.director.time - last; last = ctx.director.time; S.held = revealCheck(ctx) ? S.held + dt : 0; return S.held > 0.8 || S.flags.revealed; });
    reveal(ctx);
    await k.wait(9);
    if (!S.burnStarted && !S.lapse) { S.guided = true; ctx.ui.guide('hold [T] to turn to Miller'); }
  });
  s.fork(async k => { await k.wait(7); if (!S.flags.revealed && !S.lapse) { ctx.ui.guide('turn the ship toward the light'); await k.until(() => S.flags.revealed || S.lapse); if (!S.guided) ctx.ui.guide(null); } });
  await s.until(() => S.burnHeld > 1.2);
  if (!S.flags.revealed) reveal(ctx, true);
  s.beat('burn');
  S.burnStarted = true; ctx.ui.hint(null); ctx.ui.guide(null); ctx.ui.mark(null);
  rig.camera.fov = 62; rig.camera.updateProjectionMatrix(); S.fovT = null;
  const aim = cr.aim(f.body.quaternion, rig.planetDirWorld());
  history.event('burn_start', { target: 'miller', error: Math.round(aim.error * 100) / 100, p: roundVec(f.position) });
  history.snapshot('burn_start');
  audio.music('m_transit', { fade: 4, volume: 0.8 });
  history.beginSegment('transit', { chapter: 'spaceflight', space: 'transit', mode: 'fly', frame: 'endurance-inertial' });
  const q0w = f.body.quaternion.clone();
  const S0 = rig.sky.skyRotation.clone();
  S.lapse = { t: 0, q0w, q0bh: S0.clone().invert().multiply(q0w), S0, p0: rig.toInertial(f.position), dir: new THREE.Vector3(), lastObs: BH.E.clone(), shot: 'cockpit' };
  S.lapse.dir.copy(BH.F).sub(BH.E).normalize().applyQuaternion(S0);
  f.controls = false;
  S.seat = new SeatController({ camera: rig.camera, ...cr.sit('pilot'), yaw: f.head.yaw, pitch: f.head.pitch });
  film.to({ letterbox: 0 }, 2);
  await s.until(() => S.lapse.t >= REAR[0]);
  S.lapse.shot = 'rear';
  history.snapshot('transit_depart');
  await s.until(() => S.lapse.t >= REAR[1]);
  S.lapse.shot = 'cockpit';
  S.seat.pitch = transitPitch(REAR[1] / LAPSE); S.seat.yaw = 0; S.lapse.offP = 0; S.lapse.offY = 0;
  ctx.controller = S.seat;
  await s.until(() => S.lapse.t >= LAPSE * 0.52);
  history.snapshot('transit_mid');
  await s.until(() => S.lapse.t >= LAPSE - 1.5);
  history.snapshot('low_orbit');
  await s.until(() => S.lapse.t >= LAPSE);
  s.beat('entry');
  history.event('entry', { shipT: Math.round(clock.ship), years: Math.round(clock.years() * 1000) / 1000 });
  audio.ambience('buffet', { volume: 0.7, fade: 3 });
  audio.ambience('entry_rumble', { volume: 0.8, fade: 4 });
  audio.music(null, { fade: 6 });
  await s.until(() => S.lapse.t >= LAPSE + ENTRY - 2.4);
  film.to({ fadeColor: 0xf2f0ea }, 0);
  await s.fade(1, 2.2);
  ctx.director.next({ fade: 0.2, fadeIn: 1.5, color: 0xf2f0ea });
}

function lapse(ctx, dt) {
  const L = S.lapse, rig = S.rig, f = S.flight, cr = rig.cockpitRig, sky = rig.sky;
  L.t += dt;
  const u = Math.min(1, L.t / LAPSE);
  const k = Math.min(dt, Math.max(0, LAPSE - (L.t - dt))) / LAPSE;
  if (k > 0) ctx.clock.advance(TRANSIT.ship * k, TRANSIT.endurance * k);
  const obs = transitObserver(u);
  const entry = THREE.MathUtils.clamp((L.t - LAPSE) / ENTRY, 0, 1);
  if (entry > 0) obs.copy(BH.F).addScaledVector(BH.n, -BH.Rp * 0.012 * entry);
  sky.setObserver(obs);
  const pl = planetAt(obs, { cover: 0.62, atmosphereGain: THREE.MathUtils.lerp(1, 0.6, smooth(u, 0.6, 1)), light: smooth(u, 0.55, 1) > 0 ? obs.clone().negate().normalize().addScaledVector(BH.P.clone().sub(obs).normalize(), -0.75 * smooth(u, 0.55, 1)).normalize() : null });
  if (entry > 0) pl.angularRadius = Math.min(1.5, pl.angularRadius + entry * 0.3);
  sky.setPlanet(pl);
  if (L.lastObs.distanceTo(obs) > 0.4) { L.lastObs.copy(obs); rig.state.envDirty = true; }
  const qbh = transitAttitudeBh(u, L.q0bh, _q);
  if (entry > 0) qbh.multiply(_q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35 * smooth(entry, 0, 0.8)));
  const body = f.body;
  body.quaternion.copy(L.S0).multiply(qbh);
  const shake = (smooth(L.t, 0, 0.6) * (1 - smooth(L.t, 1.6, 3.5)) * 0.004) + entry * 0.012 * (0.5 + 0.5 * Math.sin(L.t * 3.1));
  if (shake > 0) body.quaternion.multiply(_q2.setFromEuler(new THREE.Euler((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)));
  const dist = transitDistance(L.t);
  rig.toLocal(_ip.copy(L.p0).addScaledVector(L.dir, dist), body.position);
  f.velocity.copy(L.dir).multiplyScalar(20 + 900 * u);
  f.angularVelocity.set(0, 0, 0);
  f.throttle = entry > 0 ? Math.max(0, 1 - entry * 3) : THREE.MathUtils.clamp(L.t / 1.2, 0, 1) * (1 - smooth(u, 0.85, 0.98) * 0.7);
  rig.player.setEngine(f.throttle);
  rig.endurance.group.visible = dist < 15000;
  if (!rig.state.netShip) rig.other.group.visible = dist < 1500;
  rig.plasma.set(smooth(entry, 0.05, 0.6) * (0.85 + 0.15 * Math.sin(L.t * 17)) * 0.7, L.t);
  rig.state.diskI = smooth(entry, 0.1, 0.7) * 3.0;
  rig.diskLight.color.setRGB(1, 0.5, 0.22);
  rig.state.diskDir.set(0, -0.3, -1).applyQuaternion(body.quaternion).normalize().negate();
  rig.state.bounce = smooth(u, 0.6, 1) * 1.2;
  rig.state.exposureOverride = u > 0.8 ? THREE.MathUtils.lerp(rig.state.exposure, 1.0, smooth(u, 0.8, 0.95)) : null;
  if (entry > 0) rig.state.exposureOverride = 1.0 + entry * 0.5;
  if (L.shot === 'rear') {
    const cam = rig.camera;
    _v.set(2.2, 6.5, 0).applyQuaternion(body.quaternion).add(body.position);
    cam.position.copy(_v);
    _w.set(0, 1.5, 8).applyQuaternion(body.quaternion).add(body.position).lerp(rig.world.position, 0.85);
    _m.lookAt(cam.position, _w, new THREE.Vector3(0, 1, 0).applyQuaternion(body.quaternion));
    cam.quaternion.setFromRotationMatrix(_m);
    cam.updateMatrixWorld();
    rig.state.exposureOverride = 1.0;
    rig.state.starsOverride = 0.15;
  } else {
    rig.state.starsOverride = null;
    if (ctx.controller === S.seat) S.seat.pitch = transitPitch(u) + (L.offP || 0);
    f.update(0, ctx.input);
  }
  cr.setFlight(f.state);
  cr.setNav({ target: 'MILLER', range: obs.distanceTo(BH.P) * 2.95e11, closing: 900 * u * 1e5, burn: { cue: u < 0.9 ? 'HOLD' : 'CUTOFF', tgo: Math.max(0, (LAPSE - L.t) * 300) } });
  rig.flightSound(entry > 0 ? { throttle: 0 } : f.state, dt);
  ctx.audio.ambience('buffet', { volume: entry > 0 ? 0.3 + 0.6 * entry : 0, fade: 0.3 });
}
