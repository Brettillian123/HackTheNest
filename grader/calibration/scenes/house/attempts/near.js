// Near: chimney 10% taller, door moved 0.08 to the right, roof a shade lighter red.
function buildScene(THREE) {
  const house = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), mat(0x6ab04c));
  ground.position.y = 0.05;
  house.add(ground);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.0), mat(0xf5e6c8));
  walls.position.y = 0.9;
  house.add(walls);
  const rx = 1.4, rz = 1.2, rh = 0.9;
  const v = [[-rx, 0, -rz], [rx, 0, -rz], [rx, 0, rz], [-rx, 0, rz], [-rx, rh, 0], [rx, rh, 0]];
  const pos = [];
  for (const i of [3, 2, 5, 3, 5, 4, 1, 0, 4, 1, 4, 5, 2, 1, 5, 0, 3, 4, 0, 1, 2, 0, 2, 3]) pos.push(...v[i]);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, mat(0x9b3322));
  roof.position.y = 1.7;
  house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.05), mat(0x6b3e26));
  door.position.set(0.58, 0.5, 1.025);
  house.add(door);
  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.04), mat(0x9fd8ef));
  frontWindow.position.set(-0.55, 1.05, 1.02);
  house.add(frontWindow);
  const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.4), mat(0x9fd8ef));
  sideWindow.position.set(1.22, 1.05, 0);
  house.add(sideWindow);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.77, 0.3), mat(0x777777));
  chimney.position.set(0.7, 2.285, -0.5);
  house.add(chimney);
  return house;
}
