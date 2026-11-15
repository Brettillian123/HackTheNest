/**
 * One benchmark for the whole grader: grades every banded attempt listed in
 * calibration/bench.json and prints one table. See calibration/BENCH.md.
 *
 *   npm run bench -- [--domain pages|sites|scenes] [--set <name>] [--json <file>]
 *                    [--csv <file>] [--compare <file>] [--quiet]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSite } from './calibrate-sites';
import { Grader, SceneGrader, type SiteFiles } from './index';

type Domain = 'pages' | 'sites' | 'scenes';
type Split = 'train' | 'heldout';
type Layout =
  | { kind: 'files'; goal: string | string[]; attempt: string | string[] }
  | { kind: 'module'; module: string; export?: string };
interface SetSpec {
  name: string;
  domain: Domain;
  split: Split;
  bands: string;
  layout: Layout;
  /** Extra order pairs [higher, lower] (full keys) for sets whose bands file has none. */
  order?: [string, string][];
}
interface Entry { key: string; group: string; attempt: string; band: [number, number] }
type Verdict = 'ok' | 'harsh' | 'lenient' | 'error';
interface Rec {
  set: string; domain: Domain; split: Split; key: string;
  band: [number, number]; score: number | null; dist: number; verdict: Verdict;
  error?: string; ms: number; result?: unknown;
}
interface OrderRec { set: string; domain: Domain; split: Split; higher: string; lower: string; held: boolean | null }
interface SelfRec { set: string; group: string; score: number | null; error?: string }
interface Stats { n: number; inside: number; pct: number; mean: number; harsh: number; lenient: number; errors: number; orderHeld: number; orderTotal: number }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const abs = (p: string) => resolve(ROOT, p);
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const quiet = args.includes('--quiet');
const onlyDomain = opt('--domain');
const onlySet = opt('--set');
const say = (s = '') => { if (!quiet) console.log(s); };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- bands ----------
const isBand = (b: unknown): b is [number, number] => Array.isArray(b) && typeof b[0] === 'number' && typeof b[1] === 'number';

/** Reads either bands shape: nested {group: {attempt: {band}}} or flat {attempts|bands: {"group/attempt": [lo, hi, why] | {band}}}. */
function parseBands(file: string): { entries: Entry[]; skipped: string[]; order: [string, string][] } {
  const j = JSON.parse(readFileSync(abs(file), 'utf8')) as Record<string, any>;
  const entries: Entry[] = [];
  const skipped: string[] = [];
  const add = (key: string, v: any) => {
    const band = Array.isArray(v) ? v.slice(0, 2) : v?.band;
    const [group, ...rest] = key.split('/');
    if (isBand(band)) entries.push({ key, group, attempt: rest.join('/'), band: [band[0], band[1]] });
    else skipped.push(key);
  };
  const flat = ['attempts', 'bands'].map((k) => j[k]).find((v) => v && typeof v === 'object' && !Array.isArray(v));
  if (flat) for (const [k, v] of Object.entries(flat)) add(k, v);
  else
    for (const [group, inner] of Object.entries(j)) {
      if (group.startsWith('_') || group === 'order' || !inner || typeof inner !== 'object') continue;
      for (const [a, v] of Object.entries(inner as object)) add(`${group}/${a}`, v);
    }
  let order: [string, string][] = [];
  if (Array.isArray(j.order)) order = j.order;
  else if (j.order && typeof j.order === 'object')
    for (const [g, pairs] of Object.entries(j.order as Record<string, [string, string][]>)) order.push(...pairs.map(([a, b]) => [`${g}/${a}`, `${g}/${b}`] as [string, string]));
  return { entries, skipped, order };
}

// ---------- inputs ----------
function pick(tpl: string | string[], group: string, attempt = ''): string {
  const list = (Array.isArray(tpl) ? tpl : [tpl]).map((t) => abs(t.replaceAll('{group}', group).replaceAll('{attempt}', attempt)));
  return list.find((p) => existsSync(p)) ?? list[0];
}

function loadSite(dir: string): SiteFiles {
  const files = readSite(dir);
  if (files['__extra.json'] !== undefined) {
    const extra = JSON.parse(files['__extra.json']) as Record<string, string>;
    delete files['__extra.json'];
    Object.assign(files, extra);
  }
  return files;
}

interface Source { goal(group: string): unknown; attempt(e: Entry): unknown }

