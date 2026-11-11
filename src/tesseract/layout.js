// Tesseract memory builder: reads history.data and lays out which memories exist, their time windows, run lengths and lattice positions, plus the journey numbers for the end card.
import * as THREE from 'three';

export const CELL = { x: 20, y: 16, z: 24 };
const MONTH = 2629800, YEAR = 31557600;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const base = id => String(id ?? '').replace(/#\d+$/, '');

export const KIND_TITLE = { lab: 'waking', ring: 'the ring', cockpit: 'cockpit', orbit: 'around the endurance', landing: 'landing', shallows: 'the shallows', wave: 'the wave', aged: 'years', fall: 'the fall' };

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export function sampleIndex(S, t) {
  let lo = 0, hi = S.length - 1;
  if (t <= S[0][0]) return [0, 0, 0];
  if (t >= S[hi][0]) return [hi, hi, 0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m][0] <= t) lo = m; else hi = m; }
  const a = S[lo], b = S[hi];
  return [lo, hi, b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0])];
}

export function poseAt(seg, t, out = { p: new THREE.Vector3(), q: new THREE.Quaternion(), extra: undefined, dist: 0 }) {
  const S = seg.samples;
  const [lo, hi, u] = sampleIndex(S, t);
  const a = S[lo], b = S[hi];
  out.p.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
  _qa.set(a[4], a[5], a[6], a[7]); _qb.set(b[4], b[5], b[6], b[7]);
  out.q.slerpQuaternions(_qa, _qb, u);
  out.extra = undefined;
  for (let i = lo; i >= 0; i--) if (S[i].length > 8) { out.extra = S[i][8]; break; }
  const cum = seg._cum || cumulate(seg);
  out.dist = cum[lo] + (cum[hi] - cum[lo]) * u;
  return out;
}

function cumulate(seg) {
  const S = seg.samples, c = new Float64Array(S.length);
  for (let i = 1; i < S.length; i++) c[i] = c[i - 1] + Math.hypot(S[i][1] - S[i - 1][1], S[i][2] - S[i - 1][2], S[i][3] - S[i - 1][3]);
  Object.defineProperty(seg, '_cum', { value: c, enumerable: false, configurable: true });
  return c;
}

export function trackSegment(track, t) {
  let best = track[0], gap = Infinity;
  for (const s of track) {
    if (t >= s.t0 && t <= s.t1) return s;
    const g = t < s.t0 ? s.t0 - t : t - s.t1;
    if (g < gap) { gap = g; best = s; }
  }
  return best;
}

export function speedAt(seg, t, h = 0.25) {
  const a = poseAt(seg, t - h, _sa), pa = a.p.clone();
  const b = poseAt(seg, t + h, _sb);
  return pa.distanceTo(b.p) / (2 * h);
}
const _sa = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, _sb = { p: new THREE.Vector3(), q: new THREE.Quaternion() };

