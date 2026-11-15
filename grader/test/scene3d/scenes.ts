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
