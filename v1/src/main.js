// Interstellar entry: engine and context wiring, settings, start screen with the co-op lobby and pause menu, loading line for every load phase, frame order, query params, HUD, history restore and the autoplay bot for scripted runs.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { attach as attachPrompts } from './core/prompts.js';
import { UI } from './core/ui.js';
import { Clock, MONTH } from './core/clock.js';
import { History } from './core/history.js';
import { Interact } from './core/interact.js';
import { Director, ORDER } from './core/director.js';
import { ViewRig } from './core/view.js';
import { Settings } from './core/settings.js';
import { Menu, PauseControl, startScreen } from './core/menu.js';
import { Coop } from './core/coop.js';
import { probe, openLan } from './core/net.js';

const params = new URLSearchParams(location.search);
const auto = params.get('auto') === '1';
const hud = params.has('hud');
const startId = ORDER.includes(params.get('ch')) ? params.get('ch') : ORDER[0];
const NOOP_LOOP = { set() {}, stop() {} };
const painted = () => new Promise(r => { const t = setTimeout(r, 250); if (typeof requestAnimationFrame !== 'function') return; requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); });
const situationOf = c => (c?.body ? 'flight' : c?.constructor?.name === 'FloatController' ? 'float' : 'foot');

function guardAudio(a) {
  const warned = new Set();
  const warn = (k, e) => { if (!warned.has(k)) { warned.add(k); console.warn(`[audio] ${String(k)} failed:`, e?.message || e); } };
  const fallback = k => (k === 'loop' ? NOOP_LOOP : k === 'init' || k === 'load' ? Promise.resolve() : undefined);
  return new Proxy({}, {
    get(_, k) {
      if (k === 'then') return undefined;
      if (k === 'available') return !!a;
      if (k === 'raw') return a;
      const f = a?.[k];
      if (a && k in a && typeof f !== 'function') return f;
      if (typeof f !== 'function') return () => fallback(k);
      return (...args) => {
        try { const r = f.apply(a, args); if (r && typeof r.catch === 'function') return r.catch(e => { warn(k, e); return fallback(k); }); return r ?? fallback(k); }
        catch (e) { warn(k, e); return fallback(k); }
      };
    },
  });
}

async function loadAudio(ctx) {
  try {
    const m = await import('./core/audio.js');
    let a = m.audio || m.default || (m.Audio && m.Audio);
    if (typeof a === 'function') a = new a(ctx);
    return guardAudio(a || null);
  } catch (e) { console.warn('[audio] module unavailable, running silent'); return guardAudio(null); }
}

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const _bv = new THREE.Vector3(), _bq = new THREE.Quaternion();

class Bot {
  constructor(ctx) {
    this.ctx = ctx;
    this.gain = 0.6;
    this.human = false;
    this.rand = rng(1);
    this.rate = { x: 0, y: 0 };
    this.sightT = 0;
    this.sightTarget = null;
    this.lastHead = 0;
  }

  setHuman(on, seed = 1) {
    this.human = !!on;
    this.rand = rng(seed);
    if (on) {
      this.ctx.director.on(type => { if (type === 'beat' && this.human && this.sightT <= 0) this.glanceAround(1.6); });
    }
  }

  r(a = 0, b = 1) { return a + (b - a) * this.rand(); }

  get ctl() { return this.ctx.controller; }

  get now() { return this.ctx.director.time; }

  wait(s) { return this.ctx.director.wait(s); }

  frame() { return this.ctx.director.wait(0); }

  async until(fn, timeout = 120, label = 'condition') {
    try { await this.ctx.director.until(fn, { timeout: this.human ? timeout * 4 : timeout }); }
    catch { throw new Error(`[bot] ${this.ctx.director.currentId}: timed out waiting for ${label}`); }
  }

  speed(x) { this.ctx.engine.timeScale = this.human ? 1 : x; }

  release(...codes) { for (const c of codes) this.ctx.input.setKey(c, false); }

  async react() { if (this.human) await this.wait(this.r(0.22, 0.45)); }

