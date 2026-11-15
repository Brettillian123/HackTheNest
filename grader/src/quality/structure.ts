import type { Issue, SourceFacts } from './types';

/**
 * Structure rules, judged against what the goal does: a goal that does not
 * do a thing does not demand it, so a page graded against itself is never
 * charged. Each returns how many times the submission falls short of the
 * goal, as an issue the goal itself never has.
 *
 *   accessibility: page parts marked (header, nav, main, footer), lists as
 *                  lists, table header cells, real buttons, field types and
 *                  required marks, the viewport setting
 *   clean code:    the character set
 */
export function structureIssues(candidate: SourceFacts, goal: SourceFacts): { accessibility: Issue[]; validity: Issue[] } {
  const accessibility: Issue[] = [];
  const validity: Issue[] = [];
  const c = candidate.structure;
  const g = goal.structure;
  if (!c || !g) return { accessibility, validity };
  const add = (list: Issue[], rule: string, count: number, message: string) => {
    if (count > 0) list.push({ rule, count, message });
  };

  const missing = (['header', 'nav', 'main', 'footer'] as const).filter((k) => g.landmarks[k] > 0 && c.landmarks[k] === 0);
  add(
    accessibility,
    'page-landmarks',
    missing.length,
    `The page has no ${missing.map((k) => `<${k}>`).join(', ')} where the goal has ${missing.length === 1 ? 'one' : 'them'}: mark the page's parts so screen readers can jump between them.`,
  );

  const lists = Math.max(0, g.lists - c.lists);
  add(
    accessibility,
    'list-markup',
    lists,
    `${lists === 1 ? 'A list the goal marks up as a list is' : `${lists} lists the goal marks up as lists are`} not ${lists === 1 ? 'one' : 'lists'} here: use <ul> or <ol> with <li> items, not lines of text or boxes.`,
  );

  if (g.tables > g.tablesWithoutHeaders) {
    const n = Math.max(0, c.tablesWithoutHeaders - g.tablesWithoutHeaders);
    add(accessibility, 'table-headers', n, `${n === 1 ? 'A table has' : `${n} tables have`} no header cells: mark the column or row titles with <th>.`);
  }

  if (g.buttons > 0) {
    const n = Math.min(Math.max(0, g.buttons - c.buttons), c.fakeButtons);
    add(
      accessibility,
      'real-buttons',
      n,
      `${n === 1 ? 'A button is' : `${n} buttons are`} drawn as plain boxes where the goal has a real <button>: a keyboard or screen reader cannot use a box.`,
    );
  }

  let typed = 0;
  const types: string[] = [];
  for (const [type, n] of Object.entries(g.fieldTypes)) {
    const short = Math.max(0, n - (c.fieldTypes[type] ?? 0));
    if (short > 0) {
      typed += short;
      types.push(type);
    }
  }
  typed = Math.min(typed, c.plainFields);
  add(
    accessibility,
    'field-types',
    typed,
    `${typed === 1 ? 'A form field is a plain text box' : `${typed} form fields are plain text boxes`} where the goal asks for ${types.map((t) => `type="${t}"`).join(', ')}: the right type brings the right keyboard and checks.`,
  );

  if (g.required > 0) {
    const n = Math.min(Math.max(0, g.required - c.required), c.fields);
    add(accessibility, 'field-required', n, `${n === 1 ? 'A form field the goal requires is' : `${n} form fields the goal requires are`} not marked required: add the required attribute.`);
  }

  if (g.viewport && !c.viewport) {
    add(accessibility, 'viewport', 1, 'The page has no <meta name="viewport">: phones draw it zoomed out, too small to read.');
  }
  if (g.charset && !c.charset) {
    add(validity, 'charset', 1, 'The page does not say its character set: add <meta charset="utf-8"> first in the <head>, or accents and symbols may show as junk.');
  }
  return { accessibility, validity };
}
