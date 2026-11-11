// Wren's logs: entries generated from the recorded history in Endurance time from touchdown, consistent with her own wake and sleep cycles and with what the pilot was doing at each moment.
import { MONTH } from '../../core/clock.js';

const POOL = {
  inside: [
    ['STILL SHUT.', 'The rear hatch is still shut. From here the Ranger is a white speck on a grey sea. I keep checking that it is still there.'],
    ['WAITING.', 'Nothing moves on the lens. I know it has been seconds for you. I keep telling myself that.'],
    ['ARITHMETIC.', 'Every second down there is a month up here. I did the sum again tonight in case I had it wrong. I did not.'],
  ],
  crossing: [
    ['ONE STEP.', 'I watched one of your steps today. It started on Monday. I am not complaining.'],
    ['THE LENS.', 'You turned your head. It took most of the week. I think you were looking up at me.'],
    ['DISTANCE.', 'I measure your progress in pixels. Four this month.'],
  ],
  wreck: [
    ['STILL.', 'You are not moving. I zoomed in until the image fell apart. I think you are kneeling.'],
  ],
  back: [
    ['COMING BACK.', 'You turned round. I could tell from the shadow before I could tell from you.'],
    ['HURRY.', 'I keep saying it out loud. It does not help either of us.'],
  ],
  early: [
    ['RING STEADY.', 'Spin nominal. The seedlings in the habitat are doing better than I am.'],
    ['STILL HERE.', 'I talk to you on the open channel. You will not hear any of it for a long time. That is fine.'],
  ],
  middle: [
    ['ANOTHER YEAR.', 'I stopped counting days. I count your footsteps instead. It is a slower clock.'],
    ['LIGHTS.', 'Two more tubes failed in the ring. I left them. The dark parts of the ship feel larger every year.'],
    ['THE PLANTS.', 'The tray is over the edge now. I let them climb. Something on this ship should be getting somewhere.'],
  ],
  late: [
    ['TALLY.', 'I scratch one mark a year on the panel by the comms. I wanted something you could count without a screen.'],
    ['COLD.', 'I turned the heaters down in the empty modules. There is frost on the inside of the portholes.'],
    ['VOICE.', 'I recorded my voice so I would remember what it sounds like. I did not like it.'],
    ['QUIET.', 'Gargantua comes round every eleven seconds. I have seen it a hundred million times. It has not changed.'],
    ['HANDS.', 'My hands shake when I wake now. The keyboard is fine. The tally marks are harder.'],
    ['THE BEACON.', 'Miller still sends all good. It will send all good long after both of us are quiet.'],
  ],
};

const pad = n => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const stamp = mo => `T+${pad(mo / 12)}y ${pad(mo % 12)}m`;
const ym = mo => { mo = Math.max(0, Math.round(mo)); const y = Math.floor(mo / 12), m = mo % 12; return y > 0 ? `${y} year${y === 1 ? '' : 's'}${m ? ` and ${m} month${m === 1 ? '' : 's'}` : ''}` : `${m} month${m === 1 ? '' : 's'}`; };
const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = n => words[n] ?? String(n);

export function wrenTimeline(years) {
  const total = Math.max(1, Math.round(years * 12));
  const sleepAt = total > 30 ? Math.min(total - 12, Math.max(60, Math.round(total * 0.42))) : total + 1;
  const cycles = [];
  for (let m = sleepAt + 40; m < total - 6; m += 40 + (cycles.length % 2) * 14) cycles.push(m);
  const awakeMonths = Math.min(total, sleepAt) + cycles.length * 2;
  return { total, sleepAt, cycles, age: 38 + awakeMonths / 12 };
}

export function wrenAge(years) { return wrenTimeline(years).age; }

export function podStatus(years) {
  const tl = wrenTimeline(years), dead = years >= 45, asleep = tl.sleepAt < tl.total;
  return { pod: '02', occupant: 'WREN, A.', status: !asleep ? 'EMPTY' : dead ? 'NO LIFE SIGNS' : 'STASIS', cycles: tl.cycles.length + 1, age: tl.age, temp: dead ? 271.2 : 278.4 - Math.min(4, years * 0.08), heartRate: dead || !asleep ? null : 4 };
}

