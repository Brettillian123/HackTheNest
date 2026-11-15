// The cube with every triangle wound inside-out, drawn DoubleSide (looks the same in three.js).
function buildScene(THREE) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const box = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2ecc71, side: THREE.DoubleSide }));
  box.position.y = 0.5;
  return box;
}
