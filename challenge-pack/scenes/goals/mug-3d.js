function buildScene(THREE) {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#2f6db5' });
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.7, 0.06, 48), new THREE.MeshStandardMaterial({ color: '#f2f2ee' }));
  saucer.name = 'saucer';
  saucer.position.y = 0.03;
  group.add(saucer);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1.1, 48), blue);
  body.name = 'body';
  body.position.y = 0.61;
  group.add(body);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 48), new THREE.MeshStandardMaterial({ color: '#4a2c1a' }));
  coffee.name = 'coffee';
  coffee.position.y = 1.165;
  group.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 16, 32, Math.PI), blue);
  handle.name = 'handle';
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.47, 0.62, 0);
  group.add(handle);
  return group;
}
