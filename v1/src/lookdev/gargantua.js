// Lookdev: Gargantua and Miller's Planet through the space-sky rig, with presets framing refs 10, 11, 12, 13, 14 and 09, slow orbit and plunge.
import { createSpaceSky } from '../sky/space-sky.js';

export const PRESETS = {
  '11': { obs: [0, 1.9, 60], target: [0, 0, 0], fov: 14, roll: 0, exposure: 0.1 },
  '12': {
    obs: [0, 1.9, 22], target: [-0.2702, 1.8052, 21.0419], fov: 23, roll: -14,
    exposure: 0.24,
    planet: { ndc: [-0.13, 0.29], radius: 0.026, distance: 12 },
  },
  '10': {
    obs: [0, 0.5, 8], target: [-0.7134, 0.6917, 7.326], fov: 62, roll: -24,
    exposure: 0.25,
    planet: { ndc: [-0.05, 0.19], radius: 0.02, distance: 3 },
  },
  '13': {
    obs: [0, 1.6, 30], target: [-0.169, 1.4593, 29.0245], fov: 29, roll: -12,
    planet: { down: 1.17, side: -0.3, angularRadius: 1.22, cover: 0.6, atmosphereGain: 0.55, lightLift: 0.75 },
    wedge: true,
  },
  '14': {
    obs: [0, 1.5, 26], look: [0.25, 0.05, 1], fov: 50, roll: 8,
    planet: { down: 1.52, side: -0.25, angularRadius: 1.25, cover: 0.85, lightLift: 1.6 },
  },
  '09': {
    obs: [0, 1.5, 26], look: [-0.3, -0.5, 1], fov: 60, roll: 35,
    planet: { down: 0.55, side: 0.6, angularRadius: 1.15, cover: 1.25, lightLift: 1.3 },
  },
};

export function diveExposure(t) {
  const K = [[0, 0.42], [14, 0.16], [19, 0.1], [21, 0.06], [23, 0.03], [25, 0.012], [27, 0.005], [33.5, 0.005]];
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const u = (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return Math.exp(Math.log(K[i - 1][1]) + (Math.log(K[i][1]) - Math.log(K[i - 1][1])) * u * u * (3 - 2 * u)); }
  return K[K.length - 1][1];
}

