// Interstellar input: pointer-lock mouse look (with a lockless fallback), keyboard and gamepad merged into one key state with per-frame edges, axes, active device, menu key events, look settings, rumble and scripted injection.
const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft']);

const AXES = {
  move: { x: [['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']], y: [['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']] },
  rise: [['KeyC'], ['Space']],
  roll: [['KeyX'], ['KeyZ']],
};

export const BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Home'];

export const PAD_KEYS = { A: 'KeyE', B: 'KeyV', X: 'KeyR', Y: 'KeyT', LB: 'KeyC', RB: 'Space', RT: 'ShiftLeft', Left: 'KeyZ', Right: 'KeyX' };

const DEAD = 0.15, SWITCH = 0.35, TRIG_ON = 0.3, TRIG_OFF = 0.2, STICK_ON = 0.5, STICK_OFF = 0.4;

function deadzone(x, y, dz = DEAD) {
  const m = Math.hypot(x, y);
  if (m <= dz) return { x: 0, y: 0, m: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz));
  return { x: x / m * k, y: y / m * k, m: k };
}

function btnValue(b) { return b == null ? 0 : typeof b === 'number' ? b : typeof b === 'boolean' ? (b ? 1 : 0) : Math.max(b.pressed ? 1 : 0, +b.value || 0); }

function isPlayStation(id) { return /054c|dualsense|dualshock|playstation|wireless controller/i.test(id || ''); }

