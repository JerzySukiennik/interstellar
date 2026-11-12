// Interstellar co-op over the internet: a room in the shared realtime database found by a five-character code (server-sent events down, one small PATCH up, heartbeats for presence, ordered acknowledged batches for facts), with the poses moved onto a direct WebRTC data channel between the two browsers whenever one opens.
import { PROTOCOL, wall, rid } from './net.js';
export { CODE, newCode, cleanCode } from './code.js';

export const CLOUD = {
  db: 'https://gzowos-games-default-rtdb.europe-west1.firebasedatabase.app',
  root: 'interstellar/rooms',
  site: 'interstellar.gzowo.fun',
  ice: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
};
const BEAT = 2500, GONE = 12000, QUIET = 50000, POSE_GAP = 85, DIRECT_GAP = 33, MAX_BATCH = 48000, STALL = 4500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const inviteLink = code => `https://${CLOUD.site}/?join=${code}`;

export class CloudLink {
  constructor({ role, code, fetch: f, id = rid(), db = CLOUD.db, root = CLOUD.root, ice = CLOUD.ice, rtc = globalThis.RTCPeerConnection, direct = true } = {}) {
    this.role = role; this.other = role === 'host' ? 'guest' : 'host'; this.code = code; this.id = id;
    this.f = f || globalThis.fetch.bind(globalThis);
    this.room = `${db}/${root}/${code}`;
    this.rtc = direct ? rtc || null : null; this.ice = ice;
    this.open = false; this.peer = false; this.closed = false; this.error = null; this.chan = false; this.said = false; this.claimed = false; this.worker = null;
    this.inbox = []; this.out = []; this.latest = new Map();
    this.busy = false; this.due = false; this.lastSend = 0; this.lastSeen = 0; this.lastPose = 0; this.retry = 0; this.beats = 0;
    this.stats = { sent: 0, recv: 0, opens: 0, drops: 0, resets: 0, relayed: 0, direct: 0, channels: 0 };
    this.e = 0; this.seenE = null; this.seq = 0; this.got = 0; this.pn = 0; this.peerId = null; this.lastP = null;
    this.mirror = null; this.snap = false; this.beat = -1e9; this.batch = null; this.kept = new Set(); this.gone = [];
    this.log = []; this.ticked = 0;
    this.pc = null; this.dc = null; this.gen = 0; this.pcGen = 0; this.tries = 0; this.rtcAt = 0; this.rtcT = 0; this.heard = 0; this.cands = []; this.remote = false;
  }

  get direct() { return this.chan && wall() - this.heard < STALL; }

  get lag() { return this.direct ? 30 : 170; }

  _note(what) { this.log.push(`${Math.round(wall())} ${what}`); if (this.log.length > 80) this.log.shift(); }

  start() {
    this._run();
    this._timer = setInterval(() => this._beat(), 1000);
    this._timer.unref?.();
    return this;
  }

  close() {
    if (this.closed) return;
    this._halt();
    this.bye();
  }

  bye() {
    this._pulse(false);
    if (!this.claimed) return;
    this.claimed = false;
    this.f(`${this._url(this.role)}?x-http-method-override=DELETE`, { method: 'POST', keepalive: true, cache: 'no-store', body: '' }).catch(() => {});
  }

  _halt(error) {
    if (error) { this.error = error; this.claimed = false; }
    this.closed = true;
    clearInterval(this._timer);
    this._pulse(false);
    this._ac?.abort();
    this.open = false;
    this._peer(false);
  }

  _url(path) { return `${this.room}/${path}.json`; }