export default async function ({ engine, THREE, scene, camera, controls, params }) {
  const shot = params.get('shot') || '11';
  const P = PRESETS[shot] || PRESETS['11'];
  if (params.has('dive')) params.set('noplanet', '1');
  const sky = createSpaceSky({ engine, quality: params.get('gq') || engine.qualityName });
  sky.attach();
  scene.add(camera);
  camera.near = 0.01;
  camera.far = 5000;

  const obs = new THREE.Vector3(...(params.get('obs') ? params.get('obs').split(',').map(Number) : P.obs));
  const look = params.get('look') ? params.get('look').split(',').map(Number) : P.look;
  const target = look ? obs.clone().add(new THREE.Vector3(...look).normalize()) : new THREE.Vector3(...P.target);
  const fov = +(params.get('fov') || P.fov);
  const roll = THREE.MathUtils.degToRad(+(params.get('roll') ?? P.roll));
  const axis = target.clone().sub(obs).normalize();
  const skyQ = new THREE.Quaternion().setFromAxisAngle(axis, roll);
  sky.setSkyRotation(skyQ);
  const invQ = skyQ.clone().invert();
  camera.fov = fov;
  camera.updateProjectionMatrix();
  window.__cam(...obs.clone().applyQuaternion(skyQ).toArray(), ...target.clone().applyQuaternion(skyQ).toArray(), fov);

  const film = engine.film;
  film.look('space');
  film.letterbox = 0;
  if (P.exposure) film.exposure = P.exposure;
  if (params.has('exp')) film.exposure = +params.get('exp');
  if (params.has('bloom')) film.bloomStrength = +params.get('bloom');

  let dive = null;
  if (params.has('dive')) {
    const ch = await import('../chapters/06-gargantua.js');
    const { BORE_INV } = await import('../chapters/shared/cockpit-rig.js');
    dive = {
      ch, t: +params.get('dive') || 0, play: params.has('play'),
      unUp: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ch.DIVE_UP).invert(),
      unBore: BORE_INV.clone().invert(),
    };
    controls.enabled = false;
    skyQ.identity(); invQ.identity();
    sky.setSkyRotation(skyQ);
    camera.fov = +(params.get('fov') || 62);
    camera.updateProjectionMatrix();
  }
  const divePose = t => {
    const o = dive.ch.diveObserver(t);
    const q = dive.ch.diveAttitudeBh(t, o).multiply(dive.unUp).multiply(dive.unBore);
    camera.position.copy(o);
    camera.quaternion.copy(q);
    camera.updateMatrixWorld();
    const L = dive.ch.diveLook(t);
    sky.setPlunge(L.plunge);
    film.exposure = dive.exp ?? (params.has('exp') ? +params.get('exp') : (params.get('dexp') === 'chapter' ? L.exposure : diveExposure(t)));
    return o;
  };

  const bhCam = () => {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const r = new THREE.Vector3(e[0], e[1], e[2]).applyQuaternion(invQ);
    const u = new THREE.Vector3(e[4], e[5], e[6]).applyQuaternion(invQ);
    const f = new THREE.Vector3(-e[8], -e[9], -e[10]).applyQuaternion(invQ);
    return { r, u, f };
  };
  if (P.planet && !params.has('noplanet')) {
    const { r, u, f } = bhCam();
    let dir, ang;
    if (P.planet.ndc) {
      const th = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
      dir = f.clone().addScaledVector(r, P.planet.ndc[0] * th * engine.aspect).addScaledVector(u, P.planet.ndc[1] * th).normalize();
      ang = Math.atan(P.planet.radius * 2 * th);
    } else {
      const down = u.clone().multiplyScalar(-Math.cos(P.planet.side)).addScaledVector(r, Math.sin(P.planet.side));
      dir = f.clone().multiplyScalar(Math.cos(P.planet.down)).addScaledVector(down, Math.sin(P.planet.down)).normalize();
      ang = P.planet.angularRadius;
    }
    const light = P.planet.lightLift ? obs.clone().normalize().negate().addScaledVector(dir, -P.planet.lightLift).normalize() : null;
    sky.setPlanet({ direction: dir, angularRadius: ang, distance: P.planet.distance ?? null, cover: P.planet.cover ?? 0.5, atmosphereGain: P.planet.atmosphereGain ?? 1, light });
  }

  const key = new THREE.DirectionalLight(sky.lightColor, sky.lightIntensity);
  scene.add(key, key.target);
  let wedge = null;
  if (P.wedge || params.has('wedge')) {
    const g = new THREE.BufferGeometry();
    const v = [0, 0.05, -2.2, -0.7, -0.08, 0.6, 0.7, -0.08, 0.6, 0, -0.32, 0.4];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...v.slice(0, 3), ...v.slice(3, 6), ...v.slice(6, 9), ...v.slice(0, 3), ...v.slice(9, 12), ...v.slice(3, 6), ...v.slice(0, 3), ...v.slice(6, 9), ...v.slice(9, 12)], 3));
    g.computeVertexNormals();
    wedge = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7, metalness: 0.15, flatShading: true }));
    wedge.position.set(-0.3, -0.62, -1.7);
    wedge.rotation.set(0.25, 0.55, -0.3);
    wedge.scale.set(0.9, 0.7, 0.8);
    camera.add(wedge);
  }

  const orbit = params.has('orbit') ? +(params.get('orbit') || 0.02) : 0;
  const spin = +(params.get('spin') || 0);
  const spinAxis = new THREE.Vector3(0, 0, 1);
  let spinAng = 0;
  const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(skyQ);
  sky.setPlunge(+(params.get('plunge') || 0));
  if (params.has('t')) sky.update(camera, +params.get('t'));
  const _o = new THREE.Vector3(), _t = new THREE.Vector3();

  engine.onUpdate(dt => {
    if (dive) {
      if (dive.play) dive.t += dt;
      sky.setObserver(divePose(dive.t));
      sky.update(camera, dt);
      return;
    }
    if (spin) {
      spinAng += spin * dt;
      const sq = new THREE.Quaternion().setFromAxisAngle(spinAxis, spinAng).multiply(skyQ);
      sky.setSkyRotation(sq);
      invQ.copy(sq).invert();
    }
    if (orbit) {
      const q = new THREE.Quaternion().setFromAxisAngle(yAxis, orbit * dt);
      _o.copy(camera.position).applyQuaternion(q);
      _t.copy(controls.target).applyQuaternion(q);
      camera.position.copy(_o); controls.target.copy(_t);
    }
    sky.setObserver(_o.copy(camera.position).applyQuaternion(invQ));
    sky.update(camera, dt);
    key.color.copy(sky.lightColor);
    key.intensity = sky.lightIntensity;
    key.position.copy(camera.position).addScaledVector(sky.lightDirection, 50);
    key.target.position.copy(camera.position);
  });

  sky.setObserver(dive ? divePose(dive.t) : obs);
  sky.update(camera, 0);
  await sky.compile();
  sky.attachEnvironment(scene);
  scene.environmentIntensity = 0.05;

  return {
    sky, presets: PRESETS, shot, wedge,
    setPlunge: x => sky.setPlunge(x),
    measure: (n = 20) => sky.measure(n),
    setDisk: o => sky.setDisk(o),
    setDiveTime: (t, e) => { if (dive) { dive.t = t; dive.exp = e > 0 ? e : null; sky.setObserver(divePose(t)); } },
  };
}
