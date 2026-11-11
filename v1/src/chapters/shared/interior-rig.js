// Endurance interior rig for the ring chapters: interior model, rotating space sky and Gargantua sweep, all displays, frames, colliders, ladders and the docked Rangers on ports A and B.
import * as THREE from 'three';
import { createEnduranceInterior, RF, THETA0, DIM, PITCH, ringToEndurance, ringUp, enduranceToRing } from '../../models/endurance-interior.js';
import { createSpaceSky } from '../../sky/space-sky.js';
import { createDisplay, createDisplayManager, displaysReady } from '../../models/displays.js';
import { frames, WalkController, FloatController } from '../../core/controllers.js';
import { createHullMaterials } from '../../models/hull-materials.js';
import { createRanger } from '../../models/ranger.js';
import { createRangerCockpit } from '../../models/ranger-cockpit.js';

export const SPIN = 0.55;
export { RF, THETA0, DIM, PITCH };
export const MOD = { lab: 0, pod: PITCH, engine: 2 * PITCH, hab: 3 * PITCH };
const KINDS = { podA_status: 'cryo', podB_status: 'cryo', consoleLab: 'text', consolePod: 'systems', consoleEngineA: 'systems', consoleEngineB: 'clock', missionBoard: 'board', commsLog: 'log' };
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);

