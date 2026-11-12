// Chapter 7, Tesseract: arrival out of the streaks, suit flight through the lattice of the player's own recorded memories (the co-op partner drifts through as a faint figure), the push at the anomaly instant by either pilot, the fold, the end card with credits, begin again. History space: tesseract world (metres).
import * as THREE from 'three';
import { FloatController } from '../core/controllers.js';
import { label } from '../core/prompts.js';
import * as G from './greybox.js';
import { createTesseract, applyFilm } from '../tesseract/world.js';

const ARRIVE = 8.5;
const PREV_KEY = 'interstellar.history.prev', KEY = 'interstellar.history.v1';
let S = null;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export default {
  id: 'tesseract',

  async load(ctx) {
    ctx.audio.preload?.('tesseract');
    const cam = G.camera(66, 0.05, 1600);
    const T = await createTesseract({ engine: ctx.engine, data: ctx.history.data, log: !!ctx.debug?.hud });
    const start = T.layout.start.position.clone();
    const look = T.layout.start.look.clone();
    const q = new THREE.Quaternion().setFromRotationMatrix(_m.lookAt(new THREE.Vector3(), look, new THREE.Vector3(0, 1, 0)));
    S = { T, cam, start, q, look, from: start.clone().addScaledVector(look, -95), pushed: false, done: false, ready: false, resT: 0, t: 0, again: 0 };
    cam.position.copy(start); cam.quaternion.copy(q); cam.updateMatrixWorld();
    T.update(cam, 0.016, { height: ctx.engine.height, frozen: true });
    await T.captureEnv(start);
    await ctx.net?.prepare(T.scene, cam, { faint: true });
    await T.compileAll(ctx.engine.renderer, cam);
    cam.position.copy(S.from); cam.updateMatrixWorld();
    T.setArrive(1); T.setReveal(0);
    T.update(cam, 0.016, { height: ctx.engine.height, frozen: true });
  },

  enter(ctx) {
    const { engine, film, history, interact, audio, ui } = ctx;
    engine.setBackground(null);
    engine.setView(S.T.scene, S.cam);
    applyFilm(film, 0, { exposure: 2.4, streak: 1, fadeColor: [0, 0, 0], letterbox: 0 });
    S.ctl = new FloatController({ camera: S.cam, interact, preset: 'suit', position: S.from, quaternion: S.q, collide: true, bounce: 0, radius: 0.45, colliders: S.T.colliders });
    S.ctl.move = false;
    S.ctl.collide = false;
    ctx.controller = S.ctl;
    interact.setRoots([S.T.scene]);
    if (S.T.lever) S.T.lever.userData.interact.onUse = () => { S.pushed = true; S.mine = true; };
    if (ctx.net) {
      ctx.net.stage({ scene: S.T.scene, toShared: p => p.sub(S.start), fromShared: p => p.add(S.start) });
      ctx.net.share('tesseract.push', () => S.pushed, () => { S.pushed = true; });
    }
    ui.reticle(false);
    const T = S.T, lattice = () => S?.ready && !S.pushed;
    const nearPush = () => T.state.nearest?.room === T.pushRoom && T.state.nearest.dist < 30;
    ui.teach('suit', null, { when: lattice, doing: 'float', enough: 3, delay: 1 });
    ui.teach('tesseract.goal', 'find the first memory   the cryo-lab and its dead hatch', { when: () => lattice() && !nearPush(), done: () => !!S.mine || T.state.pushReady, delay: 12 });
    ui.teach('tesseract.time', 'fly along the row   stop where your past self reaches the hatch', { when: () => lattice() && nearPush() && !T.state.pushReady, done: () => !!S.mine || T.state.pushReady, delay: 6 });
    ui.teach('tesseract.push', 'this is the moment   hold [E] on the lever to push', { when: () => lattice() && T.state.pushReady, done: () => !!S.mine });
    history.beginSegment('tesseract', { chapter: 'tesseract', space: 'tesseract', mode: 'float', frame: 'tesseract-world' });
    audio.music('m_lattice', { fade: 8, volume: 0.8 });
    S.res = audio.loop('lattice_resonance', { volume: 0, fade: 0 });
    ctx.director.script(s => run(ctx, s));
  },

  update(ctx, dt) {
    S.t += dt;
    const { input, history, audio, ui } = ctx;
    if (S.rail) {
      const u = Math.min(1, S.rail.t += dt / ARRIVE), e = 1 - Math.pow(1 - u, 2.6);
      S.ctl.position.lerpVectors(S.from, S.start, e);
      S.ctl.velocity.copy(S.look).multiplyScalar(2.6 * Math.pow(1 - u, 1.6) * 95 / ARRIVE * 0.5);
      S.ctl.look = u > 0.55;
      S.ctl.move = false;
    }
    S.ctl.update(dt, input);
    const st = S.T.update(S.cam, dt, { height: ctx.engine.height });
    if ((S.resT -= dt) <= 0) {
      S.resT = 0.1;
      const near = st.nearest ? Math.exp(-Math.pow(st.nearest.dist / 18, 2)) : 0;
      const scrub = Math.min(3, Math.abs(st.scrub || 0));
      S.res.set({ volume: (0.18 + 0.4 * near + 0.18 * Math.min(1, scrub)) * S.T.state.reveal * (1 - S.T.state.fold), rate: 0.86 + 0.16 * Math.min(2.4, scrub), fade: 0.25 });
    }
    if (st.roomChanged && st.nearest?.dist < 26 && !S.pushed) audio.sfx('resonance', { volume: 0.35, rate: 0.8 + 0.05 * (st.nearest.room.mem.index % 7), position: st.nearest.room.center });
    if (S.ended && !ctx.debug?.auto) {
      const held = input.down('KeyE') || input.down('Enter');
      S.again = held ? S.again + dt : Math.max(0, S.again - dt * 2);
      ui.progress(S.again > 0 ? Math.min(1, S.again / 1.6) : null);
      if (S.again >= 1.6 && !S.restarting) { S.restarting = true; beginAgain(ctx); }
    }
    history.sample(dt, S.ctl.position, S.ctl.quaternion);
  },

  exit(ctx) { S?.res?.stop(2); },

  dispose() { S?.card?.remove(); S?.T.dispose(); S = null; },

  async auto(ctx, bot) {
    await bot.until(() => S.ready, 40, 'arrival');
    const T = S.T;
    await bot.lookAround?.(3);
    const first = T.rooms.filter(r => r.mem === T.runs[T.runs.length - 1]?.mem).sort((a, b) => a.center.distanceTo(S.ctl.position) - b.center.distanceTo(S.ctl.position))[0];
    const P = T.layout.push;
    const L = T.leverWorld();
    const lane = T.pushStand ? T.pushStand.clone() : L.clone();
    const y = 0.2;
    if (first) {
      try {
        bot.sight?.(() => T.figureWorld(first), 10);
        const zf = first.center.z + 12;
        for (const dx of [-4, 4]) {
          await bot.moveTo([first.center.x + dx, y, zf], { tol: 0.7, vmax: 3, gain: 0.5, stopSpeed: 0.5, timeout: 30, stop: () => S.pushed });
          await bot.linger?.(1.5);
        }
        const pane = T.panes?.find(pn => pn.userData.run.mem === first.mem);
        if (pane) {
          const p = pane.position.clone().setZ(first.center.z + 12).add(_v.set(0, -0.8, 0));
          await bot.moveTo([p.x, p.y, p.z], { tol: 0.7, vmax: 3, gain: 0.5, stopSpeed: 0.5, timeout: 30, stop: () => S.pushed });
          bot.sight?.(pane, 4);
          await bot.linger?.(4);
        }
      } catch (e) { console.warn('[tesseract] bot wander skipped', e?.message || e); }
    }
    const route = [[lane.x, y, S.start.z], [lane.x, y, (P?.memory?.z ?? lane.z) + 6], [lane.x, lane.y, lane.z]];
    for (const [i, p] of route.entries()) {
      try { await bot.moveTo(p, { tol: i === route.length - 1 ? 0.45 : 0.8, vmax: 6, gain: 0.6, stopSpeed: i === route.length - 1 ? 0.45 : 1.2, timeout: 120, stop: () => S.pushed }); }
      catch (e) { if (!S.pushed && i === route.length - 1 && S.ctl.position.distanceTo(L) > 3.4) throw e; }
    }
    await bot.wait(0.6);
    await bot.shot('tesseract');
    await bot.until(() => S.T.state.pushReady || S.pushed, 20, 'push window');
    await bot.use('push', { timeout: 20, unless: () => S.pushed });
  },
};

