// Miller wreck seam: the lost lander's wreckage built from the hull materials (panel stack, torn hull section, capsized pod with the recorder lodged in it, floating debris and a trail of fragments), swapped for src/models/wreck.js when that exists.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SEABED = -0.55;

export function buildWreck(mats, ocean, hazeAll) {
  const root = new THREE.Group();
  root.name = 'wreck';
  const R = (a => () => (a = (a * 16807) % 2147483647) / 2147483647)(91);
  const m = { white: mats.white, plain: mats.whitePlain || mats.white, tile: mats.tile || mats.white, frame: mats.frame || mats.metal, metal: mats.metal, rubber: mats.rubber || mats.metal };
  const put = (parent, geo, mat, p, r = [0, 0, 0]) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const box = (parent, mat, s, p, r) => put(parent, new THREE.BoxGeometry(...s), mat, p, r);
  const rbox = (parent, mat, s, rad, p, r) => put(parent, new RoundedBoxGeometry(s[0], s[1], s[2], 3, rad), mat, p, r);
  const cyl = (parent, mat, r0, h, p, r) => put(parent, new THREE.CylinderGeometry(r0, r0, h, 14), mat, p, r);

  const panel = new THREE.Group();
  panel.position.set(-2.6, SEABED - 0.25, -1.4);
  panel.rotation.set(-0.08, 0.35, 0.07);
  const PW = [0.34, 0.31, 0.36, 0.3];
  let x = -0.68;
  PW.forEach((w, i) => { rbox(panel, i % 2 ? m.plain : m.white, [w, 2.75 - i * 0.12 + R() * 0.2, 0.32], 0.02, [x + w / 2, 1.35, (R() - 0.5) * 0.04]); x += w + 0.018; });
  rbox(panel, m.tile, [1.42, 0.24, 0.36], 0.02, [0, 2.05, 0]);
  box(panel, m.metal, [1.3, 0.05, 0.05], [0, 0.85, 0.18]);
  root.add(panel);

  const hull = new THREE.Group();
  hull.position.set(2.2, SEABED + 0.1, -2.4);
  hull.rotation.set(-0.35, -0.6, 0.5);
  put(hull, new THREE.CylinderGeometry(1.7, 1.7, 2.8, 20, 1, true, 0, 1.5), m.tile, [0, 0, 0]).material.side = THREE.DoubleSide;
  for (const a of [0.15, 0.75, 1.35]) box(hull, m.frame, [0.08, 2.8, 0.12], [Math.sin(a) * 1.62, 0, Math.cos(a) * 1.62], [0, a, 0]);
  root.add(hull);

  const pod = new THREE.Group();
  pod.position.set(0.15, SEABED + 0.45, 0.15);
  pod.rotation.set(0.1, -0.2, 1.75);
  rbox(pod, m.white, [2.1, 1.25, 1.5], 0.22, [0, 0, 0]);
  rbox(pod, m.tile, [2.16, 0.32, 1.56], 0.1, [0, -0.5, 0]);
  rbox(pod, m.frame, [0.5, 0.9, 1.6], 0.08, [-0.95, 0.1, 0]);
  box(pod, m.metal, [1.6, 0.06, 0.06], [0.1, 0.66, 0.6]);
  cyl(pod, m.metal, 0.11, 1.3, [0.4, 0.2, -0.85], [Math.PI / 2, 0, 0.2]);
  root.add(pod);
  const mast = new THREE.Group();
  mast.position.set(-0.7, SEABED + 1.0, -0.4);
  mast.rotation.set(0.1, 0, -0.18);
  cyl(mast, m.metal, 0.02, 1.6, [0, 0.8, 0]);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
  lamp.position.set(0, 1.62, 0);
  mast.add(lamp);
  root.add(mast);

  const recorder = new THREE.Group();
  recorder.name = 'recorderUnit';
  recorder.position.set(0.25, SEABED + 1.12, 0.95);
  recorder.rotation.set(-0.35, 0.15, 0.1);
  const recMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.16, 0.035), roughness: 0.62, metalness: 0.05 });
  const body = rbox(recorder, recMat, [0.34, 0.2, 0.26], 0.045, [0, 0, 0]);
  body.name = 'recorderBody';
  for (const s of [-1, 1]) rbox(recorder, m.rubber, [0.05, 0.24, 0.3], 0.02, [s * 0.165, 0, 0]);
  put(recorder, new THREE.TorusGeometry(0.06, 0.011, 6, 18, Math.PI), m.metal, [0, 0.1, -0.03], [0, Math.PI / 2, 0]);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.115), new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 0.2 }));
  face.position.set(0, 0.0, 0.1305);
  face.name = 'recorderFace';
  recorder.add(face);
  root.add(recorder);

  const debris = [];
  const shapes = [['plate', [0.9, 0.05, 0.6]], ['plate', [0.55, 0.04, 0.4]], ['tank', [0.16, 0.9]], ['block', [0.5, 0.18, 0.35]], ['plate', [1.2, 0.05, 0.35]], ['block', [0.3, 0.14, 0.3]], ['plate', [0.4, 0.04, 0.7]]];
  const piece = (k, s, i, parent) => {
    const o = new THREE.Group();
    o.userData.yaw = R() * 6.28; o.userData.float = k === 'tank' || k === 'seat' ? 0.06 : 0.012; o.userData.phase = R() * 6;
    if (k === 'tank') cyl(o, m.white, s[0], s[1], [0, 0, 0], [0, 0, Math.PI / 2]);
    else if (k === 'seat') { rbox(o, m.rubber, [0.5, 0.12, 0.5], 0.04, [0, 0, 0]); rbox(o, m.rubber, [0.5, 0.6, 0.1], 0.04, [0, 0.2, -0.25], [-0.9, 0, 0]); }
    else rbox(o, k === 'block' ? m.tile : i % 2 ? m.white : m.frame, s, Math.min(0.015, s[1] * 0.4), [0, 0, 0]);
    parent.add(o);
    return o;
  };
  shapes.forEach(([k, s], i) => {
    const o = piece(k, s, i, root);
    const a = i * 2.4 + R(), r = 2.8 + R() * 4.5;
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    debris.push(o);
  });
  const trail = new THREE.Group();
  trail.name = 'wreckTrail';
  const trailShapes = [['plate', [1.1, 0.05, 0.7]], ['seat', [0.5]], ['tank', [0.14, 0.7]], ['plate', [0.6, 0.04, 0.9]], ['block', [0.4, 0.16, 0.3]], ['plate', [1.6, 0.05, 0.4]], ['plate', [0.5, 0.04, 0.5]], ['block', [0.3, 0.12, 0.5]]];
  const trailPieces = trailShapes.map(([k, s], i) => piece(k, s, i + 3, trail));
  if (!ocean.stub) { hazeAll(root, ocean); hazeAll(trail, ocean); }
  const colliders = [
    { min: [-3.4, -1, -1.9], max: [-1.8, 3, -0.9] },
    { min: [-0.9, -1, -0.6], max: [1.2, 2, 0.8] },
    { min: [1.0, -1, -3.4], max: [3.3, 1, -1.6] },
  ];
  const floaters = [pod, hull];
  return { root, recorder, face, lamp, debris, trail, trailPieces, colliders, frame: pod, floaters };
}

