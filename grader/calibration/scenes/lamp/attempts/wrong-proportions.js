// Wrong proportions: the lower arm is 1.6 times too long (1.6 instead of 1.0).
function buildScene(THREE) {
  const lamp = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xbbbbbb });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  base.position.y = 0.05;
  lamp.add(base);
  const lower = new THREE.Group();
  lower.position.y = 0.1;
  lower.rotation.z = -0.4;
  lamp.add(lower);
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 12), metal);
  arm1.position.y = 0.8;
  lower.add(arm1);
  const upper = new THREE.Group();
  upper.position.y = 1.6;
  upper.rotation.z = 1.5;
  lower.add(upper);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), metal);
  upper.add(elbow);
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12), metal);
  arm2.position.y = 0.4;
  upper.add(arm2);
  const head = new THREE.Group();
  head.position.y = 0.8;
  head.rotation.z = -1.1;
  upper.add(head);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2e86c1, side: THREE.DoubleSide }));
  shade.position.y = -0.2;
  head.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff3b0 }));
  bulb.position.y = -0.36;
  head.add(bulb);
  return lamp;
}
