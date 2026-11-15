// Code that throws before building anything.
function buildScene(THREE) {
  const chair = new THREE.Group();
  chair.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), undefinedMaterial));
  return chair;
}
