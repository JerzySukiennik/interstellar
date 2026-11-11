// Interstellar greybox kit: cached placeholder materials, merged box builders (flat or bent onto the ring), parts, interactables, stars, shared ring layout.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frames } from '../core/controllers.js';

export const RF = 33.2;
export const SPIN = 0.55;
export const RING_THETA0 = -Math.PI / 2;
export const S_MODULE = k => (((k * Math.PI / 6) - RING_THETA0 + Math.PI * 4) % (Math.PI * 2)) * RF;

const MATS = {
  white: [0xdedbd4, 0.7, 0], panel: [0xb9bcbc, 0.6, 0], grey: [0x6d7174, 0.55, 0.3], dark: [0x232628, 0.7, 0.2], charcoal: [0x15171a, 0.8, 0.1],
  floor: [0x4c5052, 0.8, 0.2], hull: [0xcfcbc0, 0.5, 0.1], glass: [0x0a1214, 0.15, 0], red: [0x8a2a1c, 0.7, 0], green: [0x4f7a3a, 0.8, 0],
  water: [0x5d6a64, 0.3, 0], seabed: [0x2c302c, 0.95, 0], wreck: [0x8c8a82, 0.6, 0.4], amber: [0xffb060, 1, 0, 6], cyan: [0x9fe8ff, 1, 0, 1],
  lamp: [0xe8f2ff, 1, 0, 9], wave: [0x26302e, 0.4, 0], warm: [0xffd8a0, 1, 0, 12],
};

export function mat(name) {
  const cache = mat.cache ||= new Map();
  if (cache.has(name)) return cache.get(name);
  const [c, rough, metal, emissive] = MATS[name] || MATS.grey;
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  if (emissive) { m.emissive = new THREE.Color(c); m.emissiveIntensity = emissive; m.color.setScalar(0.02); }
  m.name = name;
  cache.set(name, m);
  return m;
}

export function own(name) { const m = mat(name).clone(); m.name = name + '+'; return m; }

export class Boxes {
  constructor(frame = null) { this.frame = frame; this.parts = new Map(); this.colliders = []; }

  add(min, max, matName = 'grey', { collide = false, bend = true, id } = {}) {
    const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
    const ring = this.frame?.kind === 'ring';
    const segs = ring && bend ? Math.max(1, Math.ceil(sx / 0.6)) : 1;
    const g = new THREE.BoxGeometry(sx, sy, sz, segs, 1, 1).toNonIndexed();
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    if (ring && bend) {
      const pos = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.set(pos.getX(i) + c[0], pos.getY(i) + c[1], pos.getZ(i) + c[2]); this.frame.toSpace(v, v); pos.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
    } else if (ring) {
      const v = new THREE.Vector3(...c), q = new THREE.Quaternion();
      g.applyQuaternion(this.frame.basisSpace(v, q));
      this.frame.toSpace(v, v);
      g.translate(v.x, v.y, v.z);
    } else g.translate(...c);
    g.deleteAttribute('uv');
    if (!this.parts.has(matName)) this.parts.set(matName, []);
    this.parts.get(matName).push(g);
    if (collide) this.colliders.push({ min: [...min], max: [...max], id });
    return this;
  }

  wall(min, max, matName = 'panel', opts = {}) { return this.add(min, max, matName, { collide: true, ...opts }); }

  build(parent, { shadows = false } = {}) {
    const meshes = [];
    for (const [name, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat(name));
      list.forEach(g => g.dispose());
      mesh.name = 'greybox-' + name;
      mesh.castShadow = mesh.receiveShadow = shadows;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

export function part(parent, min, max, material = 'grey', frame = null) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), typeof material === 'string' ? mat(material) : material);
  const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  m.userData.local = c.clone();
  place(m, c, frame);
  parent.add(m);
  return m;
}

export function place(obj, local, frame = null, extra = null) {
  const v = local.isVector3 ? local : new THREE.Vector3(...local);
  if (frame?.kind === 'ring') { frame.toSpace(v, obj.position); frame.basisSpace(v, obj.quaternion); }
  else { obj.position.copy(v); obj.quaternion.identity(); }
  if (extra) obj.quaternion.multiply(extra);
  return obj;
}

