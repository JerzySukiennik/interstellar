// Interstellar co-op session (ctx.net): roles, shared facts, the partner's body and ship drawn from buffered network poses, the host's clock and world state, chapter gates and chapter follow.
import * as THREE from 'three';
import { Link, Track, PROTOCOL, wall, rid } from './net.js';

export const LINES = {
  wait: 'Waiting for the other pilot.',
  lost: 'The link to the other pilot is lost. Flying on alone.',
  back: 'The other pilot is back.',
  joined: 'The second pilot is aboard.',
  follow: 'Catching up with the other pilot.',
};
const RATE = { body: 66, ship: 50, world: 250 };
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const TURN = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
const _p = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion();
const BODY = { p: new THREE.Vector3(), q: new THREE.Quaternion(), m: 'stand', a: 'feet', ph: 0, am: 1 };
const frac = x => ((x % 1) + 1) % 1;
const r3 = v => Math.round(v * 1000) / 1000, r4 = v => Math.round(v * 10000) / 10000;
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

const FAINT_VERT = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const FAINT_FRAG = 'uniform vec3 uTint; uniform float uGain; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uTint * (0.05 + 0.55 * rim) * uGain, 1.0); }';

export function bodyOf(c, time = 0, out = BODY) {
  if (!c || c.body || c.anchor || !c.frame || c.enabled === false) return null;
  if (c.eyeHeight != null) {
    c.frame.toWorld(c.position, out.p);
    c.frame.basis(c.position, out.q).multiply(_q.setFromAxisAngle(UP, c.yaw + Math.PI));
    const sp = Math.hypot(c.velocity.x, c.velocity.z);
    out.a = 'feet';
    if (c.ladder) { out.m = 'climb'; out.ph = frac(c.position.y * 0.9); out.am = 1; }
    else if (sp > 0.12) { out.m = c.preset === 'wade' ? 'wade' : 'walk'; out.ph = frac((c._phase || 0) / TAU); out.am = Math.min(1, sp / 0.9); }
    else { out.m = 'stand'; out.ph = frac(time / 6); out.am = 1; }
    return out;
  }
  if (!c.worldPose) return null;
  c.worldPose(out.p, out.q);
  out.q.multiply(TURN);
  out.a = 'eye'; out.m = 'float'; out.ph = frac(time / 7); out.am = 1;
  return out;
}

export class Coop {
  constructor(ctx, { base = '', role = 'host', fetch: f, gateLimit = 45, id } = {}) {
    this.ctx = ctx;
    this.role = role;
    this.host = role === 'host';
    this.pilot = this.host ? 1 : 2;
    this.port = this.host ? 'A' : 'B';
    this.otherPort = this.host ? 'B' : 'A';
    this.side = this.host ? 1 : -1;
    this.sid = this.host ? rid() : null;
    this.gateLimit = gateLimit;
    this.linked = false; this.everLinked = false; this.synced = false;
    this.facts = new Map(); this.n = 0; this.listeners = new Set();
    this.link = new Link({ base, role, fetch: f, id });
    this.tracks = { body: new Track({ delay: 130 }), ship: new Track({ delay: 110 }) };
    this.world = null;
    this.st = null; this.shares = []; this.avatars = new Map();
    this.at = { body: 0, ship: 0, world: 0, say: 0 };
    this.pending = null; this.gateT = null; this.syncFollow = false;
    this.time = 0;
    this.stats = { body: {}, ship: {}, lost: 0, back: 0, gates: 0, follows: 0 };
    const d = ctx.director;
    this._next = d.next.bind(d);
    d.next = opts => this.gate(opts);
    this._off = d.on((type, data) => {
      if (type === 'enter') { if (this.host) this.fact('at', data.chapter); this.fact(`in.${role}`, data.chapter); this._trim(); }
      else if (type === 'exit') this._unstage();
      else if (type === 'beat') this.fact(`beat.${role}`, `${data.chapter}/${data.beat}`);
    });
    this.link.start();
  }

