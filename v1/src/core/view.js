// Interstellar view rig: third-person toggle on V, a chase camera that looks ahead of the ship in flight (lifting above it when the space behind is blocked) and an over-the-shoulder camera with a suited figure on foot and in zero-g, shortened against the controller's colliders.
import * as THREE from 'three';

const KIND = {
  ship: { dist: 30, height: 5.5, lag: 5, alt: [0, 17, 8] },
  walk: { dist: 3.1, height: 0.42, lag: 0 },
  float: { dist: 2.3, height: 0.28, lag: 0 },
};
const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _b = new THREE.Quaternion();
const _a = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4();
const TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const clamp = THREE.MathUtils.clamp;

export class ViewRig {
  constructor(ctx) {
    this.ctx = ctx;
    this.want = ctx.debug?.params?.get?.('view') === '3';
    this.blend = 0;
    this.active = false;
    this.kind = null;
    this.floor = null;
    this.extra = null;
    this.clear = null;
    this.ship = null;
    this.hold = false;
    this.ownAvatar = false;
    this.q = new THREE.Quaternion();
    this.t = 1;
    this.alt = 0;
    this.time = 0;
    this._down = false;
    this._avatar = null;
    this._loading = false;
    this._eye = new THREE.Vector3(0, 1.62, 0.06);
    ctx.director?.on?.(type => { if (type === 'exit') { this.floor = null; this.extra = null; this.clear = null; this.ship = null; this.hold = false; this.ownAvatar = false; this._hide(); } });
  }

  kindOf(c) {
    if (this.ship) return 'ship';
    if (!c) return null;
    if (c.body) return c.enabled && c.controls ? 'ship' : null;
    if (c.anchor || !c.frame || c.enabled === false || c.look === false) return null;
    return c.eyeHeight != null ? 'walk' : 'float';
  }

  update(dt) {
    const { input, engine, director } = this.ctx, c = this.ctx.controller, cam = engine.camera;
    const down = !!input?.down?.('KeyV');
    if (down && !this._down && !director?.busy && engine.timeScale !== 0) this.want = !this.want;
    this._down = down;
    this.time += dt;
    const kind = cam ? this.kindOf(c) : null;
    const target = this.want && kind ? 1 : 0;
    if (kind && (this.blend <= 0 || kind === this.kind)) this.kind = kind;
    else if (kind && kind !== this.kind) { this.blend = 0; this.kind = kind; }
    this.blend = clamp(this.blend + clamp(target - this.blend, -dt / 0.45, dt / 0.45), 0, 1);
    this.active = this.blend > 0.3;
    if (!cam || this.blend <= 0 || !this.kind) { this._hide(); this.q.copy(cam ? cam.quaternion : this.q); this.t = 1; this.alt = 0; return; }
    const K = KIND[this.kind], e = this.blend * this.blend * (3 - 2 * this.blend);
    if (this.hold && this.blend > 0.05) this.q.normalize();
    else if (K.lag > 0 && this.blend > 0.05) this.q.slerp(cam.quaternion, 1 - Math.exp(-dt * K.lag));
    else this.q.copy(cam.quaternion);
    const pivot = _c.copy(cam.position);
    const body = this.kind === 'ship' ? this.ship || c?.body || null : null;
    if (body) { body.getWorldPosition(_p); _p.addScaledVector(_d.set(0, 1, 0).applyQuaternion(body.getWorldQuaternion(_b)), 1.2); pivot.lerp(_p, e); }
    this._figure(c, cam);
    _d.set(0, K.height, K.dist).multiplyScalar(e).applyQuaternion(this.q);
    if (this.kind === 'ship') {
      let t = 1, alt = 0;
      if (this.clear) {
        t = this.clear(pivot, _d);
        if (t < 0.85 && this.clear(pivot, _a.fromArray(K.alt).multiplyScalar(e).applyQuaternion(this.q)) > t) alt = 1;
      }
      this.alt += (alt - this.alt) * Math.min(1, dt * 2.5);
      this.t = t < this.t ? t : this.t + (t - this.t) * Math.min(1, dt * 3);
      _d.multiplyScalar(Math.max(0.5, this.t));
      if (this.alt > 0.001) _d.lerp(_a.fromArray(K.alt).multiplyScalar(e).applyQuaternion(this.q), this.alt);
      cam.position.copy(pivot).add(_d);
      if (this.floor) { const y = this.floor(cam.position.x, cam.position.z); if (cam.position.y < y) cam.position.y = y; }
      _f.set(0, 2, -40).applyQuaternion(this.q).add(pivot).lerp(pivot, this.alt * 0.9);
      _u.set(0, 1, 0).applyQuaternion(this.q).lerp(_a.set(0, 0, -1).applyQuaternion(this.q), this.alt).normalize();
      _q.setFromRotationMatrix(_m.lookAt(cam.position, _f, _u));
      cam.quaternion.copy(this.q).slerp(_q, e);
    } else {
      const t = this._clear(c, pivot, _d);
      this.t = t < this.t ? t : this.t + (t - this.t) * Math.min(1, dt * 5);
      cam.position.copy(pivot).addScaledVector(_d, this.t);
      if (this.floor) { const y = this.floor(cam.position.x, cam.position.z); if (cam.position.y < y) cam.position.y = y; }
      cam.quaternion.copy(this.q);
    }
    cam.updateMatrixWorld();
  }