export function interactable(obj, def) { obj.userData.interact = { range: 2.4, ...def }; if (!obj.name) obj.name = def.id; return obj; }

export function light(parent, type, color, intensity, at, frame = null, opts = {}) {
  const L = type === 'spot' ? new THREE.SpotLight(color, intensity, opts.distance ?? 0, opts.angle ?? 0.6, opts.penumbra ?? 0.6, 2)
    : type === 'dir' ? new THREE.DirectionalLight(color, intensity)
      : new THREE.PointLight(color, intensity, opts.distance ?? 0, 2);
  if (at) place(L, at, frame);
  parent.add(L);
  if (L.target) parent.add(L.target);
  return L;
}

export function stars(count = 2500, radius = 4000, seed = 7) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * radius, u * radius, Math.sin(a) * r * radius], i * 3);
    const b = Math.pow(rnd(), 6) * 6 + 0.2;
    col.set([b, b * 0.97, b * 0.92], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  p.frustumCulled = false;
  return p;
}

export function gargantua(parent, { dir = new THREE.Vector3(-0.25, 0.1, -0.96), distance = 1000, radius = 180 } = {}) {
  const g = new THREE.Group();
  g.position.copy(dir).normalize().multiplyScalar(distance);
  g.lookAt(0, 0, 0);
  const hole = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const disk = new THREE.Mesh(new THREE.RingGeometry(radius * 1.25, radius * 4.2, 96, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6.2, 3.6), side: THREE.DoubleSide }));
  disk.rotation.x = Math.PI / 2 - 0.12;
  const halo = new THREE.Mesh(new THREE.RingGeometry(radius * 1.02, radius * 1.12, 96, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 11, 7), side: THREE.DoubleSide }));
  g.add(disk, hole, halo);
  parent.add(g);
  return g;
}

export function syncBackground(bgCam, cam, position) {
  cam.getWorldQuaternion(bgCam.quaternion);
  if (position) bgCam.position.copy(position);
  if (bgCam.fov !== cam.fov) { bgCam.fov = cam.fov; bgCam.updateProjectionMatrix(); }
  bgCam.updateMatrixWorld();
}

export function ranger(parent, { cabin = true } = {}) {
  const group = new THREE.Group();
  group.name = 'ranger';
  const b = new Boxes();
  b.add([-1.4, -0.45, -8], [1.4, 2.35, 8], 'hull');
  b.add([-5, -0.2, 2.5], [-1.4, 0.3, 8], 'hull').add([1.4, -0.2, 2.5], [5, 0.3, 8], 'hull');
  if (cabin) {
    b.add([-1.1, -0.1, -6.6], [1.1, 0, 7.9], 'floor');
    b.add([-1.1, 2.05, -6.6], [1.1, 2.15, 7.9], 'charcoal');
    b.add([-1.3, 0, -6.6], [-1.1, 2.05, 7.9], 'charcoal').add([1.1, 0, -6.6], [1.3, 2.05, 7.9], 'charcoal');
    b.add([-1.1, 0, -6.8], [1.1, 0.95, -6.2], 'dark');
    b.add([-1.1, 0.95, -6.6], [1.1, 1.05, -6.0], 'dark');
    b.add([-1.1, 1.75, -6.6], [1.1, 2.05, -5.6], 'charcoal');
    b.add([-1.1, 0, 7.9], [-0.9, 2.05, 8.1], 'charcoal').add([0.9, 0, 7.9], [1.1, 2.05, 8.1], 'charcoal');
    b.add([-0.95, 0, -5.6], [-0.25, 0.5, -4.9], 'red').add([0.25, 0, -5.6], [0.95, 0.5, -4.9], 'red');
    b.add([-0.95, 0.5, -4.95], [-0.25, 1.3, -4.75], 'red').add([0.25, 0.5, -4.95], [0.95, 1.3, -4.75], 'red');
  }
  b.build(group);
  const colliders = cabin ? [
    { min: [-1.5, -0.5, -6.8], max: [-1.1, 2.4, 8.1] }, { min: [1.1, -0.5, -6.8], max: [1.5, 2.4, 8.1] },
    { min: [-1.1, -0.5, -7.2], max: [1.1, 2.4, -6.2] }, { min: [-1.1, 2.05, -6.8], max: [1.1, 2.6, 8.1] },
    { min: [-1.1, -0.6, -6.8], max: [1.1, 0, 8.1] },
    { min: [-1.1, -0.5, 7.9], max: [-0.9, 2.4, 8.1] }, { min: [0.9, -0.5, 7.9], max: [1.1, 2.4, 8.1] },
    { min: [-0.95, 0, -5.6], max: [-0.25, 1.3, -4.75] }, { min: [0.25, 0, -5.6], max: [0.95, 1.3, -4.75] },
  ] : [];
  const anchors = {};
  const anchor = (name, p, yaw = 0) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...p); o.rotation.y = yaw; group.add(o); anchors[name] = o; return o; };
  anchor('seatL', [-0.6, 0.5, -5.25]);
  anchor('eyeL', [-0.6, 1.18, -5.3]);
  anchor('hatch', [0, 1, 8]);
  const displays = [];
  if (cabin) for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), own('cyan'));
    d.material.emissiveIntensity = 0;
    d.position.set(-0.92 + i * 0.25, 0.8, -6.19);
    d.rotation.x = -0.25;
    group.add(d);
    displays.push(d);
  }
  parent.add(group);
  return { group, colliders, anchors, displays };
}

