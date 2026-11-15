// Wrong proportions: the body is 1.6 times too long (3.2 instead of 2.0); wheels stay where they were.
function buildScene(THREE) {
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const car = new THREE.Group();
  const chassis = new THREE.Group();
  chassis.position.y = 0.2;
  car.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.0), mat(0xd62828));
  body.position.y = 0.25;
  chassis.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.9), mat(0x223344));
  cabin.position.set(-0.1, 0.7, 0);
  chassis.add(cabin);
  for (const z of [-0.3, 0.3]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.2), mat(0xffee88));
    light.position.set(1.63, 0.3, z);
    chassis.add(light);
  }
  const tire = mat(0x111111);
  const hubMat = mat(0xaaaaaa);
  function wheel() {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 20), tire);
    t.rotation.x = Math.PI / 2;
    g.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12), hubMat);
    h.rotation.x = Math.PI / 2;
    g.add(h);
    return g;
  }
  for (const [x, z] of [[-0.65, -0.5], [0.65, -0.5], [-0.65, 0.5], [0.65, 0.5]]) {
    const w = wheel();
    w.position.set(x, 0.25, z);
    car.add(w);
  }
  return car;
}
