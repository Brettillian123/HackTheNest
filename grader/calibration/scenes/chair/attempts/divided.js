// The same chair, divided differently: the seat is two halves, and the legs
// and back sit in their own groups with their own positions.
function buildScene(THREE) {
  const scene = new THREE.Scene();
  const wood = new THREE.MeshLambertMaterial({ color: '#8b5a2b' });
  const red = new THREE.MeshLambertMaterial({ color: '#c0392b' });
  const dark = new THREE.MeshLambertMaterial({ color: '#3e2a1c' });

  for (const x of [-0.25, 0.25]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1), red);
    half.position.set(x, 0.96, 0);
    scene.add(half);
  }

  const legs = new THREE.Group();
  legs.position.y = 0.45;
  const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(legGeometry, wood);
    leg.position.set(i % 2 ? 0.42 : -0.42, 0, i < 2 ? -0.42 : 0.42);
    legs.add(leg);
  }
  scene.add(legs);

  const back = new THREE.Group();
  back.position.set(0, 1.5, -0.44);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
  left.position.set(-0.42, -0.03, 0);
  const right = left.clone();
  right.position.x = 0.42;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.06), dark);
  panel.position.y = 0.15;
  back.add(left, right, panel);
  scene.add(back);
  return scene;
}
