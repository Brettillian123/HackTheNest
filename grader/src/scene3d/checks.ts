/**
 * The exact-measurements report: one check per thing measured, with the figure a
 * person can read, a zone (vicinity / close / off) and the points of the total it
 * cost.
 *
 * Points: the total is a product of curves, so a difference's cost depends on the
 * others. Each difference d gets s_d = (gain from fixing d alone + loss from
 * un-fixing d when everything else is fixed) / 2, from the combination itself
 * (model.ts); the s_d are then scaled so that together they are exactly what was
 * lost: 100 - (total - bonus). Rounded to cents by largest remainder, so the
 * printed points add up too.
 */

import { SCENE_CHECKS } from './config';
import { combineScene, type SceneCombination, type SceneMeasurements } from './model';

export type CheckCriterion =
  | 'parts' | 'proportions' | 'placement' | 'facing' | 'colour' | 'surface'
  | 'triangles' | 'meshes' | 'codeSize' | 'reuse' | 'cleanGeometry' | 'structure';

export interface SceneCheck {
  criterion: CheckCriterion;
  /** The part's name from the reference ("the left arm"), or "the model". */
  component: string;
  what: 'position' | 'size' | 'shape' | 'turn' | 'colour' | 'count' | 'missing' | 'extra' | 'weight' | 'structure';
  /** The exact figure. */
  measured: string;
  zone: 'vicinity' | 'close' | 'off';
  /** Points of the total this cost, two decimals. */
  points: number;
  /** One sentence with the figure and the verdict. */
  text: string;
}

interface Item {
  criterion: CheckCriterion;
  component: string;
  what: SceneCheck['what'];
  measured: string;
  /** The sentence before the verdict ("The left arm is 1.02 times the reference's length"). */
  lead: string;
  /** The curve's credit for this measurement, 1 = exact. */
  credit: number;
  fix: (m: SceneMeasurements) => void;
}

export function zoneOf(credit: number): SceneCheck['zone'] {
  return credit >= SCENE_CHECKS.vicinity ? 'vicinity' : credit >= SCENE_CHECKS.close ? 'close' : 'off';
}

