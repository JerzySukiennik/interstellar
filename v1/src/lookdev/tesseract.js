// Lookdev Tesseract: builds the lattice from a recorded fixture (fixture=auto|hit), free orbit camera, presets view=wide|run|self|shallows|pane|push|wave|years, prints the layout summary.
import { createTesseract, applyFilm } from '../tesseract/world.js';

const FIXTURES = { auto: 'Niepotrzebne/fixtures/history-auto.json', hit: 'Niepotrzebne/fixtures/history-auto-hit.json' };

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const url = FIXTURES[params.get('fixture') || 'auto'] || params.get('fixture');
  const data = await (await fetch(url, { cache: 'no-store' })).json();
  const t0 = performance.now();
  const T = await createTesseract({ engine, data, log: true });
  console.log(`[tesseract] built in ${((performance.now() - t0) / 1000).toFixed(1)} s, sources ${JSON.stringify(T.sources)}`);
  engine.setView(T.scene, camera);
  applyFilm(engine.film, 0);
  camera.near = 0.05; camera.far = 2000;
  camera.fov = +(params.get('fov') || 62);
  camera.updateProjectionMatrix();
  const L = T.layout;
  const byKey = k => T.runs.find(r => r.mem.key === k) || T.runs[0];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const view = params.get('view') || 'wide';
  const lever = T.leverWorld(V(0, 0, 0));
  const P = L.push;
  const presets = {
    wide: () => { const r = T.runs[T.runs.length - 2] || T.runs[0]; return [V(r.x0 - 14, 1.2, r.z + 12), V(r.x0 + 70, -1.5, r.z + 6)]; },
    front: () => { const s = L.start.position; return [s.clone(), s.clone().addScaledVector(L.start.look, 30)]; },
    run: () => { const r = byKey('waking'); const k = Math.max(1, r.rooms.length - 3); const gx = (r.rooms[k].x + r.rooms[k - 1].x) / 2; return [V(gx + 3, 0.15, r.z + 0.9), V(gx - 40, -0.6, r.z - 0.3)]; },
    room: () => { const r = byKey('waking'); const room = r.rooms[r.rooms.length - 2]; return [room.center.clone().add(V(3.2, 0.25, 1.1)), room.center.clone().add(V(-40, -1.2, -2.4))]; },
    self: () => { const room = T.pushRoom || byKey('waking').rooms[2]; T.update(camera, 0.016, { height: engine.height }); const f = T.figureWorld(room, P ? P.t - 0.6 : room.T); return [f.clone().add(V(-2.3, 0.55, -1.45)), f.clone().add(V(0, 0.25, 0))]; },
    shallows: () => { const r = byKey('shallows'); const room = r.rooms[3]; return [room.center.clone().add(V(-5.5, 3.2, 9)), room.center.clone().add(V(0.5, -2, -1))]; },
    wave: () => { const r = byKey('wave'); const room = r.rooms[+(params.get('room') || 4)]; return [room.center.clone().add(V(-6, 3.5, 10)), room.center.clone().add(V(1.5, -1.5, -1))]; },
    years: () => { const r = byKey('years'); const room = r.rooms[3]; return [room.center.clone().add(V(-3, 3.2, 6.5)), room.center.clone().add(V(1.5, -0.6, 0))]; },
    pane: () => { const r = T.runs.find(x => x.mem.snaps.length > 1) || T.runs[0]; const pane = T.scene.children.find(o => o.userData?.snap && o.userData.run === r); const p = pane ? pane.position : r.rooms[0].center; return [p.clone().add(V(-1.2, -0.4, 3.6)), p.clone()]; },
    push: () => [(T.pushStand || lever.clone().add(V(-1.8, 0.35, -1.1))).clone().add(V(0, 0.45, 0)), lever.clone()],
  };
  const [pos, tgt] = (presets[view] || presets.wide)();
  camera.position.copy(pos);
  controls.target.copy(tgt);
  controls.update();
  const still = params.has('still');
  const fold = +(params.get('fold') || 0);
  let pushAt = view === 'push' && params.has('go') ? +(params.get('go') || 0.5) : -1;
  let t = 0;
  engine.onUpdate(dt => {
    t += dt;
    if (pushAt >= 0 && t > pushAt) { T.startPush(); pushAt = -1; }
    T.setFold(fold);
    T.update(camera, still ? 0 : dt, { height: engine.height });
  });
  T.update(camera, 0.016, { height: engine.height });
  await T.captureEnv(L.start.position);
  await engine.renderer.compileAsync(T.scene, camera);
  window.__stats = () => ({ ...T.stats(), info: engine.lastInfo, gpuMs: engine.gpuMs, near: T.state.nearest?.room?.mem.key, T: T.state.nearest?.room?.T, pushReady: T.state.pushReady });
  window.__tess = T;
  return T;
}
