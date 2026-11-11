// Chapter 4, Miller's Planet (in co-op two Rangers and two pilots under one wave timed by the host): descent through the deck to a fixed beacon, landing in the shallows with the option to lift off and land again, suit and hatch, the wade to the wreck, the wave, the escape up its face or the flood and the wait. History frames: miller-world for flight and wading, ranger-local for seat and cabin.
import * as THREE from 'three';
import { FlightController, WalkController, SeatController, frames } from '../core/controllers.js';
import { MONTH } from '../core/clock.js';
import { layTrail } from './miller/wreck.js';
import { buildWorld, partnerRanger, walkData, wreckCollidersLocal, meander, SEABED, UPWIND, LZ, BEACON0, WRECK_DIST, DECK, START, CABIN, SEATS } from './miller/world.js';
import { createMillerCockpit } from './miller/cockpit.js';
import { Looks, createHelmet, createWindowWater, createShake, createWrist, createRecorderDisplay, createBody } from './miller/fx.js';

export const LAND = { far: 200, hopCeiling: 110, departAlt: 150, keepOut: 13 };
export const WAVE = { start: 8000, height: 1200, gap: 14000, walk: 1.2, run: 1.5, pace: 1.25, board: 24, spare: 12, crew: 20, maxSurface: 240, drain: 50, nominal: 154 };
export const CREW = { side: new THREE.Vector3(UPWIND.z, 0, -UPWIND.x).multiplyScalar(-48), keepOut: 24 };
const CLIMB = 320, AUDIO = ['m_shallows', 'switch_1', 'switch_2', 'switch_3', 'switch_4', 'switch_off', 'beep', 'cockpit_tone', 'rcs', 'bump_soft', 'avionics_boot', 'tick', 'wind', 'wind_strong', 'water_lap', 'wade_step', 'splash_big', 'touchdown_water', 'wave_rumble', 'wave_near', 'wave_hit', 'beacon_ping', 'engine_flood', 'engine_drain', 'ranger_engines', 'main_engine', 'buffet', 'entry_rumble', 'breath_calm', 'breath_stress', 'heartbeat', 'alarm', 'warn_beep', 'radio', 'hatch_servo', 'hatch_hydraulic', 'latch', 'step_metal', 'step_pad', 'engine_spool', 'alarm_short', 'button', 'beep_double'];
let S = null;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler();
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round((v || 0) * 100) / 100;

export default {
  id: 'miller',

  async load(ctx) {
    const W = await buildWorld(ctx);
    const ck = await createMillerCockpit(ctx, W);
    const wrist = await createWrist(ctx, W);
    const body = await createBody(ctx, W);
    S = {
      W, ck, wrist, body, looks: new Looks(ctx.film), helmet: createHelmet(W.scene), water: createWindowWater(W), shake: createShake(), rec: createRecorderDisplay(W, ctx),
      mode: 'fly', flags: {}, wave: { x: 1e5, speed: 0, moving: false, arrive: Infinity, visible: false, passes: 0 }, wx: { wind: 0.55, mist: 1 / 700, cloud: 1, draw: 0, setWind: 0.55, acc: 0 },
      R: new THREE.Vector3(), carry: null, drain: null, t: 0, beaconT: 0, spray: 0, touchShip: 0, surfaceT0: 0, ticks: 0, beat: 0, zone: 'seat', stance: 0, parkT: 0, hop: false, reticleOn: false,
    };
    const second = !!ctx.net && !ctx.net.host;
    S.lz = LZ.clone().addScaledVector(CREW.side, second ? 1 : 0);
    S.startP = START.p.clone().addScaledVector(CREW.side, second ? 3 : 0);
    S.flare = createFlare(W);
    S.gearE = W.ranger.gearHeight;
    W.ranger.setStance?.(1);
    S.gearC = W.ranger.gearHeight;
    W.ranger.setStance?.(0);
    if (W.ocean.setCloudDeck) W.ocean.setCloudDeck({ base: DECK.base, top: DECK.top });
    W.ocean.setSkyColors?.({ top: [0.43, 0.44, 0.43], horizon: [0.5, 0.51, 0.495], glow: [0.1, 0.1, 0.09] });
    W.ocean.setWaterColors?.({ reflectance: 0.8 });
    W.shades = [W.ocean.addShade?.(W.ranger.group, { width: 9, length: 17, strength: 0.8 }), W.ocean.addShade?.(W.wreck.root, { width: 9, length: 12, strength: 0.6 })];
    if (ctx.net) {
      W.other = await partnerRanger(ctx, W);
      W.shades.push(W.ocean.addShade?.(W.other.group, { width: 9, length: 17, strength: 0.8 }));
      await ctx.net.prepare(W.scene, W.cam);
    }
    ctx.audio.preload('miller');
    ctx.audio.preload('cockpit');
    ctx.audio.load(AUDIO);
    wireInteract(ctx);
    const rg = W.ranger;
    rg.setGear(1); rg.setHatch(1); rg.setRamp?.(1); rg.setEngine(1); rg.setLights(true);
    W.cockpit.set?.('hatch', 1, true);
    const show = [];
    W.scene.traverse(o => { if (!o.isLight && !o.visible) { show.push(o); o.visible = true; } });
    const prev = show.map(() => false);
    W.ranger.group.position.set(0, 2, 0);
    W.wreck.root.position.set(0, 0, -6);
    W.wreck.trail.position.set(0, 0, 0);
    W.ocean.setWave({ x: 6000, visible: true, height: WAVE.height, gap: WAVE.gap });
    W.ocean.update(1 / 60, W.cam);
    W.ocean.prime?.();
    S.keyBase = W.ocean.keyLight?.intensity ?? 1;
    const r = ctx.engine.renderer, prevRT = r.getRenderTarget?.();
    if (r.capabilities && ctx.engine.film?.sceneRT) r.setRenderTarget(ctx.engine.film.sceneRT);
    await r.compileAsync(W.scene, W.cam);
    const key = W.ocean.keyLight;
    if (key) { key.position.set(0, 60, 40); key.target.position.set(0, 0, 0); key.target.updateMatrixWorld(); }
    W.cam.position.set(0, 25, 30); W.cam.lookAt(0, 0, 0); W.cam.updateMatrixWorld();
    if (r.capabilities) { r.render(W.scene, W.cam); r.setRenderTarget(prevRT ?? null); }
    W.wreck.root.position.set(0, 0, -400);
    show.forEach((o, i) => { o.visible = prev[i]; });
    W.ocean.setWave({ visible: false });
  },

  enter(ctx) {
    const { engine, history, interact, audio, clock } = ctx;
    const W = S.W;
    engine.setView(W.scene, W.cam);
    engine.setBackground(null);
    audio.listener(W.cam);
    const rg = W.ranger;
    rg.group.position.copy(S.startP);
    rg.group.quaternion.setFromAxisAngle(_v.set(0, 1, 0), START.yaw);
    rg.setGear(0); rg.setHatch(0); rg.setEngine(0.8); rg.setLights(true);
    S.ck.power(1); S.ck.failure(0); S.ck.showSystems(false);
    W.cockpit.set?.('hatch', 0, true);
    W.cockpit.set?.('throttle', 0.6, true);
    const fwd = _v.set(0, 0, -1).applyQuaternion(rg.group.quaternion);
    S.flight = new FlightController({ body: rg.group, camera: W.cam, eye: W.eye, interact, preset: 'atmo', velocity: [fwd.x * 52, -30, fwd.z * 52], ground: groundY, groundLook: true, onContact: e => touchdown(ctx, e.speed) });
    S.touchShip = S.surfaceT0 = clock.ship;
    placeWreck();
    if (ctx.view) {
      ctx.view.ownAvatar = true;
      ctx.view.floor = (x, z) => (S ? S.W.ocean.heightAt(x, z) + 0.5 : -1e9);
      ctx.view.extra = (W.cockpit.colliders || []).filter(c => String(c.id || '').startsWith('ceil')).map(c => ({ min: new THREE.Vector3(...c.min), max: new THREE.Vector3(...c.max) }));
    }
    ctx.controller = S.flight;
    const N = ctx.net;
    if (N) {
      N.stage({
        scene: W.scene,
        ship: () => ({ k: 'w', p: rg.group.position, q: rg.group.quaternion, g: r2(rg.gear), h: r2(rg.hatch), e: r2(rg.engine), r: r2(rg.ramp01) }),
        placeShip: (sh, dt) => placePartner(sh, dt),
        world: () => (S.wave.visible ? { wave: { x: Math.round(S.wave.x), v: r1(S.wave.speed), m: S.wave.moving ? 1 : 0, n: S.wave.next ? 1 : 0 } } : {}),
        applyWorld: (w, dt) => followWave(ctx, w.wave, dt),
      });
      N.share('miller.recorder', () => S.flags.recorder, () => partnerRecorder(ctx));
    }
    interact.setRoots([W.scene]);
    ctx.ui.reticle(false);
    ctx.ui.teach('move', null, { when: () => S?.mode === 'walk' && !S.arc, doing: 'move', enough: 2.5, delay: 1 });
    ctx.ui.teach('steer', null, { when: () => S?.mode === 'fly' && S.flight.controls && !S.flags.landed, doing: 'look', enough: 2, delay: 1.5, limit: 6 });
    ctx.ui.teach('wrist', null, { when: () => S?.mode === 'walk' && S.zone === 'out' && ctx.history.has('first_step'), done: () => ctx.history.has('tick_noticed'), delay: 1.5 });
    S.looks.set('cloud', 0);
    ctx.film.to({ fadeColor: 0xe9e6de }, 0);
    S.water.set({ wet: 1, flow: 1.6 });
    S.shake.set(1);
    W.ocean.setWind(0.55); W.ocean.setMist(1 / 700);
    clock.setRateLog(0);
    history.beginSegment('descent', { chapter: 'miller', space: 'ocean', mode: 'fly', frame: 'miller-world' });
    S.rumble = audio.loop('entry_rumble', { volume: 0.65, fade: 0.4 });
    S.buffet = audio.loop('buffet', { volume: 0.7, fade: 0.4 });
    S.engines = audio.loop('ranger_engines', { volume: 0.35 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    const { clock, history, audio, input } = ctx;
    const W = S.W, cam = W.cam;
    S.t += dt;
    const c = ctx.controller;
    if (S.carry) carryStep(ctx, dt);
    if (S.drain) driftStep(ctx, dt);
    if (S.mode === 'fly' && !S.flags.landed && S.flight.controls && !S.flight.head.free) S.flight.head.pitch = -0.22 * ss(30, 160, altitude()) * (1 - ss(DECK.base - 60, DECK.base + 40, S.flight.position.y)) - 0.1;
    c.update(dt, input);
    if (S.arc) arcStep(dt);
    if (S.mode === 'fly') flyStep(ctx, dt);
    else if (S.mode === 'walk') walkStep(ctx, dt);
    if (S.mode !== 'fly') ctx.ui.guide(groundGuide(ctx));
    if (S.wave.visible) waveStep(ctx, dt);
    weatherStep(ctx, dt);
    S.shake.apply(cam, dt);
    W.ranger.update(dt);
    S.ck.update(dt, cam);
    S.helmet.update(dt, cam);
    S.water.update(dt);
    S.wrist.update(dt, cam, S.ctl && (S.mode === 'walk') ? S.ctl.pitch : 0);
    S.body.update(dt, cam, S.ctl, S.mode === 'walk' && !S.arc ? (S.zone === 'out' && S.ctl.preset === 'wade' ? 'wade' : 'walk') : 'none', S.wrist.raised > 0.05);
    const third = !!ctx.view?.active;
    S.body.setThird(third);
    if (third) { S.helmet.mesh.visible = false; S.wrist.rig.visible = false; }
    S.looks.viewMul = third && S.mode === 'fly' ? 0.86 : 1;
    S.rec.update?.(dt);
    W.ocean.update(dt, cam);
    if (S.wave.visible) W.ocean.setWave({ x: S.wave.x, speed: S.wave.speed });
    S.looks.update(dt);
    shadowFollow(W);
    beaconStep(ctx, dt);
    debrisStep(ctx, dt);
    if (S.mode === 'fly') history.sample(dt, S.flight.position, S.flight.quaternion, { alt: Math.round(altitude()), thr: r1(S.flight.throttle) });
    else if (S.mode === 'walk' && S.zone === 'out') { S.ctl.worldPose(_p, _q); history.sample(dt, _p, _q, S.wave.moving ? { wx: Math.round(toeAt(_p.z) / 10) * 10 } : undefined); }
    else if (S.mode === 'walk') history.sample(dt, S.ctl.position, S.ctl.quaternion);
    else if (S.mode === 'carried') history.sample(dt, S.seatCtl.position, S.seatCtl.quaternion, { rp: W.ranger.group.position.toArray().map(Math.round) });
    else if (c) history.sample(dt, c.position, c.quaternion);
    if (S.flags.landed && !S.flags.lifted) {
      if (pulse(ctx, dt, clock.ticks > 0)) { const a = S.wx.waveA || 0; audio.sfx('tick', { volume: (S.zone === 'out' ? 0.6 : 0.5) + 0.4 * a, duckBeds: 2 + 3 * a, hold: 0.12 }); }
      S.ticks += clock.ticks;
    }
  },

  exit(ctx) {
    const a = ctx.audio;
    ctx.ui.guide(null); ctx.ui.mark(null);
    for (const id of ['wind', 'wind_strong', 'water_lap', 'wave_rumble', 'wave_near', 'buffet', 'entry_rumble', 'breath_calm', 'breath_stress', 'heartbeat', 'alarm']) a.ambience(id, { volume: 0, fade: 2 });
    S.engines?.stop(1.5);
    S.main?.shutdown?.();
    S.rumble?.stop(1); S.buffet?.stop(1);
    a.muffle(0, 1);
    ctx.clock.rampTo(1, 0);
  },

  dispose() {
    const W = S.W;
    S.ck.dispose(); S.wrist.dispose(); S.body.dispose(); S.helmet.dispose(); S.water.dispose(); S.rec.dispose?.(); S.flare?.dispose();
    W.wakes.feet.concat(W.wakes.legs, W.wakes.debris).forEach(w => w.remove());
    W.shades?.forEach(s => s?.remove());
    W.ocean.dispose(); W.cockpit.dispose(); W.ranger.dispose(); W.other?.dispose?.();
    W.scene.traverse(o => { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); } });
    S = null;
  },

  async auto(ctx, bot) {
    const L = (x, y, z) => [x, y, z];
    const lvl = dawdleLevel(ctx);
    const out = (x, y, z) => () => S.W.ranger.group.localToWorld(new THREE.Vector3(x, y, z));
    bot.sight(out(-9, -6, -4), 5);
    await bot.moveTo([S.lz.x, 70, S.lz.z], { tol: 14, vmax: 48, gain: 0.25, stopSpeed: 8, timeout: 260 });
    bot.sight(out(8, -5, -6), 3);
    await bot.moveTo([S.lz.x, groundY() - 2, S.lz.z], { tol: 0.8, vmax: 6, gain: 0.45, stopSpeed: 2, timeout: 160, stop: () => S.flags.landed });
    await bot.hold('KeyC', () => S.parkT > 0.8, 40, 'parked after touchdown');
    if (!bot.human) {
      await bot.hold('Space', () => altitude() > 12, 20, 'hop up');
      await bot.moveTo([S.lz.x + 25, groundY() + 10, S.lz.z + 10], { tol: 6, vmax: 12, gain: 0.5, stopSpeed: 4, timeout: 60 });
      await bot.hold('KeyC', () => S.parkT > 0.8, 60, 'parked after the hop');
    }
    await bot.use('harness');
    await bot.until(() => S.mode === 'walk' && !S.arc, 15, 'stand up');
    if (!bot.human) {
      await bot.use('seat');
      await bot.until(() => S.mode === 'seat', 10, 'seated again');
      await bot.use('harness');
      await bot.until(() => S.mode === 'walk' && !S.arc, 15, 'stand up again');
    }
    for (const p of [L(-0.55, 0, 1.0), L(0, 0, 4.0), L(0, 0, 5.8)]) await bot.walkTo(p, { tol: 0.3 });
    await bot.use('hatch');
    await bot.until(() => S.flags.hatch, 15, 'hatch open');
    await bot.walkTo(L(0, 0, 7.4), { tol: 0.35 });
    await bot.lookAround(3);
    for (const p of [L(0, 0, 9.2), L(0, 0, 11.4)]) await bot.walkTo(p, { tol: 0.35 });
    await bot.until(() => ctx.history.has('first_step'), 15, 'first step');
    await bot.shot('miller');
    await bot.look(() => bot.mouse(0, 260), 0.8);
    await bot.until(() => ctx.history.has('tick_noticed'), 15, 'wrist');
    await bot.linger(1.5);
    await bot.look(() => bot.mouse(0, -300), 0.6);
    const path = route(S.ctl.position, wreckApproach());
    for (let i = 0; i < path.length; i++) {
      if (i === path.length - 1) { bot.sight(() => S.W.ranger.group.position.clone().setY(2), 3); bot.sight(() => waveLook(), 3); }
      await bot.walkTo([path[i].x, 0, path[i].z], { tol: 0.6, timeout: 600, stop: () => S.flags.recorder });
    }
    if (lvl >= 2) await bot.wait(90);
    await bot.read('flight recorder');
    await bot.use('recorder', { timeout: 20, unless: () => S.flags.recorder });
    await bot.wait(1.5);
    await bot.sight(() => S.W.ranger.group.position.clone().setY(2), 3);
    await bot.face(() => waveLook(), { tol: 0.08, timeout: 15 });
    await bot.until(() => ctx.history.has('wave_seen'), 60, 'wave seen');
    await bot.linger(3);
    if (lvl >= 1) {
      await bot.until(() => S.flags.hit, 900, 'the wave');
      await bot.until(() => S.mode === 'seat' && !S.carry, 90, 'carried to the seat');
      await bot.lookAround(4);
      if (lvl >= 2) {
        await bot.until(() => !S.drain && !S.flags.flooded, WAVE.drain + 60, 'first drain');
        await bot.until(() => S.wave.passes >= 2, 600, 'second wave');
        await bot.until(() => S.mode === 'seat' && !S.carry, 90, 'carried again');
      }
      await bot.until(() => !S.flags.flooded, WAVE.drain + 60, 'drain');
      if (lvl >= 2) await bot.wait(90);
    } else {
      for (const p of route(S.ctl.position, new THREE.Vector3(0, 0, 11.6))) { bot.sight(() => waveLook(), 2); await bot.walkTo([p.x, 0, p.z], { tol: 0.6, timeout: 600 }); }
      for (const p of [L(0, 0, 10.6), L(0, 0, 8.4), L(0, 0, 6.9), L(-0.2, 0, 4.9)]) await bot.walkTo(p, { tol: 0.35 });
      await bot.use('hatch');
      for (const p of [L(-0.55, 0, 1.0), L(-0.85, 0, 0.12)]) await bot.walkTo(p, { tol: 0.3 });
      await bot.use('seat');
      await bot.until(() => S.mode === 'seat', 10, 'seated');
    }
    await bot.use('engineStart', { timeout: 30 });
    await bot.until(() => S.mode === 'fly', 20, 'flight');
    await bot.hold('Space', () => S.flags.climbed, 160, 'climb out');
  },
};

