// Interstellar first-person controllers: frame mappings (flat, ring, attached), walking, zero-g floating, seated head look and Newtonian Ranger flight.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const STEP = 1 / 60;
const clamp = THREE.MathUtils.clamp;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toVec = (v, out = new THREE.Vector3()) => (v?.isVector3 ? out.copy(v) : out.fromArray(v || [0, 0, 0]));

function parentWorld(parent, out) { if (parent) { parent.updateWorldMatrix(true, false); out.applyMatrix4(parent.matrixWorld); } return out; }

export const frames = {
  flat(parent = null) {
    return {
      kind: 'flat', parent,
      toSpace: (l, out) => out.copy(l),
      basisSpace: (l, q) => q.identity(),
      toWorld(l, out) { return parentWorld(parent, out.copy(l)); },
      basis(l, q) { if (parent) { parent.updateWorldMatrix(true, false); return parent.getWorldQuaternion(q); } return q.identity(); },
      fromWorld(w, out) { out.copy(w); if (parent) { parent.updateWorldMatrix(true, false); parent.worldToLocal(out); } return out; },
      up: (l, out) => out.set(0, 1, 0),
    };
  },

  attached(parent) { const f = frames.flat(parent); f.kind = 'attached'; return f; },

  ring({ RF = 33.2, theta0 = 0, parent = null } = {}) {
    const f = {
      kind: 'ring', parent, RF, theta0,
      theta: s => theta0 + s / RF,
      toSpace(l, out) { const t = theta0 + l.x / RF, r = RF - l.y; return out.set(r * Math.cos(t), r * Math.sin(t), l.z); },
      basisSpace(l, q) {
        const t = theta0 + l.x / RF, c = Math.cos(t), s = Math.sin(t);
        _m.makeBasis(_v.set(-s, c, 0), _w.set(-c, -s, 0), Z);
        return q.setFromRotationMatrix(_m);
      },
      toWorld(l, out) { return parentWorld(parent, f.toSpace(l, out)); },
      basis(l, q) {
        f.basisSpace(l, q);
        if (parent) { parent.updateWorldMatrix(true, false); parent.getWorldQuaternion(_q2); q.premultiply(_q2); }
        return q;
      },
      fromWorld(w, out, hintS = 0) {
        out.copy(w);
        if (parent) { parent.updateWorldMatrix(true, false); parent.worldToLocal(out); }
        const t = Math.atan2(out.y, out.x), r = Math.hypot(out.x, out.y);
        const s0 = (t - theta0) * RF, per = Math.PI * 2 * RF;
        const s = s0 + Math.round((hintS - s0) / per) * per;
        return out.set(s, RF - r, out.z);
      },
      up(l, out) { return out.set(0, 1, 0); },
      gravityScale: l => Math.max(0, (RF - l.y) / RF),
    };
    return f;
  },
};

export const PRESETS = {
  walk: { speed: 1.45, runSpeed: 2.6, accel: 9, decel: 12, gravity: 9.81, eyeHeight: 1.65, bob: 0.028, sway: 0.006, stepLength: 0.78 },
  wade: { speed: 1.05, runSpeed: 1.35, accel: 1.4, decel: 2.2, gravity: 12.75, eyeHeight: 1.58, bob: 0.07, sway: 0.022, stepLength: 0.62 },
  aged: { speed: 1.2, runSpeed: 2.0, accel: 7, decel: 10, gravity: 9.81, eyeHeight: 1.62, bob: 0.03, sway: 0.008, stepLength: 0.72 },
  float: { accel: 1.0, maxSpeed: 1.7, drag: 0.35, thrustDrag: 0.08, rollRate: 1.1, bounce: 0.3, collide: true, boost: 1 },
  suit: { accel: 3.2, maxSpeed: 6, drag: 0.6, thrustDrag: 0.1, rollRate: 1.4, bounce: 0, collide: false, boost: 3.5 },
  space: { rcs: [2.2, 2.2, 2.8], main: 22, rotAccel: 1.4, mouseGain: 1.15, maxRate: 1.1, damping: 2.2, gravity: null, hover: false, level: false, drag: 0 },
  atmo: { rcs: [6, 9, 7], main: 26, rotAccel: 1.6, mouseGain: 1.0, maxRate: 0.9, damping: 3, gravity: [0, -12.75, 0], hover: true, level: true, drag: 0.12 },
};

