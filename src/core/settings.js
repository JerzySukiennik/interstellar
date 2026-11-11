// Interstellar settings: look, sound, vibration, guidance and resolution, persisted under their own localStorage key and applied live to input, audio, ui and engine.
export const SETTINGS_KEY = 'interstellar.settings.v1';

const LOOK = [0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.7, 2, 2.4];
const VOLUME = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const pct = v => `${Math.round(v * 100)}%`;
const times = v => `${v.toFixed(2).replace(/0$/, '')}×`;

export const SPEC = [
  { id: 'mouseLook', label: 'mouse look', kind: 'scale', steps: LOOK, def: 1, fmt: times, group: 'look' },
  { id: 'padLook', label: 'controller look', kind: 'scale', steps: LOOK, def: 1, fmt: times, group: 'look' },
  { id: 'invertY', label: 'invert vertical look', kind: 'toggle', def: false, group: 'look' },
  { id: 'master', label: 'volume', kind: 'scale', steps: VOLUME, def: 1, fmt: pct, group: 'sound' },
  { id: 'music', label: 'music', kind: 'scale', steps: VOLUME, def: 1, fmt: pct, group: 'sound' },
  { id: 'vibration', label: 'vibration', kind: 'toggle', def: true, group: 'controller' },
  { id: 'guidance', label: 'guidance', kind: 'choice', options: [['full', 'full'], ['reduced', 'reduced']], def: 'full', group: 'play', note: { reduced: 'flight lines and control lessons hidden, prompts stay' } },
  { id: 'resolution', label: 'resolution', kind: 'choice', options: [['auto', 'automatic'], ['full', 'full']], def: 'auto', group: 'play', note: { auto: 'lowered in heavy scenes to hold the frame rate', full: 'always full, may drop frames' } },
];

const BASE = { sensitivity: 0.0022, yaw: 3.4, pitch: 2.3 };

function valid(spec, v) {
  if (spec.kind === 'toggle') return typeof v === 'boolean';
  if (spec.kind === 'choice') return spec.options.some(o => o[0] === v);
  return typeof v === 'number' && Number.isFinite(v) && v >= spec.steps[0] - 1e-9 && v <= spec.steps[spec.steps.length - 1] + 1e-9;
}

function nearestStep(steps, v) {
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (Math.abs(steps[i] - v) < Math.abs(steps[best] - v)) best = i;
  return best;
}

export class Settings {
  constructor({ storage = safeStorage(), key = SETTINGS_KEY } = {}) {
    this.storage = storage;
    this.key = key;
    this.values = Object.fromEntries(SPEC.map(s => [s.id, s.def]));
    this._listeners = new Set();
    this.load();
  }

  spec(id) { return SPEC.find(s => s.id === id) || null; }

  get(id) { return this.values[id]; }

  set(id, v) {
    const s = this.spec(id);
    if (!s) return false;
    if (s.kind === 'scale') v = s.steps[nearestStep(s.steps, +v)];
    if (!valid(s, v) || this.values[id] === v) return false;
    this.values[id] = v;
    this.save();
    for (const fn of [...this._listeners]) fn(id, v);
    return true;
  }

  step(id, dir = 1, wrap = false) {
    const s = this.spec(id);
    if (!s) return false;
    if (s.kind === 'toggle') return this.set(id, !this.values[id]);
    const list = s.kind === 'scale' ? s.steps : s.options.map(o => o[0]);
    const i = s.kind === 'scale' ? nearestStep(s.steps, this.values[id]) : list.indexOf(this.values[id]);
    let j = i + Math.sign(dir || 1);
    if (wrap) j = (j + list.length) % list.length;
    j = Math.max(0, Math.min(list.length - 1, j));
    return this.set(id, list[j]);
  }

  index(id) { const s = this.spec(id); return s?.kind === 'scale' ? nearestStep(s.steps, this.values[id]) : -1; }

  text(id) {
    const s = this.spec(id), v = this.values[id];
    if (!s) return '';
    if (s.kind === 'toggle') return v ? 'on' : 'off';
    if (s.kind === 'choice') return s.options.find(o => o[0] === v)?.[1] ?? String(v);
    return s.fmt ? s.fmt(v) : String(v);
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  load() {
    let raw = null;
    try { raw = this.storage?.getItem(this.key) ?? null; } catch {}
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch { return false; }
    if (!data || typeof data !== 'object') return false;
    for (const s of SPEC) if (s.id in data && valid(s, data[s.id])) this.values[s.id] = s.kind === 'scale' ? s.steps[nearestStep(s.steps, data[s.id])] : data[s.id];
    return true;
  }

  save() { if (!this.storage) return false; try { this.storage.setItem(this.key, JSON.stringify(this.values)); return true; } catch { return false; } }

  reset() { for (const s of SPEC) this.set(s.id, s.def); }

  bind(ctx, { except = [] } = {}) {
    const run = id => { if (!except.includes(id)) applyOne(ctx, id, this.values[id]); };
    for (const s of SPEC) run(s.id);
    return this.onChange(id => run(id));
  }
}

export function applyOne(ctx, id, v) {
  const { input, audio, ui, engine } = ctx;
  if (id === 'mouseLook' && input) input.sensitivity = BASE.sensitivity * v;
  else if (id === 'padLook' && input?.padLook) { input.padLook.yaw = BASE.yaw * v; input.padLook.pitch = BASE.pitch * v; }
  else if (id === 'invertY' && input) { input.invertY = !!v; if (input.padLook) input.padLook.invertY = !!v; }
  else if (id === 'master') audio?.setMasterVolume?.(v, 0.15);
  else if (id === 'music') audio?.setMusicVolume?.(v, 0.15);
  else if (id === 'vibration' && input) input.vibration = !!v;
  else if (id === 'guidance' && ui) ui.guidance = v;
  else if (id === 'resolution' && engine) {
    const dyn = v !== 'full';
    if (engine.dynamic === dyn) return;
    engine.dynamic = dyn;
    if (!dyn && engine.scale !== 1) { engine.scale = 1; engine.resize?.(); }
  }
}

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
