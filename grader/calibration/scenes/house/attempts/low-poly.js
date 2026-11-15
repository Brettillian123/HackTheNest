// Low poly: the gable roof replaced by a flat slab; chimney stands on the slab.
function buildScene(THREE) {
  const house = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), mat(0x6ab04c));
  ground.position.y = 0.05;
  house.add(ground);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.0), mat(0xf5e6c8));
  walls.position.y = 0.9;
  house.add(walls);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 2.4), mat(0x8e2c1d));
  roof.position.y = 1.775;
  house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.05), mat(0x6b3e26));
  door.position.set(0.5, 0.5, 1.025);
  house.add(door);
  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.04), mat(0x9fd8ef));
  frontWindow.position.set(-0.55, 1.05, 1.02);
  house.add(frontWindow);
  const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.4), mat(0x9fd8ef));
  sideWindow.position.set(1.22, 1.05, 0);
  house.add(sideWindow);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), mat(0x777777));
  chimney.position.set(0.7, 2.2, -0.5);
  house.add(chimney);
  return house;
}
