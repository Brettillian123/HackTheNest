import { sub, type GoalSet } from './lib';

/** Curved, with thin arms and many small parts (eyes, buttons). 13 named meshes. */
export const snowmanGoal = `function buildScene(THREE) {
  const snowman = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f6f8' });
  const coal = new THREE.MeshStandardMaterial({ color: '#1b1b1b' });
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4423' });
  function part(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    snowman.add(mesh);
    return mesh;
  }
  part('base', new THREE.SphereGeometry(0.6, 32, 16), snow, 0, 0.6, 0);
  part('middle', new THREE.SphereGeometry(0.42, 32, 16), snow, 0, 1.45, 0);
  part('head', new THREE.SphereGeometry(0.3, 32, 16), snow, 0, 2.05, 0);
  part('brim', new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32), coal, 0, 2.3, 0);
  part('crown', new THREE.CylinderGeometry(0.22, 0.22, 0.35, 32), coal, 0, 2.495, 0);
  const nose = part('nose', new THREE.ConeGeometry(0.05, 0.25, 16), new THREE.MeshStandardMaterial({ color: '#f77f00' }), 0, 2.05, 0.4);
  nose.rotation.x = Math.PI / 2;
  const armL = part('armL', new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), wood, -0.75, 1.65, 0);
  armL.rotation.z = Math.PI / 3;
  const armR = part('armR', new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), wood, 0.75, 1.65, 0);
  armR.rotation.z = -Math.PI / 3;
  part('button1', new THREE.SphereGeometry(0.04, 12, 8), coal, 0, 1.62, 0.39);
  part('button2', new THREE.SphereGeometry(0.04, 12, 8), coal, 0, 1.45, 0.42);
  part('button3', new THREE.SphereGeometry(0.04, 12, 8), coal, 0, 1.28, 0.39);
  part('eyeL', new THREE.SphereGeometry(0.035, 12, 8), coal, -0.1, 2.13, 0.27);
  part('eyeR', new THREE.SphereGeometry(0.035, 12, 8), coal, 0.1, 2.13, 0.27);
  return snowman;
}`;
const goal = snowmanGoal;

