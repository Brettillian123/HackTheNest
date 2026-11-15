function buildScene(THREE) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#24577a' });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#d3a66d' });
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f4f1e8', side: THREE.DoubleSide });
  const red = new THREE.MeshStandardMaterial({ color: '#c95849', side: THREE.DoubleSide });
  const mastMat = new THREE.MeshStandardMaterial({ color: '#63482f' });
  function part(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.86, -0.18);
  hullShape.lineTo(0.72, -0.18);
  hullShape.lineTo(0.94, 0);
  hullShape.lineTo(0.65, 0.25);
  hullShape.lineTo(-0.58, 0.25);
  hullShape.closePath();
  const hull = part('hull', new THREE.ExtrudeGeometry(hullShape, { depth: 0.24, bevelEnabled: false }), hullMat, 0, 0.38, -0.12);
  hull.rotation.x = Math.PI / 2;
  part('deck', new THREE.BoxGeometry(1.2, 0.06, 0.34), deckMat, -0.02, 0.5, 0);
  part('mast', new THREE.CylinderGeometry(0.035, 0.045, 1.65, 12), mastMat, 0.08, 1.28, 0);
  const mainShape = new THREE.Shape();
  mainShape.moveTo(0.04, 0.52); mainShape.lineTo(-0.62, 0.5); mainShape.lineTo(0.04, 1.34); mainShape.closePath();
  part('mainSail', new THREE.ShapeGeometry(mainShape), sailMat, 0.08, 0.48, 0.04);
  const frontShape = new THREE.Shape();
  frontShape.moveTo(0.13, 0.5); frontShape.lineTo(0.78, 0.5); frontShape.lineTo(0.13, 1.17); frontShape.closePath();
  part('frontSail', new THREE.ShapeGeometry(frontShape), red, 0.08, 0.48, 0.045);
  part('cabin', new THREE.BoxGeometry(0.38, 0.2, 0.3), deckMat, -0.38, 0.62, 0);
  return group;
}
