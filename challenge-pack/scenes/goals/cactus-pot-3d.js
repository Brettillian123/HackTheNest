function buildScene(THREE) {
  const group = new THREE.Group();
  const terracotta = new THREE.MeshStandardMaterial({ color: '#b85c38' });
  const soil = new THREE.MeshStandardMaterial({ color: '#493522' });
  const green = new THREE.MeshStandardMaterial({ color: '#3f8b51' });
  function part(name, geometry, material, x, y, z, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  }
  part('pot', new THREE.CylinderGeometry(0.32, 0.25, 0.44, 32), terracotta, 0, 0.22, 0);
  part('soil', new THREE.CylinderGeometry(0.29, 0.29, 0.035, 32), soil, 0, 0.45, 0);
  part('cactus', new THREE.CylinderGeometry(0.13, 0.16, 0.95, 20), green, 0, 0.94, 0);
  part('armLeftStem', new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12), green, -0.2, 1.02, 0, -0.1);
  part('armLeftTip', new THREE.CylinderGeometry(0.055, 0.055, 0.23, 12), green, -0.2, 1.25, 0, Math.PI / 2);
  part('armRightStem', new THREE.CylinderGeometry(0.055, 0.055, 0.28, 12), green, 0.2, 0.98, 0, 0.1);
  part('armRightTip', new THREE.CylinderGeometry(0.055, 0.055, 0.2, 12), green, 0.2, 1.18, 0, Math.PI / 2);
  return group;
}
