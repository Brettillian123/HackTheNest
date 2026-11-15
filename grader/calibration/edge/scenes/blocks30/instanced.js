// The same 30 blocks as one InstancedMesh with 30 instances.
function buildScene(THREE) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x4477aa }), 30);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 5; j++) {
      m.makeTranslation(j * 0.25 - 0.5, i * 0.25 + 0.125, -i * 0.25);
      mesh.setMatrixAt(k++, m);
    }
  }
  return mesh;
}
