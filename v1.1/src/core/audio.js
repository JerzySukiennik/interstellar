// Interstellar audio: streamed music decks with equal-power crossfades, decoded effects that never drop, preload groups, engine helper, sidechain, positional sound, muffle, duck and a limited master bus.
const BASE = new URL('../../assets/audio/', import.meta.url);
const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYyLjEyLjEwMgAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAADAAABZwAMjIyMjIyMjJFRUVFRUVFRVhYWFhYWFhYampqampqampqfX19fX19fX2QkJCQkJCQkKKioqKioqKiorW1tbW1tbW1yMjIyMjIyMja2tra2tra2trt7e3t7e3t7f//////////AAAAAExhdmM2Mi4yOAAAAAAAAAAAAAAAACQDNwAAAAAAAAWcigxuTgAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTQuMFVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80DEpAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsSjAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
const MUFFLE_MIN = 260;
const MUFFLE_MAX = 20000;
const LOOP_XF = 8;
const PREROLL = 0.5;
const LATE_WINDOW = 1.2;
const DECKS = 4;
const FAIL_RETRY = 30;
const OWNER_DIR = 'owner/';
const OWNER_ONLY = new Map([['m_dock', { peak: 180 }]]);

const noopHandle = Object.freeze({ set() {}, stop() {}, playing: false });
const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
const lerp = (a, b, t) => a + (b - a) * t;
const now = () => performance.now() / 1000;
const mark = v => (Array.isArray(v) ? v.reduce((a, b) => a + b, 0) / v.length : v);