export class Input {
  constructor(canvas, { auto = false, sensitivity = 0.0022 } = {}) {
    this.canvas = canvas;
    this.auto = auto;
    this.sensitivity = sensitivity;
    this.enabled = true;
    this.device = 'keys';
    this.padLook = { yaw: 3.4, pitch: 2.3, curve: 2, invertY: false };
    this.invertY = false;
    this.vibration = true;
    this.lockless = false;
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: 0, locked: false };
    this.pad = { connected: false, seen: false, id: '', style: 'xbox', move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, rise: 0, roll: 0, lt: 0, rt: 0, buttons: 0 };
    this._down = new Set();
    this._pressed = new Set();
    this._released = new Set();
    this._mPressed = new Set();
    this._mReleased = new Set();
    this._held = new Map();
    this._padDown = new Set();
    this._padPressed = new Set();
    this._padReleased = new Set();
    this._padPrev = new Array(BUTTONS.length).fill(false);
    this._padMouse = 0;
    this._padMousePressed = new Set();
    this._padLookD = { x: 0, y: 0 };
    this._padWheel = 0;
    this._wheelT = 0;
    this._wheelDir = 0;
    this._padIndex = -1;
    this._fake = null;
    this._lastPoll = null;
    this._lockListeners = new Set();
    this._deviceListeners = new Set();
    this._buttonListeners = new Set();
    this._keyListeners = new Set();
    this._hush = new Set();
    this._onKey = this._onKey.bind(this);
    const on = (t, k, f, o) => { try { t?.addEventListener?.(k, f, o); } catch {} };
    const W = typeof window !== 'undefined' ? window : null, D = typeof document !== 'undefined' ? document : null;
    on(W, 'keydown', this._onKey);
    on(W, 'keyup', this._onKey);
    on(W, 'blur', () => this.clear());
    on(W, 'gamepadconnected', e => { if (this._padIndex < 0) this._padIndex = e.gamepad?.index ?? -1; });
    on(W, 'gamepaddisconnected', e => { if (e.gamepad?.index === this._padIndex) this._padIndex = -1; });
    on(D, 'mousemove', e => {
      if (!this.enabled || (!this.mouse.locked && !this.auto && !this.lockless)) return;
      if (this.mouse.locked || this.lockless) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; if (e.movementX || e.movementY) this._use('keys'); }
    });
    on(D, 'mousedown', e => { this._use('keys'); if (!this.mouse.locked && !this.auto && !this.lockless) return; this.mouse.buttons |= 1 << e.button; this._mPressed.add(e.button); });
    on(D, 'mouseup', e => { this.mouse.buttons &= ~(1 << e.button); this._mReleased.add(e.button); });
    on(D, 'contextmenu', e => e.preventDefault());
    on(D, 'wheel', e => { this._use('keys'); this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    on(D, 'pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === this.canvas;
      if (!this.mouse.locked) this.clear();
      for (const fn of this._lockListeners) fn(this.mouse.locked);
    });
  }

  _onKey(e) {
    if (e.type === 'keydown') for (const fn of [...this._keyListeners]) fn(e.code, e);
    if (e.repeat) { if (BLOCK.has(e.code)) e.preventDefault(); return; }
    if (BLOCK.has(e.code) || (this.mouse.locked && !e.metaKey)) e.preventDefault();
    if (e.type === 'keydown') { this._use('keys'); if (!this._down.has(e.code)) this._pressed.add(e.code); this._down.add(e.code); }
    else { this._down.delete(e.code); this._released.add(e.code); }
  }

  _use(device) {
    if (this.device === device) return;
    this.device = device;
    for (const fn of [...this._deviceListeners]) fn(device);
  }

  _wall() { return globalThis.performance?.now?.() ?? Date.now(); }

  _readPad() {
    if (this._fake) return this._fake;
    if (this.auto || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    let list;
    try { list = navigator.getGamepads() || []; } catch { return null; }
    let gp = this._padIndex >= 0 ? list[this._padIndex] : null;
    if (!gp?.connected) {
      gp = null;
      for (const p of list) if (p?.connected && p.mapping === 'standard') { gp = p; break; }
      if (!gp) for (const p of list) if (p?.connected) { gp = p; break; }
      this._padIndex = gp ? gp.index : -1;
    }
    return gp;
  }

  poll(dt) {
    const now = this._wall();
    if (dt === undefined) dt = this._lastPoll == null ? 0 : Math.min(0.1, Math.max(0, (now - this._lastPoll) / 1000));
    this._lastPoll = now;
    this._padPressed.clear(); this._padReleased.clear(); this._padMousePressed.clear();
    this._padLookD.x = 0; this._padLookD.y = 0; this._padWheel = 0;
    const gp = this._readPad(), P = this.pad;
    const wasConnected = P.connected;
    if (!gp) {
      if (wasConnected) {
        P.connected = false; P.id = ''; P.move = { x: 0, y: 0 }; P.look = { x: 0, y: 0 }; P.rise = 0; P.roll = 0; P.lt = 0; P.rt = 0; P.buttons = 0;
        for (const c of this._padDown) this._padReleased.add(c);
        this._padDown.clear(); this._padPrev.fill(false); this._padMouse = 0;
        if (this.device === 'pad') this._use('keys');
      }
      return;
    }
    P.connected = true;
    P.seen = true;
    P.id = gp.id || 'pad';
    P.style = isPlayStation(P.id) ? 'playstation' : 'xbox';
    const ax = gp.axes || [], bs = gp.buttons || [];
    const raw = BUTTONS.map((_, i) => btnValue(bs[i]));
    P.lt = raw[6]; P.rt = raw[7];
    const now2 = BUTTONS.map((_, i) => (i === 6 || i === 7) ? raw[i] > (this._padPrev[i] ? TRIG_OFF : TRIG_ON) : raw[i] > 0.5);
    const L = deadzone(+ax[0] || 0, +ax[1] || 0), R = deadzone(+ax[2] || 0, +ax[3] || 0);
    P.move = { x: L.x, y: -L.y };
    const k = R.m > 0 ? Math.pow(R.m, this.padLook.curve) / R.m : 0;
    P.look = { x: R.x * k, y: R.y * k * (this.padLook.invertY ? -1 : 1) };
    this._padLookD.x = P.look.x * this.padLook.yaw * dt;
    this._padLookD.y = P.look.y * this.padLook.pitch * dt;
    P.rise = (now2[5] ? 1 : 0) - (now2[4] ? 1 : 0);
    P.roll = (now2[14] ? 1 : 0) - (now2[15] ? 1 : 0);
    let mask = 0;
    let active = Math.abs(+ax[0] || 0) > SWITCH || Math.abs(+ax[1] || 0) > SWITCH || Math.abs(+ax[2] || 0) > SWITCH || Math.abs(+ax[3] || 0) > SWITCH;
    const pressedNames = [];
    for (let i = 0; i < BUTTONS.length; i++) {
      if (now2[i]) mask |= 1 << i;
      if (now2[i] && !this._padPrev[i]) { active = true; pressedNames.push(BUTTONS[i]); }
    }
    P.buttons = mask;
    const want = new Set();
    for (const [name, code] of Object.entries(PAD_KEYS)) if (now2[BUTTONS.indexOf(name)]) want.add(code);
    const stick = (code, v) => { if (v > (this._padDown.has(code) ? STICK_OFF : STICK_ON)) want.add(code); };
    stick('KeyW', P.move.y); stick('KeyS', -P.move.y); stick('KeyD', P.move.x); stick('KeyA', -P.move.x);
    for (const c of [...this._hush]) { if (want.has(c)) want.delete(c); else this._hush.delete(c); }
    for (const c of want) if (!this._padDown.has(c)) this._padPressed.add(c);
    for (const c of this._padDown) if (!want.has(c)) this._padReleased.add(c);
    this._padDown = want;
    const lt = now2[6];
    if (lt && !(this._padMouse & 4)) this._padMousePressed.add(2);
    this._padMouse = lt ? 4 : 0;
    const dir = (now2[13] ? 1 : 0) - (now2[12] ? 1 : 0);
    if (dir && dir !== this._wheelDir) { this._padWheel = dir; this._wheelT = 0.35; }
    else if (dir) { this._wheelT -= dt; if (this._wheelT <= 0) { this._padWheel = dir; this._wheelT += 0.12; } }
    this._wheelDir = dir;
    this.mouse.wheel += this._padWheel;
    this._padPrev = now2;
    if (active) this._use('pad');
    for (const n of pressedNames) for (const fn of [...this._buttonListeners]) fn(n);
  }

  lock() {
    if (this.auto || !this.canvas?.requestPointerLock) return Promise.resolve(false);
    const plain = () => { try { const r = this.canvas.requestPointerLock(); return r?.then ? r.then(() => true, () => false) : Promise.resolve(true); } catch { return Promise.resolve(false); } };
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); return p?.then ? p.then(() => true, plain) : Promise.resolve(true); } catch { return plain(); }
  }

  unlock() { if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock(); }

  onLockChange(fn) { this._lockListeners.add(fn); return () => this._lockListeners.delete(fn); }

  onDevice(fn) { this._deviceListeners.add(fn); return () => this._deviceListeners.delete(fn); }

  onButton(fn) { this._buttonListeners.add(fn); return () => this._buttonListeners.delete(fn); }

  onKey(fn) { this._keyListeners.add(fn); return () => this._keyListeners.delete(fn); }

  hush() { this.clear(); for (const c of this._padDown) this._hush.add(c); }

  padButton(name) { const i = BUTTONS.indexOf(name); return i >= 0 && (this.pad.buttons & (1 << i)) !== 0; }

  fromPad(code) { return this._padDown.has(code) && !this._down.has(code); }

  down(code) { return this.enabled && (this._down.has(code) || this._padDown.has(code)); }

  pressed(code) { return this.enabled && (this._pressed.has(code) || this._padPressed.has(code)); }

  released(code) { return this._released.has(code) || this._padReleased.has(code); }

  any(codes) { return codes.some(c => this.down(c)); }

  mouseDown(button = 0) { return this.enabled && ((this.mouse.buttons | this._padMouse) & (1 << button)) !== 0; }

  mousePressed(button = 0) { return this.enabled && (this._mPressed.has(button) || this._padMousePressed.has(button)); }

  look() { return this.enabled ? { x: this.mouse.dx * this.sensitivity + this._padLookD.x, y: this.mouse.dy * this.sensitivity * (this.invertY ? -1 : 1) + this._padLookD.y } : { x: 0, y: 0 }; }

  axis(name) {
    const a = AXES[name];
    if (!a) return 0;
    if (!this.enabled) return Array.isArray(a) ? 0 : { x: 0, y: 0 };
    const has = codes => codes.some(c => this._down.has(c));
    const v = pair => (has(pair[1]) ? 1 : 0) - (has(pair[0]) ? 1 : 0);
    const c = x => Math.max(-1, Math.min(1, x));
    if (Array.isArray(a)) return c(v(a) + (name === 'rise' ? this.pad.rise : name === 'roll' ? this.pad.roll : 0));
    return { x: c(v(a.x) + this.pad.move.x), y: c(v(a.y) + this.pad.move.y) };
  }

  rumble(strength = 0.5, seconds = 0.2) {
    if (!this.vibration || this._fake || this.auto || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    try {
      const gp = this._padIndex >= 0 ? navigator.getGamepads()[this._padIndex] : null;
      const act = gp?.vibrationActuator;
      if (!act?.playEffect) return;
      const s = Math.max(0, Math.min(1, +strength || 0));
      const r = act.playEffect('dual-rumble', { startDelay: 0, duration: Math.max(0, seconds) * 1000, strongMagnitude: s, weakMagnitude: Math.min(1, s * 0.6) });
      if (r?.catch) r.catch(() => {});
    } catch {}
  }

  setPad(state) {
    this._fake = state ? { id: state.id || 'virtual pad', connected: true, mapping: 'standard', axes: state.axes || [0, 0, 0, 0], buttons: state.buttons || [] } : null;
  }

  clear() { this._down.clear(); this._held.clear(); this.mouse.buttons = 0; }

  endFrame(dt = 0) {
    this._pressed.clear(); this._released.clear(); this._mPressed.clear(); this._mReleased.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    for (const [code, h] of this._held) {
      h.t -= dt;
      if (h.t <= 0) { this._held.delete(code); this.setKey(code, false); }
    }
    this.poll();
  }

  setKey(code, isDown) {
    if (isDown) { if (!this._down.has(code)) this._pressed.add(code); this._down.add(code); }
    else if (this._down.has(code)) { this._down.delete(code); this._released.add(code); }
  }

  tap(code) { this.hold(code, 0.0001); }

  hold(code, seconds) { this.setKey(code, true); this._held.set(code, { t: seconds }); }

  setMouse(button, isDown) {
    if (isDown) { this.mouse.buttons |= 1 << button; this._mPressed.add(button); }
    else { this.mouse.buttons &= ~(1 << button); this._mReleased.add(button); }
  }

  moveMouse(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }

  scroll(n) { this.mouse.wheel += n; }
}