function dawdleLevel(ctx) {
  const d = ctx.debug;
  const v = d.dawdleLevel ?? d.params?.get?.('dawdle') ?? d.dawdle;
  return v === true ? 1 : +v || 0;
}

function groundY() {
  const g = S ? S.W.ranger.gear : 1;
  return SEABED + Math.max(1.05, S ? (S.gearC ?? S.W.ranger.gearHeight) * g * g * (3 - 2 * g) : 2.61);
}

function altitude() { return S.W.ranger.group.position.y - (SEABED + S.W.ranger.gearHeight); }

function toeAt(z) { return S.wave.x + (S.wave.next ? WAVE.gap : 0) + meander(z); }

function waveLook() { const p = S.ctl ? S.ctl.worldPose(_p, _q).position : S.W.ranger.group.position; return new THREE.Vector3(toeAt(p.z) + 700, 420, p.z); }

function wreckApproach() {
  const W = S.W, g = W.ranger.group;
  const rp = (W.wreck.display?.mesh || W.wreck.recorder).getWorldPosition(new THREE.Vector3());
  const toR = g.position.clone().sub(rp).setY(0).normalize();
  const boxes = wreckCollidersLocal(W);
  const free = q => boxes.every(b => q.x < b.min[0] - 0.4 || q.x > b.max[0] + 0.4 || q.z < b.min[2] - 0.4 || q.z > b.max[2] + 0.4 || b.max[1] < W.seabedLocal + 0.36);
  for (let d = 0.9; d < 4; d += 0.1) for (const a of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1]) {
    const q = g.worldToLocal(rp.clone().addScaledVector(toR.clone().applyAxisAngle(_v.set(0, 1, 0), a), d));
    if (free(q)) return q;
  }
  return g.worldToLocal(rp.addScaledVector(toR, 1.05));
}

export function route(P, T) {
  const box = { x: 5.7, z0: -9.6, z1: 9.4 };
  const hits = (a, b) => {
    for (let i = 0; i <= 40; i++) { const u = i / 40, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u; if (Math.abs(x) < box.x && z > box.z0 && z < box.z1 && !(Math.abs(x) < 0.8 && z > 7.6)) return true; }
    return false;
  };
  const out = [];
  let cur = new THREE.Vector3(P.x, 0, P.z);
  if (cur.z > 7.6 && Math.abs(cur.x) < 0.8 && cur.z < 12) { cur = new THREE.Vector3(0, 0, 12.2); out.push(cur.clone()); }
  const tgt = new THREE.Vector3(T.x, 0, T.z);
  const endOnSteps = Math.abs(tgt.x) < 0.8 && tgt.z > 7.6 && tgt.z < 12;
  const goal = endOnSteps ? new THREE.Vector3(0, 0, 12.4) : tgt;
  if (hits(cur, goal)) {
    const sx = Math.sign((cur.x + goal.x) || 1);
    const zc = z => (z > 0 ? box.z1 + 0.6 : box.z0 - 0.6);
    out.push(new THREE.Vector3(sx * (box.x + 0.8), 0, zc(cur.z)));
    if (Math.sign(cur.z) !== Math.sign(goal.z) || hits(out[out.length - 1], goal)) out.push(new THREE.Vector3(sx * (box.x + 0.8), 0, zc(goal.z)));
  }
  out.push(goal);
  if (endOnSteps && goal !== tgt) out.push(tgt);
  return out;
}

