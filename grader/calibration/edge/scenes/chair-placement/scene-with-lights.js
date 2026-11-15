// The right chair returned inside a Scene with an ambient light, a directional light and a camera.
function chair(THREE) {
  const chair = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const cushion = new THREE.MeshStandardMaterial({ color: 0xc0392b });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3e2a1c });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), cushion);
  seat.position.set(0, 0.96, 0);
  chair.add(seat);

  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), wood);
    leg.position.set(x, 0.45, z);
    chair.add(leg);
  }

  for (const x of [-0.42, 0.42]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
    post.position.set(x, 1.47, -0.44);
    chair.add(post);
  }

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.06), dark);
  back.position.set(0, 1.65, -0.44);
  chair.add(back);
  return chair;
}

function buildScene(THREE) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(3, 3, 3);
  scene.add(cam);
  scene.add(chair(THREE));
  return scene;
}
