// Interstellar clock: ship time, Endurance time, dilation rate with ramps, month ticks, display formatting.
export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;
export const YEAR = 31557600;
export const MONTH = YEAR / 12;
export const TRANSIT = { ship: 9000, endurance: 9000 + MONTH };

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

export class Clock {
  constructor() {
    this.ship = 0;
    this.endurance = 0;
    this.rate = 1;
    this.ticks = 0;
    this.paused = false;
    this._ramp = null;
  }

  update(dt) {
    if (this.paused || dt <= 0) { this.ticks = 0; return; }
    if (this._ramp) {
      const r = this._ramp;
      r.t = Math.min(r.d, r.t + dt);
      const u = r.t / r.d, x = u * u * (3 - 2 * u);
      this.rate = Math.exp(Math.log(r.from) + (Math.log(r.to) - Math.log(r.from)) * x);
      if (r.t >= r.d) this._ramp = null;
    }
    const before = Math.floor(this.endurance / MONTH);
    this.ship += dt;
    this.endurance += dt * this.rate;
    this.ticks = this.rate >= MONTH * 0.25 ? Math.floor(this.endurance / MONTH) - before : 0;
  }

  rampTo(rate, seconds = 0) {
    rate = Math.max(1, rate);
    if (seconds <= 0) { this._ramp = null; this.rate = rate; return; }
    this._ramp = { from: Math.max(1, this.rate), to: rate, t: 0, d: seconds };
  }

  setRateLog(u) { this._ramp = null; this.rate = Math.exp(Math.log(MONTH) * Math.min(1, Math.max(0, u))); }

  advance(shipSeconds, enduranceSeconds = shipSeconds) { this.ship += shipSeconds; this.endurance += enduranceSeconds; }

  years() { return (this.endurance - this.ship) / YEAR; }

  months() { return (this.endurance - this.ship) / MONTH; }

  toJSON() { return { ship: this.ship, endurance: this.endurance, rate: this.rate }; }

  fromJSON(o) { if (!o) return this; this.ship = +o.ship || 0; this.endurance = +o.endurance || 0; this.rate = +o.rate || 1; this._ramp = null; return this; }

  format = {
    hms: s => `${pad(s / HOUR)}:${pad((s % HOUR) / MINUTE)}:${pad(s % MINUTE)}`,
    met: s => `${pad(s / DAY, 3)}/${pad((s % DAY) / HOUR)}:${pad((s % HOUR) / MINUTE)}:${pad(s % MINUTE)}`,
    ymd: s => { const y = Math.floor(s / YEAR), m = Math.floor((s % YEAR) / MONTH), d = Math.floor((s % MONTH) / DAY); return `${y}Y ${pad(m)}M ${pad(d)}D`; },
    years: s => (s / YEAR).toFixed(s / YEAR < 10 ? 2 : 1),
    duration: s => s < MINUTE ? `${s.toFixed(0)} s` : s < HOUR ? `${Math.floor(s / MINUTE)} min ${pad(s % MINUTE)} s` : s < DAY * 2 ? `${Math.floor(s / HOUR)} h ${pad((s % HOUR) / MINUTE)} min` : s < YEAR ? `${Math.floor(s / DAY)} days` : `${(s / YEAR).toFixed(1)} years`,
  };
}
