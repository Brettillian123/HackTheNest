function buildScene(THREE) {
  const bike = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c1121f' });
  const steel = new THREE.MeshStandardMaterial({ color: '#aaaaaa' });
  const black = new THREE.MeshStandardMaterial({ color: '#222222' });
  const up = new THREE.Vector3(0, 1, 0);
  function tube(name, a, b, radius, material) {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 12), material);
    mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    bike.add(mesh);
  }
  for (const [name, x] of [['rearWheel', -0.55], ['frontWheel', 0.55]]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 12, 48), black);
    wheel.name = name;
    wheel.position.set(x, 0.375, 0);
    bike.add(wheel);
  }
  tube('chainStay', [-0.55, 0.375, 0], [-0.05, 0.3, 0], 0.018, red);
  tube('seatStay', [-0.55, 0.375, 0], [-0.2, 0.85, 0], 0.018, red);
  tube('seatTube', [-0.05, 0.3, 0], [-0.22, 0.9, 0], 0.022, red);
  tube('topTube', [-0.2, 0.85, 0], [0.4, 0.85, 0], 0.022, red);
  tube('downTube', [-0.05, 0.3, 0], [0.42, 0.75, 0], 0.025, red);
  tube('fork', [0.4, 0.85, 0], [0.55, 0.375, 0], 0.02, steel);
  tube('stem', [0.4, 0.85, 0], [0.37, 0.98, 0], 0.018, steel);
  tube('handlebar', [0.37, 0.98, -0.22], [0.37, 0.98, 0.22], 0.016, steel);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), black);
  seat.name = 'seat';
  seat.position.set(-0.23, 0.92, 0);
  bike.add(seat);
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24), steel);
  chainring.name = 'chainring';
  chainring.rotation.x = Math.PI / 2;
  chainring.position.set(-0.05, 0.3, 0.03);
  bike.add(chainring);
  return bike;
}
