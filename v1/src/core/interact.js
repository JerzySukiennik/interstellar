// Interstellar interaction: look-at raycast with a forgiving cone, press or hold E, hint and progress through ui, use events into history.
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3(), _s = new THREE.Sphere(), _o = new THREE.Vector3();
const CENTER = new THREE.Vector2(0, 0);

export class Interact {
  constructor(ctx) {
    this.ctx = ctx;
    this.enabled = true;
    this.key = 'KeyE';
    this.defaultRange = 2.4;
    this.cone = THREE.MathUtils.degToRad(2.5);
    this.items = [];
    this.occluders = [];
    this.occlude = null;
    this.current = null;
    this.progress = 0;
    this.uses = new Map();
    this.lastUsed = null;
  }

  setRoots(roots, occluders = []) {
    this.items = [];
    this.occluders = occluders;
    for (const r of [].concat(roots || [])) r?.traverse(o => { if (o.userData.interact) this.items.push(o); });
    this._reset();
    return this.items.length;
  }

  add(obj) { if (!this.items.includes(obj)) this.items.push(obj); return obj; }

  remove(obj) { this.items = this.items.filter(o => o !== obj); if (this.current === obj) this._reset(); }

  clear() { this.items = []; this.occluders = []; this.occlude = null; this._reset(); }

  _reset() { this.current = null; this.progress = 0; this.ctx.ui?.hint(null); }

  idOf(o) { return o.userData.interact.id || o.name || o.uuid.slice(0, 8); }

  get(id) { return this.items.find(o => this.idOf(o) === id) || null; }

  list() { return this.items.map(o => ({ id: this.idOf(o), label: o.userData.interact.label, enabled: o.userData.interact.enabled !== false, position: o.getWorldPosition(new THREE.Vector3()).toArray() })); }

  isEnabled(o) { const d = o?.userData.interact; return !!d && d.enabled !== false && o.visible !== false; }

  center(o, out = new THREE.Vector3()) {
    const mesh = o.isMesh ? o : o.getObjectByProperty('isMesh', true);
    if (mesh?.geometry) {
      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      _s.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      return out.copy(_s.center);
    }
    _s.radius = 0.1;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(out);
  }

  looking(target, maxDeg = 6, range = Infinity) {
    const cam = this.ctx.engine.camera;
    if (!cam) return false;
    const p = target.isVector3 ? target : this.center(target, _o);
    cam.getWorldPosition(_c); cam.getWorldDirection(_f);
    _v.subVectors(p, _c);
    const d = _v.length();
    return d <= range && _v.normalize().dot(_f) >= Math.cos(THREE.MathUtils.degToRad(maxDeg));
  }

  pick() {
    const cam = this.ctx.engine.camera;
    if (!cam) return null;
    const live = this.items.filter(o => this.isEnabled(o));
    if (!live.length) return null;
    cam.updateMatrixWorld();
    for (const o of live) o.updateWorldMatrix(true, true);
    _ray.setFromCamera(CENTER, cam);
    const hits = _ray.intersectObjects([...live, ...this.occluders], true);
    cam.getWorldPosition(_c);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.interact) o = o.parent;
      if (!o || !live.includes(o)) return null;
      if (h.distance <= (o.userData.interact.range ?? this.defaultRange) && !this.blocked(_c, h.point)) return o;
      break;
    }
    cam.getWorldPosition(_c); cam.getWorldDirection(_f);
    let best = null, bestA = Infinity;
    for (const o of live) {
      const r = o.userData.interact.range ?? this.defaultRange;
      this.center(o, _v).sub(_c);
      const d = _v.length();
      if (d > r || d < 1e-3) continue;
      const a = Math.acos(Math.min(1, _v.dot(_f) / d));
      const tol = Math.atan((o.userData.interact.radius ?? _s.radius) / d) * 0.6 + this.cone;
      if (a < tol && a < bestA && !this.blocked(_c, _v.add(_c))) { best = o; bestA = a; }
    }
    return best;
  }

  blocked(from, to) { return this.occlude ? !!this.occlude(from, to) : false; }

  update(dt) {
    const ui = this.ctx.ui, input = this.ctx.input;
    if (!this.enabled) { if (this.current) this._reset(); return; }
    const o = this.pick();
    if (o !== this.current) { this.current = o; this.progress = 0; ui.progress(null); }
    if (!o) { ui.hint(null); return; }
    const d = o.userData.interact;
    ui.hint(d.label, d.key === undefined ? 'E' : d.key);
    if (d.hold > 0) {
      if (input.down(this.key)) {
        this.progress += dt / d.hold;
        ui.progress(this.progress);
        if (this.progress >= 1) this.use(o);
      } else if (this.progress > 0) { this.progress = Math.max(0, this.progress - dt * 3); ui.progress(this.progress > 0 ? this.progress : null); }
    } else if (input.pressed(this.key)) this.use(o);
  }

  use(target) {
    const o = typeof target === 'string' ? this.get(target) : target;
    if (!o || !this.isEnabled(o)) return false;
    const d = o.userData.interact, id = this.idOf(o);
    this.progress = 0;
    this.ctx.ui.progress(null);
    if (d.once) d.enabled = false;
    this.uses.set(id, (this.uses.get(id) || 0) + 1);
    this.lastUsed = { id, t: this.ctx.history.time };
    this.ctx.history.event('use', { id, label: d.label });
    try { d.onUse?.(this.ctx, o); } catch (e) { console.error(`[interact] ${id}`, e); }
    if (!this.isEnabled(o)) this._reset();
    return true;
  }

  used(id) { return this.uses.get(id) || 0; }
}
