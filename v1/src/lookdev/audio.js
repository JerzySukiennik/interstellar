// Lookdev audio: buttons to audition every manifest id, the engine helper with a throttle slider, music offsets, preload groups, tick sidechain, muffle and duck.
import audio from '../core/audio.js';

export default async ({ THREE, camera }) => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:16px;font:12px/1.4 ui-monospace,Menlo,monospace;color:#cfe;background:#05080a;z-index:5';
  document.body.appendChild(box);
  const all = await (await fetch(new URL('../../assets/audio/manifest.json', import.meta.url))).json();
  const man = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('_')));
  const status = document.createElement('div');
  status.textContent = 'click anywhere to start audio';
  box.appendChild(status);
  const loops = new Map();
  const results = {};
  const btn = (label, fn, parent) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px;padding:4px 8px;background:#0d1a1f;color:#cfe;border:1px solid #2a4650;font:inherit;cursor:pointer';
    b.onclick = fn;
    parent.appendChild(b);
    return b;
  };
  const row = title => { const d = document.createElement('div'); d.style.margin = '10px 0'; d.innerHTML = `<div style="opacity:.6;margin-bottom:4px">${title}</div>`; box.appendChild(d); return d; };
  const toggleLoop = id => { if (loops.has(id)) { loops.get(id).stop(1); loops.delete(id); } else loops.set(id, audio.loop(id, { fade: 1 })); };
  const start = async () => {
    await audio.init();
    audio.listener(camera);
    status.textContent = 'decoding...';
    const t0 = performance.now();
    await audio.load(Object.keys(man).filter(id => man[id].type !== 'music'));
    for (const [id, e] of Object.entries(man)) {
      if (e.type === 'music') { results[id] = 'stream'; continue; }
      results[id] = (e.variants || [e.file]).every(f => audio.buffers.get(f)) ? 'ok' : 'FAILED';
    }
    window.__audioResults = results;
    const bad = Object.entries(results).filter(([, v]) => v === 'FAILED');
    status.textContent = `decoded ${Object.keys(results).length} ids in ${Math.round(performance.now() - t0)} ms, failures: ${bad.length ? bad.map(b => b[0]).join(', ') : 'none'}`;
  };
  window.addEventListener('pointerdown', start, { once: true });

  const eng = row('main engine: audio.engine("main_engine"), throttle drives volume, rate and low-pass');
  let throttle = 0.8;
  const engine = audio.engine('main_engine');
  btn('ignite', () => engine.ignite(throttle), eng);
  btn('shutdown', () => engine.shutdown(), eng);
  const sl = document.createElement('div');
  sl.innerHTML = `<label>throttle <input type="range" min="0" max="100" value="${throttle * 100}" style="width:260px;vertical-align:middle"> <span>${Math.round(throttle * 100)}%</span></label>`;
  eng.appendChild(sl);
  const range = sl.querySelector('input'), val = sl.querySelector('span');
  range.oninput = () => { throttle = range.value / 100; val.textContent = `${range.value}%`; engine.set(throttle); };
  btn('ranger_engines', () => toggleLoop('ranger_engines'), eng);
  btn('cockpit room tone (reference)', () => toggleLoop('cockpit_tone'), eng);

  const groups = { music: row('music (click: from start, shift-click: from first landmark)'), loop: row('loops (toggle)'), sfx: row('effects') };
  for (const [id, e] of Object.entries(man)) {
    if (id.startsWith('main_engine') || id === 'ranger_engines') continue;
    if (e.type === 'music') {
      const b = btn(id, ev => {
        const lm = e.landmarks || {};
        const first = Object.values(lm).map(v => (Array.isArray(v) ? v[0] : v)).filter(v => v > 0).sort((a, c) => a - c)[0] || 0;
        audio.music(id, { fade: 2, from: ev.shiftKey ? Math.max(0, first - 8) : 0 });
      }, groups.music);
      b.title = JSON.stringify(e.landmarks || {});
    } else if (e.type === 'loop') btn(id, () => toggleLoop(id), groups.loop);
    else btn(id, () => audio.sfx(id, { position: new THREE.Vector3((Math.random() - 0.5) * 8, 0, -3) }), groups.sfx);
  }
  btn('music off', () => audio.music(null, { fade: 2 }), groups.music);
  const ctl = row('bus');
  for (const a of [0, 0.5, 1]) btn(`muffle ${a}`, () => audio.muffle(a, 1), ctl);
  for (const a of [0, 0.7]) btn(`duck ${a}`, () => audio.duck(a, 1), ctl);
  btn('tick, beds -9 dB', () => audio.sfx('tick', { duckBeds: 9, hold: 0.2 }), ctl);
  for (const k of ['sub', 'rumble', 'whoosh']) {
    let h = null;
    btn(`synth ${k}`, () => { if (h) { h.stop(1); h = null; } else h = audio.synth(k, { volume: 0.5 }); }, ctl);
  }
  return { audio, results, engine };
};
