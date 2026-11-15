/**
 * Graph helpers for the workflow grader: strongly connected components,
 * reachability, longest chain, depth widths and glob overlap. All pure.
 */

/** Adjacency: edges[i] lists the nodes that depend on i (i must finish before them). */
export type Edges = number[][];

/** Strongly connected components (iterative Tarjan). comp[i] is the component index of node i; components come out in reverse topological order. */
export function scc(n: number, edges: Edges): { comp: number[]; members: number[][] } {
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const comp = new Array<number>(n).fill(-1);
  const members: number[][] = [];
  const stack: number[] = [];
  let counter = 0;
  for (let start = 0; start < n; start++) {
    if (index[start] !== -1) continue;
    const work: [number, number][] = [[start, 0]];
    index[start] = low[start] = counter++;
    stack.push(start);
    onStack[start] = true;
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0];
      if (top[1] < edges[v].length) {
        const w = edges[v][top[1]++];
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push([w, 0]);
        } else if (onStack[w]) {
          low[v] = Math.min(low[v], index[w]);
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          low[parent] = Math.min(low[parent], low[v]);
        }
        if (low[v] === index[v]) {
          const group: number[] = [];
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = false;
            comp[w] = members.length;
            group.push(w);
          } while (w !== v);
          group.sort((a, b) => a - b);
          members.push(group);
        }
      }
    }
  }
  return { comp, members };
}

export interface GraphInfo {
  n: number;
  comp: number[];
  members: number[][];
  /** reach(a, b): b can only start after a (a path a -> b exists), or a and b share a cycle. */
  reaches: (a: number, b: number) => boolean;
  /** Neither reaches the other. */
  parallel: (a: number, b: number) => boolean;
  /** Steps on the longest dependency chain (a cycle counts each of its steps once). */
  longestChain: number;
  /** The most steps that sit at the same depth (a lower bound on how many can run at once). */
  maxWidth: number;
  /** Nodes that depend on nothing in the plan and nodes nothing depends on. */
  dependents: number[];
  /** Components that are real cycles (more than one node, or a self-dependency). */
  cycles: number[][];
}

export function analyse(n: number, edges: Edges): GraphInfo {
  const { comp, members } = scc(n, edges);
  const c = members.length;
  // Condensed edges, deduplicated.
  const cEdges: Set<number>[] = Array.from({ length: c }, () => new Set<number>());
  const selfLoop = new Array<boolean>(n).fill(false);
  for (let v = 0; v < n; v++) {
    for (const w of edges[v]) {
      if (v === w) selfLoop[v] = true;
      if (comp[v] !== comp[w]) cEdges[comp[v]].add(comp[w]);
    }
  }
  // Tarjan yields components in reverse topological order: successors have lower indices.
  const words = Math.ceil(c / 32);
  const reach: Uint32Array[] = new Array(c);
  for (let k = 0; k < c; k++) {
    const bits = new Uint32Array(words);
    bits[k >>> 5] |= 1 << (k & 31);
    for (const s of cEdges[k]) {
      const other = reach[s];
      for (let i = 0; i < words; i++) bits[i] |= other[i];
    }
    reach[k] = bits;
  }
  const reaches = (a: number, b: number): boolean => {
    const ca = comp[a];
    const cb = comp[b];
    if (ca === cb) return a !== b || selfLoop[a] || members[ca].length > 1;
    return (reach[ca][cb >>> 5] & (1 << (cb & 31))) !== 0;
  };
  const parallel = (a: number, b: number): boolean => a !== b && !reaches(a, b) && !reaches(b, a);

  // Longest chain and depth, processing components from sources (highest index) down.
  const chainTo = new Array<number>(c).fill(0);
  const depth = new Array<number>(c).fill(0);
  for (let k = c - 1; k >= 0; k--) chainTo[k] = members[k].length;
  // Predecessors first: iterate in topological order (c-1 .. 0) and push forward.
  for (let k = c - 1; k >= 0; k--) {
    for (const s of cEdges[k]) {
      if (chainTo[k] + members[s].length > chainTo[s]) chainTo[s] = chainTo[k] + members[s].length;
      if (depth[k] + 1 > depth[s]) depth[s] = depth[k] + 1;
    }
  }
  let longestChain = 0;
  for (let k = 0; k < c; k++) longestChain = Math.max(longestChain, chainTo[k]);
  const widthAt = new Map<number, number>();
  for (let k = 0; k < c; k++) widthAt.set(depth[k], (widthAt.get(depth[k]) ?? 0) + members[k].length);
  let maxWidth = 0;
  for (const w of widthAt.values()) maxWidth = Math.max(maxWidth, w);

  const dependents = new Array<number>(n).fill(0);
  for (let v = 0; v < n; v++) for (const w of edges[v]) if (w !== v) dependents[v]++;
  const cycles = members.filter((m) => m.length > 1 || selfLoop[m[0]]);
  return { n, comp, members, reaches, parallel, longestChain, maxWidth, dependents, cycles };
}