function wireInteract(ctx) {
  const W = S.W, ck = S.ck;
  const I = (obj, def) => { obj.userData.interact = { range: 2.2, ...def }; if (!obj.name) obj.name = def.id; return obj; };
  const r = ck.register(ctx.interact, {
    hatch: () => (S.flags.hatchOpen ? closeHatch(ctx) : openHatch(ctx)),
    engineStart: () => startEngines(ctx),
    seat: () => sit(ctx, false),
    rcs: () => purge(ctx),
  });
  const set = (o, d) => Object.assign(o.userData.interact, d);
  set(r.lever, { label: 'pull the hatch lever', hold: 0.9, range: 2.1, enabled: false });
  set(r.engines, { label: 'start engines', hold: 1.4, range: 1.9, enabled: false });
  set(r.seat, { label: 'take the left seat', range: 2.4, enabled: false });
  S.it = {
    harness: I(W.targets.harness, { id: 'harness', label: 'release the harness', hold: 0.8, range: 1.7, radius: 0.4, enabled: false, onUse: () => unstrap(ctx) }),
    seat: r.seat, lever: r.lever, engines: r.engines, purge: Object.assign(ck.rig.objOf('rcs').userData.interact, { label: 'purge engines', range: 1.9, enabled: false }) && ck.rig.objOf('rcs'),
    recorder: I(W.wreck.recorder, { id: 'recorder', label: 'pull the recorder free', hold: 1.8, range: 2.6, once: true, onUse: () => takeRecorder(ctx) }),
  };
}

async function run(ctx, s) {
  const { history, audio, clock } = ctx;
  const W = S.W;
  s.beat('entry');
  history.event('entry', { alt: Math.round(altitude()) });
  history.snapshot('entry');
  s.fork(f => f.tween(3, u => { ctx.film.fadeColor.setRGB(0.91 * (1 - u), 0.9 * (1 - u), 0.87 * (1 - u)); }));
  await s.until(() => S.flight.position.y < DECK.base - 30);
  s.beat('breakout');
  history.event('breakout', { alt: Math.round(altitude()) });
  S.looks.set('descent', 4);
  S.water.set({ wet: 0.3, flow: 1.2 });
  S.shake.set(0.25);
  S.rumble?.set({ volume: 0, fade: 5 });
  S.buffet?.set({ volume: 0.12, fade: 5 });
  audio.ambience('wind', { volume: 0.35, fade: 6 });
  s.fork(async f => { await f.wait(3); history.snapshot('breakout'); });
  s.beat('approach');
  await s.until(() => S.flags.landed);
  s.fork(async f => { await f.until(() => S.wave.moving || ((S.flags.recorder || clock.ship - S.surfaceT0 > WAVE.maxSurface) && !(ctx.net?.linked && !ctx.net.host))); if (!S.wave.moving) startWave(ctx, !S.flags.recorder, S.flags.recorder ? 'recorder' : 'time'); });
  s.fork(async f => {
    await f.until(() => S.wave.moving);
    s.beat('wave');
    let held = 0, last = ctx.director.time;
    await f.until(() => { const dt = ctx.director.time - last; last = ctx.director.time; held = !S.flags.hit && waveVisible() && ctx.interact.looking(waveLook(), 26) ? held + dt : 0; return held > 0.6 || S.flags.hit || S.flags.lifted; });
    if (S.flags.hit || S.flags.lifted) return;
    history.event('wave_seen', { distance: Math.round(toeAt(S.R.z) - S.R.x), eta: r1(S.wave.arrive - ctx.director.time) });
    history.snapshot('wave');
    S.flags.seen = true;
    shallows(ctx);
  });
  s.fork(async f => { await f.until(() => S.wave.moving); await f.wait(25); if (!S.flags.seen && !S.flags.lifted) shallows(ctx); });
  s.beat('harness');
  s.fork(async h => {
    await h.until(() => S.flags.harness);
    h.beat('hatch');
    h.fork(async f => {
      await f.until(() => S.flags.hatch && S.mode === 'walk' && S.ctl.position.z > CABIN.face + 0.15);
      history.event('exit_ranger', {});
      await f.until(() => S.mode === 'walk' && S.zone === 'out' && S.ctl.position.y < W.seabedLocal + 0.05 && S.ctl.position.z > CABIN.face + 0.6);
      history.event('first_step', { months: Math.round(clock.months()) });
      history.snapshot('first_step');
      S.wrist.target = 1;
      h.beat('shallows');
      await f.until(() => S.wrist.reading);
      history.event('tick_noticed', { months: Math.round(clock.months()), ship: r1(clock.ship) });
    });
    h.fork(async f => {
      await f.until(() => S.mode === 'walk' && worldPos().distanceTo(W.wreck.root.position) < 9);
      history.event('wreck_found', { distance: Math.round(S.R.distanceTo(W.wreck.root.position)) });
      history.snapshot('wreck');
    });
  });
  await s.until(() => S.flags.depart);
  s.beat('liftoff');
  liftoff(ctx);
  await s.until(() => S.flight.position.y > DECK.base + 160);
  S.flags.climbed = true;
  ctx.director.next({ fade: 1.6, color: 0xeeebe4 });
}

function pulse(ctx, dt, month) {
  const grid = ctx.audio.tickOf?.('m_shallows');
  if (!grid) return month;
  const P = grid.period, live = ctx.audio.musicTick?.(), was = S.beat;
  if (live) S.beat = (((live.time - live.phase) % P) + P) % P;
  else S.beat = (S.beat + dt) % P;
  return S.beat < was - P / 2 && !(live && live.time < live.until);
}

function shallows(ctx) {
  if (S.flags.music) return;
  S.flags.music = true;
  const now = ctx.director.time;
  const from = Math.min(200, Math.max(0, 240 - (S.wave.arrive - now - WAVE.spare)));
  const grid = ctx.audio.tickOf?.('m_shallows');
  ctx.audio.music('m_shallows', { fade: 1.5, volume: 0.95, from, tickIn: grid ? grid.period - S.beat : null });
  ctx.audio.ambience('breath_stress', { volume: 0.45, fade: 3 });
  ctx.audio.ambience('breath_calm', { volume: 0, fade: 3 });
}

function waveVisible() {
  if (!S.wave.moving || S.flags.hit) return false;
  const sky = S.W.ocean.sky;
  if (!sky?.hazeTransmittance) return true;
  return sky.hazeTransmittance(S.W.cam.position, waveLook()) > 0.18;
}

function arcStep(dt) {
  const A = S.arc, cam = S.W.cam;
  A.t += dt;
  const u = Math.min(1, A.t / A.d), e = u * u * (3 - 2 * u);
  const k = Math.sin(e * Math.PI) * 0.12;
  cam.position.lerpVectors(A.p0, cam.position, e).y += k;
  cam.quaternion.slerpQuaternions(A.q0, cam.quaternion, e);
  cam.updateMatrixWorld();
  if (u >= 1) { S.arc = null; if (S.ctl) { S.ctl.look = true; S.ctl.move = true; } }
}

function touchdown(ctx, speed) {
  const { history, audio, clock } = ctx;
  const W = S.W, rg = W.ranger;
  if (S.flags.lifted || S.carry) return;
  const first = !S.flags.landed;
  S.R.copy(rg.group.position).setY(Math.max(rg.group.position.y, groundY()));
  if (!first && !S.hop) return;
  S.flags.landed = true;
  S.touchSpeed = speed;
  S.surfaceT0 = clock.ship;
  S.hop = false;
  const sp = Math.round(speed * 100) / 100;
  const dist = Math.round(Math.hypot(rg.group.position.x - W.wreck.root.position.x, rg.group.position.z - W.wreck.root.position.z));
  if (first) {
    S.touchShip = clock.ship;
    history.event('touchdown', { speed: sp, hard: sp > 4, p: rg.group.position.toArray().map(r1), beacon: dist });
    history.snapshot('touchdown');
    if (!S.wave.moving) S.wave.x = rg.group.position.x + WAVE.start - meander(rg.group.position.z);
    S.wave.visible = true;
    W.ocean.setWave({ x: S.wave.x, speed: 0, visible: true, height: WAVE.height, gap: WAVE.gap, second: true });
  } else history.event('relanding', { speed: sp, p: rg.group.position.toArray().map(r1), beacon: dist });
  audio.sfx('touchdown_water', { volume: 0.9 });
  if (sp > 3) audio.sfx('splash_big', { volume: Math.min(1, 0.4 + sp * 0.1) });
  for (const f of W.feet) W.ocean.splash(f.getWorldPosition(_v), 2 + sp * 1.2);
  W.ocean.splash(rg.group.position.clone().setY(0), 3 + sp);
  S.shake.kick(Math.min(3, 0.6 + sp * 0.4));
  ctx.input.rumble?.(Math.min(1, 0.35 + sp * 0.12), 0.35);
  W.cockpit.set?.('throttle', 0, true);
  S.ck.setEngine({ throttle: 0, state: 'IDLE' });
  S.looks.set('seat', 3);
  S.water.set({ wet: 0.25, flow: 0.15 });
  S.shake.set(0);
  audio.ambience('buffet', { volume: 0, fade: 2 });
  audio.ambience('wind', { volume: 0.25, fade: 3 });
  audio.ambience('water_lap', { volume: 0.25, fade: 3 });
}

function placeWreck() {
  const W = S.W;
  const wp = BEACON0.clone().setY(0);
  W.wreck.root.position.copy(wp);
  const toR = LZ.clone().sub(wp).setY(0).normalize();
  W.wreck.root.rotation.set(0, Math.atan2(toR.x, toR.z) - (W.wreck.approachYaw || 0), 0);
  W.wreck.root.visible = true;
  W.wreck.root.updateMatrixWorld(true);
  layTrail(W, LZ.clone().setY(0), wp);
  W.wreck.trail.visible = true;
  if (W.beaconLight) W.beaconLight.visible = true;
}

function createFlare(W) {
  if (!W.real || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0, 0, 0), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, sizeAttenuation: false, fog: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'beaconFlare'; sprite.renderOrder = 6; sprite.frustumCulled = false;
  W.scene.add(sprite);
  return { sprite, mat, glow: 0, dispose() { sprite.removeFromParent(); tex.dispose(); mat.dispose(); } };
}

function park(ctx) {
  const W = S.W, f = S.flight, rg = W.ranger;
  f.enabled = false; f.controls = false;
  f.velocity.set(0, 0, 0); f.angularVelocity.set(0, 0, 0);
  _e.setFromQuaternion(rg.group.quaternion, 'YXZ');
  rg.group.quaternion.setFromAxisAngle(_v.set(0, 1, 0), _e.y);
  rg.group.position.y = groundY();
  rg.group.updateMatrixWorld(true);
  S.R.copy(rg.group.position);
  S.flags.engines = false;
  S.parkT = 0;
  S.stance = 1; rg.setStance?.(1);
  ctx.clock.setRateLog(1);
  S.engines?.set({ volume: 0.12, rate: 0.85, fade: 3 });
  const e0 = 0.2;
  ctx.director.script(s => s.tween(4, u => rg.setEngine(e0 * (1 - u))));
  ctx.ui.guide(null); ctx.ui.mark(null);
}