export function buildLayout(data = {}) {
  const tessSegs = new Set((data.segments || []).filter(s => s?.chapter === 'tesseract').map(s => s.id));
  const segs = (data.segments || []).filter(s => s && s.chapter !== 'tesseract' && Array.isArray(s.samples) && s.samples.length > 0 && Number.isFinite(s.t0)).sort((a, b) => a.t0 - b.t0);
  for (const s of segs) if (!(s.t1 >= s.t0)) s.t1 = s.samples[s.samples.length - 1][0];
  const events = (data.events || []).filter(e => e && Number.isFinite(e.t) && !tessSegs.has(e.seg) && e.type !== 'push').sort((a, b) => a.t - b.t);
  const ev = (type, pred) => events.find(e => e.type === type && (!pred || pred(e))) || null;
  const evAll = type => events.filter(e => e.type === type);
  const ch = c => segs.filter(s => s.chapter === c);
  const specs = [];

  const awake = ch('awakening');
  const lab = awake.find(s => base(s.id) === 'cryo-lab') || awake.find(s => s.frame === 'ring-unrolled') || null;
  if (lab) {
    const w = ev('wake');
    specs.push({ key: 'waking', kind: 'lab', track: [lab], t0: w ? Math.max(lab.t0, w.t - 1.2) : lab.t0, t1: lab.t1 });
  }
  const ring = awake.filter(s => s !== lab && (s.frame === 'ring-unrolled' || !s.frame));
  if (ring.length) specs.push({ key: 'ring', kind: 'ring', track: ring, t0: ring[0].t0, t1: ring[ring.length - 1].t1 });

  const dep = ch('departure').filter(s => s.frame === 'ranger-local');
  if (dep.length) {
    const u = ev('undock');
    specs.push({ key: 'cockpit', kind: 'cockpit', track: dep, t0: dep[0].t0, t1: Math.min(dep[dep.length - 1].t1 + 0.5, u ? u.t + 1 : Infinity) });
  }
  const orb = segs.filter(s => (s.chapter === 'departure' || s.chapter === 'spaceflight') && s.frame === 'endurance-inertial' && s.space !== 'transit');
  if (orb.length) {
    const b = ev('burn_start');
    specs.push({ key: 'orbit', kind: 'orbit', track: orb, t0: orb[0].t0, t1: b ? Math.min(orb[orb.length - 1].t1, b.t + 1) : orb[orb.length - 1].t1 });
  }
  const mil = ch('miller');
  const wadeSegs = mil.filter(s => s.mode === 'wade');
  const firstWade = wadeSegs[0];
  const descent = mil.find(s => s.mode === 'fly' && s.frame === 'miller-world' && (!firstWade || s.t0 < firstWade.t0));
  if (descent) {
    const e = ev('entry'), td = ev('touchdown');
    specs.push({ key: 'landing', kind: 'landing', track: [descent], t0: e ? Math.max(descent.t0, e.t) : descent.t0, t1: td ? Math.min(descent.t1, td.t + 1.6) : descent.t1 });
  }
  const ws = ev('wave_seen') || ev('recorder_taken');
  if (wadeSegs.length) {
    const fs = ev('first_step');
    const end = wadeSegs[wadeSegs.length - 1].t1;
    specs.push({ key: 'shallows', kind: 'shallows', track: wadeSegs, t0: fs ? Math.max(wadeSegs[0].t0, fs.t - 2) : wadeSegs[0].t0, t1: ws ? Math.min(end, ws.t + 3) : end });
  }
  const lift = ev('liftoff'), hit = ev('wave_hit');
  if (firstWade && (ws || hit || lift)) {
    const track = mil.filter(s => s.t0 >= firstWade.t0 && (s.frame === 'miller-world' || s.frame === 'ranger-local'));
    const t0 = ws ? ws.t : hit ? hit.t - 20 : lift.t - 20;
    const last = track[track.length - 1].t1;
    const margin = lift?.data?.margin;
    let t1 = lift ? lift.t + Math.max(0, Number.isFinite(margin) ? margin : 0) + 2.5 : hit ? Math.min(last, hit.t + 8) : last;
    t1 = Math.min(t1, last + 60);
    if (t1 > t0 + 2) specs.push({ key: 'wave', kind: 'wave', track, t0, t1 });
  }
  const aged = segs.filter(s => (s.chapter === 'return' || s.chapter === 'years') && s.frame === 'ring-unrolled' && (s.space === 'ring' || s.mode === 'walk'));
  if (aged.length) specs.push({ key: 'years', kind: 'aged', track: aged, t0: aged[0].t0, t1: aged[aged.length - 1].t1 });
  const garg = ch('gargantua');
  const dive = garg.some(s => s.frame === 'schwarzschild') ? garg.filter(s => s.frame === 'schwarzschild') : garg;
  if (dive.length) {
    const dc = ev('disk_cross'), ej = ev('eject');
    const t1 = Math.min(dive[dive.length - 1].t1, ej ? ej.t + 1.6 : Infinity);
    specs.push({ key: 'fall', kind: 'fall', track: dive, t0: Math.max(dive[0].t0, dc ? dc.t - 5 : dive[0].t0, t1 - 40), t1 });
  }

  const memories = specs.filter(s => s.t1 - s.t0 > 0.5).sort((a, b) => a.t0 - b.t0);
  const N = memories.length;
  memories.forEach((m, i) => {
    const ids = new Set(m.track.map(s => s.id));
    m.index = i;
    m.title = KIND_TITLE[m.kind];
    m.events = events.filter(e => ids.has(e.seg) && e.t >= m.t0 - 0.05 && e.t <= m.t1 + 0.05 && e.type !== 'use');
    m.uses = events.filter(e => ids.has(e.seg) && e.t >= m.t0 && e.t <= m.t1 && e.type === 'use');
    m.dur = m.t1 - m.t0;
    m.M = clamp(Math.round(4.2 + 0.85 * Math.log2(m.dur / 8 + 1) + 0.12 * m.events.length), 5, 7);
    m.z = -(N - i) * CELL.z;
    m.mode = m.track[0].mode;
    m.frame = m.track[0].frame;
    retime(m, m.t0);
    m.snaps = [];
  });
  memories.forEach(m => { m.dwell = dwellProfile(m); });

  const snaps = (data.snapshots || []).filter(s => s && s.url && !tessSegs.has(s.seg) && s.tag !== 'push');
  for (const sn of snaps) {
    let mem = memories.find(m => m.track.some(s => s.id === sn.seg) && sn.t >= m.t0 - 1 && sn.t <= m.t1 + 1);
    if (!mem) mem = memories.filter(m => m.track.some(s => s.id === sn.seg)).sort((a, b) => dist(a, sn.t) - dist(b, sn.t))[0];
    if (!mem) {
      const chap = (data.segments || []).find(s => s.id === sn.seg)?.chapter;
      mem = memories.filter(m => m.track.some(s => s.chapter === chap)).sort((a, b) => dist(a, sn.t) - dist(b, sn.t))[0];
    }
    if (mem) mem.snaps.push({ snap: sn, t: clamp(sn.t, mem.t0, mem.t1), tag: sn.tag });
  }

  const anomaly = ev('anomaly_hatch');
  const waking = memories.find(m => m.kind === 'lab');
  let push = null;
  if (waking) {
    const tA = anomaly ? anomaly.t : waking.t0 + 0.7 * waking.dur;
    push = { memory: waking, t: tA, p: anomaly?.p || null, player: anomaly?.data?.player || null, recorded: !!anomaly, room: clamp(Math.floor((tA - waking.t0) / waking.delta), 0, waking.M - 1) };
  } else if (memories.length) {
    const m = memories[0], tA = m.t0 + 0.62 * m.dur;
    push = { memory: m, t: tA, p: null, player: null, recorded: false, fallback: true, room: clamp(Math.floor((tA - m.t0) / m.delta), 0, m.M - 1) };
  }
  const layout = { memories, push, cell: CELL, events, numbers: journeyNumbers(data, segs, events), start: null, source: data.session?.source || 'unknown' };
  const last = memories[N - 1];
  layout.start = { position: new THREE.Vector3(last ? last.x0 - 6 : 0, 0.6, last ? last.z + CELL.z * 0.5 : 8), look: new THREE.Vector3(0.88, -0.04, -0.47).normalize() };
  return layout;
}

