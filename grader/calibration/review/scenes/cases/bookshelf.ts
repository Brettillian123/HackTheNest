import { sub, type GoalSet } from './lib';

/** Many small repeated parts: a bookshelf with 7 boards and 8 books (15 named meshes). */
export const bookshelfGoal = `function buildScene(THREE) {
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
}`;
const goal = bookshelfGoal;

export const bookshelf: GoalSet = {
  id: 'bookshelf',
  goal,
  attempts: [
    {
      id: 'b1_excellent',
      note: 'fresh rebuild with loops; book heights and depths within 0.01',
      code: `function buildScene(THREE) {
  const root = new THREE.Group();
  const oak = new THREE.MeshStandardMaterial({ color: 0x8a5a2c });
  const box = (n, w, h, d, x, y, z, mat = oak) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.name = n; m.position.set(x, y, z); root.add(m); };
  box('left', 0.04, 1.8, 0.35, -0.58, 0.9, 0);
  box('right', 0.04, 1.8, 0.35, 0.58, 0.9, 0);
  box('top', 1.2, 0.04, 0.35, 0, 1.82, 0);
  for (const y of [0.02, 0.62, 1.22]) box('board' + y, 1.12, 0.04, 0.34, 0, y, 0.005);
  box('back', 1.2, 1.84, 0.02, 0, 0.92, -0.185, new THREE.MeshStandardMaterial({ color: 0x70461f }));
  const colors = [0xc0392b, 0x27ae60, 0x2e86de, 0xf1c40f, 0x8e44ad, 0x16a085, 0xe67e22, 0x34495e];
  const heights = [0.43, 0.45, 0.41, 0.44, 0.39, 0.44, 0.41, 0.47];
  colors.forEach((c, i) => {
    const low = i < 5;
    const x = low ? -0.48 + i * 0.1 : 0.2 + (i - 5) * 0.1;
    const base = low ? 0.04 : 0.64;
    box('book' + i, 0.08, heights[i], 0.25, x, base + heights[i] / 2, 0.02, new THREE.MeshStandardMaterial({ color: c }));
  });
  return root;
}`,
    },
    {
      id: 'b2_five_books',
      note: 'the goal with five books instead of eight (green, yellow and orange left out, gaps where they were)',
      code: sub(goal, ["['#27ae60', -0.38, 0.46, 0.04], ", ''], ["['#f1c40f', -0.18, 0.44, 0.04],", ''], ["['#e67e22', 0.30, 0.40, 0.64], ", '']),
    },
    {
      id: 'b3_books_swapped',
      note: 'the goal with the red and yellow books swapped (heights 0.42 and 0.44)',
      code: sub(
        goal,
        ["['#c0392b', -0.48, 0.42, 0.04]", 'TMP'],
        ["['#f1c40f', -0.18, 0.44, 0.04]", "['#c0392b', -0.18, 0.42, 0.04]"],
        ['TMP', "['#f1c40f', -0.48, 0.44, 0.04]"],
      ),
    },
    {
      id: 'b4_no_back',
      note: 'the goal without the back panel (seen through from the front, missing from the back)',
      code: sub(goal, ["  board('back', 1.2, 1.84, 0.02, 0, 0.92, -0.185, new THREE.MeshStandardMaterial({ color: '#6f4520' }));\n", '']),
    },
    {
      id: 'b5_mediocre',
      note: 'fresh rebuild, clumsy: deep thick boards, shelves at the wrong heights, eight identical brown books all on the bottom',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b' });
  const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || wood); b.position.set(x, y, z); g.add(b); };
  add(0.06, 1.8, 0.5, -0.57, 0.9, 0); add(0.06, 1.8, 0.5, 0.57, 0.9, 0);
  add(1.2, 0.06, 0.5, 0, 1.8, 0); add(1.08, 0.06, 0.5, 0, 0.03, 0);
  add(1.08, 0.06, 0.5, 0, 0.8, 0); add(1.08, 0.06, 0.5, 0, 1.4, 0);
  add(1.2, 1.8, 0.02, 0, 0.9, -0.26);
  const book = new THREE.MeshStandardMaterial({ color: '#a0522d' });
  for (let i = 0; i < 8; i++) add(0.1, 0.35, 0.3, -0.45 + i * 0.12, 0.235, 0.05, book);
  return g;
}`,
    },
    {
      id: 'b6_poor',
      note: 'right idea, few parts: an empty frame (sides, top, bottom); no shelves, back or books',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#8b5a2b' });
  for (const [w, h, d, x, y] of [[0.05, 1.84, 0.35, -0.575, 0.92], [0.05, 1.84, 0.35, 0.575, 0.92], [1.2, 0.05, 0.35, 0, 1.815], [1.2, 0.05, 0.35, 0, 0.025]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, 0); g.add(b);
  }
  return g;
}`,
    },
    {
      id: 'b7_good_slips',
      note: 'the goal with slips: upper shelf missing, two book colours off, top board 0.03 above the sides',
      code: sub(
        goal,
        ["  board('shelf2', 1.12, 0.04, 0.33, 0, 1.22, 0.01);\n", ''],
        ["'#c0392b'", "'#a93226'"],
        ["'#2e86de'", "'#5499c7'"],
        ['0, 1.82, 0)', '0, 1.85, 0)'],
      ),
    },
    {
      id: 'b8_shallow',
      note: 'the goal with the right front but less than half the depth (0.15 instead of 0.35), books shallower too',
      code: sub(goal, ['0.35', '0.15'], ['0.33', '0.14'], ['-0.185', '-0.085'], ['0.26, x, base + h / 2, 0.02', '0.11, x, base + h / 2, 0.01']),
    },
    {
      id: 'x6_bookshelf_block',
      note: 'CHEAT: one wood-coloured box the size of the bookshelf',
      code: `function buildScene(THREE) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.84, 0.39), new THREE.MeshStandardMaterial({ color: '#8b5a2b' }));
  m.position.set(0, 0.92, -0.01);
  return m;
}`,
    },
    {
      id: 'x7_bookshelf_painted_block',
      note: 'CHEAT: the same box with the shelves, opening and books painted on its front with vertex colours',
      code: `function buildScene(THREE) {
  const geo = new THREE.BoxGeometry(1.2, 1.84, 0.39, 48, 92, 1);
  const pos = geo.attributes.position;
  const books = [
    ['#c0392b', -0.48, 0.42, 0.04], ['#27ae60', -0.38, 0.46, 0.04], ['#2e86de', -0.28, 0.40, 0.04], ['#f1c40f', -0.18, 0.44, 0.04],
    ['#8e44ad', -0.08, 0.38, 0.04], ['#16a085', 0.20, 0.45, 0.64], ['#e67e22', 0.30, 0.40, 0.64], ['#34495e', 0.40, 0.48, 0.64],
  ];
  const c = new THREE.Color();
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + 0.92, z = pos.getZ(i);
    c.set('#8b5a2b');
    if (z > 0.19 && Math.abs(x) < 0.56 && y > 0.04 && y < 1.8 && Math.abs(y - 0.62) > 0.02 && Math.abs(y - 1.22) > 0.02) {
      c.set('#6f4520');
      for (const [col, bx, h, base] of books) if (Math.abs(x - bx) <= 0.04 && y >= base && y <= base + h) c.set(col);
    }
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }));
  m.position.set(0, 0.92, -0.01);
  return m;
}`,
    },
  ],
};
