// Interstellar menus: one focus-driven menu layer for the start screen, the co-op lobby (home network or a room code over the internet), pause, controls, the controller guide, settings and confirmations, driven by keys, pad and mouse, plus the pause controller with pointer lock handling.
import { translate, controlRows, onChange, device, style, padName, CONTROLS, PAD_GUIDE } from './prompts.js';
import { SPEC } from './settings.js';
import { caps, escape } from './ui.js';
import { CODE, cleanCode } from './code.js';

const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'select', NumpadEnter: 'select', Space: 'select', Escape: 'back', Backspace: 'back' };
const REPEAT = { first: 0.38, next: 0.12 };
const rich = t => caps(escape(translate(t)));
const wall = () => globalThis.performance?.now?.() ?? Date.now();

export class Menu {
  constructor(ui, input, { settings = null } = {}) {
    this.ui = ui;
    this.input = input;
    this.settings = settings;
    this.el = ui.menuEl;
    this.stack = [];
    this.focus = 0;
    this.isOpen = false;
    this.view = null;
    this.onIdleKey = null;
    this.onIdleButton = null;
    this._note = null;
    this._sig = undefined;
    this._rep = { dir: null, t: 0 };
    this._offs = [
      input.onKey?.((code, e) => this._key(code, e)),
      input.onButton?.(name => this._button(name)),
      onChange(() => { this.view = null; this.render(); }),
    ];
    settings?.onChange(() => this.render());
    const find = e => { let t = e?.target; while (t && t !== this.el) { if (t.dataset?.i != null) return t; t = t.parentNode; } return null; };
    const findV = e => { let t = e?.target; while (t && t !== this.el) { if (t.dataset?.v != null) return t.dataset.v; t = t.parentNode; } return null; };
    const findTab = e => { let t = e?.target; while (t && t !== this.el) { if (t.dataset?.tab) return t.dataset.tab; t = t.parentNode; } return null; };
    this.el.addEventListener?.('pointermove', e => { const t = find(e); if (t && +t.dataset.i !== this.focus) { this.focus = +t.dataset.i; this.render(); } });
    this.el.addEventListener?.('click', e => this.click(find(e)?.dataset.i, findV(e), findTab(e)));
  }

  get screen() { return this.stack[this.stack.length - 1] || null; }

  get state() {
    const s = this.screen, it = s?.items[this.focus];
    return { open: this.isOpen, screen: s?.id ?? null, depth: this.stack.length, focus: this.focus, item: it?.id ?? null, items: s ? s.items.filter(i => !this._gone(i)).map(i => i.id) : [], note: this._note, view: this.viewDevice(), group: s?.group ?? null };
  }

  _gone(it) { return !!it?.hidden?.(this); }

  _off(it) { return !it || !!it.disabled || this._gone(it); }

  open(screen, { bare = false } = {}) {
    this.stack = [screen];
    this._enter(screen);
    this.isOpen = true;
    this.el.classList.toggle('bare', !!bare);
    this.el.classList.toggle('on', true);
    this.ui.menuOpen?.(true);
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stack = [];
    this._note = null;
    this.el.classList.toggle('on', false);
    this.ui.menuOpen?.(false);
  }

  push(screen) { this.stack.push(screen); this._enter(screen); this.render(); }

  pop() {
    if (this.stack.length <= 1) return false;
    const s = this.stack.pop();
    this.focus = s.returnFocus ?? 0;
    this._restore();
    this._note = null;
    this._sig = this.screen?.live?.(this);
    this.render();
    return true;
  }

  _enter(s) {
    if (this.stack.length > 1) this.stack[this.stack.length - 2].focusSaved = this.focus;
    this.focus = s.focus != null && !this._off(s.items[s.focus]) ? s.focus : this._first(s);
    this._note = null;
    this.view = null;
    this._sig = s.live?.(this);
  }

  _restore() { const s = this.screen; if (s && s.focusSaved != null) this.focus = this._off(s.items[s.focusSaved]) ? this._first(s) : s.focusSaved; }

  _first(s) { const i = s.items.findIndex(it => !this._off(it)); return i < 0 ? 0 : i; }

  note(text) { this._note = text || null; this.render(); }

  viewDevice() { return this.view || device(); }

