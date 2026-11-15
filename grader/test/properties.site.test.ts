// Property tests: rules that must hold for any site, checked over many
// generated sites. A failure names the seed and shows the numbers.
import { afterAll, describe, expect, it } from 'vitest';
import { Grader, type SiteFiles } from '../src/index';
import { r1, rises } from './helpers/property-format';
import { randomPage, toParts } from './helpers/random-page';

const grader = new Grader();
afterAll(() => grader.close());

const SITE_SEEDS = [21, 22, 23];
// The slowest site properties run on two seeds to keep the run short.
const SLOW_SITE_SEEDS = SITE_SEEDS.slice(0, 2);

const PAGE_FILES = ['index.html', 'about.html', 'contact.html'];
const LABELS = ['Home', 'About', 'Contact'];

interface SiteOpts {
  pages?: number[]; // which of the three pages to include
  dropLinks?: number; // how many nav links to remove, in a fixed order
  dropPairs?: string[]; // particular nav links to remove, as "from:to" page numbers
  deadLinks?: number; // how many visible links to missing files to add to the home page's nav
  extraCss?: string;
  names?: string[]; // file names of the three pages (default PAGE_FILES)
  cssName?: string; // name of the shared stylesheet (default site.css)
  inlineCss?: boolean; // the shared CSS written into each page instead
  reverseNav?: boolean; // nav links in the opposite order in the markup, laid out right to left so they look the same
  linkForm?: 'plain' | 'dot' | 'root' | 'hash' | 'query'; // how each nav href is written
  folder?: boolean; // the about page lives at docs/index.html and is linked as docs/
  outside?: number; // links and stylesheets to outside addresses on the home page
  unlinkedPage?: boolean; // adds notes.html, which nothing links to
  extraPage?: 'linked' | 'unlinked'; // adds a page the goal does not have, built from another seed
  swap?: [number, number]; // swaps the content (not the nav) of two pages
  coverNav?: boolean; // the home page's nav is covered by an opaque box
  hiddenElements?: number; // hidden elements added to every page
  extraFiles?: number; // empty stylesheets every page loads
  padBytes?: number; // an HTML comment of this many bytes in every page
  emptySheet?: boolean; // every page also loads an empty stylesheet
  faults?: boolean; // every page is inaccessible and badly written: no alt, empty link, faint text, skipped heading, duplicate ids, obsolete and unclosed tags
}

// Accessibility and clean-code faults, for goals that have them themselves.
const FAULTS =
  '<center><img src="missing.png" width="40" height="40"><a href="#top"></a><h4>Skipped level</h4>' +
  '<p style="color:#d9d9d9">Faint text</p><div id="twin"><font color="#333">Old tag</font></div><div id="twin"><span>Open</div></center>';

/** The href from one page to a file, written the way `form` says. */
function href(from: string, to: string, form: SiteOpts['linkForm'] = 'plain'): string {
  const target = to.endsWith('index.html') && to.includes('/') ? to.slice(0, -'index.html'.length) : to;
  if (form === 'root') return `/${target}`;
  const rel = (from.includes('/') ? '../' : '') + target;
  if (form === 'dot') return from.includes('/') ? rel : `./${rel}`;
  if (form === 'hash') return `${rel}#top`;
  if (form === 'query') return `${rel}?x=1`;
  return rel;
}

