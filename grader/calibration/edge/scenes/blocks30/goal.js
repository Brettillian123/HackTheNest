// A stepped ramp of 30 blue blocks (6 steps, 5 wide), each block its own mesh.
function buildScene(THREE) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4477aa });
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(geo, mat);
      b.position.set(j * 0.25 - 0.5, i * 0.25 + 0.125, -i * 0.25);
      g.add(b);
    }
  }
  return g;
}
