// A hollow box: six 5 cm slabs with the same outside as the solid cube.
function buildScene(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71 });
  const slab = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
  };
  slab(1, 0.05, 1, 0, 0.975, 0);
  slab(1, 0.05, 1, 0, 0.025, 0);
  slab(1, 0.9, 0.05, 0, 0.5, 0.475);
  slab(1, 0.9, 0.05, 0, 0.5, -0.475);
  slab(0.05, 0.9, 0.9, 0.475, 0.5, 0);
  slab(0.05, 0.9, 0.9, -0.475, 0.5, 0);
  return g;
}