export const snowman: GoalSet = {
  id: 'snowman',
  goal,
  attempts: [
    {
      id: 's1_excellent',
      note: 'fresh rebuild: loops, hat as a group, radii within 0.01, all small parts present',
      code: `function buildScene(THREE) {
  const root = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f7fa });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515 });
  const stick = new THREE.MeshStandardMaterial({ color: 0x70482a });
  const balls = [[0.61, 0.61], [0.41, 1.46], [0.3, 2.06]];
  balls.forEach(([r, y], i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), white); b.position.y = y; b.name = ['bottom', 'torso', 'head'][i]; root.add(b); });
  const hat = new THREE.Group(); hat.name = 'hat'; hat.position.y = 2.3; root.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24), black); brim.name = 'brim'; hat.add(brim);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.34, 24), black); top.name = 'hatTop'; top.position.y = 0.19; hat.add(top);
  const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0xff8000 })); carrot.name = 'nose'; carrot.rotation.x = Math.PI / 2; carrot.position.set(0, 2.06, 0.41); root.add(carrot);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 6), stick); arm.name = s < 0 ? 'leftArm' : 'rightArm';
    arm.position.set(0.74 * s, 1.66, 0); arm.rotation.z = -s * Math.PI / 3; root.add(arm);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), black); eye.name = 'eye'; eye.position.set(0.1 * s, 2.14, 0.27); root.add(eye);
  }
  [1.62, 1.46, 1.3].forEach((y, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), black); b.name = 'button' + i; b.position.set(0, y, y === 1.46 ? 0.41 : 0.385); root.add(b); });
  return root;
}`,
    },
    {
      id: 's2_good_slips',
      note: 'fresh rebuild with slips: arms short (0.6), head sits 0.15 high with a small gap, nose red, two buttons',
      code: `function buildScene(THREE) {
  const s = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f6f8' });
  const coal = new THREE.MeshStandardMaterial({ color: '#1b1b1b' });
  const brown = new THREE.MeshStandardMaterial({ color: '#6b4423' });
  const mk = (name, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); s.add(m); return m; };
  mk('base', new THREE.SphereGeometry(0.6, 24, 16), snow, 0, 0.6, 0);
  mk('middle', new THREE.SphereGeometry(0.42, 24, 16), snow, 0, 1.45, 0);
  mk('head', new THREE.SphereGeometry(0.3, 24, 16), snow, 0, 2.2, 0);
  mk('brim', new THREE.CylinderGeometry(0.34, 0.34, 0.04, 24), coal, 0, 2.45, 0);
  mk('crown', new THREE.CylinderGeometry(0.22, 0.22, 0.35, 24), coal, 0, 2.645, 0);
  mk('nose', new THREE.ConeGeometry(0.05, 0.25, 12), new THREE.MeshStandardMaterial({ color: '#e63946' }), 0, 2.2, 0.4).rotation.x = Math.PI / 2;
  mk('armL', new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), brown, -0.66, 1.6, 0).rotation.z = Math.PI / 3;
  mk('armR', new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), brown, 0.66, 1.6, 0).rotation.z = -Math.PI / 3;
  mk('button1', new THREE.SphereGeometry(0.04, 10, 8), coal, 0, 1.58, 0.4);
  mk('button2', new THREE.SphereGeometry(0.04, 10, 8), coal, 0, 1.36, 0.41);
  mk('eyeL', new THREE.SphereGeometry(0.035, 10, 8), coal, -0.1, 2.28, 0.27);
  mk('eyeR', new THREE.SphereGeometry(0.035, 10, 8), coal, 0.1, 2.28, 0.27);
  return s;
}`,
    },
    {
      id: 's3_mediocre',
      note: 'fresh rebuild, clumsy: three nearly equal balls, oversized hat, arms straight out, no eyes',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const black = new THREE.MeshStandardMaterial({ color: '#000000' });
  [[0.5, 0.5], [0.45, 1.35], [0.4, 2.1]].forEach(([r, y]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), white); b.position.y = y; g.add(b); });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 20), black); brim.position.y = 2.45; g.add(brim);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 20), black); top.position.y = 2.73; g.add(top);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#f77f00' })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.1, 0.5); g.add(nose);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#6b4423' })); arm.rotation.z = Math.PI / 2; arm.position.set(s * 0.7, 1.4, 0); g.add(arm); }
  for (const y of [1.5, 1.35, 1.2]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), black); b.position.set(0, y, 0.44); g.add(b); }
  return g;
}`,
    },
    {
      id: 's4_poor',
      note: 'right idea, few parts: three white balls and a carrot nose; no hat, arms, eyes or buttons',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const w = new THREE.MeshStandardMaterial({ color: '#f4f6f8' });
  for (const [r, y] of [[0.6, 0.6], [0.42, 1.45], [0.3, 2.05]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), w); b.position.y = y; g.add(b); }
  const n = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 8), new THREE.MeshStandardMaterial({ color: '#f77f00' }));
  n.rotation.x = Math.PI / 2; n.position.set(0, 2.05, 0.4); g.add(n);
  return g;
}`,
    },
    {
      id: 's5_hat_beside',
      note: 'the goal, but the hat floats beside the head instead of on it',
      code: sub(goal, ['coal, 0, 2.3, 0)', 'coal, 0.65, 2.3, 0)'], ['coal, 0, 2.495, 0)', 'coal, 0.65, 2.495, 0)']),
    },
    {
      id: 's6_arms_raised',
      note: 'the goal posed differently: both arms raised nearly straight up',
      code: sub(
        goal,
        ['wood, -0.75, 1.65, 0)', 'wood, -0.5, 1.84, 0)'],
        ['wood, 0.75, 1.65, 0)', 'wood, 0.5, 1.84, 0)'],
        ['armL.rotation.z = Math.PI / 3;', 'armL.rotation.z = Math.PI / 12;'],
        ['armR.rotation.z = -Math.PI / 3;', 'armR.rotation.z = -Math.PI / 12;'],
      ),
    },
    {
      id: 's7_sunk',
      note: 'the goal with the balls sunk deep into each other (middle 0.2 lower, head 0.33 lower), everything on them follows',
      code: sub(
        goal,
        ['snow, 0, 1.45, 0)', 'snow, 0, 1.25, 0)'],
        ['snow, 0, 2.05, 0)', 'snow, 0, 1.72, 0)'],
        ['coal, 0, 2.3, 0)', 'coal, 0, 1.97, 0)'],
        ['coal, 0, 2.495, 0)', 'coal, 0, 2.165, 0)'],
        ['0, 2.05, 0.4)', '0, 1.72, 0.4)'],
        ['2.13, 0.27)', '1.80, 0.27)'],
        ['0, 1.62, 0.39)', '0, 1.42, 0.39)'],
        ['0, 1.45, 0.42)', '0, 1.25, 0.42)'],
        ['0, 1.28, 0.39)', '0, 1.08, 0.39)'],
        ['1.65, 0)', '1.45, 0)'],
      ),
    },
    {
      id: 's8_floating',
      note: 'the goal with the balls floating apart (gaps of about 0.15), everything on them follows',
      code: sub(
        goal,
        ['snow, 0, 1.45, 0)', 'snow, 0, 1.75, 0)'],
        ['snow, 0, 2.05, 0)', 'snow, 0, 2.65, 0)'],
        ['coal, 0, 2.3, 0)', 'coal, 0, 2.9, 0)'],
        ['coal, 0, 2.495, 0)', 'coal, 0, 3.095, 0)'],
        ['0, 2.05, 0.4)', '0, 2.65, 0.4)'],
        ['2.13, 0.27)', '2.73, 0.27)'],
        ['0, 1.62, 0.39)', '0, 1.92, 0.39)'],
        ['0, 1.45, 0.42)', '0, 1.75, 0.42)'],
        ['0, 1.28, 0.39)', '0, 1.58, 0.39)'],
        ['1.65, 0)', '1.95, 0)'],
      ),
    },
    {
      id: 'x4_snowman_block',
      note: 'CHEAT: one white box the size of the snowman\'s bounding box',
      code: `function buildScene(THREE) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.24, 2.67, 1.2), new THREE.MeshStandardMaterial({ color: '#f4f6f8' }));
  m.position.y = 1.335;
  return m;
}`,
    },
    {
      id: 'x5_snowman_cutout',
      note: 'CHEAT: two crossed flat cut-outs (discs and hat rectangles) plus a flat strip for arms',
      code: `function buildScene(THREE) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f4f6f8', side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: '#1b1b1b', side: THREE.DoubleSide });
  for (const turn of [0, Math.PI / 2]) {
    const card = new THREE.Group(); card.rotation.y = turn; g.add(card);
    for (const [r, y] of [[0.6, 0.6], [0.42, 1.45], [0.3, 2.05]]) { const c = new THREE.Mesh(new THREE.CircleGeometry(r, 32), white); c.position.y = y; card.add(c); }
    const brim = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.04), black); brim.position.set(0, 2.3, 0.001); card.add(brim);
    const crown = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.35), black); crown.position.set(0, 2.495, 0.001); card.add(crown);
  }
  const arms = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.05), new THREE.MeshStandardMaterial({ color: '#6b4423', side: THREE.DoubleSide }));
  arms.position.set(0, 1.65, 0.002); g.add(arms);
  return g;
}`,
    },
  ],
};