function lookDeltas(input) {
  const l = input.look();
  return { yaw: -l.x, pitch: -l.y, roll: input.axis('roll') };
}

export class WalkController {
  constructor(o = {}) {
    this.camera = o.camera;
    this.frame = o.frame || frames.flat();
    this.colliders = (o.colliders || []).map(box);
    this.liveColliders = o.liveColliders ?? false;
    this.floors = o.floors || [];
    this.floor = o.floor === undefined ? 0 : o.floor;
    this.ladders = (o.ladders || []).map(z => ({ ...z, b: box(z) }));
    this.radius = o.radius ?? 0.3;
    this.height = o.height ?? 1.8;
    this.stepUp = o.stepUp ?? 0.35;
    this.onStep = o.onStep || null;
    this.interact = o.interact || null;
    this.gravityScale = 1;
    this.position = toVec(o.position);
    this.velocity = new THREE.Vector3();
    this.yaw = o.yaw ?? 0;
    this.pitch = o.pitch ?? 0;
    this.quaternion = new THREE.Quaternion();
    this.onGround = false;
    this.ladder = null;
    this.enabled = true;
    this.look = true;
    this.move = true;
    this._phase = 0;
    this._steps = 0;
    this._bobY = 0;
    this._roll = 0;
    this.setPreset(o.preset || 'walk', o);
    this._apply();
  }

  setPreset(p, over = {}) {
    const P = typeof p === 'string' ? PRESETS[p] : p;
    this.preset = typeof p === 'string' ? p : 'custom';
    for (const k of ['speed', 'runSpeed', 'accel', 'decel', 'gravity', 'eyeHeight', 'bob', 'sway', 'stepLength']) this[k] = over[k] ?? P[k] ?? PRESETS.walk[k];
  }

  addLadder(z) { const L = { ...z, b: box(z) }; this.ladders.push(L); return L; }

  setColliders(list) { this.colliders = list.map(box); }

  collider(id) { return this.colliders.find(c => c.id === id) || null; }

  worldPose(pos, quat) { this.frame.toWorld(this.position, pos); this.frame.basis(this.position, quat).multiply(this.quaternion); return { position: pos, quaternion: quat }; }

  teleport(pos, yaw = this.yaw, pitch = this.pitch) { toVec(pos, this.position); this.yaw = yaw; this.pitch = pitch; this.velocity.set(0, 0, 0); this.ladder = null; this._apply(); }

  groundAt(x, z, y) {
    let h = this.floor ?? -Infinity;
    for (const f of this.floors) {
      if (x < f.min[0] || x > f.max[0] || z < f.min[1] || z > f.max[1]) continue;
      const fy = typeof f.y === 'function' ? f.y(x, z) : f.y;
      if (fy <= y + this.stepUp && fy > h) h = fy;
    }
    return h;
  }

  update(dt, input) {
    if (!this.enabled) return;
    if (this.look) {
      const d = lookDeltas(input);
      this.yaw = wrap(this.yaw + d.yaw);
      this.pitch = clamp(this.pitch + d.pitch, -1.45, 1.45);
    }
    if (this.liveColliders) syncBoxes(this.colliders);
    if (this._rollOff || this._pitchOff) { const k = Math.exp(-dt / Math.max(0.05, (this._blendT || 0.4) / 3)); this._rollOff *= k; this._pitchOff *= k; if (Math.abs(this._rollOff) + Math.abs(this._pitchOff) < 1e-4) this._rollOff = this._pitchOff = 0; }
    const mv = this.move ? input.axis('move') : { x: 0, y: 0 };
    const run = this.move && input.down('ShiftLeft');
    let n = Math.ceil(dt / STEP), h = dt / Math.max(1, n);
    for (let i = 0; i < n; i++) this._step(h, mv, run, input);
    this._apply();
  }