  async key(code, seconds) { await this.react(); this.ctx.input.setKey(code, true); await this.wait(seconds); this.ctx.input.setKey(code, false); }

  async hold(code, fn, timeout = 120, label = code) {
    await this.react();
    this.ctx.input.setKey(code, true);
    try { await this.until(() => { this.idleHead(); return fn(); }, timeout, label); } finally { this.ctx.input.setKey(code, false); }
  }

  mouse(dx, dy) { this.ctx.input.moveMouse(dx, dy); }

  async look(fn, seconds = 1) { const t = this.now + seconds; while (this.now < t) { fn(); await this.frame(); } }

  worldOf(target) {
    if (typeof target === 'function') target = target();
    if (target?.isVector3) return _bv.copy(target).clone();
    if (target?.isObject3D) return this.ctx.interact.center(target, new THREE.Vector3());
    return new THREE.Vector3(...target);
  }

  errors(world) {
    const cam = this.ctx.engine.camera;
    const d = world.clone().sub(cam.getWorldPosition(_bv)).applyQuaternion(cam.getWorldQuaternion(_bq).invert());
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }

  aim(world, { peak = 2.4 } = {}) {
    const sens = this.ctx.input.sensitivity;
    const e = this.errors(world);
    if (!this.human) {
      const lim = 0.5 / sens;
      this.mouse(THREE.MathUtils.clamp(-e.yaw / sens * this.gain, -lim, lim), THREE.MathUtils.clamp(-e.pitch / sens * this.gain, -lim, lim));
      return Math.hypot(e.yaw, e.pitch);
    }
    const dt = Math.min(0.05, Math.max(1 / 240, this.now - this.lastHead || 1 / 60));
    this.lastHead = this.now;
    const k = 26, c = 2 * 0.72 * Math.sqrt(k);
    for (const [ax, err] of [['x', e.yaw], ['y', e.pitch]]) {
      this.rate[ax] += (k * err - c * this.rate[ax]) * dt;
      this.rate[ax] = THREE.MathUtils.clamp(this.rate[ax], -peak, peak);
    }
    this.mouse(-this.rate.x * dt / sens, -this.rate.y * dt / sens);
    return Math.hypot(e.yaw, e.pitch);
  }

  idleHead() {
    if (!this.human || this.ctl?.body || this.ctl?.ladder) return;
    if (this.sightT > 0 && this.sightTarget) { this.sightT -= Math.max(0, this.now - (this._st || this.now)); this._st = this.now; this.aim(this.worldOf(this.sightTarget), { peak: 1.6 }); }
  }

  async face(target, { tol = 0.02, timeout = 10 } = {}) {
    const t = this.now + (this.human ? timeout * 2 : timeout);
    const T = this.human ? Math.max(tol, 0.035) : tol;
    while (true) {
      const w = this.worldOf(target);
      if (this.aim(w) < T && (!this.human || Math.hypot(this.rate.x, this.rate.y) < 0.15)) break;
      if (this.now > t) throw new Error(`[bot] ${this.ctx.director.currentId}: could not face target`);
      await this.frame();
    }
    if (this.human) await this.settle(target, this.r(0.15, 0.35));
  }

  async settle(target, seconds) { const t = this.now + seconds; while (this.now < t) { this.aim(this.worldOf(target), { peak: 1.2 }); await this.frame(); } }

  sight(target, seconds = 2) {
    if (!this.human) return Promise.resolve();
    this.sightTarget = target; this.sightT = seconds; this._st = this.now;
    return Promise.resolve();
  }

  async linger(seconds = 1.5) {
    if (!this.human) return;
    const t = this.now + seconds;
    while (this.now < t) { this.idleHead(); await this.frame(); }
  }