export function endurance(parent, { hub = true } = {}) {
  const group = new THREE.Group();
  group.name = 'endurance';
  const geos = [], dark = [];
  const add = (list, sx, sy, sz, x, y, z, rz = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateZ(rz); g.translate(x, y, z); list.push(g); };
  for (let k = 0; k < 12; k++) {
    const t = k * Math.PI / 6, c = Math.cos(t), s = Math.sin(t);
    add(geos, 4.2, 6.5, 5, 32 * c, 32 * s, 0, t);
    const t2 = t + Math.PI / 12;
    add(dark, 1.6, 9.5, 1.6, 32.6 * Math.cos(t2), 32.6 * Math.sin(t2), 0, t2);
  }
  add(geos, 64, 1.6, 1.6, 0, 0, 0);
  if (hub) add(geos, 6.4, 6.4, 6.4, 0, 0, 0);
  add(dark, 2, 2, 3, 0, 0, 4.4); add(dark, 2, 2, 3, 0, 0, -4.4);
  for (const [list, m] of [[geos, 'hull'], [dark, 'grey']]) { const mesh = new THREE.Mesh(mergeGeometries(list), mat(m)); list.forEach(g => g.dispose()); group.add(mesh); }
  parent.add(group);
  return group;
}

export function dispose(root) {
  root?.traverse(o => {
    o.geometry?.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { if (m.name?.endsWith('+') || !mat.cache || ![...mat.cache.values()].includes(m)) { m.map?.dispose(); m.dispose(); } }
  });
}

export async function compile(ctx, scene, camera, bg) {
  const r = ctx.engine.renderer;
  if (bg) await r.compileAsync(bg.scene, bg.camera);
  await r.compileAsync(scene, camera);
}

export function camera(fov = 62, near = 0.05, far = 20000) { return new THREE.PerspectiveCamera(fov, 16 / 9, near, far); }

export function ringFrame(parent = null) { return frames.ring({ RF, theta0: RING_THETA0, parent }); }

