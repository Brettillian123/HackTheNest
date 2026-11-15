// Rebuild (detailed): four wall panels instead of one block, roof extruded from a triangle shape, a helper for every box.
function buildScene(THREE) {
  const house = new THREE.Group();
  const box = (w, h, d, color, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
    b.position.set(x, y, z);
    house.add(b);
    return b;
  };
  box(4, 0.1, 4, 0x6ab04c, 0, 0.05, 0);
  const wall = 0xf5e6c8;
  box(2.4, 1.6, 0.1, wall, 0, 0.9, 0.95);
  box(2.4, 1.6, 0.1, wall, 0, 0.9, -0.95);
  box(0.1, 1.6, 1.8, wall, 1.15, 0.9, 0);
  box(0.1, 1.6, 1.8, wall, -1.15, 0.9, 0);
  const tri = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 0.9)]);
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 2.8, bevelEnabled: false });
  roofGeo.translate(0, 0, -1.4);
  roofGeo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x8e2c1d }));
  roof.position.y = 1.7;
  house.add(roof);
  box(0.4, 0.8, 0.05, 0x6b3e26, 0.5, 0.5, 1.025);
  box(0.4, 0.4, 0.04, 0x9fd8ef, -0.55, 1.05, 1.02);
  box(0.04, 0.4, 0.4, 0x9fd8ef, 1.22, 1.05, 0);
  box(0.3, 0.7, 0.3, 0x777777, 0.7, 2.25, -0.5);
  return house;
}