  move(dir) {
    const s = this.screen;
    if (!s) return;
    if (dir === 'up' || dir === 'down') {
      const d = dir === 'up' ? -1 : 1;
      let i = this.focus;
      for (let n = 0; n < s.items.length; n++) { i += d; if (i < 0 || i >= s.items.length) return; if (!this._off(s.items[i])) break; }
      if (!this._off(s.items[i]) && i !== this.focus) { this.focus = i; this._note = null; this.render(); }
      return;
    }
    const d = dir === 'left' ? -1 : 1;
    if (s.onSide) { s.onSide(d, this); this.render(); return; }
    const it = s.items[this.focus];
    if (it?.kind === 'setting' && this.settings) { this.settings.step(it.setting, d); this.render(); }
  }

  select() {
    const s = this.screen, it = s?.items[this.focus];
    if (this._off(it)) return;
    if (it.kind === 'setting' && this.settings) { this.settings.step(it.setting, 1, this.settings.spec(it.setting)?.kind !== 'scale'); this.render(); return; }
    it.run?.(this);
  }

  back() {
    const s = this.screen;
    if (!s) return;
    if (s.onBack) { s.onBack(this); return; }
    this.pop();
  }

  click(i, v, tab) {
    const s = this.screen;
    if (!s) return;
    if (tab && s.onTab) { s.onTab(tab, this); this.render(); return; }
    if (i == null) return;
    const it = s.items[+i];
    if (this._off(it)) return;
    this.focus = +i;
    if (it.kind === 'setting' && this.settings && v != null) {
      const spec = this.settings.spec(it.setting);
      if (spec.kind === 'scale') this.settings.set(it.setting, spec.steps[+v]);
      else if (spec.kind === 'toggle') this.settings.set(it.setting, v === '1');
      else this.settings.set(it.setting, v);
      this.render();
      return;
    }
    this.select();
  }

  _key(code, e) {
    if (!this.isOpen) { this.onIdleKey?.(code, e); return; }
    if (this.screen?.onType?.(code, e, this)) { e?.preventDefault?.(); this.render(); return; }
    const a = KEYMAP[code];
    if (!a) return;
    e?.preventDefault?.();
    if (a === 'select' && e?.repeat) return;
    if (a === 'back' && e?.repeat) return;
    if (a === 'select') this.select();
    else if (a === 'back') this.back();
    else this.move(a);
  }

  _button(name) {
    if (!this.isOpen) { this.onIdleButton?.(name); return; }
    if (name === 'A') this.select();
    else if (name === 'B') this.back();
    else if (name === 'Start') { const root = this.stack[0]; if (root?.onStart) root.onStart(this); else this.select(); }
  }

  update(dt) {
    if (!this.isOpen) { this._rep.dir = null; return; }
    const s = this.screen;
    if (s?.live) {
      const sig = s.live(this);
      if (sig !== this._sig) { this._sig = sig; if (this._off(s.items[this.focus])) this.focus = this._first(s); this.render(); }
    }
    const inp = this.input, mv = inp.pad?.move || { x: 0, y: 0 };
    const b = n => inp.padButton?.(n);
    const dir = b('Up') || mv.y > 0.6 ? 'up' : b('Down') || mv.y < -0.6 ? 'down' : b('Left') || mv.x < -0.6 ? 'left' : b('Right') || mv.x > 0.6 ? 'right' : null;
    const R = this._rep;
    if (dir !== R.dir) { R.dir = dir; R.t = REPEAT.first; if (dir) this.move(dir); return; }
    if (!dir) return;
    R.t -= dt;
    if (R.t <= 0) { R.t += REPEAT.next; this.move(dir); }
  }

  render() {
    if (!this.isOpen || !this.screen) return;
    const s = this.screen;
    let html = '<div class="body">';
    if (s.title) html += `<div class="title">${escape(s.title)}</div>`;
    if (s.text) html += `<div class="text">${escape(s.text)}</div>`;
    if (s.body) html += s.body(this);
    s.items.forEach((it, i) => { if (!this._gone(it)) html += this._item(it, i); });
    const it = s.items[this.focus];
    const spec = it?.kind === 'setting' ? this.settings?.spec(it.setting) : null;
    const note = this._note ?? (spec?.note ? spec.note[this.settings.get(it.setting)] : null) ?? it?.note ?? (typeof s.note === 'function' ? s.note(this) : s.note) ?? '';
    html += `<div class="note">${rich(note)}</div></div>`;
    html += `<div class="foot">${(typeof s.foot === 'function' ? s.foot(this) : s.foot || footFor(s)).map(rich).join('<span class="gap"></span>')}</div>`;
    this.el.innerHTML = html;
  }

