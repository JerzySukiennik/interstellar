// Interstellar prompts: key tokens to device labels for keys, Xbox and PlayStation, device variants in strings, lesson texts, the controller connection guide, and the controls table that the menu and docs/CONTROLS.md share.
const XBOX = {
  E: 'A', Enter: 'A', V: 'B', R: 'X', T: 'Y', Space: 'RB', C: 'LB', Shift: 'RT', RMB: 'LT',
  W: 'LS ↑', S: 'LS ↓', A: 'LS ←', D: 'LS →', Q: 'D-pad ←', Z: 'D-pad ←', X: 'D-pad →',
  Mouse: 'RS', Wheel: 'D-pad ↑↓', Esc: 'Start', Click: 'A',
  WASD: 'LS', ZX: 'D-pad ←→', QE: 'D-pad ←→', Menu: 'Start', Back: 'B', Select: 'A', Nav: 'D-pad ↑↓', Adjust: 'D-pad ←→',
  PS: 'PS', Create: 'Create', Share: 'Share',
};

const PS = { ...XBOX, E: '✕', Enter: '✕', V: '○', R: '□', T: '△', Space: 'R1', C: 'L1', Shift: 'R2', RMB: 'L2', Esc: 'Options', Click: '✕', Menu: 'Options', Back: '○', Select: '✕' };

const KEYS = { WASD: 'W A S D', ZX: 'Z X', QE: 'Q E', Mouse: 'mouse', RMB: 'right mouse', Wheel: 'wheel', Menu: 'Esc', Back: 'Esc', Select: 'Enter', Nav: '↑ ↓', Adjust: '← →', Click: 'click', PS: 'PS', Create: 'Create', Share: 'Share' };

const ALIAS = { ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Esc', ArrowUp: 'W', ArrowDown: 'S', ArrowLeft: 'A', ArrowRight: 'D', LMB: 'Click' };

const LOOSE = new Set(['E', 'R', 'T', 'V', 'C', 'Q', 'Z', 'X', 'W', 'S', 'Space', 'Shift', 'Enter']);

let input = null;
const listeners = new Set();
let unbind = null;

export function attach(inp) {
  unbind?.();
  input = inp || null;
  unbind = input?.onDevice ? input.onDevice(d => { for (const fn of [...listeners]) fn(d); }) : null;
}

export function device() { return input?.device === 'pad' ? 'pad' : 'keys'; }

export function style() { return input?.pad?.style === 'playstation' ? 'playstation' : 'xbox'; }

function norm(token) {
  let t = String(token).trim();
  if (/^Key[A-Z]$/.test(t)) t = t.slice(3);
  return ALIAS[t] || (t.length === 1 ? t.toUpperCase() : t);
}

export function label(token, dev = device(), sty = style()) {
  if (token == null || token === '') return token;
  if (dev !== 'pad') return KEYS[String(token).trim()] ?? token;
  const map = sty === 'playstation' ? PS : XBOX;
  return map[norm(token)] ?? token;
}

export function variant(text, dev = device()) {
  if (text == null) return text;
  return String(text).replace(/\{([^|{}]*)\|([^{}]*)\}/g, (m, a, b) => (dev === 'pad' ? b : a));
}

export function translate(text, dev = device(), sty = style()) {
  if (text == null) return text;
  return variant(text, dev).replace(/\[([^\]]+)\]/g, (m, t) => `[${label(t, dev, sty)}]`);
}

