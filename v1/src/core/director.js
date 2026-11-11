// Interstellar director: chapter registry, lazy loading behind film fades, game-time waits and cancellable beat scripts.
import * as THREE from 'three';

export const CHAPTERS = {
  awakening: () => import('../chapters/01-awakening.js'),
  departure: () => import('../chapters/02-departure.js'),
  spaceflight: () => import('../chapters/03-spaceflight.js'),
  miller: () => import('../chapters/04-miller.js'),
  return: () => import('../chapters/05-return.js'),
  years: () => import('../chapters/05b-years.js'),
  gargantua: () => import('../chapters/06-gargantua.js'),
  tesseract: () => import('../chapters/07-tesseract.js'),
};

export const ORDER = Object.keys(CHAPTERS);

const CANCEL = Symbol('cancel');
const quiet = p => { p.catch(() => {}); return p; };

export class Director {
  constructor(ctx, registry = CHAPTERS) {
    this.ctx = ctx;
    this.registry = registry;
    this.order = Object.keys(registry);
    this.current = null;
    this.currentId = null;
    this.beat = null;
    this.busy = false;
    this.time = 0;
    this._prepared = null;
    this._waits = [];
    this._scripts = new Set();
    this._listeners = new Set();
    this._blank = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 1, 0.1, 10) };
  }

  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  _emit(type, data) { for (const fn of this._listeners) { try { fn(type, data); } catch (e) { console.error(e); } } }

  wait(seconds, token) {
    return new Promise((resolve, reject) => this._waits.push({ t: this.time + Math.max(0, seconds), resolve, reject, token }));
  }

  until(fn, { timeout = Infinity, token } = {}) {
    return new Promise((resolve, reject) => this._waits.push({ fn, t: this.time + timeout, resolve, reject, token, timeoutFail: timeout !== Infinity }));
  }

  script(fn, name = this.currentId) {
    const token = { cancelled: false, name };
    const ctx = this.ctx;
    const s = {
      token,
      wait: sec => quiet(this.wait(sec, token)),
      until: (cond, timeout) => quiet(this.until(cond, { timeout, token })),
      frame: () => quiet(this.wait(0, token)),
      beat: id => { this.beat = id; this._emit('beat', { chapter: this.currentId, beat: id }); },
      gaze: async (target, { angle = 6, seconds = 0.5, range = Infinity } = {}) => {
        let held = 0, last = this.time;
        await this.until(() => { const dt = this.time - last; last = this.time; held = ctx.interact.looking(typeof target === 'function' ? target() : target, angle, range) ? held + dt : 0; return held >= seconds; }, { token });
      },
      tween: (sec, fn, ease = true) => { const t0 = this.time; return quiet(this.until(() => { const u = Math.min(1, (this.time - t0) / Math.max(1e-6, sec)); fn(ease ? u * u * (3 - 2 * u) : u); return u >= 1; }, { token })); },
      fork: f => this.script(f, name + '/fork'),
      fade: async (to, seconds = 1) => { ctx.film.to({ fade: to }, seconds); await this.wait(seconds, token); },
    };
    this._scripts.add(token);
    const done = Promise.resolve().then(() => fn(s)).catch(e => { if (e !== CANCEL) { console.error(`[director] script ${name} failed`, e); window.__error ||= String(e?.stack || e); } }).finally(() => this._scripts.delete(token));
    token.done = done;
    return token;
  }

  cancelScripts() {
    for (const t of this._scripts) t.cancelled = true;
    this._waits = this._waits.filter(w => { if (w.token?.cancelled) { w.reject(CANCEL); return false; } return true; });
    this._scripts.clear();
  }

  update(dt) {
    this.time += dt;
    if (this._waits.length) {
      const keep = [];
      for (const w of this._waits) {
        if (w.token?.cancelled) { w.reject(CANCEL); continue; }
        let ok = false;
        try { ok = w.fn ? w.fn() : this.time >= w.t; } catch (e) { w.reject(e); continue; }
        if (ok) w.resolve();
        else if (w.fn && this.time >= w.t) { if (w.timeoutFail) w.reject(new Error('until timed out')); else w.resolve(); }
        else keep.push(w);
      }
      this._waits = keep;
    }
    if (this.current && !this.busy) {
      try { this.current.update?.(this.ctx, dt); } catch (e) { console.error(`[director] ${this.currentId}.update`, e); window.__error ||= String(e?.stack || e); this.current = null; }
    }
  }

  async prepare(id) {
    const loader = this.registry[id];
    if (!loader) throw new Error(`unknown chapter ${id}`);
    const mod = (await loader()).default;
    if (!mod || mod.id !== id) throw new Error(`chapter module ${id} has wrong id ${mod?.id}`);
    this._emit('load', { chapter: id });
    await mod.load?.(this.ctx);
    this._prepared = { id, mod };
    return mod;
  }

  discard() {
    const p = this._prepared;
    this._prepared = null;
    try { p?.mod.dispose?.(this.ctx); } catch (e) { console.error(`[director] ${p.id}.dispose`, e); }
  }

  async begin({ fade = 1.2 } = {}) {
    const p = this._prepared;
    if (!p) throw new Error('nothing prepared');
    this._prepared = null;
    const ctx = this.ctx;
    this.current = p.mod; this.currentId = p.id; this.beat = null;
    ctx.history.checkpoint(p.id, ctx.state);
    ctx.history.save(ctx.state);
    p.mod.enter?.(ctx);
    this.busy = false;
    this._emit('enter', { chapter: p.id });
    if (fade > 0) { ctx.film.to({ fade: 0 }, fade); await this.wait(fade); } else ctx.film.fade = 0;
  }

  async goto(id, { fade = 1.0, fadeIn = 1.2, color } = {}) {
    if (this.busy) { console.warn(`[director] goto ${id} ignored while switching`); return; }
    const ctx = this.ctx;
    this.busy = true;
    try {
      if (color) ctx.film.to({ fadeColor: color }, 0);
      if (this.current && fade > 0) { ctx.film.to({ fade: 1 }, fade); await this.wait(fade); }
      ctx.film.fade = 1;
      const prev = this.current, prevId = this.currentId;
      this.cancelScripts();
      if (prev) {
        try { prev.exit?.(ctx); } catch (e) { console.error(`[director] ${prevId}.exit`, e); }
        ctx.history.endSegment();
        try { prev.dispose?.(ctx); } catch (e) { console.error(`[director] ${prevId}.dispose`, e); }
        this._emit('exit', { chapter: prevId });
      }
      this.current = null;
      ctx.interact.clear();
      ctx.ui.clear();
      ctx.controller = null;
      ctx.engine.setBackground(null);
      ctx.engine.setView(this._blank.scene, this._blank.camera);
      await this.prepare(id);
      if (color) ctx.film.to({ fadeColor: 0x000000 }, fadeIn);
      await this.begin({ fade: fadeIn });
    } catch (e) {
      this.busy = false;
      console.error(`[director] chapter ${id} failed`, e);
      window.__error ||= String(e?.stack || e);
      this._emit('error', { chapter: id, error: String(e) });
    }
  }

  next(opts) {
    const i = this.order.indexOf(this.currentId);
    const id = this.order[i + 1];
    if (!id) { this._emit('end', {}); return Promise.resolve(); }
    return this.goto(id, opts);
  }
}