async function run(ctx, s) {
  const { history, audio, film, ui, state, input } = ctx;
  const T = S.T;
  s.beat('arrival');
  S.rail = { t: 0 };
  film.to({ streak: 0, exposure: 1.0 }, ARRIVE * 0.8);
  await s.tween(ARRIVE, u => {
    T.setArrive(Math.pow(1 - u, 1.6));
    T.setReveal(Math.max(0, (u - 0.5) / 0.5));
  }, false);
  T.setArrive(0); T.setReveal(1);
  S.rail = null;
  S.ctl.look = true; S.ctl.move = true; S.ctl.collide = true;
  ui.reticle(true);
  S.ready = true;
  s.beat('lattice');
  await s.until(() => S.pushed);
  T.startPush();
  const P = T.layout.push;
  const pr = T.pushRoom;
  history.event('push', { segment: P.memory?.track[0].id ?? null, ghostT: Math.round(pr.T * 100) / 100, anomalyT: Math.round(P.t * 100) / 100, error: Math.round((pr.T - P.t) * 100) / 100 }, S.ctl.position);
  history.snapshot('push');
  audio.sfx('push', { volume: 1, position: T.leverWorld() });
  audio.music('m_closing', { fade: 3, volume: 0.9 });
  s.beat('push');
  S.ctl.move = false;
  S.ctl.velocity.multiplyScalar(0.2);
  ui.reticle(false);
  await s.wait(Math.min(14, Math.max(4, (T.pushCross ?? P.t + 7) - P.t + 1.5)));
  s.beat('fold');
  film.to({ fadeColor: new THREE.Color(1.0, 0.95, 0.86) }, 0);
  await s.tween(6, u => { T.setFold(u * u * (3 - 2 * u)); film.exposure = 1 + Math.pow(u, 3) * 5; });
  await s.fade(1, 1.6);
  s.beat('end');
  state.ended = true;
  S.ended = true;
  ctx.director.emit?.('ended', {});
  film.to({ fadeColor: new THREE.Color(0, 0, 0) }, 3);
  await s.wait(3.2);
  S.card = showCard(await cardRows(ctx), ctx.debug?.auto);
  history.save(state);
  await s.wait(ctx.debug?.auto ? 2 : 7);
  S.done = true;
  ctx.director.next();
  void input;
}