  _step(dt, mv, run, input) {
    const p = this.position, v = this.velocity;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    if (this.ladder) return this._climb(dt, mv);
    for (const L of this.ladders) {
      const b = L.b;
      if (mv.y > 0 && (L.grabAny || this.pitch > 0.3) && p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && p.y >= b.min.y - 0.15 && p.y < b.max.y - 0.05) { this.ladder = L; v.set(0, 0, 0); this._climbed = 0; return; }
    }
    this.gravityScale = 1;
    const tx = (cy * mv.x - sy * mv.y), tz = (-sy * mv.x - cy * mv.y);
    const len = Math.max(1, Math.hypot(tx, tz));
    const sp = (run && this.runSpeed) ? this.runSpeed : this.speed;
    const want = mv.x || mv.y;
    const gx = want ? tx / len * sp : 0, gz = want ? tz / len * sp : 0;
    const a = (want ? this.accel : this.decel) * dt * (this.onGround ? 1 : 0.15);
    const dx = gx - v.x, dz = gz - v.z, dl = Math.hypot(dx, dz);
    if (dl > 0) { const k = Math.min(1, a / dl); v.x += dx * k; v.z += dz * k; }
    v.y -= this.gravity * this.gravityScale * dt;
    p.x += v.x * dt; p.z += v.z * dt; p.y += v.y * dt;
    const g = this.groundAt(p.x, p.z, p.y - v.y * dt);
    if (p.y <= g) { p.y = g; if (v.y < 0) v.y = 0; this.onGround = true; } else this.onGround = p.y - g < 0.02;
    this._collide();
    const hs = Math.hypot(v.x, v.z);
    if (this.onGround && hs > 0.05) {
      this._phase += hs * dt / this.stepLength * Math.PI;
      const k = Math.floor(this._phase / Math.PI);
      if (k !== this._steps) { this._steps = k; this.onStep?.({ foot: k & 1, speed: hs, preset: this.preset, position: p }); }
    } else this._phase += (Math.round(this._phase / Math.PI) * Math.PI - this._phase) * Math.min(1, dt * 6);
    const amp = Math.min(1, hs / this.speed);
    this._bobY = (Math.abs(Math.sin(this._phase)) - 0.5) * this.bob * amp;
    this._roll = Math.sin(this._phase) * this.sway * amp;
  }

  _climb(dt, mv) {
    const L = this.ladder, b = L.b, p = this.position;
    const u = clamp((p.y - b.min.y) / Math.max(0.01, b.max.y - b.min.y), 0, 1);
    this.gravityScale = L.gravity ? L.gravity(u, p) : 1;
    const sp = (L.speed ?? 0.9) * (1 + 2.2 * (1 - this.gravityScale));
    const cx = L.hang ? L.hang[0] : (b.min.x + b.max.x) / 2, cz = L.hang ? L.hang[1] : (b.min.z + b.max.z) / 2;
    p.x += (cx - p.x) * Math.min(1, dt * 3); p.z += (cz - p.z) * Math.min(1, dt * 3);
    const c = mv.y * (L.lookClimb !== false && this.pitch < -0.35 ? -1 : 1);
    const vy = c * sp;
    p.y = clamp(p.y + vy * dt, b.min.y, b.max.y);
    this.velocity.set(0, vy, 0);
    this._climbed += Math.abs(vy * dt);
    if (this._climbed > (L.rung ?? 0.3)) { this._climbed = 0; this.onStep?.({ foot: (this._steps++) & 1, speed: Math.abs(vy), preset: 'ladder', position: p, gravity: this.gravityScale }); }
    const lowG = Math.max(0, 1 - this.gravityScale * 2.2);
    this._lowT = (this._lowT || 0) + dt;
    this._bobY = lowG * 0.035 * Math.sin(this._lowT * 1.3);
    this._roll = lowG * 0.02 * Math.sin(this._lowT * 0.7 + 1);
    if (p.y < b.max.y - 0.05) L._fired = false;
    if (p.y >= b.max.y - 1e-3 && c > 0 && !L._fired) { L._fired = true; L.onTop?.(this); }
    else if (p.y <= b.min.y + 1e-3 && c < 0) { if (L.onBottom) L.onBottom(this); else this.ladder = null; }
  }

  grab(id, y) {
    const L = typeof id === 'string' ? this.ladders.find(l => l.id === id) : this.ladders.find(l => l === id || l.id === id?.id);
    if (!L) return null;
    this.ladder = L;
    this.velocity.set(0, 0, 0);
    this._climbed = 0;
    if (y !== undefined) this.position.y = clamp(y, L.b.min.y, L.b.max.y);
    return L;
  }

  release() { this.ladder = null; }

  setFrame(frame, { hintS, keepYaw = false } = {}) {
    const wp = this.frame.toWorld(this.position, new THREE.Vector3());
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    const wq = this.frame.basis(this.position, new THREE.Quaternion()).multiply(_q.setFromEuler(_e));
    this.frame = frame;
    frame.fromWorld(wp, this.position, hintS ?? this.position.x);
    if (!keepYaw) {
      const lq = frame.basis(this.position, new THREE.Quaternion()).invert().multiply(wq);
      _e.setFromQuaternion(lq, 'YXZ');
      this.yaw = _e.y; this.pitch = clamp(_e.x, -1.45, 1.45);
    }
    this._apply();
  }

