/**
 * npx tsx calibration/fit/diagnose.ts <bench.json> [baseline.json] > calibration/fit/pages-diagnosis.md
 * How well each page criterion tracks the human bands on its own. Deterministic.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [file, baseFile] = process.argv.slice(2);
const j = JSON.parse(readFileSync(file, 'utf8'));
const recs = (j.records as any[]).filter((r) => r.domain === 'pages' && Array.isArray(r.band) && r.result);
const base = new Map<string, number>();
if (baseFile) for (const r of JSON.parse(readFileSync(baseFile, 'utf8')).records) if (r.domain === 'pages') base.set(`${r.set}|${r.key}`, r.score);

function ranks(x: number[]): number[] {
  const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const r = new Array(x.length);
  for (let i = 0; i < idx.length; ) {
    let k = i; while (k + 1 < idx.length && idx[k + 1][0] === idx[i][0]) k++;
    for (let m = i; m <= k; m++) r[idx[m][1]] = (i + k) / 2 + 1;
    i = k + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b), n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

type Row = { label: string; group: string; get: (r: any) => number | null };
const rows: Row[] = [];
const critIds: { id: string; group: string; name: string }[] = [];
for (const r of recs) for (const c of r.result.criteria ?? []) if (!critIds.some((x) => x.id === c.id)) critIds.push({ id: c.id, group: c.group, name: c.name });
for (const c of critIds) rows.push({ label: c.id, group: c.group, get: (r) => { const x = (r.result.criteria ?? []).find((y: any) => y.id === c.id); return typeof x?.value === 'number' ? x.value : null; } });
for (const k of ['content', 'layout', 'style', 'visual']) rows.push({ label: `breakdown.${k}`, group: 'sub-score', get: (r) => typeof r.result.breakdown?.[k] === 'number' ? r.result.breakdown[k] / 100 : null });
rows.push({ label: 'grader total (now)', group: 'total', get: (r) => r.score / 100 });
if (base.size) rows.push({ label: 'grader total 0.7.0', group: 'total', get: (r) => { const v = base.get(`${r.set}|${r.key}`); return v === undefined ? null : v / 100; } });

const mid = (r: any) => (r.band[0] + r.band[1]) / 2;
const out: string[] = [];
out.push('# Pages: how each criterion tracks the human bands');
out.push('');
out.push(`Data: \`${basename(file)}\`, ${recs.length} banded page attempts in ${new Set(recs.map((r) => r.set)).size} sets. Made by \`calibration/fit/diagnose.ts\`.`);
out.push('');
out.push('- **rho**: rank correlation of the criterion alone with the band midpoint (1 = orders pages exactly as people do; 0 = no relation).');
out.push('- **false high**: reads 0.95 or more although the band says the page is clearly wrong (band top 70 or less).');
out.push('- **false low**: reads under 0.70 although the band says nearly right (band bottom 80 or more).');
out.push('- **n/a**: attempts where the criterion was null (not measurable for that goal).');
out.push('');
out.push('| criterion | group | rho | false high | false low | n/a |');
out.push('|---|---|---|---|---|---|');
const detail: string[] = [];
for (const row of rows) {
  const pts = recs.map((r) => ({ r, v: row.get(r) })).filter((x) => x.v !== null) as { r: any; v: number }[];
  const rho = pts.length > 2 ? spearman(pts.map((x) => x.v), pts.map((x) => mid(x.r))) : 0;
  const fh = pts.filter((x) => x.v >= 0.95 && x.r.band[1] <= 70);
  const fl = pts.filter((x) => x.v < 0.7 && x.r.band[0] >= 80);
  out.push(`| ${row.label} | ${row.group} | ${rho.toFixed(2)} | ${fh.length} | ${fl.length} | ${recs.length - pts.length} |`);
  if (row.group !== 'total' && (fh.length || fl.length)) {
    detail.push(`**${row.label}**`);
    for (const x of fh) detail.push(`- false high: ${x.r.set} ${x.r.key} reads ${x.v.toFixed(2)}, band ${x.r.band[0]}-${x.r.band[1]}`);
    for (const x of fl) detail.push(`- false low: ${x.r.set} ${x.r.key} reads ${x.v.toFixed(2)}, band ${x.r.band[0]}-${x.r.band[1]}`);
    detail.push('');
  }
}
out.push('');
out.push('## The cases behind the counts');
out.push('');
out.push(...detail);
process.stdout.write(out.join('\n') + '\n');