  _pulse(on) {
    if (!on) { this.worker?.terminate(); this.worker = null; return; }
    if (this.worker || typeof Worker === 'undefined' || typeof Blob === 'undefined' || !globalThis.URL?.createObjectURL) return;
    try {
      const src = `let u=null;onmessage=e=>{u=e.data};setInterval(()=>{if(u)fetch(u,{method:'PATCH',cache:'no-store',body:JSON.stringify({t:Date.now()})}).catch(()=>{})},${BEAT});`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      this.worker.postMessage(`${this._url(this.role)}?print=silent`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { this.worker = null; }
  }

  async _get(path) {
    const r = await this.f(this._url(path), { cache: 'no-store' });
    if (!r.ok) throw new Error(`status ${r.status}`);
    return r.json();
  }

  async _claim() {
    const cur = await this._get(this.role);
    if (cur?.id && cur.id !== this.id) {
      await sleep(BEAT + 1500);
      const now = await this._get(this.role);
      if (now?.id && now.id !== this.id && (now.id !== cur.id || now.t !== cur.t)) return this.role === 'host' ? 'taken' : 'busy';
    }
    if (this.role === 'guest') {
      const h = await this._get('host');
      if (!h?.id) return 'none';
      if (h.v !== PROTOCOL) return 'version';
    }
    const r = await this.f(`${this._url(this.role)}?print=silent`, { method: 'PUT', cache: 'no-store', body: JSON.stringify({ id: this.id, v: PROTOCOL, e: this.e, a: this.got, t: Date.now() }) });
    if (!r.ok) return r.status === 401 || r.status === 403 ? 'none' : 'down';
    this.kept.clear(); this.gone.length = 0;
    return null;
  }

  async _run() {
    let wait = 400;
    while (!this.closed) {
      try {
        if (!this.claimed) {
          const err = await this._claim();
          if (this.closed) { if (!err) { this.claimed = true; this.bye(); } break; }
          if (err) {
            if (this.error !== err) this._note(`claim ${err}`);
            this.error = err;
            if (err === 'taken' || err === 'version') this._halt(err);
            throw new Error(err);
          }
          this.claimed = true; this.due = true;
          this._pulse(true);
        }
        const ac = this._ac = new AbortController();
        const res = await this.f(this._url(this.other), { cache: 'no-store', signal: ac.signal, headers: { Accept: 'text/event-stream' } });
        if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
        wait = 400;
        this.open = true; this.error = null; this.stats.opens++; this.snap = false; this.lastSeen = wall();
        this._note('open');
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        while (!this.closed && this.claimed) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const type = /^event: *(.*)$/m.exec(chunk)?.[1];
            if (type) this._event(type.trim(), /^data: *(.*)$/m.exec(chunk)?.[1]);
          }
        }
        ac.abort();
      } catch { if (!this.error) this.error = 'down'; }
      if (this.open) { this.stats.drops++; this._note('drop'); }
      this.open = false;
      if (this.closed) break;
      await sleep(wait);
      wait = Math.min(this.error === 'none' ? 1200 : 2500, wait * 1.6);
    }
  }

  _event(type, text) {
    this.lastSeen = wall();
    if (type === 'cancel' || type === 'auth_revoked') { this._ac?.abort(); return; }
    if (type !== 'put' && type !== 'patch') return;
    let j;
    try { j = JSON.parse(text); } catch { return; }
    if (!j || typeof j.path !== 'string') return;
    const live = this.snap;
    this.snap = true;
    this._apply(j.path, j.data, type === 'patch');
    this._absorb(live);
  }