export function buildRingInterior(scene, frame, { aged = 0 } = {}) {
  const b = new Boxes(frame);
  const H = 2.6, W = 1.2, sH = S_MODULE(0);
  const lab = [-6, 4], hab = [sH - 6, sH + 6];
  b.add([lab[0], -0.2, -3], [hab[1], 0, 3], 'floor');
  b.add([lab[0], H, -3], [sH - 0.7, H + 0.2, 3], 'panel').add([sH + 0.7, H, -3], [hab[1], H + 0.2, 3], 'panel');
  b.add([sH - 0.7, H, -3], [sH + 0.7, H + 0.2, -0.7], 'panel').add([sH - 0.7, H, 0.7], [sH + 0.7, H + 0.2, 3], 'panel');
  b.wall([lab[0] - 0.2, 0, -3], [lab[0], H, 3]);
  b.wall([lab[0], 0, -3.2], [lab[1], H, -3]).wall([lab[0], 0, 3], [lab[1], H, 3.2]);
  b.wall([lab[1] - 0.1, 0, -3], [lab[1] + 0.1, H, -0.6]).wall([lab[1] - 0.1, 0, 0.6], [lab[1] + 0.1, H, 3]);
  b.wall([lab[1] - 0.1, 2.1, -0.6], [lab[1] + 0.1, H, 0.6]);
  b.wall([lab[1], 0, -W - 0.2], [hab[0], H, -W], 'white').wall([lab[1], 0, W], [hab[0], H, W + 0.2], 'white');
  for (let s = lab[1] + 3; s < hab[0]; s += 3.2) b.add([s, 0, -W], [s + 0.25, H, -W + 0.08], 'grey').add([s, 0, W - 0.08], [s + 0.25, H, W], 'grey');
  b.wall([hab[0], 0, -3.2], [hab[1], H, -3]).wall([hab[0], 0, 3], [hab[1], H, 3.2]);
  b.wall([hab[0] - 0.1, 0, -3], [hab[0] + 0.1, H, -W]).wall([hab[0] - 0.1, 0, W], [hab[0] + 0.1, H, 3]);
  b.wall([hab[1], 0, -3], [hab[1] + 0.2, H, 3]);
  for (const k of [10, 11]) { const s = S_MODULE(k); b.add([s - 1.5, 0.4, -W], [s + 1.5, 2.2, -W + 0.12], 'dark'); b.add([s - 1.6, 2.2, -W], [s + 1.6, 2.35, W], 'grey'); }
  b.add([-4.6, 0, -2.4], [-2.4, 0.75, -1.6], 'white').add([-4.6, 0, 1.6], [-2.4, 0.75, 2.4], 'white');
  b.colliders.push({ min: [-4.6, 0, -2.4], max: [-2.4, 0.75, -1.6] }, { min: [-4.6, 0, 1.6], max: [-2.4, 0.75, 2.4] });
  b.add([-1.6, 0, 2.5], [-0.4, 1.0, 3], 'grey');
  b.colliders.push({ min: [-1.6, 0, 2.5], max: [-0.4, 1.0, 3] });
  b.add([sH - 4, 0, -3], [sH - 1, 0.8, -2.2], 'grey');
  b.colliders.push({ min: [sH - 4, 0, -3], max: [sH - 1, 0.8, -2.2] });
  b.add([sH + 1, 1.0, 2.9], [sH + 4, 2.2, 3], 'dark');
  b.add([sH - 0.8, H + 0.2, -0.8], [sH - 0.7, 28, 0.8], 'grey', { bend: false }).add([sH + 0.7, H + 0.2, -0.8], [sH + 0.8, 28, 0.8], 'grey', { bend: false });
  b.add([sH - 0.8, H + 0.2, -0.9], [sH + 0.8, 28, -0.8], 'grey', { bend: false }).add([sH - 0.8, H + 0.2, 0.8], [sH + 0.8, 28, 0.9], 'grey', { bend: false });
  for (let y = 0.3; y < 28; y += 0.3) b.add([sH - 0.35, y, -0.72], [sH + 0.35, y + 0.03, -0.66], 'grey', { bend: false });
  const meshes = b.build(scene);
  const lights = [];
  for (const s of [-1, S_MODULE(10), S_MODULE(11), sH]) lights.push(light(scene, 'point', 0xdfeeff, aged ? 7 : 14, [s, 2.3, 0], frame, { distance: 14 }));
  const hemi = new THREE.HemisphereLight(0xcfe4ea, 0x1a1c1c, aged ? 0.09 : 0.18);
  scene.add(hemi);
  return { meshes, colliders: b.colliders, lights, hemi, sH, lab, hab };
}
