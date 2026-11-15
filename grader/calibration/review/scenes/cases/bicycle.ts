import { sub, type GoalSet } from './lib';

/** Thin and spindly: torus wheels and thin tubes (12 named meshes). */
export const bicycleGoal = `function buildScene(THREE) {
  const bike = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c1121f' });
  const steel = new THREE.MeshStandardMaterial({ color: '#aaaaaa' });
  const black = new THREE.MeshStandardMaterial({ color: '#222222' });
  const up = new THREE.Vector3(0, 1, 0);
  function tube(name, a, b, radius, material) {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 12), material);
    mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    bike.add(mesh);
  }
  for (const [name, x] of [['rearWheel', -0.55], ['frontWheel', 0.55]]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 12, 48), black);
    wheel.name = name;
    wheel.position.set(x, 0.375, 0);
    bike.add(wheel);
  }
  tube('chainStay', [-0.55, 0.375, 0], [-0.05, 0.3, 0], 0.018, red);
  tube('seatStay', [-0.55, 0.375, 0], [-0.2, 0.85, 0], 0.018, red);
  tube('seatTube', [-0.05, 0.3, 0], [-0.22, 0.9, 0], 0.022, red);
  tube('topTube', [-0.2, 0.85, 0], [0.4, 0.85, 0], 0.022, red);
  tube('downTube', [-0.05, 0.3, 0], [0.42, 0.75, 0], 0.025, red);
  tube('fork', [0.4, 0.85, 0], [0.55, 0.375, 0], 0.02, steel);
  tube('stem', [0.4, 0.85, 0], [0.37, 0.98, 0], 0.018, steel);
  tube('handlebar', [0.37, 0.98, -0.22], [0.37, 0.98, 0.22], 0.016, steel);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), black);
  seat.name = 'seat';
  seat.position.set(-0.23, 0.92, 0);
  bike.add(seat);
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24), steel);
  chainring.name = 'chainring';
  chainring.rotation.x = Math.PI / 2;
  chainring.position.set(-0.05, 0.3, 0.03);
  bike.add(chainring);
  return bike;
}`;
const goal = bicycleGoal;