// ---------------------------------------------------------------- words

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** A share as a percentage; one decimal where rounding would hide a difference ("99.6%", not "100%"). */
const pctOf = (f: number) => {
  const p = f * 100;
  if (p > 0 && p < 1) return p < 0.1 ? 'under 0.1%' : `${p.toFixed(1)}%`;
  if (p < 100 && Math.round(p) >= 100) return p >= 99.95 ? 'over 99.9%' : `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
};
const degWords = (d: number) => (d < 0.95 ? `${d < 0.05 ? 'under 0.1' : d.toFixed(1)} degrees` : `${Math.round(d)} degrees`);
/** A ratio: "1.02", "2.4", "25". */
function ratioWords(r: number): string {
  if (r >= 10) return `${Math.round(r)}`;
  if (r >= 2) return `${Math.round(r * 10) / 10}`;
  const two = r.toFixed(2);
  if (two !== '1.00' || Math.abs(r - 1) <= 1e-9) return two;
  return r.toFixed(3) !== '1.000' ? r.toFixed(3) : r.toFixed(4) !== '1.0000' ? r.toFixed(4) : r > 1 ? 'just over 1' : 'just under 1';
}
function unitsWords(d: number): string {
  return d < 0.01 ? d.toFixed(3) : d.toFixed(2);
}
const num = (n: number) => Math.round(n).toLocaleString('en-US');
/** A share of the model's size: "4% of the model's size", "1.3 times the model's size". */
const shareWords = (s: number) => (s <= 1 ? `${pctOf(s)} of the model's size` : `${ratioWords(s)} times the model's size`);

function directionWords(d: [number, number, number]): string {
  const big = Math.max(...d.map(Math.abs));
  if (!(big > 0)) return '';
  const dirs: [string, string][] = [['to the right', 'to the left'], ['higher', 'lower'], ['forward', 'back']];
  const parts = [0, 1, 2].filter((a) => Math.abs(d[a]) >= 0.5 * big).map((a) => (d[a] > 0 ? dirs[a][0] : dirs[a][1]));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A colour family a person would name, and its hue. */
function colourWords(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  if (sat < 0.12 || d < 0.06) return l > 0.85 ? 'white' : l < 0.12 ? 'black' : l > 0.6 ? 'light grey' : l < 0.3 ? 'dark grey' : 'grey';
  const names: [number, string][] = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [160, 'green'], [195, 'teal'], [250, 'blue'], [290, 'purple'], [335, 'pink'], [360, 'red']];
  let name = names.find(([upTo]) => h < upTo)![1];
  if (name === 'orange' && l < 0.4) name = 'brown';
  return `${name} (hue ${Math.round(h)})`;
}

const SIDE = ['length', 'width', 'thickness'];

// ---------------------------------------------------------------- what was measured

function itemsOf(m: SceneMeasurements, c: SceneCombination, v: Record<string, number>): Item[] {
  const items: Item[] = [];
  const longest = m.longest && m.longest > 0 ? m.longest : 1;

  m.parts.forEach((p, i) => {
    const name = capital(p.label);
    const f = c.factors[i];
    if (!f) {
      if (p.inPlace < 1 - 1e-9) {
        const gone = p.inPlace < 0.5;
        items.push({
          criterion: 'parts', component: p.label, what: 'missing',
          measured: gone ? 'missing' : `${pctOf(p.inPlace)} of it in its place`,
          lead: gone ? `${name} is missing` : `Only ${pctOf(p.inPlace)} of ${p.label} is in its place`,
          credit: p.inPlace, fix: (x) => { x.parts[i].inPlace = 1; },
        });
      }
    } else {
      if (p.move > 1e-9) {
        const d = p.delta;
        const dist = d ? Math.hypot(...d) : p.move * longest;
        const dir = d ? directionWords(d) : '';
        const measured = `${unitsWords(dist)} units${dir ? ` ${dir}` : ' off'} (${shareWords(p.move)})`;
        items.push({ criterion: 'placement', component: p.label, what: 'position', measured, lead: `${name} sits ${measured} of where the reference has it`, credit: f.place, fix: (x) => { x.parts[i].move = 0; } });
      }
      if (p.sizeErr > 1e-9) {
        const side = SIDE[p.sizeAxis ?? 0] ?? 'size';
        const measured = `${ratioWords(p.sizeRatio)} times the reference's ${side}`;
        items.push({ criterion: 'proportions', component: p.label, what: 'size', measured, lead: `${name} is ${measured}`, credit: f.size, fix: (x) => { x.parts[i].sizeErr = 0; } });
      }
      if (p.shape < 1 - 1e-9) {
        const measured = `outline ${pctOf(p.shape)} like the reference's`;
        items.push({ criterion: 'proportions', component: p.label, what: 'shape', measured, lead: `${name}'s outline agrees ${pctOf(p.shape)} with the reference's`, credit: f.shape, fix: (x) => { x.parts[i].shape = 1; } });
      }
      if (p.turnDeg * p.turnSeen > 1e-6) {
        const measured = `turned ${degWords(p.turnDeg)}`;
        items.push({ criterion: 'facing', component: p.label, what: 'turn', measured, lead: `${name} is turned ${degWords(p.turnDeg)} from the reference's angle`, credit: f.turn, fix: (x) => { x.parts[i].turnDeg = 0; } });
      }
    }
    const agree = c.colourAgree[i];
    if (agree !== null && p.colourDiff !== null && p.colourDiff > 1e-9 && p.colourWeight > 0) {
      const diff = `colour difference ${p.colourDiff.toFixed(1)}`;
      const measured = p.colours ? `${colourWords(p.colours[0])} where the reference is ${colourWords(p.colours[1])}, ${diff}` : diff;
      items.push({ criterion: 'colour', component: p.label, what: 'colour', measured, lead: p.colours ? `${name} is ${measured}` : `${name} has a ${diff} from the reference`, credit: agree, fix: (x) => { x.parts[i].colourDiff = 0; } });
    }
  });

  m.extras.forEach((e, k) => {
    if (!(e.extra > 1e-9)) return;
    const measured = `an extra piece ${shareWords(e.size / longest)} across`;
    items.push({ criterion: 'parts', component: 'the model', what: 'extra', measured, lead: `There is ${measured} that the reference does not have`, credit: 1 - e.extra, fix: (x) => { x.extras[k].extra = 0; } });
  });

  const wh = m.whole;
  if (Math.abs(Math.log(wh.scaleRatio)) > 1e-9) {
    const measured = `${ratioWords(wh.scaleRatio)} times the reference's size`;
    items.push({ criterion: 'placement', component: 'the model', what: 'size', measured, lead: `The whole model is ${measured}`, credit: 1 - c.charges.size / v['place.size'], fix: (x) => { x.whole.scaleRatio = 1; } });
  }
  if (wh.offset > 1e-9) {
    const measured = `${unitsWords(wh.offset * longest)} units (${shareWords(wh.offset)}) from where the reference stands`;
    items.push({ criterion: 'placement', component: 'the model', what: 'position', measured, lead: `The whole model stands ${measured}`, credit: 1 - c.charges.position / v['place.position'], fix: (x) => { x.whole.offset = 0; } });
  }
  if (wh.turnDeg > 1e-6) {
    const measured = `turned ${degWords(wh.turnDeg)}`;
    items.push({ criterion: 'facing', component: 'the model', what: 'turn', measured, lead: `The whole model is turned ${degWords(wh.turnDeg)} from the reference's facing`, credit: 1 - c.charges.turn / v['place.turn'], fix: (x) => { x.whole.turnDeg = 0; } });
  }
  if (wh.mirror) {
    items.push({ criterion: 'facing', component: 'the model', what: 'turn', measured: 'a mirror image (left and right swapped)', lead: 'The whole model is a mirror image of the reference, left and right swapped', credit: 0, fix: (x) => { x.whole.mirror = false; } });
  }
  if (m.shapeMatch < 1 - 1e-9) {
    items.push({ criterion: 'proportions', component: 'the model', what: 'shape', measured: `${pctOf(m.shapeMatch)} agreement with the reference's solid`, lead: `The model's overall solid agrees ${pctOf(m.shapeMatch)} with the reference's`, credit: c.shapeCredit, fix: (x) => { x.shapeMatch = 1; } });
  }
  const VIEW = ['three-quarter front view', 'front view', 'top view', 'three-quarter back view'];
  m.viewParts.forEach((vp, k) => {
    if (vp.shading >= 1 - 1e-9 && vp.outline >= 1 - 1e-9 && vp.edges >= 1 - 1e-9) return;
    const label = VIEW[k] ?? `view ${k + 1}`;
    const measured = `shading ${pctOf(vp.shading)} alike, outline ${pctOf(vp.outline)} overlapping, hard edges ${pctOf(vp.edges)} alike`;
    items.push({ criterion: 'surface', component: `the ${label}`, what: 'shape', measured, lead: `In the ${label}, ${measured}`, credit: c.viewScores[k], fix: (x) => { x.viewParts[k] = { shading: 1, outline: 1, edges: 1 }; } });
  });
  if (m.wire > 1e-9) {
    items.push({ criterion: 'surface', component: 'the model', what: 'shape', measured: `${pctOf(m.wire)} drawn as wireframe`, lead: `${capital(pctOf(m.wire))} of the model is drawn as wireframe, which shows only edges`, credit: 1 - m.wire, fix: (x) => { x.wire = 0; } });
  }

  const countItem = (criterion: CheckCriterion, key: 'triangles' | 'meshes' | 'sourceBytes', noun: string, what: SceneCheck['what']) => {
    const [cv, gv] = m.counts[key];
    if (cv <= gv) return; // as light as the reference or lighter: nothing to charge
    const r = cv / Math.max(1, gv);
    const measured = `${ratioWords(r)} times the reference's ${noun} (${num(cv)} against ${num(gv)})`;
    items.push({ criterion, component: 'the model', what, measured, lead: `Uses ${measured}`, credit: c.counts[key].credit, fix: (x) => { x.counts[key] = [gv, gv]; } });
  };
  countItem('triangles', 'triangles', 'triangles', 'weight');
  countItem('meshes', 'meshes', 'meshes', 'count');
  countItem('codeSize', 'sourceBytes', 'code size', 'weight');

  if (m.reuse && c.reuse.value !== null && c.reuse.value < 1 - 1e-9) {
    const r = m.reuse;
    const measured = `${r.geometries[0]} geometries and ${r.materials[0]} materials for ${r.objects[0]} objects, where the reference uses ${r.geometries[1]} and ${r.materials[1]} for ${r.objects[1]}`;
    items.push({ criterion: 'reuse', component: 'the model', what: 'structure', measured, lead: `Builds ${measured}`, credit: c.reuse.credit, fix: (x) => { x.reuse = null; } });
  }
  if (c.clean.value !== null && c.clean.value < 1 - 1e-9) {
    const cl = m.clean;
    const bits: string[] = [];
    if (cl.duplicate[0] > cl.duplicate[1]) bits.push(`${pctOf(cl.duplicate[0])} built twice`);
    if (cl.buried[0] > cl.buried[1]) bits.push(`${pctOf(cl.buried[0])} hidden inside the model`);
    if (cl.flipped[0] > cl.flipped[1]) bits.push(`${pctOf(cl.flipped[0])} inside out`);
    if (cl.degenerate[0] > cl.degenerate[1]) bits.push(`${pctOf(cl.degenerate[0])} with no area`);
    const measured = `of the triangles, ${bits.join(', ') || 'some faulty'}`;
    items.push({ criterion: 'cleanGeometry', component: 'the model', what: 'structure', measured, lead: `Of its triangles, ${bits.join(', ') || 'some are faulty'}`, credit: c.clean.credit, fix: (x) => { x.clean = { duplicate: [cl.duplicate[1], cl.duplicate[1]], degenerate: [cl.degenerate[1], cl.degenerate[1]], flipped: [cl.flipped[1], cl.flipped[1]], buried: [cl.buried[1], cl.buried[1]] }; } });
  }
  if (m.structure && c.structure.value !== null && c.structure.value < 1 - 1e-9) {
    const s = m.structure;
    const measured = `${pctOf(s.named[0])} of meshes named and ${s.groups[0]} groups, where the reference names ${pctOf(s.named[1])} and has ${s.groups[1]} groups`;
    items.push({ criterion: 'structure', component: 'the model', what: 'structure', measured, lead: `Has ${measured}`, credit: c.structure.credit, fix: (x) => { x.structure = null; } });
  }
  return items;
}