function unstrap(ctx) {
  const { history, audio } = ctx;
  if (S.carry || S.arc || (S.mode !== 'seat' && !(S.mode === 'fly' && S.parkT > 0))) return;
  audio.sfx('latch', { volume: 0.5 });
  if (S.mode === 'fly') park(ctx);
  S.flags.harness = true;
  standUp(ctx);
  history.beginSegment(S.flags.boarded ? 'cabin-board' : 'cabin-surface', { chapter: 'miller', space: 'cabin', mode: 'walk', frame: 'ranger-local' });
  S.it.harness.userData.interact.enabled = false;
  S.it.engines.userData.interact.enabled = false;
  S.it.lever.userData.interact.enabled = true;
  S.it.seat.userData.interact.enabled = true;
  S.looks.set('cabin', 1.2);
}

function syncDoors() {
  const c = S.ctl;
  if (!c) return;
  const open = !!S.flags.hatchOpen;
  const set = (id, on, top) => { const b = c.collider(id); if (b) { b.min.y = on ? 0 : 99; b.max.y = on ? top : 101; } };
  set('innerDoor', !open, 1.74); set('outerDoor', !open, 1.74); set('innerDoorOpen', open, 1.9);
}

function setSeat(ctx, pitch = -0.15, yaw = 0) {
  const W = S.W;
  S.seatCtl = new SeatController({ camera: W.cam, anchor: W.eye, pitch, yaw, pitchLimit: 1.15 });
  ctx.controller = S.seatCtl;
  S.mode = 'seat';
  S.zone = 'seat';
  ctx.ui.reticle(true);
}

function standUp(ctx) {
  const W = S.W, { audio } = ctx;
  S.arc = { t: 0, d: 1.3, p0: W.cam.position.clone(), q0: W.cam.quaternion.clone() };
  W.ranger.group.updateMatrixWorld(true);
  const frame = frames.attached(W.ranger.group);
  S.frame = frame;
  S.ctl = new WalkController({
    camera: W.cam, frame, interact: ctx.interact, preset: 'walk', gravity: 12.75, height: 1.7, position: [SEATS.pilot[0], 0, 0.12], yaw: Math.PI, pitch: -0.1,
    ...(() => { const d = walkData(W); return { floor: d.seabedLocal, floors: d.floors, colliders: d.colliders.concat(wreckCollidersLocal(W)) }; })(),
    onStep: e => onStep(ctx, e),
  });
  ctx.controller = S.ctl;
  syncDoors();
  S.ctl.look = false; S.ctl.move = false;
  S.ctl.update(0, ctx.input);
  S.mode = 'walk';
  S.zone = 'in';
  S.helmet.set(true);
  audio.sfx('bump_soft', { volume: 0.4 });
  audio.muffle(0.35, 1.2);
  audio.ambience('breath_calm', { volume: 0.35, fade: 2 });
  ctx.ui.reticle(true);
}

function onStep(ctx, e) {
  const W = S.W, a = ctx.audio;
  const out = S.zone === 'out';
  const pos = S.ctl.worldPose(_p, _q).position.clone();
  const yq = new THREE.Quaternion().setFromAxisAngle(_w.set(0, 1, 0), S.ctl.yaw).premultiply(W.ranger.group.quaternion);
  const foot = pos.add(new THREE.Vector3(e.foot ? 0.14 : -0.14, 0, -0.25).applyQuaternion(yq));
  const wet = foot.y < W.ocean.heightAt(foot.x, foot.z);
  if (wet) {
    W.ocean.splash(foot.setY(Math.max(foot.y, -0.1)), (e.speed > 1.6 ? 1.05 : 0.75) + Math.random() * 0.2);
    a.sfx('wade_step', { volume: 0.55, rate: 0.9 + Math.random() * 0.2 });
  } else a.sfx(out ? 'step_pad' : 'step_metal', { volume: 0.4, rate: 0.9 + Math.random() * 0.2 });
}

function worldPos() { return S.ctl ? S.ctl.worldPose(_p, _q).position.clone() : S.W.ranger.group.position.clone(); }

function walkStep(ctx, dt) {
  const W = S.W, c = S.ctl, { history, audio } = ctx;
  const p = c.position;
  const outside = p.z > CABIN.face + 0.05 || p.y < -0.2;
  if (outside && S.zone !== 'out') {
    S.zone = 'out';
    history.beginSegment('shallows', { chapter: 'miller', space: 'ocean', mode: 'wade', frame: 'miller-world' });
    S.looks.set(S.wave.moving ? 'wave' : 'surface', 3);
    audio.muffle(0.18, 1.5);
    audio.ambience('wind', { volume: 0.55, fade: 2 });
    audio.ambience('water_lap', { volume: 0.5, fade: 2 });
  } else if (!outside && S.zone === 'out' && p.z < CABIN.face - 0.25) {
    S.zone = 'in';
    if (S.wave.moving && !S.flags.boarded) { S.flags.boarded = true; history.event('board', { eta: r1(S.wave.arrive - ctx.director.time) }); }
    history.beginSegment(S.flags.boarded ? 'cabin-board' : 'cabin-surface', { chapter: 'miller', space: 'cabin', mode: 'walk', frame: 'ranger-local' });
    S.looks.set('cabin', 2);
    audio.muffle(0.35, 1);
    audio.ambience('wind', { volume: 0.25, fade: 1.5 });
  }
  const wading = S.zone === 'out' && p.y < W.seabedLocal + 0.65;
  if (wading && c.preset !== 'wade') c.setPreset('wade', { speed: WAVE.walk, runSpeed: WAVE.run, gravity: 12.75, bob: 0.085, sway: 0.03, stepLength: 0.56, accel: 1.1 });
  else if (!wading && c.preset !== 'walk') c.setPreset('walk', { gravity: 12.75, speed: S.zone === 'out' ? 1.0 : 1.45 });
  const wp = c.worldPose(_p, _q).position;
  const right = _w.set(1, 0, 0).applyQuaternion(_q);
  right.y = 0; right.normalize();
  const legs = W.legs, inWater = S.zone === 'out' && wp.y < 0.4, ank = S.body.ankles;
  for (let i = 0; i < 2; i++) {
    if (ank[i]) ank[i].getWorldPosition(legs[i].position); else legs[i].position.set(wp.x + right.x * (i ? 0.13 : -0.13), 0, wp.z + right.z * (i ? 0.13 : -0.13));
    legs[i].position.y = inWater ? 0 : 50;
  }
  if (S.zone === 'out') {
    const g = 0.5 + 0.5 * Math.sin(S.t * 0.37) * Math.sin(S.t * 0.13 + 1.3);
    S.gustAcc = (S.gustAcc || 0) + dt;
    if (S.gustAcc > 0.5) { S.gustAcc = 0; audio.ambience('wind', { volume: 0.4 + 0.35 * g + 0.2 * (S.wx.waveA || 0), fade: 0.5 }); }
  }
  if (S.zone === 'out' && !S.flags.recorder) { const b = bearingTo(W.wreck.root.position); S.wrist.setBearing(b.bearing, b.distance, 'BCN'); }
  else { const b = bearingTo(W.ranger.group.position); S.wrist.setBearing(b.bearing, b.distance, 'RGR'); }
}

function bearingTo(target) {
  const W = S.W, cam = W.cam;
  cam.getWorldDirection(_v); _v.y = 0; _v.normalize();
  const d = target.clone().sub(cam.position); d.y = 0;
  const dist = d.length(); d.normalize();
  const ang = Math.atan2(_v.x * d.z - _v.z * d.x, _v.x * d.x + _v.z * d.z) * 180 / Math.PI;
  return { bearing: ang, distance: dist };
}

function flyStep(ctx, dt) {
  const W = S.W, f = S.flight, { clock, input, audio } = ctx;
  const alt = altitude();
  clock.setRateLog(1 - Math.min(1, Math.max(0, alt) / CLIMB));
  if (f.controls && !S.flags.landed) {
    const vin = input.axis('rise');
    if (!vin && alt > 150) {
      const target = -Math.min(42, Math.max(8, (alt - 120) * 0.05));
      f.velocity.y += (target - f.velocity.y) * Math.min(1, dt * 0.6);
    }
    if (alt < 230 && W.ranger.gear < 0.01 && !S.gearT) { S.gearT = ctx.director.script(s => s.tween(4, u => W.ranger.setGear(u))); audio.sfx('hatch_hydraulic', { volume: 0.6 }); audio.sfx('latch', { volume: 0.5, delay: 4 }); }
  }
  if (f.controls && !S.flags.lifted && !S.riding && input.down('KeyT')) {
    const wp = W.wreck.root.position, p = f.position, pitch = alt > 60 ? 0.2 : 0.02;
    _v.set(wp.x - p.x, 0, wp.z - p.z);
    if (_v.lengthSq() > 400) f.alignTarget = _v.normalize().multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch)).clone();
  }
  keepOffWreck();
  keepOffPartner(ctx);
  const st = W.ranger.gear > 0.99 ? 1 - ss(0.02, Math.max(0.05, S.gearE - S.gearC), f.position.y - groundY()) : 0;
  if (Math.abs(st - S.stance) > 1e-3) { S.stance = st; W.ranger.setStance?.(st); }
  if (S.flags.landed && !S.carry) surfaceFlight(ctx, dt, alt);
  const thr = f.throttle, rcs = f.rcs.length(), idle = f.landed && rcs < 0.1;
  if (f.controls) S.engines?.set({ volume: idle ? 0.14 : 0.3 + 0.35 * thr + 0.15 * Math.min(1, rcs), rate: idle ? 0.85 : 0.9 + 0.25 * thr, fade: idle ? 1.2 : 0.2 });
  if (f.controls) W.ranger.setEngine(idle ? 0.2 : 0.35 + 0.65 * thr);
  S.spin ||= new THREE.Vector3(); S.lastW ||= new THREE.Vector3();
  if (dt > 0) S.spin.copy(f.angularVelocity).sub(S.lastW).multiplyScalar(0.6 / dt);
  if (S.spin.length() > 1) S.spin.setLength(1);
  S.lastW.copy(f.angularVelocity);
  W.ranger.setRcs?.(f.controls ? f.rcs : null, f.controls ? S.spin : null, f.controls && !f.landed ? 0.45 + 0.4 * Math.max(0, f.rcs.y) : f.controls && f.rcs.y > 0 ? 0.7 : 0);
  if (S.flags.lifted) S.main?.set?.(Math.max(0.35, thr, f.rcs.y > 0 ? 0.7 : 0));
  if (alt < 24 && f.controls && !idle) {
    S.spray += dt;
    if (S.spray > 0.14) {
      S.spray = 0;
      const k = 1 - alt / 24, a = Math.random() * Math.PI * 2, r = 3 + Math.random() * (5 + alt * 0.4);
      const c = f.position;
      W.ocean.splash(_v.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r), 0.6 + 2.4 * k * (0.6 + thr));
    }
  }
  S.ck.setFlight(f.state);
  S.ck.setAir(alt, f.velocity.y, { gear: W.ranger.gear > 0.99 ? 'DOWN' : W.ranger.gear > 0.01 ? 'MOVING' : 'UP', depth: -SEABED, wind: 8 + S.wx.wind * 30 });
  if (!S.flags.landed) {
    const inCloud = ss(DECK.base - 80, DECK.base + 120, W.cam.position.y);
    S.shake.set(0.25 + 0.9 * inCloud);
    if (f.controls) {
      const nose = f.forward(_v); nose.y = 0;
      if (nose.lengthSq() > 1e-6 && alt > 60 && alt < DECK.base) { nose.normalize().multiplyScalar(Math.cos(0.26)).setY(-Math.sin(0.26)); f.alignTarget = nose.clone(); f.assist.alignLatch = f._idle > 0.8 && !input.down('KeyT'); }
      else f.assist.alignLatch = false;
    }
    if (alt < 60) S.water.set({ wet: 0.25 + 0.75 * (1 - alt / 60), flow: 0.6 + 1.2 * f.throttle });
  }
  landingGuide(ctx, alt);
}

