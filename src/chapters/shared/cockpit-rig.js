// Ranger cockpit rig: real or headless Ranger kit, twelve displays on a fixed page plan, switch-driven power, flight, nav, dock, beacon and systems feeds, failure sequence, labels, seat helpers and control sounds.
import * as THREE from 'three';
import { frames } from '../../core/controllers.js';
import { yTop } from '../../models/ranger.js';

export const SLOT_PLAN = {
  mainL1: 'attitude', mainL2: 'nav', mainL3: 'clock',
  mainR1: 'nav', mainR2: 'attitude', mainR3: 'beacon',
  centre1: 'systems', centre2: 'engine', centre3: 'text', centre4: 'nav', centre5: 'attitude', centre6: 'beacon',
  centre7: 'clock', centre8: 'text', centre9: 'systems',
  overhead: 'text', overheadL: 'text', overheadR: 'clock', sideL: 'text', sideR: 'clock',
};
export const BOOT_ORDER = ['mainL1', 'mainL2', 'mainL3', 'centre1', 'centre2', 'centre3', 'centre4', 'centre5', 'centre6', 'centre7', 'centre8', 'centre9', 'mainR1', 'mainR2', 'mainR3', 'overhead', 'overheadL', 'overheadR', 'sideL', 'sideR'];
export const FAIL_ORDER = ['sideL', 'overheadL', 'overhead', 'centre9', 'mainR3', 'centre3', 'overheadR', 'centre6', 'mainR2', 'sideR', 'centre8', 'centre2', 'centre5', 'mainR1', 'centre7', 'centre4', 'centre1', 'mainL3', 'mainL2', 'mainL1'];
export const LABELS = { batt: 'battery bus on', fuelCells: 'fuel cells on', avionics: 'avionics on', rcs: 'rcs on', engineStart: 'start engines', clamp: 'release the docking clamp', eject: 'pull the eject handle', hatch: 'open the rear hatch', seat: 'take the left seat' };
const HOLD = { clamp: 1.0, eject: 1.0, hatch: 0.8 };
const SWITCH_SFX = { batt: 'switch_1', fuelCells: 'switch_2', avionics: 'switch_3', rcs: 'switch_4' };
const POWER_LEVEL = { batt: 0.42, fuelCells: 0.72, avionics: 1 };
export const BORESIGHT = 0.05;
export const BORE_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), BORESIGHT);
export const BORE_INV = BORE_Q.clone().invert();
const DEG = 180 / Math.PI;
const RPM = 60 / (Math.PI * 2);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

export function canRender(ctx) { return !!ctx?.engine?.renderer?.capabilities; }

export async function createRangerKit(ctx, { materials = null, cockpit = true, quality } = {}) {
  const engine = ctx.engine, q = quality || engine.qualityName || 'ultra';
  if (!canRender(ctx)) return standInKit(cockpit);
  const [{ createHullMaterials }, { createRanger }, cmod] = await Promise.all([
    import('../../models/hull-materials.js'), import('../../models/ranger.js'), cockpit ? import('../../models/ranger-cockpit.js') : null,
  ]);
  const mats = materials || createHullMaterials({ renderer: engine.renderer, quality: q });
  const ranger = await createRanger({ engine, quality: q, materials: mats });
  let ck = null;
  if (cockpit) { ck = await cmod.createRangerCockpit({ engine, quality: q, materials: mats, ranger }); ranger.group.add(ck.group); }
  return { materials: mats, ranger, cockpit: ck, headless: false };
}