  _item(it, i) {
    const f = i === this.focus ? ' sel' : '';
    if (it.kind !== 'setting' || !this.settings) return `<div class="it${f}${it.disabled ? ' dis' : ''}" data-i="${i}">${escape(typeof it.label === 'function' ? it.label(this) : it.label)}</div>`;
    const spec = this.settings.spec(it.setting), v = this.settings.get(it.setting);
    let val = '';
    if (spec.kind === 'scale') {
      const k = this.settings.index(it.setting);
      val = `<span class="ticks">${spec.steps.map((_, j) => `<i data-v="${j}"${j <= k ? ' class="on"' : ''}></i>`).join('')}</span><span class="num">${escape(this.settings.text(it.setting))}</span>`;
    } else if (spec.kind === 'toggle') val = `<span class="o${v ? ' on' : ''}" data-v="1">on</span><span class="o${v ? '' : ' on'}" data-v="0">off</span>`;
    else val = spec.options.map(([id, name]) => `<span class="o${v === id ? ' on' : ''}" data-v="${escape(id)}">${escape(name)}</span>`).join('');
    return `<div class="row${f}" data-i="${i}"><div class="l">${escape(spec.label)}</div><div class="v">${val}</div></div>`;
  }

  dispose() { for (const off of this._offs) off?.(); }
}

function footFor(s) {
  const t = ['[Nav] choose'];
  if (s.items.some(i => i.kind === 'setting') || s.onSide) t.push('[Adjust] change');
  t.push('[Select] select');
  if (s.back !== false) t.push('[Back] back');
  return t;
}

export function controllerScreen() {
  return {
    id: 'controller',
    title: 'controller',
    items: [{ id: 'back', label: 'back', run: m => m.back() }],
    body: m => {
      const p = m.input?.pad;
      const now = p?.connected ? `${padName(p.id)}, connected` : p?.seen ? 'the controller went away   press a button on it' : 'no controller seen yet';
      const rows = PAD_GUIDE.map(g => `<div class="l">${escape(g.title)}</div><div class="t">${g.steps ? g.steps.map((t, i) => `<div class="st"><span class="n">${i + 1}</span><span>${rich(t)}</span></div>`).join('') : rich(g.text)}</div>`).join('');
      return `<div class="cg"><div class="l">now</div><div class="t now">${rich(now)}</div>${rows}</div>`;
    },
    live: m => `${!!m.input?.pad?.connected}|${m.input?.pad?.id || ''}`,
    foot: ['[Back] back'],
  };
}

export function controlsScreen({ group = null } = {}) {
  const s = {
    id: 'controls',
    title: 'controls',
    group: Math.max(0, CONTROLS.findIndex(g => g.id === group)),
    focus: 1,
    items: [{ id: 'controller', label: 'connect a controller', run: m => m.push(controllerScreen()) }, { id: 'back', label: 'back', run: m => m.back() }],
    body: m => {
      const dev = m.viewDevice(), g = controlRows(dev, dev === 'pad' ? style() : undefined)[s.group];
      const tabs = `<div class="tabs">${CONTROLS.map((c, i) => `<span class="tab${i === s.group ? ' on' : ''}" data-tab="${escape(c.id)}">${escape(c.title)}</span>`).join('')}</div>`;
      return `${tabs}<div class="list">${g.rows.map(r => `<div class="cr"><span class="a">${escape(r.action)}</span><span class="b">${caps(escape(r.bind))}</span></div>`).join('')}</div>`;
    },
    note: m => (m.viewDevice() === 'pad' ? 'controller shown   press a key to see the keyboard' : 'keyboard and mouse shown   press a controller button to see the controller'),
    onSide: d => { s.group = (s.group + d + CONTROLS.length) % CONTROLS.length; },
    onTab: tab => { const i = CONTROLS.findIndex(g => g.id === tab); if (i >= 0) s.group = i; },
    foot: ['[Adjust] situation', '[Select] select', '[Back] back'],
  };
  return s;
}

