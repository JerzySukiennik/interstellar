// Interstellar co-op transport: relay client over fetch (server-sent events down, batched POSTs up, automatic reconnect) and the interpolation buffer for the partner's poses.
import * as THREE from 'three';

export const PROTOCOL = 1;
export const wall = () => globalThis.performance?.now?.() ?? Date.now();
export const rid = () => Array.from({ length: 12 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const pick = f => f || globalThis.fetch?.bind(globalThis);

export async function probe(base = '', f) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 1500);
  try {
    const r = await pick(f)(`${base}/coop/info`, { cache: 'no-store', signal: ac.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.v === PROTOCOL ? j : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function openLan(base = '', on = true, f) {
  try {
    const r = await pick(f)(`${base}/coop/lan`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !!on }) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export class Link {
  constructor({ base = '', role, fetch: f, id = rid() } = {}) {
    this.base = base; this.role = role; this.id = id; this.f = pick(f);
    this.open = false; this.peer = false; this.closed = false; this.error = null;
    this.inbox = []; this.out = []; this.latest = new Map();
    this.busy = false; this.lastSend = 0; this.lastSeen = 0;
    this.stats = { sent: 0, recv: 0, opens: 0, drops: 0 };
  }

  start() { this._run(); return this; }

  close() { this.closed = true; this._ac?.abort(); this.open = false; this._peer(false); }

  async _run() {
    let wait = 300;
    while (!this.closed) {
      const ac = this._ac = new AbortController();
      try {
        const res = await this.f(`${this.base}/coop/events?role=${this.role}&id=${this.id}`, { cache: 'no-store', signal: ac.signal, headers: { Accept: 'text/event-stream' } });
        if (!res.ok || !res.body) { this.error = res.status === 409 ? 'busy' : 'down'; throw new Error(`status ${res.status}`); }
        wait = 300;
        this.lastSeen = wall();
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        while (!this.closed) {
          const { value, done } = await reader.read();
          if (done) break;
          this.lastSeen = wall();
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('data: ')) this._event(chunk.slice(6)); }
        }
      } catch { if (!this.error) this.error = 'down'; }
      if (this.open) this.stats.drops++;
      this.open = false;
      this._peer(false);
      if (this.closed) break;
      await new Promise(r => setTimeout(r, wait));
      wait = Math.min(2000, wait * 1.6);
    }
  }

  _event(text) {
    let j;
    try { j = JSON.parse(text); } catch { return; }
    if (j.t === 'hello') {
      if (j.v !== PROTOCOL) { this.error = 'version'; this.close(); return; }
      this.open = true; this.error = null; this.stats.opens++;
      this._peer(!!j.peer);
    } else if (j.t === 'peer') this._peer(!!j.on);
    else if (j.t === 'm' && Array.isArray(j.d)) { this.stats.recv++; for (const m of j.d) this.inbox.push(m); }
  }

  _peer(on) {
    if (on === this.peer) return;
    this.peer = on;
    if (!on) { this.out.length = 0; this.latest.clear(); }
    this.inbox.push(['peer', on]);
  }

  send(msg) { if (this.peer) this.out.push(msg); }

  post(key, msg) { if (this.peer) this.latest.set(key, msg); }

  tick() { if (this.open && wall() - this.lastSeen > 7000) this._ac?.abort(); }

  flush() {
    if (this.busy || !this.open || !this.peer) return;
    const t = wall();
    if (t - this.lastSend < 45 || (!this.out.length && !this.latest.size)) return;
    const n = this.out.length, batch = this.out.slice(0, n).concat([...this.latest.values()]);
    this.latest.clear();
    this.busy = true; this.lastSend = t;
    this.f(`${this.base}/coop/send?role=${this.role}&id=${this.id}`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) })
      .then(r => { if (r.ok) { this.out.splice(0, n); this.stats.sent++; } else if (r.status === 409) this._ac?.abort(); }, () => {})
      .finally(() => { this.busy = false; });
  }
}

export class Track {
  constructor({ delay = 120, extra = 250 } = {}) {
    this.delay = delay; this.extra = extra;
    this.buf = []; this.off = null; this.last = -1e9;
    this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.s = null; this.ph = 0;
  }

  reset() { this.buf.length = 0; this.off = null; this.last = -1e9; this.s = null; }

  get age() { return wall() - this.last; }

  get newest() { return this.buf[this.buf.length - 1] || null; }

  push(s) {
    const t = wall(), b = this.buf, o = t - s.t;
    this.last = t;
    if (b.length && s.t <= b[b.length - 1].t) { if (s.t > b[b.length - 1].t - 2000) return; b.length = 0; this.off = null; }
    this.off = this.off == null ? o : Math.min(o, this.off + 0.3);
    b.push(s);
    if (b.length > 40) b.shift();
  }

  sample() {
    const b = this.buf, n = b.length;
    if (!n) return null;
    const T = wall() - this.off - this.delay;
    let a, c, u;
    if (T >= b[n - 1].t) {
      c = b[n - 1]; a = n > 1 ? b[n - 2] : c;
      const span = c.t - a.t;
      u = span > 0 && span < 400 ? 1 + Math.min(this.extra, T - c.t) / span : 1;
    } else {
      let i = n - 1;
      while (i > 0 && b[i].t > T) i--;
      a = b[i]; c = b[Math.min(n - 1, i + 1)];
      u = c.t > a.t ? Math.max(0, (T - a.t) / (c.t - a.t)) : 0;
    }
    if (a.k !== c.k || a.st !== c.st || !a.p || !c.p) { a = u >= 0.5 ? c : a; c = a; u = 0; }
    this.s = u >= 1 ? c : a;
    if (!a.p) return this;
    this.p.fromArray(a.p).lerp(_v.fromArray(c.p), u);
    this.q.fromArray(a.q).slerp(_q.fromArray(c.q), Math.min(1, u));
    const d = ((c.ph || 0) - (a.ph || 0) + 1.5) % 1 - 0.5;
    this.ph = (((a.ph || 0) + d * Math.min(1, u)) % 1 + 1) % 1;
    return this;
  }
}