function keepOffWreck() {
  const W = S.W, f = S.flight, p = f.position, wp = W.wreck.root.position;
  if (!W.wreck.root.visible || p.y > groundY() + 9) return;
  const dx = p.x - wp.x, dz = p.z - wp.z, d = Math.hypot(dx, dz);
  if (d >= LAND.keepOut) return;
  const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
  p.x = wp.x + nx * LAND.keepOut; p.z = wp.z + nz * LAND.keepOut;
  const vn = f.velocity.x * nx + f.velocity.z * nz;
  if (vn < 0) { f.velocity.x -= vn * nx; f.velocity.z -= vn * nz; }
}

function keepOffPartner(ctx) {
  const o = ctx.net?.peer('ship');
  if (!o) return;
  const f = S.flight, p = f.position;
  if (Math.abs(p.y - o.p[1]) > 9) return;
  const dx = p.x - o.p[0], dz = p.z - o.p[2], d = Math.hypot(dx, dz);
  if (d >= CREW.keepOut) return;
  const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
  p.x = o.p[0] + nx * CREW.keepOut; p.z = o.p[2] + nz * CREW.keepOut;
  const vn = f.velocity.x * nx + f.velocity.z * nz;
  if (vn < 0) { f.velocity.x -= vn * nx; f.velocity.z -= vn * nz; }
}

function placePartner(sh, dt) {
  const o = S.W.other;
  if (!o) return;
  if (!sh) { o.group.visible = false; return; }
  const g = o.group, d = sh.s, L = S.partner ||= {};
  g.visible = true;
  g.position.copy(sh.p);
  g.quaternion.copy(sh.q);
  if (d.g !== L.g) { L.g = d.g; o.setGear?.(d.g); o.setStance?.(d.g > 0.99 ? 1 : 0); }
  if (d.h !== L.h) { L.h = d.h; o.setHatch?.(d.h); }
  if (d.r !== L.r) { L.r = d.r; o.setRamp?.(d.r); }
  if (d.e !== L.e) { L.e = d.e; o.setEngine?.(d.e); }
  o.update?.(dt);
}

function followWave(ctx, hw, dt) {
  if (!hw || S.carry || S.wave.next || hw.n || !S.flags.landed) return;
  if (hw.m && !S.wave.moving) { S.wave.x = hw.x; startWave(ctx, false, 'partner', hw.v); }
  const e = hw.x - S.wave.x, lim = 0.2 * Math.max(1, S.wave.speed) * dt;
  if (!S.wave.moving || Math.abs(e) > 600) S.wave.x = hw.x;
  else S.wave.x += Math.max(-lim, Math.min(lim, e));
}

function partnerRecorder(ctx) {
  if (S.flags.recorder) return;
  const W = S.W;
  S.flags.recorder = true;
  S.it.recorder.userData.interact.enabled = false;
  ctx.audio.sfx('beep_double', { volume: 0.4 });
  ctx.ui.subtitle('The other pilot has the recorder.', 4);
  if (W.wreck.setRecorder) ctx.director.script(s => s.tween(1.4, u => W.wreck.setRecorder(u)));
  else W.wreck.recorder.visible = false;
}

function surfaceFlight(ctx, dt, alt) {
  const W = S.W, f = S.flight, ui = ctx.ui;
  if (S.flags.lifted) { climbAssist(ctx, dt); return; }
  const parked = f.controls && f.landed && f.velocity.length() < 0.5;
  S.parkT = parked ? S.parkT + dt : 0;
  const ready = S.parkT > 0.8;
  S.it.harness.userData.interact.enabled = ready;
  if (ready !== S.reticleOn) { S.reticleOn = ready; ui.reticle(ready); }
  if (!f.landed && alt > 2 && !S.hop) {
    S.hop = true;
    S.looks.set('descent', 2);
    S.water.set({ wet: 0.5, flow: 1.0 });
    ctx.audio.ambience('water_lap', { volume: 0.1, fade: 2 });
    ctx.history.event('hop', { p: f.position.toArray().map(r1) });
  }
  const riding = !f.landed && alt > 3 && S.wave.moving && climbAssist(ctx, dt);
  S.riding = riding;
  if (!riding) f.assist.alignLatch = false;
  const head = LAND.hopCeiling - alt;
  S.atCeiling = !S.wave.moving && head < 14;
  if (!S.wave.moving && f.velocity.y > Math.max(0, head) * 0.5) f.velocity.y = Math.max(0, head) * 0.5;
  if (S.wave.moving && (riding || alt > LAND.departAlt)) S.flags.depart = true;
}

function fmtDist(d) { return d < 1000 ? `${Math.round(d / 5) * 5} m` : `${(d / 1000).toFixed(1)} km`; }

function landingGuide(ctx, alt) {
  const ui = ctx.ui, f = S.flight, W = S.W;
  if (S.flags.lifted && !S.flags.climbed && !S.carry && f.controls) { ui.guide('climb out   hold [Space]'); ui.mark(null); return; }
  if (S.flags.lifted || S.flags.depart || S.carry || !f.controls) { ui.guide(null); ui.mark(null); return; }
  const rp = W.ranger.group.position, wp = W.wreck.root.position;
  const dist = Math.hypot(wp.x - rp.x, wp.z - rp.z);
  const below = rp.y < DECK.base - 40;
  if (!below && !S.flags.landed) { ui.guide(null); ui.mark(null); return; }
  if (S.wave.moving || S.flags.recorder) ui.mark(null); else ui.mark(W.cam, W.wreck.lamp.getWorldPosition(_w), 'Beacon', fmtDist(dist));
  const sp = Math.hypot(f.velocity.x, f.velocity.z);
  const nose = f.forward(_w), nl = Math.hypot(nose.x, nose.z) * dist;
  const facing = nl > 1e-3 && (nose.x * (wp.x - rp.x) + nose.z * (wp.z - rp.z)) / nl > 0.94;
  const closing = dist > 1e-3 ? (f.velocity.x * (wp.x - rp.x) + f.velocity.z * (wp.z - rp.z)) / dist : 0;
  let g;
  if (f.landed) g = S.parkT < 0.8 ? null : S.wave.moving ? 'the wave is coming   hold [Space] to lift off' : S.flags.harness ? 'hold [Space] to lift off   or look down for the harness' : dist > LAND.far ? `beacon ${fmtDist(dist)} away   hold [Space] to hop closer` : 'landed   look down and hold [E] to release the harness';
  else if (S.atCeiling) g = dist > LAND.far ? (facing ? 'the Ranger hops no higher   [W] forward to the beacon' : 'the Ranger hops no higher   hold [T] to face the beacon') : 'the Ranger hops no higher   [C] descend';
  else if (dist > 320) g = !facing ? 'hold [T] to turn to the beacon   then [W] forward' : closing > 8 ? null : 'fly to the beacon   [W] forward   [S] brake';
  else if (sp > 16) g = 'slow down   [S] brake';
  else if (dist > LAND.far) g = facing ? 'closer to the beacon   [W] forward' : 'closer to the beacon   hold [T] to face it';
  else if (alt > 3) g = 'land here   [C] descend   [Space] climb';
  else g = null;
  ui.guide(g);
}

function groundGuide(ctx) {
  if (S.carry || S.arc || S.starting) return null;
  const h = ctx.history, W = S.W;
  if (S.mode === 'seat') {
    if (S.flags.flooded) return S.drain ? 'engines flooded   wait, or purge them on the console' : null;
    return S.wave.moving ? 'start the engines on the centre console' : 'start the engines on the console   or look down for the harness';
  }
  if (S.mode !== 'walk') return null;
  const back = S.flags.recorder || S.wave.moving;
  if (S.zone === 'in') {
    if (back && h.has('first_step')) return 'take the left seat';
    return S.flags.hatchOpen ? 'step out into the water' : 'walk to the hatch at the back of the cabin';
  }
  if (back) return 'back to the Ranger   hold [Shift] to wade faster';
  return worldPos().distanceTo(W.wreck.root.position) < 9 ? 'take the flight recorder from the wreck' : 'wade to the blinking beacon   your wrist shows the way';
}

function climbAssist(ctx, dt) {
  const f = S.flight, p = f.position;
  const toe = toeAt(p.z), d = toe - p.x;
  if (d < 2600 && d > -900 && S.wave.speed > 0) {
    let need = 0;
    for (const ax of [0, 50, 110, 180]) need = Math.max(need, S.W.ocean.heightAt(p.x + ax, p.z));
    const want = need + 45;
    const tA = d / S.wave.speed;
    if (d > 0 && tA < 40 && p.y < DECK.base) f.velocity.y = Math.min(f.velocity.y, Math.max(10, (240 - p.y) / Math.max(0.5, tA) + 10));
    if (need > 10 && p.y < want + 80) f.velocity.y = Math.max(f.velocity.y, Math.min(150, (want + 80 - p.y) * 1.2 + S.wave.speed * 0.6));
    const k = Math.exp(-1.4 * dt);
    f.velocity.x *= k; f.velocity.z *= k;
    f.alignTarget = _w.set(1, 0.42, 0).normalize().clone();
    f.assist.alignLatch = true;
    if (!S.flags.faceShot && d < 250) { S.flags.faceShot = true; ctx.history.snapshot('wave_face'); ctx.history.event('wave_face', { distance: Math.round(d), alt: Math.round(altitude()) }); }
    return true;
  }
  f.assist.alignLatch = false;
  return false;
}

function startWave(ctx, nominal = false, cause = 'engines', speed = null) {
  const now = ctx.director.time, net = ctx.net?.linked ? ctx.net : null;
  if (S.mode === 'fly') S.R.copy(S.W.ranger.group.position);
  const p = worldPos();
  let away = S.mode === 'walk' && S.zone === 'out' ? Math.hypot(p.x - S.R.x, p.z - S.R.z) : 0;
  const pb = net?.peer('body'), ps = net?.peer('ship');
  if (pb && ps && pb.m) away = Math.max(away, Math.hypot(pb.p[0] - ps.p[0], pb.p[2] - ps.p[2]));
  const d = toeAt(S.R.z) - S.R.x;
  const Tw = speed ? d / speed : nominal ? WAVE.nominal : away / WAVE.pace + WAVE.board + WAVE.spare + (net ? WAVE.crew : 0);
  if (net?.host) net.fact('miller.wave', { speed: r1(d / Tw), cause });
  S.wave.speed = d / Tw;
  S.wave.moving = true;
  S.wave.arrive = now + Tw;
  S.wave.arrive0 = now + Tw;
  S.wave.t0 = now;
  ctx.history.event('wave_start', { distance: Math.round(d), speed: r1(S.wave.speed), eta: r1(Tw), from: Math.round(away), cause });
  ctx.audio.ambience('wave_rumble', { volume: 0.05, fade: 2 });
}

