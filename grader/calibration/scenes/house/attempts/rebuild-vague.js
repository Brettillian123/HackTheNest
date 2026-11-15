// Rebuild (vague, "a house"): boxy walls, pyramid roof from a four-sided cone, door and two front windows, no chimney, no ground.
function buildScene(THREE) {
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  walls.position.y = 0.75;
  house.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
  roof.position.y = 2.0;
  roof.rotation.y = Math.PI / 4;
  house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0x4a2c17 }));
  door.position.set(0, 0.35, 1.02);
  house.add(door);
  for (const x of [-0.6, 0.6]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.05), new THREE.MeshStandardMaterial({ color: 0x87ceeb }));
    w.position.set(x, 0.95, 1.02);
    house.add(w);
  }
  return house;
}
