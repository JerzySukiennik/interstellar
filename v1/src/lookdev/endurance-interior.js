// Lookdev: Endurance interior presets (pod, lab, corridor, habitat, console, spine, hub) with age, sun and light tuning from the URL.
import { createEnduranceInterior, ringToEndurance, ringMatrix, RF, THETA0, PITCH, DIM } from '../models/endurance-interior.js';

const H = 3 * PITCH;
const PRESETS = {
  pod: { ring: [-3.75, 0.87, -1.28], look: [0.05, 1, 0.0], up: [-1, 0, 0], fov: 75 },
  sit: { ring: [-3.35, 1.48, -1.28], look: [1, -0.22, 0.12], fov: 62, lid: 1, frost: 0.25 },
  lab: { ring: [2.6, 1.66, 0.55], look: [-1, -0.22, -0.22], fov: 62 },
  labhatch: { ring: [1.6, 1.66, -0.2], look: [1, -0.05, 0.15], fov: 55 },
  corridor: { ring: [PITCH - DIM.HL + 0.7, 1.66, -0.15], look: [1, -0.02, 0.01], fov: 58 },
  pod10: { ring: [PITCH - 3.6, 1.66, -0.2], look: [1, -0.08, 0.05], fov: 62 },
  engine: { ring: [2 * PITCH - 3.4, 1.66, -0.4], look: [1, -0.12, 0.6], fov: 62 },
  console: { ring: [2 * PITCH - 1.1, 1.62, 0.55], look: [0.55, -0.12, 1], fov: 46 },
  hab: { ring: [H - 4.6, 1.66, -0.1], look: [1, -0.12, 0.08], fov: 62 },
  habback: { ring: [H + 4.2, 1.66, 0.4], look: [-1, -0.15, -0.2], fov: 62 },
  podb: { ring: [-1.7, 1.5, 0.3], look: [-0.8, -0.55, 0.45], fov: 55 },
  long: { ring: [PITCH - 4.5, 1.66, 0.0], look: [1, 0.0, 0.0], fov: 50 },
  hydro: { ring: [H - 1.5, 1.45, 0.7], look: [-0.75, -0.3, -0.8], fov: 60 },
  anomaly: { ring: [1.0, 1.5, 0.9], look: [0.5, -0.12, -0.85], fov: 50 },
  shaft: { ring: [4.4, 1.55, -1.5], look: [-0.62, -0.2, 0.75], fov: 55 },
  tally: { ring: [H + 3.6, 1.55, 0.6], look: [0.4, -0.1, 1], fov: 45 },
  spine: { pos: [27.6, 0.42, -0.3], target: [3.0, -0.12, 0.12], up: [0.0, 0.94, 0.34], fov: 80 },
  spinemid: { pos: [16, 0.2, 0.25], target: [3, 0, 0], up: [0, 1, 0], fov: 70 },
  hub: { pos: [0.3, -0.4, 4.6], target: [0, 0.2, -1], up: [1, 0, 0], fov: 70 },
  hubB: { pos: [0.2, 0.3, 1.6], target: [0, 0, -4], up: [1, 0, 0], fov: 70 },
  habceil: { ring: [H + 0.9, 1.5, 0.9], look: [-0.5, 0.75, -0.55], fov: 62 },
  hubside: { pos: [1.6, -0.5, -1.2], target: [-1, 0.3, 1.5], up: [0, 0, 1], fov: 70 },
  sweep: { ring: [0.9, 1.62, 0.5], look: [-1, -0.42, -0.3], fov: 64 },
  habshaft: { ring: [H + 3.4, 1.5, -1.2], look: [-0.75, 0.0, 1], fov: 60 },
  podbview: { ring: [-2.5, 1.66, 0.35], look: [-0.3, -0.6, 0.5], fov: 62, screens: true },
};

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const tb = performance.now();
  const api = await createEnduranceInterior({ engine, quality: params.get('q') || engine.qualityName });
  window.__buildMs = Math.round(performance.now() - tb);
  const wrap = new THREE.Group();
  wrap.add(api.group);
  scene.add(wrap);
  scene.background = new THREE.Color(0, 0, 0);
  const film = engine.film;
  film.look('interior');
  film.letterbox = params.has('nolb') ? 0 : 1;
  if (params.has('exp')) film.exposure = +params.get('exp');
  if (params.has('k')) for (const kv of params.get('k').split(',')) { const [k, v] = kv.split(':'); if (k in api.tune.k) api.tune.k[k] = +v; }
  const age = +(params.get('age') || 0);
  api.setAge(age);
  if (params.has('lights')) { const [l, f] = params.get('lights').split(',').map(Number); api.setLights(l, f || 0); }
  if (params.has('hatch')) for (const kv of params.get('hatch').split(',')) { const [k, v] = kv.split(':'); api.setHatch(k, +v); }
  if (params.has('lid')) api.setPodLid('A', +params.get('lid'));
  if (params.has('lidb')) api.setPodLid('B', +params.get('lidb'));
  if (params.has('lever')) api.setLever(+params.get('lever'));
  if (params.has('frost')) api.setFrost('A', +params.get('frost'));
  if (params.has('anomaly')) api.setAnomaly(+params.get('anomaly'));
  if (params.has('growth')) api.setGrowth(+params.get('growth'));
  const sunP = (params.get('sun') || '0.3,0.25,0.92,9').split(',').map(Number);
  const sunDir = new THREE.Vector3(sunP[0], sunP[1], sunP[2]).normalize();
  api.setSunDirection(sunDir, sunP[3] ?? 7);
  const spin = params.has('spin');
  if (params.has('screens') || PRESETS[params.get('view')]?.screens) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 384;
    const x = c.getContext('2d'); x.fillStyle = '#031512'; x.fillRect(0, 0, 512, 384); x.strokeStyle = '#7ff4e6'; x.fillStyle = '#7ff4e6'; x.lineWidth = 3;
    for (let i = 0; i < 6; i++) { x.strokeRect(20 + (i % 3) * 160, 20 + Math.floor(i / 3) * 70, 140, 50); }
    x.font = '22px monospace'; for (let i = 0; i < 7; i++) x.fillText('SYS ' + (i * 17 % 100) + '  NOMINAL  ' + (i * 3.7).toFixed(1), 24, 190 + i * 26);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) });
    for (const d of api.displaySlots) d.mesh.material = m;
  }

  const name = params.get('view') || 'lab';
  const P = PRESETS[name] || PRESETS.lab;
  if (P.lid !== undefined && !params.has('lid')) api.setPodLid('A', P.lid);
  if (P.frost !== undefined && !params.has('frost')) api.setFrost('A', P.frost);
  camera.near = 0.03; camera.far = 400;
  camera.fov = +(params.get('fov') || P.fov || 60);
  let pos, tgt, up;
  if (P.ring) {
    const [s, y, z] = P.ring;
    const th = THETA0 + s / RF;
    wrap.rotation.z = -Math.PI / 2 - th;
    wrap.updateMatrixWorld(true);
    const fr = ringMatrix(s, y, z);
    pos = ringToEndurance(s, y, z);
    const f = new THREE.Vector3(...P.look).normalize().transformDirection(fr);
    tgt = pos.clone().addScaledVector(f, 2);
    up = new THREE.Vector3(...(P.up || [0, 1, 0])).transformDirection(fr);
    pos.applyMatrix4(wrap.matrixWorld); tgt.applyMatrix4(wrap.matrixWorld); up.transformDirection(wrap.matrixWorld);
  } else {
    pos = new THREE.Vector3(...P.pos); tgt = new THREE.Vector3(...P.target); up = new THREE.Vector3(...P.up);
    const q = new THREE.Quaternion().setFromUnitVectors(up.clone().normalize(), new THREE.Vector3(0, 1, 0));
    wrap.quaternion.copy(q);
    wrap.updateMatrixWorld(true);
    pos.applyQuaternion(q); tgt.applyQuaternion(q); up.set(0, 1, 0);
  }
  camera.up.set(0, 1, 0);
  camera.position.copy(pos);
  controls.target.copy(tgt);
  camera.updateProjectionMatrix();
  controls.update();
  const local = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  let t = 0;
  engine.onUpdate((dt) => {
    t += dt;
    if (spin) api.setSunDirection(sunDir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), t * 0.55), sunP[3] ?? 7);
    inv.copy(api.group.matrixWorld).invert();
    api.setViewer(local.copy(camera.position).applyMatrix4(inv));
    api.update(dt);
  });
  inv.copy(api.group.matrixWorld).invert();
  api.setViewer(local.copy(camera.position).applyMatrix4(inv));
  api.update(0.016);
  window.__programsWarm = await api.warmup(engine.renderer, scene, camera);
  window.__progKeys = engine.renderer.info.programs.map(p => p.cacheKey);
  window.__stats = () => ({ ...api.stats(), zone: api.zoneAt(local), info: engine.lastInfo });
  window.__walk = () => {
    const r = engine.renderer, before = r.info.programs.length, pts = [];
    for (const id of ['aft', 'lab', 't1', 'pod', 't2', 'engine', 't3', 'hab', 'fore']) { const z = api.zoneBounds[id]; if (z?.s0 !== undefined) pts.push(ringToEndurance((z.s0 + z.s1) / 2, 1.6, 0)); }
    pts.push(new THREE.Vector3(14, 0, 0.2), new THREE.Vector3(0.2, 0.3, 0.5));
    const rt = new THREE.WebGLRenderTarget(64, 64), prev = r.getRenderTarget();
    for (const p of pts) { api.setViewer(p); api.update(0.3); api.update(0.3); r.setRenderTarget(rt); r.render(scene, camera); }
    r.setRenderTarget(prev); rt.dispose();
    api.setViewer(local.copy(camera.position).applyMatrix4(inv)); api.update(0.3); api.update(0.3);
    return { before, after: r.info.programs.length };
  };
  return api;
}
