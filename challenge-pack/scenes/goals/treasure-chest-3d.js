function buildScene(THREE) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a512e' });
  const dark = new THREE.MeshStandardMaterial({ color: '#55331f' });
  const brass = new THREE.MeshStandardMaterial({ color: '#d5a642', metalness: 0.55, roughness: 0.4 });
  function part(name, geometry, material, x, y, z, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  }
  part('chest', new THREE.BoxGeometry(0.96, 0.55, 0.62), wood, 0, 0.34, 0);
  part('lid', new THREE.BoxGeometry(1.02, 0.2, 0.68), dark, 0, 0.72, 0);
  part('strapLeft', new THREE.BoxGeometry(0.12, 0.76, 0.7), brass, -0.28, 0.38, 0);
  part('strapRight', new THREE.BoxGeometry(0.12, 0.76, 0.7), brass, 0.28, 0.38, 0);
  part('lockPlate', new THREE.BoxGeometry(0.2, 0.22, 0.045), brass, 0, 0.5, 0.34);
  part('keyhole', new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), dark, 0, 0.51, 0.37, Math.PI / 2);
  part('footLeft', new THREE.BoxGeometry(0.16, 0.12, 0.18), dark, -0.32, 0.06, 0);
  part('footRight', new THREE.BoxGeometry(0.16, 0.12, 0.18), dark, 0.32, 0.06, 0);
  return group;
}