export function settingsScreen() {
  return {
    id: 'settings',
    title: 'settings',
    items: [...SPEC.map(s => ({ id: s.id, kind: 'setting', setting: s.id })), { id: 'back', label: 'back', run: m => m.back() }],
  };
}

export function confirmScreen({ title, text, yes, no = 'keep playing', onYes, onNo = null, id = 'confirm' }) {
  return {
    id,
    title,
    text,
    focus: 0,
    items: [{ id: 'no', label: no, run: m => (onNo ? onNo(m) : m.back()) }, { id: 'yes', label: yes, run: m => onYes(m) }],
  };
}

const slots = (code, cand = '') => `<div class="code">${Array.from({ length: CODE.length }, (_, i) => (i < code.length ? `<span class="on">${code[i]}</span>` : i === code.length ? `<span class="cur">${cand}</span>` : '<span></span>')).join('')}</div>`;

export function hostScreen(coop, done) {
  const leave = m => { coop.leave(); m.pop(); };
  const net = () => coop.status().mode === 'net';
  return {
    id: 'host',
    title: 'host a second pilot',
    items: [
      { id: 'begin', label: 'begin', run: () => done('host') },
      { id: 'copy', label: 'copy the invite link', run: m => coop.copy?.().then(ok => m.note(ok ? 'invite link copied' : 'the link could not be copied   read the code out instead')), hidden: () => !net() || !coop.status().open },
      { id: 'back', label: 'back', run: leave },
    ],
    body: () => {
      const s = coop.status();
      let how;
      if (s.mode === 'net') how = s.open ? `<div>${escape('the second pilot opens')}</div><div class="addr">${escape(s.site)}</div><div>${escape('chooses join as second pilot and enters')}</div>${slots(s.code)}` : `<div>${escape(s.error === 'down' ? 'no connection to the flight service   check the internet' : 'opening a flight')}</div>`;
      else how = s.addresses.length
        ? `<div>${escape('on the second computer, in Chrome, open')}</div>${s.addresses.map(a => `<div class="addr">${escape(`http://${a}:${s.port}/`)}</div>`).join('')}<div>${escape('and choose join as second pilot')}</div>`
        : `<div>${escape(s.opening ? 'opening the home network' : 'no home network found   connect this computer to the Wi-Fi')}</div>`;
      return `<div class="lobby">${how}<div class="now">${escape(s.linked ? 'the second pilot is connected' : 'waiting for the second pilot   you can begin and be joined later')}</div></div>`;
    },
    live: () => { const s = coop.status(); return `${s.mode}|${s.opening}|${s.addresses.join()}|${s.code}|${s.open}|${s.error}|${s.linked}`; },
    onBack: leave,
  };
}

export function hostHowScreen(coop, done) {
  const go = mode => m => { coop.host(mode); m.push(hostScreen(coop, done)); };
  return {
    id: 'host-how',
    title: 'host a second pilot',
    text: 'Where is the second pilot?',
    items: [{ id: 'lan', label: 'on this home network', run: go('lan') }, { id: 'net', label: 'somewhere else   over the internet', run: go('net') }, { id: 'back', label: 'back', run: m => m.back() }],
  };
}

export function joinScreen(coop, done) {
  const leave = m => { coop.leave(); m.pop(); };
  const line = s => (s.error === 'busy' ? 'a second pilot is already aboard' : s.error === 'version' ? 'this copy of the game does not match the host   reload the page' : !s.open ? 'looking for the host computer' : !s.linked ? 'waiting for the first pilot to host' : 'connected   the first pilot starts the journey');
  return {
    id: 'join',
    title: 'join as second pilot',
    items: [{ id: 'back', label: 'back', run: leave }],
    body: () => `<div class="lobby"><div class="now">${escape(line(coop.status()))}</div></div>`,
    live: () => { const s = coop.status(); if (s.started) done('join'); return line(s); },
    onBack: leave,
  };
}