function standInKit(withCockpit) {
  const mk = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial()); m.position.set(x, y, z); return m; };
  const group = new THREE.Group();
  group.name = 'RangerStandIn';
  group.add(mk(7, 2.8, 16, 0, 0.9, 0));
  const anchors = {};
  const anchor = (name, p, parent = group) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...p); parent.add(o); anchors[name] = o; return o; };
  anchor('dockPort', [0, 0.96, 8.2]); anchor('hatchOutside', [0, 0, 8.75]); anchor('hatchInside', [0, 0, 6.29]);
  anchor('pilotEye', [-0.85, 1.4, -0.8]); anchor('copilotEye', [0.85, 1.4, -0.8]); anchor('noseCam', [0, 1.32, -3.45]);
  const noop = () => {};
  const ranger = { group, lod: group, anchors, windows: [], materials: {}, bounds: new THREE.Box3(new THREE.Vector3(-5, -1, -8.5), new THREE.Vector3(5, 2.4, 8.5)), setGear: noop, setHatch: noop, setRamp: noop, setEngine: noop, setLights: noop, setLOD: noop, update: noop, stats: () => ({}), dispose: noop };
  if (!withCockpit) return { materials: {}, ranger, cockpit: null, headless: true };
  const cg = new THREE.Group();
  cg.name = 'CockpitStandIn';
  group.add(cg);
  const ca = {};
  for (const [n, p] of [['pilotEye', [-0.85, 1.4, -0.8]], ['copilotEye', [0.85, 1.4, -0.8]], ['seatPilot', [-0.85, 0, -0.75]], ['seatCopilot', [0.85, 0, -0.75]], ['cabinEntry', [0, 0, 6.03]], ['rearCam', [0, 1.32, 1.35]]]) {
    const o = new THREE.Object3D(); o.name = n; o.position.set(...p); cg.add(o); ca[n] = o;
  }
  const state = {};
  const parts = {
    batt: [-0.18, 0.71, -1.66], fuelCells: [-0.06, 0.71, -1.66], avionics: [0.06, 0.71, -1.66], rcs: [0.18, 0.71, -1.66], engineStart: [0, 0.6, -1.52],
    clamp: [-0.42, yTop(-0.42, -0.3) - 0.22 - 0.275, -0.3], eject: [-0.85, 0.42, -1.04], hatch: [-0.44, 0.95, 6.37], stick: [-1.62, 0.75, -0.95], throttle: [-0.24, 0.82, -0.92],
  };
  const interactables = Object.entries(parts).map(([id, p]) => {
    const root = new THREE.Group(); root.position.set(...p); root.add(mk(0.05, 0.05, 0.05, 0, 0, 0)); cg.add(root);
    state[id] = 0;
    return { id, kind: id, object: root, set: (v) => { state[id] = v; }, toggle: () => { state[id] = state[id] > 0.5 ? 0 : 1; } };
  });
  const slotPos = { mainL1: [-1.36, 0.83, -2.08], mainL2: [-0.95, 0.83, -2.08], mainL3: [-0.54, 0.83, -2.08], mainR1: [0.54, 0.83, -2.08], mainR2: [0.95, 0.83, -2.08], mainR3: [1.36, 0.83, -2.08], centre1: [0, 1.17, -2.25], centre2: [-0.14, 0.86, -2.2], centre3: [0.14, 0.86, -2.2], overhead: [0, 1.88, -0.54], sideL: [-2.05, 1.1, -2.3], sideR: [2.05, 1.1, -2.3] };
  const displaySlots = Object.entries(slotPos).map(([id, p]) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.22), new THREE.MeshBasicMaterial()); mesh.position.set(...p); cg.add(mesh); return { id, mesh, width: 0.29, height: 0.22, kind: 'mfd' }; });
  const colliders = [
    { id: 'floor', min: [-2.3, -0.3, -3.1], max: [2.3, 0, 6.48] }, { id: 'wallL', min: [-3.4, 0, -3.1], max: [-2.3, 2.6, 6.48] }, { id: 'wallR', min: [2.3, 0, -3.1], max: [3.4, 2.6, 6.48] },
    { id: 'front', min: [-3.2, 0, -3.3], max: [3.2, 1.4, -1.98] }, { id: 'pedestal', min: [-0.32, 0, -1.95], max: [0.32, 0.66, 0.45] },
    { id: 'rearL', min: [-3.2, 0, 6.43], max: [-0.62, 2.4, 6.58] }, { id: 'rearR', min: [0.62, 0, 6.43], max: [3.2, 2.4, 6.58] }, { id: 'ceil', min: [-3.2, 2.0, -3.1], max: [3.2, 2.6, 6.48] },
    { id: 'door', min: [-0.62, 0, 6.43], max: [0.62, 2.0, 6.58] },
    { id: 'seat_pilot', min: [-1.15, 0, -1.05], max: [-0.55, 0.55, -0.4] }, { id: 'seatback_pilot', min: [-1.15, 0.45, -0.55], max: [-0.55, 1.45, -0.27] },
    { id: 'seat_copilot', min: [0.55, 0, -1.05], max: [1.15, 0.55, -0.4] }, { id: 'seatback_copilot', min: [0.55, 0.45, -0.55], max: [1.15, 1.45, -0.27] },
  ];
  const cockpit = {
    group: cg, anchors: ca, displaySlots, interactables, colliders, walkable: [], lights: {}, seats: {},
    set: (id, v) => { state[id] = v; if (id === 'hatch') { const d = colliders.find(c => c.id === 'door'); d.min[1] = v > 0.6 ? 1e5 : 0; d.max[1] = v > 0.6 ? 1e5 + 0.01 : 2.0; } }, toggle: (id) => { state[id] = state[id] > 0.5 ? 0 : 1; }, get: (id) => state[id] ?? 0,
    setStick: noop, setThrottle: noop, setPower(p) { this.power = p; }, setFailure(f) { this.failure = f; }, setBounce: noop, power: 0, failure: 0, update: noop, dispose: noop, stats: () => ({}),
  };
  return { materials: {}, ranger, cockpit, headless: true };
}