function dist(m, t) { return t < m.t0 ? m.t0 - t : t > m.t1 ? t - m.t1 : 0; }

export function retime(m, t0) {
  m.t0 = t0;
  m.delta = m.dur / m.M;
  m.t1 = t0 + m.dur;
  const off = Math.floor((m.M - 1) / 2);
  m.rooms = Array.from({ length: m.M }, (_, k) => ({ m: k, x: (k - off) * CELL.x, t: t0 + (k + 0.5) * m.delta }));
  m.x0 = m.rooms[0].x;
  return m;
}

export function alignPush(layout, leverDx) {
  const P = layout.push;
  if (!P) return;
  const m = P.memory;
  const u = clamp(leverDx / CELL.x, -0.45, 0.45);
  const k = clamp(Math.floor((P.t - m.t0) / m.delta - u), 0, m.M - 1);
  retime(m, P.t - (k + 0.5 + u) * m.delta);
  P.room = k;
  P.leverDx = leverDx;
}

export const timeAtX = (m, x) => clamp(m.t0 + ((x - m.x0) / CELL.x + 0.5) * m.delta, m.t0, m.t1);
export const xAtTime = (m, t) => m.x0 + ((t - m.t0) / m.delta - 0.5) * CELL.x;
export function roomTime(m, k, dx) { return m.rooms[k].t + clamp(dx / CELL.x, -0.5, 0.5) * m.delta; }