export function layTrail(W, from, to) {
  const n = W.wreck.trailPieces.length;
  const d = to.clone().sub(from).setY(0);
  const len = d.length();
  d.normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x);
  W.wreck.trailPieces.forEach((o, i) => {
    const u = (28 + (len - 40) * (i + 0.5) / n) / len;
    const off = Math.sin(i * 2.7 + 1.1) * (2.5 + i * 0.4);
    o.position.copy(from).addScaledVector(d, u * len).addScaledVector(side, off).setY(0);
  });
}

export function adaptWreck(model, mats, ocean, hazeAll) {
  const own = buildWreck(mats, ocean, hazeAll);
  const root = model.group;
  root.name = 'wreck';
  if (!ocean.stub) hazeAll(root, ocean);
  const floaters = model.pieces.filter(p => p.floating).sort((a, b) => b.radius - a.radius).slice(0, 2).map(p => p.object);
  const appr = model.anchors.approach.position;
  return {
    model, root, recorder: model.recorder, face: null, lamp: model.lamp, debris: [], trail: own.trail, trailPieces: own.trailPieces,
    colliders: model.colliders, frame: root, floaters, approachYaw: Math.atan2(appr.x, appr.z),
    setStrobe: v => model.setStrobe(v), setRecorder: v => model.setRecorder(v), display: model.displaySlots[0],
  };
}
