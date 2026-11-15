// Rebuild (vague, "a desk lamp"): own proportions, straight post then one 45-degree arm, small black closed shade.
function buildScene(THREE) {
  const lamp = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const steel = new THREE.MeshStandardMaterial({ color: 0x999999 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.08, 32), black);
  base.position.y = 0.04;
  lamp.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 16), steel);
  post.position.y = 0.53;
  lamp.add(post);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 16), steel);
  arm.position.set(-0.212, 1.192, 0);
  arm.rotation.z = Math.PI / 4;
  lamp.add(arm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 32), black);
  shade.position.set(-0.424, 1.254, 0);
  lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffcc }));
  bulb.position.set(-0.424, 1.08, 0);
  lamp.add(bulb);
  return lamp;
}
