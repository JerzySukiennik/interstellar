// Lookdev for in-world displays: every kind mounted in bezels on a dark wall, driven by live simulated state, with wall, seat and close-up presets.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDisplay, createDisplayManager, displaysReady, MONTH, YEAR } from '../models/displays.js';

const LAYOUT = [
  [0.42, [['clock', 'clock', 0.28, 0.18], ['wrist', 'wrist', 0.07, 0.045], ['attitude', 'attitude', 0.2, 0.15], ['nav', 'nav', 0.22, 0.165], ['dock', 'dock', 0.22, 0.165]]],
  [0.17, [['systems', 'systems', 0.26, 0.195], ['engine', 'engine', 0.18, 0.135], ['beacon', 'beacon', 0.16, 0.12], ['boot', 'boot', 0.2, 0.15], ['cryo', 'cryo', 0.2, 0.15]]],
  [-0.1, [['board', 'board', 0.3, 0.19], ['log', 'log', 0.24, 0.18], ['reader', 'log', 0.24, 0.18], ['recorder', 'recorder', 0.18, 0.135]]],
  [-0.33, [['text', 'text', 0.16, 0.12], ['dead', 'dead', 0.14, 0.105], ['glitch', 'attitude', 0.16, 0.12], ['cryo2', 'cryo', 0.16, 0.12]]],
];

const LOG_TITLES = ['THE FIRST STEP TOOK FOUR MONTHS', 'YOU ARE STILL STANDING AT THE WRECK', 'NO TELEMETRY TODAY', 'THE SEEDLINGS HAVE REACHED THE LIGHTS', 'I STOPPED COUNTING DAYS', 'THE WAVE. I SAW IT FROM HERE.', 'FUEL REPORT', 'I AM GOING TO SLEEP FOR A WHILE'];
const LOG_TEXT = 'I watched you come down the ramp on the long lens. Your boot touched the water in March. By the time the other boot followed it was July. I kept the telemetry window open all night as if that would make you move faster. It did not. The station is quiet. I talk to the plants now and they listen about as well as you do. The recorder will say everything is fine. It always says everything is fine.';

