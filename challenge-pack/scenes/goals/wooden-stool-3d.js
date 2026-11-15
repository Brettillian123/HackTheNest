function buildScene(THREE) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#a66a3f' });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#754728' });
  function part(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  part('seat', new THREE.BoxGeometry(0.9, 0.14, 0.82), wood, 0, 0.91, 0);
  const corners = [[-0.31, -0.27], [0.31, -0.27], [-0.31, 0.27], [0.31, 0.27]];
  corners.forEach(([x, z], i) => part('leg' + i, new THREE.BoxGeometry(0.12, 0.82, 0.12), darkWood, x, 0.41, z));
  part('railFront', new THREE.BoxGeometry(0.58, 0.09, 0.08), wood, 0, 0.38, 0.27);
  part('railBack', new THREE.BoxGeometry(0.58, 0.09, 0.08), wood, 0, 0.38, -0.27);
  part('railLeft', new THREE.BoxGeometry(0.08, 0.09, 0.48), wood, -0.31, 0.38, 0);
  part('railRight', new THREE.BoxGeometry(0.08, 0.09, 0.48), wood, 0.31, 0.38, 0);
  return group;
}
