// Miller cockpit seam over the shared cockpit rig: power up, flight and beacon feeds, surface and air data, flooded engines with the drain countdown on the pilot's centre page, interaction hooks.
import { createCockpitRig } from '../shared/cockpit-rig.js';

export async function createMillerCockpit(ctx, W) {
  const rig = await createCockpitRig(ctx, { ranger: W.ranger, cockpit: W.cockpit, envMap: null, clock: ctx.clock });
  const live = { acc: 0, sysMain: false, alt: 0, vs: 0, extra: {}, beacon: null };
  W.createDisplay = null;
  if (W.real) W.createDisplay = (await import('../../models/displays.js')).createDisplay;
  W.eye = rig.eyes.pilot;
  W.targets.harness.position.copy(W.eye.position).add({ x: 0, y: -0.46, z: -0.3 });
  for (const d of Object.values(rig.displays)) d.setReflection?.(0.3, undefined, undefined, 0.16);
  W.targets.seat = rig.seatProxy;
  const api = {
    rig, displays: rig.displays,
    power(v) { if (v) rig.powerUp(); },
    failure(v) { rig.setFailure(v); },
    switches() {},
    setFlight(s) { rig.setFlight(s); },
    setAir(alt, vs, extra) { live.alt = alt; live.vs = vs; live.extra = extra || {}; },
    setBeacon(b) { live.beacon = b; rig.setBeacon({ bearing: b.bearing, distance: b.distance, strength: b.strength, id: 'LANDER 1', status: 'ALL GOOD', period: 2 }); },
    setSystems(p) {
      const o = { ...p };
      if (Array.isArray(o.engines)) o.engines = o.engines[0];
      if (o.caution === null) o.caution = undefined;
      rig.setSystems(o);
    },
    setEngine(p) { if (p.state) rig.setSystems({ engines: p.state === 'IDLE' ? 'ARMED' : p.state }); },
    showSystems(on) { live.sysMain = on; rig.setMode(on ? 'systems' : 'beacon'); },
    update(dt, camera) {
      live.acc += dt;
      if (live.acc > 0.25) {
        live.acc = 0;
        const x = live.extra;
        rig.setText('sideL', { title: 'AIR / SURFACE', cursor: false, lines: [
          { text: `ALT ${String(Math.round(live.alt)).padStart(5, ' ')} M`, color: 'hi' },
          { text: `V/S ${live.vs >= 0 ? '+' : '-'}${Math.abs(live.vs).toFixed(1).padStart(5, '0')}` },
          { text: `GEAR ${x.gear || 'UP'}`, color: x.gear === 'DOWN' ? 'hi' : x.gear === 'MOVING' ? 'amber' : 'dim' },
          { text: `WIND ${Math.round(x.wind ?? 9)} M/S`, color: (x.wind ?? 0) > 25 ? 'amber' : 'fg' },
          { text: x.note || 'SEA STATE 3', color: x.noteColor || 'dim' },
        ] });
      }
      rig.update(dt, camera);
    },
    register(interact, handlers) {
      const defs = rig.registerInteractables(interact, { auto: false, ...handlers }, { enabled: [] });
      return { lever: rig.objOf('hatch'), engines: rig.objOf('engineStart'), seat: rig.objOf('seat'), defs };
    },
    dispose() { rig.dispose(); },
  };
  return api;
}