  async lookAround(seconds = 2.5) {
    if (!this.human || this.ctl?.body) return;
    const cam = this.ctx.engine.camera, end = this.now + seconds;
    while (this.now < end) {
      const yaw = this.r(-1.1, 1.1), pitch = this.r(-0.25, 0.3);
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
      const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 4);
      await this.settle(p, Math.min(end - this.now, this.r(0.7, 1.3)));
    }
  }

  glanceAround(seconds) {
    if (this.ctl?.body || this.ctl?.ladder) return;
    const cam = this.ctx.engine.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.r(-0.15, 0.2), this.r(-0.9, 0.9), 0, 'YXZ')).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    this.sight(cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 5), seconds);
  }

  async read(text = '', base = 1.2) { if (this.human) await this.linger(base + String(text).length / 17); }

  async use(id, { timeout = 15, unless = null } = {}) {
    const I = this.ctx.interact;
    const obj = I.get(id);
    if (!obj) throw new Error(`[bot] ${this.ctx.director.currentId}: no interactable ${id} (have ${I.list().map(o => o.id).join(', ')})`);
    const before = I.used(id);
    const end = this.now + (this.human ? timeout * 3 : timeout);
    await this.until(() => I.isEnabled(obj) || !!unless?.(), timeout, `${id} enabled`);
    if (unless?.()) return;
    const hold = obj.userData.interact.hold || 0;
    if (this.human) {
      this.sightT = 0;
      await this.face(obj, { tol: 0.06, timeout });
      await this.settle(obj, this.r(0.3, 0.7));
      await this.react();
    }
    while (I.used(id) === before && !unless?.()) {
      this.aim(I.center(obj, new THREE.Vector3()), { peak: 0.8 });
      if (I.current === obj) this.ctx.input.setKey(I.key, hold > 0 ? true : !this.ctx.input.down(I.key));
      else this.ctx.input.setKey(I.key, false);
      if (this.now > end) { this.ctx.input.setKey(I.key, false); throw new Error(`[bot] ${this.ctx.director.currentId}: could not use ${id} (focus ${I.current ? I.idOf(I.current) : 'none'})`); }
      await this.frame();
    }
    this.ctx.input.setKey(I.key, false);
    await this.frame();
    if (this.human) await this.settle(obj, this.r(0.2, 0.5));
  }

  async walkTo(target, { tol = 0.35, timeout = 400, run = false, look = null, stop = null } = {}) {
    const c = this.ctl, input = this.ctx.input, sens = input.sensitivity;
    const T = new THREE.Vector3(...target);
    const end = this.now + (this.human ? timeout * 3 : timeout);
    const phase = this.r(0, 6.28), wob = this.human ? this.r(0.03, 0.06) : 0, side = this.human ? this.r(-0.12, 0.12) : 0;
    let best = Infinity, stuck = 0, lt = this.now;
    if (this.human) await this.react();
    try {
      while (true) {
        const dx = T.x - c.position.x, dz = T.z - c.position.z, dist = Math.hypot(dx, dz);
        if (dist < tol || stop?.()) break;
        let heading = Math.atan2(-dx, -dz);
        if (this.human && stuck < 1.2) heading += (Math.sin(this.now * 0.9 + phase) * wob + side * Math.min(1, Math.max(0, dist - 1.2) / 3)) * Math.min(1, dist / 3);
        const yawErr = Math.atan2(Math.sin(heading - c.yaw), Math.cos(heading - c.yaw));
        if (this.human && this.sightT > 0 && this.sightTarget) {
          this.idleHead();
          const a = Math.atan2(Math.sin(heading - c.yaw), Math.cos(heading - c.yaw));
          input.setKey('KeyW', Math.abs(a) < 1.18); input.setKey('KeyS', Math.abs(a) > 1.96);
          input.setKey('KeyA', a > 0.39 && a < 2.75); input.setKey('KeyD', a < -0.39 && a > -2.75);
        } else if (this.human) {
          const dt = Math.min(0.05, Math.max(1 / 240, this.now - this.lastHead || 1 / 60));
          this.lastHead = this.now;
          const k = 14, cc = 2 * 0.85 * Math.sqrt(k);
          this.rate.x += (k * yawErr - cc * this.rate.x) * dt; this.rate.x = THREE.MathUtils.clamp(this.rate.x, -1.8, 1.8);
          this.rate.y += (k * (-0.06 - c.pitch) - cc * this.rate.y) * dt;
          this.mouse(-this.rate.x * dt / sens, look ? 0 : -this.rate.y * dt / sens);
          input.setKey('KeyW', Math.abs(yawErr) < 0.7 && !(dist < 0.55 && this.rand() < 0.5));
          input.setKey('KeyA', false); input.setKey('KeyD', false); input.setKey('KeyS', false);
        } else {
          this.mouse(THREE.MathUtils.clamp(-yawErr / sens * this.gain, -300, 300), look ? 0 : c.pitch / sens * 0.3);
          input.setKey('KeyW', Math.abs(yawErr) < 0.6);
        }
        input.setKey('ShiftLeft', run && !this.human);
        if (dist < best - 0.05) { best = dist; stuck = 0; } else stuck += this.now - lt;
        lt = this.now;
        if (stuck > (this.human ? 10 : 6)) throw new Error(`[bot] ${this.ctx.director.currentId}: stuck walking to ${target} at ${c.position.toArray().map(v => v.toFixed(2))}`);
        if (this.now > end) throw new Error(`[bot] ${this.ctx.director.currentId}: walkTo ${target} timed out`);
        await this.frame();
      }
    } finally { for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) input.setKey(k, false); }
    if (this.human && this.rand() < 0.3) await this.linger(this.r(0.3, 0.9));
  }

  thrust(dvBody, db = 0.04) {
    const k = this.ctx.input;
    const want = { KeyD: dvBody.x > db, KeyA: dvBody.x < -db, Space: dvBody.y > db, KeyC: dvBody.y < -db, KeyS: dvBody.z > db, KeyW: dvBody.z < -db };
    if (!this.human) { for (const [code, on] of Object.entries(want)) k.setKey(code, on); return; }
    this._pulse ||= {};
    for (const [code, on] of Object.entries(want)) {
      const p = this._pulse[code] ||= { on: false, t: -1 };
      if (on !== p.on && this.now - p.t > 0.18) { p.on = on; p.t = this.now; }
      k.setKey(code, p.on);
    }
  }

  async moveTo(target, { tol = 0.5, vmax = 1.4, gain = 0.7, stopSpeed = 0.25, timeout = 300, face = true, stop = null } = {}) {
    const c = this.ctl;
    const T = new THREE.Vector3(...target);
    const isFlight = !!c.body;
    const end = this.now + (this.human ? timeout * 3 : timeout);
    const vm = this.human && !isFlight ? Math.min(vmax, 0.75) : this.human ? vmax * 0.7 : vmax;
    if (this.human) await this.react();
    try {
      while (true) {
        const pos = c.position, vel = c.velocity;
        const err = T.clone().sub(pos), dist = err.length();
        if ((dist < tol && vel.length() < stopSpeed) || stop?.()) break;
        const vdes = err.clone().setLength(Math.min(vm, dist * (this.human ? gain * 0.6 : gain)));
        const dv = vdes.sub(vel).applyQuaternion(c.quaternion.clone().invert());
        this.thrust(dv, isFlight ? (this.human ? 0.3 : 0.15) : this.human ? 0.12 : 0.04);
        if (this.human && this.sightT > 0) this.idleHead();
        else if (face && !isFlight && dist > 1.2) this.aim(c.frame.toWorld(T, new THREE.Vector3()), { peak: 1.2 });
        if (this.now > end) throw new Error(`[bot] ${this.ctx.director.currentId}: moveTo ${target} timed out at ${pos.toArray().map(v => v.toFixed(2))}`);
        await this.frame();
      }
    } finally { this.thrust(new THREE.Vector3()); if (this.human) for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC']) this.ctx.input.setKey(k, false); this._pulse = {}; }
  }

  async shot(name) { if (window.__shot && !this.human) { const E = this.ctx.engine, ts = E.timeScale; this.speed(1); await this.wait(0.6); await window.__shot(name, { gpuMs: +(E.gpuMs || 0).toFixed(2), cpuMs: +E.frameMs.toFixed(2), fps: +E.fps.toFixed(0), calls: E.lastInfo.calls, tris: E.lastInfo.triangles, beat: this.ctx.director.beat }); this.speed(ts); } }
}

