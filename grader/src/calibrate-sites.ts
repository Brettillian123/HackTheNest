/**
 * Grades every attempt at every calibration site and writes a page a person
 * can check by eye: each attempt's pages beside the goal's, with its score,
 * its links and its device checks.
 *
 *   npm run calibrate:sites
 *
 * A set is calibration/sites/<name>/ with a goal/ folder and one folder per
 * attempt under attempts/. The report is written to
 * calibration/out/site-report.html.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRADER_VERSION } from './config';
import { SITE_WEIGHTS } from './site-config';
import { Grader, type PreparedSite, type SiteFiles, type SiteGradeResult } from './index';

const here = dirname(fileURLToPath(import.meta.url));
const SITES_DIR = join(here, '..', 'calibration', 'sites');
const OUT_DIR = join(here, '..', 'calibration', 'out');

/** Reads a folder of text files into a site: path -> text. */
export function readSite(dir: string): SiteFiles {
  const files: SiteFiles = {};
  const walk = (folder: string) => {
    for (const name of readdirSync(folder).sort()) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full).replace(/\\/g, '/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

interface AttemptReport {
  name: string;
  result: SiteGradeResult;
  site: PreparedSite | null;
}

interface SetReport {
  name: string;
  goal: PreparedSite;
  attempts: AttemptReport[];
}

export async function gradeSiteSets(grader: Grader): Promise<SetReport[]> {
  const reports: SetReport[] = [];
  for (const name of readdirSync(SITES_DIR).sort()) {
    const dir = join(SITES_DIR, name);
    if (!statSync(dir).isDirectory()) continue;
    const goal = await grader.prepareSite(readSite(join(dir, 'goal')));
    const attempts: AttemptReport[] = [];
    const attemptsDir = join(dir, 'attempts');
    for (const attempt of readdirSync(attemptsDir).sort()) {
      const { result, candidate } = await grader.gradeSite(goal, readSite(join(attemptsDir, attempt)));
      attempts.push({ name: attempt, result, site: candidate });
    }
    attempts.sort((a, b) => b.result.total - a.result.total || a.name.localeCompare(b.name));
    reports.push({ name, goal, attempts });
  }
  return reports;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const seconds = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const img = (png: Buffer) => `<img src="data:image/png;base64,${png.toString('base64')}">`;

function attemptHtml(goal: PreparedSite, a: AttemptReport): string {
  const r = a.result;
  const pages = r.pages
    .map((p) => {
      const shot = p.candidate && a.site?.page(p.candidate) ? img(a.site.page(p.candidate)!.snapshot.png) : '<div class="none">no such page</div>';
      const b = p.result?.breakdown;
      const own = b ? `content ${b.content ?? 'n/a'} · layout ${b.layout} · style ${b.style} · visual ${b.visual}` : '';
      const parts = !b
        ? 'missing: scores 0'
        : p.orphaned
          ? `<span class="bad">Nothing links to this page from the home page, so a visitor cannot reach it: it keeps half its marks.</span> The page itself scored ${p.result!.total.toFixed(1)}: ${own}`
          : own;
      const as = p.candidate && p.candidate !== p.goal ? ` <span class="as">as ${esc(p.candidate)}</span>` : '';
      return `<figure>${shot}<figcaption><b>${esc(p.goal)}</b>${as}<span class="num">${p.total.toFixed(1)}</span><span class="parts">${parts}</span></figcaption></figure>`;
    })
    .join('');

  const links =
    (r.links.score === null
      ? 'The goal has no links between pages.'
      : `${r.links.found} of ${r.links.expected} links between pages present (${r.links.score.toFixed(1)}).`) +
    (r.links.orphaned.length ? ` <span class="bad">Orphaned (nothing links to them, so they keep half their marks): ${r.links.orphaned.map(esc).join(', ')}.</span>` : '') +
    (r.links.broken.length ? ` <span class="bad">Dead: ${r.links.broken.map(esc).join(', ')}.</span>` : '') +
    (r.links.deadLinkFactor < 1 ? ` <span class="bad">Dead links multiply the total by ${r.links.deadLinkFactor.toFixed(3)}.</span>` : '') +
    (r.links.score !== null && r.links.missing.length
      ? ` Missing: ${r.links.missing.slice(0, 6).map(esc).join(', ')}${r.links.missing.length > 6 ? ', ...' : ''}.`
      : '');

  let efficiency = '<p class="bad">No page could be compared, so efficiency was not scored.</p>';
  if (r.efficiency) {
    const e = r.efficiency;
    const rows = e.time.checks
      .map(
        (c) =>
          `<tr class="${c.passed ? '' : 'fail'}"><td>${esc(c.device)}</td><td>${seconds(c.estimatedMs)}</td><td>${seconds(c.referenceMs)}</td>` +
          `<td>${c.ratio.toFixed(2)}x</td><td>${c.credit.toFixed(1)}</td><td>${c.passed ? 'pass' : 'FAIL'}</td></tr>`,
      )
      .join('');
    efficiency =
      `<table><thead><tr><th>Engineering check</th><th>This site</th><th>Goal</th><th>Ratio</th><th>Credit (-100 to 100)</th><th></th></tr></thead><tbody>` +
      `<tr class="${e.space.credit < 0 ? 'fail' : ''}"><td>Space: total size</td><td>${kb(e.space.bytes)}</td><td>${kb(e.space.referenceBytes)}</td>` +
      `<td>${e.space.ratio.toFixed(2)}x</td><td>${e.space.credit.toFixed(1)}</td><td></td></tr>` +
      `${rows}</tbody></table>`;
  }

  const feedback = r.feedback.length
    ? `<ul class="feedback">${r.feedback.map((f) => `<li>${esc(f.message)} <span class="cost">-${f.points.toFixed(1)}</span></li>`).join('')}</ul>`
    : '';
  const p = r.pillars;
  const w = SITE_WEIGHTS;
  const e = r.engineering;
  const credit = (name: string, key: 'efficiency' | 'accessibility' | 'cleanCode') =>
    e ? `${e.decidedBy === key ? '<b>' : ''}${name} ${e[key].toFixed(1)}${e.decidedBy === key ? '</b>' : ''}` : '';
  const engineering = e
    ? `<p class="formula">Engineering is the worst of three: ${credit('size and speed', 'efficiency')} · ${credit('accessibility', 'accessibility')} · ${credit('clean code', 'cleanCode')}.</p>`
    : '';
  const bonus = r.bonus > 0 ? ` <b class="good">+ ${r.bonus.toFixed(1)} bonus for beating the goal</b>` : '';
  return `<article>
<header><h3>${esc(a.name)}</h3><div class="total${r.total > 100 ? ' over' : ''}">${r.total.toFixed(1)}</div></header>
<p class="formula">works <b>${p.works.toFixed(1)}</b> (${Math.round(w.works * 100)}%) · engineering <b class="${p.engineering < 0 ? 'bad' : ''}">${p.engineering.toFixed(1)}</b> (${Math.round(w.engineering * 100)}%, earned only as far as the site works) · looks <b>${p.looks.toFixed(1)}</b> (${Math.round(w.looks * 100)}%)${bonus}${r.error ? ` <span class="bad">${esc(r.error)}</span>` : ''}</p>
${engineering}
${feedback}
<div class="pages">${pages}</div>
<p class="links">${links}</p>
${efficiency}
</article>`;
}

function toHtml(reports: SetReport[]): string {
  const sections = reports
    .map((set) => {
      const goalPages = set.goal.pages
        .map((p) => `<figure>${img(p.snapshot.png)}<figcaption><b>${esc(p.path)}</b></figcaption></figure>`)
        .join('');
      let bytes = 0;
      for (const text of set.goal.files.values()) bytes += Buffer.byteLength(text, 'utf8');
      return `<section><h2>${esc(set.name)}</h2>
<article class="goal"><header><h3>goal</h3><div class="total">100.0</div></header>
<p class="formula">The target: ${set.goal.pages.length} pages, ${set.goal.files.size} files, ${kb(bytes)}. It is also the reference for size and load time.</p>
<div class="pages">${goalPages}</div></article>
${set.attempts.map((a) => attemptHtml(set.goal, a)).join('\n')}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Site grading report</title><style>
body{font-family:Arial,Helvetica,sans-serif;margin:24px;background:#f3f4f6;color:#111827}
h1{margin:0 0 4px}h2{margin:32px 0 12px;text-transform:capitalize}
article{background:#fff;border:2px solid #d1d5db;border-radius:10px;padding:16px 20px;margin:0 0 20px}
article.goal{border-color:#2563eb}
header{display:flex;align-items:baseline;justify-content:space-between}
h3{margin:0;font-size:20px}.total{font-size:34px;font-weight:700}
.formula{margin:4px 0 14px;color:#4b5563;font-size:14px}
.pages{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
figure{margin:0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#fafafa}
figure img{display:block;width:100%}
.none{padding:60px 10px;text-align:center;color:#b91c1c;font-size:14px}
figcaption{padding:8px 10px;font-size:13px;display:grid;grid-template-columns:1fr auto;gap:2px 8px}
.num{font-weight:700;font-size:16px;text-align:right}.as{color:#6b7280}
.parts{grid-column:1 / -1;color:#6b7280;font-size:12px}
.links{font-size:14px;margin:14px 0 10px}
table{border-collapse:collapse;font-size:13px;width:100%}
th,td{text-align:left;padding:5px 10px;border-bottom:1px solid #e5e7eb}
th{color:#6b7280;font-weight:400}tr.fail td{color:#b91c1c;font-weight:700}
.feedback{margin:0 0 14px;padding-left:20px;font-size:14px}.feedback li{margin:2px 0}.cost{color:#b91c1c;font-weight:700}
.bad{color:#b91c1c}.good{color:#047857}.total.over{color:#047857}
@media (max-width:800px){.pages{grid-template-columns:1fr}}
</style></head><body><h1>Site grading report</h1>
<p>Grading rules version ${GRADER_VERSION}. Attempts are sorted best first. For each: the total, how it is made up, every page as the grader saw it, the links between pages, and the size and load-time checks against the goal. Load times are estimates from a model, not measurements. Check by eye: does each total match how good the attempt is?</p>
${sections}
</body></html>`;
}

async function main(): Promise<void> {
  const grader = new Grader();
  try {
    const reports = await gradeSiteSets(grader);
    for (const set of reports) {
      console.log(`\n${set.name}`);
      console.log(
        '  attempt                   total  works  engineering  looks  bonus  links  | efficiency  accessibility  clean code  decided by    | device checks',
      );
      for (const a of set.attempts) {
        const r = a.result;
        const checks = r.efficiency ? r.efficiency.time.checks.map((c) => (c.passed ? 'pass' : 'FAIL')).join(' ') : '-';
        console.log(
          `  ${a.name.padEnd(25)} ${r.total.toFixed(1).padStart(5)}  ${r.pillars.works.toFixed(1).padStart(5)}  ${r.pillars.engineering
            .toFixed(1)
            .padStart(11)}  ${r.pillars.looks.toFixed(1).padStart(5)}  ${r.bonus.toFixed(1).padStart(5)}  ${(r.links.score === null
            ? 'n/a'
            : r.links.score.toFixed(1)
          ).padStart(5)}  | ${(r.engineering?.efficiency ?? 0).toFixed(1).padStart(10)}  ${(r.engineering?.accessibility ?? 0)
            .toFixed(1)
            .padStart(13)}  ${(r.engineering?.cleanCode ?? 0).toFixed(1).padStart(10)}  ${(r.engineering?.decidedBy ?? '-').padEnd(13)} | ${checks}`,
        );
        for (const f of r.feedback.slice(0, 3)) console.log(`      -${f.points.toFixed(1).padStart(5)}  ${f.message}`);
      }
    }
    mkdirSync(OUT_DIR, { recursive: true });
    const out = join(OUT_DIR, 'site-report.html');
    writeFileSync(out, toHtml(reports));
    console.log(`\nreport: ${out}`);
  } finally {
    await grader.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
