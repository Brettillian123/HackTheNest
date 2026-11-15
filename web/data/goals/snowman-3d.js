function buildScene(THREE) {
  const snowman = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f6f8' });
  const coal = new THREE.MeshStandardMaterial({ color: '#1b1b1b' });
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4423' });
  function part(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    snowman.add(mesh);
    return mesh;
  }
  part('base', new THREE.SphereGeometry(0.6, 32, 16), snow, 0, 0.6, 0);
  part('middle', new THREE.SphereGeometry(0.42, 32, 16), snow, 0, 1.45, 0);
  part('head', new THREE.SphereGeometry(0.3, 32, 16), snow, 0, 2.05, 0);
  part('brim', new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32), coal, 0, 2.3, 0);
  part('crown', new THREE.CylinderGeometry(0.22, 0.22, 0.35, 32), coal, 0, 2.495, 0);
  const nose = part('nose', new THREE.ConeGeometry(0.05, 0.25, 16), new THREE.MeshStandardMaterial({ color: '#f77f00' }), 0, 2.05, 0.4);
  nose.rotation.x = Math.PI / 2;
  const armL = part('armL', new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), wood, -0.75, 1.65, 0);
  armL.rotation.z = Math.PI / 3;
  const armR = part('armR', new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), wood, 0.75, 1.65, 0);
  armR.rotation.z = -Math.PI / 3;
  part('button1', new THREE.SphereGeometry(0.04, 12, 8), coal, 0, 1.62, 0.39);
  part('button2', new THREE.SphereGeometry(0.04, 12, 8), coal, 0, 1.45, 0.42);
  part('button3', new THREE.SphereGeometry(0.04, 12, 8), coal, 0, 1.28, 0.39);
  part('eyeL', new THREE.SphereGeometry(0.035, 12, 8), coal, -0.1, 2.13, 0.27);
  part('eyeR', new THREE.SphereGeometry(0.035, 12, 8), coal, 0.1, 2.13, 0.27);
  return snowman;
}
