// Rebuild (detailed): flat code, no nested groups, body split into two halves, wheel geometry pre-rotated and shared.
function buildScene(THREE) {
  const car = new THREE.Group();
  const m = (c) => new THREE.MeshStandardMaterial({ color: c });
  const put = (geo, mat, x, y, z) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    car.add(o);
  };
  const red = m(0xd62828);
  const half = new THREE.BoxGeometry(1.0, 0.5, 1.0);
  put(half, red, -0.5, 0.45, 0);
  put(half, red, 0.5, 0.45, 0);
  put(new THREE.BoxGeometry(1.1, 0.4, 0.9), m(0x223344), -0.1, 0.9, 0);
  const lampGeo = new THREE.BoxGeometry(0.06, 0.12, 0.2);
  const yellow = m(0xffee88);
  put(lampGeo, yellow, 1.03, 0.5, -0.3);
  put(lampGeo, yellow, 1.03, 0.5, 0.3);
  const tyre = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 24).rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10).rotateX(Math.PI / 2);
  const black = m(0x111111);
  const grey = m(0xaaaaaa);
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.5, 0.5]) {
      put(tyre, black, x, 0.25, z);
      put(hub, grey, x, 0.25, z);
    }
  }
  return car;
}