export default async function ({ engine, THREE, scene, camera, params }) {
  await displaysReady;
  scene.background = new THREE.Color(0x000000);
  const envMap = params.get('env') === '0' ? null : new THREE.PMREMGenerator(engine.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.12;
  const hemi = new THREE.HemisphereLight(0x9fb4c0, 0x101010, 0.25);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xdfe8ff, 6, 6, 0.7, 0.6, 1.5);
  key.position.set(0.4, 1.6, 1.4); key.target.position.set(0, 0, 0);
  scene.add(key, key.target);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85, metalness: 0.1 }));
  scene.add(wall);
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.42, metalness: 0.65 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x020304, roughness: 0.1 });
  const manager = createDisplayManager({ engine, budgetMs: 1.8, maxDistance: 8 });
  const D = {}, centers = {};
  let order = 0;
  for (const [y, row] of LAYOUT) {
    const gap = 0.06, total = row.reduce((a, r) => a + r[2], 0) + gap * (row.length - 1);
    let x = -total / 2;
    for (const [name, kind, w, h] of row) {
      const g = new THREE.Group();
      g.position.set(x + w / 2, y, 0);
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.026, h + 0.026, 0.02), bezelMat);
      bezel.position.z = 0.01;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
      glass.position.z = 0.0202;
      g.add(bezel, glass);
      scene.add(g);
      const res = Math.min(1024, Math.max(384, Math.round(w * 3600 / 16) * 16));
      const d = createDisplay(kind, { width: w, height: h, resolution: res, envMap, compact: name === 'cryo2' });
      d.mount({ id: name, mesh: glass, width: w, height: h, kind });
      manager.add(d);
      const i = order++;
      setTimeout(() => d.setPower(1), 250 + i * 140);
      D[name] = d;
      centers[name] = g.position.clone().setZ(0.02);
      x += w + gap;
    }
  }
  const gFix = params.get('glitch');
  let rateParam = params.get('rate') || 'auto';
  const clock = { ship: 3600 * 14.5, endurance: 3600 * 14.5 + 23 * YEAR + 4.2 * MONTH, rate: 1 };
  const rateAt = t => {
    if (rateParam === 'auto') { const c = t % 16; return c < 5 ? 1 : c < 7 ? Math.pow(MONTH, (c - 5) / 2) : c < 14 ? MONTH : Math.pow(MONTH, 1 - (c - 14) / 2); }
    if (rateParam === 'month') return MONTH;
    return Math.max(1, +rateParam || 1);
  };
  D.clock.setState({ source: clock });
  D.wrist.setState({ source: clock });
  const entries = Array.from({ length: 22 }, (_, i) => {
    const m = Math.floor(i * i * 0.9 + i * 2);
    return { t: `T+${String(Math.floor(m / 12)).padStart(2, '0')}y ${String(m % 12).padStart(2, '0')}m`, title: LOG_TITLES[i % LOG_TITLES.length], text: LOG_TEXT, read: i < 4 };
  });
  D.log.setState({ entries, selected: 0 });
  D.reader.setState({ entries, mode: 'reader', selected: 1, page: 0 });
  D.board.setState({ selected: 0 });
  D.text.setState({ title: 'COMMS', lines: ['WREN: I AM AWAKE.', 'COMMAND MODULE. COME UP', 'WHEN YOU ARE READY.', { text: 'LINK DEGRADED', color: 'amber' }], cursor: true });
  D.cryo2.setState({ pod: '02', occupant: 'WREN, A.', status: 'NO LIFE SIGNS', cycles: 31, age: 58.9, temp: 91.0 });
  const bootNext = () => D.boot.setKind('boot', { unit: 'DU 2', duration: 4.5, fail: -1, next: 'nav', nextState: { target: 'MILLER', bearing: 4, elevation: -2, range: 3.1e8, closing: 2200 }, onDone: d => setTimeout(() => bootNext(), 3500) });
  bootNext();
  const sysSteps = [
    { battery: 0.92, buses: { A: false, B: false }, avionics: false, fuelCells: [false, false, false], rcs: 'OFF', clamps: 'LOCKED', hatch: 'OPEN', engines: 'OFF' },
    { buses: { A: true, B: false } }, { buses: { A: true, B: true } }, { fuelCells: ['START', false, false] }, { fuelCells: [true, 'START', false] },
    { fuelCells: [true, true, 'START'] }, { fuelCells: [true, true, true] }, { avionics: 'BOOT' }, { avionics: true }, { hatch: 'CYCLING' }, { hatch: 'SEALED' },
    { rcs: 'ARMED' }, { rcs: 'ON' }, { clamps: 'MOVING' }, { clamps: 'RELEASED' }, { engines: 'START' }, { engines: 'RUN' }, { engines: 'FLOODED', drain: 30, drainTotal: 30 },
  ];
  let sysI = -1, sysT = 0;
  let t = 0;
  engine.onUpdate(dt => {
    t += dt;
    clock.rate = rateAt(t);
    clock.ship += dt;
    clock.endurance += dt * clock.rate;
    const rr = 0.3 * Math.cos(0.3 * t) * 12, rl = 0.2 * Math.cos(0.2 * t) * 25;
    D.attitude.setState({ pitch: 12 * Math.sin(0.3 * t), roll: -18 + 25 * Math.sin(0.2 * t), yaw: (t * 6) % 360, rates: { pitch: rr, roll: rl, yaw: 6 }, maxRate: 10 });
    const g = 0.5 + 0.5 * Math.sin(t * 0.45);
    D.glitch.setState({ pitch: -10 + 20 * Math.sin(t), roll: 40 * Math.sin(t * 0.7), rates: { roll: 8 } });
    D.glitch.setGlitch(gFix != null ? +gFix : g);
    const cues = ['ALIGN', 'BURN', 'HOLD', 'CUTOFF'];
    const cue = cues[Math.floor(t / 4) % 4];
    D.nav.setState({ target: ['ENDURANCE', 'MILLER', 'GARGANTUA'][Math.floor(t / 16) % 3], bearing: 20 * Math.cos(0.15 * t), elevation: 6 * Math.sin(0.21 * t), range: 1.4e9 - (t % 30) * 2.1e7, closing: 3400 + 40 * Math.sin(t), burn: { cue, tgo: 42 - (t % 16) * 2, dv: 900, dvRemaining: 900 - (t % 16) * 50 } });
    const dk = t % 24;
    const own = 5.3 + 2.4 * Math.exp(-dk / 4) * Math.cos(dk * 0.6);
    D.dock.setState({ offset: { x: 1.4 * Math.exp(-dk / 6) * Math.cos(dk), y: -0.8 * Math.exp(-dk / 6) * Math.sin(dk * 0.8) }, range: Math.max(0.4, 30 - dk * 1.25), closing: 1.25, rollRate: own, rollPhase: (t * 30) % 360 });
    D.engine.setState({ throttle: 0.5 + 0.45 * Math.sin(t * 0.4), fuel: 1 - (t % 40) / 40 * 0.95, burnTime: t % 60, chamber: [0.5 + 0.45 * Math.sin(t * 0.4), 0.5 + 0.44 * Math.sin(t * 0.4 + 0.05)] });
    const bd = 180 - (t % 30) * 5.8;
    D.beacon.setState({ bearing: 22 * Math.sin(t * 0.2), distance: Math.max(2, bd), strength: clamp01(1 - bd / 260), status: 'ALL GOOD' });
    D.cryo.setState({ pod: '02', occupant: 'WREN, A.', status: 'STASIS', cycles: 14, age: 41 + (clock.endurance - clock.ship) / YEAR * 0.01, temp: 88.2 + 0.1 * Math.sin(t), heartRate: 4 });
    D.recorder.setState({ elapsedMinutes: 47.3 + t / 60 });
    if (Math.floor(t / 1.4) !== Math.floor((t - dt) / 1.4)) D.log.setState({ selected: Math.floor(t / 1.4) % entries.length });
    if (Math.floor(t / 3) !== Math.floor((t - dt) / 3)) D.reader.setState({ page: (Math.floor(t / 3) % (D.reader.meta.pages || 1)) });
    sysT -= dt;
    if (sysT <= 0) {
      sysI = (sysI + 1) % sysSteps.length;
      D.systems.setState(sysSteps[sysI]);
      sysT = sysI === sysSteps.length - 1 ? 30 : 1.1;
    }
    if (D.systems.state.engines === 'FLOODED') D.systems.setState({ drain: Math.max(0, sysT) });
    manager.update(dt, camera);
  });
  const view = params.get('view') || 'wall';
  const focus = params.get('focus') || 'clock';
  const presets = {
    wall: () => window.__cam(0, 0.05, 1.75, 0, 0.05, 0, 42),
    seat: name => { const c = centers[name] || centers.clock; window.__cam(c.x + 0.12, c.y + 0.1, 0.7, c.x, c.y, 0, 50); },
    close: name => { const c = centers[name] || centers.clock; window.__cam(c.x + 0.03, c.y + 0.02, 0.2, c.x, c.y, 0, 40); },
  };
  (presets[view] || presets.wall)(focus);
  engine.film.letterbox = 0;
  engine.film.vignette = 0.35;
  return { displays: D, manager, clock, presets, stats: () => ({ ...manager.stats }), setRate: r => { rateParam = String(r); } };
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