function stops(history, segId, t0, t1) {
  const seg = history.data.segments.find(s => s.id === segId);
  if (!seg) return { n: 0, longest: 0, dist: null };
  let n = 0, longest = 0, dist = 0, prev = null, runStart = null;
  for (const s of seg.samples) {
    if (s[0] < t0 || s[0] > t1) continue;
    if (prev) {
      const d = Math.hypot(s[1] - prev[1], s[3] - prev[3]);
      dist += d;
      if (d < 0.01) { if (runStart == null) runStart = prev[0]; }
      else if (runStart != null) { const dur = prev[0] - runStart; if (dur >= 3) { n++; longest = Math.max(longest, dur); } runStart = null; }
    }
    prev = s;
  }
  return { n, longest, dist };
}

export function buildLogs(history, years) {
  const ev = type => history.find(type);
  const td = ev('touchdown');
  const base = td ? td.endT : (history.data.events[0]?.endT ?? 0);
  const tl = wrenTimeline(years), total = tl.total;
  const mo = e => (e ? Math.max(0, Math.round((e.endT - base) / MONTH)) : null);
  const span = (a, b) => (a && b ? Math.max(0, Math.round((b.endT - a.endT) / MONTH)) : null);
  const ex = ev('exit_ranger'), fs = ev('first_step'), wf = ev('wreck_found'), rt = ev('recorder_taken');
  const ws = ev('wave_start') || ev('wave_seen'), wh = ev('wave_hit'), bd = ev('board'), es = ev('engines_start'), lo = ev('liftoff');
  const phase = m => (ex && m < mo(ex) ? 'inside' : wf && m < mo(wf) ? 'crossing' : rt && m < mo(rt) ? 'wreck' : (bd || wh) && m < mo(bd || wh) ? 'back' : null);
  const tone = m => (m < 72 ? 'early' : m < 216 ? 'middle' : 'late');
  const asleep = m => m > tl.sleepAt;
  const facts = [];
  const fact = (m, title, text, short) => { if (m != null && m <= total) facts.push({ month: m, title, text, short, kind: 'event' }); };

  if (td) fact(0, 'TOUCHDOWN.', `You are down${td.data?.speed != null ? `, ${td.data.speed.toFixed(1)} metres a second on contact` : ''}. The beacon still reads all good. I am starting the clock.`);
  if (ex) fact(mo(ex), 'THE HATCH.', `The rear hatch opened, ${ym(span(td, ex))} after touchdown. I watched the ramp go down one frame at a time.`, 'the hatch opened');
  if (fs) fact(mo(fs), 'FIRST STEP.', `You stepped into the water. From the hatch to the first step took ${ym(Math.max(1, span(ex, fs) ?? 1))}.`, 'you stepped into the water');
  if (wf) {
    const st = fs ? stops(history, wf.seg, fs.t, wf.t) : { n: 0 };
    const metres = st.dist ? `${Math.round(st.dist)} metres` : 'The crossing';
    const pauses = st.n ? ` You stopped ${st.n === 1 ? 'once' : `${num(st.n)} times`}. The longest stop was ${ym(st.longest)}.` : ' You never stopped.';
    fact(mo(wf), 'THE WRECK.', `You reached the wreck. ${metres} took you ${ym(span(fs, wf) ?? 0)}.${pauses}`, 'you reached the wreck');
  }
  if (rt) fact(mo(rt), 'STANDING STILL.', `You stood at the wreck for ${ym(Math.max(1, span(wf, rt) ?? 1))}. You took something from it. I hope it was worth it.`, 'you stood at the wreck');
  if (ws) { const eta = ws.data?.eta; fact(mo(ws), 'THE WATER.', `The sea started to drain toward the horizon.${eta ? ` By my clock it would reach you in ${ym(eta)}. By yours, ${Math.round(eta)} seconds.` : ''} Nothing I send gets there in time.`, 'the sea began to drain'); }
  if (bd && !wh) fact(mo(bd), 'ABOARD.', `You were back inside${bd.data?.eta ? ` ${ym(bd.data.eta)} before it arrived` : ''}. I let myself breathe.`, 'you got back inside before it arrived');
  if (wh) fact(mo(wh), 'THE WAVE.', `The wave reached you. I lost the beacon under it for ${ym(Math.max(1, span(wh, es) ?? 1))}. Then it came back.`, 'the wave reached you');
  if (lo) fact(mo(lo), 'ENGINES.', `Engine plume on the long lens. You are climbing.${lo.data?.margin > 0 ? ` The wave passed under you ${ym(Math.max(1, Math.round(lo.data.margin)))} later.` : ''}`, 'you lifted off');

  const out = [];
  for (const f of facts) if (!asleep(f.month)) out.push(f);
  const missed = facts.filter(f => asleep(f.month));
  const used = { inside: 0, crossing: 0, wreck: 0, back: 0, early: 0, middle: 0, late: 0 };
  const pick = k => { const q = POOL[k]?.[used[k]]; if (q) used[k]++; return q; };
  if (tl.sleepAt <= total) out.push({ month: tl.sleepAt, kind: 'pod', title: 'GOING UNDER.', text: `I am going into pod 02 in the cryo-lab for a while. I will wake every few years and read what the instruments saw. If you get back while I am under, its console shows my cycle count.` });
  tl.cycles.forEach((m, i) => {
    const seen = missed.filter(f => f.month <= m && !f.told);
    seen.forEach(f => { f.told = true; });
    const q = pick(tone(m)) || pick('late') || pick('middle');
    const recap = seen.length ? `From the recordings while I was under: ${seen.map(f => f.text).join(' ')}` : '';
    out.push({ month: m, kind: 'wake', title: `WAKE CYCLE ${i + 1}.`, text: [recap, q ? q[1] : ''].filter(Boolean).join(' ') || 'Nothing new on the instruments. Back under.' });
  });
  const leftover = missed.filter(f => !f.told);
  out.sort((a, b) => a.month - b.month);
  const awakeEnd = Math.min(total, tl.sleepAt);
  const times = [0, ...out.map(o => o.month), awakeEnd];
  const quiet = [];
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1], b = times[i];
    if (b - a < 18) continue;
    for (let m = a + Math.max(6, Math.round((b - a) / 3)); m < b - 4 && m < awakeEnd; m += Math.max(14, Math.round((b - a) / 2.5))) {
      const q = pick(phase(m)) || pick(tone(m));
      if (q) quiet.push({ month: m, kind: 'quiet', title: q[0], text: q[1] });
    }
  }
  const list = [...out, ...quiet].sort((a, b) => a.month - b.month);
  const dead = years >= 40;
  const recapLast = leftover.length ? ` While I slept the instruments recorded that ${leftover.map(f => f.short || f.title.toLowerCase()).join(', then ')}.` : '';
  list.push({
    month: total, kind: 'last',
    title: dead ? 'FOR WHEN YOU COME BACK.' : 'THE HORIZON.',
    text: dead
      ? `I am writing this knowing I will not be here when you read it. The pod will keep me cold, not alive.${recapLast} The data from Miller is useless without what is inside the horizon. There is not enough fuel left to take this ship home. The second Ranger is fuelled. Port B. Go and see what is there. ${num(Math.floor(years))} years. I counted every one.`
      : `The data from Miller is useless without what is inside the horizon.${recapLast} There is not enough fuel left to take this ship home. The second Ranger is fuelled and waiting on port B. I will be asleep when you read this. Go.`,
  });
  return list.map((e, i) => ({ index: i, month: e.month, kind: e.kind, t: stamp(e.month), title: e.title, text: e.text, read: false }));
}