function beginAgain(ctx) {
  try {
    ctx.history.save(ctx.state);
    const cur = localStorage.getItem(KEY);
    if (cur) localStorage.setItem(PREV_KEY, cur);
  } catch {}
  ctx.history.clear();
  const p = new URLSearchParams(location.search);
  p.delete('ch');
  location.href = location.pathname + (p.toString() ? '?' + p : '');
}

const months = m => `${m} ${m === 1 ? 'month' : 'months'}`;
function yearsMonths(y) {
  const total = Math.round(y * 12), Y = Math.floor(total / 12), M = total % 12;
  return Y ? `${Y} ${Y === 1 ? 'year' : 'years'}${M ? `, ${months(M)}` : ''}` : months(M);
}
function minSec(s) { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`; }

async function cardRows(ctx) {
  const { history, clock, state } = ctx;
  const n = S.T.layout.numbers;
  const surface = state.surfaceSeconds || n.surfaceSeconds || 0;
  const years = state.years || n.years || clock.years();
  const rows = [['on the surface', minSec(surface)], ['the Endurance waited', yearsMonths(years)], ['waded', `${Math.round(n.waded)} m`]];
  if (n.waveHit) rows.push(['the wave', 'took the Ranger']);
  else if (n.margin != null) rows.push(['the wave', `passed ${Math.max(1, Math.round(n.margin))} s after lift-off`]);
  if (n.wreckMonths != null) rows.push(['at the wreck', `${months(n.wreckMonths)} of ship time`]);
  if (n.firstUnread != null) {
    let date = `message ${n.firstUnread + 1} of ${n.logsTotal}`;
    try {
      const m = await import('./shared/logs.js');
      const log = m.buildLogs?.(history, years)?.[n.firstUnread];
      if (log && Number.isFinite(log.month)) date = `Wren, year ${Math.floor(log.month / 12)}, month ${Math.round(log.month) % 12 + 1}`;
    } catch {}
    rows.push(['left unread', date]);
  }
  return rows;
}

const CARD_CSS = `
#tess-end { position: fixed; inset: 0; z-index: 9; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; color: rgba(255,255,255,0.9); font-family: "Helvetica Neue", "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif; font-weight: 400; -webkit-font-smoothing: antialiased; opacity: 0; transition: opacity 2.4s ease; }
#tess-end.on { opacity: 1; }
html.ui-menu #tess-end { opacity: 0; transition: opacity 0.25s ease; }
#tess-end .rows { display: grid; grid-template-columns: auto auto; column-gap: 2.4em; row-gap: 0.95em; font-size: calc(11px * var(--k, 1.8)); letter-spacing: 0.16em; }
#tess-end .l { text-align: right; text-transform: uppercase; font-size: calc(9.5px * var(--k, 1.8)); letter-spacing: 0.32em; color: rgba(255,255,255,0.56); align-self: center; }
#tess-end .v { text-align: left; color: rgba(255,255,255,0.96); }
#tess-end .credits { margin-top: 3.5em; max-width: min(94vw, 64em); text-align: center; font-size: calc(7.5px * var(--k, 1.8)); line-height: 1.7; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); }
#tess-end .again { margin-top: 3em; font-size: calc(10px * var(--k, 1.8)); letter-spacing: 0.4em; text-transform: uppercase; color: rgba(255,255,255,0.8); }
#tess-end .again span { margin-right: 1.2em; color: rgba(255,255,255,0.6); }
#tess-end .again b { display: inline-block; font-weight: 400; color: rgba(255,255,255,0.97); margin-left: 0.6em; padding: 0.2em 0.4em 0.2em 0.68em; border: 1px solid rgba(255,255,255,0.45); border-radius: 2px; line-height: 1.2; letter-spacing: 0.28em; }
#tess-end .again .pad, html.ui-pad #tess-end .again .keys { display: none; }
html.ui-pad #tess-end .again .pad { display: inline; }
`;

function showCard(rows, auto) {
  let credits = [];
  const el = document.createElement('div');
  el.id = 'tess-end';
  const style = document.createElement('style');
  style.textContent = CARD_CSS;
  document.head.appendChild(style);
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const render = () => {
    el.innerHTML = `<div class="rows">${rows.map(([l, v]) => `<div class="l">${esc(l)}</div><div class="v">${esc(v)}</div>`).join('')}</div>`
      + `<div class="credits">${credits.slice(0, Math.max(1, credits.indexOf(''))).map(esc).join('<br>')}</div>`
      + (auto ? '' : `<div class="again"><span class="keys">hold<b>${esc(label('E', 'keys'))}</b></span><span class="pad">hold<b>${esc(label('E', 'pad'))}</b></span>begin again</div>`);
  };
  render();
  document.body.appendChild(el);
  import('../core/credits.js').then(m => { credits = m.audioCreditLines || []; render(); }).catch(() => {});
  setTimeout(() => el.classList?.add('on'), 50);
  el.style.cssText = '';
  const remove = el.remove?.bind(el) || (() => {});
  return { remove: () => { remove(); style.remove?.(); } };
}