function mapCue(from, base, own, duration) {
  if (!(from > 0)) return { from: 0, delay: 0 };
  const pairs = [];
  for (const k of Object.keys(base || {})) {
    const d = mark(base[k]), o = own ? mark(own[k]) : null;
    if (Number.isFinite(d) && Number.isFinite(o)) pairs.push([d, o]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const max = Number.isFinite(duration) ? Math.max(0, duration - 1) : Infinity;
  if (!pairs.length) return { from: Math.min(from, max), delay: 0 };
  const target = pairs.find(p => p[0] >= from) || pairs[pairs.length - 1];
  const t = target[1] - (target[0] - from);
  return { from: Math.min(max, Math.max(0, t)), delay: Math.max(0, -t) };
}

function ownerEntries(data, manifest) {
  const out = {}, tracks = data && typeof data === 'object' && data.tracks;
  if (!tracks || typeof tracks !== 'object') return null;
  for (const [id, t] of Object.entries(tracks)) {
    if (!t || typeof t.file !== 'string' || !t.file || /[\\/]|^\.\.?$/.test(t.file)) continue;
    const base = manifest && manifest[id] && manifest[id].type === 'music' ? manifest[id] : OWNER_ONLY.has(id) ? { landmarks: OWNER_ONLY.get(id) } : null;
    if (!base) continue;
    const num = v => (Number.isFinite(v) ? v : null);
    const e = { file: OWNER_DIR + encodeURIComponent(t.file), type: 'music', owner: true, base, volume: num(t.volume) == null ? 1 : Math.min(6, Math.max(0, t.volume)), title: String(t.title || id), composer: String(t.composer || ''), landmarks: t.landmarks && typeof t.landmarks === 'object' ? t.landmarks : {} };
    if (num(t.duration) != null) e.duration = t.duration;
    if (num(t.loopStart) != null && num(t.loopEnd) != null && t.loopEnd > t.loopStart) { e.loopStart = t.loopStart; e.loopEnd = t.loopEnd; }
    if (e.loopEnd != null && num(t.loopMatchDb) != null) e.loopMatchDb = t.loopMatchDb;
    if (e.loopEnd == null && num(t.fadeOut) != null && t.fadeOut > 0) e.fadeOut = t.fadeOut;
    const k = t.tick;
    if (k && num(k.period) != null && k.period > 0.2 && num(k.phase) != null) e.tick = { period: k.period, phase: ((k.phase % k.period) + k.period) % k.period, until: num(k.until) == null ? Infinity : k.until };
    out[id] = e;
  }
  return Object.keys(out).length ? out : null;
}

function equalPower(param, ctx, from, to, seconds) {
  const t = ctx.currentTime, n = 48, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    c[i] = to >= from ? from + (to - from) * Math.sin(u * Math.PI / 2) : to + (from - to) * Math.cos(u * Math.PI / 2);
  }
  param.cancelScheduledValues(t);
  try { param.setValueCurveAtTime(c, t, Math.max(0.02, seconds)); } catch (e) {
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(to, t + Math.max(0.02, seconds));
  }
}

class Deck {
  constructor(sys) {
    this.sys = sys;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    this.el.setAttribute('playsinline', '');
    this.gain = sys.ctx.createGain();
    this.gain.gain.value = 0;
    this.node = sys.ctx.createMediaElementSource(this.el);
    this.node.connect(this.gain).connect(sys.musicBus);
    this.id = null;
    this.entry = null;
    this.level = 0;
    this.busy = false;
    this.stopTimer = 0;
    this.settleTimer = 0;
    this.el.addEventListener('timeupdate', () => this.sys._checkLoop(this));
    this.el.addEventListener('ended', () => { if (this.busy) { this.busy = false; if (this.sys.current === this) this.sys.current = null; } this.id = null; this.entry = null; });
  }
  ramp(v, seconds, shape = 'linear') {
    const g = this.gain.gain, ctx = this.sys.ctx, t = ctx.currentTime;
    if (shape === 'equal') equalPower(g, ctx, g.value, v, seconds);
    else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(v, t + Math.max(0.02, seconds));
    }
    this.level = v;
  }
  start(id, entry, level, fade, from = 0, shape = 'linear', onRamp = null) {
    clearTimeout(this.stopTimer);
    clearTimeout(this.settleTimer);
    this.id = id;
    this.entry = entry;
    this.busy = true;
    this.handingOver = false;
    this.fading = false;
    this.el.loop = false;
    this.el.src = this.sys._url(entry.file) + (from > 0 ? `#t=${from.toFixed(2)}` : '');
    if (from > 0) {
      this.el.addEventListener('loadedmetadata', () => {
        if (this.el.currentTime < from - 0.5) { try { this.el.currentTime = from; } catch (e) { return; } }
      }, { once: true });
    }
    const p = this.el.play();
    if (p && p.catch) p.catch(err => this.sys._warn('music-play:' + id, `audio: music "${id}" could not start (${err && err.name})`));
    const g = this.gain.gain, t = this.sys.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    if (!onRamp) { this.ramp(level, fade, shape); return; }
    this.level = level;
    let done = false;
    const go = () => { if (done || !this.busy || this.id !== id) return; done = true; this.ramp(level, fade, shape); onRamp(); };
    this.el.addEventListener('playing', go, { once: true });
    setTimeout(go, PREROLL * 1000 + 150);
  }
  release(fade, shape = 'linear') {
    clearTimeout(this.settleTimer);
    this.ramp(0, fade, shape);
    this.busy = false;
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => { if (!this.busy) { this.el.pause(); this.id = null; this.entry = null; } }, Math.max(0.05, fade) * 1000 + 150);
  }
  kill() {
    clearTimeout(this.stopTimer);
    clearTimeout(this.settleTimer);
    const g = this.gain.gain, t = this.sys.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    this.el.pause();
    this.busy = false;
    this.id = null;
    this.entry = null;
    this.level = 0;
  }
}

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.manifest = null;
    this.owner = null;
    this._ownerP = null;
    this._delayed = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.failed = new Map();
    this.warned = new Set();
    this.missed = new Set();
    this.lastVariant = new Map();
    this.beds = new Map();
    this.decks = [];
    this.current = null;
    this.camera = null;
    this.ready = false;
    this._pending = { music: null, beds: new Map(), loads: new Set(), groups: new Set(), sfx: [] };
    this._readyResolve = null;
    this._readyP = new Promise(r => { this._readyResolve = r; });
    this._raf = 0;
    this._masterVolume = 1;
    this._musicVolume = 1;
    this._missTimer = 0;
    this._tick = this._tick.bind(this);
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await timeout(this.ctx.resume().catch(() => {}), 1500);
      return this;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this._warn('noctx', 'audio: Web Audio unavailable'); return this; }
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._masterVolume;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.headroom = ctx.createGain();
    this.headroom.gain.value = 0.708;
    this.master.connect(this.headroom).connect(this.limiter).connect(ctx.destination);
    this.musicDuck = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this._musicVolume;
    this.musicBus.connect(this.musicDuck).connect(this.master);
    this.muffleFilter = ctx.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.value = MUFFLE_MAX;
    this.muffleFilter.Q.value = 0.5;
    this.muffleGain = ctx.createGain();
    this.fxBus = ctx.createGain();
    this.fxBus.connect(this.muffleFilter).connect(this.muffleGain).connect(this.master);
    this.bedDuck = ctx.createGain();
    this.bedSide = ctx.createGain();
    this.bedBus = ctx.createGain();
    this.bedBus.connect(this.bedDuck).connect(this.bedSide).connect(this.fxBus);
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, 22050);
    unlock.connect(ctx.destination);
    unlock.start(0);
    for (let i = 0; i < DECKS; i++) this.decks.push(new Deck(this));
    await timeout(Promise.all(this.decks.map(d => {
      d.el.src = SILENT;
      const p = d.el.play();
      return p && p.then ? p.then(() => d.el.pause()).catch(() => {}) : null;
    })), 1500);
    if (ctx.state !== 'running') await timeout(ctx.resume().catch(() => {}), 1500);
    if (ctx.state !== 'running') {
      const wake = () => { ctx.resume().catch(() => {}); };
      for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, wake, { once: true, capture: true });
    }
    await this._loadManifest();
    await this._loadOwner();
    this.ready = true;
    const { music, beds, loads, groups, sfx } = this._pending;
    this._pending = { music: null, beds: new Map(), loads: new Set(), groups: new Set(), sfx: [] };
    for (const g of groups) for (const id of (this.groups[g] || [])) loads.add(id);
    this._readyResolve();
    if (loads.size) this.load([...loads]);
    for (const q of sfx) this._sfxLate(q.id, q.opts, q.t, !loads.has(q.id) && !loads.has('*'));
    for (let m = music; m; m = m.prev) if (m.id == null || this.has(m.id)) { this.music(m.id, m.opts); break; }
    for (const [id, opts] of beds) this.ambience(id, opts);
    return this;
  }

  async _loadManifest() {
    if (this.manifest) return this.manifest;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ac && ac.abort(), 8000);
    try {
      const r = await fetch(new URL('manifest.json', BASE), ac ? { signal: ac.signal } : {});
      this.manifest = await r.json();
    } catch (e) {
      this._warn('manifest', 'audio: manifest.json failed to load');
      this.manifest = {};
    }
    clearTimeout(timer);
    return this.manifest;
  }

  _loadOwner() {
    if (this._ownerP) return this._ownerP;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ac && ac.abort(), 4000);
    this._ownerP = Promise.resolve()
      .then(() => fetch(new URL(OWNER_DIR + 'manifest.json', BASE), ac ? { signal: ac.signal } : {}))
      .then(r => (r && r.ok ? r.json() : null))
      .then(data => { this.owner = ownerEntries(data, this.manifest); })
      .catch(() => { this.owner = null; })
      .then(() => { clearTimeout(timer); return this.owner; });
    return this._ownerP;
  }

  _url(file) { return new URL(file, BASE).href; }

  _warn(key, msg) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  _entry(id) {
    if (typeof id !== 'string' || id.startsWith('_')) return null;
    if (this.owner && this.owner[id]) return this.owner[id];
    if (OWNER_ONLY.has(id)) return null;
    let e = this.manifest && this.manifest[id];
    for (let hops = 0; e && e.alias && hops < 4; hops++) {
      const base = this.manifest[e.alias];
      if (!base) { e = null; break; }
      e = { ...base, ...e, alias: base.alias, volume: (e.volume == null ? 1 : e.volume) * (base.volume == null ? 1 : base.volume) };
    }
    if (!e) this._warn('id:' + id, `audio: unknown id "${id}"`);
    return e || null;
  }

  has(id) { return !!((this.owner && this.owner[id]) || (this.manifest && this.manifest[id] && !id.startsWith('_'))); }

  get groups() { return (this.manifest && this.manifest._groups) || {}; }

  preload(group) {
    if (!this.ready) {
      this._pending.groups.add(group);
      return this._readyP.then(() => this.preload(group));
    }
    const ids = this.groups[group];
    if (!ids) { this._warn('group:' + group, `audio: unknown preload group "${group}"`); return Promise.resolve(); }
    return this.load(ids);
  }

  load(ids) {
    if (!this.ready) {
      if (ids === undefined) this._pending.loads.add('*');
      else for (const id of (Array.isArray(ids) ? ids : [ids])) this._pending.loads.add(id);
      return Promise.resolve();
    }
    let list = ids === undefined ? Object.keys(this.manifest) : Array.isArray(ids) ? ids : [ids];
    if (list.includes('*')) list = Object.keys(this.manifest);
    return Promise.all(list.filter(id => !id.startsWith('_')).map(id => this._ensure(id))).then(() => undefined);
  }

  _files(entry) { return entry.variants && entry.variants.length ? entry.variants : [entry.file]; }

  _ensure(id) {
    const entry = this._entry(id);
    if (!entry || entry.type === 'music') return Promise.resolve();
    return Promise.all(this._files(entry).map(f => this._decode(f)));
  }

  _decoded(entry) { return this._files(entry).some(f => this.buffers.has(f)); }

  _decode(file) {
    if (this.buffers.has(file)) return Promise.resolve(this.buffers.get(file));
    if (this.loading.has(file)) return this.loading.get(file);
    const f = this.failed.get(file);
    if (f && now() - f < FAIL_RETRY) return Promise.resolve(null);
    const p = timeout(fetch(this._url(file))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => {
        const q = this.ctx.decodeAudioData(ab, res, rej);
        if (q && q.then) q.then(res, rej);
      })), 20000)
      .then(buf => {
        this.loading.delete(file);
        if (!buf) throw new Error('timeout');
        this.buffers.set(file, buf);
        this.failed.delete(file);
        return buf;
      })
      .catch(err => {
        this.loading.delete(file);
        this.failed.set(file, now());
        this._warn('decode:' + file, `audio: failed to load ${file} (${err && err.message || err})`);
        return null;
      });
    this.loading.set(file, p);
    return p;
  }

  _pick(id, entry) {
    const files = this._files(entry).filter(f => this.buffers.has(f));
    const all = files.length ? files : this._files(entry);
    if (all.length === 1) return all[0];
    const last = this.lastVariant.get(id);
    let i = Math.floor(Math.random() * all.length);
    if (all[i] === last) i = (i + 1 + Math.floor(Math.random() * (all.length - 1))) % all.length;
    this.lastVariant.set(id, all[i]);
    return all[i];
  }

  _panner(position, entry) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = entry.ref || 2;
    p.rolloffFactor = entry.rolloff == null ? 1 : entry.rolloff;
    p.maxDistance = 2000;
    this._setPannerPos(p, position);
    return p;
  }

  _setPannerPos(p, v) {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setValueAtTime(v.x, t); p.positionY.setValueAtTime(v.y, t); p.positionZ.setValueAtTime(v.z, t);
    } else p.setPosition(v.x, v.y, v.z);
  }

  _voice(id, entry, file, opts, loop) {
    const buf = this.buffers.get(file);
    if (!buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate || 1) * (entry.rate || 1) * (entry.jitter ? 1 + (Math.random() * 2 - 1) * entry.jitter : 1);
    if (loop) {
      src.loop = true;
      if (entry.loopStart != null) src.loopStart = entry.loopStart;
      if (entry.loopEnd != null) src.loopEnd = entry.loopEnd;
    }
    const gain = ctx.createGain();
    gain.gain.value = (opts.volume == null ? 1 : opts.volume) * (entry.volume == null ? 1 : entry.volume);
    let panner = null, filter = null;
    if (opts.lowpass != null) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.lowpass;
      filter.Q.value = 0.6;
      src.connect(filter).connect(gain);
    } else src.connect(gain);
    if (opts.position) {
      panner = this._panner(opts.position, entry);
      gain.connect(panner).connect(opts.bus || this.fxBus);
      this._ensureTick();
    } else gain.connect(opts.bus || this.fxBus);
    return { src, gain, panner, filter, entry };
  }

  _noteMissed(id) {
    this.missed.add(id);
    clearTimeout(this._missTimer);
    this._missTimer = setTimeout(() => {
      const list = [...this.missed].filter(i => !this.warned.has('missed:' + i));
      if (!list.length) return;
      for (const i of list) this.warned.add('missed:' + i);
      console.warn(`audio: not preloaded, played late: ${list.join(', ')} (add them to the chapter's audio.preload group or load list)`);
    }, 1000);
  }

  _sfxLate(id, opts, t0, miss = true) {
    const entry = this._entry(id);
    if (!entry) return;
    if (miss) this._noteMissed(id);
    this._ensure(id).then(() => {
      if (now() - t0 > LATE_WINDOW) return;
      this._play(id, entry, opts);
    });
  }

  sfx(id, opts = {}) {
    if (!this.ctx || !this.ready) {
      this._pending.sfx.push({ id, opts, t: now() });
      if (this._pending.sfx.length > 64) this._pending.sfx.shift();
      return;
    }
    const entry = this._entry(id);
    if (!entry) return;
    if (!this._decoded(entry)) { this._sfxLate(id, opts, now()); return; }
    if (this._files(entry).some(f => !this.buffers.has(f) && !this.loading.has(f))) this._ensure(id);
    return this._play(id, entry, opts);
  }

  _play(id, entry, opts) {
    const v = this._voice(id, entry, this._pick(id, entry), opts, false);
    if (!v) return;
    const ctx = this.ctx, when = ctx.currentTime + (opts.delay || 0);
    if (entry.type === 'loop') {
      const g = v.gain.gain, target = g.value, dur = v.src.buffer.duration / v.src.playbackRate.value, tail = Math.min(0.35, dur / 3);
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(target, when + 0.015);
      g.setValueAtTime(target, when + dur - tail);
      g.linearRampToValueAtTime(0, when + dur - 0.005);
    }
    v.src.start(when, opts.offset || 0);
    if (opts.duckBeds) this.sidechain(opts.duckBeds, opts.hold == null ? 0.25 : opts.hold);
    return { stop: (fade = 0.05) => this._fadeStop(v, fade), voice: v };
  }

  sidechain(db = 6, hold = 0.25, release = 0.35) {
    if (!this.ctx) return;
    const g = this.bedSide.gain, t = this.ctx.currentTime, floor = Math.pow(10, -Math.abs(db) / 20);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(floor, t + 0.012);
    g.setValueAtTime(floor, t + 0.012 + hold);
    g.linearRampToValueAtTime(1, t + 0.012 + hold + release);
  }

  loop(id, opts = {}) {
    if (this.ready && !this._entry(id)) return noopHandle;
    const fadeIn = opts.fade || 0;
    const state = { v: null, stopped: false, volume: opts.volume == null ? 1 : opts.volume, rate: opts.rate || 1, lowpass: opts.lowpass, position: opts.position || null, entry: null };
    const begin = () => {
      if (state.stopped) return;
      const entry = this._entry(id);
      if (!entry) return;
      state.entry = entry;
      const file = this._pick(id, entry);
      if (!this.buffers.has(file)) return;
      state.v = this._voice(id, entry, file, { ...opts, volume: fadeIn ? 0 : state.volume, rate: state.rate, lowpass: state.lowpass, position: state.position }, true);
      if (!state.v) return;
      const dur = state.v.src.buffer.duration;
      state.v.src.start(0, opts.offset != null ? opts.offset % dur : entry.randomStart ? Math.random() * dur * 0.9 : 0);
      if (fadeIn) {
        const target = state.volume * (entry.volume == null ? 1 : entry.volume);
        if (opts.shape === 'equal') equalPower(state.v.gain.gain, this.ctx, 0, target, fadeIn);
        else this._ramp(state.v.gain.gain, target, fadeIn);
      }
    };
    const go = () => {
      const entry = this._entry(id);
      if (!entry) return;
      if (this._decoded(entry)) begin();
      else { this._noteMissed(id); this._ensure(id).then(begin); }
    };
    if (this.ready) go(); else this._readyP.then(go);
    return {
      get playing() { return !state.stopped; },
      get voice() { return state.v; },
      get level() {
        if (!state.v || !state.entry) return 0;
        return state.v.gain.gain.value / (state.entry.volume == null ? 1 : state.entry.volume);
      },
      set: ({ volume, rate, position, lowpass, fade = 0.1, shape } = {}) => {
        if (volume != null) state.volume = volume;
        if (rate != null) state.rate = rate;
        if (lowpass != null) state.lowpass = lowpass;
        if (position) state.position = position;
        if (!state.v) return;
        const t = this.ctx.currentTime, e = state.entry;
        if (volume != null) {
          const target = volume * (e.volume == null ? 1 : e.volume);
          if (shape === 'equal') equalPower(state.v.gain.gain, this.ctx, state.v.gain.gain.value, target, fade);
          else this._ramp(state.v.gain.gain, target, fade);
        }
        if (rate != null) state.v.src.playbackRate.setTargetAtTime(rate * (e.rate || 1), t, Math.max(0.01, fade / 3));
        if (lowpass != null && state.v.filter) state.v.filter.frequency.setTargetAtTime(lowpass, t, Math.max(0.01, fade / 3));
        if (position && state.v.panner) this._setPannerPos(state.v.panner, position);
      },
      stop: (fade = 0.3, shape) => {
        if (state.stopped) return;
        state.stopped = true;
        if (state.v) this._fadeStop(state.v, fade, shape);
      },
    };
  }

  engine(id = 'main_engine', { bus } = {}) {
    let cfg = null, th = 0, phase = 'off', loopH = null, igniteV = null, timer = 0;
    const conf = () => {
      if (cfg) return cfg;
      const e = this._entry(id);
      cfg = Object.assign({ ignite: id + '_ignite', shutdown: id + '_shutdown', handoverAt: null, loopOffset: 0, xf: 1.5, rate: [0.97, 1.03], lowpass: [380, 6000], volume: [0.35, 1] }, e && e.engine);
      return cfg;
    };
    const shape = t => {
      const c = conf();
      return { volume: lerp(c.volume[0], c.volume[1], t), rate: lerp(c.rate[0], c.rate[1], t), lowpass: c.lowpass[0] * Math.pow(c.lowpass[1] / c.lowpass[0], t) };
    };
    const startLoop = (fadeIn, offset, curve) => {
      const s = shape(th);
      loopH = this.loop(id, { volume: s.volume, rate: 1, lowpass: s.lowpass, fade: fadeIn, offset, shape: curve, bus });
      setTimeout(() => { if (loopH) loopH.set({ rate: shape(th).rate, fade: 2 }); }, fadeIn * 1000 + 50);
    };
    const api = {
      get throttle() { return th; },
      get phase() { return phase; },
      ignite: (throttle) => {
        if (!this.ready) { this._readyP.then(() => api.ignite(throttle)); return api; }
        if (throttle != null) th = Math.min(1, Math.max(0, throttle));
        api.stop(0.15);
        const c = conf(), ig = this._entry(c.ignite);
        phase = 'igniting';
        if (!ig || !this._decoded(ig)) {
          if (ig) { this._noteMissed(c.ignite); this._ensure(c.ignite); }
          phase = 'running';
          startLoop(1.2, 0, 'equal');
          return api;
        }
        const h = this._play(c.ignite, ig, { volume: shape(th).volume, lowpass: shape(th).lowpass, bus });
        igniteV = h && h.voice;
        const dur = igniteV ? igniteV.src.buffer.duration : 4;
        const at = c.handoverAt != null ? Math.min(c.handoverAt, dur - c.xf) : Math.max(0, dur - c.xf);
        timer = setTimeout(() => {
          if (phase !== 'igniting') return;
          phase = 'running';
          startLoop(c.xf, c.loopOffset, 'equal');
          if (igniteV) this._fadeStop(igniteV, c.xf, 'equal');
          igniteV = null;
        }, at * 1000);
        return api;
      },
      set: (throttle, fade = 0.15) => {
        th = Math.min(1, Math.max(0, throttle));
        const s = shape(th);
        if (loopH && phase === 'running') loopH.set({ volume: s.volume, rate: s.rate, lowpass: s.lowpass, fade });
        if (igniteV) {
          const e = igniteV.entry;
          this._ramp(igniteV.gain.gain, s.volume * (e.volume == null ? 1 : e.volume), fade);
          if (igniteV.filter) igniteV.filter.frequency.setTargetAtTime(s.lowpass, this.ctx.currentTime, Math.max(0.01, fade / 3));
        }
        return api;
      },
      shutdown: () => {
        if (!this.ctx || phase === 'off') return api;
        const c = conf(), sd = this._entry(c.shutdown);
        let level = shape(th).volume;
        if (loopH && loopH.voice) level = loopH.level;
        else if (igniteV) level = igniteV.gain.gain.value / (igniteV.entry.volume == null ? 1 : igniteV.entry.volume);
        clearTimeout(timer);
        if (igniteV) { this._fadeStop(igniteV, 0.35, 'equal'); igniteV = null; }
        if (loopH) { loopH.stop(0.4, 'equal'); loopH = null; }
        phase = 'off';
        if (sd && level > 0.001) {
          if (this._decoded(sd)) this._play(c.shutdown, sd, { volume: level, lowpass: shape(th).lowpass, bus });
          else this._sfxLate(c.shutdown, { volume: level, bus }, now());
        }
        return api;
      },
      stop: (fade = 0.3) => {
        clearTimeout(timer);
        if (igniteV) { this._fadeStop(igniteV, fade); igniteV = null; }
        if (loopH) { loopH.stop(fade); loopH = null; }
        phase = 'off';
        return api;
      },
    };
    return api;
  }

  ambience(id, { volume = 1, fade = 2 } = {}) {
    if (!this.ctx || !this.ready) { this._pending.beds.set(id, { volume, fade }); return; }
    const bed = this.beds.get(id);
    if (bed) {
      if (volume <= 0) { bed.stop(fade); this.beds.delete(id); }
      else bed.set({ volume, fade });
      return;
    }
    if (volume <= 0) return;
    const entry = this._entry(id);
    if (!entry) return;
    const h = this.loop(id, { volume, fade, bus: this.bedBus });
    if (h !== noopHandle) this.beds.set(id, h);
  }

  music(id, { fade = 3, volume = 1, from = 0, tickIn = null } = {}) {
    if (!this.ctx || !this.ready) { this._pending.music = { id, opts: { fade, volume, from }, prev: OWNER_ONLY.has(id) ? this._pending.music : null }; return; }
    if (id == null) {
      this._cancelDelayed();
      for (const d of this.decks) if (d.busy) d.release(fade, 'equal');
      this.current = null;
      return;
    }
    const entry = this._entry(id);
    if (!entry) return;
    const level = volume * (entry.volume == null ? 1 : entry.volume);
    if (this._delayed && this._delayed.id === id && !from) { this._delayed.level = level; this._delayed.volume = volume; return; }
    this._cancelDelayed();
    if (this.current && this.current.id === id && this.current.busy && !from) {
      this.current.ramp(level, fade);
      this.current.userVolume = volume;
      return;
    }
    for (const d of this.decks) if (d.busy) d.release(fade, 'equal');
    this.current = null;
    const cue = entry.owner ? mapCue(from, entry.base && entry.base.landmarks, entry.landmarks, entry.duration) : { from, delay: 0 };
    if (entry.tick && tickIn != null) {
      const P = entry.tick.period, wrap = x => ((x % P) + P) % P;
      if (cue.delay > 0.25) cue.delay += wrap(cue.from + tickIn - entry.tick.phase - cue.delay);
      else cue.from += wrap(entry.tick.phase - cue.from - tickIn);
    }
    if (cue.delay > 0.25) {
      this._delayed = { id, entry, level, volume, fade, from: cue.from, left: cue.delay, at: now(), timer: 0 };
      this._armDelayed();
      return;
    }
    this._startMusic(id, entry, level, volume, fade, cue.from);
  }

  _startMusic(id, entry, level, volume, fade, from) {
    const deck = this._freeDeck();
    deck.userVolume = volume;
    deck.start(id, entry, level, fade, from, 'equal');
    this.current = deck;
  }

  _armDelayed() {
    const q = this._delayed;
    if (!q) return;
    q.at = now();
    q.timer = setTimeout(() => {
      if (this._delayed !== q) return;
      this._delayed = null;
      this._startMusic(q.id, q.entry, q.level, q.volume, q.fade, q.from);
    }, q.left * 1000);
  }

  _holdDelayed() {
    const q = this._delayed;
    if (!q || !q.timer) return;
    clearTimeout(q.timer);
    q.timer = 0;
    q.left = Math.max(0, q.left - (now() - q.at));
  }

  _cancelDelayed() {
    if (this._delayed) clearTimeout(this._delayed.timer);
    this._delayed = null;
  }

  musicTime() {
    const d = this.current;
    return d && d.busy ? d.el.currentTime : null;
  }

  tickOf(id) {
    const e = this.owner && this.owner[id];
    return (e && e.tick) || null;
  }

  musicTick() {
    const d = this.current, k = d && d.busy && d.entry && d.entry.tick;
    return k && !d.el.paused && d.el.readyState >= 2 ? { period: k.period, phase: k.phase, until: k.until, time: d.el.currentTime } : null;
  }

  musicCue() {
    const d = this.current;
    return d && d.busy ? d.id : this._delayed ? this._delayed.id : null;
  }

  _freeDeck() {
    let best = this.decks.find(d => !d.busy && !d.id);
    if (!best) {
      const idle = this.decks.filter(d => !d.busy);
      const pool = idle.length ? idle : this.decks.filter(d => d !== this.current);
      best = pool.reduce((a, b) => (a.gain.gain.value <= b.gain.gain.value ? a : b));
      best.kill();
    }
    clearTimeout(best.stopTimer);
    return best;
  }

  _checkLoop(deck) {
    const e = deck.entry;
    if (!deck.busy || deck !== this.current || !e) return;
    const el = deck.el;
    if (e.fadeOut && !deck.fading && isFinite(el.duration) && el.currentTime >= el.duration - e.fadeOut) { deck.fading = true; deck.ramp(0, e.fadeOut); }
    const end = e.loopEnd != null ? e.loopEnd : (e.loop ? el.duration : null);
    if (end == null || !isFinite(end)) return;
    const start = e.loopStart || 0;
    const xf = Math.min(LOOP_XF, Math.max(0.5, (end - start) / 4));
    if (deck.handingOver || el.currentTime < end - xf - PREROLL) return;
    deck.handingOver = true;
    const next = this._freeDeck();
    next.userVolume = deck.userVolume;
    next.handingOver = false;
    const level = deck.level;
    const comp = e.loopMatchDb ? Math.pow(10, e.loopMatchDb / 20) : 1;
    this.current = next;
    next.start(deck.id, e, level * comp, xf, start, 'equal', () => {
      deck.release(xf, 'equal');
      deck.handingOver = false;
      if (comp !== 1) next.settleTimer = setTimeout(() => { if (next.busy && next === this.current) next.ramp(level, 10); }, xf * 1000);
    });
  }

  listener(camera) {
    this.camera = camera || null;
    if (camera) this._ensureTick();
  }

  _ensureTick() {
    if (!this._raf && this.camera && this.ctx) this._raf = requestAnimationFrame(this._tick);
  }

  _tick() {
    this._raf = 0;
    if (!this.camera || !this.ctx) return;
    this.update();
    this._raf = requestAnimationFrame(this._tick);
  }

  update() {
    const cam = this.camera, ctx = this.ctx;
    if (!cam || !ctx) return;
    const m = cam.matrixWorld.elements;
    const px = m[12], py = m[13], pz = m[14];
    const fx = -m[8], fy = -m[9], fz = -m[10];
    const ux = m[4], uy = m[5], uz = m[6];
    const L = ctx.listener;
    if (L.positionX) {
      const t = ctx.currentTime, k = 0.02;
      L.positionX.setTargetAtTime(px, t, k); L.positionY.setTargetAtTime(py, t, k); L.positionZ.setTargetAtTime(pz, t, k);
      L.forwardX.setTargetAtTime(fx, t, k); L.forwardY.setTargetAtTime(fy, t, k); L.forwardZ.setTargetAtTime(fz, t, k);
      L.upX.setTargetAtTime(ux, t, k); L.upY.setTargetAtTime(uy, t, k); L.upZ.setTargetAtTime(uz, t, k);
    } else {
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  muffle(amount = 0, seconds = 0.5) {
    if (!this.ctx) return;
    const a = Math.min(1, Math.max(0, amount));
    const f = MUFFLE_MAX * Math.pow(MUFFLE_MIN / MUFFLE_MAX, a);
    const t = this.ctx.currentTime, k = Math.max(0.01, seconds / 3);
    this.muffleFilter.frequency.cancelScheduledValues(t);
    this.muffleFilter.frequency.setTargetAtTime(f, t, k);
    this.muffleFilter.Q.setTargetAtTime(0.5 + a * 0.4, t, k);
    this.muffleGain.gain.setTargetAtTime(1 - a * 0.25, t, k);
  }

  duck(amount = 0, seconds = 0.5) {
    if (!this.ctx) return;
    const a = Math.min(1, Math.max(0, amount));
    const t = this.ctx.currentTime, k = Math.max(0.01, seconds / 3);
    this.musicDuck.gain.setTargetAtTime(1 - a, t, k);
    this.bedDuck.gain.setTargetAtTime(1 - a * 0.6, t, k);
  }

  get masterVolume() { return this._masterVolume; }
  set masterVolume(v) { this.setMasterVolume(v); }

  setMasterVolume(v, seconds = 0.1) {
    this._masterVolume = Math.min(1.5, Math.max(0, v));
    if (this.master) this._ramp(this.master.gain, this._masterVolume, seconds);
  }

  setMusicVolume(v, seconds = 0.1) {
    this._musicVolume = Math.min(1, Math.max(0, v));
    if (this.musicBus) this._ramp(this.musicBus.gain, this._musicVolume, seconds);
  }

  captureStream() {
    if (!this.ctx || !this.limiter) return null;
    if (!this._tap) { this._tap = this.ctx.createMediaStreamDestination(); this.limiter.connect(this._tap); }
    return this._tap.stream;
  }

  async suspend() {
    if (!this.ctx) return;
    for (const d of this.decks) if (d.busy) d.el.pause();
    this._holdDelayed();
    await timeout(this.ctx.suspend().catch(() => {}), 1500);
  }

  async resume() {
    if (!this.ctx) return;
    await timeout(this.ctx.resume().catch(() => {}), 1500);
    for (const d of this.decks) if (d.busy) d.el.play().catch(() => {});
    if (this._delayed && !this._delayed.timer) this._armDelayed();
  }

  _noise(seconds = 4) {
    if (this._noiseBuf) return this._noiseBuf;
    const sr = this.ctx.sampleRate, n = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) { b = 0.985 * b + 0.015 * (Math.random() * 2 - 1) * 8; d[i] = b; }
    const fadeN = Math.floor(sr * 0.05);
    for (let i = 0; i < fadeN; i++) { const k = i / fadeN; d[n - fadeN + i] = d[n - fadeN + i] * (1 - k) + d[i] * k; }
    this._noiseBuf = buf;
    return buf;
  }

  synth(kind, { volume = 1, fade = 2, freq, position } = {}) {
    if (!this.ctx || !this.ready) return noopHandle;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    const nodes = [];
    const src = ctx.createBufferSource();
    src.buffer = this._noise();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    let osc = null;
    if (kind === 'sub') {
      lp.frequency.value = 90; lp.Q.value = 0.7;
      osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq || 32;
      const og = ctx.createGain(); og.gain.value = 0.6;
      osc.connect(og).connect(out);
    } else if (kind === 'rumble') {
      lp.frequency.value = freq || 160; lp.Q.value = 0.9;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lg = ctx.createGain(); lg.gain.value = (freq || 160) * 0.35;
      lfo.connect(lg).connect(lp.frequency); lfo.start(t);
      nodes.push(lfo);
    } else if (kind === 'whoosh') {
      lp.type = 'bandpass'; lp.frequency.value = freq || 700; lp.Q.value = 0.8;
    } else { this._warn('synth:' + kind, `audio: unknown synth "${kind}"`); return noopHandle; }
    src.connect(lp).connect(out);
    let dest = out, panner = null;
    if (position) { panner = this._panner(position, {}); out.connect(panner); dest = panner; this._ensureTick(); }
    dest.connect(this.fxBus);
    src.start(t);
    if (osc) osc.start(t);
    this._ramp(out.gain, volume, fade);
    let stopped = false;
    return {
      get playing() { return !stopped; },
      set: ({ volume: v, freq: f, position: p, fade: s = 0.5 } = {}) => {
        if (v != null) this._ramp(out.gain, v, s);
        if (f != null) (osc ? osc.frequency : lp.frequency).setTargetAtTime(f, ctx.currentTime, s / 3);
        if (p && panner) this._setPannerPos(panner, p);
      },
      stop: (s = 1) => {
        if (stopped) return;
        stopped = true;
        this._ramp(out.gain, 0, s);
        const end = ctx.currentTime + s + 0.05;
        src.stop(end); if (osc) osc.stop(end);
        for (const n of nodes) n.stop(end);
      },
    };
  }

  stopAll(fade = 0.5) {
    this.music(null, { fade });
    for (const [id, h] of this.beds) { h.stop(fade); this.beds.delete(id); }
  }

  _ramp(param, v, seconds) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(v, t + Math.max(0.01, seconds));
  }

  _fadeStop(v, fade, shape) {
    const t = this.ctx.currentTime;
    if (shape === 'equal') equalPower(v.gain.gain, this.ctx, v.gain.gain.value, 0, fade);
    else this._ramp(v.gain.gain, 0, fade);
    try { v.src.stop(t + Math.max(0.01, fade) + 0.02); } catch (e) { return; }
  }
}

export const audio = new AudioSystem();
export { AudioSystem, mapCue, ownerEntries };
export default audio;
