// Lookdev smoke test: verifies the film pipeline (HDR, bloom, grade) on simple PBR shapes.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export default async function ({ engine, THREE, scene, camera }) {
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  const key = new THREE.DirectionalLight(0xfff1dd, 4);
  key.position.set(8, 10, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -8;
  key.shadow.camera.right = key.shadow.camera.top = 8;
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 32), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.15 + i * 0.2, metalness: i % 2 }));
    m.position.set(-4 + i * 2, 0.9, 0);
    m.castShadow = true;
    scene.add(m);
  }
  const hot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(60, 42, 22) }));
  hot.position.set(0, 3, -2);
  scene.add(hot);
  engine.film.letterbox = 1;
  return { hot };
}