export function codeScreen(coop, done, initial = '') {
  const N = CODE.length, L = CODE.letters;
  let code = cleanCode(initial), sent = '', pick = 0, byPad = false;
  const sync = () => {
    if (code.length === N && sent !== code) { if (sent) coop.leave(); sent = code; coop.join(code); }
    else if (code.length < N && sent) { sent = ''; coop.leave(); }
  };
  const add = c => { if (code.length < N && L.includes(c)) { code += c; sync(); } };
  const erase = () => { code = code.slice(0, -1); sync(); };
  const leave = m => { if (sent) coop.leave(); sent = ''; m.pop(); };
  const padView = m => byPad && m.viewDevice() === 'pad';
  const line = s => (code.length < N ? 'enter the code the first pilot sees' : s.error === 'none' ? 'no flight with this code' : s.error === 'busy' ? 'a second pilot is already aboard' : s.error === 'version' ? 'this copy of the game does not match the host   reload the page' : !s.open ? 'looking for the flight' : !s.linked ? 'waiting for the first pilot' : 'connected   the first pilot starts the journey');
  sync();
  return {
    id: 'code',
    title: 'join as second pilot',
    items: [
      { id: 'go', label: m => (code.length < N && padView(m) ? `add ${L[pick]}` : 'join'), run: m => { if (code.length < N) { if (padView(m)) add(L[pick]); else m.note(`the code has ${N} characters`); } else { sent = ''; coop.leave(); sync(); } m.render(); } },
      { id: 'back', label: 'back', run: leave },
    ],
    body: m => `<div class="lobby">${slots(code, padView(m) ? L[pick] : '')}<div class="now">${escape(line(coop.status()))}</div></div>`,
    live: m => { const s = coop.status(); if (s.started) done('join'); return `${code}|${pick}|${padView(m)}|${line(s)}`; },
    onType: (key, e, m) => {
      if (e?.ctrlKey || e?.metaKey || e?.altKey) return false;
      if (key === 'Escape') { leave(m); return true; }
      if (key === 'Backspace') { if (!code.length) return false; erase(); return true; }
      const c = cleanCode(e?.key?.length === 1 ? e.key : /^(Key|Digit|Numpad)(\w)$/.exec(key)?.[2] || '');
      if (c.length !== 1) return /^(Key|Digit|Numpad)\w$/.test(key);
      byPad = false;
      add(c);
      return true;
    },
    onSide: d => { byPad = true; pick = (pick + d + L.length) % L.length; },
    onBack: m => { if (code.length) { erase(); m.render(); } else leave(m); },
    foot: m => (padView(m) || m.viewDevice() === 'pad' ? ['[Adjust] character', '[Select] add', '[Back] erase'] : ['type the code', '[Back] back']),
  };
}

export function startScreen(menu, { save = false, coop = null, join = '' } = {}) {
  return new Promise(resolve => {
    let over = false;
    const done = v => { if (over) return; over = true; menu.close(); resolve(v); };
    const crew = coop ? [
      { id: 'host', label: 'host a second pilot', run: m => { if (coop.lan) m.push(hostHowScreen(coop, done)); else { coop.host('net'); m.push(hostScreen(coop, done)); } }, hidden: () => !coop.canHost },
      { id: 'join', label: 'join as second pilot', run: m => { if (coop.relay) { coop.join(); m.push(joinScreen(coop, done)); } else m.push(codeScreen(coop, done, coop.remembered?.() || '')); } },
    ] : [];
    const common = [
      ...crew,
      { id: 'controls', label: 'controls', run: m => m.push(controlsScreen()) },
      { id: 'settings', label: 'settings', run: m => m.push(settingsScreen()) },
      { id: 'controller', label: 'connect a controller', run: m => m.push(controllerScreen()), hidden: m => !!m.input?.pad?.seen },
    ];
    const live = m => !!m.input?.pad?.seen;
    const root = save
      ? { id: 'start', items: [{ id: 'continue', label: 'continue', run: () => done('continue') }, { id: 'new', label: 'begin again', run: m => m.push(confirmScreen({ id: 'confirm-new', title: 'begin again', text: 'The journey recorded so far will be erased.', yes: 'begin again', no: 'back', onYes: () => done('new') })) }, ...common], note: 'headphones recommended', onBack: () => {}, back: false, onStart: () => done('continue'), live }
      : { id: 'start', items: [{ id: 'begin', label: 'begin', run: () => done('begin') }, ...common], note: 'headphones recommended', onBack: () => {}, back: false, onStart: () => done('begin'), live };
    menu.open(root, { bare: true });
    if (coop && !coop.relay && cleanCode(join).length === CODE.length) { menu.focus = Math.max(0, root.items.findIndex(i => i.id === 'join')); menu.push(codeScreen(coop, done, join)); }
  });
}