  _clear(c, pivot, d) {
    const boxes = this.extra?.length ? (c?.colliders || []).concat(this.extra) : c?.colliders;
    if (!boxes?.length || !c.frame) return 1;
    const n = 14, m = 0.2, hint = c.position?.x ?? 0;
    for (let i = 1; i <= n; i++) {
      _p.copy(pivot).addScaledVector(d, i / n);
      c.frame.fromWorld(_p, _l, hint);
      for (const b of boxes) {
        if (_l.x > b.min.x - m && _l.x < b.max.x + m && _l.y > b.min.y - m && _l.y < b.max.y + m && _l.z > b.min.z - m && _l.z < b.max.z + m) return Math.max(0.1, (i - 1.3) / n);
      }
    }
    return 1;
  }

  _hide() { if (this._avatar) this._avatar.group.visible = false; }

  _figure(c, cam) {
    const show = this.active && !this.ownAvatar && this.kind !== 'ship' && c && c.frame;
    if (!show) { this._hide(); return; }
    const engine = this.ctx.engine;
    if (!this._avatar) {
      if (this._loading || !engine.renderer?.capabilities) return;
      this._loading = true;
      import('../models/astronaut.js').then(m => {
        const a = m.createAstronaut({ engine, quality: engine.qualityName });
        a.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        a.group.visible = false;
        a.animate('stand', 0, 1);
        a.group.updateMatrixWorld(true);
        a.anchors.eye.getWorldPosition(this._eye);
        this._avatar = a;
      }).catch(e => { console.warn('[view] figure unavailable', e?.message || e); }).finally(() => { this._loading = false; });
      return;
    }
    const a = this._avatar, g = a.group;
    if (g.parent !== engine.scene) engine.scene?.add(g);
    g.visible = true;
    if (this.kind === 'walk') {
      c.frame.toWorld(c.position, g.position);
      c.frame.basis(c.position, g.quaternion).multiply(_q.setFromAxisAngle(_l.set(0, 1, 0), c.yaw + Math.PI));
      const sp = Math.hypot(c.velocity.x, c.velocity.z);
      if (c.ladder) a.animate('climb', ((c.position.y * 0.9) % 1 + 1) % 1, 1);
      else if (sp > 0.12) a.animate(c.preset === 'wade' ? 'wade' : 'walk', ((c._phase / (Math.PI * 2)) % 1 + 1) % 1, Math.min(1, sp / 0.9));
      else a.animate('stand', (this.time / 6) % 1, 1);
    } else {
      c.worldPose(_p, g.quaternion);
      g.quaternion.multiply(TURN);
      a.animate('float', (this.time / 7) % 1, 1);
      g.position.copy(_p).sub(_l.copy(this._eye).applyQuaternion(g.quaternion));
    }
    g.updateMatrixWorld(true);
  }

  dispose() { this._avatar?.dispose?.(); this._avatar = null; }
}
