function buildScene(THREE) {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#3478f6' });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), blue);
  sphere.name = 'sphere';
  sphere.position.y = 0.45;
  group.add(sphere);
  return group;
}