function buildSite(seed: number, o: SiteOpts = {}): SiteFiles {
  const descs = [0, 1, 2].map((i) => randomPage(seed * 10 + i));
  const parts = descs.map((d, i) => toParts(d, { css: 'sheet', classPrefix: `p${i}` }));
  const extra = o.extraPage ? toParts(randomPage(seed * 10 + 7), { css: 'sheet', classPrefix: 'px' }) : null;
  const content = [0, 1, 2].map((i) => parts[i]);
  if (o.swap) [content[o.swap[0]], content[o.swap[1]]] = [content[o.swap[1]], content[o.swap[0]]];
  const names = [...(o.names ?? PAGE_FILES)];
  if (o.folder) names[1] = 'docs/index.html';
  const cssName = o.cssName ?? 'site.css';
  const linkOrder: [number, number][] = [];
  for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) if (from !== to) linkOrder.push([from, to]);
  const dropped = new Set([...linkOrder.slice(0, o.dropLinks ?? 0).map(([f, t]) => `${f}:${t}`), ...(o.dropPairs ?? [])]);
  const css =
    `nav.site-nav{display:flex;gap:24px;padding:16px 40px;background:#1f2937;font-family:Arial, Helvetica, sans-serif${o.reverseNav ? ';flex-direction:row-reverse;justify-content:flex-end' : ''}}\n` +
    `nav.site-nav a{color:#ffffff;text-decoration:none;font-size:16px;font-weight:700}\n` +
    parts.map((p) => p.css).join('\n') + (extra ? `\n${extra.css}` : '') + (o.extraCss ?? '');
  const files: SiteFiles = o.inlineCss ? {} : { [cssName]: css };
  const extraSheets = Array.from({ length: o.extraFiles ?? 0 }, (_, k) => `extra-${k}.css`);
  for (const sheet of extraSheets) files[sheet] = '';
  if (o.emptySheet) files['empty.css'] = '';
  const page = (path: string, title: string, bodyClass: string, navHtml: string, body: string) => {
    let head = o.inlineCss ? `<style>${css}</style>` : `<link rel="stylesheet" href="${href(path, cssName)}">`;
    for (const sheet of extraSheets) head += `<link rel="stylesheet" href="${href(path, sheet)}">`;
    if (o.emptySheet) head += `<link rel="stylesheet" href="${href(path, 'empty.css')}">`;
    if (path === names[0]) for (let k = 0; k < (o.outside ?? 0); k++) head += `<link rel="stylesheet" href="https://cdn.example.com/s${k}.css">`;
    const cover = o.coverNav && path === names[0] ? '<div style="position:absolute;top:0;left:0;width:100%;height:80px;background:#7c2d12"></div>' : '';
    const hidden = '<div hidden><span>x</span></div>'.repeat(o.hiddenElements ?? 0);
    const pad = (o.padBytes ? `<!--${'p'.repeat(o.padBytes)}-->` : '') + (o.faults ? FAULTS : '');
    return (
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}</head>` +
      `<body class="${bodyClass}"><nav class="site-nav">${navHtml}</nav>${body}${cover}${hidden}${pad}</body></html>`
    );
  };
  for (const i of o.pages ?? [0, 1, 2]) {
    const path = names[i];
    const navLinks = [0, 1, 2]
      .filter((t) => t !== i && !dropped.has(`${i}:${t}`))
      .map((t) => `<a href="${href(path, names[t], o.linkForm)}">${LABELS[t]}</a>`);
    let links = (o.reverseNav ? navLinks.reverse() : navLinks).join('');
    if (i === 0) {
      links += Array.from({ length: o.deadLinks ?? 0 }, (_, k) => `<a href="gone-${k}.html">Gone ${k}</a>`).join('');
      links += Array.from({ length: o.outside ?? 0 }, (_, k) => `<a href="https://example.com/o${k}">Out ${k}</a>`).join('');
      if (o.extraPage === 'linked') links += `<a href="extra.html">Extra</a>`;
    }
    files[path] = page(path, LABELS[i], content[i].bodyClass, links, content[i].body);
  }
  if (extra) files['extra.html'] = page('extra.html', 'Extra', extra.bodyClass, `<a href="${names[0]}">Home</a>`, extra.body);
  if (o.unlinkedPage) files['notes.html'] = page('notes.html', 'Notes', parts[1].bodyClass, `<a href="${names[0]}">Home</a>`, parts[1].body);
  return files;
}

function unusedCss(bytes: number): string {
  let s = '\n';
  for (let i = 0; s.length < bytes; i++) s += `.unused-rule-${i}{color:#${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)};margin:${i % 9}px;padding:2px}\n`;
  return s;
}

type SiteResult = Awaited<ReturnType<Grader['gradeSite']>>['result'];
function sfmt(r: SiteResult): string {
  const p = r.pillars;
  return `total ${r1(r.total)} (works ${r1(p.works)}, engineering ${r1(p.engineering)}, looks ${r1(p.looks)}, bonus ${r1(r.bonus)}, links ${r1(r.links.score)})${r.error ? ` error: ${r.error}` : ''}`;
}

describe('sites', () => {
  const prepared = new Map<number, ReturnType<Grader['prepareSite']>>();
  const goal = (seed: number) => {
    if (!prepared.has(seed)) prepared.set(seed, grader.prepareSite(buildSite(seed)));
    return prepared.get(seed)!;
  };
  const all: { label: string; r: SiteResult }[] = [];
  const gradeS = async (seed: number, label: string, files: SiteFiles) => {
    const r = (await grader.gradeSite(await goal(seed), files)).result;
    all.push({ label: `seed ${seed} ${label}`, r });
    return r;
  };

  it('identity: 100, pillars 100/100/100, all three engineering credits 100, bonus 0', async () => {
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      const r = await gradeS(seed, 'identity', buildSite(seed));
      const p = r.pillars;
      const e = r.engineering;
      if (!(r.total === 100 && p.works === 100 && p.engineering === 100 && p.looks === 100 && r.bonus === 0)) failures.push(`seed ${seed}: ${sfmt(r)}`);
      if (!(e && e.efficiency === 100 && e.accessibility === 100 && e.cleanCode === 100)) failures.push(`seed ${seed}: engineering ${JSON.stringify(e)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('identity holds for goals that are themselves inaccessible and badly written', async () => {
    // The goal is the reference: its own faults are never charged, so a faulty site matches itself exactly.
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      const files = buildSite(seed, { faults: true });
      const r = (await grader.gradeSite(files, files)).result;
      all.push({ label: `seed ${seed} faulty self`, r });
      const e = r.engineering;
      if (r.total !== 100 || r.pillars.engineering !== 100 || r.feedback.length !== 0) failures.push(`seed ${seed}: ${sfmt(r)}`);
      if (!(e && e.efficiency === 100 && e.accessibility === 100 && e.cleanCode === 100)) failures.push(`seed ${seed}: engineering ${JSON.stringify(e)}`);
      // The same faults on a clean goal are charged.
      const charged = (await grader.gradeSite(await goal(seed), files)).result;
      all.push({ label: `seed ${seed} faults against a clean goal`, r: charged });
      if (!(charged.engineering && charged.engineering.accessibility < 100 && charged.engineering.cleanCode < 100)) {
        failures.push(`seed ${seed}: faults not charged against a clean goal: ${JSON.stringify(charged.engineering)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('unused CSS never helps: total and engineering never rise, works and looks stay 100', async () => {
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (const kb of [0, 2, 20, 200]) steps.push({ name: `+${kb} KB`, r: await gradeS(seed, `+${kb} KB css`, buildSite(seed, { extraCss: unusedCss(kb * 1024) })) });
      failures.push(...rises(`seed ${seed} unused css (total)`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      failures.push(...rises(`seed ${seed} unused css (engineering)`, steps.map((s) => ({ name: s.name, total: s.r.pillars.engineering, text: sfmt(s.r) }))));
      for (const s of steps) if (s.r.pillars.works !== 100 || s.r.pillars.looks !== 100) failures.push(`seed ${seed} ${s.name}: works/looks not 100: ${sfmt(s.r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('removing pages never helps', async () => {
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (const keep of [[0, 1, 2], [0, 1], [0]]) steps.push({ name: `${keep.length} pages`, r: await gradeS(seed, `${keep.length} pages`, buildSite(seed, { pages: keep })) });
      failures.push(...rises(`seed ${seed} remove pages`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('removing nav links never helps: links score and total never rise', async () => {
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (let drop = 0; drop <= 6; drop++) steps.push({ name: `-${drop} links`, r: await gradeS(seed, `-${drop} links`, buildSite(seed, { dropLinks: drop })) });
      failures.push(...rises(`seed ${seed} remove links (total)`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      failures.push(...rises(`seed ${seed} remove links (links.score)`, steps.map((s) => ({ name: s.name, total: s.r.links.score ?? 0, text: sfmt(s.r) }))));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('orphaning a page never helps: totals never rise, and the step that orphans it costs at least 15', async () => {
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      // The contact page (2) is linked from home (0) and about (1). Without
      // the home link it is still reached through about; without both, nobody can reach it.
      const steps: { name: string; r: SiteResult }[] = [];
      for (const [name, dropPairs] of [['all links', []], ['no home -> contact', ['0:2']], ['orphaned', ['0:2', '1:2']]] as [string, string[]][]) {
        steps.push({ name, r: await gradeS(seed, name, buildSite(seed, { dropPairs })) });
      }
      failures.push(...rises(`seed ${seed} orphan a page`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      if (steps[1].r.links.orphaned.length !== 0) failures.push(`seed ${seed}: contact orphaned while about still links it: ${steps[1].r.links.orphaned}`);
      if (steps[2].r.links.orphaned.join() !== 'contact.html') failures.push(`seed ${seed}: contact not orphaned: ${steps[2].r.links.orphaned}`);
      const cost = steps[1].r.total - steps[2].r.total;
      if (cost < 15) failures.push(`seed ${seed}: orphaning costs only ${r1(cost)}: ${sfmt(steps[1].r)}  ->  ${sfmt(steps[2].r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('adding dead links never helps: totals never rise', async () => {
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (let dead = 0; dead <= 3; dead++) steps.push({ name: `+${dead} dead`, r: await gradeS(seed, `+${dead} dead links`, buildSite(seed, { deadLinks: dead })) });
      failures.push(...rises(`seed ${seed} add dead links`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      if (!(steps[3].r.links.deadLinkFactor < 1)) failures.push(`seed ${seed}: dead links not charged: ${sfmt(steps[3].r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // ---- the goal is the reference solution ----

  it('a goal graded against itself scores exactly 100, whatever is wrong with the goal', async () => {
    // A person expects a site to match itself perfectly: the goal's own dead
    // links, unreachable page and outside requests are the goal's choice.
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      for (const [name, o] of [
        ['dead links', { deadLinks: 2 }],
        ['an unlinked page', { unlinkedPage: true }],
        ['outside addresses', { outside: 2 }],
        ['all three', { deadLinks: 3, unlinkedPage: true, outside: 3 }],
      ] as [string, SiteOpts][]) {
        const files = buildSite(seed, o);
        const r = (await grader.gradeSite(files, files)).result;
        all.push({ label: `seed ${seed} self with ${name}`, r });
        if (r.total !== 100 || r.feedback.length !== 0) failures.push(`seed ${seed} goal with ${name}: ${sfmt(r)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // ---- what does not matter to a visitor does not change the score ----

  it('renaming every file, links updated, changes nothing', async () => {
    // A visitor never sees file names. Names of the same length keep every byte count the same.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      for (const [name, names, cssName] of [
        ['new names', ['xndex.html', 'zbout.html', 'yontact.html'], 'main.css'],
        ['each other\'s names', ['index.html', 'contact.html', 'about.html'], 'site.css'],
        ['names in capitals', ['index.html', 'About.html', 'Contact.html'], 'site.css'],
      ] as [string, string[], string][]) {
        const r = await gradeS(seed, name, buildSite(seed, { names, cssName }));
        if (r.total !== 100) failures.push(`seed ${seed} ${name}: ${sfmt(r)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('writing a link as ./x, /x, x#top or x?x=1, or reaching a folder page as docs/, counts the same', async () => {
    // These all lead to the same page in a browser.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      for (const linkForm of ['dot', 'root', 'hash', 'query'] as const) {
        const r = await gradeS(seed, `${linkForm} links`, buildSite(seed, { linkForm }));
        if (r.total !== 100 || r.links.found !== r.links.expected) failures.push(`seed ${seed} ${linkForm} links: ${sfmt(r)}`);
      }
      for (const linkForm of ['plain', 'root'] as const) {
        const files = buildSite(seed, { folder: true, linkForm });
        const r = (await grader.gradeSite(buildSite(seed, { folder: true }), files)).result;
        all.push({ label: `seed ${seed} folder ${linkForm}`, r });
        if (r.total !== 100 || r.links.found !== 6) failures.push(`seed ${seed} folder page, ${linkForm} links: ${sfmt(r)} found ${r.links.found}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('moving the shared CSS into each page changes works and looks by nothing', async () => {
    // The pages look the same; only size and load time may differ.
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      const r = await gradeS(seed, 'inline css', buildSite(seed, { inlineCss: true }));
      if (r.pillars.works !== 100 || r.pillars.looks !== 100) failures.push(`seed ${seed}: ${sfmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('the order of links in the markup does not change the links score', async () => {
    // The same links, shown in the same places: every goal link is still there.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const r = await gradeS(seed, 'reversed nav', buildSite(seed, { reverseNav: true }));
      if (r.links.found !== r.links.expected || r.pillars.looks !== 100) failures.push(`seed ${seed}: ${sfmt(r)} found ${r.links.found}/${r.links.expected}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // ---- what a visitor would call worse never scores better ----

  it('a page the goal does not have, linked or not, never raises the score', async () => {
    // Extra pages are extra weight, nothing more.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      for (const [base, o] of [['complete', {}], ['two links short', { dropLinks: 2 }], ['three dead links', { deadLinks: 3 }]] as [string, SiteOpts][]) {
        const plain = await gradeS(seed, base, buildSite(seed, o));
        for (const extraPage of ['linked', 'unlinked'] as const) {
          const r = await gradeS(seed, `${base} + ${extraPage} extra page`, buildSite(seed, { ...o, extraPage }));
          if (r.total > plain.total) failures.push(`seed ${seed} ${base}, ${extraPage} extra page: ${sfmt(plain)}  ->  ${sfmt(r)}`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('swapping the content of two pages costs points, but less than losing both', async () => {
    // The nav still says About but leads to the contact page's content.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const swapped = await gradeS(seed, 'swapped content', buildSite(seed, { swap: [1, 2] }));
      const lost = await gradeS(seed, 'home only', buildSite(seed, { pages: [0] }));
      if (!(swapped.total < 100 && swapped.total > lost.total)) failures.push(`seed ${seed}: swapped ${sfmt(swapped)}; home only ${sfmt(lost)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('a nav covered by an opaque box is not a way to reach a page', async () => {
    // A visitor cannot click a link that is hidden under something else.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const { result, candidate } = await grader.gradeSite(await goal(seed), buildSite(seed, { coverNav: true }));
      all.push({ label: `seed ${seed} covered nav`, r: result });
      const links = candidate!.page('index.html')!.linksTo;
      if (links.length !== 0) failures.push(`seed ${seed}: the home page still has ${links.join(', ')}: ${sfmt(result)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('each engineering measure only ever lowers the score as it grows', async () => {
    // More bytes, files, elements, CSS rules or outside requests is never better engineering.
    const failures: string[] = [];
    const seed = SITE_SEEDS[0];
    for (const [name, steps] of [
      // 200 KB per page: under the 300 KB a single file may be.
      ['bytes', [0, 5_000, 50_000, 200_000].map((n) => ({ padBytes: n }))],
      ['files', [0, 2, 8, 20].map((n) => ({ extraFiles: n }))],
      ['elements', [0, 200, 2_000, 8_000].map((n) => ({ hiddenElements: n }))],
      ['outside requests', [0, 1, 4, 12].map((n) => ({ outside: n }))],
    ] as [string, SiteOpts[]][]) {
      const rs: { name: string; r: SiteResult }[] = [];
      for (const o of steps) rs.push({ name: JSON.stringify(o), r: await gradeS(seed, `${name} ${JSON.stringify(o)}`, buildSite(seed, o)) });
      failures.push(...rises(`${name} (total)`, rs.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      failures.push(...rises(`${name} (engineering)`, rs.map((s) => ({ name: s.name, total: s.r.pillars.engineering, text: sfmt(s.r) }))));
      if (!(rs[rs.length - 1].r.pillars.engineering < rs[0].r.pillars.engineering)) failures.push(`${name}: the largest step costs nothing: ${sfmt(rs[rs.length - 1].r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('sites built to stress the arithmetic score 100 against themselves and stay in bounds against others', async () => {
    // One page, forty files, an empty stylesheet, no links, no index.html: none of these is a reason to break.
    const failures: string[] = [];
    const seed = SITE_SEEDS[2];
    for (const [name, o] of [
      ['one page', { pages: [0] }],
      ['forty files', { extraFiles: 36 }],
      ['an empty stylesheet', { emptySheet: true }],
      ['no links', { dropLinks: 6 }],
      ['home not index.html', { names: ['home.html', 'about.html', 'contact.html'] }],
    ] as [string, SiteOpts][]) {
      const files = buildSite(seed, o);
      const self = (await grader.gradeSite(files, files)).result;
      all.push({ label: `${name} self`, r: self });
      if (self.total !== 100) failures.push(`${name} against itself: ${sfmt(self)}`);
      const other = (await grader.gradeSite(files, buildSite(seed + 1))).result;
      all.push({ label: `${name} vs another site`, r: other });
      const back = (await grader.gradeSite(await goal(seed), files)).result;
      all.push({ label: `default goal vs ${name}`, r: back });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('building a page and forgetting to link it never scores below not building it', async () => {
    // Same links either way; the only difference is that one site has the page.
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const unlinked = await gradeS(seed, 'contact unlinked', buildSite(seed, { dropPairs: ['0:2', '1:2'] }));
      const missing = await gradeS(seed, 'contact missing', buildSite(seed, { dropPairs: ['0:2', '1:2'], pages: [0, 1] }));
      if (unlinked.total < missing.total) failures.push(`seed ${seed}: unlinked ${sfmt(unlinked)}  <  missing ${sfmt(missing)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('feedback: empty at 100 or more, otherwise at most eight lines, most costly first, none costing more than was lost', () => {
    // The player is told what cost them points, and nothing costs more than the points they did not get.
    const failures: string[] = [];
    for (const { label, r } of all) {
      const f = r.feedback;
      if (r.total >= 100 && f.length > 0) failures.push(`${label}: ${sfmt(r)} has feedback ${JSON.stringify(f)}`);
      if (r.total <= 99 && f.length === 0) failures.push(`${label}: ${sfmt(r)} has no feedback`);
      if (f.length > 8) failures.push(`${label}: ${f.length} lines`);
      for (let i = 0; i < f.length; i++) {
        if (!(f[i].points > 0 && f[i].points <= 100 - r.total + 0.1)) failures.push(`${label}: ${sfmt(r)}: "${f[i].message}" costs ${f[i].points}`);
        if (i > 0 && f[i].points > f[i - 1].points) failures.push(`${label}: feedback out of order: ${JSON.stringify(f)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('bounds: every site total within 0 to 120, engineering within -100 to 100', () => {
    expect(all.length).toBeGreaterThan(0);
    const failures = all
      .filter(({ r }) => !(Number.isFinite(r.total) && r.total >= 0 && r.total <= 120 && Number.isFinite(r.pillars.engineering) && r.pillars.engineering >= -100 && r.pillars.engineering <= 100))
      .map(({ label, r }) => `${label}: ${sfmt(r)}`);
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