export class PauseControl {
  constructor({ input, menu, engine, interact, audio, ui, onBeginAgain = null, situation = null, win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null }) {
    Object.assign(this, { input, menu, engine, interact, audio, ui, onBeginAgain, situation, win, doc });
    this.paused = false;
    this.lockless = false;
    this._scale = 1;
    this._timer = null;
    this._fails = 0;
    this._openedAt = 0;
  }

  get canLock() { return !this.input.auto && typeof this.input.canvas?.requestPointerLock === 'function'; }

  attach() {
    const { input, menu } = this;
    this._offs = [
      input.onLockChange(locked => {
        if (locked) { this._fails = 0; this.lockless = false; input.lockless = false; if (this.paused) this._resume(); }
        else if (!this.paused && input.device !== 'pad') this.open();
      }),
      input.onDevice(d => {
        clearTimeout(this._timer);
        if (this.paused || this.lockless || d !== 'keys' || input.mouse.locked || !this.canLock) return;
        this._timer = setTimeout(() => { if (!this.paused && !this.lockless && input.device === 'keys' && !input.mouse.locked) this.open(); }, 250);
      }),
    ];
    menu.onIdleKey = code => { if (code === 'Escape' && !this.paused) { input.unlock(); this.open(); } };
    menu.onIdleButton = name => { if (name === 'Start' && !this.paused) this.open(); };
    this.doc?.addEventListener?.('visibilitychange', () => { if (this.doc.hidden) this.open(); });
    return this;
  }

  root() {
    return {
      id: 'pause',
      title: 'paused',
      items: [
        { id: 'resume', label: 'resume', run: () => this.resume() },
        { id: 'controls', label: 'controls', run: m => m.push(controlsScreen({ group: this.situation?.() })) },
        { id: 'settings', label: 'settings', run: m => m.push(settingsScreen()) },
        { id: 'again', label: 'begin again', run: m => m.push(confirmScreen({ id: 'confirm-again', title: 'begin again', text: 'Back to the cryo-lab. The journey recorded so far will be erased.', yes: 'begin again', onYes: () => this.beginAgain(), onNo: () => this.resume() })) },
      ],
      onBack: () => this.resume(true),
      onStart: () => this.resume(),
      foot: () => (device() === 'pad' ? ['[Nav] choose', '[Select] select', '[Back] resume'] : ['[Nav] choose', '[Select] select']),
    };
  }

  open() {
    if (this.paused) return;
    clearTimeout(this._timer);
    this.paused = true;
    this._openedAt = wall();
    this._scale = this.engine.timeScale || 1;
    this.engine.timeScale = 0;
    this.input.enabled = false;
    if (this.interact) this.interact.enabled = false;
    this.input.clear();
    this.ui.hint(null);
    this.audio?.suspend?.();
    this.menu.open(this.root());
  }

  resume(soft = false) {
    if (!this.paused) return;
    if (this.input.device === 'pad' || !this.canLock || this.input.mouse.locked) { this._resume(); return; }
    this.input.lock().then(ok => {
      if (ok || !this.paused || this.input.mouse.locked) return;
      if (this.input.device === 'pad') return;
      if (this.lockless) { this._resume(); return; }
      if (!soft && wall() - this._openedAt > 1500) this._fails++;
      if (this._fails >= 3) {
        this.lockless = true;
        this.input.lockless = true;
        this._resume();
        this.ui.subtitle?.('The browser did not capture the mouse. Click the picture to try again.', 6);
        return;
      }
      this.menu.note('press [Select] or click resume');
    });
  }

  _resume() {
    if (!this.paused) return;
    this.paused = false;
    this.engine.timeScale = this._scale;
    this.input.enabled = true;
    if (this.interact) this.interact.enabled = true;
    this.audio?.resume?.();
    this.menu.close();
    this.input.hush?.();
  }

  beginAgain() { this.onBeginAgain?.(); }
}
