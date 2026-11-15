function buildScene(THREE) {
  const group = new THREE.Group();
  const plaster = new THREE.MeshStandardMaterial({ color: '#efe3c5' });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#a54436' });
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f6f0df' });
  const wood = new THREE.MeshStandardMaterial({ color: '#67422c' });
  function part(name, geometry, material, x, y, z, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  }
  part('tower', new THREE.CylinderGeometry(0.2, 0.36, 1.35, 24), plaster, 0, 0.675, 0);
  part('roof', new THREE.ConeGeometry(0.3, 0.34, 24), roofMat, 0, 1.52, 0);
  part('door', new THREE.BoxGeometry(0.22, 0.42, 0.04), wood, 0, 0.23, 0.34);
  part('hub', new THREE.SphereGeometry(0.1, 20, 12), wood, 0, 1.3, 0.25);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    part('blade' + i, new THREE.BoxGeometry(0.62, 0.14, 0.055), sailMat,
      Math.cos(angle) * 0.34, 1.3 + Math.sin(angle) * 0.34, 0.25, angle);
  }
  return group;
}