  close() {
    this.link.close();
    this._off?.();
    this.ctx.director.next = this._next;
    this._unstage();
    for (const A of this.avatars.values()) A.a.dispose();
    this.avatars.clear();
    if (this.ctx.net === this) this.ctx.net = null;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _emit(id, v, remote) { for (const fn of this.listeners) { try { fn(id, v, remote); } catch (e) { console.error(e); } } }

  fact(id, value) {
    if (value === undefined) return this.facts.get(id)?.v;
    const cur = this.facts.get(id);
    if (cur && same(cur.v, value)) return value;
    const f = { v: value, n: ++this.n, by: this.role };
    this.facts.set(id, f);
    this.link.send(['f', id, value, f.n, f.by]);
    this._emit(id, value, false);
    return value;
  }

  _merge(id, v, n, by) {
    if (typeof id !== 'string' || !(n >= 0)) return;
    this.n = Math.max(this.n, n);
    const cur = this.facts.get(id);
    if (cur && (cur.n > n || (cur.n === n && (cur.by === by || cur.by === 'host')))) return;
    this.facts.set(id, { v, n, by });
    if (!cur || !same(cur.v, v)) this._emit(id, v, true);
  }

  share(id, test, apply) { this.shares.push({ id, test, apply, done: false }); }

  stage(o) {
    this.st = { id: this.ctx.director.currentId, ...o };
    if (o.scene) for (const [scene, A] of this.avatars) if (scene === o.scene && A.a.group.parent !== scene) scene.add(A.a.group);
  }

  _unstage() {
    const st = this.st;
    this.st = null;
    this.shares = [];
    if (!st) return;
    const A = this.avatars.get(st.scene);
    if (A) { A.a.dispose(); A.mat?.dispose(); this.avatars.delete(st.scene); }
  }

  _trim() {
    for (const [scene, A] of this.avatars) if (scene !== this.st?.scene) { A.a.dispose(); A.mat?.dispose(); this.avatars.delete(scene); }
  }

  async prepare(scene, camera, { faint = false } = {}) {
    if (!scene || this.avatars.has(scene)) return;
    try {
      const m = await import('../models/astronaut.js');
      const engine = this.ctx.engine;
      const a = m.createAstronaut({ engine, quality: engine.qualityName });
      let mat = null;
      if (faint) {
        mat = new THREE.ShaderMaterial({ name: 'pilot_faint', vertexShader: FAINT_VERT, fragmentShader: FAINT_FRAG, uniforms: { uTint: { value: new THREE.Color(1.0, 0.78, 0.5) }, uGain: { value: 0.9 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        a.group.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
      } else a.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      a.group.name = 'otherPilot';
      a.animate('stand', 0, 1);
      scene.add(a.group);
      a.group.updateMatrixWorld(true);
      if (camera) await engine.renderer.compileAsync?.(a.group, camera, scene);
      a.group.visible = false;
      this.avatars.set(scene, { a, mat });
    } catch (e) { console.warn('[coop] figure unavailable', e?.message || e); }
  }

  peer(kind) {
    const T = this.tracks[kind], s = T?.newest;
    return this.linked && s && T.age < 3000 && this.st && s.st === this.st.id && s.p ? s : null;
  }

  say(text, seconds = 4) { if (text) this.ctx.ui?.subtitle?.(text, seconds); }

  gate(opts) {
    const d = this.ctx.director, id = d.currentId, i = d.order.indexOf(id);
    if (!this.linked || i < 0 || i >= d.order.length - 1 || this.fact(`go.${id}`)) return this._next(opts);
    if (this.pending?.id !== id) { this.pending = { id, opts, t: wall() }; this.stats.gates++; this.fact(`ready.${id}.${this.role}`, this.n + 1); }
    return Promise.resolve();
  }

  frame(dt) {
    const L = this.link, now = wall();
    this.time += dt;
    L.tick();
    this._drain();
    const linked = L.open && L.peer && this.synced;
    if (linked !== this.linked) this._setLinked(linked);
    for (const s of this.shares) {
      if (s.done) continue;
      const v = this.fact(s.id);
      if (v) { s.done = true; s.apply?.(v); continue; }
      const mine = s.test?.();
      if (mine) { s.done = true; this.fact(s.id, mine === true ? 1 : mine); }
    }
    if (this.linked) this._sendPoses(now);
    this._present(dt);
    this._gates(now);
    L.flush();
  }

  _drain() {
    const box = this.link.inbox;
    if (!box.length) return;
    for (const m of box.splice(0)) {
      if (!Array.isArray(m)) continue;
      if (m[0] === 'peer') { this.synced = false; if (m[1]) this.link.send(['h', { v: PROTOCOL, sid: this.sid, f: [...this.facts].map(([id, f]) => [id, f.v, f.n, f.by]) }]); }
      else if (m[0] === 'h') this._hello(m[1]);
      else if (m[0] === 'f') this._merge(m[1], m[2], m[3], m[4]);
      else if (m[0] === 'b') this._pose('body', m[1]);
      else if (m[0] === 's') this._pose('ship', m[1]);
      else if (m[0] === 'w' && m[1]) { this.world = m[1]; this.world.fresh = true; }
    }
  }

  _hello(h) {
    if (!h || h.v !== PROTOCOL) return;
    if (this.host) { if (h.sid && h.sid !== this.sid) { this.synced = true; return; } }
    else if (h.sid && h.sid !== this.sid) {
      const stale = !!this.sid;
      this.sid = h.sid;
      if (stale) { this.facts.clear(); this.n = 0; this.pending = null; const id = this.ctx.director.currentId; if (id) this.fact(`in.${this.role}`, id); }
    }
    for (const f of h.f || []) this._merge(f[0], f[1], f[2], f[3]);
    this.synced = true;
  }

  _pose(kind, s) {
    if (!s || typeof s.t !== 'number') return;
    const S = (this.stats[kind][s.st] ||= { n: 0, late: 0, max: 0, t: 0 }), t = wall();
    if (S.n) { const g = t - S.t; if (g > 500) S.late++; if (g > S.max) S.max = Math.round(g); }
    S.t = t; S.n++;
    this.tracks[kind].push(s);
  }

  _setLinked(on) {
    this.linked = on;
    if (on) {
      if (this.everLinked) { this.stats.back++; this.say(LINES.back); } else if (this.host) this.say(LINES.joined);
      this.everLinked = true;
      if (!this.host) this.syncFollow = true;
    } else {
      this.stats.lost++;
      this.say(LINES.lost, 6);
      this.tracks.body.reset(); this.tracks.ship.reset();
      this.world = null;
    }
  }

  _sendPoses(now) {
    const st = this.st, L = this.link;
    if (st && now - this.at.body >= RATE.body) {
      this.at.body = now;
      let b = st.body ? st.body() : undefined;
      if (b === undefined) b = bodyOf(this.ctx.controller, this.time);
      if (b) {
        const p = st.toShared ? st.toShared(_p.copy(b.p)) : b.p;
        L.post('b', ['b', { t: r3(now), st: st.id, m: b.m, a: b.a === 'eye' ? 1 : 0, p: [r3(p.x), r3(p.y), r3(p.z)], q: [r4(b.q.x), r4(b.q.y), r4(b.q.z), r4(b.q.w)], ph: r3(b.ph || 0), am: r3(b.am ?? 1) }]);
      } else L.post('b', ['b', { t: r3(now), st: st.id, m: 0 }]);
    }
    if (st?.ship && now - this.at.ship >= RATE.ship) {
      this.at.ship = now;
      const s = st.ship();
      if (s) L.post('s', ['s', { ...s, t: r3(now), st: st.id, p: [r3(s.p.x), r3(s.p.y), r3(s.p.z)], q: [r4(s.q.x), r4(s.q.y), r4(s.q.z), r4(s.q.w)] }]);
    }
    if (this.host && now - this.at.world >= RATE.world) {
      this.at.world = now;
      const c = this.ctx.clock;
      L.post('w', ['w', { ...(st?.world?.() || {}), t: r3(now), st: st?.id ?? null, c: [c.ship, c.endurance, c.rate] }]);
    }
  }

  _present(dt) {
    const st = this.st;
    if (!this.host && this.linked && this.world) this._clock();
    if (!st) return;
    const A = this.avatars.get(st.scene);
    let shown = false, ship = null;
    if (this.linked) {
      const B = this.tracks.body, S = this.tracks.ship;
      if (A && B.age < 2500) { const s = B.sample(); if (s && s.s.st === st.id && s.s.m && s.s.p && (!st.seen || st.seen(s.p))) { this._place(A.a, s, st); shown = true; } }
      if (st.placeShip && S.age < 2500) { const s = S.sample(); if (s && s.s.st === st.id && s.s.p) ship = s; }
      if (!this.host && this.world && this.world.st === st.id) st.applyWorld?.(this.world, dt);
    }
    if (A) A.a.group.visible = shown;
    st.placeShip?.(ship, dt);
  }

  _place(a, s, st) {
    const g = a.group, d = s.s;
    a.animate(d.m, s.ph, d.am ?? 1);
    g.quaternion.copy(s.q);
    const p = st.fromShared ? st.fromShared(_p.copy(s.p)) : _p.copy(s.p);
    if (d.a) { g.position.set(0, 0, 0); g.updateMatrixWorld(true); a.anchors.eye.getWorldPosition(_e); g.position.copy(p).sub(_e); } else g.position.copy(p);
    g.updateMatrixWorld(true);
  }

  _clock() {
    const w = this.world, c = this.ctx.clock, k = w.c;
    if (!k) return;
    if (c.rate !== k[2]) c.rampTo(k[2], 0);
    if (!w.fresh) return;
    w.fresh = false;
    if (Math.abs(c.ship - k[0]) > 1.5 || Math.abs(c.endurance - k[1]) > Math.max(2, k[2] * 0.6)) { c.ship = k[0]; c.endurance = k[1]; }
    else { c.ship += (k[0] - c.ship) * 0.15; c.endurance += (k[1] - c.endurance) * 0.15; }
  }

  _gates(now) {
    const d = this.ctx.director, id = d.currentId;
    if (!id || d.busy || !d.current) return;
    if (this.pending && this.pending.id !== id) this.pending = null;
    if (!this.linked) { if (this.pending) this._go(); return; }
    const other = this.host ? 'guest' : 'host';
    if (this.host && !this.fact(`go.${id}`)) {
      const a = this.pending?.id === id, b = !!this.fact(`ready.${id}.${other}`) && this.fact(`in.${other}`) === id;
      if (a || b) {
        if (this.gateT?.id !== id) this.gateT = { id, t: now };
        if ((a && b) || now - this.gateT.t > this.gateLimit * 1000) this.fact(`go.${id}`, 1);
      } else this.gateT = null;
    }
    if (this.fact(`go.${id}`)) { this._go(); return; }
    if (!this.host) {
      const at = this.fact('at'), order = d.order;
      if (at && at !== id && order.includes(at) && (this.syncFollow || order.indexOf(at) > order.indexOf(id))) {
        this.syncFollow = false; this.pending = null; this.stats.follows++;
        this.say(LINES.follow);
        d.goto(at, { fade: 0.6 });
        return;
      }
      if (at) this.syncFollow = false;
    }
    if (this.pending && now - this.pending.t > (this.gateLimit + 15) * 1000) { this._go(); return; }
    if (this.pending && now - this.at.say > 2200) { this.at.say = now; this.say(LINES.wait, 2.6); }
  }

  _go() {
    const p = this.pending;
    this.pending = null;
    if (!p && this.linked) { this.stats.follows++; this.say(LINES.follow); }
    this._next(p ? p.opts : { fade: 1 });
  }
}
