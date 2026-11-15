function buildScene(THREE) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#b7b0a2' });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#7d3440' });
  const dark = new THREE.MeshStandardMaterial({ color: '#493b36' });
  const gold = new THREE.MeshStandardMaterial({ color: '#d5a642', metalness: 0.45, roughness: 0.5 });
  function part(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  part('wall', new THREE.BoxGeometry(1.45, 0.9, 0.24), stone, 0, 0.52, 0);
  part('gatehouse', new THREE.BoxGeometry(0.42, 0.72, 0.3), stone, 0, 0.42, 0.2);
  part('gateDoor', new THREE.BoxGeometry(0.22, 0.46, 0.04), dark, 0, 0.25, 0.37);
  part('keep', new THREE.BoxGeometry(0.66, 1.3, 0.55), stone, 0, 0.78, -0.34);
  part('keepRoof', new THREE.ConeGeometry(0.48, 0.42, 4), roofMat, 0, 1.64, -0.34);
  const towers = [[-0.83, 0.82, 0.05], [0.83, 0.82, 0.05], [-0.56, 0.75, -0.49], [0.56, 0.75, -0.49]];
  towers.forEach(([x, y, z], i) => {
    part('tower' + i, new THREE.CylinderGeometry(0.22, 0.24, 1.05, 20), stone, x, y, z);
    part('turret' + i, new THREE.ConeGeometry(0.29, 0.38, 20), roofMat, x, y + 0.71, z);
  });
  for (let i = 0; i < 5; i++) part('crenel' + i, new THREE.BoxGeometry(0.16, 0.18, 0.25), stone, -0.58 + i * 0.29, 1.08, 0.02);
  part('bannerPole', new THREE.CylinderGeometry(0.018, 0.018, 0.46, 8), gold, 0.25, 1.98, -0.34);
  part('banner', new THREE.BoxGeometry(0.24, 0.24, 0.025), roofMat, 0.37, 2.06, -0.34);
  return group;
}