export async function createInteriorRig(ctx, { firstSweep = 9, tilt = 1.1, sunPeak = 7, ports = ['A', 'B'] } = {}) {
  const { engine } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const interior = await createEnduranceInterior({ engine, quality: engine.qualityName });
  scene.add(interior.group);
  const camera = new THREE.PerspectiveCamera(62, engine.aspect, 0.03, 400);
  const sky = createSpaceSky({ engine, quality: engine.qualityName === 'ultra' ? 'high' : engine.qualityName });
  sky.setQuality(engine.qualityName === 'ultra' ? 'high' : engine.qualityName);
  await displaysReady;
  const displays = createDisplayManager({ engine, maxDistance: 7 });
  const D = {};
  for (const slot of interior.displaySlots) {
    const d = createDisplay(KINDS[slot.id] || 'text', { width: slot.width, height: slot.height });
    d.mount(slot);
    displays.add(d);
    D[slot.id] = d;
  }
  const spineObj = new THREE.Object3D();
  spineObj.position.set(RF, 0, 0);
  spineObj.rotation.z = Math.PI / 2;
  scene.add(spineObj);
  spineObj.updateMatrixWorld(true);
  const F = { ring: frames.ring({ RF, theta0: THETA0 }), spine: frames.attached(spineObj), space: frames.flat() };
  const toSpine = c => ({ id: c.id, min: [c.min[1], RF - c.max[0], c.min[2]], max: [c.max[1], RF - c.min[0], c.max[2]] });
  const colliders = {
    ring: interior.colliders,
    spine: interior.spaceColliders.filter(c => !String(c.id).startsWith('hatch.')).map(toSpine),
    space: interior.spaceColliders,
  };
  const sl = interior.spineLadder;
  const gravity = (u, p) => Math.max(0, Math.min(1, (RF - p.y) / RF));
  const ladders = {
    hab: { id: 'hab', min: [...interior.ladder.min], max: [interior.ladder.max[0], DIM.H + 0.1, interior.ladder.max[2]], gravity, speed: 0.75, rung: 0.3 },
    spine: { id: 'spine', ...toSpine({ min: sl.min, max: sl.max }), gravity, speed: 0.75, rung: 0.3 },
  };
  ladders.spine.id = 'spine';

  const q = engine.qualityName || 'high';
  const hullMats = createHullMaterials({ renderer: engine.renderer, quality: q });
  const PORT = { A: { at: interior.anchors.rangerPortA.position, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) }, B: { at: interior.anchors.rangerPortB.position, q: new THREE.Quaternion() } };
  const rangers = {};
  for (const id of ports) {
    const ranger = await createRanger({ engine, quality: q, materials: hullMats });
    const cockpit = await createRangerCockpit({ engine, quality: q, materials: hullMats, ranger });
    ranger.group.add(cockpit.group);
    ranger.setLights?.(false);
    ranger.setHatch?.(1);
    cockpit.setPower?.(0);
    cockpit.set?.('hatch', 1);
    const P = PORT[id], g = ranger.group;
    g.quaternion.copy(P.q);
    ranger.group.updateMatrixWorld(true);
    g.position.copy(P.at).sub(ranger.anchors.dockPort.position.clone().applyQuaternion(P.q));
    scene.add(g);
    g.updateMatrixWorld(true);
    const light = new THREE.PointLight(0xb8cfd8, 0, 9, 2);
    (cockpit.anchors.cabinEntry || ranger.anchors.hatchInside).getWorldPosition(light.position);
    light.position.addScaledVector(new THREE.Vector3(0, 1, 0), 1.5).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(P.q), 3.0);
    scene.add(light);
    const meshes = [], ckMeshes = [];
    g.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) meshes.push(o); });
    cockpit.group.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) ckMeshes.push(o); });
    const outer = meshes.filter(m => !ckMeshes.includes(m));
    rangers[id] = { id, ranger, cockpit, light, outer, ckMeshes, enabled: true, fill: 30, port: P.at.clone(), lod: null, shown: null, ckShown: null, beacon: false };
  }
  const showMeshes = (list, v) => { for (const m of list) m.visible = v; };
  const beaconA = new THREE.PointLight(0xffa040, 0, 5, 2);
  beaconA.position.set(0, -0.9, DIM.HUB_HZ + 0.4);
  scene.add(beaconA);
  const sign = (id, x) => {
    const host = new THREE.Object3D();
    host.position.set(x, 0.15, (id === 'A' ? 1 : -1) * (DIM.HUB_HZ - 0.12));
    host.rotation.y = id === 'A' ? Math.PI : 0;
    scene.add(host);
    const d = createDisplay('text', { width: 0.46, height: 0.3 });
    d.mount({ mesh: host, width: 0.46, height: 0.3 });
    displays.add(d);
    d.setPower(0);
    return d;
  };
  const signs = { A: sign('A', 1.5), B: sign('B', -1.5) };

  const L0 = new THREE.Vector3();
  sky.setSkyRotation(new THREE.Quaternion());
  L0.copy(sky.lightDirection).normalize();
  const sweep = { phase: Math.PI / 2 + SPIN * firstSweep, tilt, peak: sunPeak, level: 1, k: 0, t: 0, dir: new THREE.Vector3(), count: 0, lastK: 0 };
  const gDir = (ph, out) => out.set(Math.cos(ph) * Math.cos(sweep.tilt), Math.sin(ph) * Math.cos(sweep.tilt), Math.sin(sweep.tilt));
  const q0 = new THREE.Quaternion().setFromUnitVectors(L0, gDir(sweep.phase, _v));
  const skyQ = new THREE.Quaternion(), spinQ = new THREE.Quaternion();
  const camPos = new THREE.Vector3();

  const doors = {};
  const ringColliders = () => colliders.ring;
  const linkLadders = (c, hooks) => {
    const toSpine = (cc) => {
      cc.setFrame(F.spine);
      cc.setColliders(colliders.spine);
      cc.ladders = [];
      const L = cc.addLadder({ ...ladders.spine, onTop: x => hooks.top?.(x), onBottom: x => toRing(x) });
      cc.grab(L, Math.max(L.b.min.y, cc.position.y));
      cc.space = 'spine';
      hooks.spine?.(cc);
    };
    const toRing = (cc) => {
      cc.setFrame(F.ring, { hintS: MOD.hab });
      cc.setColliders(ringColliders());
      cc.ladders = [];
      const L = cc.addLadder({ ...ladders.hab, onTop: x => toSpine(x) });
      cc.grab(L, Math.min(L.b.max.y - 0.01, cc.position.y));
      cc.space = 'ring';
      hooks.ring?.(cc);
    };
    c._toSpine = toSpine; c._toRing = toRing;
    return c;
  };

  const segHits = (list, a, b) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    for (const c of list) {
      if (b[0] >= c.min[0] && b[0] <= c.max[0] && b[1] >= c.min[1] && b[1] <= c.max[1] && b[2] >= c.min[2] && b[2] <= c.max[2]) continue;
      let t0 = 0, t1 = 0.92, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (a[k] < c.min[k] || a[k] > c.max[k]) ok = false; continue; }
        let u = (c.min[k] - a[k]) / d[k], v = (c.max[k] - a[k]) / d[k];
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        if (t0 > t1) ok = false;
      }
      if (ok) return true;
    }
    return false;
  };
  const occlude = (from, to) => {
    const ringSide = p => Math.hypot(p.x, p.y) > RF - DIM.H - 0.3;
    if (ringSide(from) && ringSide(to)) {
      const ra = enduranceToRing(from), rb = enduranceToRing(to);
      if (Math.abs(ra.s - rb.s) > 8) return false;
      return segHits(colliders.ring, [ra.s, ra.y, ra.z], [rb.s, rb.y, rb.z]);
    }
    return segHits(colliders.space, from.toArray(), to.toArray());
  };

  const rig = {
    occlude,
    scene, camera, interior, sky, displays, D, F, colliders, ladders, sweep, rangers, signs, beaconA, spineObj, doors,
    ringColliders,
    openDoor(id) { doors[id] = true; },
    walker({ interact, position, yaw = 0, pitch = 0, onStep, preset = 'walk', hooks = {}, habLadder = true, space = 'ring' } = {}) {
      const c = new WalkController({ camera, frame: space === 'spine' ? F.spine : F.ring, interact, position, yaw, pitch, onStep, preset, colliders: space === 'spine' ? colliders.spine : ringColliders(), floor: 0, liveColliders: true });
      c.space = space;
      linkLadders(c, hooks);
      if (space === 'spine') { const L = c.addLadder({ ...ladders.spine, onTop: x => hooks.top?.(x), onBottom: x => c._toRing(x) }); c.grab(L, c.position.y); }
      else if (habLadder) c.addLadder({ ...ladders.hab, onTop: x => c._toSpine(x) });
      return c;
    },
    enableHabLadder(c) { if (!c.ladders.some(l => l.id === 'hab')) c.addLadder({ ...ladders.hab, onTop: x => c._toSpine(x) }); },
    glide(walker, { interact, speed = 1.3, onBump } = {}) {
      const dir = F.spine.basis(walker.position, new THREE.Quaternion());
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(dir).multiplyScalar(speed);
      const f = rig.floater({ interact, velocity: v.toArray(), onBump });
      f.drag = 0.03;
      f.gliding = true;
      return f;
    },
    settle(f) { if (f?.gliding && interior.zoneAt(f.position) === 'hub') { f.gliding = false; f.drag = 0.35; } },
    floater({ interact, velocity = [0, 0, 0], onBump } = {}) {
      const c = new FloatController({ camera, frame: F.space, interact, position: camera.getWorldPosition(new THREE.Vector3()), quaternion: camera.getWorldQuaternion(new THREE.Quaternion()), velocity, colliders: colliders.space, onBump, preset: 'float', liveColliders: true });
      c.space = 'hub';
      return c;
    },
    spineMouth(p) { return p.x > 2.3 && Math.hypot(p.y, p.z) < DIM.SR + 0.35; },
    walkerFromFloat(f, opts = {}) {
      const eye = f.position.clone(), look = camera.getWorldQuaternion(new THREE.Quaternion());
      const local = F.spine.fromWorld(eye, new THREE.Vector3());
      const c = rig.walker({ ...opts, space: 'spine', position: [local.x, Math.max(ladders.spine.min[1], local.y - 1.65), local.z] });
      c.setLook(look);
      if (c.pitch > -0.6) { c._pitchOff = (c._pitchOff || 0) + c.pitch + 0.9; c.pitch = -0.9; c._blendT = 0.6; }
      return c;
    },
    pose(c, out = { p: new THREE.Vector3(), q: new THREE.Quaternion() }) {
      if (c.space === 'spine') {
        F.spine.toWorld(c.position, _v);
        const r = enduranceToRing(_v);
        out.p.set(r.s, r.y, r.z);
        out.q.copy(c.quaternion);
      } else { out.p.copy(c.position); out.q.copy(c.quaternion); }
      return out;
    },
    ring: (s, y, z, out = new THREE.Vector3()) => ringToEndurance(s, y, z, out),
    toRing: p => enduranceToRing(p),
    anchorRing(name) { const a = interior.anchors[name]; return a.userData.ring ? { ...a.userData.ring } : enduranceToRing(a.position); },
    anchor(name) { return interior.anchors[name]; },
    zone() { return interior.zoneAt(camera.getWorldPosition(camPos)); },
    enter() {
      engine.setView(scene, camera);
      sky.attach();
      ctx.audio.listener(camera);
    },
    update(dt) {
      sweep.t += dt;
      spinQ.setFromAxisAngle(Z, -SPIN * sweep.t);
      skyQ.copy(spinQ).multiply(q0);
      sky.setSkyRotation(skyQ);
      sweep.dir.copy(sky.lightDirection).normalize();
      camera.getWorldPosition(camPos);
      const zid = interior.zoneAt(camPos), zb = interior.zoneBounds[zid];
      let k = 0.35;
      if (zb?.ring) {
        ringUp((zb.s0 + zb.s1) / 2, _u);
        _v.set(sweep.dir.x, sweep.dir.y, 0).normalize();
        k = Math.pow(Math.max(0, _v.dot(_u)), 1.6);
      }
      if (k > 0.5 && sweep.lastK <= 0.5) sweep.count++;
      sweep.lastK = k;
      sweep.k = k;
      interior.tune.sun.color.copy(sky.lightColor);
      interior.setSunDirection(sweep.dir, sky.lightIntensity / 5 * sweep.peak * sweep.level * k);
      interior.setViewer(camPos);
      const inHub = zid === 'hub' || (Math.hypot(camPos.x, camPos.y) < 3 && Math.abs(camPos.z) < 16);
      for (const r of Object.values(rangers)) {
        const on = inHub && r.enabled, near = on && camPos.distanceTo(r.port) < 4.5;
        if (r.shown !== on) { r.shown = on; showMeshes(r.outer, on); }
        if (r.ckShown !== near) { r.ckShown = near; showMeshes(r.ckMeshes, near); }
        if (r.lod !== !near) { r.lod = !near; r.ranger.setLOD?.(!near); }
        r.light.intensity = near || (on && r.beacon) ? r.fill : 0;
        if (on) { r.ranger.update?.(dt); r.cockpit.update?.(dt); }
      }
      beaconA.intensity = inHub && rangers.A?.beacon ? (Math.sin(sweep.t * 3.2) > 0.2 ? 2.4 : 0.15) : 0;
      interior.update(dt);
      displays.update(dt, camera);
      sky.update(camera, dt);
    },
    async compile() {
      const hidden = [];
      scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      await engine.renderer.compileAsync(scene, camera);
      const r = engine.renderer, sun = interior.tune.sun, sc = sun.shadow.camera;
      const keep = { i: sun.intensity, p: sun.position.clone(), t: sun.target.position.clone(), l: sc.left, r: sc.right, b: sc.bottom, tp: sc.top, n: sc.near, f: sc.far };
      sun.intensity = 1; sun.position.set(20, 30, 40); sun.target.position.set(10, 0, 0); sun.target.updateMatrixWorld();
      Object.assign(sc, { left: -60, right: 60, bottom: -60, top: 60, near: 0.5, far: 200 }); sc.updateProjectionMatrix();
      const rt = new THREE.WebGLRenderTarget(64, 64);
      const prev = r.getRenderTarget?.() ?? null;
      r.setRenderTarget(rt); r.render(scene, camera); r.setRenderTarget(prev);
      rt.dispose();
      sun.intensity = keep.i; sun.position.copy(keep.p); sun.target.position.copy(keep.t); sun.target.updateMatrixWorld();
      Object.assign(sc, { left: keep.l, right: keep.r, bottom: keep.b, top: keep.tp, near: keep.n, far: keep.f }); sc.updateProjectionMatrix();
      sun.shadow.needsUpdate = true;
      for (const o of hidden) o.visible = false;
      await sky.compile();
    },
    dispose() {
      for (const d of Object.values(D)) d.dispose();
      interior.dispose();
      sky.dispose();
      for (const r of Object.values(rangers)) { r.cockpit.dispose?.(); r.ranger.dispose?.(); r.light.dispose(); }
      hullMats.dispose?.();
    },
  };
  return rig;
}
