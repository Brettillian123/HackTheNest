// Rebuild (detailed): no groups, world coordinates worked out by hand, box arms, lathe shade, 24-sided base.
function buildScene(THREE) {
  const root = new THREE.Group();
  const add = (geo, color, x, y, z, rz = 0, extra = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, ...extra }));
    m.position.set(x, y, z);
    m.rotation.z = rz;
    root.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24), 0x333333, 0, 0.05, 0);
  add(new THREE.BoxGeometry(0.075, 1.0, 0.075), 0xbbbbbb, 0.1947, 0.5606, 0, -0.4);
  add(new THREE.SphereGeometry(0.06, 10, 8), 0xbbbbbb, 0.3894, 1.0211, 0);
  add(new THREE.BoxGeometry(0.075, 0.8, 0.075), 0xbbbbbb, 0.0329, 1.2025, 0, 1.1);
  const profile = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.3, -0.4)];
  add(new THREE.LatheGeometry(profile, 28), 0x2e86c1, -0.3236, 1.384, 0, 0, { side: THREE.DoubleSide });
  add(new THREE.SphereGeometry(0.1, 14, 10), 0xfff3b0, -0.3236, 1.024, 0);
  return root;
}