async function restore(ctx) {
  const { history, clock } = ctx;
  const apply = id => { const c = history.rewindTo(id); Object.assign(ctx.state, c.state); clock.fromJSON(c.clock); return id; };
  if (!params.has('ch')) {
    if (!auto && history.load()) {
      const cps = Object.entries(history.data.checkpoints).sort((a, b) => b[1].t - a[1].t);
      if (cps.length) return { src: 'save', id: cps[0][0], apply };
    }
    history.clear(false);
    return { src: 'fresh', id: ORDER[0] };
  }
  if (startId === ORDER[0]) { history.clear(false); return { src: 'fresh', id: startId }; }
  if (history.load() && history.data.checkpoints[startId]) return { src: 'stored', id: apply(startId) };
  try {
    const name = (params.get('fixture') || 'history-auto').replace(/[^\w-]/g, '');
    const r = await fetch(`Niepotrzebne/fixtures/${name}.json`, { cache: 'no-store' });
    if (r.ok && history.import(await r.text()) && history.data.checkpoints[startId]) { history.persist = false; return { src: 'fixture', id: apply(startId) }; }
  } catch {}
  history.clear(false);
  history.persist = false;
  return { src: 'defaults', id: startId };
}

function hudText(ctx) {
  const { engine: e, clock: c, director: d, history: h } = ctx;
  const f = c.format;
  return `${e.fps.toFixed(0)} fps  gpu ${e.gpuMs ? e.gpuMs.toFixed(1) : 'n/a'} ms  cpu ${e.frameMs.toFixed(1)} ms  ${e.lastInfo.calls} calls  ${(e.lastInfo.triangles / 1000).toFixed(0)}k tris  ${e.width}x${e.height} ${e.qualityName}  x${e.timeScale}\n`
    + `${d.currentId || '-'} / ${d.beat || '-'}${d.busy ? ' (loading)' : ''}\n`
    + `ship ${f.hms(c.ship)}  endurance ${f.ymd(c.endurance)}  rate ${c.rate < 1000 ? c.rate.toFixed(1) : (c.rate / MONTH).toFixed(3) + ' mo/s'}  +${c.years().toFixed(2)} y\n`
    + `seg ${h.segment?.id || '-'} (${h.segment?.samples.length ?? 0})  events ${h.data.events.length}  shots ${h.data.snapshots.length}`
    + (ctx.net ? `\ncoop ${ctx.net.role} ${ctx.net.linked ? 'linked' : ctx.net.link.open ? 'alone' : 'offline'}  sent ${ctx.net.link.stats.sent} recv ${ctx.net.link.stats.recv}  body ${Math.round(ctx.net.tracks.body.age)} ms  ship ${Math.round(ctx.net.tracks.ship.age)} ms` : '');
}

