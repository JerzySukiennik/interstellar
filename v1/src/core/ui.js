// Interstellar UI: reticle, interaction hint with hold progress, one bottom line for guides and control lessons, target marker, subtitles, cards, loading line with a compositor-driven progress bar, menu layer and debug HUD as thin DOM type over the canvas, labels following the active device.
import { translate, translateLoose, onChange, device, LESSONS } from './prompts.js';

export const LOAD_KEY = 'interstellar.load.v1';
export const LOAD_DEFAULT = { boot: 20, begin: 12, new: 24, chapter: 18 };
export const SCALE = { keys: 1.5, pad: 1.8, markPad: 1.6 };
export const INK = { ink: 0.48, inkOff: 0.41, mid: 0.26, midOff: 0.2, dwell: 0.35 };

export const CSS = `
#ui { --k: 1; --kb: 1; --mk: 1; --bar: 0px; --line: 6vh; --halo: 0 0 1px rgba(0,0,0,0.4), 0 0 calc(4px * var(--k)) rgba(0,0,0,0.42); position: fixed; inset: 0; pointer-events: none; z-index: 10; color: rgba(255,255,255,0.8); font-family: "Helvetica Neue", "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif; font-weight: 400; -webkit-font-smoothing: antialiased; text-shadow: var(--halo); user-select: none; -webkit-user-select: none; }
#ui .f { transition: opacity 0.5s ease; opacity: 0; }
#ui .f.on { opacity: 1; }
#ui.menu .g, #ui.menu #ui-load { opacity: 0 !important; transition: opacity 0.25s ease; }
#ui .cap { display: inline-block; font-weight: 400; font-style: normal; color: rgba(255,255,255,0.97); margin: 0 0.6em; padding: 0.2em 0.4em 0.2em 0.68em; border: 1px solid rgba(255,255,255,0.45); border-radius: 2px; line-height: 1.2; letter-spacing: 0.28em; white-space: nowrap; text-transform: uppercase; }
#ui .mid, #ui-mark.mid span { color: rgba(255,255,255,0.99); text-shadow: 0 0 2px rgba(0,0,0,0.75), 0 0 calc(3px * var(--k)) rgba(0,0,0,0.6), 0 0 calc(10px * var(--k)) rgba(0,0,0,0.4); }
#ui .mid .cap { border-color: rgba(255,255,255,0.88); box-shadow: 0 0 calc(4px * var(--k)) rgba(0,0,0,0.35), inset 0 0 calc(4px * var(--k)) rgba(0,0,0,0.25); }
#ui .ink, #ui-mark.ink span { color: rgba(8,10,10,0.92); text-shadow: 0 0 1px rgba(255,255,255,0.35), 0 0 calc(4px * var(--k)) rgba(255,255,255,0.45); }
#ui .ink .cap { color: rgba(6,8,8,0.96); border-color: rgba(6,8,8,0.55); }
#ui .gap { display: inline-block; width: 2em; }
#ui-hint, #ui-guide, #ui-sub, #ui-mark span { transition: opacity 0.5s ease, color 0.6s ease, text-shadow 0.6s ease; }
#ui .cap:first-child { margin-left: 0; }
#ui-reticle { position: absolute; left: 50%; top: 50%; width: calc(3px * var(--mk)); height: calc(3px * var(--mk)); margin: calc(-1.5px * var(--mk)) 0 0 calc(-1.5px * var(--mk)); border-radius: 50%; background: rgba(255,255,255,0.66); box-shadow: 0 0 0 1px rgba(0,0,0,0.2); transition: opacity 0.4s ease, transform 0.25s ease, background 0.25s ease; }
#ui-reticle.focus { transform: scale(1.8); background: rgba(255,255,255,0.94); }
#ui-reticle.ink { background: rgba(10,12,12,0.74); box-shadow: 0 0 0 1px rgba(255,255,255,0.28); }
#ui-reticle.ink.focus { background: rgba(10,12,12,0.92); }
#ui-bar.ink { background: rgba(10,12,12,0.16); box-shadow: none; }
#ui-bar.ink i { background: rgba(10,12,12,0.82); }
#ui #ui-mark.mid i { border-color: rgba(255,255,255,1); filter: drop-shadow(0 0 1px rgba(0,0,0,0.8)) drop-shadow(0 0 5px rgba(0,0,0,0.45)); }
#ui #ui-mark.ink i { border-color: rgba(10,12,12,0.88); filter: drop-shadow(0 0 1px rgba(255,255,255,0.5)) drop-shadow(0 0 4px rgba(255,255,255,0.35)); }
#ui-hint { position: absolute; left: 6%; right: 6%; bottom: calc(var(--bar) + 6.5vh); text-align: center; font-size: calc(11.5px * var(--k)); letter-spacing: 0.26em; text-transform: uppercase; line-height: 2; color: rgba(255,255,255,0.86); }
#ui-hint .hold { margin-right: 0.2em; opacity: 0.78; }
#ui-bar { position: absolute; left: 50%; bottom: calc(var(--bar) + 6.5vh - 5px * var(--k)); width: calc(56px * var(--k)); height: 1px; margin-left: calc(-28px * var(--k)); background: rgba(255,255,255,0.18); box-shadow: 0 0 calc(3px * var(--k)) rgba(0,0,0,0.4); }
#ui.pad #ui-bar, #ui.pad #ui-load i { height: 2px; }
#ui-bar i { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: 0 50%; background: rgba(255,255,255,0.9); }
#ui-sub { position: absolute; left: 12%; right: 12%; bottom: calc(var(--bar) + 13vh); text-align: center; font-size: calc(13.5px * var(--k)); letter-spacing: 0.08em; line-height: 1.5; color: rgba(255,255,255,0.92); transition: opacity 0.9s ease, color 0.6s ease, text-shadow 0.6s ease; }
#ui-card { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-size: calc(11px * var(--k)); letter-spacing: 0.4em; text-transform: uppercase; line-height: 2.6; transition: opacity 1.4s ease; }
#ui-center { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-size: calc(11px * var(--k)); letter-spacing: 0.46em; transition: opacity 1.2s ease; }
#ui-center small { display: block; margin-top: 2.2em; font-size: calc(9.5px * var(--k)); letter-spacing: 0.36em; opacity: 0.6; }
#ui-guide { position: absolute; left: 5%; right: 5%; bottom: var(--line); transform: translateY(50%); text-align: center; font-size: calc(12px * var(--k)); letter-spacing: 0.24em; text-transform: uppercase; line-height: 2; color: rgba(255,255,255,0.84); }
#ui-mark { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: opacity 0.5s ease; will-change: transform; }
#ui-mark i { position: absolute; left: calc(-9px * var(--mk)); top: calc(-9px * var(--mk)); width: calc(18px * var(--mk)); height: calc(18px * var(--mk)); box-sizing: border-box; border: 1px solid rgba(255,255,255,0.88); transform: rotate(45deg); filter: drop-shadow(0 0 1px rgba(0,0,0,0.6)) drop-shadow(0 0 4px rgba(0,0,0,0.35)); }
#ui.pad #ui-mark i { border-width: 2px; }
#ui-mark.off i { left: calc(-7px * var(--mk)); top: calc(-7px * var(--mk)); width: calc(14px * var(--mk)); height: calc(14px * var(--mk)); border-width: 0 2px 2px 0; border-color: rgba(255,255,255,0.96); }
#ui.pad #ui-mark.off i { border-width: 0 3px 3px 0; }
#ui-mark span { position: absolute; left: calc(18px * var(--mk)); top: -0.9em; white-space: nowrap; font-size: calc(10.5px * var(--k)); letter-spacing: 0.26em; text-transform: uppercase; line-height: 1.5; color: rgba(255,255,255,0.92); }
#ui-mark span small { display: block; font-size: 1em; letter-spacing: 0.18em; opacity: 0.8; }
#ui-mark.left span { left: auto; right: calc(18px * var(--mk)); text-align: right; }
#ui-load { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; font-size: calc(10px * var(--k)); letter-spacing: 0.56em; text-indent: 0.56em; text-transform: uppercase; color: rgba(255,255,255,0.7); transition: opacity 0.4s ease, color 0.6s ease; }
#ui-load i { display: block; width: calc(120px * var(--k)); height: 1px; margin-top: calc(14px * var(--k)); background: rgba(255,255,255,0.16); overflow: hidden; }
#ui-load b { display: block; width: 100%; height: 100%; background: rgba(255,255,255,0.92); transform: scaleX(0); transform-origin: 0 50%; will-change: transform; transition: transform 0.22s cubic-bezier(0.2, 0.7, 0.3, 1); }
#ui-load.run b { animation: ui-load var(--load-t, 72s) linear forwards; }
#ui-load.ink i { background: rgba(10,12,12,0.16); }
#ui-load.ink b { background: rgba(10,12,12,0.85); }
@keyframes ui-load { 0% { transform: scaleX(0); animation-timing-function: cubic-bezier(0.3, 0.4, 0.5, 1); } 25% { transform: scaleX(0.9); animation-timing-function: cubic-bezier(0.2, 0.6, 0.4, 1); } 100% { transform: scaleX(0.985); } }
#ui-hud { position: absolute; left: 10px; top: 8px; font: 10.5px/1.45 ui-monospace, Menlo, monospace; color: #9fb; opacity: 0.75; white-space: pre; letter-spacing: 0; text-shadow: none; }
#ui-menu { position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.3s ease, visibility 0s linear 0.3s; background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.7), rgba(0,0,0,0.84)); color: rgba(255,255,255,0.92); cursor: default; }
#ui-menu.on { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 0.3s ease; }
#ui-menu.bare { background: none; }
#ui-menu .body { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; }
#ui-menu .title { font-size: calc(9.5px * var(--k)); letter-spacing: 0.5em; text-indent: 0.5em; text-transform: uppercase; color: rgba(255,255,255,0.6); margin-bottom: calc(24px * var(--k)); }
#ui-menu .text { max-width: 40em; text-align: center; font-size: calc(11px * var(--k)); letter-spacing: 0.1em; line-height: 1.7; color: rgba(255,255,255,0.8); margin: calc(-10px * var(--k)) 0 calc(24px * var(--k)); }
#ui-menu .it { position: relative; font-size: calc(12.5px * var(--k)); letter-spacing: 0.38em; text-indent: 0.38em; padding: calc(8px * var(--k)) calc(14px * var(--k)); color: rgba(255,255,255,0.52); cursor: pointer; transition: color 0.2s ease; white-space: nowrap; }
#ui-menu .it.sel { color: rgba(255,255,255,1); }
#ui-menu .it::after { content: ''; position: absolute; left: 50%; bottom: calc(3px * var(--k)); width: 0; height: 1px; background: rgba(255,255,255,0.8); transition: width 0.25s ease, margin 0.25s ease; }
#ui-menu .it.sel::after { width: 2.4em; margin-left: -1.2em; }
#ui.pad #ui-menu .it::after { height: 2px; }
#ui-menu .it.dis { color: rgba(255,255,255,0.24); cursor: default; }
#ui-menu .row { display: grid; grid-template-columns: 1fr 1fr; column-gap: calc(30px * var(--k)); align-items: center; width: min(92vw, calc(600px * var(--k))); padding: calc(6px * var(--k)) 0; cursor: pointer; color: rgba(255,255,255,0.52); transition: color 0.2s ease; }
#ui-menu .row.sel { color: rgba(255,255,255,1); }
#ui-menu .row .l { text-align: right; font-size: calc(11px * var(--k)); letter-spacing: 0.28em; }
#ui-menu .row .v { text-align: left; font-size: calc(11px * var(--k)); letter-spacing: 0.22em; display: flex; align-items: center; gap: calc(14px * var(--k)); white-space: nowrap; }
#ui-menu .row .o { opacity: 0.42; padding: calc(4px * var(--k)) 0; cursor: pointer; }
#ui-menu .row .o.on { opacity: 1; text-decoration: underline; text-underline-offset: 0.5em; text-decoration-thickness: 1px; }
#ui-menu .ticks { display: inline-flex; align-items: center; }
#ui-menu .ticks i { display: block; width: 1px; height: calc(11px * var(--k)); padding: calc(5px * var(--k)) calc(3.5px * var(--k)); background-color: currentColor; background-clip: content-box; opacity: 0.3; cursor: pointer; }
#ui.pad #ui-menu .ticks i { width: 2px; }
#ui-menu .ticks i.on { opacity: 1; }
#ui-menu .num { min-width: 3.4em; opacity: 0.85; }
#ui-menu .lobby { max-width: 44em; text-align: center; font-size: calc(11px * var(--k)); letter-spacing: 0.1em; line-height: 1.9; color: rgba(255,255,255,0.8); margin: calc(-10px * var(--k)) 0 calc(24px * var(--k)); white-space: pre-wrap; }
#ui-menu .lobby .addr { font-size: calc(16px * var(--k)); letter-spacing: 0.06em; color: rgba(255,255,255,1); margin: calc(4px * var(--k)) 0; user-select: text; }
#ui-menu .lobby .now { margin-top: calc(14px * var(--k)); color: rgba(255,255,255,0.95); }
#ui-menu .note { min-height: calc(18px * var(--k)); margin-top: calc(14px * var(--k)); font-size: calc(9.5px * var(--k)); letter-spacing: 0.2em; color: rgba(255,255,255,0.62); text-align: center; }
#ui-menu .tabs { display: flex; gap: calc(26px * var(--k)); margin-bottom: calc(18px * var(--k)); }
#ui-menu .tab { font-size: calc(9.5px * var(--k)); letter-spacing: 0.32em; text-transform: uppercase; color: rgba(255,255,255,0.46); cursor: pointer; padding: calc(4px * var(--k)) 0; white-space: nowrap; }
#ui-menu .tab.on { color: rgba(255,255,255,0.98); text-decoration: underline; text-underline-offset: 0.6em; text-decoration-thickness: 1px; }
#ui-menu .list { width: min(90vw, calc(400px * var(--k))); min-height: calc(208px * var(--k)); margin-bottom: calc(8px * var(--k)); }
#ui-menu .cr { display: flex; justify-content: space-between; align-items: center; gap: calc(22px * var(--k)); padding: calc(2.5px * var(--k)) 0; font-size: calc(11px * var(--k)); letter-spacing: 0.1em; color: rgba(255,255,255,0.8); }
#ui-menu .cr .b { font-size: calc(10px * var(--k)); text-transform: uppercase; letter-spacing: 0.2em; color: rgba(255,255,255,0.96); white-space: nowrap; }
#ui-menu .cr .cap { margin: 0 0 0 0.45em; padding: 0.16em 0.36em 0.16em 0.6em; }
#ui-menu .cg { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: calc(20px * var(--k)); row-gap: calc(11px * var(--k)); width: min(92vw, calc(520px * var(--k))); margin-bottom: calc(12px * var(--k)); }
#ui-menu .cg .l { text-align: right; text-transform: uppercase; font-size: calc(9px * var(--k)); letter-spacing: 0.32em; color: rgba(255,255,255,0.56); padding-top: 0.5em; white-space: nowrap; }
#ui-menu .cg .t { font-size: calc(10.5px * var(--k)); letter-spacing: 0.05em; line-height: 1.55; color: rgba(255,255,255,0.88); }
#ui-menu .cg .t.now { color: rgba(255,255,255,1); letter-spacing: 0.12em; }
#ui-menu .cg .st { display: flex; }
#ui-menu .cg .st .n { flex: none; width: 1.7em; color: rgba(255,255,255,0.56); }
#ui-menu .cg .cap { margin: 0 0.25em; padding: 0.08em 0.34em 0.08em 0.5em; letter-spacing: 0.16em; font-size: 0.86em; }
#ui-menu .foot { position: absolute; left: 4%; right: 4%; bottom: var(--line); transform: translateY(50%); text-align: center; font-size: calc(9.5px * var(--k)); letter-spacing: 0.26em; text-transform: uppercase; color: rgba(255,255,255,0.66); line-height: 2.2; }
#ui-menu .foot .gap { display: inline-block; width: 2.2em; }
`;

