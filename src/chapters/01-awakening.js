// Chapter 1, Awakening (pilot 1 in pod A and port A, the co-op second pilot mirrored in pod B and port B): frost on the pod lid, tubes striking, the dead lab hatch and the anomaly, the ring walk, the habitat, the spine ladder into zero-g, the dock tunnel. History: ring unrolled (s, y, z) for lab, ring and spine; Endurance local for the hub.
import * as THREE from 'three';
import { createWake } from './shared/wake.js';
import { createInteriorRig, MOD, DIM, RF, THETA0 } from './shared/interior-rig.js';

let S = null;
const HATCH = new THREE.Vector3(MOD.lab + DIM.HL, DIM.HY, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Quaternion();
const r3 = v => Math.round(v * 1000) / 1000;
const SOUNDS = ['m_waking', 'ring_hum', 'hub_hum', 'tube_hum', 'breath_calm', 'heartbeat', 'frost', 'cryo_hiss', 'cryo_lid', 'tube_strike', 'step_pad', 'step_metal', 'ladder_rung', 'anomaly', 'latch', 'hatch_hydraulic', 'hatch_servo', 'button', 'bump_soft'];

export default {
  id: 'awakening',

  async load(ctx) {
    const net = ctx.net, me = net?.port || 'A', ot = me === 'A' ? 'B' : 'A', sz = me === 'A' ? 1 : -1;
    const rig = await createInteriorRig(ctx, { firstSweep: 13, ports: net ? ['A', 'B'] : ['A'] });
    const I = rig.interior;
    I.setAge(0);
    I.setLights(1, 0);
    I.setPodLid(me, 0); I.setFrost(me, 1);
    if (net) { I.setPodLid(ot, 0); I.setFrost(ot, 1); I.setHatch('hubRangerB', 1); } else { I.setPodLid('B', 1); I.setFrost('B', 0); }
    I.setHatch('lab', 0); I.setHatch('ceiling', 0); I.setLever(0);
    I.setAnomaly(0); I.setDust(0.3);
    const eyeRing = rig.anchorRing('podA_eye');
    if (me === 'B') eyeRing.z = -eyeRing.z;
    const eye = rig.ring(eyeRing.s, eyeRing.y, eyeRing.z);
    const labTubes = I.tubes.filter(t => t.zone === 'lab').sort((a, b) => a.light.distanceTo(eye) - b.light.distanceTo(eye));
    for (const t of labTubes) I.setTubeLight(t.index, 0.03);
    I.setVisibleZone('lab');
    I.setPodLight(0); I.setBreath(0);
    const D = rig.D;
    D.podA_status?.setState({ pod: '01', occupant: net ? 'PILOT 1' : 'PILOT', status: 'STASIS', cycles: 1, age: 34.0, temp: 278.1, heartRate: 4 });
    D.podB_status?.setState(net ? { pod: '02', occupant: 'PILOT 2', status: 'STASIS', cycles: 1, age: 34.0, temp: 278.1, heartRate: 4 } : { pod: '02', occupant: 'WREN, A.', status: 'EMPTY', cycles: 1, age: 38.0 });
    D.consoleLab?.setState({ title: 'SICK BAY  /  NOTE', right: 'A.WREN', lines: [{ text: 'AWAKE. HOLDING THE RING.', color: 'hi' }, net ? 'RANGERS 1 AND 2 ARE PREPPED' : 'RANGER 1 IS PREPPED', net ? 'ON THE HUB, PORTS A AND B.' : 'ON THE HUB, PORT A.', { text: 'UP THE SPINE. GO WHEN READY.', color: 'dim' }, { text: '- A', color: 'dim' }], cursor: true });
    for (const id of net ? ['A', 'B'] : ['A']) {
      rig.signs[id].setState({ title: `DOCK PORT ${id}`, lines: [{ text: id === 'A' ? 'RANGER 1' : 'RANGER 2', color: 'hi', size: 30 }, 'PREPPED', { text: 'HATCH OPEN', color: 'amber' }] });
      rig.signs[id].setPower(1);
    }
    rig.rangers[me].beacon = true;
    const A = ctx.audio;
    if (A.raw?.preload) A.preload('awakening'); else A.load(SOUNDS);
    D.consolePod?.setState({ battery: 'OK', fuelCells: 'OK', avionics: 'STBY', rcs: 'SAFE', clamps: 'LOCKED', hatch: 'SEALED', engines: 'SAFE' });
    D.consoleEngineA?.setState({ battery: 'OK', buses: ['A', 'B'], fuelCells: 'OK', engines: 'SAFE', caution: null });
    D.missionBoard?.setState({ selected: 0 });
    D.commsLog?.setState({ entries: [{ t: 'T+00y 00m', title: 'NO MESSAGES.', text: 'Channel open.', read: true }] });
    const lever = I.interactables.find(i => i.id === 'labHatchLever');
    const ceiling = I.interactables.find(i => i.id === 'hatch.ceiling');
    const board = I.interactables.find(i => i.id === 'missionBoard');
    S = { rig, I, D, eye, eyeRing, me, ot, sz, labTubes, lever: lever.object, ceiling: ceiling.object, board: board.object, flags: {}, mode: 'lying', t: 0, sel: 0 };
    lever.object.userData.interact = { id: 'labHatchLever', label: 'pull the manual release', hold: 0.5, range: 2.2, radius: 0.25 };
    ceiling.object.userData.interact = { id: 'ceilingHatch', label: 'open the hatch', hold: 0.8, range: 2.6, radius: 0.6, enabled: false, once: true };
    board.object.userData.interact = { id: 'missionBoard', label: 'next world', range: 2.4, radius: 0.5 };
    S.wake = await createWake(ctx, rig, { pod: me });
    await net?.prepare(rig.scene, rig.camera);
    await rig.compile();
  },

  enter(ctx) {
    const { film, history, interact, audio } = ctx;
    S.rig.enter();
    film.look('interior', 0, { exposure: 0.02, letterbox: 1, vignette: 0.6, saturation: 0.86, contrast: 0.3 });
    ctx.controller = S.wake.controller;
    interact.setRoots([S.I.group]);
    interact.occlude = S.rig.occlude;
    S.lever.userData.interact.onUse = () => deadLever(ctx);
    S.ceiling.userData.interact.onUse = () => { S.flags.ceilingMine = true; openCeiling(ctx); };
    S.board.userData.interact.onUse = () => { S.sel = (S.sel + 1) % 3; S.D.missionBoard.setState({ selected: S.sel }); audio.sfx('button', { volume: 0.5 }); };
    ctx.ui.reticle(false);
    teach(ctx);
    const N = ctx.net;
    if (N) {
      N.stage({ scene: S.rig.scene, body: podBody, seen: p => S.I.zoneVisible(p), world: () => ({ sweep: Math.round(S.rig.sweep.t * 100) / 100 }), applyWorld: w => { if (w.sweep != null && Math.abs(w.sweep - S.rig.sweep.t) > 0.3) S.rig.sweep.t = w.sweep; } });
      N.share('awakening.anomaly', () => S.flags.anomaly, () => { S.flags.pushed = true; });
      N.share('awakening.ceiling', () => S.flags.ceilingUse, () => { if (!S.flags.ceilingUse) openCeiling(ctx); });
      N.share(`awakening.lid.${S.me}`, () => S.flags.lid);
      N.share(`awakening.lid.${S.ot}`, null, () => otherLid(ctx));
    }
    history.beginSegment('cryo-lab', { chapter: 'awakening', space: 'ring', mode: 'walk', frame: 'ring-unrolled', RF, theta0: THETA0 });
    audio.ambience('ring_hum', { volume: 0.25, fade: 8 });
    S.breath = audio.loop('breath_calm', { volume: 0.5 });
    S.heart = audio.loop('heartbeat', { volume: 0.35 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    S.t += dt;
    ctx.controller.update(dt, ctx.input);
    S.wake.follow(dt, S.ctl, S.mode === 'walk' && !ctx.view?.active);
    transitions(ctx);
    S.rig.update(dt);
    sample(ctx, dt);
  },

  exit(ctx) {
    ctx.audio.ambience('ring_hum', { volume: 0, fade: 2 });
    ctx.audio.ambience('hub_hum', { volume: 0, fade: 2 });
    S.breath?.stop(1); S.heart?.stop(1);
  },

  dispose() { S.wake.dispose(); S.rig.dispose(); S = null; },

  async auto(ctx, bot) {
    await bot.until(() => ctx.director.beat === 'dark' && S.t > 7.5, 30, 'dark');
    await bot.shot('awakening-1-frost');
    await bot.until(() => ctx.director.beat === 'thaw', 30, 'thaw');
    await bot.wait(3);
    await bot.shot('awakening-1b-thaw');
    await bot.until(() => S.mode === 'rise', 30, 'sit up');
    await bot.wait(2.6);
    await bot.shot('awakening-2-sitting');
    await bot.until(() => S.mode === 'walk', 60, 'stand up');
    const port = S.I.portholes.find(p => p.id === 'lab.b').position;
    (async () => { let lit = false; while (S && S.mode === 'walk' && !S.flags.open) { const k = S.rig.sweep.k > 0.55; if (k && !lit) bot.sight(port, 2.2); lit = k; await bot.wait(0.3); } })();
    await bot.lookAround(2.5);
    await bot.face(port, { tol: 0.05 });
    await bot.wait(1.2);
    await bot.shot('awakening-3-lab');
    await bot.face(S.D.consoleLab.mesh, { tol: 0.05 });
    await bot.wait(1.0);
    await bot.read('AWAKE. HOLDING THE RING. RANGER 1 IS PREPPED ON THE HUB, PORT A. UP THE SPINE. GO WHEN READY.');
    await bot.walkTo([3.9, 0, 0.6], { tol: 0.25 });
    await bot.linger(0.8);
    await bot.use('labHatchLever', { unless: () => S.flags.anomaly || S.flags.pushed });
    await bot.sight(S.lever, 6);
    await bot.until(() => S.flags.anomaly, 10, 'anomaly');
    await bot.wait(0.9);
    await bot.shot('awakening-4-anomaly-dust');
    await bot.wait(1.0);
    await bot.shot('awakening-4-anomaly-lever');
    await bot.until(() => S.flags.open, 30, 'hatch open');
    await bot.shot('awakening-5-hatch-open');
    for (const s of [6.2, MOD.pod, MOD.engine, MOD.hab - 2.2]) await bot.walkTo([s, 0, 0], { tol: 0.4 });
    await bot.shot('awakening-6-habitat');
    await bot.sight(S.I.anchors.hydroponics.position, 2.5);
    await bot.walkTo([MOD.hab - 0.3, 0, 1.1], { tol: 0.3 });
    await bot.face(S.D.missionBoard.mesh, { tol: 0.05 });
    await bot.read('MISSION BOARD MILLER ACTIVE ALL GOOD');
    await bot.use('missionBoard');
    const L = S.rig.ladders.hab;
    await bot.walkTo([(L.min[0] + L.max[0]) / 2, 0, (L.min[2] + L.max[2]) / 2], { tol: 0.12 });
    await bot.use('ceilingHatch', { unless: () => S.flags.ceilingUse });
    await bot.until(() => S.flags.ceiling, 10, 'ceiling hatch');
    await bot.look(() => bot.mouse(0, -200), 0.3);
    await bot.hold('KeyW', () => S.mode === 'climb' && S.ctl.space === 'spine' && S.ctl.position.y > 12, 60, 'spine');
    await bot.shot('awakening-7-spine');
    await bot.hold('KeyW', () => S.mode === 'float', 60, 'glide');
    await bot.until(() => S.zone === 'hub', 40, 'hub');
    await bot.wait(1);
    await bot.lookAround(2.5);
    await bot.sight(S.rig.signs[S.me].mesh, 2.5);
    await bot.moveTo([0, 0, 1.2 * S.sz], { tol: 0.35, vmax: 1.0 });
    await bot.shot('awakening-8-hub');
    await bot.moveTo([0, 0, S.sz * (DIM.DOCK_Z - 0.6)], { tol: 0.4, vmax: 1.0 });
    await bot.shot('awakening-9-aft-cabin');
    await bot.moveTo([0, -0.3, S.sz * (DIM.DOCK_Z + 1.6)], { tol: 0.4, vmax: 0.8, stop: () => S.flags.docked });
    await bot.until(() => S.flags.docked, 20, 'dock tunnel');
    await bot.shot('awakening-10-in-cabin');
  },
};

function sample(ctx, dt) {
  const h = ctx.history, c = ctx.controller, rig = S.rig;
  if (S.mode === 'lying' || S.mode === 'rise') {
    rig.camera.getWorldPosition(_a);
    const r = rig.toRing(_a);
    _p.set(r.s, Math.max(0, r.y - (S.mode === 'lying' ? 0.6 : 1.4)), r.z);
    rig.F.ring.basis(_p, _b).invert().multiply(rig.camera.getWorldQuaternion(_q));
    h.sample(dt, _p, _b, { pose: S.mode === 'lying' ? 'lying' : 'rising' });
  } else if (S.mode === 'float') h.sample(dt, c.position, c.quaternion);
  else { const o = rig.pose(c, S.pose ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() }); h.sample(dt, o.p, o.q, c.ladder ? { g: Math.round(c.gravityScale * 100) / 100 } : undefined); }
}

function ringPos(c) { return S.rig.pose(c).p; }

async function run(ctx, s) {
  const { history, audio, film, ui, director } = ctx;
  const I = S.I, rig = S.rig;
  const me = S.me, podStatus = S.D[`pod${me}_status`];
  s.beat('dark');
  if (me === 'A') I.setBreath(1);
  s.tween(5, u => I.setPodLight(u * 0.5));
  await s.wait(1.5);
  s.tween(5, u => { film.exposure = 0.02 + u * 0.6; });
  audio.sfx('frost', { volume: 0.4 });
  await s.wait(6.5);
  s.beat('thaw');
  audio.sfx('cryo_hiss', { volume: 0.6, position: S.eye });
  await s.tween(5, u => I.setFrost(me, 1 - 0.8 * u));
  s.beat('lid');
  audio.sfx('cryo_lid', { volume: 0.9, position: S.eye });
  s.tween(2, u => { I.setFrost(me, 0.2 - 0.12 * u); if (me === 'A') I.setBreath(1 - u); });
  await s.tween(2.6, u => { I.setPodLid(me, u); S.wake.lid(u); });
  S.flags.lid = true;
  history.event('wake', { pod: me }, [r3(S.eyeRing.s), r3(S.eyeRing.y), r3(S.eyeRing.z)]);
  podStatus?.setState({ status: 'THAW', heartRate: 62 });
  S.heart.set({ volume: 0.15 });
  s.fork(async f => {
    await f.until(() => S.rig.sweep.k > 0.5);
    audio.music('m_waking', { fade: 10, volume: 0.55 });
    history.event('first_light', { sweep: S.rig.sweep.count });
  });
  for (const [i, t] of S.labTubes.entries()) {
    audio.sfx('tube_strike', { volume: 0.45, position: t.light });
    const jit = [0.2, 0.9, 0.1, 1, 0.6, 1];
    s.tween(0.5, u => I.setTubeLight(t.index, u >= 1 ? 1 : jit[Math.floor(u * jit.length)] * u));
    if (i === 1) s.tween(3, u => { film.exposure = 0.42 + u * 0.5; });
    await s.wait(0.55 + (i % 3) * 0.25);
  }
  audio.ambience('tube_hum', { volume: 0.15, fade: 4 });
  history.snapshot('wake');
  s.beat('sit-up');
  S.mode = 'rise';
  const M = S.wake.marks;
  S.wake.rise([
    { t: M.push, fn: () => audio.sfx('bump_soft', { volume: 0.18, rate: 0.8 }) },
    { t: M.footR, fn: () => audio.sfx('step_pad', { volume: 0.45 }) },
    { t: M.footL, fn: () => audio.sfx('step_pad', { volume: 0.35, rate: 0.92 }) },
    { t: M.stepR, fn: () => audio.sfx('step_pad', { volume: 0.3, rate: 1.05 }) },
    { t: M.stepL, fn: () => audio.sfx('step_pad', { volume: 0.28, rate: 0.97 }) },
  ]);
  await s.until(() => S.wake.done);
  S.wake.walk();
  podStatus?.setState({ status: 'EMPTY', heartRate: null });
  s.tween(3, u => I.setPodLight(0.5 - 0.28 * u));
  S.breath.set({ volume: 0.25 });
  const st = S.wake.end;
  const look = rig.camera.getWorldQuaternion(new THREE.Quaternion());
  S.ctl = rig.walker({ interact: ctx.interact, position: [st.s, 0, st.z], onStep: e => audio.sfx(e.preset === 'ladder' ? 'ladder_rung' : 'step_metal', { volume: e.preset === 'ladder' ? 0.4 : 0.32 }), habLadder: !!S.flags.ceiling,
    hooks: { top: c => onHub(ctx, c) } });
  S.ctl.setLook(look);
  ctx.controller = S.ctl;
  S.mode = 'walk';
  S.seg = 'cryo-lab';
  ui.reticle(true);
  s.fork(async f => { await f.gaze(I.portholes.find(p => p.id === 'lab.b').position, { angle: 12, seconds: 0.8, range: 6 }); history.event('look_window', { porthole: 'lab.b' }); });
  s.fork(async f => { await f.gaze(S.D.consoleLab.mesh, { angle: 10, seconds: 0.8, range: 6 }); history.event('note_seen', {}); });
  s.beat('lab');
  let near = 0, last = ctx.director.time;
  await s.until(() => {
    const dt = ctx.director.time - last; last = ctx.director.time;
    const p = ringPos(S.ctl);
    near = Math.hypot(p.x - HATCH.x, p.z - 0.8) < 2.2 ? near + dt : 0;
    return S.flags.dead || S.flags.pushed || (near > 8 && ctx.interact.looking(S.lever, 25, 3));
  });
  await s.wait(S.flags.dead ? 2.2 : 0.4);
  s.beat('anomaly');
  S.flags.anomaly = true;
  const pos = ringPos(S.ctl), lp = rig.toRing(ctx.interact.center(S.lever, new THREE.Vector3()));
  history.event('anomaly_hatch', { player: [r3(pos.x), r3(pos.y), r3(pos.z)], lever: [r3(lp.s), r3(lp.y), r3(lp.z)], dead: !!S.flags.dead }, HATCH);
  audio.sfx('anomaly', { volume: 0.8, position: rig.ring(HATCH.x - 0.8, HATCH.y, 0.5) });
  S.lever.userData.interact.enabled = false;
  I.setLights(1, 0.7);
  await s.tween(0.7, u => { I.setAnomaly(u); I.setDust(0.3 + 0.7 * u); });
  await s.wait(0.5);
  audio.sfx('latch', { volume: 0.8, position: ctx.interact.center(S.lever, new THREE.Vector3()) });
  s.fork(async f => { await f.wait(0.5); history.snapshot('anomaly'); });
  await s.tween(1.3, u => I.setLever(u));
  audio.sfx('hatch_hydraulic', { volume: 0.9, position: rig.ring(HATCH.x, HATCH.y, 0) });
  await s.tween(2.8, u => I.setHatch('lab', u));
  S.flags.open = true;
  I.setLights(1, 0);
  s.fork(async f => { await f.wait(3); await f.tween(5, u => { I.setAnomaly(1 - u); I.setDust(1 - 0.7 * u); }); });
  s.beat('ring');
  s.fork(async f => {
    for (const [name, at, k] of [['landing-pod', MOD.pod - DIM.HL, 10], ['engine', MOD.engine - DIM.HL, 11], ['habitat', MOD.hab - DIM.HL, 0]]) {
      await f.until(() => S.mode === 'walk' && ringPos(S.ctl).x > at);
      history.event('enter_module', { module: name, index: k });
    }
  });
  await s.until(() => ringPos(S.ctl).x > MOD.hab - DIM.HL);
  s.beat('habitat');
  S.ceiling.userData.interact.enabled = !S.flags.ceilingUse;
  await s.until(() => S.mode === 'climb');
  s.beat('ladder');
  await s.until(() => S.mode === 'float');
  s.beat('zero-g');
  history.snapshot('ladder_top');
  audio.ambience('ring_hum', { volume: 0, fade: 6 });
  audio.ambience('hub_hum', { volume: 0.3, fade: 6 });
  await s.until(() => S.zone === 'hub');
  s.beat('hub');
  await s.until(() => S.ctl.position.z * S.sz > DIM.DOCK_Z - 0.6);
  s.beat('dock');
  history.snapshot('dock_tunnel');
  await s.until(() => S.ctl.position.z * S.sz > DIM.DOCK_Z + 1.0);
  S.flags.docked = true;
  history.event('enter_ranger', { port: me });
  audio.sfx('hatch_hydraulic', { volume: 0.8 });
  const RA = rig.rangers[me];
  await s.tween(1.8, u => { RA?.ranger.setHatch?.(1 - u); RA?.cockpit.set?.('hatch', 1 - u); });
  audio.sfx('latch', { volume: 0.9 });
  await s.wait(0.6);
  director.next({ fade: 0.8 });
}

function transitions(ctx) {
  const h = ctx.history, c = S.ctl;
  if (!c) return;
  if (S.mode === 'walk' && S.seg === 'cryo-lab' && S.flags.open && ringPos(c).x > HATCH.x + 0.4) {
    S.seg = 'ring-corridor';
    h.beginSegment('ring-corridor', { chapter: 'awakening', space: 'ring', mode: 'walk', frame: 'ring-unrolled', RF, theta0: THETA0 });
  }
  if (S.mode === 'walk' && c.ladder) {
    S.mode = 'climb';
    S.seg = 'spine';
    h.beginSegment('spine', { chapter: 'awakening', space: 'spine', mode: 'climb', frame: 'ring-unrolled', RF, theta0: THETA0 });
  }
  if (S.mode === 'climb' && c.space === 'spine' && c.ladder && c.gravityScale < 0.3 && ctx.input.down('KeyW') && c.pitch > -0.35 && S.t - (S.grabT ?? -9) > 0.8) glide(ctx, c);
  const f = S.ctl;
  if (S.mode === 'float' && S.flags.leaving && f.position.x < 1.4) S.flags.leaving = false;
  if (S.mode === 'float' && !S.flags.leaving && !S.flags.docked && S.rig.spineMouth(f.position)) { toSpine(ctx); return; }
  if (S.mode === 'float') { S.zone = S.rig.zone(); S.rig.settle(f); }
}

function toSpine(ctx) {
  S.ctl = S.rig.walkerFromFloat(S.ctl, {
    interact: ctx.interact,
    onStep: e => ctx.audio.sfx(e.preset === 'ladder' ? 'ladder_rung' : 'step_metal', { volume: e.preset === 'ladder' ? 0.4 : 0.32 }),
    hooks: { top: c => onHub(ctx, c) },
  });
  ctx.controller = S.ctl;
  S.mode = 'climb';
  S.grabT = S.t;
  S.seg = 'spine';
  ctx.history.beginSegment('spine', { chapter: 'awakening', space: 'spine', mode: 'climb', frame: 'ring-unrolled', RF, theta0: THETA0 });
}

function glide(ctx, c) {
  const h = ctx.history;
  h.event('ladder_top', { gravity: Math.round(c.gravityScale * 100) / 100, glide: true });
  const f = S.rig.glide(c, { interact: ctx.interact, speed: 1.4, onBump: e => ctx.audio.sfx('bump_soft', { volume: Math.min(0.8, e.speed) }) });
  ctx.audio.sfx('bump_soft', { volume: 0.5 });
  S.ctl = f;
  ctx.controller = f;
  S.mode = 'float';
  S.flags.leaving = true;
  S.seg = 'hub';
  h.beginSegment('hub', { chapter: 'awakening', space: 'hub', mode: 'float', frame: 'endurance-local' });
  S.breath.set({ volume: 0.45 });
}

function teach(ctx) {
  const { ui, input } = ctx;
  const walking = () => S && S.mode === 'walk';
  const inHab = () => walking() && ringPos(S.ctl).x > MOD.hab - DIM.HL;
  ui.teach('move', null, { when: walking, doing: 'move', enough: 2.5, delay: 1.2 });
  ui.teach('awakening.hatch', 'the lab hatch is the only way out   try its manual release', { when: () => walking() && !S.flags.open, done: () => S.flags.dead || (S.flags.open && !S.flags.pushed), delay: 14 });
  ui.teach('awakening.ring', 'follow the ring corridor to the habitat', { when: () => walking() && S.flags.open, done: inHab, delay: 16 });
  ui.teach('awakening.ceiling', 'look up   open the hatch in the habitat ceiling', { when: () => inHab() && !S.flags.ceilingUse, done: () => !!S.flags.ceilingMine, delay: 8 });
  ui.teach('ladder', null, { when: () => walking() && S.flags.ceiling, done: () => S.mode === 'climb' || S.mode === 'float' });
  ui.teach('climb', null, { when: () => S?.mode === 'climb', doing: () => input.down('KeyW'), enough: 2, done: () => S.mode === 'float', delay: 3 });
  ui.teach('float', null, { when: () => S?.mode === 'float', doing: 'float', enough: 3, delay: 1.5 });
  ui.teach('awakening.port', S.me === 'A' ? 'float to dock port A   the blinking amber light' : 'float to dock port B   Ranger 2', { when: () => S?.mode === 'float' && S.zone === 'hub', done: () => !!S.flags.docked || (S.mode === 'float' && S.ctl.position.z * S.sz > DIM.DOCK_Z - 0.6), delay: 5 });
}

const _bq = new THREE.Quaternion();
function podBody() {
  if (S.mode !== 'lying' && S.mode !== 'rise') return undefined;
  const t = S.wake.time;
  return { m: S.mode === 'lying' || t < 3.6 ? 'lie' : t < 9.4 ? 'sit' : 'stand', a: 'eye', p: S.rig.camera.position, q: S.wake.group.getWorldQuaternion(_bq), ph: 0, am: 1 };
}

function otherLid(ctx) {
  const ot = S.ot;
  ctx.audio.sfx('cryo_lid', { volume: 0.5 });
  ctx.director.script(async s => {
    await s.tween(2.6, u => { S.I.setPodLid(ot, u); S.I.setFrost(ot, 1 - 0.9 * u); });
    S.D[`pod${ot}_status`]?.setState({ status: 'EMPTY', heartRate: null });
  });
}

function deadLever(ctx) {
  ctx.audio.sfx('latch', { volume: 0.35, rate: 0.75 + Math.random() * 0.1 });
  ctx.director.script(s => s.tween(0.45, u => S.I.setLever(Math.sin(u * Math.PI) * 0.07)));
  S.flags.dead = true;
}

function openCeiling(ctx) {
  S.flags.ceilingUse = true;
  S.ceiling.userData.interact.enabled = false;
  ctx.audio.sfx('hatch_servo', { volume: 0.8 });
  ctx.director.script(async s => {
    await s.tween(1.8, u => S.I.setHatch('ceiling', u));
    S.flags.ceiling = true;
    if (S.ctl?.ladders) S.rig.enableHabLadder(S.ctl);
  });
}

function onHub(ctx, c) { if (S.mode !== 'float') glide(ctx, c); }
