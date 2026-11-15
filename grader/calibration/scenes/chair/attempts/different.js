// A different object entirely: a floor lamp, about the same height.
function buildScene(THREE) {
  const lamp = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const shade = new THREE.MeshStandardMaterial({ color: 0xf1d38a });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), metal);
  base.position.y = 0.025;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 12), metal);
  pole.position.y = 0.8;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.4, 24, 1, true), shade);
  top.position.y = 1.6;
  lamp.add(base, pole, top);
  return lamp;
}
