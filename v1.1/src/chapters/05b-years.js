// Chapter 5b, Years: the aged Endurance. Hub, down the spine as weight returns, the overgrown habitat, tally marks, Wren's logs from the real history, her pod, back up to the second Ranger on port B (in co-op each pilot comes from and returns to an own port, A or B). History: Endurance local (hub), ring unrolled (spine, ring).
import * as THREE from 'three';
import { createInteriorRig, MOD, DIM, RF, THETA0 } from './shared/interior-rig.js';
import { buildLogs, podStatus } from './shared/logs.js';

let S = null;
const SOUNDS = ['m_years', 'ship_groans', 'hub_hum', 'ring_hum', 'groan', 'step_metal', 'ladder_rung', 'bump_soft', 'button', 'beep', 'warn_beep', 'radio', 'hatch_servo', 'hatch_hydraulic', 'latch'];
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

export default {
  id: 'years',

  async load(ctx) {
    const years = Math.max(0.1, ctx.state.years || ctx.clock.years());
    const rig = await createInteriorRig(ctx, { firstSweep: 5, sunPeak: 9 });
    const I = rig.interior;
    I.setAge(years);
    I.setLights(Math.max(0.45, 1 - years / 90), Math.min(0.6, 0.1 + years / 70));
    const net = ctx.net, out = net?.port || 'B', from = net?.port || 'A';
    I.setHatch('lab', 1); I.setHatch('ceiling', 1); I.setLever(1); I.setHatch('hubRangerB', net ? 1 : 0);
    I.setPodLid('A', 1); I.setFrost('A', 0.2);
    for (const id of ['A', 'B']) {
      const mine = id === out, name = id === 'A' ? 'RANGER 1' : 'RANGER 2';
      rig.signs[id].setState({ title: `DOCK PORT ${id}`, lines: mine || net ? [{ text: name, color: 'hi', size: 30 }, 'FUELLED', { text: 'HATCH LOCKED', color: 'amber' }] : [{ text: name, color: 'hi', size: 30 }, 'DOCKED', { text: 'SAFED', color: 'dim' }] });
      rig.signs[id].setPower(mine || net ? 1 : 0.6);
    }
    const A = ctx.audio;
    if (A.raw?.preload) A.preload('years'); else A.load(SOUNDS);
    I.setVisibleZone('hub');
    const D = rig.D, pod = podStatus(years);
    D.podA_status?.setState({ pod: '01', occupant: 'PILOT', status: 'EMPTY', cycles: 1 });
    D.podB_status?.setState(pod);
    D.consoleLab?.setState({ title: 'SICK BAY', right: 'POD 02', lines: [{ text: pod.status === 'NO LIFE SIGNS' ? 'POD 02  NO LIFE SIGNS' : `POD 02  CYCLE ${String(pod.cycles).padStart(3, '0')}`, color: pod.status === 'NO LIFE SIGNS' ? 'red' : 'hi' }, `OCCUPANT  WREN, A.`, `AGE  ${pod.age.toFixed(1)} YR`] });
    D.consoleEngineB?.setState({ title: 'MISSION CLOCK', source: ctx.clock });
    D.consoleEngineA?.setState({ battery: 'LOW', buses: ['A'], fuelCells: 'DEGRADED', engines: 'SAFE', caution: 'COOLANT' });
    D.missionBoard?.setState({ selected: 0, note: { from: 'MILLER BEACON', text: 'ALL GOOD', ping: true } });
    const portB = I.interactables.find(i => i.id === 'hatch.hubRangerB');
    const comms = I.interactables.find(i => i.id === 'commsLog');
    S = { rig, I, D, years, pod, portB: portB?.object, comms: comms.object, flags: {}, mode: 'float', t: 0, sel: 0, open: -1, groan: 6, out, from, sz: out === 'A' ? 1 : -1, portZ: Math.abs(I.anchors.rangerPortB.position.z) };
    comms.object.userData.interact = { id: 'commsLog', label: 'open   [Wheel] choose', range: 2.4, radius: 0.45 };
    if (S.portB) S.portB.userData.interact = { id: 'portB', label: 'open the hatch', hold: 0.8, range: 3.2, radius: 0.8, enabled: false, once: true };
    await net?.prepare(rig.scene, rig.camera);
    await rig.compile();
  },

  enter(ctx) {
    const { film, history, interact, audio } = ctx;
    const rig = S.rig, I = S.I;
    rig.enter();
    film.look('interior', 0, { letterbox: 1, exposure: 1.15, saturation: 0.62, contrast: 0.3, tintShadow: [0.0, 0.006, 0.013], tintHigh: [0.0, 0.002, 0.006] });
    const fz = S.from === 'A' ? 1 : -1;
    rig.camera.position.set(0, 0, 3.6 * fz);
    rig.camera.quaternion.setFromAxisAngle(_p.set(0, 1, 0), fz > 0 ? 0 : Math.PI);
    rig.camera.updateMatrixWorld();
    S.ctl = rig.floater({ interact, velocity: [0, 0, -0.25 * fz], onBump: e => audio.sfx('bump_soft', { volume: Math.min(0.8, e.speed) }) });
    ctx.controller = S.ctl;
    S.logs = buildLogs(history, S.years).reverse();
    S.logs[0].title = '* ' + S.logs[0].title;
    S.D.commsLog?.setState({ entries: S.logs, from: 'WREN  /  MESSAGES', selected: 0, mode: 'list' });
    interact.setRoots([I.group]);
    interact.occlude = rig.occlude;
    S.comms.userData.interact.onUse = () => useComms(ctx);
    if (S.portB) S.portB.userData.interact.onUse = () => { S.flags.portMine = true; openPort(ctx); };
    ctx.ui.reticle(true);
    teach(ctx);
    const N = ctx.net;
    if (N) {
      N.stage({ scene: rig.scene, seen: p => I.zoneVisible(p), world: () => ({ sweep: Math.round(rig.sweep.t * 100) / 100 }), applyWorld: w => { if (w.sweep != null && Math.abs(w.sweep - rig.sweep.t) > 0.3) rig.sweep.t = w.sweep; } });
      N.share('years.unlock', () => S.flags.last || S.readCount >= 3, () => { S.flags.unlockRemote = true; });
      N.share('years.shutB', () => S.flags.shut, () => shutPort(ctx));
      N.share('years.portB', () => S.flags.portUse, () => { if (!S.flags.portUse) openPort(ctx); });
    }
    history.beginSegment('hub-aged', { chapter: 'years', space: 'hub', mode: 'float', frame: 'endurance-local' });
    history.event('enter_aged', { years: Math.round(S.years * 100) / 100, tally: Math.floor(S.years), logs: S.logs.length }, S.ctl.position);
    audio.music('m_years', { fade: 8, volume: 0.6 });
    audio.ambience('ship_groans', { volume: 0.45, fade: 6 });
    audio.ambience('hub_hum', { volume: 0.12, fade: 6 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    S.t += dt;
    const c = ctx.controller, input = ctx.input;
    c.update(dt, input);
    if (S.mode === 'float' && S.rig.spineMouth(c.position) && !S.flags.leaving) toSpine(ctx);
    if (S.mode === 'climb' && c.space === 'ring' && !c.ladder) { S.mode = 'walk'; segment(ctx, 'aged-ring', 'ring', 'walk', 'ring-unrolled'); }
    if (S.flags.leaving && S.mode === 'float' && c.position.x < 1.4) S.flags.leaving = false;
    if (S.mode === 'float') S.rig.settle(c);
    if (ctx.net && S.from === 'B' && !S.flags.shut && S.mode === 'float' && c.position.z > -1.7) shutPort(ctx);
    if (S.mode === 'walk' && c.ladder) { S.mode = 'climb'; S.flags.up = true; segment(ctx, 'spine-up', 'spine', 'climb', 'ring-unrolled'); }
    if (input.mouse.wheel && ctx.interact.current === S.comms) scrollComms(ctx, input.mouse.wheel);
    if (S.mode === 'climb' && c.space === 'spine' && c.ladder && c.gravityScale < 0.3 && input.down('KeyW') && c.pitch > -0.35 && S.t - (S.grabT ?? -9) > 0.8) toHub(ctx, c, true);
    S.rig.update(dt);
    if ((S.groan -= dt) < 0) { S.groan = 7 + Math.random() * 9; ctx.audio.sfx('groan', { volume: 0.35 + Math.random() * 0.3 }); }
    if (S.mode === 'float') ctx.history.sample(dt, c.position, c.quaternion);
    else { const o = S.rig.pose(c, S.pose ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() }); ctx.history.sample(dt, o.p, o.q, c.ladder ? { g: Math.round(c.gravityScale * 100) / 100 } : undefined); }
  },

  exit(ctx) {
    for (const b of ['ship_groans', 'hub_hum', 'ring_hum']) ctx.audio.ambience(b, { volume: 0, fade: 2 });
  },

  dispose() { S.rig.dispose(); S = null; },

  async auto(ctx, bot) {
    await bot.wait(1.5);
    await bot.lookAround(3);
    await bot.shot('years-hub');
    if (S.from === 'B') await bot.moveTo([1.0, 0, -0.2], { tol: 0.3, vmax: 1.0 });
    await bot.moveTo([2.9, 0, -0.55], { tol: 0.3, vmax: 1.0, stop: () => S.mode !== 'float' });
    await bot.until(() => S.mode === 'climb', 10, 'grab spine');
    await bot.look(() => bot.mouse(0, 400), 0.3);
    await bot.hold('KeyW', () => S.mode === 'walk', 90, 'down the spine');
    await bot.wait(0.5);
    await bot.walkTo([MOD.hab - 1.2, 0, 0.1], { tol: 0.4 });
    await bot.face(S.I.anchors.hydroponics.position, { tol: 0.05 });
    await bot.linger(2);
    await bot.shot('years-habitat');
    await bot.walkTo([MOD.hab + 0.6, 0, 0], { tol: 0.4 });
    await bot.walkTo([MOD.hab + 2.7, 0, 1.15], { tol: 0.3 });
    await bot.face(S.I.anchors.tallyPanel.position, { tol: 0.05 });
    await bot.until(() => ctx.history.has('tally_seen'), 10, 'tally');
    await bot.linger(1.5);
    const readOpen = () => bot.read(S.open >= 0 ? S.logs[S.open].text : '');
    await bot.use('commsLog');
    await readOpen();
    await bot.shot('years-log');
    while (S.open >= 0) { await bot.use('commsLog'); if (S.open >= 0) await bot.linger(2); }
    await bot.use('commsLog');
    await readOpen();
    while (S.open >= 0) { await bot.use('commsLog'); if (S.open >= 0) await bot.linger(2); }
    for (const s of [MOD.hab + 0.6, MOD.hab - 4.5, MOD.engine, MOD.pod, 3.4]) await bot.walkTo([s, 0, 0], { tol: 0.4 });
    const v = S.rig.anchorRing('podB_view');
    await bot.walkTo([v.s, 0, v.z], { tol: 0.3 });
    await bot.face(S.D.podB_status.mesh, { tol: 0.04 });
    await bot.until(() => ctx.history.has('pod_seen'), 10, 'pod seen');
    await bot.linger(3);
    await bot.shot('years-pod');
    for (const s of [3.4, MOD.pod, MOD.engine, MOD.hab - 2.2]) await bot.walkTo([s, 0, 0], { tol: 0.4 });
    const L = S.rig.ladders.hab;
    await bot.walkTo([(L.min[0] + L.max[0]) / 2, 0, (L.min[2] + L.max[2]) / 2], { tol: 0.12 });
    await bot.look(() => bot.mouse(0, -400), 0.3);
    await bot.hold('KeyW', () => S.mode === 'float', 90, 'up to the hub');
    await bot.wait(1);
    await bot.moveTo([0, 0, S.sz], { tol: 0.35, vmax: 1.0 });
    if (S.out === 'B') await bot.use('portB', { unless: () => S.flags.portUse });
    await bot.until(() => S.flags.portOpen, 10, `port ${S.out}`);
    await bot.moveTo([0, 0, S.sz * (S.portZ - 0.6)], { tol: 0.4, vmax: 1.0 });
    await bot.shot('years-port-b');
    await bot.moveTo([0, -0.3, S.sz * (S.portZ + 1.6)], { tol: 0.4, vmax: 0.8, stop: () => S.flags.end });
    await bot.until(() => S.flags.end, 20, 'second ranger');
  },
};

async function run(ctx, s) {
  const { history, audio, ui } = ctx;
  const I = S.I;
  s.beat('hub');
  s.fork(async f => { await f.gaze(I.anchors.tallyPanel.position, { angle: 12, seconds: 0.8, range: 5 }); history.event('tally_seen', { marks: Math.floor(S.years) }); });
  s.fork(async f => { await f.gaze(I.anchors.hydroponics.position, { angle: 14, seconds: 0.8, range: 5 }); history.event('growth_seen', { years: Math.round(S.years * 10) / 10 }); });
  s.fork(async f => {
    await f.gaze(() => S.D.podB_status.mesh.getWorldPosition(_p), { angle: 10, seconds: 0.8, range: 3.5 });
    const p = S.pod;
    history.event('pod_seen', { status: p.status, years: Math.round(S.years * 100) / 100, cycles: p.cycles, age: Math.round(p.age * 10) / 10, lifeSigns: p.status !== 'NO LIFE SIGNS' });
    audio.sfx(p.status === 'NO LIFE SIGNS' ? 'warn_beep' : 'beep', { volume: 0.35 });
  });
  await s.until(() => S.mode === 'climb');
  s.beat('spine');
  await s.until(() => S.mode === 'walk');
  s.beat('ring');
  audio.ambience('ring_hum', { volume: 0.12, fade: 4 });
  await s.until(unlocked);
  s.beat('unlocked');
  if (S.out === 'A') S.flags.portOpen = true;
  else if (S.portB) S.portB.userData.interact.enabled = !S.flags.portUse;
  S.rig.rangers[S.out] && (S.rig.rangers[S.out].beacon = true);
  for (const id of ctx.net ? ['A', 'B'] : ['B']) S.rig.signs[id].setState({ lines: [{ text: id === 'A' ? 'RANGER 1' : 'RANGER 2', color: 'hi', size: 30 }, 'FUELLED', { text: 'HATCH UNLOCKED', color: 'hi' }] });
  audio.sfx('radio', { volume: 0.25 });
  await s.until(() => S.mode === 'climb');
  await s.until(() => S.mode === 'float');
  s.beat('hub2');
  await s.until(() => S.flags.portOpen && S.ctl.position.z * S.sz > S.portZ - 0.4);
  history.snapshot('port_b');
  await s.until(() => S.ctl.position.z * S.sz > S.portZ + 1.0);
  S.flags.end = true;
  history.event('enter_ranger2', { port: S.out });
  audio.sfx('hatch_hydraulic', { volume: 0.8 });
  const RB = S.rig.rangers[S.out];
  await s.tween(1.8, u => { RB?.ranger.setHatch?.(1 - u); RB?.cockpit.set?.('hatch', 1 - u); });
  audio.sfx('latch', { volume: 0.9 });
  await s.wait(0.6);
  ui.hint(null);
  ctx.director.next({ fade: 1.0 });
}

function unlocked() { return !!S && (S.flags.last || S.readCount >= 3 || !!S.flags.unlockRemote); }

function teach(ctx) {
  const ui = ctx.ui, n = S.out === 'A' ? 1 : 2;
  const nearLadder = () => { const L = S.rig.ladders.hab, p = S.rig.pose(S.ctl).p; return Math.hypot(p.x - (L.min[0] + L.max[0]) / 2, p.z - (L.min[2] + L.max[2]) / 2) < 2.2; };
  ui.teach('float', null, { when: () => S?.mode === 'float', doing: 'float', enough: 2.5, delay: 1.5 });
  ui.teach('years.spine', 'float down the spine to the ring', { when: () => S?.mode === 'float' && !S.flags.leaving && !S.readCount, done: () => S.mode === 'climb' || S.mode === 'walk', delay: 9 });
  ui.teach('climbdown', null, { when: () => S?.mode === 'climb' && !S.readCount, done: () => S.mode === 'walk' });
  ui.teach('years.logs', 'read the messages Wren left on the habitat console', { when: () => S?.mode === 'walk', done: () => S.readCount >= 1, delay: 7 });
  ui.teach('ladder', null, { when: () => S?.mode === 'walk' && unlocked() && nearLadder(), done: () => S.mode === 'climb' && !!S.flags.up && unlocked() });
  ui.teach('years.back', `Ranger ${n} is unlocked   climb the ladder back up the spine`, { when: () => S?.mode === 'walk' && unlocked() && S.open < 0, done: () => S.mode === 'climb' && !!S.flags.up && unlocked(), delay: 4 });
  ui.teach('climb', null, { when: () => S?.mode === 'climb' && !!S.flags.up && unlocked(), doing: () => ctx.input.down('KeyW'), enough: 2, done: () => S.mode === 'float' && !!S.flags.up && unlocked(), delay: 3 });
  if (S.out === 'B') ui.teach('years.port', 'float to port B, Ranger 2', { when: () => S?.mode === 'float' && !!S.flags.up && unlocked() && !S.flags.portOpen, done: () => !!S.flags.portMine, delay: 3 });
  ui.teach('years.board', S.out === 'B' ? 'float through the hatch into Ranger 2' : 'float through port A into Ranger 1', { when: () => !!S?.flags.portOpen && !!S.flags.up && S.mode === 'float', done: () => S.flags.end, delay: 4 });
}

function segment(ctx, id, space, mode, frame) {
  ctx.history.beginSegment(id, { chapter: 'years', space, mode, frame, RF, theta0: THETA0 });
}

function toSpine(ctx) {
  const f = S.ctl;
  segment(ctx, 'spine-down', 'spine', 'climb', 'ring-unrolled');
  S.ctl = S.rig.walkerFromFloat(f, {
    interact: ctx.interact,
    onStep: e => ctx.audio.sfx(e.preset === 'ladder' ? 'ladder_rung' : 'step_metal', { volume: e.preset === 'ladder' ? 0.38 : 0.3, rate: 0.95 }),
    hooks: { spine: () => { S.mode = 'climb'; }, top: c => toHub(ctx, c) },
  });
  ctx.controller = S.ctl;
  S.mode = 'climb';
  S.grabT = S.t;
}

function toHub(ctx, c, glide = false) {
  if (S.mode === 'float') return;
  const onBump = e => ctx.audio.sfx('bump_soft', { volume: Math.min(0.8, e.speed) });
  S.ctl = glide ? S.rig.glide(c, { interact: ctx.interact, speed: 1.3, onBump }) : S.rig.floater({ interact: ctx.interact, velocity: [-0.4, 0, 0], onBump });
  ctx.controller = S.ctl;
  S.mode = 'float';
  S.flags.leaving = true;
  segment(ctx, 'hub-aged-2', 'hub', 'float', 'endurance-local');
}

function useComms(ctx) {
  const d = S.D.commsLog, L = S.logs;
  if (!d || !L.length) return;
  ctx.audio.sfx('button', { volume: 0.4 });
  if (S.open < 0) {
    const i = Math.max(0, Math.min(L.length - 1, S.sel));
    S.open = i;
    L[i].read = true;
    d.setState({ mode: 'reader', selected: i, page: 0, entries: L });
    ctx.history.event('log_read', { index: L[i].index, month: L[i].month, kind: L[i].kind, of: L.length });
    S.readSet = S.readSet || new Set();
    S.readSet.add(i);
    S.readCount = S.readSet.size;
    if (L[i].kind === 'last') S.flags.last = true;
    S.comms.userData.interact.label = 'next   [Wheel] scroll';
    return;
  }
  const pages = d.meta.pages || 1, page = d.state.page || 0;
  if (page < pages - 1) { d.setState({ page: page + 1 }); return; }
  S.sel = Math.min(L.length - 1, S.open + 1);
  S.open = -1;
  d.setState({ mode: 'list', selected: S.sel, entries: L });
  S.comms.userData.interact.label = 'open   [Wheel] choose';
}

function scrollComms(ctx, n) {
  const d = S.D.commsLog;
  if (!d) return;
  if (S.open >= 0) {
    const pages = d.meta.pages || 1;
    d.setState({ page: Math.max(0, Math.min(pages - 1, (d.state.page || 0) + Math.sign(n))) });
  } else {
    S.sel = Math.max(0, Math.min(S.logs.length - 1, S.sel + n));
    d.setState({ selected: S.sel });
  }
}

function shutPort(ctx) {
  if (S.flags.shut) return;
  S.flags.shut = true;
  ctx.audio.sfx('hatch_servo', { volume: 0.6 });
  ctx.director.script(s => s.tween(2.2, u => { if (!S.flags.portUse) S.I.setHatch('hubRangerB', 1 - u); }));
}

function openPort(ctx) {
  S.flags.portUse = true;
  if (S.portB) S.portB.userData.interact.enabled = false;
  ctx.audio.sfx('hatch_servo', { volume: 0.8 });
  ctx.director.script(async s => { await s.tween(2.2, u => S.I.setHatch('hubRangerB', u)); if (S.out === 'B') S.flags.portOpen = true; });
}
