// The cube's outside made of six PlaneGeometry faces (no thickness, no volume).
function buildScene(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71 });
  const face = (x, y, z, rx, ry) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    p.position.set(x, y, z);
    p.rotation.set(rx, ry, 0);
    g.add(p);
  };
  face(0, 0.5, 0.5, 0, 0);
  face(0, 0.5, -0.5, 0, Math.PI);
  face(0.5, 0.5, 0, 0, Math.PI / 2);
  face(-0.5, 0.5, 0, 0, -Math.PI / 2);
  face(0, 1, 0, -Math.PI / 2, 0);
  face(0, 0, 0, Math.PI / 2, 0);
  return g;
}
