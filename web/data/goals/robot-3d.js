function buildScene(THREE) {
  const group = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: '#b9c4cc', metalness: 0.35, roughness: 0.48 });
  const navy = new THREE.MeshStandardMaterial({ color: '#304b67', metalness: 0.2, roughness: 0.5 });
  const cyan = new THREE.MeshStandardMaterial({ color: '#37bfd0', emissive: '#0c3438' });
  const orange = new THREE.MeshStandardMaterial({ color: '#ef8b3a' });
  function part(name, geometry, material, x, y, z, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  }
  part('torso', new THREE.BoxGeometry(0.62, 0.68, 0.34), silver, 0, 1.05, 0);
  part('neck', new THREE.CylinderGeometry(0.1, 0.1, 0.14, 16), navy, 0, 1.47, 0);
  part('head', new THREE.BoxGeometry(0.52, 0.42, 0.38), navy, 0, 1.77, 0);
  part('eyeLeft', new THREE.SphereGeometry(0.055, 16, 12), cyan, -0.12, 1.81, 0.2);
  part('eyeRight', new THREE.SphereGeometry(0.055, 16, 12), cyan, 0.12, 1.81, 0.2);
  part('mouth', new THREE.BoxGeometry(0.18, 0.035, 0.025), silver, 0, 1.66, 0.2);
  part('chestPanel', new THREE.BoxGeometry(0.32, 0.22, 0.035), navy, 0, 1.08, 0.19);
  part('chestLight', new THREE.SphereGeometry(0.055, 16, 12), orange, 0, 1.09, 0.22);
  part('armLeft', new THREE.CylinderGeometry(0.075, 0.075, 0.52, 16), navy, -0.42, 1.02, 0, -0.18);
  part('armRight', new THREE.CylinderGeometry(0.075, 0.075, 0.52, 16), navy, 0.42, 1.02, 0, 0.18);
  part('handLeft', new THREE.SphereGeometry(0.09, 16, 12), silver, -0.48, 0.75, 0);
  part('handRight', new THREE.SphereGeometry(0.09, 16, 12), silver, 0.48, 0.75, 0);
  part('legLeft', new THREE.BoxGeometry(0.18, 0.42, 0.22), navy, -0.17, 0.52, 0);
  part('legRight', new THREE.BoxGeometry(0.18, 0.42, 0.22), navy, 0.17, 0.52, 0);
  part('footLeft', new THREE.BoxGeometry(0.28, 0.12, 0.34), silver, -0.17, 0.12, 0.05);
  part('footRight', new THREE.BoxGeometry(0.28, 0.12, 0.34), silver, 0.17, 0.12, 0.05);
  part('antenna', new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10), silver, 0, 2.08, 0);
  part('antennaTip', new THREE.SphereGeometry(0.06, 16, 12), orange, 0, 2.21, 0);
  return group;
}
