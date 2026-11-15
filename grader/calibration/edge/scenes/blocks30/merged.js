// The same 30 blocks merged into one BufferGeometry and one mesh.
function buildScene(THREE) {
  const pos = [];
  const nor = [];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 5; j++) {
      const b = new THREE.BoxGeometry(0.25, 0.25, 0.25).toNonIndexed();
      b.translate(j * 0.25 - 0.5, i * 0.25 + 0.125, -i * 0.25);
      pos.push(...b.attributes.position.array);
      nor.push(...b.attributes.normal.array);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4477aa }));
}
