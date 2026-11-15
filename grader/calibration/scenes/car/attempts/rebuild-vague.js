// Rebuild (vague, "a car"): longer taller blue body, cabin centred, bigger wheels without hubs, round white headlights.
function buildScene(THREE) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x1f6fb4 }));
  body.position.y = 0.6;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), new THREE.MeshStandardMaterial({ color: 0x88ccff }));
  cabin.position.y = 1.15;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 24);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (const [x, z] of [[-0.8, 0.55], [0.8, 0.55], [-0.8, -0.55], [0.8, -0.55]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.32, z);
    car.add(w);
  }
  for (const z of [-0.35, 0.35]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    h.position.set(1.2, 0.65, z);
    car.add(h);
  }
  return car;
}
