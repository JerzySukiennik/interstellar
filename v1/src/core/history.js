// Interstellar event history: segments of 8 Hz pose samples, stamped events, view snapshots, checkpoints, persistence and export.
import * as THREE from 'three';

const KEY = 'interstellar.history.v1';
const RATE = 1 / 8;
const MAX_SNAPSHOTS = 24;
const MAX_CHARS = 3_000_000;
const KEEP = new Set(['wake', 'anomaly', 'first_gargantua', 'touchdown', 'first_step', 'wreck', 'wave', 'wave_seen', 'wave_hit', 'liftoff', 'dock', 'enter_aged', 'pod', 'disk_cross', 'eject', 'horizon', 'push']);
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const r4 = v => Math.round(v * 10000) / 10000;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export class History {
  constructor({ clock, engine } = {}) {
    this.clock = clock;
    this.engine = engine;
    this.time = 0;
    this.recording = true;
    this._seg = null;
    this._acc = 0;
    this._pending = null;
    this._shots = [];
    this._canvas = null;
    this.clear(false);
    if (engine?.onPostRender) engine.onPostRender(() => this._capture());
  }

  clear(persist = true) {
    this.time = 0;
    this.persist = true;
    this._seg = null;
    this._pending = null;
    this.data = { version: 1, session: { id: Math.random().toString(36).slice(2, 10), started: new Date().toISOString() }, segments: [], events: [], snapshots: [], checkpoints: {}, state: {}, clock: null };
    if (persist) { try { localStorage.removeItem(KEY); } catch {} }
    return this;
  }

  tick(dt) { this.time += dt; }

  get segment() { return this._seg; }

  stamp() { return { t: r3(this.time), shipT: r3(this.clock?.ship ?? 0), endT: Math.round(this.clock?.endurance ?? 0) }; }

  beginSegment(id, meta = {}) {
    if (this._seg) this.endSegment();
    let uid = id, n = 2;
    while (this.data.segments.some(s => s.id === uid)) uid = `${id}#${n++}`;
    const st = this.stamp();
    const seg = { id: uid, chapter: meta.chapter ?? null, space: meta.space ?? null, mode: meta.mode ?? null, ...meta, t0: st.t, t1: st.t, shipT0: st.shipT, endT0: st.endT, shipT1: st.shipT, endT1: st.endT, samples: [] };
    this.data.segments.push(seg);
    this._seg = seg;
    this._acc = RATE;
    this._pending = null;
    this._last = null;
    this._lastExtraJson = undefined;
    return uid;
  }

  endSegment() {
    const seg = this._seg;
    if (!seg) return null;
    this._flush();
    const st = this.stamp();
    seg.t1 = st.t; seg.shipT1 = st.shipT; seg.endT1 = st.endT;
    this._seg = null;
    return seg.id;
  }

  setMode(mode, space) {
    if (!this._seg) return;
    const meta = { chapter: this._seg.chapter, space: space ?? this._seg.space, mode, frame: this._seg.frame };
    this.beginSegment(this._seg.id.replace(/#\d+$/, '') + '-' + mode, meta);
  }

  sample(dt, position, quaternion, extra) {
    const seg = this._seg;
    if (!seg || !this.recording) return;
    this._last = { p: position, q: quaternion };
    this._acc += dt;
    if (this._acc < RATE) return;
    this._acc %= RATE;
    const s = [r2(this.time), r3(position.x), r3(position.y), r3(position.z), r4(quaternion.x), r4(quaternion.y), r4(quaternion.z), r4(quaternion.w)];
    if (extra !== undefined) {
      const ej = JSON.stringify(extra);
      if (ej !== this._lastExtraJson) { s.push(extra); this._lastExtraJson = ej; }
    }
    seg.t1 = s[0];
    const prev = seg.samples[seg.samples.length - 1];
    if (prev && s.length === 8 && same(prev, s)) { this._pending = s; return; }
    if (this._pending) { seg.samples.push(this._pending); this._pending = null; }
    seg.samples.push(s);
  }

  _flush() {
    if (this._pending && this._seg) { this._seg.samples.push(this._pending); this._pending = null; }
    this._lastExtraJson = undefined;
  }

  event(type, data = {}, position) {
    const st = this.stamp();
    const p = position ?? this._last?.p;
    const e = { ...st, seg: this._seg?.id ?? null, type, data };
    if (p) e.p = [r3(p.x ?? p[0]), r3(p.y ?? p[1]), r3(p.z ?? p[2])];
    this.data.events.push(e);
    for (const fn of this._listeners || []) fn(e);
    return e;
  }

  on(fn) { (this._listeners ||= new Set()).add(fn); return () => this._listeners.delete(fn); }

  has(type, pred) { return this.data.events.some(e => e.type === type && (!pred || pred(e))); }

  find(type, pred) { return this.data.events.find(e => e.type === type && (!pred || pred(e))) || null; }

  events(type) { return type ? this.data.events.filter(e => e.type === type) : this.data.events; }

  snapshot(tag, { keep = KEEP.has(tag) } = {}) {
    return new Promise(resolve => this._shots.push({ tag, keep, resolve, ...this.stamp(), seg: this._seg?.id ?? null, wait: 0, p: this._last?.p ? [r3(this._last.p.x), r3(this._last.p.y), r3(this._last.p.z)] : undefined }));
  }

  _capture() {
    if (!this._shots.length || !this.engine) return;
    const film = this.engine.film;
    if (film && film.fade > 0.05 && this._shots.every(s => (s.wait += 1) < 240)) return;
    const src = this.engine.renderer.domElement;
    if (!this._canvas) { this._canvas = document.createElement('canvas'); this._canvas.width = 320; this._canvas.height = 180; this._g = this._canvas.getContext('2d'); }
    const sw = src.width, sh = src.height, a = 320 / 180;
    const bar = film ? Math.max(0, (1 - (sw / sh) / 2.39) * 0.5) * (film.letterbox || 0) * sh : 0;
    const bh = sh - 2 * bar;
    let cw = sw, ch = sw / a;
    if (ch > bh) { ch = bh; cw = bh * a; }
    this._g.drawImage(src, (sw - cw) / 2, bar + (bh - ch) / 2, cw, ch, 0, 0, 320, 180);
    const url = this._canvas.toDataURL('image/jpeg', 0.6);
    for (const s of this._shots.splice(0)) {
      const snap = { t: s.t, shipT: s.shipT, endT: s.endT, tag: s.tag, seg: s.seg, url };
      if (s.keep) snap.keep = true;
      if (s.p) snap.p = s.p;
      this.data.snapshots.push(snap);
      this._thin();
      s.resolve(snap);
    }
  }

  _thin(max = MAX_SNAPSHOTS) {
    const a = this.data.snapshots;
    while (a.length > max) {
      let best = -1, gap = Infinity;
      const drop = a.some(x => !x.keep) ? i => !a[i].keep : () => true;
      for (let i = 1; i < a.length; i++) { const g = a[i].t - a[i - 1].t; if (drop(i) && g < gap) { gap = g; best = i; } }
      if (best < 0) best = a.findIndex(x => !x.keep);
      a.splice(Math.max(1, best), 1);
    }
  }

  checkpoint(id, state) {
    this.data.checkpoints[id] = { t: r3(this.time), seg: this.data.segments.length, ev: this.data.events.length, snap: this.data.snapshots.length, state: JSON.parse(JSON.stringify(state ?? {})), clock: this.clock?.toJSON() };
  }

  rewindTo(id) {
    const c = this.data.checkpoints[id];
    if (!c) return null;
    this.endSegment();
    this.data.segments.length = Math.min(this.data.segments.length, c.seg);
    this.data.events.length = Math.min(this.data.events.length, c.ev);
    this.data.snapshots = this.data.snapshots.filter(s => s.t <= c.t);
    this.time = c.t;
    const order = Object.keys(this.data.checkpoints).sort((a, b) => this.data.checkpoints[a].t - this.data.checkpoints[b].t);
    for (const k of order) if (this.data.checkpoints[k].t > c.t) delete this.data.checkpoints[k];
    return c;
  }

  segmentById(id) { return this.data.segments.find(s => s.id === id) || null; }

  poseAt(segmentId, t, out = { p: new THREE.Vector3(), q: new THREE.Quaternion(), extra: undefined }) {
    const seg = typeof segmentId === 'object' ? segmentId : this.segmentById(segmentId);
    const S = seg?.samples;
    if (!S?.length) return null;
    let lo = 0, hi = S.length - 1;
    if (t <= S[0][0]) hi = 0;
    else if (t >= S[hi][0]) lo = hi;
    else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m][0] <= t) lo = m; else hi = m; } }
    const a = S[lo], b = S[hi];
    const u = hi === lo || b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    out.p.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
    _qa.set(a[4], a[5], a[6], a[7]); _qb.set(b[4], b[5], b[6], b[7]);
    out.q.slerpQuaternions(_qa, _qb, u);
    out.extra = undefined;
    for (let i = lo; i >= 0; i--) if (S[i].length > 8) { out.extra = S[i][8]; break; }
    return out;
  }

  path(segmentId) { const seg = this.segmentById(segmentId); return seg ? seg.samples.map(s => [s[1], s[2], s[3]]) : []; }

  distance(pred = () => true) {
    let d = 0;
    for (const seg of this.data.segments) {
      if (!pred(seg)) continue;
      const S = seg.samples;
      for (let i = 1; i < S.length; i++) d += Math.hypot(S[i][1] - S[i - 1][1], S[i][2] - S[i - 1][2], S[i][3] - S[i - 1][3]);
    }
    return d;
  }

  serialize(state) {
    if (state) this.data.state = state;
    if (this.clock) this.data.clock = this.clock.toJSON();
    this.data.time = r3(this.time);
    return this._json();
  }

  _json() {
    const seg = this._seg, p = this._pending;
    if (seg && p) seg.samples.push(p);
    try { return JSON.stringify(this.data); } finally { if (seg && p) seg.samples.pop(); }
  }

  save(state) {
    if (this.persist === false) return 0;
    let json = this.serialize(state);
    let guard = 0;
    while (json.length > MAX_CHARS && guard++ < 40) {
      if (this.data.snapshots.length > 8) this._thin(this.data.snapshots.length - 2);
      else decimate(this.data.segments);
      json = this._json();
    }
    try { localStorage.setItem(KEY, json); return json.length; }
    catch (e) {
      this._thin(Math.floor(this.data.snapshots.length / 2));
      try { json = this._json(); localStorage.setItem(KEY, json); return json.length; } catch { console.warn('[history] save failed', e.message); return 0; }
    }
  }

  load() {
    let json = null;
    try { json = localStorage.getItem(KEY); } catch {}
    return json ? this.import(json) : false;
  }

  import(json) {
    try {
      const d = typeof json === 'string' ? JSON.parse(json) : json;
      if (!d || d.version !== 1 || !Array.isArray(d.segments)) return false;
      d.checkpoints ||= {}; d.snapshots ||= []; d.events ||= []; d.state ||= {};
      this.data = d;
      this._seg = null; this._pending = null;
      this.time = d.time ?? Math.max(0, ...d.segments.map(s => s.t1), ...d.events.map(e => e.t));
      if (d.clock && this.clock) this.clock.fromJSON(d.clock);
      return true;
    } catch (e) { console.warn('[history] import failed', e.message); return false; }
  }

  export(state) { return this.serialize(state); }

  download(name = 'interstellar-history.json', state) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.serialize(state)], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function same(a, b) {
  return Math.abs(a[1] - b[1]) < 0.004 && Math.abs(a[2] - b[2]) < 0.004 && Math.abs(a[3] - b[3]) < 0.004 && Math.abs(a[4] * b[4] + a[5] * b[5] + a[6] * b[6] + a[7] * b[7]) > 0.99999;
}

function decimate(segments) {
  let big = null;
  for (const s of segments) if (!big || s.samples.length > big.samples.length) big = s;
  if (!big || big.samples.length < 8) return;
  big.samples = big.samples.filter((s, i, a) => i % 2 === 0 || i === a.length - 1 || s.length > 8 || (i > 0 && same(a[i - 1], s)) || (i < a.length - 1 && same(s, a[i + 1])));
}