  setLook(worldQuat, { blend = 0.4 } = {}) {
    const lq = this.frame.basis(this.position, new THREE.Quaternion()).invert().multiply(worldQuat);
    _e.setFromQuaternion(lq, 'YXZ');
    this.yaw = _e.y;
    this._pitchOff = blend > 0 ? _e.x - clamp(_e.x, -1.45, 1.45) : 0;
    this.pitch = clamp(_e.x, -1.45, 1.45);
    this._rollOff = blend > 0 ? _e.z : 0;
    this._blendT = blend;
    this._apply();
  }

  _collide() {
    const p = this.position, v = this.velocity, r = this.radius;
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) {
        if (b.max.y <= p.y + this.stepUp || b.min.y >= p.y + this.height) continue;
        const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else {
          const o = [p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z];
          const i = o.indexOf(Math.min(...o));
          nx = [-1, 1, 0, 0][i]; nz = [0, 0, -1, 1][i]; pen = o[i] + r;
        }
        p.x += nx * pen; p.z += nz * pen;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
      }
    }
  }

  eye(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + this.eyeHeight + this._bobY, this.position.z); }

  _apply() {
    _e.set(this.pitch, this.yaw, this._roll, 'YXZ');
    this.quaternion.setFromEuler(_e);
    if (!this.camera) return;
    this.eye(_u);
    if (this._rollOff || this._pitchOff) _e.set(this.pitch + (this._pitchOff || 0), this.yaw, this._roll + (this._rollOff || 0), 'YXZ');
    this.frame.toWorld(_u, this.camera.position);
    this.frame.basis(_u, this.camera.quaternion).multiply(_q.setFromEuler(_e));
    this.camera.updateMatrixWorld();
  }
}

export class FloatController {
  constructor(o = {}) {
    this.camera = o.camera;
    this.frame = o.frame || frames.flat();
    this.colliders = (o.colliders || []).map(box);
    this.liveColliders = o.liveColliders ?? false;
    this.radius = o.radius ?? 0.35;
    this.interact = o.interact || null;
    this.position = toVec(o.position);
    this.velocity = toVec(o.velocity);
    this.quaternion = o.quaternion ? o.quaternion.clone() : new THREE.Quaternion();
    this.enabled = true;
    this.look = true;
    this.move = true;
    this.thrust = new THREE.Vector3();
    this.onBump = o.onBump || null;
    this.setPreset(o.preset || 'float', o);
    this._apply();
  }

  setPreset(p, over = {}) {
    const P = typeof p === 'string' ? PRESETS[p] : p;
    this.preset = typeof p === 'string' ? p : 'custom';
    for (const k of ['accel', 'maxSpeed', 'drag', 'thrustDrag', 'rollRate', 'bounce', 'collide', 'boost']) this[k] = over[k] ?? P[k] ?? PRESETS.float[k];
  }

  setFrame(frame) {
    const wp = this.frame.toWorld(this.position, new THREE.Vector3());
    const wq = this.frame.basis(this.position, new THREE.Quaternion()).multiply(this.quaternion);
    const wv = this.velocity.clone().applyQuaternion(this.frame.basis(this.position, _q));
    this.frame = frame;
    frame.fromWorld(wp, this.position);
    const inv = frame.basis(this.position, new THREE.Quaternion()).invert();
    this.quaternion.copy(inv).multiply(wq).normalize();
    this.velocity.copy(wv).applyQuaternion(inv);
    this._apply();
  }

  setColliders(list) { this.colliders = list.map(box); }

  worldPose(pos, quat) { this.frame.toWorld(this.position, pos); this.frame.basis(this.position, quat).multiply(this.quaternion); return { position: pos, quaternion: quat }; }

  teleport(pos, quat) { toVec(pos, this.position); if (quat) this.quaternion.copy(quat); this.velocity.set(0, 0, 0); this._apply(); }