async function source(spec: SetSpec): Promise<Source> {
  const L = spec.layout;
  if (L.kind === 'module') {
    const mod = await import(pathToFileURL(abs(L.module)).href);
    const sets = mod[L.export ?? 'SETS'] as { id: string; goal: string; attempts: { id: string; code: string }[] }[];
    const by = new Map(sets.map((s) => [s.id, s]));
    return {
      goal: (g) => { const s = by.get(g); if (!s) throw new Error(`no group ${g} in ${L.module}`); return s.goal; },
      attempt: (e) => { const a = by.get(e.group)?.attempts.find((x) => x.id === e.attempt); if (!a) throw new Error(`no attempt ${e.key} in ${L.module}`); return a.code; },
    };
  }
  const read = (p: string) => (spec.domain === 'sites' ? loadSite(p) : readFileSync(p, 'utf8'));
  return { goal: (g) => read(pick(L.goal, g)), attempt: (e) => read(pick(L.attempt, e.group, e.attempt)) };
}

// ---------- graders ----------
let pageGrader: Grader | null = null;
let sceneGrader: SceneGrader | null = null;
const pg = () => (pageGrader ??= new Grader());
const sg = () => (sceneGrader ??= new SceneGrader());

async function prepare(domain: Domain, input: unknown): Promise<unknown> {
  if (domain === 'pages') return pg().render(input as string);
  if (domain === 'sites') return pg().prepareSite(input as SiteFiles);
  return sg().prepare(input as string);
}
async function grade(domain: Domain, goal: unknown, input: unknown): Promise<any> {
  if (domain === 'pages') return (await pg().grade(goal as any, input as string)).result;
  if (domain === 'sites') return (await pg().gradeSite(goal as any, input as SiteFiles)).result;
  return (await sg().grade(goal as any, input as string)).result;
}

/** Keeps every measurement the grader returns, unknown fields included; drops images and pixel data. */
function clean(result: unknown): unknown {
  return JSON.parse(
    JSON.stringify(result, (k, v) => {
      if (['png', 'pixels', 'snapshot', 'views'].includes(k)) return undefined;
      if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) return undefined;
      if (ArrayBuffer.isView(v)) return undefined;
      return v;
    }),
  );
}

/** Numeric leaves as dotted columns; arrays only when their items carry a name or id (a criteria list). */
function flatten(v: unknown, path: string, out: Record<string, number>) {
  if (typeof v === 'number') { if (path && path !== 'total') out[path] = v; return; }
  if (Array.isArray(v)) {
    for (const it of v) {
      const id = it && typeof it === 'object' ? (it as any).name ?? (it as any).id : undefined;
      if (typeof id === 'string') flatten(it, path ? `${path}.${id}` : id, out);
    }
    return;
  }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out);
}

// ---------- stats ----------
function stats(recs: Rec[], orders: OrderRec[]): Stats {
  const ok = recs.filter((r) => r.verdict !== 'error');
  const n = ok.length;
  const inside = ok.filter((r) => r.verdict === 'ok').length;
  const counted = orders.filter((o) => o.held !== null);
  return {
    n, inside, pct: n ? (100 * inside) / n : 0,
    mean: n ? ok.reduce((s, r) => s + Math.abs(r.dist), 0) / n : 0,
    harsh: ok.filter((r) => r.verdict === 'harsh').length,
    lenient: ok.filter((r) => r.verdict === 'lenient').length,
    errors: recs.length - n,
    orderHeld: counted.filter((o) => o.held).length, orderTotal: counted.length,
  };
}

function table(recs: Rec[], orders: OrderRec[], sets: SetSpec[]): string[] {
  const out: string[] = [];
  const head = `${'set / domain'.padEnd(22)} ${'n'.padStart(4)} ${'in'.padStart(4)} ${'%'.padStart(6)} ${'mean d'.padStart(7)} ${'harsh'.padStart(6)} ${'lenient'.padStart(8)} ${'err'.padStart(4)} ${'order'.padStart(8)}`;
  const row = (label: string, s: Stats) =>
    `${label.padEnd(22)} ${String(s.n).padStart(4)} ${String(s.inside).padStart(4)} ${s.pct.toFixed(1).padStart(6)} ${s.mean.toFixed(2).padStart(7)} ${String(s.harsh).padStart(6)} ${String(s.lenient).padStart(8)} ${String(s.errors).padStart(4)} ${`${s.orderHeld}/${s.orderTotal}`.padStart(8)}`;
  for (const split of ['train', 'heldout'] as Split[]) {
    const ss = sets.filter((s) => s.split === split);
    if (!ss.length) continue;
    out.push(`\n== ${split.toUpperCase()} ==`, head);
    for (const s of ss) out.push(row(s.name, stats(recs.filter((r) => r.set === s.name), orders.filter((o) => o.set === s.name))));
    out.push('-'.repeat(head.length));
    for (const d of ['pages', 'sites', 'scenes'] as Domain[]) {
      if (!ss.some((s) => s.domain === d)) continue;
      out.push(row(`[${d}]`, stats(recs.filter((r) => r.split === split && r.domain === d), orders.filter((o) => o.split === split && o.domain === d))));
    }
    out.push(row(`[all ${split}]`, stats(recs.filter((r) => r.split === split), orders.filter((o) => o.split === split))));
  }
  return out;
}

