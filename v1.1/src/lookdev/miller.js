// Lookdev for chapter 4: runs the real Miller chapter on a silent context and jumps straight to each beat, framed against refs 16 to 19 and 15, with a GPU benchmark.
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { UI } from '../core/ui.js';
import { Clock } from '../core/clock.js';
import { History } from '../core/history.js';
import { Interact } from '../core/interact.js';
import { Director } from '../core/director.js';
import chapter, { stage, WAVE } from '../chapters/04-miller.js';
import { LZ, UPWIND, SEABED, START } from '../chapters/miller/world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const silent = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : k === 'loop' ? () => ({ set() {}, stop() {} }) : () => undefined) });
const SIDE = V(-UPWIND.z, 0, UPWIND.x);
const at = (fwd, side = 0, up = 0) => LZ.clone().addScaledVector(UPWIND, fwd).addScaledVector(SIDE, side).setY(up);
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

function presets(ctx) {
  const R = () => LZ.clone().setY(SEABED + 2.61);
  const W = () => at(-120);
  return {
    cloud: () => stage(ctx, 'breakout', { view: 'fly', p: at(-2200, 0, 1900), v: UPWIND.clone().multiplyScalar(50).setY(-28), controls: true, look: 'cloud', wet: 1, flow: 1.6, shake: 1 }),
    wrist: () => { const p = at(-40, 1); return stage(ctx, 'wrist', { view: 'fp', p, yaw: yawTo(p, W()), pitch: -0.95, helmet: true, hatch: true, wrist: true, look: 'surface', surface: 45 }); },
    breakout: () => stage(ctx, 'breakout', { view: 'fly', p: at(-1500, 0, 1430), v: UPWIND.clone().multiplyScalar(48).setY(-24), controls: true, pitch: -0.12, look: 'descent', wet: 0.5, flow: 1.2, shake: 0.25 }),
    touchdown: () => stage(ctx, 'touchdown', { view: 'fly', p: R().setY(SEABED + 2.61 + 3.5), v: V(0, -1.2, 0), controls: true, gear: 1, pitch: -0.32, look: 'descent', wet: 0.3 }),
    hatch: () => stage(ctx, 'hatch', { view: 'ext', hatch: true, cam: at(-26, 0, 0.75), at: at(0, 0, 0.9), fov: 24, look: 'rear', wx: { wind: 0.5, mist: 1 / 650, cloud: 1.6 } }),
    wade: () => { const p = at(-55, -3); return stage(ctx, 'wade', { view: 'fp', p, yaw: yawTo(p, W()) + 0.12, pitch: -0.12, helmet: true, hatch: true, look: 'surface' }); },
    wreck: () => stage(ctx, 'wreck', { view: 'fp', p: 'approach', pitch: -0.32, helmet: true, hatch: true, look: 'surface', surface: 130 }),
    wave16: () => { const p = at(-116, 2); return stage(ctx, 'wave16', { view: 'fp', p, yaw: yawTo(p, at(8000, 0)), pitch: 0.06, helmet: true, hatch: true, recorder: true, look: 'mountains', wave: 3500, run: false, surface: 140 }); },
    back17: () => stage(ctx, 'back17', { view: 'ext', hatch: true, recorder: true, cam: at(-22, -34, 2.6), at: at(30, 20, 15), fov: 40, look: 'wave', wave: 300, wx: { wind: 0.9, mist: 1 / 950, cloud: 0.1, draw: 0.6 } }),
    approach17: () => { const p = at(-60, 2.5); return stage(ctx, 'approach17', { view: 'fp', p, yaw: yawTo(p, at(600, 0)), pitch: 0.22, helmet: true, hatch: true, recorder: true, look: 'wave', wave: 900, wrist: false }); },
    back4000: () => { const p = at(-90, 1); return stage(ctx, 'back', { view: 'fp', p, yaw: yawTo(p, at(0, 0)), pitch: 0.05, helmet: true, hatch: true, recorder: true, look: 'wave', wave: 4000 }); },
    back2000: () => { const p = at(-60, 1); return stage(ctx, 'back', { view: 'fp', p, yaw: yawTo(p, at(0, 0)), pitch: 0.1, helmet: true, hatch: true, recorder: true, look: 'wave', wave: 2000 }); },
    back1000: () => { const p = at(-35, 1); return stage(ctx, 'back', { view: 'fp', p, yaw: yawTo(p, at(0, 0)), pitch: 0.18, helmet: true, hatch: true, recorder: true, look: 'wave', wave: 1000 }); },
    liftoff: () => stage(ctx, 'liftoff', { view: 'fly', p: R().setY(260), align: UPWIND.clone().setY(0.42).normalize(), lifted: true, controls: false, run: true, wave: 120, look: 'climb', wet: 0.6, flow: 1.4, shake: 0.35, wx: { wind: 0.95, mist: 1 / 600, draw: 0.6 } }),
    caught: () => stage(ctx, 'caught', { view: 'seat', p: R(), carry: true, wave: -60, look: 'carried', helmet: true, wet: 1, sheet: 0.4, flow: 2.5, shake: 2.0, wx: { wind: 1, mist: 1 / 300 } }),
    drift: () => stage(ctx, 'drift', { view: 'seat', p: R(), drain: 34, wave: 7800, next: false, look: 'drift', helmet: true, wet: 0.9, flow: 0.35, pitch: 0.02, wx: { wind: 0.7, mist: 1 / 420 } }),
  };
}

export default async function ({ engine }) {
  const canvas = engine.renderer.domElement;
  const clock = new Clock();
  const history = new History({ clock, engine });
  const ctx = { engine, film: engine.film, input: new Input(canvas, { auto: true }), audio: silent, history, clock, ui: new UI(), director: null, interact: null, controller: null, state: { surfaceSeconds: 0, years: 0, waveHit: false }, debug: { lookdev: true } };
  ctx.interact = new Interact(ctx);
  ctx.director = new Director(ctx, {});
  await chapter.load(ctx);
  ctx.director.current = chapter;
  ctx.director.currentId = 'miller';
  chapter.enter(ctx);
  ctx.film.fade = 0;
  engine.onUpdate(dt => {
    history.tick(dt);
    clock.update(dt);
    ctx.director.update(dt);
    ctx.interact.update(dt);
    ctx.input.endFrame(dt);
  });
  const P = presets(ctx);
  const params = new URLSearchParams(location.search);
  const name = params.get('p');
  const go = n => { const r = P[n]?.(); ctx.film.fade = 0; return r ? n : null; };
  if (name && P[name]) go(name);
  const settle = ms => new Promise(r => setTimeout(r, ms));
  async function bench(ms = 2000) { engine.gpuMs = 0; await settle(ms); return { gpuMs: +engine.gpuMs.toFixed(2), calls: engine.lastInfo.calls, tris: engine.lastInfo.triangles, size: `${engine.width}x${engine.height}` }; }
  return { ctx, go, presets: Object.keys(P), bench, WAVE, START };
}