function waveStep(ctx, dt) {
  const W = S.W, { audio } = ctx;
  if (S.wave.moving) S.wave.x -= S.wave.speed * dt;
  const dR = toeAt(S.R.z) - S.R.x;
  const a = S.wave.moving || S.lookdev ? ss(WAVE.start, 400, dR) : 0;
  if (S.wave.moving) {
    audio.ambience('wave_rumble', { volume: 0.08 + 0.85 * a, fade: 0.3 });
    audio.ambience('wave_near', { volume: ss(2500, 200, dR) * 0.9, fade: 0.3 });
    audio.ambience('wind_strong', { volume: ss(5000, 600, dR) * 0.7 * (S.zone === 'out' ? 1 : 0.4), fade: 0.5 });
    S.looks.exposureMul = S.zone === 'out' ? 1 - 0.08 * a : 1;
  }
  S.wx.waveA = a;
  if (S.flags.lifted || S.carry || S.lookdev || S.wave.done) return;
  if (!S.wave.moving) return;
  if (S.mode === 'fly') { if (altitude() > 3) return; S.R.copy(W.ranger.group.position); }
  const out = S.mode === 'walk' && S.zone === 'out';
  const p = out ? worldPos() : S.R;
  const d = toeAt(p.z) - p.x;
  if (d < (out ? 35 : 22)) hit(ctx, out ? 'water' : S.mode === 'walk' ? 'cabin' : 'seat');
}

function weatherStep(ctx, dt) {
  const W = S.W, X = S.wx;
  const a = X.waveA || 0, landed = !!S.flags.landed;
  const O = S.wxOverride || {};
  const wind = O.wind ?? (landed ? 0.42 + 0.55 * a : 0.55);
  const mist = O.mist ?? (landed ? 1 / 620 : 1 / 700);
  const draw = O.draw ?? (S.wave.moving && !S.flags.hit ? ss(3200, 300, toeAt(S.R.z) - S.R.x) : 0);
  X.wind += (wind - X.wind) * Math.min(1, dt * 0.5);
  X.mist += (mist - X.mist) * Math.min(1, dt * 0.5);
  X.draw += (draw - X.draw) * Math.min(1, dt * 0.8);
  X.acc += dt;
  if (X.acc > 0.25) {
    X.acc = 0;
    const rp = W.ranger.group.position;
    const tgt = S.flags.landed ? W.wreck.root.position : BEACON0;
    const b = bearingTo(tgt);
    S.ck.setBeacon({ bearing: b.bearing, distance: Math.hypot(tgt.x - rp.x, tgt.z - rp.z), strength: 0.85 });
    if (S.mode !== 'fly') S.ck.setFlight({ quaternion: W.ranger.group.quaternion, angularVelocity: _w.set(0, 0, 0), throttle: 0, assist: { rate: true } });
    if (Math.abs(X.wind - X.setWind) > 0.015) { W.ocean.setWind(X.wind); X.setWind = X.wind; }
    W.ocean.setMist(X.mist);
    W.ocean.setDrawdown(X.draw);
    if (W.ocean.keyLight) W.ocean.keyLight.intensity = (S.keyBase ?? 1) * (S.flags.landed && !S.flags.lifted ? 1 - 0.4 * a : 1);
    W.ocean.setWaveAir?.(S.wave.moving || S.lookdev ? a : 0, 1);
    if (W.ocean.sky?.uniforms?.mCloud) W.ocean.sky.uniforms.mCloud.value.x = O.cloud ?? (landed ? 0.8 - 0.4 * a : 1);
    W.cockpit.setBounce?.(S.carry ? 0.12 : S.drain ? 0.7 : landed ? 1 - 0.35 * a : 0.85 - 0.25 * ss(DECK.base - 100, DECK.base + 100, W.cam.position.y));
    if (landed && !S.flags.lifted && S.mode !== 'fly') S.ck.setAir(Math.max(0, altitude()), 0, { gear: 'DOWN', depth: W.ocean.heightAt(S.R.x, S.R.z) - SEABED, wind: 8 + X.wind * 34, note: draw > 0.1 ? 'LEVEL FALLING' : S.wave.moving ? 'SWELL RISING' : 'SEA STATE 3', noteColor: draw > 0.1 || S.wave.moving ? 'amber' : 'dim' });
  }
}

function shadowFollow(W) {
  const key = W.ocean.keyLight;
  if (!key) return;
  const c = W.ranger.group.position;
  const near = S.zone === 'out' ? worldPos() : c;
  const dRanger = near.distanceTo(c);
  const focus = dRanger < 40 ? c : near;
  _v.copy(W.ocean.sky?.uniforms?.mGlowDir?.value || _w.set(-0.32, 0.5, -0.8)).normalize();
  key.position.copy(focus).addScaledVector(_v, 80);
  key.target.position.copy(focus);
  key.target.updateMatrixWorld();
}

function beaconStep(ctx, dt) {
  const W = S.W;
  if (!W.wreck.root.visible) return;
  S.beaconT += dt;
  const ph = S.beaconT % 2;
  const on = ph < 0.12 && !S.flags.recorder;
  if (W.wreck.setStrobe) W.wreck.setStrobe(on ? 1 : 0); else W.wreck.lamp.material.color.setScalar(on ? 30 : 0.15);
  if (W.beaconLight) { W.wreck.lamp.getWorldPosition(W.beaconLight.position); W.beaconLight.intensity = on ? 6 : 0; }
  const F = S.flare;
  if (F) {
    F.glow = on ? 1 : F.glow * Math.exp(-dt * 3.2);
    W.wreck.lamp.getWorldPosition(F.sprite.position);
    const d = F.sprite.position.distanceTo(W.cam.position);
    const far = ss(25, 160, d), k = S.flags.recorder ? 0 : (0.1 + 0.9 * F.glow) * far * (0.35 + 0.65 * Math.exp(-d / 1400));
    F.sprite.visible = k > 0.002;
    F.mat.color.setRGB(40 * k, 20 * k, 6 * k);
    F.sprite.scale.setScalar(0.022 + 0.03 * F.glow * far);
  }
  if (Math.floor(S.beaconT) !== Math.floor(S.beaconT - dt)) S.rec.setState({ elapsedMinutes: recorderMinutes(ctx), firstHeard: `${Math.round(recorderMinutes(ctx) * 5)} YR AGO`, unit: 'LANDER 1', arrival: 'LOCAL 00:00:00', signal: 'LOOP "ALL GOOD"', entries: [{ t: '+00:00', text: 'TOUCHDOWN. HULL BREACH AFT.' }, { t: '+00:06', text: 'BEACON ARMED. AUTO REPEAT.' }, { t: '+00:31', text: 'WATER LEVEL FALLING' }, { t: '+00:33', text: 'SWELL ON RADAR 9 KM' }, { t: '+00:34', text: 'LAST ENTRY' }] });
  if (on && !S.blink && S.flags.landed) ctx.audio.sfx('beacon_ping', { volume: 0.55, position: W.wreck.lamp.getWorldPosition(_v) });
  S.blink = on;
}

function debrisStep(ctx, dt) {
  const W = S.W;
  if (!W.wreck.root.visible) return;
  W.wreck.model?.update(dt, (x, z) => W.ocean.heightAt(x, z));
  for (const o of W.wreck.debris) {
    o.getWorldPosition(_v);
    const h = W.ocean.heightAt(_v.x, _v.z);
    const hx = W.ocean.heightAt(_v.x + 0.4, _v.z) - h, hz = W.ocean.heightAt(_v.x, _v.z + 0.4) - h;
    const y = Math.max(h + o.userData.float, SEABED + 0.06) - W.wreck.root.position.y;
    o.position.y += (y - o.position.y) * Math.min(1, dt * 3);
    o.rotation.set(Math.atan2(hz, 0.4) * 0.8, o.userData.yaw + Math.sin(S.t * 0.2 + o.userData.phase) * 0.1, -Math.atan2(hx, 0.4) * 0.8);
  }
  const pull = S.wx.draw * 0.45 * dt;
  for (const o of W.wreck.trailPieces) {
    const h = W.ocean.heightAt(o.position.x, o.position.z);
    o.position.y += (Math.max(h + o.userData.float, SEABED + 0.05) - o.position.y) * Math.min(1, dt * 3);
    o.position.addScaledVector(UPWIND, pull);
    o.rotation.set(Math.sin(S.t * 0.7 + o.userData.phase) * 0.06, o.userData.yaw + Math.sin(S.t * 0.15 + o.userData.phase) * 0.15, Math.sin(S.t * 0.6 + o.userData.phase * 2) * 0.06);
  }
}

function takeRecorder(ctx) {
  const { history, ui, clock, audio } = ctx;
  const W = S.W, rec = W.wreck.recorder;
  S.flags.recorder = true;
  const minutes = recorderMinutes(ctx);
  history.event('recorder_taken', { localMinutes: r1(minutes), months: Math.round(clock.months()) });
  audio.sfx('latch', { volume: 0.7, position: rec.getWorldPosition(_v) });
  audio.sfx('beep_double', { volume: 0.4, delay: 0.6 });
  if (W.wreck.setRecorder) {
    ctx.director.script(async s => {
      await s.tween(1.4, u => W.wreck.setRecorder(u));
      ui.subtitle(`${minuteWords(Math.floor(recorderMinutes(ctx)))} minutes ago, local time.`, 4.5);
    });
    return;
  }
  W.scene.attach(rec);
  const p0 = rec.position.clone(), q0 = rec.quaternion.clone();
  ctx.director.script(async s => {
    await s.tween(1.2, u => {
      const cam = W.cam;
      const p1 = _w.set(0.04, -0.21, -0.56).applyQuaternion(cam.quaternion).add(cam.position);
      rec.position.lerpVectors(p0, p1, u);
      const q1 = _q.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromEuler(_e.set(0.25, 0, 0)));
      rec.quaternion.slerpQuaternions(q0, q1, u);
    });
    ui.subtitle(`${minuteWords(Math.floor(recorderMinutes(ctx)))} minutes ago, local time.`, 4.5);
    const tHold = ctx.director.time + 3.2;
    await s.until(() => {
      const cam = W.cam;
      rec.position.copy(_w.set(0.04, -0.21, -0.56).applyQuaternion(cam.quaternion).add(cam.position));
      rec.quaternion.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromEuler(_e.set(0.25, 0, 0)));
      return ctx.director.time > tHold;
    });
    const p2 = rec.position.clone();
    await s.tween(0.8, u => { const cam = W.cam; rec.position.copy(p2).add(_w.set(0, -0.5 * u, 0).applyQuaternion(cam.quaternion)); });
    rec.visible = false;
  });
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function minuteWords(n) {
  const tens = { 4: 'Forty', 5: 'Fifty', 6: 'Sixty', 7: 'Seventy' }[Math.floor(n / 10)];
  return tens ? tens + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
}

function recorderMinutes(ctx) { return 47.2 + Math.max(0, ctx.clock.ship - S.touchShip) / 60; }

function openHatch(ctx) {
  const W = S.W, a = ctx.audio, ck = W.cockpit;
  if (S.hatchBusy) return;
  S.hatchBusy = true;
  a.sfx('hatch_hydraulic', { volume: 0.7 });
  S.ck.setSystems({ hatch: 'MOVING' });
  ctx.director.script(async s => {
    await s.tween(2.2, u => ck.set?.('hatch', u, true));
    S.ctl?.collider('innerDoor') && (S.ctl.collider('innerDoor').min.y = 99, S.ctl.collider('innerDoor').max.y = 101);
    const od = S.ctl?.collider('innerDoorOpen'); if (od) { od.min.y = 0; od.max.y = 1.9; }
    a.sfx('latch', { volume: 0.6 });
    a.sfx('hatch_servo', { volume: 0.8 });
    S.looks.set('hatch', 3);
    W.steps.visible = true;
    W.steps.scale.set(1, 0.001, 1);
    await s.tween(2.6, u => { W.ranger.setHatch(u); W.steps.scale.y = Math.max(0.001, ss(0.5, 1, u)); });
    if (W.ramp && W.ranger.setRamp) { a.sfx('hatch_hydraulic', { volume: 0.5 }); await s.tween(2.4, u => W.ranger.setRamp(u)); }
    const o = S.ctl?.collider('outerDoor'); if (o) { o.min.y = 99; o.max.y = 101; }
    S.flags.hatch = true; S.flags.hatchOpen = true; S.hatchBusy = false;
    S.it.lever.userData.interact.label = 'close the hatch';
    S.ck.setSystems({ hatch: 'OPEN', caution: 'AFT HATCH OPEN' });
  });
}