async function main() {
  const canvas = document.getElementById('c');
  const engine = new Engine({ canvas, quality: params.get('q') || 'ultra', dynamic: params.get('dr') !== '0' });
  const input = new Input(canvas, { auto });
  attachPrompts(input);
  const ui = new UI();
  const clock = new Clock();
  const history = new History({ clock, engine });
  const settings = new Settings({ storage: auto ? null : undefined });
  const ctx = { engine, film: engine.film, input, audio: null, history, clock, ui, director: null, interact: null, controller: null, net: null, settings, state: { surfaceSeconds: 0, years: 0, waveHit: false }, debug: { auto, hud, params } };
  ctx.interact = new Interact(ctx);
  ctx.director = new Director(ctx);
  ctx.view = new ViewRig(ctx);
  ui.film = engine.film;
  ui.input = input;
  ui.probe = () => { const d = ctx.interact.current?.userData.interact; return d ? { label: d.label, hold: d.hold || 0 } : null; };
  window.__engine = engine;
  engine.film.fade = 1;
  ui.strict = auto;
  if (!auto) { ui.loading(true, 'boot'); await painted(); }
  ctx.audio = await loadAudio(ctx);
  settings.bind(ctx, { except: params.has('dr') ? ['resolution'] : [] });
  const restored = await restore(ctx);
  ctx.debug.restored = restored.src;
  let chapter = restored.id;
  if (restored.src === 'save') restored.apply(chapter);

  let menu = null, playing = false, wall = performance.now();
  const prog = ctx.debug.programs = { chapter: null, base: 0, added: 0, frames: 0, by: {} };
  ctx.director.on((type, data) => { if (type === 'enter') { prog.chapter = data.chapter; prog.frames = 0; prog.added = 0; prog.by[data.chapter] = 0; } });
  if (!auto) ctx.director.on((type, data) => { if (type === 'load' && playing && ctx.director.busy) ui.loading(true, data.chapter); else if (type === 'enter') { playing = true; ui.loading(false); } else if (type === 'error') ui.loading(false); });
  engine.onUpdate(dt => {
    const now = performance.now(), wdt = Math.min(0.1, Math.max(0, (now - wall) / 1000));
    wall = now;
    history.tick(dt);
    clock.update(dt);
    ctx.state.years = Math.round(clock.years() * 1000) / 1000;
    ctx.director.update(dt);
    ctx.interact.update(dt);
    ctx.net?.frame(dt);
    ctx.view.update(dt);
    ui.tick(dt);
    ui.frame(engine.camera);
    if (!auto) {
      if (playing && ctx.director.busy && !ui.state.loading && engine.film.fade >= 0.9) ui.loading(true, ORDER[ORDER.indexOf(ctx.director.currentId) + 1] || 'chapter');
      menu?.update(wdt);
    }
    input.endFrame(dt);
    const n = engine.renderer.info.programs?.length ?? 0;
    if (prog.chapter && !ctx.director.busy) { if (prog.frames++ === 3) prog.base = n; else if (prog.frames > 3 && n > prog.base) { prog.added += n - prog.base; prog.by[prog.chapter] = prog.added; prog.base = n; console.warn(`[engine] ${n} programs: shader compiled during play in ${prog.chapter} / ${ctx.director.beat}`); } }
  });
  const persist = () => { if (ctx.director.current) history.save(ctx.state); };
  addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  addEventListener('pagehide', persist);
  if (hud) setInterval(() => ui.hud(hudText(ctx)), 250);

  if (auto) {
    ctx.bot = new Bot(ctx);
    ctx.autoplay = opts => autoplay(ctx, opts);
    ctx.coop = opts => { ctx.net?.close(); ctx.net = new Coop(ctx, opts); return ctx.net; };
    window.__game = ctx;
  }
  engine.start();
  await ctx.director.prepare(chapter);
  let audioReady = null;
  if (!auto) {
    await ui.loading(false);
    menu = ctx.menu = new Menu(ui, input, { settings });
    const info = await probe();
    const choice = await startScreen(menu, { save: restored.src === 'save', coop: info ? lobby(ctx, info) : null });
    const pick = choice === 'host' ? (restored.src === 'save' ? 'continue' : 'begin') : choice === 'join' ? 'begin' : choice;
    if (input.device !== 'pad') input.lock();
    const fresh = pick === 'new' && chapter !== ORDER[0];
    ui.loading(true, fresh || ctx.net ? 'new' : 'begin');
    await painted();
    audioReady = ctx.audio.init();
    if (ctx.net) {
      if (choice === 'join') {
        history.clear();
        Object.assign(ctx.state, { surfaceSeconds: 0, years: 0, waveHit: false });
        clock.fromJSON({ ship: 0, endurance: 0, rate: 1 });
        chapter = ORDER.includes(ctx.net.fact('at')) ? ctx.net.fact('at') : ORDER[0];
      } else ctx.net.fact('at', chapter);
      ctx.director.discard();
      await ctx.director.prepare(chapter);
    }
    if (pick === 'new') {
      history.clear();
      Object.assign(ctx.state, { surfaceSeconds: 0, years: 0, waveHit: false });
      clock.fromJSON({ ship: 0, endurance: 0, rate: 1 });
      if (fresh) { chapter = ORDER[0]; await ctx.director.prepare(chapter); }
    }
    const pause = ctx.pause = new PauseControl({ input, menu, engine, interact: ctx.interact, audio: ctx.audio, ui, situation: () => situationOf(ctx.controller), onBeginAgain: () => { menu.close(); ui.loading(true, 'boot', { remember: false }); painted().then(() => beginAgain(history)); } }).attach();
    canvas.addEventListener('pointerdown', () => { if (!input.mouse.locked && !pause.paused) input.lock(); });
    setTimeout(() => { if (input.device !== 'pad' && !input.mouse.locked && pause.canLock) pause.open(); }, 900);
  }
  await (audioReady || ctx.audio.init());
  const began = ctx.director.begin({ fade: 2.0 });
  window.__ready = true;
  await began;
}

