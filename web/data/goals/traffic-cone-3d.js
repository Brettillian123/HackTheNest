function buildScene(THREE) {
  const group = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({ color: '#292d32' });
  const orange = new THREE.MeshStandardMaterial({ color: '#f47721' });
  const white = new THREE.MeshStandardMaterial({ color: '#f5f3ed' });
  function part(name, geometry, material, y) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  }
  part('base', new THREE.BoxGeometry(0.92, 0.08, 0.92), rubber, 0.04);
  part('cone', new THREE.CylinderGeometry(0.035, 0.29, 0.82, 32), orange, 0.49);
  part('stripe', new THREE.CylinderGeometry(0.176, 0.208, 0.09, 32), white, 0.48);
  return group;
}