function closeHatch(ctx, quick = false) {
  const W = S.W, a = ctx.audio, ck = W.cockpit;
  if (S.hatchBusy || !S.flags.hatchOpen) return Promise.resolve();
  S.hatchBusy = true;
  a.sfx('hatch_servo', { volume: 0.8 });
  S.ck.setSystems({ hatch: 'MOVING' });
  return ctx.director.script(async s => {
    const od = S.ctl?.collider('innerDoorOpen'); if (od) { od.min.y = 99; od.max.y = 101; }
    if (W.ramp && W.ranger.setRamp) await s.tween(quick ? 0.15 : 1.8, u => W.ranger.setRamp(1 - u));
    await s.tween(quick ? 0.2 : 2.0, u => { W.ranger.setHatch(1 - u); W.steps.scale.y = Math.max(0.001, 1 - ss(0, 0.5, u)); });
    W.steps.visible = false;
    const o = S.ctl?.collider('outerDoor'); if (o) { o.min.y = 0; o.max.y = 1.74; }
    a.sfx('hatch_hydraulic', { volume: 0.6 });
    await s.tween(quick ? 0.2 : 1.6, u => ck.set?.('hatch', 1 - u, true));
    const i = S.ctl?.collider('innerDoor'); if (i) { i.min.y = 0; i.max.y = 1.74; }
    a.sfx('latch', { volume: 0.7 });
    S.flags.hatchOpen = false; S.hatchBusy = false;
    S.it.lever.userData.interact.label = 'pull the hatch lever';
    S.ck.setSystems({ hatch: 'SEALED', caution: null });
    if (S.zone === 'in' || S.mode === 'seat') S.looks.set(S.mode === 'seat' ? 'escape' : 'cabin', 1.5);
  }).done;
}

function sit(ctx, carried) {
  const { history, audio } = ctx;
  if (S.mode === 'seat' || S.mode === 'carried') return;
  S.it.seat.userData.interact.enabled = false;
  S.it.lever.userData.interact.enabled = !carried;
  S.it.harness.userData.interact.enabled = !carried;
  history.event('sit', { seat: 'left', carried });
  setSeat(ctx, -0.12);
  S.wrist.target = 0;
  S.it.engines.userData.interact.enabled = true;
  S.it.engines.userData.interact.label = S.flags.flooded ? 'start engines (flooded)' : 'start engines';
  history.beginSegment(carried ? 'cockpit-carried' : 'cockpit-surface', { chapter: 'miller', space: 'cockpit', mode: 'seat', frame: 'ranger-local', carried });
  S.looks.set('escape', 1.5);
  audio.muffle(0.3, 1);
  for (const l of S.W.legs) l.position.y = 50;
}

async function startEngines(ctx) {
  const { audio, history } = ctx;
  const W = S.W;
  if (S.flags.flooded) { floodedStart(ctx); return; }
  if (S.flags.engines || S.starting) return;
  S.starting = true;
  if (S.hatchBusy) await ctx.director.until(() => !S.hatchBusy);
  if (S.flags.hatchOpen) await closeHatch(ctx, false);
  if (S.flags.flooded || S.carry || S.mode !== 'seat') { S.starting = false; return; }
  S.it.engines.userData.interact.enabled = false;
  S.it.lever.userData.interact.enabled = false;
  S.it.harness.userData.interact.enabled = false;
  S.flags.engines = true;
  history.event('engines_start', { flooded: !!S.flags.hit, eta: r1(S.wave.arrive - ctx.director.time) });
  audio.sfx('engine_spool', { volume: 0.8 });
  S.engines?.set({ volume: 0.55, rate: 1, fade: 1.5 });
  S.ck.setEngine({ state: 'RUN', throttle: 0.3 });
  S.ck.setSystems({ engines: 'RUN', caution: null });
  const f = S.flight;
  S.parkT = 0; S.reticleOn = true;
  f.enabled = true; f.controls = true; f.landed = true;
  f.velocity.set(0, 0, 0); f.angularVelocity.set(0, 0, 0);
  f.head.yaw = S.seatCtl.yaw; f.head.pitch = S.seatCtl.pitch;
  ctx.controller = f;
  S.mode = 'fly';
  history.beginSegment('liftoff', { chapter: 'miller', space: 'ocean', mode: 'fly', frame: 'miller-world' });
  S.starting = false;
}

function liftoff(ctx) {
  const { history, clock, state, audio } = ctx;
  const W = S.W;
  S.flags.lifted = true;
  state.surfaceSeconds = Math.round((clock.ship - S.touchShip) * 100) / 100;
  state.waveHit = !!S.flags.hit;
  const margin = Number.isFinite(S.wave.arrive0) ? r1(S.wave.arrive0 - ctx.director.time) : null;
  history.event('liftoff', { margin, next: Number.isFinite(S.wave.arrive) ? r1(S.wave.arrive - ctx.director.time) : null, surfaceSeconds: state.surfaceSeconds, months: Math.round(clock.months()), hits: S.wave.passes });
  history.snapshot('liftoff');
  S.main = audio.engine?.('main_engine');
  S.main?.ignite?.(Math.max(0.4, S.flight.throttle));
  S.looks.set('climb', 3);
  S.water.set({ wet: 0.6, flow: 1.4 });
  S.shake.set(0.35);
  audio.ambience('water_lap', { volume: 0, fade: 2 });
  audio.ambience('breath_stress', { volume: 0.3, fade: 3 });
  ctx.director.script(async s => { await s.until(() => altitude() > 30); await s.tween(3, u => W.ranger.setGear(1 - u)); });
}

function floodedStart(ctx) {
  const { audio } = ctx;
  audio.sfx('engine_flood', { volume: 0.9 });
  audio.sfx('alarm_short', { volume: 0.35, delay: 0.5 });
  S.shake.kick(0.7);
  S.ck.failure(0.11);
  S.ck.setSystems({ caution: 'NO IGNITION  DRAIN' });
  ctx.director.script(async s => { await s.wait(0.6); S.ck.failure(S.carry ? 0.1 : 0.001); });
  ctx.history.event('flooded_start', { drain: S.drain ? r1(S.drain.left) : null });
}

function purge(ctx) {
  const D = S.drain;
  S.W.cockpit.set?.('rcs', S.W.cockpit.get?.('rcs') > 0.5 ? 0 : 1);
  ctx.audio.sfx('switch_4', { volume: 0.6 });
  if (!D || (S.purges || 0) >= 3) return;
  S.purges = (S.purges || 0) + 1;
  D.left = Math.max(0, D.left - 7);
  ctx.audio.sfx('engine_drain', { volume: 0.45 });
  ctx.history.event('purge', { left: r1(D.left) });
}

function hit(ctx, where) {
  const { history, audio, state } = ctx;
  const W = S.W;
  S.flags.hit = true;
  S.flags.flooded = true;
  S.wave.passes++;
  state.waveHit = true;
  history.event('wave_hit', { where, pass: S.wave.passes, months: Math.round(ctx.clock.months()), p: worldPos().toArray().map(r1) });
  history.snapshot('wave_hit');
  audio.sfx('wave_hit', { volume: 1 });
  ctx.input.rumble?.(1, 1.4);
  if (S.mode === 'fly') S.R.copy(W.ranger.group.position);
  S.carry = { t: 0, where, y0: W.ranger.group.position.y, phase: 'ride', vx: 0 };
  S.drain = null;
  S.flags.engines = false;
  S.parkT = 0;
  ctx.ui.guide(null); ctx.ui.mark(null);
  S.flight.controls = false;
  S.flight.enabled = false;
  for (const k of ['engines', 'seat', 'lever', 'recorder', 'harness']) S.it[k].userData.interact.enabled = false;
  S.wrist.target = 0;
  ctx.director.script(async s => {
    if (where === 'water') {
      const T = { t: 0, p: W.cam.position.clone(), yaw: 0, pitch: 0 };
      const q = new THREE.Quaternion(), base = W.cam.quaternion.clone(), e = new THREE.Euler();
      S.mode = 'tumble';
      ctx.controller = { position: T.p, quaternion: q, update(dt, input) {
        T.t += dt;
        const l = input.look();
        T.yaw -= l.x; T.pitch -= l.y;
        T.p.x -= S.wave.speed * 0.3 * dt;
        T.p.y += (Math.min(6, T.t * 1.4) - (T.p.y - S.R.y + 1.5)) * Math.min(1, dt);
        const k = Math.min(1, T.t / 1.2);
        e.set(T.pitch + k * (Math.sin(T.t * 1.9) * 0.9 + T.t * 0.6), T.yaw + k * Math.sin(T.t * 0.8) * 1.2, k * Math.sin(T.t * 1.3 + 0.4) * 1.4, 'YXZ');
        q.copy(base).multiply(_q.setFromEuler(e));
        W.cam.position.copy(T.p); W.cam.quaternion.copy(q); W.cam.updateMatrixWorld();
      } };
      S.helmet.set(true);
      S.shake.set(2.0);
      audio.muffle(0.85, 0.3);
      audio.sfx('splash_big', { volume: 1 });
      S.looks.set('carried', 0.4);
      await s.tween(0.5, u => W.ocean.setSubmerged?.(u));
      await s.wait(4.2);
      ctx.film.to({ fadeColor: 0x000000 }, 0);
      await s.fade(1, 0.6);
      W.ocean.setSubmerged?.(null);
    } else if (where === 'cabin') {
      ctx.film.to({ fadeColor: 0x10140f }, 0);
      await s.fade(1, 0.4);
    }
    if (S.flags.hatchOpen) { await closeHatch(ctx, true); }
    if (S.mode !== 'seat') { S.mode = 'none'; sit(ctx, true); }
    S.mode = 'carried';
    S.it.engines.userData.interact.enabled = true;
    S.it.engines.userData.interact.label = 'start engines (flooded)';
    S.looks.set('carried', 0.5);
    S.shake.set(2.4);
    audio.ambience('heartbeat', { volume: 0.4, fade: 3 });
    audio.muffle(0.4, 1);
    S.ck.failure(0.1);
    S.ck.setSystems({ engines: 'FLOODED', drain: WAVE.drain, drainTotal: WAVE.drain, caution: null });
    S.ck.showSystems(true);
    S.ck.setEngine({ state: 'FLOODED', throttle: 0 });
    S.engines?.set({ volume: 0, fade: 0.5 });
    W.ranger.setEngine(0);
    if (where !== 'seat') { await s.wait(where === 'water' ? 0.6 : 1.0); await s.fade(0, 1.4); ctx.film.to({ fadeColor: 0x000000 }, 0); }
  });
}

