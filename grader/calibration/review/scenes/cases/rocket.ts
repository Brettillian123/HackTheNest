import { sub, type GoalSet } from './lib';

/** Symmetric under rotation (four fins), with a window that breaks the symmetry. */
export const rocketGoal = `function buildScene(THREE) {
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
}`;
const goal = rocketGoal;

export const rocket: GoalSet = {
  id: 'rocket',
  goal,
  attempts: [
    {
      id: 'r1_excellent',
      note: 'fresh rebuild with a helper, 24 segments, sizes within a few percent',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xeaeaea, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
  const add = (geo, mat, name, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.3, 0.3, 2.0, 24), hull, 'hull', 0, 1.3, 0);
  add(new THREE.ConeGeometry(0.3, 0.68, 24), accent, 'noseCone', 0, 2.64, 0);
  add(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 24), accent, 'stripe', 0, 2.0, 0);
  const port = add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x4aa3df }), 'porthole', 0, 1.7, 0.29);
  port.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.17, 0.24, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x5a5a5a }), 'engine', 0, 0.175, 0);
  [0, 1, 2, 3].forEach((i) => {
    const a = (i * Math.PI) / 2;
    const f = add(new THREE.BoxGeometry(0.32, 0.58, 0.05), accent, 'fin' + i, Math.cos(a) * 0.46, 0.56, Math.sin(a) * 0.46);
    f.rotation.y = -a;
  });
  return g;
}`,
    },
    {
      id: 'r2_good_slips',
      note: 'the goal with slips: nose a little short with a small gap above the body, band orange, window missing',
      code: sub(
        goal,
        ['ConeGeometry(0.3, 0.7, 32)', 'ConeGeometry(0.3, 0.6, 32)'],
        ['nose.position.y = 2.65', 'nose.position.y = 2.64'],
        ['new THREE.CylinderGeometry(0.31, 0.31, 0.12, 32), red)', "new THREE.CylinderGeometry(0.31, 0.31, 0.12, 32), new THREE.MeshStandardMaterial({ color: '#e85d04' }))"],
        ['rocket.add(windowPane);', ''],
      ),
    },
    {
      id: 'r3_mediocre',
      note: 'fresh rebuild, clumsy: fat short body, tall nose, small fins, no band or window',
      code: `function buildScene(THREE) {
  const rocket = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.5, 24), new THREE.MeshStandardMaterial({ color: '#e8e8e8' }));
  body.position.y = 1.05; rocket.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 24), new THREE.MeshStandardMaterial({ color: '#d62828' }));
  nose.position.y = 2.3; rocket.add(nose);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.3, 24), new THREE.MeshStandardMaterial({ color: '#555555' }));
  nozzle.position.y = 0.15; rocket.add(nozzle);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.04), new THREE.MeshStandardMaterial({ color: '#d62828' }));
    const a = i * Math.PI / 2;
    fin.rotation.y = -a; fin.position.set(Math.cos(a) * 0.47, 0.5, Math.sin(a) * 0.47);
    rocket.add(fin);
  }
  return rocket;
}`,
    },
    {
      id: 'r4_poor',
      note: 'right idea, few parts: a white cylinder and a red cone, no fins, nozzle, band or window',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 24), new THREE.MeshStandardMaterial({ color: '#e8e8e8' }));
  b.position.y = 1.1; g.add(b);
  const n = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 24), new THREE.MeshStandardMaterial({ color: '#d62828' }));
  n.position.y = 2.55; g.add(n);
  return g;
}`,
    },
    {
      id: 'r5_fins_45',
      note: 'the goal, but the fins turned 45 degrees about the body (window still faces the front)',
      code: sub(goal, ['const a = i * Math.PI / 2;', 'const a = i * Math.PI / 2 + Math.PI / 4;']),
    },
    {
      id: 'r6_three_fins',
      note: 'the goal with three fins at 120 degrees instead of four',
      code: sub(goal, ['i < 4', 'i < 3'], ['const a = i * Math.PI / 2;', 'const a = i * 2 * Math.PI / 3;']),
    },
    {
      id: 'r7_no_nose',
      note: 'the goal without the nose cone: a flat-topped tube',
      code: sub(goal, ['nose.position.y = 2.65; rocket.add(nose);', 'nose.position.y = 2.65;']),
    },
    {
      id: 'x2_rocket_cube_cloud',
      note: 'CHEAT: ~700 small cubes filling the rocket volume, coloured by region',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const cube = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const white = new THREE.MeshStandardMaterial({ color: '#e8e8e8' });
  const red = new THREE.MeshStandardMaterial({ color: '#d62828' });
  const grey = new THREE.MeshStandardMaterial({ color: '#555555' });
  for (let j = 0; j < 30; j++) {
    const y = 0.05 + j * 0.1;
    for (let i = -6; i <= 6; i++) {
      for (let k = -6; k <= 6; k++) {
        const x = i * 0.1, z = k * 0.1, r = Math.hypot(x, z);
        let mat = null;
        if (y < 0.3) { if (r < 0.22) mat = grey; }
        else if (y < 2.3 && r < 0.3) mat = (y > 1.94 && y < 2.06) ? red : white;
        else if (y >= 2.3 && r < 0.3 * (3.0 - y) / 0.7) mat = red;
        if (!mat && y > 0.25 && y < 0.85 && r < 0.6 && (i === 0 || k === 0)) mat = red;
        if (!mat) continue;
        const m = new THREE.Mesh(cube, mat); m.position.set(x, y, z); g.add(m);
      }
    }
  }
  return g;
}`,
    },
    {
      id: 'x3_rocket_billboard',
      note: 'CHEAT: two crossed flat cut-outs of the rocket outline (fins included), like a cardboard model',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-0.25, 0.05); s.lineTo(0.25, 0.05); s.lineTo(0.3, 0.25); s.lineTo(0.6, 0.25); s.lineTo(0.6, 0.85); s.lineTo(0.3, 0.85);
  s.lineTo(0.3, 2.3); s.lineTo(0, 3.0); s.lineTo(-0.3, 2.3); s.lineTo(-0.3, 0.85); s.lineTo(-0.6, 0.85); s.lineTo(-0.6, 0.25); s.lineTo(-0.3, 0.25); s.lineTo(-0.25, 0.05);
  const mat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', side: THREE.DoubleSide });
  for (const turn of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
    m.rotation.y = turn; g.add(m);
  }
  return g;
}`,
    },
  ],
};