  update(dt, input) {
    if (!this.enabled) return;
    if (this.look) {
      const d = lookDeltas(input);
      _q.setFromAxisAngle(Y, d.yaw); this.quaternion.multiply(_q);
      _q.setFromAxisAngle(X, d.pitch); this.quaternion.multiply(_q);
      _q.setFromAxisAngle(Z, d.roll * this.rollRate * dt); this.quaternion.multiply(_q);
      this.quaternion.normalize();
    }
    if (this.liveColliders) syncBoxes(this.colliders);
    const mv = this.move ? input.axis('move') : { x: 0, y: 0 };
    const rise = this.move ? input.axis('rise') : 0;
    const boost = this.move && input.down('ShiftLeft') ? this.boost : 1;
    this.thrust.set(mv.x, rise, -mv.y);
    if (this.thrust.lengthSq() > 1) this.thrust.normalize();
    this.thrust.applyQuaternion(this.quaternion);
    const n = Math.ceil(dt / STEP), h = dt / Math.max(1, n);
    for (let i = 0; i < n; i++) this._step(h, boost);
    this._apply();
  }

  _step(dt, boost) {
    const v = this.velocity, thrusting = this.thrust.lengthSq() > 0;
    v.addScaledVector(this.thrust, this.accel * boost * dt);
    const max = this.maxSpeed * boost, s = v.length();
    if (s > max) v.multiplyScalar(Math.max(max / s, 1 - dt * 2));
    v.multiplyScalar(Math.exp(-(thrusting ? this.thrustDrag : this.drag) * dt));
    this.position.addScaledVector(v, dt);
    if (this.collide) this._collide();
  }

  _collide() {
    const p = this.position, v = this.velocity, r = this.radius;
    for (const b of this.colliders) {
      _v.set(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z));
      _w.subVectors(p, _v);
      let d = _w.length();
      if (d >= r) continue;
      if (d < 1e-6) {
        const o = [p.x - b.min.x, b.max.x - p.x, p.y - b.min.y, b.max.y - p.y, p.z - b.min.z, b.max.z - p.z];
        const i = o.indexOf(Math.min(...o));
        _w.set(...[[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]][i]);
        d = -o[i];
      } else _w.divideScalar(d);
      p.addScaledVector(_w, r - d);
      const vn = v.dot(_w);
      if (vn < 0) {
        v.addScaledVector(_w, -vn * (1 + this.bounce));
        v.multiplyScalar(0.92);
        this.onBump?.({ speed: -vn, normal: _w.clone(), position: p });
      }
    }
  }

  _apply() {
    if (!this.camera) return;
    this.frame.toWorld(this.position, this.camera.position);
    this.frame.basis(this.position, this.camera.quaternion).multiply(this.quaternion);
    this.camera.updateMatrixWorld();
  }
}

export class SeatController {
  constructor(o = {}) {
    this.camera = o.camera;
    this.anchor = o.anchor;
    this.yawLimit = o.yawLimit ?? 2.0;
    this.pitchLimit = o.pitchLimit ?? 1.2;
    this.yaw = o.yaw ?? 0;
    this.pitch = o.pitch ?? 0;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.enabled = true;
    this.look = true;
    this._apply();
  }

  update(dt, input) {
    if (!this.enabled) return;
    if (this.look) {
      const l = input.look();
      this.yaw = clamp(this.yaw - l.x, -this.yawLimit, this.yawLimit);
      this.pitch = clamp(this.pitch - l.y, -this.pitchLimit, this.pitchLimit);
    }
    this._apply();
  }

  _apply() {
    const a = this.anchor;
    a.updateWorldMatrix(true, false);
    this.position.copy(a.position);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    this.quaternion.copy(a.quaternion).multiply(_q.setFromEuler(_e));
    if (!this.camera) return;
    a.getWorldPosition(this.camera.position);
    a.getWorldQuaternion(this.camera.quaternion).multiply(_q.setFromEuler(_e));
    this.camera.updateMatrixWorld();
  }
}

export class FlightController {
  constructor(o = {}) {
    this.body = o.body;
    this.camera = o.camera;
    this.eye = o.eye || null;
    this.eyeOffset = toVec(o.eyeOffset || [0, 1.1, -5.5]);
    this.interact = o.interact || null;
    this.velocity = toVec(o.velocity);
    this.angularVelocity = toVec(o.angularVelocity);
    this.throttle = 0;
    this.rcs = new THREE.Vector3();
    this.assist = { rate: true, rollNull: false, align: false, ...(o.assist || {}) };
    this.rollTarget = o.rollTarget ?? 0;
    this.alignTarget = o.alignTarget || null;
    this.alignError = null;
    this.ground = o.ground || null;
    this.onContact = o.onContact || null;
    this.landed = false;
    this.enabled = true;
    this.controls = true;
    this.head = { yaw: 0, pitch: 0, free: false };
    this.groundLook = o.groundLook ?? false;
    this._idle = 0;
    this.setPreset(o.preset || 'space', o);
    this._apply();
  }