function carryStep(ctx, dt) {
  const W = S.W, C = S.carry, { audio, history } = ctx;
  if (!C) return;
  const rg = W.ranger.group;
  C.t += dt;
  const p = rg.position, H = WAVE.height;
  if (C.phase === 'ride') {
    const sm = p.x - toeAt(p.z);
    if (sm > -40) C.vx += (-S.wave.speed * 0.35 - C.vx) * Math.min(1, dt * 0.7);
    p.x += C.vx * dt;
    const h = W.ocean.heightAt(p.x, p.z);
    const want = Math.max(S.R.y, h + 1.2);
    p.y += (want - p.y) * Math.min(1, dt * 3.5);
    const hx = W.ocean.heightAt(p.x + 6, p.z) - W.ocean.heightAt(p.x - 6, p.z);
    tilt(rg, Math.atan2(hx, 12) * 0.85 + Math.sin(C.t * 1.7) * 0.12 * ss(-60, 0, sm), Math.sin(C.t * 1.1 + 0.5) * 0.35 * ss(-60, 0, sm), dt * 2.5);
    const sub = ss(0.16 * H, 0.24 * H, sm);
    S.water.set({ wet: 1, sheet: Math.max(ss(-30, 60, sm) * 0.5, sub), flow: 2.5 });
    if (sm > 0) S.shake.set(2.4);
    if (S.mode !== 'tumble') W.ocean.setSubmerged?.(sub > 0.01 ? sub : null);
    if (sm > 0.25 * H || C.t > 16) { C.phase = 'under'; C.tu = 0; W.ocean.setSubmerged?.(1); history.event('wave_carried', { rise: Math.round(p.y - S.R.y), seconds: r1(C.t) }); }
  } else if (C.phase === 'under') {
    C.tu += dt;
    tilt(rg, Math.sin(C.tu * 0.9) * 0.4, Math.sin(C.tu * 0.6 + 1) * 0.5, dt);
    if (!C.jumped && C.tu > 1.5) {
      C.jumped = true;
      S.wave.x = p.x - meander(p.z) - 5.32 * H - (S.wave.next ? WAVE.gap : 0);
      p.y = S.R.y + 3;
    }
    if (C.tu > 4) { C.phase = 'settle'; C.ts = 0; W.ocean.setSubmerged?.(null); S.water.set({ wet: 1, sheet: 0, flow: 0.35 }); S.shake.set(0.6); audio.sfx('splash_big', { volume: 0.9 }); }
  } else if (C.phase === 'settle') {
    C.ts += dt;
    const h = W.ocean.heightAt(p.x, p.z);
    p.y += (Math.max(S.R.y, Math.min(S.R.y + 1.5, h + 1.4)) - p.y) * Math.min(1, dt * 1.2);
    tilt(rg, 0.06 * Math.sin(C.ts * 0.8), 0.09 * Math.exp(-C.ts * 0.4) * Math.sin(C.ts * 1.3) + 0.035, dt * 1.2);
    _e.setFromQuaternion(rg.quaternion, 'YXZ');
    const dy = Math.atan2(Math.sin(START.yaw - _e.y), Math.cos(START.yaw - _e.y));
    rg.quaternion.premultiply(_q.setFromAxisAngle(_v.set(0, 1, 0), dy * Math.min(1, dt * 0.35)));
    if (C.ts > 6) {
      S.carry = null;
      S.R.set(p.x, S.R.y, p.z);
      p.y = S.R.y;
      S.mode = 'seat';
      S.drain = { left: WAVE.drain, total: WAVE.drain };
      S.shake.set(0);
      S.ck.failure(0.001);
      S.looks.set('drift', 3);
      audio.ambience('wave_rumble', { volume: 0.25, fade: 4 });
      audio.ambience('wave_near', { volume: 0, fade: 4 });
      S.it.engines.userData.interact.enabled = true;
      S.it.engines.userData.interact.label = 'start engines (flooded)';
      S.it.purge.userData.interact.enabled = true;
      history.event('drain_start', { seconds: WAVE.drain, second: Math.round(toeAt(p.z) + WAVE.gap - p.x) });
      S.wave.arrive = Infinity;
      S.flags.hit = true;
      if (S.wave.next) { S.wave.done = true; S.secondArrive = Infinity; }
      else S.secondArrive = ctx.director.time + (S.wave.x + WAVE.gap + meander(p.z) - p.x) / Math.max(1, S.wave.speed);
      S.wave.next = true;
    }
  }
  rg.updateMatrixWorld(true);
}

function driftStep(ctx, dt) {
  const D = S.drain, { audio, history } = ctx;
  if (!D) return;
  D.left = Math.max(0, D.left - dt);
  S.ck.setSystems({ engines: D.left > 0 ? 'FLOODED' : 'OFF', drain: D.left, drainTotal: D.total });
  if (Math.floor(D.left) !== Math.floor(D.left + dt) && D.left > 0 && Math.floor(D.left) % 10 === 0) audio.sfx('warn_beep', { volume: 0.35 });
  const rg = S.W.ranger.group;
  tilt(rg, 0, 0.035 * (D.left / D.total), dt);
  if (D.left <= 0) {
    S.drain = null;
    S.flags.flooded = false;
    audio.sfx('engine_drain', { volume: 0.8 });
    audio.ambience('heartbeat', { volume: 0, fade: 3 });
    S.ck.failure(0);
    S.ck.showSystems(false);
    S.ck.setEngine({ state: 'READY' });
    S.ck.setSystems({ engines: 'READY', drain: 0 });
    S.it.engines.userData.interact.label = 'start engines';
    S.it.purge.userData.interact.enabled = false;
    history.event('drain_done', {});
    S.wave.arrive = S.secondArrive;
  }
}

function tilt(obj, pitch, roll, k) {
  _e.setFromQuaternion(obj.quaternion, 'YXZ');
  const yaw = _e.y;
  _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
  obj.quaternion.slerp(_q, Math.min(1, k));
}

const FIXED = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), update() {} };

export function stage(ctx, name, o = {}) {
  const W = S.W, rg = W.ranger, { clock, director } = ctx;
  director.cancelScripts();
  S.lookdev = true;
  S.carry = null; S.drain = null;
  const landed = name !== 'breakout' && name !== 'touchdown';
  rg.group.quaternion.setFromAxisAngle(_v.set(0, 1, 0), START.yaw);
  rg.setLights(true);
  S.ck.failure(0);
  W.ocean.setSubmerged?.(null);
  S.stance = landed ? 1 : 0; S.parkT = 0;
  if (landed) {
    rg.setGear(1); rg.setEngine(0); rg.setStance?.(1);
    rg.group.position.set(LZ.x, SEABED + rg.gearHeight, LZ.z);
    rg.group.updateMatrixWorld(true);
    S.flags.landed = true;
    S.R.copy(rg.group.position);
    S.touchShip = clock.ship - (o.surface ?? 60);
    clock.setRateLog(1);
    placeWreck(ctx);
    const dist = o.wave ?? WAVE.start;
    S.wave.x = S.R.x + dist - meander(S.R.z);
    S.wave.visible = true; S.wave.moving = !!o.run; S.wave.speed = o.run ? 50 : 0; S.wave.arrive = Infinity; S.wave.arrive0 = Infinity;
    S.wx.waveA = ss(WAVE.start, 400, dist) * (o.waveA ?? 1);
    W.ocean.setWave({ x: S.wave.x, visible: true, height: WAVE.height, gap: WAVE.gap, second: true, speed: S.wave.speed });
    S.engines?.set({ volume: 0, fade: 0 });
  } else {
    S.wave.visible = false;
    W.ocean.setWave({ visible: false });
  }
  S.wxOverride = o.wx || null;
  if (o.wx) { S.wx.wind = o.wx.wind ?? S.wx.wind; S.wx.mist = o.wx.mist ?? S.wx.mist; S.wx.draw = o.wx.draw ?? 0; S.wx.setWind = -1; S.wx.acc = 1; }
  const hatch = o.hatch ? 1 : 0;
  rg.setHatch(hatch); rg.setRamp?.(hatch); W.cockpit.set?.('hatch', hatch, true);
  S.flags.hatch = S.flags.hatchOpen = !!hatch;
  S.flags.recorder = !!o.recorder;
  if (W.wreck.setRecorder) W.wreck.setRecorder(o.recorder ? 1 : 0); else W.wreck.recorder.visible = !o.recorder;
  S.helmet.set(!!o.helmet);
  S.wrist.target = o.wrist ? 1 : 0;
  S.water.set({ wet: o.wet ?? 0.2, sheet: o.sheet ?? 0, flow: o.flow ?? 0.3 });
  S.shake.set(o.shake ?? 0);
  if (o.view === 'fp') {
    if (o.p === 'approach') { o.p = rg.group.localToWorld(wreckApproach()); const rp = (W.wreck.display?.mesh || W.wreck.recorder).getWorldPosition(new THREE.Vector3()); o.yaw = Math.atan2(-(rp.x - o.p.x), -(rp.z - o.p.z)); }
    standUp(ctx);
    S.arc = null; S.ctl.look = true; S.ctl.move = true;
    const lp = rg.group.worldToLocal(o.p.clone());
    S.ctl.teleport([lp.x, W.seabedLocal, lp.z], (o.yaw ?? 0) - START.yaw, o.pitch ?? 0);
    S.zone = lp.z > CABIN.face ? 'out' : 'in';
    if (S.zone === 'out') S.ctl.setPreset('wade', { speed: WAVE.walk, runSpeed: WAVE.run, gravity: 12.75, bob: 0.085, sway: 0.03, stepLength: 0.56, accel: 1.1 });
  } else if (o.view === 'ext') {
    ctx.controller = FIXED;
    S.mode = 'ext';
    W.cam.position.copy(o.cam);
    W.cam.up.set(0, 1, 0);
    W.cam.lookAt(o.at);
    W.cam.fov = o.fov ?? 40; W.cam.updateProjectionMatrix();
    S.zone = 'out';
  } else if (o.view === 'fly') {
    rg.group.position.copy(o.p);
    if (o.align) rg.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), o.align, new THREE.Vector3(0, 1, 0)));
    rg.setGear(o.gear ?? 0); rg.setStance?.(0);
    const f = S.flight;
    f.enabled = true; f.controls = !!o.controls; f.landed = false;
    f.velocity.copy(o.v || new THREE.Vector3());
    f.angularVelocity.set(0, 0, 0);
    f.head.yaw = o.yaw ?? 0; f.head.pitch = o.pitch ?? 0;
    ctx.controller = f;
    S.mode = 'fly';
    S.flags.lifted = !!o.lifted;
    S.flags.landed = !!o.lifted;
  } else {
    if (o.p) { rg.group.position.copy(o.p); rg.group.updateMatrixWorld(true); }
    setSeat(ctx, o.pitch ?? -0.1, o.yaw ?? 0);
    if (o.carry) { S.carry = { t: 3, where: 'seat', phase: 'ride', vx: 0 }; S.mode = 'carried'; S.wave.speed = 50; S.wave.moving = true; }
    if (o.drain) { S.ck.showSystems(true); S.drain = { left: o.drain, total: WAVE.drain }; S.flags.flooded = true; S.ck.setSystems({ engines: 'FLOODED', drain: o.drain, drainTotal: WAVE.drain }); S.ck.setEngine({ state: 'FLOODED', throttle: 0 }); }
  }
  if (o.next) S.wave.next = true;
  W.cam.fov = o.fov ?? (o.view === 'ext' ? 40 : 62); W.cam.updateProjectionMatrix();
  S.looks.set(o.look || (landed ? 'surface' : 'descent'), 0);
  return { S, W };
}
