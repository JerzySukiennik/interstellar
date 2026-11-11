// Interstellar trailer stage: builds one shot (real game with the human bot, or a lookdev set-up with a directed camera), steps the engine at a fixed frame rate, fades inside the film pipeline and encodes frames with WebCodecs.
import * as THREE from 'three';
import { SHOTS } from './shots.js';
import { EDIT, shotInfo } from './edit.js';

const params = new URLSearchParams(location.search);
const id = params.get('shot');
const fps = +(params.get('fps') || EDIT.fps);
const T = window.__trailer = { id, ready: false, error: null, log: [] };
const yieldTask = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => q.shift()?.(); return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); }); })();
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

function fadeAt(t, dur, f) {
  const hold = f.hold ?? 0, fin = f.in ?? 0.35, fout = f.out ?? 0.35;
  const a = t < hold ? 1 : 1 - smooth((t - hold) / Math.max(1e-3, fin));
  const b = smooth((t - (dur - fout - (f.tail ?? 0))) / Math.max(1e-3, fout));
  return Math.max(a, b);
}

async function buildGame(shot) {
  const q = new URLSearchParams({ shot: id, auto: '1', human: '1', seed: String(shot.seed ?? 1), q: 'ultra' });
  if (shot.ch && shot.ch !== 'awakening') q.set('ch', shot.ch);
  history.replaceState(null, '', `${location.pathname}?${q}`);
  await import('../main.js');
  const t0 = performance.now();
  while (!window.__ready && !window.__error) { if (performance.now() - t0 > 180000) throw new Error('game not ready'); await new Promise(r => setTimeout(r, 100)); }
  if (window.__error) throw new Error(window.__error);
  const g = window.__game, engine = window.__engine;
  engine.stop();
  const c = { kind: 'game', g, engine, film: engine.film, THREE, shot };
  g.autoplay({ human: true, seed: shot.seed ?? 1 }).catch(e => { T.botError = String(e?.message || e); });
  await shot.setup?.(c);
  const render = engine.film.render;
  engine.film.render = () => {};
  const dt = 1 / fps, limit = shot.limit ?? 400;
  let n = 0, hit = null;
  while (true) {
    engine.step(dt);
    await yieldTask();
    n++;
    if (window.__error) throw new Error(window.__error);
    if (T.botError) throw new Error(T.botError);
    if (hit === null && shot.at(c)) { hit = n; T.log.push(`at after ${(n * dt).toFixed(1)} s game time (${g.director.currentId}/${g.director.beat})`); }
    if (hit !== null && (n - hit) * dt >= (shot.offset ?? 0)) break;
    if (n * dt > limit) throw new Error(`shot ${id}: condition not reached in ${limit} s (${g.director.currentId}/${g.director.beat})`);
  }
  engine.film.render = render;
  return c;
}

async function buildLook(shot) {
  const { Engine } = await import('../core/engine.js');
  const q = new URLSearchParams({ shot: id, m: shot.m, ...(shot.params || {}) });
  history.replaceState(null, '', `${location.pathname}?${q}`);
  const canvas = document.getElementById('c');
  const engine = new Engine({ canvas, quality: 'ultra' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.05, 20000);
  const controls = { target: new THREE.Vector3(), enabled: true, update() { camera.lookAt(this.target); } };
  engine.setView(scene, camera);
  window.__engine = engine;
  window.THREE = THREE;
  window.__cam = (px, py, pz, tx = 0, ty = 0, tz = 0, fov) => { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } controls.update(); };
  const mod = await import(`../lookdev/${shot.m}.js`);
  const api = await mod.default({ engine, THREE, scene, camera, controls, params: new URLSearchParams(q) });
  const c = { kind: 'look', engine, film: engine.film, THREE, scene, camera, controls, api, shot };
  await shot.setup?.(c);
  return c;
}

function applyFilm(c, t, dur, info) {
  const film = c.film, shot = c.shot;
  film._tweens = film._tweens.filter(tw => tw.k !== 'fade' && tw.k !== 'letterbox');
  const f = { ...(shot.fade || {}) };
  if (info?.first) { f.hold = f.hold ?? 0.45; f.in = f.in ?? 1.1; }
  if (info?.last) f.out = f.out ?? 1.1;
  film.fade = fadeAt(t, dur, f);
  film.fadeColor.setRGB(0, 0, 0);
  if (shot.letterbox != null) film.letterbox = shot.letterbox;
  if (shot.grade) for (const [k, v] of Object.entries(shot.grade)) { if (Array.isArray(v)) film[k].setRGB(...v); else film[k] = v; }
}

async function encoderFor(w, h, kbps) {
  const base = { width: w, height: h, bitrate: kbps * 1000, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality', avc: { format: 'annexb' } };
  const tries = [];
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) tries.push({ ...base, codec, hardwareAcceleration: hw });
  for (const cfg of tries) { try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return s.config; } catch (e) {} }
  throw new Error('no H.264 encoder');
}

T.run = async ({ encode = true, stills = [], kbps = EDIT.kbps, dur: durOver, quality = 0.92 } = {}) => {
  const c = T.c, shot = c.shot, engine = c.engine, info = shotInfo(id, fps);
  const frames = durOver ? Math.round(durOver * fps) : info ? info.frames : Math.round((shot.dur ?? 3) * fps);
  const dur = frames / fps, dt = 1 / fps;
  const canvas = engine.renderer.domElement;
  const pre = Math.round((shot.preroll ?? 1.2) * fps);
  for (let i = -pre; i < 0; i++) { const t = i / fps; shot.update?.(c, t, dt, dur); applyFilm(c, 0, dur, info); engine.step(dt); await yieldTask(); }
  let enc = null, err = null, cfg = null;
  const chunks = [];
  if (encode) {
    cfg = await encoderFor(canvas.width, canvas.height, kbps);
    enc = new VideoEncoder({ output: ch => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); chunks.push(b); }, error: e => { err = e; } });
    enc.configure(cfg);
  }
  const want = new Map(stills.map((s, k) => [Math.min(frames - 1, Math.max(0, Math.round(s * fps))), k]));
  const shots = [];
  const ms = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps, a = performance.now();
    shot.update?.(c, t, dt, dur);
    applyFilm(c, t, dur, info);
    engine.step(dt);
    if (want.has(i)) shots[want.get(i)] = { t, url: canvas.toDataURL('image/jpeg', quality) };
    if (enc) {
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
    }
    if (err) throw err;
    ms.push(performance.now() - a);
    await yieldTask();
  }
  if (enc) { await enc.flush(); enc.close(); }
  let size = 0;
  for (const b of chunks) size += b.length;
  const out = new Uint8Array(size);
  let o = 0;
  for (const b of chunks) { out.set(b, o); o += b.length; }
  T.out = out;
  ms.sort((x, y) => x - y);
  return { id, frames, dur, bytes: size, codec: cfg?.codec, hw: cfg?.hardwareAcceleration, stills: shots, msP50: +ms[ms.length >> 1].toFixed(1), msMax: +ms[ms.length - 1].toFixed(1), log: T.log, gl: (() => { const g = engine.renderer.getContext(), d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })() };
};

T.slice = (from, len) => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(new Blob([T.out.subarray(from, from + len)])); });

(async () => {
  try {
    const shot = SHOTS[id];
    if (!shot) throw new Error(`unknown shot ${id} (have ${Object.keys(SHOTS).join(', ')})`);
    T.c = shot.kind === 'game' ? await buildGame(shot) : await buildLook(shot);
    T.c.engine.stop();
    T.ready = true;
  } catch (e) {
    console.error('[trailer]', e);
    T.error = String(e?.stack || e);
  }
})();