// ---------- main ----------
async function main() {
  const t0 = Date.now();
  const registry = JSON.parse(readFileSync(abs('calibration/bench.json'), 'utf8')) as { sets: SetSpec[] };
  const sets = registry.sets.filter((s) => (!onlyDomain || s.domain === onlyDomain) && (!onlySet || s.name === onlySet));
  if (!sets.length) throw new Error('no set matches the filters');
  const recs: Rec[] = [];
  const orders: OrderRec[] = [];
  const selfs: SelfRec[] = [];
  const skipped: Record<string, string[]> = {};
  // Scenes last, so the page browser and the scene browser are not both busy.
  const rank = { pages: 0, sites: 1, scenes: 2 };
  try {
    for (const spec of [...sets].sort((a, b) => rank[a.domain] - rank[b.domain])) {
      say(`\n### ${spec.name} (${spec.domain}, ${spec.split})`);
      let parsed: ReturnType<typeof parseBands>;
      let src: Source;
      try {
        parsed = parseBands(spec.bands);
        src = await source(spec);
      } catch (e) {
        console.log(`  SET FAILED: ${msg(e)}`);
        continue;
      }
      if (parsed.skipped.length) skipped[spec.name] = parsed.skipped;
      const goals = new Map<string, { goal?: unknown; error?: string }>();
      for (const e of parsed.entries) {
        if (!goals.has(e.group)) {
          const g: { goal?: unknown; error?: string } = {};
          try {
            const input = src.goal(e.group);
            g.goal = await prepare(spec.domain, input);
            const self = await grade(spec.domain, g.goal, input);
            selfs.push({ set: spec.name, group: e.group, score: self.total });
            say(`  ${e.group}: goal vs itself ${self.total}${self.total === 100 ? '' : '  NOT 100'}`);
          } catch (err) {
            g.error = `goal: ${msg(err)}`;
            selfs.push({ set: spec.name, group: e.group, score: null, error: g.error });
            say(`  ${e.group}: GOAL FAILED ${g.error}`);
          }
          goals.set(e.group, g);
        }
        const g = goals.get(e.group)!;
        const [lo, hi] = e.band;
        const base = { set: spec.name, domain: spec.domain, split: spec.split, key: e.key, band: e.band };
        const t = Date.now();
        try {
          if (g.error) throw new Error(g.error);
          const result = await grade(spec.domain, g.goal, src.attempt(e));
          const s = result.total as number;
          const dist = s < lo ? s - lo : s > hi ? s - hi : 0;
          const verdict: Verdict = dist < 0 ? 'harsh' : dist > 0 ? 'lenient' : 'ok';
          recs.push({ ...base, score: s, dist: r1(dist * 1000) / 1000, verdict, ms: Date.now() - t, result: clean(result) });
          say(`  ${e.key.padEnd(40)} [${lo}-${hi}] ${s.toFixed(1).padStart(6)}  ${verdict === 'ok' ? 'ok' : `${verdict.toUpperCase()} by ${Math.abs(dist).toFixed(1)}`}${result.error ? `  (refused: ${result.error})` : ''}`);
        } catch (err) {
          recs.push({ ...base, score: null, dist: 0, verdict: 'error', error: msg(err), ms: Date.now() - t });
          say(`  ${e.key.padEnd(40)} ERROR ${msg(err)}`);
        }
      }
      const scores = new Map(recs.filter((r) => r.set === spec.name && r.score !== null).map((r) => [r.key, r.score as number]));
      for (const [a, b] of [...parsed.order, ...(spec.order ?? [])]) {
        const sa = scores.get(a), sb = scores.get(b);
        const held = sa === undefined || sb === undefined ? null : sa > sb;
        orders.push({ set: spec.name, domain: spec.domain, split: spec.split, higher: a, lower: b, held });
        if (held === false) say(`  ORDER FAIL ${a} (${sa}) should beat ${b} (${sb})`);
      }
    }
  } finally {
    await pageGrader?.close();
    await sceneGrader?.close();
  }

  const lines = table(recs, orders, sets);
  const worst = recs.filter((r) => r.verdict === 'harsh' || r.verdict === 'lenient').sort((a, b) => Math.abs(b.dist) - Math.abs(a.dist)).slice(0, 10);
  lines.push('\nTen worst misses:');
  for (const r of worst) lines.push(`  ${r.set.padEnd(15)} ${r.key.padEnd(40)} [${r.band[0]}-${r.band[1]}] ${(r.score as number).toFixed(1).padStart(6)}  ${r.verdict} by ${Math.abs(r.dist).toFixed(1)}`);
  const badSelf = selfs.filter((s) => s.score !== 100);
  lines.push(`\nGoal vs itself: ${selfs.length - badSelf.length}/${selfs.length} exactly 100${badSelf.length ? '  NOT 100: ' + badSelf.map((s) => `${s.set}/${s.group}=${s.score ?? s.error}`).join(', ') : ''}`);
  const nSkip = Object.values(skipped).reduce((s, l) => s + l.length, 0);
  if (nSkip) lines.push(`Skipped (no numeric band): ${nSkip}  (${Object.entries(skipped).map(([k, l]) => `${k} ${l.length}`).join(', ')})`);
  const unknownOrder = orders.filter((o) => o.held === null).length;
  if (unknownOrder) lines.push(`Order checks not counted (an attempt missing or failed): ${unknownOrder}`);
  const errs = recs.filter((r) => r.verdict === 'error');
  if (errs.length) lines.push(`Errors: ${errs.length}  first: ${errs[0].key}: ${errs[0].error}`);
  lines.push(`Run time: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(lines.join('\n'));

  const cmp = opt('--compare');
  if (cmp) compare(JSON.parse(readFileSync(resolve(cmp), 'utf8')), recs, orders, sets);

  const jsonFile = opt('--json');
  if (jsonFile) {
    mkdirSync(dirname(resolve(jsonFile)), { recursive: true });
    writeFileSync(resolve(jsonFile), JSON.stringify({ when: new Date().toISOString(), sets, records: recs, orders, selfs, skipped }, null, 1));
    console.log(`wrote ${jsonFile}`);
  }
  const csvFile = opt('--csv');
  if (csvFile) {
    const flat = recs.map((r) => { const o: Record<string, number> = {}; flatten(r.result, '', o); return o; });
    const cols = [...new Set(flat.flatMap((o) => Object.keys(o)))];
    const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
    const rows = [['set', 'domain', 'split', 'attempt', 'band_low', 'band_high', 'score', 'distance', 'verdict', ...cols].join(',')];
    recs.forEach((r, i) => rows.push([r.set, r.domain, r.split, q(r.key), r.band[0], r.band[1], r.score ?? '', r.dist, r.verdict, ...cols.map((c) => flat[i][c] ?? '')].join(',')));
    mkdirSync(dirname(resolve(csvFile)), { recursive: true });
    writeFileSync(resolve(csvFile), rows.join('\n') + '\n');
    console.log(`wrote ${csvFile} (${recs.length} rows, ${cols.length} sub-score columns)`);
  }
}

function compare(prev: { records: Rec[]; orders: OrderRec[] }, recs: Rec[], orders: OrderRec[], sets: SetSpec[]) {
  const names = new Set(sets.map((s) => s.name));
  const before = new Map(prev.records.filter((r) => names.has(r.set)).map((r) => [`${r.set}|${r.key}`, r]));
  const entered: string[] = [], left: string[] = [];
  for (const r of recs) {
    const p = before.get(`${r.set}|${r.key}`);
    if (!p) continue;
    const line = `  ${r.set} ${r.key} [${r.band[0]}-${r.band[1]}] ${p.score ?? 'err'} -> ${r.score ?? 'err'}`;
    if (p.verdict !== 'ok' && r.verdict === 'ok') entered.push(line);
    if (p.verdict === 'ok' && r.verdict !== 'ok') left.push(`${line} (${r.verdict})`);
  }
  console.log(`\n== COMPARE with earlier run ==\nEntered their band (${entered.length}):\n${entered.join('\n') || '  none'}\nLEFT their band (${left.length}):\n${left.join('\n') || '  none'}`);
  const pr = prev.records.filter((r) => names.has(r.set)), po = (prev.orders ?? []).filter((o) => names.has(o.set));
  const groups: [string, (x: { split: Split; domain: Domain }) => boolean][] = [];
  for (const split of ['train', 'heldout'] as Split[]) {
    for (const d of ['pages', 'sites', 'scenes'] as Domain[]) if (sets.some((s) => s.split === split && s.domain === d)) groups.push([`${split} ${d}`, (x) => x.split === split && x.domain === d]);
    if (sets.some((s) => s.split === split)) groups.push([`${split} all`, (x) => x.split === split]);
  }
  const fmt = (a: number, b: number, dp = 0) => `${a.toFixed(dp)}->${b.toFixed(dp)} (${b - a >= 0 ? '+' : ''}${(b - a).toFixed(dp)})`;
  for (const [label, f] of groups) {
    const a = stats(pr.filter(f), po.filter(f)), b = stats(recs.filter(f), orders.filter(f));
    console.log(`  ${label.padEnd(14)} in ${fmt(a.inside, b.inside)}  % ${fmt(a.pct, b.pct, 1)}  mean d ${fmt(a.mean, b.mean, 2)}  harsh ${fmt(a.harsh, b.harsh)}  lenient ${fmt(a.lenient, b.lenient)}  order ${fmt(a.orderHeld, b.orderHeld)}/${b.orderTotal}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