  setPreset(p, over = {}) {
    const P = typeof p === 'string' ? PRESETS[p] : p;
    this.preset = typeof p === 'string' ? p : 'custom';
    for (const k of ['main', 'rotAccel', 'mouseGain', 'maxRate', 'damping', 'hover', 'level', 'drag']) this[k] = over[k] ?? P[k] ?? PRESETS.space[k];
    this.rcsAccel = toVec(over.rcs ?? P.rcs ?? PRESETS.space.rcs);
    const g = over.gravity !== undefined ? over.gravity : P.gravity;
    this.gravity = g ? toVec(g) : null;
  }

  get position() { return this.body.position; }

  get quaternion() { return this.body.quaternion; }

  get state() {
    return { position: this.body.position, quaternion: this.body.quaternion, velocity: this.velocity, angularVelocity: this.angularVelocity, throttle: this.throttle, rcs: this.rcs, assist: this.assist, alignError: this.alignError, rollRate: this.angularVelocity.z, landed: this.landed, speed: this.velocity.length() };
  }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.body.quaternion); }

  _nearInteract() {
    const I = this.interact;
    if (!I?.items || !this.camera) return false;
    this.camera.getWorldPosition(_w);
    return I.items.some(o => I.isEnabled(o) && I.center(o, _u).distanceTo(_w) <= (o.userData.interact.range ?? I.defaultRange));
  }

  update(dt, input) {
    if (!this.enabled) { this._apply(); return; }
    const c = this.controls;
    const look = c ? input.look() : { x: 0, y: 0 };
    this.head.free = c && (input.mouseDown(2) || (this.groundLook && this.landed && input.axis('rise') <= 0));
    let yawIn = 0, pitchIn = 0;
    if (this.head.free) {
      this.head.yaw = clamp(this.head.yaw - look.x, -2.4, 2.4);
      this.head.pitch = clamp(this.head.pitch - look.y, -1.2, 1.2);
    } else {
      const k = Math.min(1, dt * 4);
      this.head.yaw -= this.head.yaw * k; this.head.pitch -= this.head.pitch * k;
      yawIn = -look.x; pitchIn = -look.y;
    }
    if (input.pressed('KeyE')) this._eLatch = !!this.interact?.current || this._nearInteract();
    if (!input.down('KeyE')) this._eLatch = false;
    const roll = c ? clamp((input.down('KeyQ') ? 1 : 0) - (input.down('KeyE') && !input.fromPad?.('KeyE') && !this._eLatch && !this.interact?.current ? 1 : 0) + input.axis('roll'), -1, 1) : 0;
    const mv = c ? input.axis('move') : { x: 0, y: 0 };
    const rise = c ? input.axis('rise') : 0;
    this.assist.rollNull = c && input.down('KeyR') || this.assist.rollNullLatch === true;
    this.assist.align = c && input.down('KeyT') || this.assist.alignLatch === true;
    const burn = c && input.down('ShiftLeft');
    this.rcs.set(mv.x, rise, -mv.y);
    const w = this.angularVelocity;
    w.y += yawIn * this.mouseGain;
    w.x += pitchIn * this.mouseGain;
    this._idle = yawIn || pitchIn ? 0 : this._idle + dt;
    const n = Math.ceil(dt / STEP), h = dt / Math.max(1, n);
    for (let i = 0; i < n; i++) this._step(h, roll, burn);
    this._apply();
  }

  _step(dt, roll, burn) {
    const q = this.body.quaternion, w = this.angularVelocity, v = this.velocity, p = this.body.position;
    const ra = this.rotAccel * dt;
    const toward = (cur, target, rate) => cur + clamp(target - cur, -rate, rate);
    if (roll) w.z += roll * ra;
    else if (this.assist.rollNull) w.z = toward(w.z, this.rollTarget, ra);
    this.alignError = null;
    const tgt = typeof this.alignTarget === 'function' ? this.alignTarget() : this.alignTarget;
    if (tgt) {
      _v.copy(tgt).normalize().applyQuaternion(_q.copy(q).invert());
      this.alignError = Math.acos(clamp(-_v.z, -1, 1));
      if (this.assist.align) {
        _w.set(0, 0, -1).cross(_v);
        let sl = Math.hypot(_w.x, _w.y);
        if (sl < 1e-4) { _w.set(0, 1, 0); sl = 1; }
        const want = Math.min(this.maxRate * 0.6, this.alignError * 1.6);
        const tx = sl > 1e-6 ? _w.x / sl * want : 0, ty = sl > 1e-6 ? _w.y / sl * want : 0;
        w.x = toward(w.x, tx, ra * 1.5); w.y = toward(w.y, ty, ra * 1.5);
      }
    }
    if (this.level) {
      _u.set(0, 1, 0).applyQuaternion(_q.copy(q).invert());
      w.z = roll ? w.z : toward(w.z, clamp(-Math.atan2(_u.x, _u.y) * 1.5, -0.6, 0.6), ra);
      if (this._idle > 0.4 && !this.assist.align) w.x = toward(w.x, clamp(Math.atan2(_u.z, _u.y), -0.4, 0.4), ra * 0.5);
    }
    if (this.assist.rate && !this.assist.align) {
      const k = Math.exp(-this.damping * dt);
      w.x *= k; w.y *= k;
    }
    w.x = clamp(w.x, -this.maxRate, this.maxRate); w.y = clamp(w.y, -this.maxRate, this.maxRate); w.z = clamp(w.z, -this.maxRate, this.maxRate);
    const ang = w.length();
    if (ang > 1e-9) { _q2.setFromAxisAngle(_v.copy(w).divideScalar(ang), ang * dt); q.multiply(_q2).normalize(); }
    this.throttle = toward(this.throttle, burn ? 1 : 0, dt * (burn ? 1.4 : 2.2));
    _v.set(this.rcs.x * this.rcsAccel.x, this.rcs.y * this.rcsAccel.y, this.rcs.z * this.rcsAccel.z - this.throttle * this.main).applyQuaternion(q);
    if (this.gravity) { _v.add(this.gravity); if (this.hover && (!this.landed || this.rcs.y > 0)) _v.sub(this.gravity); }
    if (this.drag) _v.addScaledVector(v, -this.drag);
    v.addScaledVector(_v, dt);
    p.addScaledVector(v, dt);
    if (this.ground) {
      const gh = this.ground(p.x, p.z);
      if (p.y <= gh || (this.landed && v.y <= 0.05 && p.y <= gh + 0.5)) {
        if (!this.landed) { this.landed = true; this.onContact?.({ speed: Math.max(0, -v.y), velocity: v.clone(), position: p.clone() }); }
        p.y = gh;
        if (v.y < 0) v.y = 0;
        const f = Math.exp(-4 * dt);
        v.x *= f; v.z *= f;
        w.x *= f; w.z *= f;
        _u.set(0, 0, -1).applyQuaternion(q); _u.y = 0;
        if (_u.lengthSq() > 1e-6) { _m.lookAt(_w.set(0, 0, 0), _u.normalize(), Y); _q2.setFromRotationMatrix(_m); q.slerp(_q2, Math.min(1, dt * 3)); }
      } else if (p.y > gh + 0.08) this.landed = false;
    }
  }

  eyeWorld(pos, quat) {
    this.body.updateWorldMatrix(true, true);
    if (this.eye) { this.eye.getWorldPosition(pos); this.eye.getWorldQuaternion(quat); }
    else { pos.copy(this.eyeOffset).applyMatrix4(this.body.matrixWorld); this.body.getWorldQuaternion(quat); }
  }

  _apply() {
    if (!this.camera) return;
    this.eyeWorld(this.camera.position, this.camera.quaternion);
    _e.set(this.head.pitch, this.head.yaw, 0, 'YXZ');
    this.camera.quaternion.multiply(_q.setFromEuler(_e));
    this.camera.updateMatrixWorld();
  }
}

function box(b) {
  const mn = b.min, mx = b.max;
  return { min: mn.isVector3 ? mn.clone() : new THREE.Vector3(...mn), max: mx.isVector3 ? mx.clone() : new THREE.Vector3(...mx), id: b.id, src: Array.isArray(mn) && Array.isArray(mx) ? b : null };
}

function syncBoxes(list) {
  for (const c of list) if (c.src) { c.min.fromArray(c.src.min); c.max.fromArray(c.src.max); }
}