function dwellProfile(m) {
  const out = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const t = m.t0 + (i + 0.5) / n * m.dur;
    out.push(speedAt(trackSegment(m.track, t), t, Math.max(0.2, m.dur / n)));
  }
  return out;
}

function journeyNumbers(data, segs, events) {
  const find = t => events.find(e => e.type === t) || null;
  const st = data.state || {};
  const lift = find('liftoff'), hit = find('wave_hit'), td = find('touchdown');
  const surface = Number.isFinite(st.surfaceSeconds) && st.surfaceSeconds > 0 ? st.surfaceSeconds : lift?.data?.surfaceSeconds ?? (td && lift ? lift.shipT - td.shipT : null);
  const clock = data.clock;
  const years = Number.isFinite(st.years) && st.years > 0 ? st.years : clock ? (clock.endurance - clock.ship) / YEAR : null;
  const len = pred => { let d = 0; for (const s of segs) if (pred(s)) { const S = s.samples; for (let i = 1; i < S.length; i++) d += Math.hypot(S[i][1] - S[i - 1][1], S[i][2] - S[i - 1][2], S[i][3] - S[i - 1][3]); } return d; };
  const wf = find('wreck_found'), rt = find('recorder_taken');
  const reads = events.filter(e => e.type === 'log_read');
  const of = reads.reduce((n, e) => Math.max(n, e.data?.of || 0), 0);
  const read = new Set(reads.map(e => e.data?.index));
  let unread = null;
  if (of) for (let i = 0; i < of; i++) if (!read.has(i)) { unread = i; break; }
  return {
    surfaceSeconds: surface, years, waveHit: !!(st.waveHit || hit), margin: lift?.data?.margin ?? null,
    waded: len(s => s.mode === 'wade'), walked: len(s => s.mode === 'walk' || s.mode === 'climb'),
    wreckMonths: wf && rt ? Math.max(0, Math.round((rt.endT - wf.endT) / MONTH)) : null,
    firstStepMonths: find('first_step')?.data?.months ?? null,
    logsRead: read.size, logsTotal: of, firstUnread: unread,
    touchdownEndT: td?.endT ?? null, touchSpeed: td?.data?.speed ?? null,
    switches: events.filter(e => e.type === 'switch').length,
    ejectR: find('eject')?.data?.r ?? null,
    session: data.time ?? null,
  };
}

export function describeLayout(L) {
  const f = v => (Math.round(v * 10) / 10).toFixed(1);
  const lines = [`[tesseract] layout from ${L.source}: ${L.memories.length} memories, ${L.memories.reduce((n, m) => n + m.M, 0)} rooms, cell ${L.cell.x}x${L.cell.y}x${L.cell.z} m`];
  for (const m of L.memories) {
    const evs = [...new Set(m.events.map(e => e.type))].join(' ');
    lines.push(`  ${String(m.index).padStart(2)} ${m.key.padEnd(9)} ${m.track.map(s => s.id).join('+').padEnd(36)} t ${f(m.t0).padStart(6)}-${f(m.t1).padEnd(6)} ${f(m.dur).padStart(6)} s  ${m.M} rooms x ${f(m.delta)} s  z ${m.z}  x ${m.rooms[0].x}..${m.rooms[m.M - 1].x}  snaps ${m.snaps.length}  [${evs}]`);
  }
  if (L.push?.memory) lines.push(`  push: ${L.push.memory.key} room ${L.push.room} at t ${f(L.push.t)}${L.push.recorded ? '' : ' (no anomaly_hatch recorded, fallback instant)'}${L.push.leverDx != null ? `, lever dx ${f(L.push.leverDx)} m` : ''}`);
  const n = L.numbers;
  lines.push(`  numbers: surface ${n.surfaceSeconds != null ? f(n.surfaceSeconds) + ' s' : '-'}, years ${n.years != null ? f(n.years) : '-'}, waded ${Math.round(n.waded)} m, walked ${Math.round(n.walked)} m, wave ${n.waveHit ? 'hit' : n.margin != null ? 'missed by ' + f(n.margin) + ' s' : '-'}, wreck ${n.wreckMonths ?? '-'} months, logs ${n.logsRead}/${n.logsTotal} first unread ${n.firstUnread ?? '-'}`);
  return lines.join('\n');
}