export function caps(html) { return String(html).replace(/\[([^\]]+)\]/g, '<b class="cap">$1</b>').replace(/ {2,}/g, '<span class="gap"></span>'); }

export function escape(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }

const wall = () => globalThis.performance?.now?.() ?? Date.now();

function safeStorage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }

export class UI {
  constructor(root = document.body, { storage = safeStorage() } = {}) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const el = this.el = document.createElement('div');
    el.id = 'ui';
    el.innerHTML = '<div id="ui-reticle" class="f g"></div><div id="ui-hint" class="f g"></div><div id="ui-bar" class="f g"><i></i></div><div id="ui-sub" class="f g"></div><div id="ui-card" class="f g"></div><div id="ui-center" class="f"></div><div id="ui-guide" class="f g"></div><div id="ui-mark" class="f g"><i></i><span></span></div><div id="ui-load" class="f"><span>loading</span><i><b></b></i></div><div id="ui-menu"></div><div id="ui-hud"></div>';
    root.appendChild(el);
    this._r = el.querySelector('#ui-reticle');
    this._h = el.querySelector('#ui-hint');
    this._b = el.querySelector('#ui-bar');
    this._bi = this._b.firstChild;
    this._s = el.querySelector('#ui-sub');
    this._c = el.querySelector('#ui-card');
    this._m = el.querySelector('#ui-center');
    this._hud = el.querySelector('#ui-hud');
    this._g = el.querySelector('#ui-guide');
    this._k = el.querySelector('#ui-mark');
    this._ki = this._k.querySelector('i');
    this._ks = this._k.querySelector('span');
    this._l = el.querySelector('#ui-load');
    this._lf = this._l.querySelector('b');
    this.menuEl = el.querySelector('#ui-menu');
    this._root = typeof document !== 'undefined' ? document.documentElement || null : null;
    this._guideText = null;
    this._lineText = null;
    this._lineDev = null;
    this._markText = null;
    this._hintText = null;
    this._hintKey = 'E';
    this._hintHold = false;
    this._timers = {};
    this._lessons = [];
    this._lesson = null;
    this._menu = false;
    this._guidance = 'full';
    this._ink = {};
    this._inkWait = {};
    this._bars = false;
    this._W = 1600;
    this._H = 900;
    this._barF = 0;
    this._loadKey = null;
    this._loadAt = 0;
    this._loadTimer = null;
    this.storage = storage;
    this.learned = new Set();
    this.strict = false;
    this.early = new Set();
    this.faults = new Map();
    this.probe = null;
    this.input = null;
    this.film = null;
    this.state = { hint: null, hintHold: false, subtitle: null, card: null, center: null, reticle: false, guide: null, lesson: null, line: null, mark: null, loading: false, loadExpect: 0, menu: false, ink: {} };
    onChange(() => this._device());
    if (typeof addEventListener === 'function') addEventListener('resize', () => this._scale());
    this._scale();
  }

  get guidance() { return this._guidance; }

  set guidance(v) { this._guidance = v === 'reduced' ? 'reduced' : 'full'; this._line(); }

  _device() {
    this._scale();
    const h = this._hintText, k = this._hintKey, o = { hold: this._hintHold };
    this._hintText = undefined;
    if (h) this.hint(h, k, o);
    this._lineDev = null;
    this._line();
  }

  _scale() {
    const H = this._H = this.el.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 900);
    const W = this._W = this.el.clientWidth || (typeof innerWidth === 'number' ? innerWidth : 1600);
    const pad = device() === 'pad';
    const kb = Math.min(2.4, Math.max(0.9, H / 900));
    const k = kb * (pad ? SCALE.pad : SCALE.keys);
    this._barF = Math.max(0, (1 - (W / H) / 2.39) / 2);
    const bar = this._barF * H;
    const vars = { '--k': k.toFixed(3), '--kb': kb.toFixed(3), '--mk': (kb * (pad ? SCALE.markPad : 1)).toFixed(3), '--bar': `${bar.toFixed(1)}px`, '--line': `${Math.max(bar / 2, H * 0.06).toFixed(1)}px` };
    for (const st of [this.el.style, this._root?.style]) for (const [name, v] of Object.entries(vars)) st?.setProperty?.(name, v);
    this.el.classList.toggle('pad', pad);
    this._root?.classList?.toggle?.('ui-pad', pad);
    this.scale = k;
  }

  _show(node, on) { node.classList.toggle('on', !!on); }

  _timed(key, node, seconds, done) {
    const old = this._timers[key];
    delete this._timers[key];
    old?.done?.();
    if (seconds > 0) this._timers[key] = { t: seconds, node, done };
    else done?.();
  }

  reticle(visible) { this.state.reticle = !!visible; this._show(this._r, visible); }

  focus(on) { this._r.classList.toggle('focus', !!on); }

  hint(text, key = 'E', opts) {
    const cur = text && !opts ? this.probe?.() : null;
    const hold = !!(opts?.hold ?? (cur && cur.label === text && cur.hold > 0));
    if (text === this._hintText && key === this._hintKey && hold === this._hintHold) return;
    this._hintText = text;
    this._hintKey = key;
    this._hintHold = hold && !!text;
    this.state.hint = text || null;
    this.state.hintHold = this._hintHold;
    if (text) {
      const k = key ? translate(`[${key}]`) : '';
      this._h.innerHTML = (this._hintHold ? '<span class="hold">hold</span>' : '') + caps(escape(k)) + caps(escape(translate(translateLoose(text))));
    }
    this._show(this._h, !!text);
    this.focus(!!text);
    if (!text) this.progress(null);
    this._line();
  }

  progress(v) {
    if (v == null) { this._show(this._b, false); return; }
    this._show(this._b, true);
    this._bi.style.transform = `scaleX(${Math.min(1, Math.max(0, v)).toFixed(3)})`;
  }

  subtitle(text, seconds = 4) {
    this.state.subtitle = text || null;
    if (text) this._s.textContent = text;
    this._show(this._s, !!text);
    this._timed('subtitle', this._s, text ? seconds : 0);
  }

  card(lines, seconds = 5) {
    const arr = lines == null ? null : Array.isArray(lines) ? lines : [lines];
    this.state.card = arr;
    if (arr) this._c.innerHTML = arr.map(escape).join('<br>');
    this._show(this._c, !!arr);
    return new Promise(r => this._timed('card', this._c, arr ? seconds : 0, r));
  }

  center(text, small) {
    this.state.center = text || null;
    if (text) this._m.innerHTML = escape(text) + (small ? `<small>${escape(small)}</small>` : '');
    this._show(this._m, !!text);
  }

  expect(key) {
    let saved = null;
    try { saved = JSON.parse(this.storage?.getItem(LOAD_KEY) || 'null'); } catch {}
    const v = saved && typeof saved === 'object' ? +saved[key] : NaN;
    const def = LOAD_DEFAULT[key] ?? LOAD_DEFAULT.chapter;
    return Number.isFinite(v) && v > 0 ? Math.min(90, Math.max(3, v)) : def;
  }

  _remember(key, seconds) {
    if (!this.storage) return;
    try {
      let saved = JSON.parse(this.storage.getItem(LOAD_KEY) || 'null');
      if (!saved || typeof saved !== 'object') saved = {};
      saved[key] = Math.round(seconds * 10) / 10;
      this.storage.setItem(LOAD_KEY, JSON.stringify(saved));
    } catch {}
  }

  loading(on, key = null, { remember = true } = {}) {
    on = !!on;
    if (on === this.state.loading) return Promise.resolve();
    this.state.loading = on;
    const L = this._l, f = this._lf;
    clearTimeout(this._loadTimer);
    if (on) {
      const t = this.expect(key);
      this._loadKey = remember ? key : null;
      this._loadAt = wall();
      this.state.loadExpect = t;
      L.classList.remove('run');
      if (f.style) { f.style.transition = 'none'; f.style.transform = 'scaleX(0)'; }
      void f.offsetWidth;
      if (f.style) { f.style.transition = ''; f.style.transform = ''; }
      L.style.setProperty?.('--load-t', `${(t * 4).toFixed(1)}s`);
      L.classList.add('run');
      this._show(L, true);
      return Promise.resolve();
    }
    const took = (wall() - this._loadAt) / 1000;
    if (this._loadKey && took > 1 && took < 180) this._remember(this._loadKey, took);
    this._loadKey = null;
    let cur = 0.9;
    try { const m = /matrix\(([^,]+)/.exec(getComputedStyle(f).transform); if (m && Number.isFinite(+m[1])) cur = +m[1]; } catch {}
    L.classList.remove('run');
    if (f.style) { f.style.transition = 'none'; f.style.transform = `scaleX(${cur.toFixed(4)})`; }
    void f.offsetWidth;
    if (f.style) { f.style.transition = ''; f.style.transform = 'scaleX(1)'; }
    return new Promise(r => { this._loadTimer = setTimeout(() => { this._show(L, false); r(); }, 240); });
  }

  hud(text) { this._hud.textContent = text || ''; }

  guide(text) {
    const t = text || null;
    if (t === this._guideText) return;
    this._guideText = t;
    this.state.guide = t;
    this._line();
  }

  teach(id, text, { done, when, doing, enough = 2, delay = 0, limit = 0 } = {}) {
    if (!id || this.learned.has(id)) return false;
    this._lessons = this._lessons.filter(l => l.id !== id);
    this._lessons.push({ id, text: text || LESSONS[id] || id, done, when, doing, enough, delay, limit, t: 0, up: 0, used: 0, seen: false, shown: false });
    return true;
  }

  _doing(kind) {
    const inp = this.input;
    if (!inp) return false;
    const m = inp.axis?.('move') || { x: 0, y: 0 }, l = inp.look?.() || { x: 0, y: 0 };
    const moving = Math.hypot(m.x, m.y) > 0.3, looking = Math.abs(l.x) + Math.abs(l.y) > 0.002;
    if (kind === 'move') return moving || looking;
    if (kind === 'float') return moving || inp.axis?.('rise') !== 0 || inp.axis?.('roll') !== 0;
    if (kind === 'look') return looking;
    return false;
  }

  learn(id) { this.learned.add(id); this._lessons = this._lessons.filter(l => l.id !== id); if (this._lesson?.id === id) { this._lesson = null; this.state.lesson = null; this._line(); } }

  _fault(l, e) { if (!this.faults.has(l.id)) this.faults.set(l.id, String(e?.message || e)); }

  tick(dt = 0) {
    for (const [key, tm] of Object.entries(this._timers)) {
      tm.t -= dt;
      if (tm.t <= 0) { delete this._timers[key]; this._show(tm.node, false); this.state[key] = null; tm.done?.(); }
    }
    let active = null;
    for (const l of [...this._lessons]) {
      let on = false, finished = false;
      try { on = !l.when || !!l.when(); } catch (e) { this._fault(l, e); }
      if (on) l.seen = true;
      if (on || l.shown) {
        try {
          finished = !!l.done?.();
          if (!finished && on && l.doing && (typeof l.doing === 'string' ? this._doing(l.doing) : l.doing())) l.used += dt;
          if (l.doing && l.used >= l.enough) finished = true;
        } catch (e) { this._fault(l, e); finished = false; }
      } else if (this.strict && !l.seen && l.done) {
        let early = false;
        try { early = !!l.done(); } catch (e) { early = true; this._fault(l, e); }
        if (early) this.early.add(l.id);
      }
      if (finished) { this.learn(l.id); continue; }
      if (on) l.t += dt;
      if (active || !on || l.t < l.delay) continue;
      l.shown = true;
      l.up += dt;
      if (l.limit > 0 && l.up > l.limit) this.learn(l.id); else active = l;
    }
    if (active !== this._lesson) { this._lesson = active; this.state.lesson = active ? active.id : null; this._line(); }
    if (this.film && this.autoBackdrop !== false) this.backdrop(this.meterGrid(), (this.film.letterbox ?? 0) > 0.5, dt);
  }

  backdrop(grid, bars = this._bars, dt = null) {
    this._bars = !!bars;
    const zone = (y0, y1, x0, x1) => {
      if (!grid) return 0;
      let sum = 0, n = 0, max = 0;
      for (let r = Math.max(0, Math.floor(y0 * 8)); r <= Math.min(7, Math.floor(y1 * 8)); r++) for (let c = Math.max(0, Math.floor(x0 * 8)); c <= Math.min(7, Math.floor(x1 * 8)); c++) { const v = grid[r * 8 + c]; sum += v; max = Math.max(max, v); n++; }
      const mean = n ? sum / n : 0;
      return max > INK.ink && mean < INK.mid ? INK.mid + 0.01 : mean;
    };
    const fh = this._barF + 0.065, mp = this.state.mark;
    const low = this._bars ? zone(fh - 0.02, fh + 0.1, 0.2, 0.8) : zone(0.02, fh + 0.1, 0.2, 0.8);
    const lum = {
      hint: low,
      sub: low,
      guide: this._bars ? 0 : low,
      reticle: zone(0.48, 0.52, 0.48, 0.52),
      mark: mp ? zone((mp.y * 0.5 + 0.5) - 0.03, (mp.y * 0.5 + 0.5) + 0.03, (mp.x * 0.5 + 0.5) + (mp.x > 0.45 ? -0.12 : 0), (mp.x * 0.5 + 0.5) + (mp.x > 0.45 ? 0 : 0.12)) : 0,
      load: this.state.loading ? zone(0.45, 0.55, 0.38, 0.62) : 0,
    };
    const nodes = { hint: [this._h, this._b], sub: [this._s], guide: [this._g], reticle: [this._r], mark: [this._k], load: [this._l] };
    for (const [k, v] of Object.entries(lum)) {
      const was = this._ink[k] || 0;
      const lv = v > INK.ink || (was === 2 && v > INK.inkOff) ? 2 : v > INK.mid || (was >= 1 && v > INK.midOff) ? 1 : 0;
      if (lv === was) { delete this._inkWait[k]; continue; }
      if (dt != null && k !== 'load') {
        const w = this._inkWait[k] ||= { lv, t: 0 };
        if (w.lv !== lv) { w.lv = lv; w.t = 0; }
        w.t += dt;
        if (w.t < INK.dwell) continue;
      }
      delete this._inkWait[k];
      this._ink[k] = lv;
      for (const n of nodes[k]) { n.classList.toggle('mid', lv === 1); n.classList.toggle('ink', lv === 2); }
    }
    this.state.ink = { ...this._ink };
    return lum;
  }

  meterGrid() {
    const f = this.film;
    if (typeof f?.lumaGrid !== 'function') return null;
    return f.lumaGrid(this._grid ||= new Float32Array(64));
  }

  _line() {
    const txt = this._lesson ? this._lesson.text : this._guideText;
    const dev = device();
    if (txt && (txt !== this._lineText || dev !== this._lineDev)) this._g.innerHTML = caps(escape(translate(txt)));
    this._lineText = txt;
    this._lineDev = dev;
    const show = !!txt && !this._hintText && this._guidance !== 'reduced' && !this._menu;
    this.state.line = show ? txt : null;
    this._show(this._g, show);
  }

  menuOpen(on) {
    this._menu = !!on;
    this.state.menu = this._menu;
    this.el.classList.toggle('menu', this._menu);
    this._root?.classList?.toggle?.('ui-menu', this._menu);
    const body = typeof document !== 'undefined' ? document.body : null;
    if (body?.style) body.style.cursor = this._menu ? '' : 'none';
    this._line();
  }

  mark(camera, target, label = '', sub = '', { direction = false, hideWithin = 0 } = {}) {
    if (!camera || !target) { this._mark = null; if (this.state.mark) { this.state.mark = null; this._show(this._k, false); } return; }
    const m = this._mark ||= { x: 0, y: 0, z: 0 };
    m.x = target.x; m.y = target.y; m.z = target.z; m.label = label; m.sub = sub; m.direction = direction; m.hideWithin = hideWithin; m.camera = camera;
    this._place(camera);
  }

  frame(camera) { if (this._mark) this._place(camera || this._mark.camera); }

  _place(camera) {
    const { x, y, z, label, sub, direction, hideWithin } = this._mark;
    const e = camera.matrixWorldInverse.elements, w = direction ? 0 : 1;
    let cx = e[0] * x + e[4] * y + e[8] * z + e[12] * w, cy = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
    const cz = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
    const t = Math.tan(camera.fov * Math.PI / 360);
    const lx = 0.9, ly = Math.min(0.74, 0.86 * (this._W / this._H) / 2.39);
    let nx, ny, off = false;
    if (cz < -1e-6) { nx = cx / (-cz * t * camera.aspect); ny = cy / (-cz * t); } else { const l = Math.hypot(cx, cy) || 1; nx = cx / l * 9; ny = cy / l * 9; if (l < 1e-6) ny = -9; }
    const k = Math.max(Math.abs(nx) / lx, Math.abs(ny) / ly);
    if (k > 1) { nx /= k; ny /= k; off = true; }
    const near = !off && hideWithin > 0 && Math.hypot(nx * camera.aspect, ny) < hideWithin;
    this.placeMark(nx, ny, off, label, sub, !near);
  }

  placeMark(nx, ny, off, label, sub, visible = true) {
    const px = (nx * 0.5 + 0.5) * this._W, py = (0.5 - ny * 0.5) * this._H;
    this._k.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    this._ki.style.transform = off ? `rotate(${(Math.atan2(-ny, nx) * 180 / Math.PI - 45).toFixed(1)}deg)` : 'rotate(45deg)';
    this._k.classList.toggle('off', off);
    this._k.classList.toggle('left', nx > 0.45);
    const text = label + '|' + sub;
    if (text !== this._markText) { this._markText = text; this._ks.innerHTML = escape(label) + (sub ? `<small>${escape(sub)}</small>` : ''); }
    this.state.mark = { x: nx, y: ny, off, label, sub, visible };
    this._show(this._k, visible);
  }

  clear() {
    this.hint(null); this.subtitle(null); this.card(null); this.progress(null); this.guide(null); this.mark(null);
    this._lessons = []; this._lesson = null; this.state.lesson = null; this._line();
  }
}
