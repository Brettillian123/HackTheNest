function buildScene(THREE) {
  const group = new THREE.Group();
  const ivory = new THREE.MeshStandardMaterial({ color: '#f2eee2' });
  const red = new THREE.MeshStandardMaterial({ color: '#c84b42' });
  const stone = new THREE.MeshStandardMaterial({ color: '#686d70' });
  const glass = new THREE.MeshStandardMaterial({ color: '#8bc4d6', roughness: 0.35, metalness: 0.1 });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#654736' });
  function part(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  part('base', new THREE.CylinderGeometry(0.52, 0.52, 0.12, 32), stone, 0, 0.06, 0);
  part('tower', new THREE.CylinderGeometry(0.35, 0.46, 1.75, 32), ivory, 0, 0.995, 0);
  part('redBand1', new THREE.CylinderGeometry(0.426, 0.437, 0.16, 32), red, 0, 0.62, 0);
  part('redBand2', new THREE.CylinderGeometry(0.378, 0.388, 0.16, 32), red, 0, 1.34, 0);
  part('balcony', new THREE.CylinderGeometry(0.48, 0.48, 0.08, 32), stone, 0, 1.91, 0);
  part('lantern', new THREE.CylinderGeometry(0.25, 0.25, 0.34, 24), glass, 0, 2.12, 0);
  part('roof', new THREE.ConeGeometry(0.34, 0.3, 24), red, 0, 2.44, 0);
  part('door', new THREE.BoxGeometry(0.2, 0.36, 0.035), doorMat, 0, 0.28, 0.446);
  part('window', new THREE.BoxGeometry(0.12, 0.12, 0.025), glass, 0, 1.55, 0.378);
  return group;
}