export function translateLoose(text, dev = device()) {
  if (text == null || dev !== 'pad') return text;
  return String(text).replace(/(^|\s)([A-Z][a-z]*)(?=\s|$)/g, (m, s, t) => (LOOSE.has(t) ? s + label(t, dev) : m));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const LESSONS = {
  move: '[WASD] move   [Mouse] look',
  ladder: 'stand under the ladder, look up and {hold|push} [W] to climb',
  climb: 'keep {holding|pushing} [W] to climb',
  climbdown: 'look down and {hold|push} [W] to climb down',
  float: '[WASD] float   [Space] up   [C] down   [ZX] roll',
  wrist: 'look down at your wrist',
  suit: '[WASD] fly   [Space] up   [C] down   hold [Shift] to boost',
  steer: '[Mouse] turns the ship   [WASD] thrusters   [ZX] roll',
};

export const CONTROLS = [
  { id: 'foot', title: 'on foot', rows: [
    ['move', '[WASD]'],
    ['look', '[Mouse]'],
    ['run, wade faster', 'hold [Shift]'],
    ['use', '[E]'],
    ['hold to use', 'hold [E]'],
    ['climb a ladder', 'look up, {hold|push} [W]'],
    ['climb down', 'look down, {hold|push} [W]'],
    ['read the wrist display', 'look down'],
    ['scroll the messages', '[Wheel]'],
    ['third-person view', '[V]'],
  ] },
  { id: 'float', title: 'zero-g and suit', rows: [
    ['float', '[WASD]'],
    ['look', '[Mouse]'],
    ['up', '[Space]'],
    ['down', '[C]'],
    ['roll', '[ZX]'],
    ['boost (suit)', 'hold [Shift]'],
    ['use', '[E]'],
    ['third-person view', '[V]'],
  ] },
  { id: 'flight', title: 'flight', rows: [
    ['pitch and yaw', '[Mouse]'],
    ['thrusters', '[WASD]'],
    ['thrusters up, lift off', '[Space]'],
    ['thrusters down, descend', '[C]'],
    ['roll', '[ZX]'],
    ['stop the roll', 'hold [R]'],
    ['align, docking assist', 'hold [T]'],
    ['main engine, burn', 'hold [Shift]'],
    ['free look', 'hold [RMB]'],
    ['chase view', '[V]'],
  ] },
  { id: 'menu', title: 'menus', rows: [
    ['pause menu', '[Menu]'],
    ['choose', '[Nav]'],
    ['change a setting', '[Adjust]'],
    ['select', '[Select]'],
    ['back', '[Back]'],
    ['begin again at the end', 'hold [E]'],
  ] },
];

export const PAD_GUIDE = [
  { id: 'cable', title: 'cable', text: 'The easiest way. Plug the pad into the laptop with a USB cable: USB-C for a PS5 pad, micro-USB for a PS4 pad. It works at once, nothing to pair.' },
  { id: 'wireless', title: 'wireless', steps: [
    'Turn the PlayStation fully off (not rest mode) or unplug it, or [PS] will wake the console instead.',
    'Hold [PS] for about 10 seconds, until the light on the pad goes out.',
    'Pairing mode: hold [Create] and [PS] on a PS5 pad, or [Share] and [PS] on a PS4 pad, until the light flashes quickly.',
    'On the laptop open Settings, Bluetooth and devices, Add device, Bluetooth, and choose "Wireless Controller".',
    'The light turns steady when the pad is connected.',
  ] },
  { id: 'game', title: 'in the game', text: 'Press any button on the pad. The browser only sees the pad after the first press. The prompts then switch to its symbols.' },
  { id: 'console', title: 'afterwards', text: 'Back to the console: connect the pad to the PlayStation with the cable and press [PS].' },
];

const PAD_NAMES = { '0ce6': 'DualSense (PS5 pad)', '0df2': 'DualSense Edge (PS5 pad)', '05c4': 'DualShock 4 (PS4 pad)', '09cc': 'DualShock 4 (PS4 pad)', '0ba0': 'DualShock 4 (PS4 pad)' };

export function padName(id) {
  const s = String(id || '');
  const m = /054c\D+([0-9a-f]{4})/i.exec(s);
  if (m && PAD_NAMES[m[1].toLowerCase()]) return PAD_NAMES[m[1].toLowerCase()];
  const name = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').replace(/\s+/g, ' ').trim();
  return name || 'controller';
}

export function controlRows(dev = device(), sty = style()) {
  return CONTROLS.map(g => ({ id: g.id, title: g.title, rows: g.rows.map(([action, bind]) => ({ action, bind: translate(bind, dev, sty) })) }));
}

export function controlsMarkdown() {
  const cell = (b, dev, sty) => translate(b, dev, sty).replace(/\[([^\]]+)\]/g, '$1');
  const lines = ['| Situation | Action | Keyboard and mouse | Xbox | PlayStation |', '|---|---|---|---|---|'];
  for (const g of CONTROLS) for (const [a, b] of g.rows) lines.push(`| ${g.title} | ${a} | ${cell(b, 'keys')} | ${cell(b, 'pad', 'xbox')} | ${cell(b, 'pad', 'playstation')} |`);
  return lines.join('\n');
}
