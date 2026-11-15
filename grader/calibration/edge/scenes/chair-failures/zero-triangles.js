// A mesh whose geometry has no triangles at all.
function buildScene(THREE) {
  return new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
}
