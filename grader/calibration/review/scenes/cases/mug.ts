import { sub, type GoalSet } from './lib';

/** Mostly curved surfaces: a mug on a saucer with a half-torus handle and a coffee disc on top. */
const goal = `function buildScene(THREE) {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#2f6db5' });
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.7, 0.06, 48), new THREE.MeshStandardMaterial({ color: '#f2f2ee' }));
  saucer.name = 'saucer';
  saucer.position.y = 0.03;
  group.add(saucer);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1.1, 48), blue);
  body.name = 'body';
  body.position.y = 0.61;
  group.add(body);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 48), new THREE.MeshStandardMaterial({ color: '#4a2c1a' }));
  coffee.name = 'coffee';
  coffee.position.y = 1.165;
  group.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 16, 32, Math.PI), blue);
  handle.name = 'handle';
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.47, 0.62, 0);
  group.add(handle);
  return group;
}`;

export const mug: GoalSet = {
  id: 'mug',
  goal,
  attempts: [
    {
      id: 'm1_excellent',
      note: 'fresh rebuild: lathe body, circle for the coffee, fewer segments, near-identical sizes and colours',
      code: `function buildScene(THREE) {
  const mug = new THREE.Group();
  const glaze = new THREE.MeshStandardMaterial({ color: 0x3270b8, roughness: 0.4, side: THREE.DoubleSide });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.7, 0.06, 40), new THREE.MeshStandardMaterial({ color: 0xf0f0ea }));
  plate.name = 'plate'; plate.position.y = 0.03; mug.add(plate);
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.45, 0), new THREE.Vector2(0.5, 1.1), new THREE.Vector2(0, 1.1)];
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), glaze);
  cup.name = 'cup'; cup.position.y = 0.06; mug.add(cup);
  const drink = new THREE.Mesh(new THREE.CircleGeometry(0.46, 40), new THREE.MeshStandardMaterial({ color: 0x4b2d1b }));
  drink.rotation.x = -Math.PI / 2; drink.position.y = 1.165; drink.name = 'coffee'; mug.add(drink);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 12, 24, Math.PI), glaze);
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.47, 0.6, 0); handle.name = 'handle'; mug.add(handle);
  return mug;
}`,
    },
    {
      id: 'm2_good_slips',
      note: 'fresh rebuild with slips: straight-sided body a little taller, handle a little small, coffee too light, saucer not tapered',
      code: `function buildScene(THREE) {
  const scene = new THREE.Group();
  const mugMat = new THREE.MeshStandardMaterial({ color: '#2f6db5' });
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 32), new THREE.MeshStandardMaterial({ color: '#f2f2ee' }));
  saucer.position.y = 0.04; saucer.name = 'saucer'; scene.add(saucer);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.18, 32), mugMat);
  body.position.y = 0.08 + 0.59; body.name = 'body'; scene.add(body);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 32), new THREE.MeshStandardMaterial({ color: '#7a4a2a' }));
  coffee.position.y = 1.27; coffee.name = 'coffee'; scene.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 12, 24, Math.PI), mugMat);
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.5, 0.7, 0); handle.name = 'handle'; scene.add(handle);
  return scene;
}`,
    },
    {
      id: 'm3_mediocre',
      note: 'fresh rebuild, right parts, clumsy proportions: squat wide body, chunky full-ring handle, small saucer',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#2f6db5' });
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 32), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  saucer.position.y = 0.025; g.add(saucer);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.85, 32), blue);
  body.position.y = 0.475; g.add(body);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 32), new THREE.MeshStandardMaterial({ color: '#4a2c1a' }));
  coffee.position.y = 0.91; g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.12, 12, 24), blue);
  handle.position.set(0.75, 0.5, 0); g.add(handle);
  return g;
}`,
    },
    {
      id: 'm4_poor',
      note: 'right idea, few parts: a blue cylinder and a box for a handle, no saucer, no coffee',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#2f6db5' });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 24), m);
  cup.position.y = 0.55; g.add(cup);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.12), m);
  h.position.set(0.6, 0.6, 0); g.add(h);
  return g;
}`,
    },
    {
      id: 'm5_handle_left',
      note: 'the goal exactly, but the handle on the left: the same mug turned half round',
      code: sub(goal, ['handle.rotation.z = -Math.PI / 2;', 'handle.rotation.z = Math.PI / 2;'], ['handle.position.set(0.47', 'handle.position.set(-0.47']),
    },
    {
      id: 'm6_handle_floating',
      note: 'the goal, but the handle floats 0.25 away from the body',
      code: sub(goal, ['handle.position.set(0.47', 'handle.position.set(0.72']),
    },
    {
      id: 'm7_no_saucer',
      note: 'the goal without the saucer (the widest part)',
      code: sub(goal, ['saucer.position.y = 0.03;\n  group.add(saucer);', 'saucer.position.y = 0.03;']),
    },
    {
      id: 'm8_half_height',
      note: 'the goal squashed to half its height (handle too)',
      code: sub(goal, ['return group;', 'group.scale.y = 0.5;\n  return group;']),
    },
    {
      id: 'x1_mug_extruded_outline',
      note: 'CHEAT: the front outline (saucer, body, handle) extruded into a slab as deep as the mug',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#2f6db5' });
  const s = new THREE.Shape();
  s.moveTo(-0.8, 0); s.lineTo(0.8, 0); s.lineTo(0.7, 0.06); s.lineTo(0.45, 0.06); s.lineTo(0.5, 1.16); s.lineTo(-0.5, 1.16); s.lineTo(-0.45, 0.06); s.lineTo(-0.7, 0.06); s.lineTo(-0.8, 0);
  const h = new THREE.Shape();
  h.absarc(0.47, 0.62, 0.37, -Math.PI / 2, Math.PI / 2, false);
  h.absarc(0.47, 0.62, 0.23, Math.PI / 2, -Math.PI / 2, true);
  for (const shape of [s, h]) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
    geo.translate(0, 0, -0.5);
    g.add(new THREE.Mesh(geo, blue));
  }
  return g;
}`,
    },
  ],
};