function stubDisplay(kind) {
  const d = {
    kind, state: {}, power: 0, managed: false, stub: true, _bootT: 0,
    mount(slot) { d.slot = slot; d.mesh = slot.mesh; return d; },
    setKind(k, st = {}) { d.kind = k; d.state = { ...st }; d._bootT = 0; return d; },
    setState(p = {}) { if (p.kind && p.kind !== d.kind) { const { kind: k, ...rest } = p; return d.setKind(k, rest); } Object.assign(d.state, p); return d; },
    setPower(v) { d.power = v; return d; }, setGlitch() { return d; }, setReflection() { return d; },
    update(dt) {
      if (d.kind !== 'boot') return;
      d._bootT += dt;
      if (d._bootT > (d.state.duration || 4.5) + 0.5 && d.state.next) { const { next, nextState, onDone } = d.state; d.setKind(next, nextState || {}); onDone?.(d); }
    },
    dispose() {},
  };
  return d;
}

export async function createCockpitRig(ctx, { ranger, cockpit, envMap = null, clock = ctx.clock, plan = SLOT_PLAN } = {}) {
  const { engine, audio } = ctx;
  const headless = !canRender(ctx);
  let createDisplay = null, manager = null;
  if (canRender(ctx)) {
    const mod = await import('../../models/displays.js');
    await mod.displaysReady;
    createDisplay = mod.createDisplay;
    manager = mod.createDisplayManager({ engine, budgetMs: 1.2, maxDistance: 5 });
  }
  const displays = {};
  for (const slot of cockpit.displaySlots) {
    const kind = plan[slot.id] || 'text';
    const d = createDisplay ? createDisplay('text', { width: slot.width, height: slot.height, envMap: null, compact: slot.id === 'sideL' || slot.id === 'sideR' ? true : null }) : stubDisplay('text');
    d.mount(slot);
    slot.display = d;
    if (d.texture) { d.texture.anisotropy = Math.min(12, engine.renderer.capabilities?.getMaxAnisotropy?.() || 8); d.texture.needsUpdate = true; }
    d.setKind('dead');
    d.setPower(0);
    d.page = kind;
    if (manager) manager.add(d);
    displays[slot.id] = d;
  }

  const power = { batt: false, fuelCells: false, avionics: false, rcs: false, engine: false, booted: false };
  const live = { p: 0, target: 0, flick: 0, failure: 0, failT: 0, dead: new Set(), alarm: null, tone: null, acc: 0, rcsT: 0, mode: 'nav', camera: null };
  const pages = {
    attitude: { mode: 'RCS DIRECT', maxRate: 12 }, nav: { target: 'MILLER', targets: ['ENDURANCE', 'MILLER', 'GARGANTUA'], range: 0, closing: 0 },
    dock: { range: 60, closing: 0, rollRate: 0, stationRate: 5.25, offset: { x: 0, y: 0 } }, beacon: { id: 'MILLER BEACON', distance: 2.2e9, bearing: 0, strength: 0.35, status: 'ALL GOOD' },
    engine: { throttle: 0, fuel: 0.94, state: 'OFF', thrustMax: 980 }, systems: {}, clock: { source: clock, title: 'MISSION CLOCK' },
  };
  const texts = {
    centre3: { title: 'CHECKLIST', lines: [] }, overhead: { title: 'POWER', lines: [] }, centre8: { title: 'POWER', lines: [] }, overheadL: { title: 'COMMS', lines: ['ENDURANCE  LINK OK'] }, sideL: { title: 'COMMS', lines: ['ENDURANCE  LINK OK', 'WREN  STANDING BY'], cursor: true },
  };
  const extraSystems = {};
  let checklist = null;
  const hooks = { fail: new Set(), power: new Set() };
  const interactDefs = {};
  const eyes = {};
  const rigGroup = cockpit.group;
  for (const [name, src] of [['pilot', 'pilotEye'], ['copilot', 'copilotEye']]) {
    const a = cockpit.anchors[src] || ranger.anchors?.[src];
    const o = new THREE.Object3D(); o.name = 'rigEye_' + name;
    if (a) o.position.copy(a.position); else o.position.set(name === 'pilot' ? -0.85 : 0.85, 1.2, -0.8);
    o.quaternion.copy(BORE_Q);
    (a?.parent || rigGroup).add(o);
    eyes[name] = o;
  }
  const seatProxy = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.1, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  seatProxy.name = 'seat-pilot-proxy';
  const sp = cockpit.anchors.seatPilot?.position || new THREE.Vector3(-0.85, 0, -0.75);
  seatProxy.position.set(sp.x, 0.9, sp.z + 0.15);
  (cockpit.anchors.seatPilot?.parent || rigGroup).add(seatProxy);

  const objOf = id => (id === 'seat' ? seatProxy : cockpit.interactables.find(i => i.id === id)?.object);
  const cueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const cue = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 8), cueMat);
  cue.name = 'switchCue'; cue.renderOrder = 4; cue.scale.setScalar(1e-4);
  let cueId = null;
  rigGroup.add(cue);
  function setCue(id) {
    cueId = id || null;
    const o = cueId ? objOf(cueId) : null;
    if (!o) { rigGroup.add(cue); cue.scale.setScalar(1e-4); return; }
    const mesh = o.isMesh ? o : o.getObjectByProperty('isMesh', true);
    (mesh || o).add(cue);
    if (mesh?.geometry) { mesh.geometry.computeBoundingSphere(); cue.position.copy(mesh.geometry.boundingSphere.center); cue.scale.setScalar(Math.max(0.6, Math.min(2.2, mesh.geometry.boundingSphere.radius / 0.045))); }
    else { cue.position.set(0, 0, 0); cue.scale.setScalar(1); }
    cue.visible = true;
  }
  const sfx = (id, o = {}) => {
    const obj = o.at ? objOf(o.at) : null;
    const position = obj ? obj.getWorldPosition(new THREE.Vector3()) : undefined;
    audio.sfx(id, { volume: o.volume ?? 0.7, rate: o.rate, position });
  };

  function systemsState() {
    const fc = power.fuelCells;
    return {
      battery: power.batt ? 0.97 : null, buses: { A: power.batt ? 'ON' : false, B: fc ? 'ON' : false },
      avionics: power.avionics ? (power.booted ? 'ON' : 'BOOT') : false, fuelCells: [fc, fc, fc],
      rcs: power.rcs ? 'ARMED' : false, clamps: extraSystems.clamps || 'LOCKED', hatch: extraSystems.hatch || 'SEALED',
      engines: extraSystems.engines || (power.engine ? 'RUN' : 'OFF'), ...extraSystems,
    };
  }
  function checklistLines() {
    const items = checklist || [['BATT BUS', power.batt], ['FUEL CELLS', power.fuelCells], ['AVIONICS', power.booted], ['RCS', power.rcs], ['CLAMP RELEASE', extraSystems.clamps === 'RELEASED']];
    let next = true;
    return items.map(([k, done]) => { const o = { text: `${done ? '[X]' : '[ ]'} ${k}`, color: done ? 'dim' : next ? 'amber' : 'fg' }; if (!done) next = false; return o; });
  }
  function powerLines() {
    const v = power.batt ? (power.fuelCells ? 28.4 : 26.1) : 0;
    return [`BUS A  ${v.toFixed(1)} V`, `BUS B  ${(power.fuelCells ? 28.2 : 0).toFixed(1)} V`, `FC 1 2 3  ${power.fuelCells ? 'ON ON ON' : 'OFF'}`, `AVNX  ${power.avionics ? (power.booted ? 'ONLINE' : 'BOOT') : 'OFF'}`, `RCS  ${power.rcs ? 'ARMED' : 'SAFE'}`];
  }

  function pageState(slotId) {
    const page = slotId === 'mainL2' ? live.mode : displays[slotId].page;
    if (page === 'text') {
      const t = texts[slotId] || { lines: [] };
      if (slotId === 'centre3') return { title: t.title, lines: checklistLines() };
      if (slotId === 'overhead' || slotId === 'centre8') return { title: t.title, lines: powerLines() };
      return { ...t };
    }
    if (page === 'systems') return systemsState();
    if (page === 'clock') return slotId === 'sideR' || slotId === 'overheadR' ? { source: clock, title: 'ENDURANCE' } : { ...pages.clock };
    return { ...pages[page] };
  }
  function pageKind(slotId) { return slotId === 'mainL2' ? live.mode : displays[slotId].page; }
  function push(slotId, force = false) {
    const d = displays[slotId];
    if (!power.booted || live.dead.has(slotId) || d.kind === 'boot' || (d.kind === 'dead' && !force)) return;
    const k = pageKind(slotId);
    if (d.kind !== k || force) { d.setKind(k, pageState(slotId)); d.setPower(1); }
    else d.setState(pageState(slotId));
  }
  function pushKind(kind) { for (const id of Object.keys(displays)) if (pageKind(id) === kind) push(id); }

  function applyTarget() {
    live.target = power.avionics ? POWER_LEVEL.avionics : power.fuelCells ? POWER_LEVEL.fuelCells : power.batt ? POWER_LEVEL.batt : 0;
    live.flick = 0.35;
    for (const fn of hooks.power) fn({ ...power });
  }

  function boot() {
    power.booted = false;
    sfx('avionics_boot', { at: 'avionics', volume: 0.55 });
    BOOT_ORDER.forEach((id, i) => {
      const d = displays[id];
      if (!d || live.dead.has(id)) return;
      const delay = 0.15 + i * 0.22;
      d._bootDelay = delay;
      d.setKind('dead');
      setTimeoutGame(delay, () => {
        if (!power.avionics || live.dead.has(id)) return;
        d.setKind('boot', { duration: 1.6 + (i % 3) * 0.35, title: 'RANGER AVIONICS', unit: `DU ${i + 1}`, next: pageKind(id), nextState: pageState(id), onDone: () => { if (i % 4 === 0) audio.sfx('beep', { volume: 0.25 }); push(id, true); } });
        d.setPower(1);
        if (i % 3 === 0) audio.sfx(i === 0 ? 'beep_double' : 'beep', { volume: 0.2 });
      });
    });
    setTimeoutGame(0.15 + BOOT_ORDER.length * 0.22 + 2.6, () => {
      if (!power.avionics) return;
      power.booted = true;
      for (const id of Object.keys(displays)) push(id, true);
      if (!live.tone) live.tone = audio.loop('cockpit_tone', { volume: 0.22, fade: 2 });
      for (const fn of hooks.power) fn({ ...power });
    });
  }
  const timers = [];
  let gameT = 0;
  function setTimeoutGame(s, fn) { timers.push({ t: gameT + s, fn }); }

  function setSwitch(id, on, { silent = false, snap = silent } = {}) {
    if (!(id in power) && id !== 'engineStart') return;
    const key = id === 'engineStart' ? 'engine' : id;
    on = !!on;
    if (power[key] === on) return;
    power[key] = on;
    cockpit.set(id, on ? 1 : 0, silent);
    if (!silent) {
      if (id === 'engineStart') { sfx('button', { at: id }); if (on) audio.sfx('engine_spool', { volume: 0.7 }); }
      else sfx(on ? SWITCH_SFX[id] : 'switch_off', { at: id });
    }
    if (id === 'avionics') {
      if (on) { if (snap) { power.booted = true; for (const d of Object.values(displays)) d.setPower(1); for (const sid of Object.keys(displays)) push(sid, true); } else boot(); }
      else { power.booted = false; for (const d of Object.values(displays)) { d.setKind('dead'); d.setPower(0); } live.tone?.stop(1); live.tone = null; }
    }
    if (id === 'rcs' && on && !silent) audio.sfx('rcs', { volume: 0.25 });
    applyTarget();
    if (snap) { live.p = live.target; cockpit.setPower(live.p); }
    pushKind('systems'); pushKind('text');
  }

  function use(id) {
    if (id in SWITCH_SFX || id === 'engineStart') { setSwitch(id, id === 'engineStart' ? true : !power[id]); return; }
    if (id === 'clamp') { cockpit.set('clamp', 1); sfx('clamp_handle', { at: 'clamp', volume: 0.85 }); return; }
    if (id === 'eject') { cockpit.set('eject', 1); sfx('latch', { at: 'eject', volume: 0.9 }); return; }
    if (id === 'hatch') { const open = cockpit.get('hatch') < 0.5; cockpit.set('hatch', open ? 1 : 0); sfx('hatch_servo', { at: 'hatch', volume: 0.8 }); setSystems({ hatch: open ? 'OPEN' : 'SEALED' }); return; }
    if (id === 'seat') sfx('bump_soft', { volume: 0.4 });
  }

  function registerInteractables(interact, handlers = {}, { enabled = [] } = {}) {
    for (const id of Object.keys(LABELS)) {
      const obj = objOf(id);
      if (!obj) continue;
      const def = { id, label: handlers.labels?.[id] || LABELS[id], hold: HOLD[id] || 0, range: id === 'seat' ? 2.6 : id === 'hatch' ? 2.2 : 1.9, enabled: enabled.includes(id), onUse: c => { if (handlers.auto !== false) use(id); handlers[id]?.(c, rig); } };
      if (id === 'seat') def.radius = 0.35;
      obj.userData.interact = def;
      interactDefs[id] = def;
      interact?.add?.(obj);
    }
    return interactDefs;
  }
  function enable(ids, on = true) {
    for (const id of [].concat(ids)) {
      if (!interactDefs[id]) continue;
      interactDefs[id].enabled = on;
      if (id !== 'seat' && id !== 'hatch') { if (on) setCue(id); else if (cueId === id) setCue(null); }
    }
  }
  function setLabel(id, label) { if (interactDefs[id]) interactDefs[id].label = label; }

  function setFlight(st, { reference = null, maxRate = 1.1 } = {}) {
    if (!st) return;
    const q = st.quaternion;
    _q.copy(reference || _q2.identity()).invert().multiply(q);
    _e.setFromQuaternion(_q, 'YXZ');
    const w = st.angularVelocity || _v.set(0, 0, 0);
    const a = pages.attitude;
    a.pitch = _e.x * DEG; a.yaw = ((-_e.y * DEG) % 360 + 360) % 360; a.roll = -_e.z * DEG;
    a.rates = { roll: -w.z * DEG, pitch: w.x * DEG, yaw: -w.y * DEG };
    const as = st.assist || {};
    a.mode = as.align ? 'AUTO ALIGN' : as.rollNull ? 'ROLL NULL' : as.rate === false ? 'RCS DIRECT' : 'RATE DAMP';
    const e = pages.engine;
    e.throttle = st.throttle || 0;
    e.state = extraSystems.engines === 'FLOODED' ? 'FLOODED' : e.throttle > 0.02 ? 'RUN' : power.engine ? 'ARMED' : 'OFF';
    e.fuel = Math.max(0, e.fuel - (e.throttle || 0) * 0.00004);
    if (st.alignError != null) pages.nav.alignError = st.alignError * DEG;
    cockpit.setStick?.(THREE.MathUtils.clamp(-w.y / maxRate, -1, 1), THREE.MathUtils.clamp(w.x / maxRate, -1, 1));
    cockpit.setThrottle?.(e.throttle);
    live.flightDirty = true;
  }
  function alignDir(bodyQuat, dirWorld, out = new THREE.Vector3()) {
    return out.copy(dirWorld).normalize().applyAxisAngle(_v.set(1, 0, 0).applyQuaternion(bodyQuat), -BORESIGHT);
  }
  function aim(bodyQuat, dirWorld) {
    _v.copy(dirWorld).normalize().applyQuaternion(_q.copy(bodyQuat).multiply(BORE_Q).invert());
    return { bearing: Math.atan2(_v.x, -_v.z) * DEG, elevation: Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) * DEG, error: Math.acos(THREE.MathUtils.clamp(-_v.z, -1, 1)) * DEG };
  }
  function setNav(o = {}) { Object.assign(pages.nav, o); if (o.alignError === undefined && o.bearing !== undefined) pages.nav.alignError = Math.hypot(o.bearing, o.elevation || 0); live.navDirty = true; }
  function setDock(o = {}) { Object.assign(pages.dock, o); live.dockDirty = true; }
  function setBeacon(o = {}) { Object.assign(pages.beacon, o); pushKind('beacon'); }
  function setSystems(o = {}) { Object.assign(extraSystems, o); pushKind('systems'); pushKind('text'); if (o.engines) pushKind('engine'); }
  function setText(slotId, o = {}) { texts[slotId] = { ...(texts[slotId] || {}), ...o }; push(slotId); }
  function setChecklist(items) { checklist = items; push('centre3'); }
  function setMode(m) { if (live.mode === m) return; live.mode = m; if (power.booted && !live.dead.has('mainL2')) { audio.sfx('button', { volume: 0.25 }); displays.mainL2.setKind(m, pageState('mainL2')); } }

  function heal() {
    live.dead.clear();
    cockpit.setFailure(0);
    for (const d of Object.values(displays)) d.setGlitch(0);
    live.alarm?.stop(0.3); live.alarm = null;
    for (const id of Object.keys(displays)) { if (power.booted) push(id, true); else { displays[id].setKind('dead'); displays[id].setPower(0); } }
  }
  function setDisplayGain(k) { for (const d of Object.values(displays)) if (d.material?.uniforms?.gain) d.material.uniforms.gain.value = 2.1 * k; }
  function setFailure(f) {
    const was = live.failure;
    live.failure = THREE.MathUtils.clamp(f, 0, 1);
    if (live.failure === 0 && (was > 0 || live.dead.size)) heal();
  }
  function applyFailure(dt) {
    const f = live.failure;
    cockpit.setFailure(f);
    FAIL_ORDER.forEach((id, i) => {
      const d = displays[id];
      if (!d) return;
      const death = 0.12 + i * 0.07;
      if (live.dead.has(id)) return;
      const g = THREE.MathUtils.smoothstep(f, death - 0.14, death);
      d.setGlitch(g * 0.9);
      if (f >= death) {
        live.dead.add(id);
        if (power.booted) d.setKind('text', { title: 'DU FAULT', lines: [{ text: 'DISPLAY UNIT FAILURE', color: 'red' }, { text: 'BUS FAULT  ' + (i + 1), color: 'red' }] });
        setTimeoutGame(0.35 + Math.random() * 0.3, () => { d.setGlitch(1); setTimeoutGame(0.15, () => { d.setKind('dead'); d.setPower(0); }); });
        audio.sfx('alarm_short', { volume: 0.45 });
        for (const fn of hooks.fail) fn(id, live.dead.size - 1);
      }
    });
    if (f > 0.05 && !live.alarm) live.alarm = audio.loop('alarm', { volume: 0, fade: 0.5 });
    live.alarm?.set({ volume: f > 0.05 ? 0.25 + 0.45 * f : 0, fade: 0.3 });
    if (f > 0.05 && Math.random() < dt * f * 0.8) audio.sfx('warn_beep', { volume: 0.25 + 0.3 * f });
  }

  function sit(seat = 'pilot') {
    return { anchor: eyes[seat] || eyes.pilot, yawLimit: 2.5, pitchLimit: 1.42, yaw: 0, pitch: -0.2 };
  }
  function stand(seat = 'pilot') {
    const s = cockpit.anchors[seat === 'pilot' ? 'seatPilot' : 'seatCopilot']?.position || new THREE.Vector3(-0.85, 0, -0.75);
    return { frame: frames.attached(ranger.group), colliders: cockpit.colliders, liveColliders: true, position: [s.x + (seat === 'pilot' ? 0.55 : -0.55), 1.12, s.z + 0.75], quaternion: new THREE.Quaternion(), radius: 0.3 };
  }
  function cabin(at = 'entry') {
    const e = cockpit.anchors.cabinEntry?.position || new THREE.Vector3(0, 0, 6.03);
    return { frame: frames.attached(ranger.group), colliders: cockpit.colliders, liveColliders: true, position: at === 'entry' ? [e.x, 1.05, e.z - 0.25] : at, quaternion: new THREE.Quaternion(), radius: 0.3 };
  }

  function update(dt, camera) {
    gameT += dt;
    if (cueId) { const k = 0.55 + 0.45 * Math.sin(gameT * 3.2); cueMat.color.setRGB(1.0 * k, 0.55 * k, 0.16 * k).multiplyScalar(live.p > 0.3 ? 0.8 : 2.2); }
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= gameT) { const t = timers.splice(i, 1)[0]; t.fn(); }
    const prev = live.p;
    if (live.p !== live.target) {
      const r = live.target > live.p ? 0.9 : 2.5;
      live.p += THREE.MathUtils.clamp(live.target - live.p, -r * dt, r * dt);
    }
    live.flick = Math.max(0, live.flick - dt);
    const pv = live.p * (live.flick > 0 ? 0.82 + 0.18 * Math.sin(gameT * 61) * Math.sin(gameT * 23) : 1);
    if (pv !== prev || live.flick > 0) cockpit.setPower(pv);
    if (live.failure > 0) applyFailure(dt);
    live.acc += dt;
    if (live.acc > 0.1) {
      live.acc = 0;
      if (live.flightDirty) { pushKind('attitude'); pushKind('engine'); live.flightDirty = false; }
      if (live.navDirty) { pushKind('nav'); live.navDirty = false; }
      if (live.dockDirty) { pushKind('dock'); live.dockDirty = false; }
    }
    cockpit.update(dt);
    if (manager) manager.update(dt, camera || live.camera || engine.camera);
    else for (const d of Object.values(displays)) d.update(dt);
  }

  function reset() {
    for (const k of Object.keys(power)) power[k] = false;
    for (const id of ['batt', 'fuelCells', 'avionics', 'rcs', 'engineStart', 'clamp', 'eject', 'hatch']) cockpit.set(id, 0, true);
    for (const k of Object.keys(extraSystems)) delete extraSystems[k];
    setDisplayGain(1);
    live.p = live.target = 0; live.failure = 0; live.dead.clear(); timers.length = 0; checklist = null; live.mode = 'nav'; setCue(null);
    cockpit.setPower(0); cockpit.setFailure(0);
    for (const d of Object.values(displays)) { d.setGlitch(0); d.setKind('dead'); d.setPower(0); }
    live.alarm?.stop(0.3); live.alarm = null; live.tone?.stop(0.5); live.tone = null;
    pages.engine.fuel = 0.94;
  }
  function powerUp(ids = ['batt', 'fuelCells', 'avionics', 'rcs']) { for (const id of ids) setSwitch(id, true, { silent: true }); }
  function silence() { live.alarm?.stop(0.2); live.alarm = null; live.tone?.stop(0.2); live.tone = null; }

  function dispose() {
    silence();
    for (const d of Object.values(displays)) { manager?.remove(d); d.dispose(); }
    seatProxy.removeFromParent(); seatProxy.geometry.dispose(); seatProxy.material.dispose();
    for (const o of Object.values(eyes)) o.removeFromParent();
    for (const id of Object.keys(interactDefs)) { const o = objOf(id); if (o) delete o.userData.interact; }
  }

  const rig = {
    ranger, cockpit, displays, manager, power, pages, eyes, seatProxy, headless,
    get failure() { return live.failure; }, get mode() { return live.mode; }, get powerLevel() { return live.p; }, get dead() { return [...live.dead]; },
    setSwitch, use, registerInteractables, enable, setCue, setDisplayGain, setLabel, objOf,
    setFlight, aim, alignDir, setNav, setDock, setBeacon, setSystems, setText, setChecklist, setMode, setFailure,
    setBounce: v => cockpit.setBounce?.(v),
    sit, stand, cabin, update, reset, heal, powerUp, silence, dispose, sfx,
    onFail(fn) { hooks.fail.add(fn); return () => hooks.fail.delete(fn); },
    onPower(fn) { hooks.power.add(fn); return () => hooks.power.delete(fn); },
  };
  return rig;
}
