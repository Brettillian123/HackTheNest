function buildScene(THREE) {
  const rocket = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#e8e8e8' });
  const red = new THREE.MeshStandardMaterial({ color: '#d62828' });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.0, 32), white);
  body.name = 'body'; body.position.y = 1.3; rocket.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 32), red);
  nose.name = 'nose'; nose.position.y = 2.65; rocket.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 32), red);
  band.name = 'band'; band.position.y = 2.0; rocket.add(band);
  const windowPane = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 24), new THREE.MeshStandardMaterial({ color: '#4ea8de' }));
  windowPane.name = 'window'; windowPane.rotation.x = Math.PI / 2; windowPane.position.set(0, 1.7, 0.29); rocket.add(windowPane);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.25, 24), new THREE.MeshStandardMaterial({ color: '#555555' }));
  nozzle.name = 'nozzle'; nozzle.position.y = 0.175; rocket.add(nozzle);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.04), red);
    fin.name = 'fin' + i;
    fin.rotation.y = -a;
    fin.position.set(Math.cos(a) * 0.45, 0.55, Math.sin(a) * 0.45);
    rocket.add(fin);
  }
  return rocket;
}