function lobby(ctx, info) {
  const st = { opening: false, addresses: [], port: info.port };
  return {
    canHost: !!info.local,
    async host() {
      st.opening = true;
      if (!ctx.net) ctx.net = new Coop(ctx, { role: 'host' });
      const r = await openLan('', true);
      st.addresses = r?.addresses || []; st.port = r?.port || info.port; st.opening = false;
    },
    join() { if (!ctx.net) ctx.net = new Coop(ctx, { role: 'guest' }); },
    leave() { const host = ctx.net?.host; ctx.net?.close(); ctx.net = null; if (host) openLan('', false); },
    status() {
      const n = ctx.net;
      return { opening: st.opening, addresses: st.addresses, port: st.port, open: !!n?.link.open, linked: !!n?.linked, error: n?.link.error || null, started: !!n && !n.host && n.linked && !!n.fact('at') };
    },
  };
}

function beginAgain(history) {
  history.clear();
  history.persist = false;
  const p = new URLSearchParams(location.search);
  p.delete('ch');
  location.href = location.pathname + (p.toString() ? '?' + p : '');
}

async function autoplay(ctx, { speed = 10, onChapter, dawdle = +(params.get('dawdle') || 0), until = null, human = params.get('human') === '1', seed = +(params.get('seed') || 1) } = {}) {
  ctx.debug.dawdle = Math.max(0, Math.round(+dawdle || 0));
  ctx.debug.human = !!human;
  ctx.bot.setHuman(human, seed);
  const { director: d, bot } = ctx;
  const summary = [];
  let ended = false;
  d.on(type => { if (type === 'end') ended = true; });
  while (!ended) {
    await bot.until(() => (d.current && !d.busy) || ended, 120 * Math.max(1, ctx.engine.timeScale), 'chapter ready');
    if (ended) break;
    const id = d.currentId, mod = d.current;
    const t0 = performance.now(), g0 = ctx.history.time, y0 = ctx.clock.years();
    bot.speed(speed);
    if (typeof mod.auto !== 'function') throw new Error(`chapter ${id} has no auto()`);
    await mod.auto(ctx, bot);
    await bot.until(() => d.currentId !== id || ended, 120 * Math.max(1, ctx.engine.timeScale), `leaving ${id}`);
    const segs = ctx.history.data.segments.filter(sg => sg.chapter === id);
    const ev = ctx.history.data.events.filter(e => segs.some(sg => sg.id === e.seg));
    const row = { programsAdded: ctx.debug.programs?.by[id] ?? null, chapter: id, wallSeconds: +((performance.now() - t0) / 1000).toFixed(1), gameSeconds: +(ctx.history.time - g0).toFixed(1), segments: segs.length, samples: segs.reduce((n, sg) => n + sg.samples.length, 0), events: ev.length, types: [...new Set(ev.map(e => e.type))], years: +(ctx.clock.years() - y0).toFixed(3) };
    summary.push(row);
    await onChapter?.(row);
    if (until && id === until) break;
  }
  bot.speed(1);
  ctx.history.save(ctx.state);
  const bad = [...ctx.ui.early].map(id => `${id}: done before the lesson was ever active`).concat([...ctx.ui.faults].map(([id, e]) => `${id}: ${e}`));
  if (bad.length) console.error(`[ui] lesson conditions: ${bad.join('; ')}`);
  return summary;
}

main().catch(e => { console.error('[main]', e); window.__error = String(e?.stack || e); });