  _apply(path, data, merge) {
    const base = path.split('/').filter(Boolean);
    const set = (keys, v) => {
      if (!keys.length) { this.mirror = v && typeof v === 'object' ? v : null; return; }
      let o = this.mirror ||= {};
      for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] && typeof o[keys[i]] === 'object' ? o[keys[i]] : (o[keys[i]] = {});
      if (v == null) delete o[keys[keys.length - 1]]; else o[keys[keys.length - 1]] = v;
    };
    if (merge && data && typeof data === 'object') for (const k of Object.keys(data)) set(base.concat(k.split('/').filter(Boolean)), data[k]);
    else set(base, data);
  }

  _absorb(live) {
    const P = this.mirror, t = wall();
    if (!P || !P.id) { this.peerId = null; this._peer(false); return; }
    if (P.v !== PROTOCOL) { if (this.role === 'guest') { this.bye(); this._halt('version'); } return; }
    if (P.id !== this.peerId) { this._peer(false); this.peerId = P.id; this.got = 0; this.seenE = null; this.lastP = null; this.due = true; }
    if (live) this.beat = t;
    if (t - this.beat > GONE) return;
    const e = P.e || 0;
    if (!this.peer) { this.e++; this.seenE = e; this._peer(true); this.due = true; }
    else if (e !== this.seenE) { this.seenE = e; this.stats.resets++; this._note('reset by the other side'); this._peer(false); this._peer(true); this.due = true; }
    const q = P.q;
    if (q && typeof q === 'object') {
      const ns = Object.keys(q).map(k => +k.slice(1)).filter(n => n > this.got).sort((a, b) => a - b);
      for (const n of ns) {
        this.got = n; this.due = true;
        let d = null;
        try { d = JSON.parse(q[`m${n}`]); } catch {}
        if (!Array.isArray(d)) continue;
        this.stats.recv++;
        for (const m of d) { if (Array.isArray(m) && m[0] === '~') this._signal(m); else this.inbox.push(m); }
      }
    }
    const a = P.a || 0;
    for (const k of this.kept) if (k <= a) { this.kept.delete(k); this.gone.push(k); }
    if (live && typeof P.p === 'string' && P.p !== this.lastP) {
      this.lastP = P.p;
      let j = null;
      try { j = JSON.parse(P.p); } catch {}
      if (j && Array.isArray(j.d)) for (const m of j.d) this.inbox.push(m);
    }
    if (this.due) this._push();
  }

  _peer(on) {
    if (on === this.peer) return;
    this.peer = on;
    this._note(on ? 'peer' : 'no peer');
    if (on) { this.tries = 0; this.rtcAt = wall() + 250; }
    else {
      this.out.length = 0; this.latest.clear(); this.batch = null;
      for (const k of this.kept) this.gone.push(k);
      this.kept.clear();
      this._rtcStop();
    }
    this.inbox.push(['peer', on]);
  }

  send(msg) { if (this.peer) this.out.push(msg); }

  post(key, msg) { if (this.peer) this.latest.set(key, msg); }

  tick() {
    if (this.closed) return;
    const t = wall();
    if (this.ticked && t - this.ticked > 2000) { this._note(`stalled ${Math.round(t - this.ticked)} ms`); this.beat = Math.max(this.beat, t - GONE + 4000); this.heard = Math.max(this.heard, t - STALL + 2500); this.lastSeen = Math.max(this.lastSeen, t - QUIET + 4000); }
    this.ticked = t;
    if (this.peer && t - this.beat > GONE) { this._note('silence'); this._peer(false); this._ac?.abort(); }
    else if (this.open && t - this.lastSeen > QUIET) this._ac?.abort();
    if (this.pc) { if (!this.chan && t - this.rtcT > 15000) this._rtcStop(true); }
    else if (this.rtc && this.role === 'host' && this.peer && this.tries < 3 && t >= this.rtcAt) this._offer();
    const d = this.direct;
    if (d !== this.said) { this.said = d; this._note(d ? 'direct' : 'direct quiet'); }
  }

  flush() {
    if (this.closed || !this.claimed) return;
    const t = wall();
    if (this.direct && this.latest.size && t - this.lastPose >= DIRECT_GAP) this._direct(t);
    if (this.busy || t < this.retry) return;
    const facts = this.peer && (this.batch || this.out.length) && t - this.lastSend >= 45;
    const poses = this.peer && !this.direct && this.latest.size && t - this.lastSend >= POSE_GAP;
    if (facts || poses || this.due) this._push();
  }

  _beat() {
    if (this.closed) return;
    this.tick();
    if (!this.claimed) return;
    const t = wall();
    if (this.chan && this.dc?.readyState === 'open' && t - this.lastPose > 900) { try { this.dc.send('[]'); this.lastPose = t; } catch {} }
    if (this.due || t - this.lastSend >= BEAT) this._push();
    if (++this.beats % 12 === 0) this._seat();
  }

  async _seat() {
    let id;
    try { id = await this._get(`${this.role}/id`); } catch { return; }
    if (this.closed || !this.claimed) return;
    if (id && id !== this.id) this._halt(this.role === 'host' ? 'taken' : 'busy');
    else if (!id) { this.claimed = false; this._ac?.abort(); }
  }

  async _push() {
    if (this.busy || this.closed || !this.claimed) return;
    const t = wall();
    if (t < this.retry) return;
    const body = { t: Date.now(), e: this.e, a: this.got };
    let b = this.batch;
    if (!b && this.peer && this.out.length) {
      const parts = [];
      let size = 2;
      for (const m of this.out) {
        const s = JSON.stringify(m);
        if (parts.length && size + s.length + 1 > MAX_BATCH) break;
        parts.push(s); size += s.length + 1;
      }
      this.out.splice(0, parts.length);
      b = this.batch = { n: ++this.seq, text: `[${parts.join(',')}]` };
    }
    if (b) body[`q/m${b.n}`] = b.text;
    const gone = this.gone.splice(0, 40);
    for (const k of gone) body[`q/m${k}`] = null;
    let posed = false;
    if (this.peer && !this.direct && this.latest.size) {
      body.p = JSON.stringify({ n: ++this.pn, d: [...this.latest.values()] });
      this.latest.clear();
      posed = true;
    }
    this.busy = true; this.due = false; this.lastSend = t;
    let status = 0;
    try { status = (await this.f(`${this._url(this.role)}?print=silent`, { method: 'PATCH', cache: 'no-store', body: JSON.stringify(body) })).status; } catch {}
    this.busy = false;
    if (status >= 200 && status < 300) {
      this.stats.sent++;
      if (posed) this.stats.relayed++;
      if (b) { if (this.batch === b) { this.batch = null; this.kept.add(b.n); } else this.gone.push(b.n); }
      return;
    }
    this.gone.unshift(...gone);
    this._note(`write failed ${status}`);
    this.retry = wall() + 600;
    this.due = true;
    if (status === 401 || status === 403 || status === 404) { this.claimed = false; this._ac?.abort(); }
  }

  _direct(t) {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') return;
    if (dc.bufferedAmount > 65536) { this.latest.clear(); return; }
    try { dc.send(JSON.stringify([...this.latest.values()])); } catch { return; }
    this.stats.direct++;
    this.latest.clear();
    this.lastPose = t;
  }

  _conn(gen) {
    let pc;
    try { pc = new this.rtc({ iceServers: this.ice }); } catch { this.rtc = null; return null; }
    this.pc = pc; this.pcGen = gen; this.cands = []; this.remote = false; this.rtcT = wall();
    pc.onicecandidate = e => { if (e.candidate && this.pc === pc) this.send(['~', 'c', gen, e.candidate.toJSON?.() ?? e.candidate]); };
    pc.onconnectionstatechange = () => { if (this.pc === pc && /failed|closed/.test(pc.connectionState)) this._rtcStop(true); };
    return pc;
  }

  _chan(dc) {
    this.dc = dc;
    dc.onopen = () => { if (this.dc === dc) { this.chan = true; this.tries = 0; this.heard = wall(); this.stats.channels++; } };
    dc.onclose = () => { if (this.dc === dc) this._rtcStop(true); };
    dc.onmessage = e => {
      if (this.dc !== dc) return;
      this.heard = this.beat = wall();
      let d = null;
      try { d = JSON.parse(e.data); } catch {}
      if (this.peer && Array.isArray(d)) for (const m of d) this.inbox.push(m);
    };
  }

  _offer() {
    this.tries++;
    const gen = ++this.gen, pc = this._conn(gen);
    if (!pc) return;
    try { this._chan(pc.createDataChannel('pose', { ordered: false, maxRetransmits: 0 })); } catch { this._rtcStop(true); return; }
    pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => { if (this.pc === pc) this.send(['~', 'o', gen, pc.localDescription.sdp]); }).catch(() => { if (this.pc === pc) this._rtcStop(true); });
  }

  _signal(m) {
    const kind = m[1], gen = m[2], data = m[3];
    if (!this.rtc) return;
    if (kind === 'o' && this.role === 'guest') {
      this._rtcStop();
      const pc = this._conn(gen);
      if (!pc) return;
      pc.ondatachannel = e => { if (this.pc === pc) this._chan(e.channel); };
      pc.setRemoteDescription({ type: 'offer', sdp: data }).then(() => { this._remote(pc); return pc.createAnswer(); }).then(a => pc.setLocalDescription(a)).then(() => { if (this.pc === pc) this.send(['~', 'a', gen, pc.localDescription.sdp]); }).catch(() => { if (this.pc === pc) this._rtcStop(); });
      return;
    }
    const pc = this.pc;
    if (!pc || gen !== this.pcGen) return;
    if (kind === 'a' && this.role === 'host') pc.setRemoteDescription({ type: 'answer', sdp: data }).then(() => this._remote(pc)).catch(() => { if (this.pc === pc) this._rtcStop(true); });
    else if (kind === 'c') { if (this.remote) pc.addIceCandidate(data).catch(() => {}); else this.cands.push(data); }
  }

  _remote(pc) {
    if (this.pc !== pc) return;
    this.remote = true;
    for (const c of this.cands.splice(0)) pc.addIceCandidate(c).catch(() => {});
  }

  _rtcStop(again = false) {
    const pc = this.pc;
    if (this.chan) this._note('channel closed');
    this.pc = null; this.dc = null; this.chan = false; this.cands = []; this.remote = false;
    if (again) this.rtcAt = wall() + 12000;
    try { pc?.close(); } catch {}
  }
}
