function buildScene(THREE) {
  const shelf = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b' });
  function board(name, w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || wood);
    mesh.name = name;
    mesh.position.set(x, y, z);
    shelf.add(mesh);
  }
  board('sideL', 0.04, 1.8, 0.35, -0.58, 0.9, 0);
  board('sideR', 0.04, 1.8, 0.35, 0.58, 0.9, 0);
  board('top', 1.2, 0.04, 0.35, 0, 1.82, 0);
  board('bottom', 1.12, 0.04, 0.35, 0, 0.02, 0);
  board('shelf1', 1.12, 0.04, 0.33, 0, 0.62, 0.01);
  board('shelf2', 1.12, 0.04, 0.33, 0, 1.22, 0.01);
  board('back', 1.2, 1.84, 0.02, 0, 0.92, -0.185, new THREE.MeshStandardMaterial({ color: '#6f4520' }));
  const books = [
    ['#c0392b', -0.48, 0.42, 0.04], ['#27ae60', -0.38, 0.46, 0.04], ['#2e86de', -0.28, 0.40, 0.04], ['#f1c40f', -0.18, 0.44, 0.04],
    ['#8e44ad', -0.08, 0.38, 0.04], ['#16a085', 0.20, 0.45, 0.64], ['#e67e22', 0.30, 0.40, 0.64], ['#34495e', 0.40, 0.48, 0.64],
  ];
  books.forEach(([color, x, h, base], i) => {
    board('book' + (i + 1), 0.08, h, 0.26, x, base + h / 2, 0.02, new THREE.MeshStandardMaterial({ color }));
  });
  return shelf;
}