// ---------------------------------------------------------------- the points

const clone = (m: SceneMeasurements): SceneMeasurements => structuredClone(m);

/** What is charged by the curves: the total before the bonus. */
const charged = (m: SceneMeasurements, v: Record<string, number>, gentle?: number) => {
  const c = combineScene(m, v, gentle);
  return c.base * c.placement;
};

export interface ChecksResult {
  /** Every check, costliest first (not trimmed). */
  all: SceneCheck[];
  /** At most maxChecks: every one with points above minPoints, then the nearest misses. */
  shown: SceneCheck[];
  /** Points per criterion: the sum of its checks. */
  byCriterion: Record<string, number>;
}

export function buildChecks(m: SceneMeasurements, v: Record<string, number>, gentle?: number): ChecksResult {
  const byCriterion: Record<string, number> = {};
  if (m.failed) {
    const check: SceneCheck = { criterion: 'parts', component: 'the model', what: 'missing', measured: 'could not be built', zone: 'off', points: 100, text: 'The model could not be built or graded: 100.00 points lost.' };
    byCriterion.parts = 100;
    return { all: [check], shown: [check], byCriterion };
  }
  const comb = combineScene(m, v, gentle);
  const items = itemsOf(m, comb, v);
  const q0 = comb.base * comb.placement;
  const lost = Math.max(0, 100 - q0);

  // Everything fixed but one, and each one alone.
  const allFixed = clone(m);
  for (const it of items) it.fix(allFixed);
  const qAll = charged(allFixed, v, gentle);
  const raw = items.map((it) => {
    const alone = clone(m);
    it.fix(alone);
    const gain = charged(alone, v, gentle) - q0;
    const others = clone(m);
    for (const o of items) if (o !== it) o.fix(others);
    const back = qAll - charged(others, v, gentle);
    return Math.max(0, (Math.max(0, gain) + Math.max(0, back)) / 2);
  });
  const sum = raw.reduce((s, x) => s + x, 0);
  const exact = sum > 0 ? raw.map((x) => (x * lost) / sum) : raw.map(() => (items.length ? lost / items.length : 0));

  // Cents by largest remainder, so the printed points add up to what was lost.
  const target = Math.round(lost * 100);
  const cents = exact.map((x) => Math.floor(x * 100 + 1e-9));
  let rest = target - cents.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x * 100 - cents[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) cents[order[k].i]++;

  const verdict = { vicinity: 'very close', close: 'close', off: 'far from the reference' } as const;
  const all: SceneCheck[] = items.map((it, i) => {
    const points = cents[i] / 100;
    const zone = zoneOf(it.credit);
    const cost = points > 0 ? `${points.toFixed(2)} points lost` : 'less than 0.01 points lost';
    return { criterion: it.criterion, component: it.component, what: it.what, measured: it.measured, zone, points, text: `${it.lead}: ${verdict[zone]}, ${cost}.` };
  });
  // Costliest first; among equal points, the one further off first.
  const credit = new Map(all.map((c, i) => [c, items[i].credit]));
  all.sort((a, b) => b.points - a.points || credit.get(a)! - credit.get(b)!);
  for (const c of all) byCriterion[c.criterion] = Math.round(((byCriterion[c.criterion] ?? 0) + c.points) * 100) / 100;

  const costly = all.filter((c) => c.points > SCENE_CHECKS.minPoints);
  const near = all.filter((c) => c.points <= SCENE_CHECKS.minPoints);
  const shown = [...costly, ...near].slice(0, SCENE_CHECKS.maxChecks);
  return { all, shown, byCriterion };
}

/** A check as a criterion note: "Proportions: the left arm is 1.02 times ...". */
export function noteOf(prefix: string, check: SceneCheck): string {
  return `${prefix}: ${lowerFirst(check.text)}`;
}
