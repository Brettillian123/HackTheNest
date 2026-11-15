// Scene code for the 3D grader tests: a table, with one thing changed at a time.

export interface TableOptions {
  /** Uniform scale of the whole table. */
  scale?: number;
  /** Stretches the whole table up (1 = no stretch). */
  stretchY?: number;
  /** Moves the whole table along x. */
  shiftX?: number;
  /** How many legs (0 to 4) are built. */
  legs?: number;
  /** Colour of the top, as a hex number literal. */
  topColor?: string;
  /** Radial segments of each leg. */
  segments?: number;
  /** Height segments of each leg (more triangles, same shape). */
  heightSegments?: number;
  /** Builds the top as two halves instead of one box. */
  splitTop?: boolean;
  /** Puts the legs in their own group with its own position. */
  groupLegs?: boolean;
}

export function table(o: TableOptions = {}): string {
  const segs = o.heightSegments ? `${o.segments ?? 16}, ${o.heightSegments}` : `${o.segments ?? 16}`;
  const top = o.splitTop
    ? `for (const x of [-0.3, 0.3]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.8), topMat);
    half.position.set(x, 0.75, 0);
    root.add(half);
  }`
    : `const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), topMat);
  top.position.set(0, 0.75, 0);
  root.add(top);`;
  const legParent = o.groupLegs ? 'legs' : 'root';
  const legY = o.groupLegs ? 0 : 0.355;
  return `function buildScene(THREE) {
  const root = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({ color: ${o.topColor ?? '0x996633'} });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  ${top}
  ${o.groupLegs ? 'const legs = new THREE.Group(); legs.position.y = 0.355; root.add(legs);' : ''}
  const spots = [[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]].slice(0, ${o.legs ?? 4});
  for (const [x, z] of spots) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.71, ${segs}), legMat);
    leg.position.set(x, ${legY}, z);
    ${legParent}.add(leg);
  }
  root.scale.set(${o.scale ?? 1}, ${(o.scale ?? 1) * (o.stretchY ?? 1)}, ${o.scale ?? 1});
  root.position.x = ${o.shiftX ?? 0};
  return root;
}`;
}

/** Something else entirely: a ball on a stick, about the same size. */
export const UNRELATED = `function buildScene(THREE) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshStandardMaterial({ color: 0x22aa44 }));
  ball.position.set(0.3, 0.55, 0.3);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x2222aa }));
  stick.position.set(0.3, 0.2, 0.3);
  g.add(ball, stick);
  return g;
}`;

export const EMPTY = 'function buildScene(THREE) { return new THREE.Group(); }';

/** The default table's shape as ONE merged geometry in one mesh (one colour). */
export const MERGED_TABLE = `function buildScene(THREE) {
  const parts = [];
  const top = new THREE.BoxGeometry(1.2, 0.08, 0.8);
  top.translate(0, 0.75, 0);
  parts.push(top);
  for (const [x, z] of [[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]]) {
    const leg = new THREE.CylinderGeometry(0.04, 0.04, 0.71, 16);
    leg.translate(x, 0.355, z);
    parts.push(leg);
  }
  const arrays = parts.map((g) => g.toNonIndexed().attributes.position.array);
  const all = new Float32Array(arrays.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrays) { all.set(a, o); o += a.length; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(all, 3));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x996633 }));
}`;

export interface ChairOptions {
  /** Turn about the up axis, degrees. */
  turnDeg?: number;
  /** Uniform scale of the whole chair (it stays standing on the same floor spot). */
  scale?: number;
  /** Mirror image (x flipped). */
  mirror?: boolean;
  /** Adds a 10 by 10 floor under the chair. */
  floor?: boolean;
  /** Draws every material as wireframe. */
  wireframe?: boolean;
  /** Builds the chair as an async function (a Promise comes back). */
  async?: boolean;
  /** Moves the back-left leg along x by this much. */
  legShift?: number;
  /** Leaves out the back-left leg. */
  noLeg?: boolean;
}

/** A chair with a back on one side, so a turn and a mirror image can be seen. */
export function chair(o: ChairOptions = {}): string {
  return `${o.async ? 'async ' : ''}function buildScene(THREE) {
  const c = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, wireframe: ${!!o.wireframe} });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, wireframe: ${!!o.wireframe} });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), red);
  seat.position.set(0, 0.96, 0);
  c.add(seat);
  const legs = [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]];
  legs.forEach(([x, z], i) => {
    if (i === 0 && ${!!o.noLeg}) return;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), wood);
    leg.position.set(x + (i === 0 ? ${o.legShift ?? 0} : 0), 0.45, z);
    c.add(leg);
  });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.08), wood);
  back.position.set(-0.05, 1.37, -0.46);
  c.add(back);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.9), wood);
  arm.position.set(0.46, 1.15, 0);
  c.add(arm);
  c.rotation.y = ${((o.turnDeg ?? 0) * Math.PI) / 180};
  c.scale.set(${(o.mirror ? -1 : 1) * (o.scale ?? 1)}, ${o.scale ?? 1}, ${o.scale ?? 1});
  const root = new THREE.Group();
  root.add(c);
  ${o.floor ? "const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x999999 })); floor.position.y = -0.01; root.add(floor);" : ''}
  return root;
}`;
}

export interface HouseOptions {
  door?: boolean;
  /** Every colour changed. */
  recolour?: boolean;
}

/** A box house with a flush door on the front (less than a voxel proud) and a roof. */
export function house(o: HouseOptions = {}): string {
  const [wall, door, roof] = o.recolour ? ['0x445566', '0xeeee22', '0x22aa55'] : ['0xf5e6c8', '0x6b3e26', '0x8e2c1d'];
  return `function buildScene(THREE) {
  const h = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2), new THREE.MeshStandardMaterial({ color: ${wall} }));
  walls.position.y = 0.8;
  h.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 4), new THREE.MeshStandardMaterial({ color: ${roof} }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.05;
  h.add(roof);
  ${o.door === false ? '' : `const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.02), new THREE.MeshStandardMaterial({ color: ${door} }));
  door.position.set(0.4, 0.45, 1.01);
  h.add(door);`}
  return h;
}`;
}

/** A unit cube three ways: one box, six thin slabs (hollow), six planes. */
export const CUBE = `function buildScene(THREE) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
  m.position.y = 0.5;
  return m;
}`;
export const HOLLOW_CUBE = `function buildScene(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71 });
  const slab = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
  slab(1, 0.05, 1, 0, 0.975, 0); slab(1, 0.05, 1, 0, 0.025, 0);
  slab(1, 0.9, 0.05, 0, 0.5, 0.475); slab(1, 0.9, 0.05, 0, 0.5, -0.475);
  slab(0.05, 0.9, 0.9, 0.475, 0.5, 0); slab(0.05, 0.9, 0.9, -0.475, 0.5, 0);
  return g;
}`;
export const PLANES_CUBE = `function buildScene(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, side: THREE.DoubleSide });
  const faces = [[0, 1, 0.5, -Math.PI / 2, 0], [0, 0, 0.5, Math.PI / 2, 0], [0, 0.5, 1, 0, 0], [0, 0.5, 0, 0, Math.PI], [0.5, 0.5, 0.5, 0, Math.PI / 2], [-0.5, 0.5, 0.5, 0, -Math.PI / 2]];
  for (const [x, y, z, rx, ry] of faces) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    p.position.set(x, y, z - 0.5);
    p.rotation.set(rx, ry, 0);
    g.add(p);
  }
  return g;
}`;