/** Longest path, counted in nodes, through a DAG given as edges; -1 when there is a cycle. */
export function longestPathNodes(n: number, edges: Edges): number {
  const indeg = new Array<number>(n).fill(0);
  for (let v = 0; v < n; v++) for (const w of edges[v]) indeg[w]++;
  const queue: number[] = [];
  const best = new Array<number>(n).fill(1);
  for (let v = 0; v < n; v++) if (indeg[v] === 0) queue.push(v);
  let seen = 0;
  let longest = n ? 1 : 0;
  while (queue.length) {
    const v = queue.shift()!;
    seen++;
    for (const w of edges[v]) {
      if (best[v] + 1 > best[w]) best[w] = best[v] + 1;
      longest = Math.max(longest, best[w]);
      if (--indeg[w] === 0) queue.push(w);
    }
  }
  return seen === n ? longest : -1;
}

// ---------------------------------------------------------------- globs

const MAX_PATTERN = 400;
const globCache = new Map<string, string[][]>();

/** Expand simple (non-nested) braces: "a.{ts,js}" -> ["a.ts", "a.js"]; at most 32 results. */
function expandBraces(p: string): string[] {
  let out = [p];
  for (let guard = 0; guard < 4; guard++) {
    const next: string[] = [];
    let changed = false;
    for (const s of out) {
      const m = /\{([^{}]*)\}/.exec(s);
      if (!m || !m[1].includes(',')) {
        next.push(s);
        continue;
      }
      changed = true;
      for (const alt of m[1].split(',')) next.push(s.slice(0, m.index) + alt + s.slice(m.index + m[0].length));
    }
    out = next.slice(0, 32);
    if (!changed) break;
  }
  return out;
}

/**
 * A path or glob as segment lists (one per brace alternative). Backslashes
 * become slashes, "./" and trailing slashes go, case is ignored. A path with
 * no wildcard also covers everything under it, so "site" owns "site/a.html".
 */
export function compileGlob(raw: string): string[][] {
  const key = raw.slice(0, MAX_PATTERN);
  const hit = globCache.get(key);
  if (hit) return hit;
  const result: string[][] = [];
  for (const alt of expandBraces(key)) {
    let p = alt.trim().toLowerCase().replace(/\\/g, '/');
    p = p.replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/').replace(/^\//, '');
    const folder = p.endsWith('/');
    p = p.replace(/\/+$/, '');
    if (!p) continue;
    const segs = p.split('/').filter((s) => s !== '.');
    const last = segs[segs.length - 1];
    if (folder || (!/[*?]/.test(p) && last !== '**')) segs.push('**');
    // Collapse repeated "**".
    const clean: string[] = [];
    for (const s of segs) if (!(s === '**' && clean[clean.length - 1] === '**')) clean.push(s);
    result.push(clean);
  }
  if (globCache.size > 5000) globCache.clear();
  globCache.set(key, result);
  return result;
}

/** Can one string match both segment patterns (with * and ?)? */
function segmentsMeet(a: string, b: string): boolean {
  if (a === b) return true;
  if (!/[*?]/.test(a) && !/[*?]/.test(b)) return false;
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const k = i * (b.length + 1) + j;
    const m = memo.get(k);
    if (m !== undefined) return m;
    let r: boolean;
    if (i < a.length && a[i] === '*') r = go(i + 1, j) || (j < b.length && go(i, j + 1));
    else if (j < b.length && b[j] === '*') r = go(i, j + 1) || (i < a.length && go(i + 1, j));
    else if (i === a.length || j === b.length) r = i === a.length && j === b.length;
    else r = (a[i] === '?' || b[j] === '?' || a[i] === b[j]) && go(i + 1, j + 1);
    memo.set(k, r);
    return r;
  };
  return go(0, 0);
}

function patternsMeet(a: string[], b: string[]): boolean {
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const k = i * (b.length + 1) + j;
    const m = memo.get(k);
    if (m !== undefined) return m;
    let r: boolean;
    if (i < a.length && a[i] === '**') r = go(i + 1, j) || (j < b.length && go(i, j + 1));
    else if (j < b.length && b[j] === '**') r = go(i, j + 1) || (i < a.length && go(i + 1, j));
    else if (i === a.length || j === b.length) r = i === a.length && j === b.length;
    else r = segmentsMeet(a[i], b[j]) && go(i + 1, j + 1);
    memo.set(k, r);
    return r;
  };
  return go(0, 0);
}

/** True when some file path could match both globs: "src/**" overlaps "src/site/a.ts". */
export function globsOverlap(a: string, b: string): boolean {
  for (const pa of compileGlob(a)) for (const pb of compileGlob(b)) if (patternsMeet(pa, pb)) return true;
  return false;
}

/** The first pair (x from as, y from bs) that overlaps, or null. */
export function firstOverlap(as: string[], bs: string[]): [string, string] | null {
  for (const x of as) for (const y of bs) if (globsOverlap(x, y)) return [x, y];
  return null;
}
