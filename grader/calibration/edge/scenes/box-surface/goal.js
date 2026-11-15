// A solid green 1 m cube resting on the ground.
function buildScene(THREE) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
  box.position.y = 0.5;
  return box;
}