export const bicycle: GoalSet = {
  id: 'bicycle',
  goal,
  attempts: [
    {
      id: 'k1_excellent',
      note: 'fresh rebuild with lookAt rods, 10-sided tubes, wheel and tube sizes within 0.01',
      code: `function buildScene(THREE) {
  const bike = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc41420 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1e1e1e });
  function rod(name, x1, y1, z1, x2, y2, z2, r, mat) {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const geo = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    m.name = name;
    bike.add(m);
  }
  ['rear', 'front'].forEach((n, i) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.028, 10, 40), rubber);
    w.position.set(i ? 0.56 : -0.55, 0.373, 0); w.name = n + 'Wheel'; bike.add(w);
  });
  rod('chainStay', -0.55, 0.37, 0, -0.05, 0.3, 0, 0.018, frameMat);
  rod('seatStay', -0.55, 0.37, 0, -0.2, 0.84, 0, 0.018, frameMat);
  rod('seatTube', -0.05, 0.3, 0, -0.22, 0.9, 0, 0.022, frameMat);
  rod('topTube', -0.2, 0.84, 0, 0.41, 0.85, 0, 0.022, frameMat);
  rod('downTube', -0.05, 0.3, 0, 0.43, 0.75, 0, 0.026, frameMat);
  rod('fork', 0.41, 0.85, 0, 0.56, 0.373, 0, 0.02, metal);
  rod('stem', 0.41, 0.85, 0, 0.38, 0.98, 0, 0.018, metal);
  rod('bars', 0.38, 0.98, -0.21, 0.38, 0.98, 0.21, 0.016, metal);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.045, 0.1), rubber); saddle.position.set(-0.23, 0.92, 0); saddle.name = 'saddle'; bike.add(saddle);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20), metal); ring.rotation.x = Math.PI / 2; ring.position.set(-0.05, 0.3, 0.03); ring.name = 'chainring'; bike.add(ring);
  return bike;
}`,
    },
    {
      id: 'k2_good_slips',
      note: 'the goal with slips: wheels a little small (0.32, so they float 0.03), seat 0.06 high off its tube, handlebar black',
      code: sub(
        goal,
        ['TorusGeometry(0.35, 0.025, 12, 48)', 'TorusGeometry(0.32, 0.025, 12, 48)'],
        ['seat.position.set(-0.23, 0.92, 0)', 'seat.position.set(-0.24, 0.98, 0)'],
        ['[0.37, 0.98, 0.22], 0.016, steel)', '[0.37, 0.98, 0.22], 0.016, black)'],
      ),
    },
    {
      id: 'k3_mediocre',
      note: 'fresh rebuild, clumsy: small wheels, thick tubes at rough angles, no seat stay or chainring',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c1121f' });
  const black = new THREE.MeshStandardMaterial({ color: '#222222' });
  for (const x of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 10, 32), black); w.position.set(x, 0.3, 0); g.add(w); }
  const bar = (len, x, y, rz) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 12), red); m.position.set(x, y, 0); m.rotation.z = rz; g.add(m); };
  bar(1.0, 0, 0.75, Math.PI / 2);
  bar(0.65, -0.15, 0.5, 0.3);
  bar(0.75, 0.15, 0.5, -0.9);
  bar(0.6, 0.47, 0.55, 0.2);
  bar(0.5, -0.25, 0.3, Math.PI / 2);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.12), black); seat.position.set(-0.22, 0.85, 0); g.add(seat);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12), black); h.rotation.x = Math.PI / 2; h.position.set(0.5, 0.9, 0); g.add(h);
  return g;
}`,
    },
    {
      id: 'k4_poor',
      note: 'right idea, few parts: two wheels joined by one red bar',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: '#222222' });
  for (const x of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 12, 32), black); w.position.set(x, 0.375, 0); g.add(w); }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: '#c1121f' }));
  frame.position.y = 0.7; g.add(frame);
  return g;
}`,
    },
    {
      id: 'k5_disc_wheels',
      note: 'the goal with solid disc wheels (cylinders) instead of tyres',
      code: sub(
        goal,
        ['new THREE.TorusGeometry(0.35, 0.025, 12, 48)', 'new THREE.CylinderGeometry(0.375, 0.375, 0.05, 48)'],
        ['wheel.name = name;', 'wheel.name = name;\n    wheel.rotation.x = Math.PI / 2;'],
      ),
    },
    {
      id: 'k6_bar_rotated',
      note: 'the goal with the handlebar turned 90 degrees in place (along the bike instead of across it)',
      code: sub(goal, ['[0.37, 0.98, -0.22], [0.37, 0.98, 0.22]', '[0.15, 0.98, 0], [0.59, 0.98, 0]']),
    },
    {
      id: 'k7_bloat',
      note: 'the goal at very high detail: tyres 40x400, tubes 96-sided (about 24 times the triangles)',
      code: sub(
        goal,
        ['TorusGeometry(0.35, 0.025, 12, 48)', 'TorusGeometry(0.35, 0.025, 40, 400)'],
        ['dir.length(), 12)', 'dir.length(), 96)'],
        ['0.08, 0.08, 0.02, 24)', '0.08, 0.08, 0.02, 192)'],
      ),
    },
    {
      id: 'k8_flattened',
      note: 'the goal squashed to 5% of its depth: right from the side, a flat sheet from above',
      code: sub(goal, ['return bike;', 'bike.scale.z = 0.05;\n  return bike;']),
    },
    {
      id: 'x8_bicycle_boxes',
      note: 'CHEAT: a box per region in the right colours (square slabs for wheels, one slab for the frame)',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c })); m.position.set(x, y, z); g.add(m); };
  box(0.75, 0.75, 0.05, -0.55, 0.375, 0, '#222222');
  box(0.75, 0.75, 0.05, 0.55, 0.375, 0, '#222222');
  box(0.6, 0.55, 0.04, 0.1, 0.6, 0, '#c1121f');
  box(0.12, 0.5, 0.04, 0.48, 0.62, 0, '#aaaaaa');
  box(0.04, 0.04, 0.44, 0.37, 0.98, 0, '#aaaaaa');
  box(0.22, 0.04, 0.1, -0.23, 0.92, 0, '#222222');
  return g;
}`,
    },
  ],
};
