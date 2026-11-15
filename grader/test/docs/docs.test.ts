import { describe, expect, it } from 'vitest';
import { calibrate, challenges, loadChallenge } from '../../src/docs/calibrate';
import { DocRubricError, gradeDoc, parseMarkdown, rubricProblems, type DocGradeResult, type DocKind, type DocRubric } from '../../src/docs/index';

const values = (r: DocGradeResult) => Object.fromEntries(r.criteria.map((c) => [c.id, c.value]));

function timed(kind: DocKind, rubric: DocRubric, candidate: string): { result: DocGradeResult; ms: number } {
  const t = performance.now();
  const result = gradeDoc({ kind, rubric, candidate });
  return { result, ms: performance.now() - t };
}

const instructions = loadChallenge('agent-instructions');
const skill = loadChallenge('release-notes-skill');
const tools = loadChallenge('order-lookup-tools');

describe('document grader: references and determinism', () => {
  it('scores every challenge reference exactly 100', () => {
    for (const name of challenges()) {
      const { kind, rubric, reference } = loadChallenge(name);
      const r = gradeDoc({ kind, rubric, candidate: reference });
      expect(r.total, `${name}: ${JSON.stringify(r.feedback)}`).toBe(100);
      expect(r.feedback).toEqual([]);
      expect(r.error).toBeUndefined();
    }
  });

  it('gives the same result for the same input', () => {
    for (const c of [instructions, skill, tools]) {
      const a = gradeDoc({ kind: c.kind, rubric: c.rubric, candidate: c.reference.replace('npm', 'yarn') });
      const b = gradeDoc({ kind: c.kind, rubric: structuredClone(c.rubric), candidate: c.reference.replace('npm', 'yarn') });
      expect(b).toEqual(a);
    }
  });

  it('keeps feedback to at most eight lines, most costly first', () => {
    const r = gradeDoc({ kind: 'instructions', rubric: instructions.rubric, candidate: '# Notes\n\nTODO\n\n## Misc\n\nyarn install\n' });
    expect(r.feedback.length).toBeGreaterThan(0);
    expect(r.feedback.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < r.feedback.length; i++) expect(r.feedback[i - 1].points).toBeGreaterThanOrEqual(r.feedback[i].points);
  });

  it('scores an empty or unreadable document 0 with a reason', () => {
    expect(gradeDoc({ kind: 'readme', rubric: instructions.rubric, candidate: '   \n' })).toMatchObject({ total: 0, error: 'The document is empty.' });
    expect(gradeDoc({ kind: 'readme', rubric: instructions.rubric, candidate: '--- *** ---\n\n```\n```' }).error).toBe('The document has no readable text.');
    expect(gradeDoc({ kind: 'mcp-tools', rubric: tools.rubric, candidate: '[{"name": "x",}]' }).error).toMatch(/not valid JSON/);
    expect(gradeDoc({ kind: 'mcp-tools', rubric: tools.rubric, candidate: '{"servers": 3}' }).error).toMatch(/not a list of tool definitions/);
    expect(gradeDoc({ kind: 'readme', rubric: instructions.rubric, candidate: 42 as unknown as string })).toMatchObject({ total: 0, error: 'The document is not text.' });
  });
});

describe('document grader: each criterion moves only for its own fault', () => {
  const ref = instructions.reference;
  const swapSections = (text: string, a: string, b: string) => {
    const parts = text.split(/(?=^## )/m);
    const ia = parts.findIndex((p) => p.startsWith(`## ${a}`));
    const ib = parts.findIndex((p) => p.startsWith(`## ${b}`));
    [parts[ia], parts[ib]] = [parts[ib], parts[ia]];
    return parts.join('');
  };
  const faults: [string, string][] = [
    ['keyFacts', ref.replace('`npm run build`', '`npm run compile`')],
    ['completeness', ref.replace('Ask before adding a dependency', 'Check before adding a library')],
    ['structure', swapSections(ref, 'Setup', 'Commands')],
    ['validity', ref.replace('- CI deploys', '- See [Setup](#set-up) first.\n- CI deploys')],
    ['concision', ref.replace('- Keep each change small: one feature or fix at a time.', '- Keep each change small: one feature or fix at a time.\n- Keep each change small: one feature or fix at a time.')],
    ['cleanliness', ref.replace('the linter is the judge.', 'the linter is the judge (TBD).')],
    ['scannable', ref.replace(/^Trailpost is a small static website.*\n\n/m, '')],
    ['consistency', ref.replace('- `src/data/`: trail data as JSON.', '* `src/data/`: trail data as JSON.')],
  ];
  for (const [id, text] of faults) {
    it(`${id} drops and nothing else does`, () => {
      expect(text).not.toBe(ref);
      const r = gradeDoc({ kind: 'instructions', rubric: instructions.rubric, candidate: text });
      const v = values(r);
      expect(v[id], JSON.stringify(r.feedback)).toBeLessThan(1);
      for (const [other, value] of Object.entries(v)) if (other !== id) expect(value, `${other} moved: ${JSON.stringify(r.feedback)}`).toBe(1);
      expect(r.total).toBeLessThan(100);
      expect(r.feedback[0].message.length).toBeGreaterThan(10);
    });
  }

  it('front matter over its limit moves only validity (skill)', () => {
    const text = skill.reference.replace('since the last release.', 'since the last release, including every fix, feature and change in behaviour that users of the project will notice.');
    const r = gradeDoc({ kind: 'skill', rubric: skill.rubric, candidate: text });
    const v = values(r);
    expect(v.validity).toBeLessThan(1);
    for (const [other, value] of Object.entries(v)) if (other !== 'validity') expect(value, other).toBe(1);
    expect(r.feedback[0].message).toMatch(/^The description front-matter field is \d+ characters; the limit is 300\.$/);
  });

  it('a wrong parameter type moves only structure, and a schema without type "object" only validity (tools)', () => {
    const wrongType = tools.reference.replace('"limit": { "type": "integer"', '"limit": { "type": "string"');
    const r = gradeDoc({ kind: 'mcp-tools', rubric: tools.rubric, candidate: wrongType });
    const v = values(r);
    expect(v.structure).toBeLessThan(1);
    for (const [other, value] of Object.entries(v)) if (other !== 'structure') expect(value, other).toBe(1);
    expect(r.feedback.map((f) => f.message)).toContain('Tool `search_orders`: parameter `limit` should be an integer, it is a string.');

    const data = JSON.parse(tools.reference);
    delete data[0].inputSchema.type;
    const r2 = gradeDoc({ kind: 'mcp-tools', rubric: tools.rubric, candidate: JSON.stringify(data, null, 2) });
    const v2 = values(r2);
    expect(v2.validity).toBeLessThan(1);
    for (const [other, value] of Object.entries(v2)) if (other !== 'validity') expect(value, other).toBe(1);
  });
});

describe('document grader: key facts are monotonic', () => {
  const rubric: DocRubric = {
    sections: [{ name: 'Commands', aliases: [] }],
    keyFacts: ['npm ci', 'npm test', 'npm run lint', 'npm run build', 'npm run dev'].map((f, i) => ({ label: `command ${i + 1}`, anyOf: [f], inCode: true })),
  };
  const doc = (n: number) =>
    `# Tool\n\nA small tool for trail notes.\n\n## Commands\n\n` +
    rubric.keyFacts.map((f, i) => (i < n ? `- Run \`${f.anyOf[0]}\` when needed.` : `- Item ${i + 1} is described elsewhere.`)).join('\n') +
    '\n';

  it('adding a required fact never lowers the score', () => {
    let last = -1;
    for (let n = 0; n <= rubric.keyFacts.length; n++) {
      const t = gradeDoc({ kind: 'readme', rubric, candidate: doc(n) }).total;
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    expect(last).toBe(100);
  });

  it('removing a required fact never raises the score (instructions reference)', () => {
    const removals: [string, string][] = [
      ['`npm run build`', '`the build script`'],
      ['`src/components/`', '`components`'],
      ['`.env`', '`secrets`'],
      ['Node 20', 'a recent Node'],
      ['`npm run lint`', '`the linter`'],
    ];
    let text = instructions.reference;
    let last = gradeDoc({ kind: 'instructions', rubric: instructions.rubric, candidate: text }).total;
    for (const [from, to] of removals) {
      text = text.split(from).join(to);
      const t = gradeDoc({ kind: 'instructions', rubric: instructions.rubric, candidate: text }).total;
      expect(t, from).toBeLessThan(last + 1e-9);
      last = t;
    }
  });
});

describe('document grader: hostile input neither throws nor takes over a second', () => {
  const big = (instructions.reference + '\n').repeat(Math.ceil(1_048_576 / instructions.reference.length));
  const cases: [string, DocKind, string][] = [
    ['a 1 MB line', 'instructions', 'a'.repeat(1_048_576)],
    ['1 MB of real text', 'instructions', big],
    ['5,000 nested list levels', 'readme', Array.from({ length: 5000 }, (_, i) => ' '.repeat(i * 2) + '- x').join('\n')],
    ['100,000 quote markers', 'readme', '>'.repeat(100_000) + ' quote'],
    ['100,000 open brackets and links', 'readme', '['.repeat(100_000) + '](' + '('.repeat(100_000)],
    ['an unclosed fence over 50,000 lines', 'instructions', '# T\n\n```bash\n' + 'npm test\n'.repeat(50_000)],
    ['backtick soup', 'readme', '` `` ``` x'.repeat(100_000)],
    ['lone surrogates', 'readme', '\uD800# Title \uDFFF\n\n\uD83D text \uDC00 `npm ci` \uD800\n\n## Setup\n\n- \uDBFF'],
    ['front matter that never closes', 'skill', '---\nname: x\n' + 'description: "a\n'.repeat(20_000)],
    ['a very long heading and table', 'readme', '# ' + 'word '.repeat(200_000) + '\n\n| a | b |\n|---|---|\n' + '| x | y |\n'.repeat(20_000)],
    ['many headings', 'instructions', Array.from({ length: 30_000 }, (_, i) => `${'#'.repeat((i % 6) + 1)} Heading ${i}\n\nText ${i}.`).join('\n\n')],
  ];
  for (const [name, kind, text] of cases) {
    it(name, () => {
      const rubric = kind === 'skill' ? skill.rubric : instructions.rubric;
      const { result, ms } = timed(kind, rubric, text);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(ms).toBeLessThan(1000);
    });
  }

  const toolCases: [string, string][] = [
    ['JSON with cycles of $ref', JSON.stringify([{ name: 'get_order', description: 'Gets an order by its ID.', inputSchema: { type: 'object', $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } }, properties: { order_id: { $ref: '#/$defs/a' } }, required: ['order_id'] } }])],
    ['100,000 nested arrays', '['.repeat(100_000) + ']'.repeat(100_000)],
    ['100,000 nested objects', '{"a":'.repeat(100_000) + '1' + '}'.repeat(100_000)],
    ['1 MB of tools', JSON.stringify(Array.from({ length: 3000 }, (_, i) => ({ name: `tool_${i}`, description: 'Does a thing with an order. '.repeat(10), inputSchema: { type: 'object', properties: { order_id: { type: 'string' } } } })))],
    ['tools that are not objects', '[1, "two", null, [3], {"name": 5}]'],
  ];
  for (const [name, text] of toolCases) {
    it(name, () => {
      const { result, ms } = timed('mcp-tools', tools.rubric, text);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(ms).toBeLessThan(1000);
    });
  }
});

describe('document grader: malformed rubrics are the author\'s problem', () => {
  it('lists every problem in plain words', () => {
    const problems = rubricProblems('readme', {
      sections: [{ name: 'Setup' }, { name: 'Setup', aliases: [] }],
      keyFacts: [{ label: 'x', anyOf: [] }, { label: 'y', anyOf: ['a'], section: 'Nope' }],
      forbidden: [{ label: 'bad', pattern: '(' }, { label: 'all', pattern: '.*' }],
      limits: { maxWords: 10, minWords: 20, maxLines: 3 },
      order: ['Ghost'],
      keyfacts: [],
    });
    const text = problems.join('\n');
    for (const want of [
      /Section "Setup": "aliases" must be a list/,
      /Two sections are named "Setup"/,
      /Key fact "x": "anyOf" must list at least one spelling/,
      /Key fact "y": "section" "Nope" is not the name of a section/,
      /"\(" is not a valid regular expression/,
      /matches empty text/,
      /"minWords" is larger than "maxWords"/,
      /Unknown limit "maxLines"/,
      /"order" names "Ghost"/,
      /Unknown rubric field "keyfacts"/,
    ]) {
      expect(text).toMatch(want);
    }
  });

  it('throws DocRubricError (never a zero) from gradeDoc', () => {
    expect(() => gradeDoc({ kind: 'mcp-tools', rubric: { sections: [], keyFacts: [] }, candidate: '[]' })).toThrow(DocRubricError);
    expect(() => gradeDoc({ kind: 'mcp-tools', rubric: { sections: [], keyFacts: [] }, candidate: '[]' })).toThrow(/needs a non-empty "tools" list/);
    expect(() => gradeDoc({ kind: 'poem' as DocKind, rubric: instructions.rubric, candidate: 'x' })).toThrow(/"kind" must be one of/);
    expect(() => gradeDoc({ kind: 'readme', rubric: null as unknown as DocRubric, candidate: 'x' })).toThrow(/must be a JSON object/);
    expect(() => gradeDoc({ kind: 'readme', rubric: { sections: [], keyFacts: [] }, candidate: 'x' })).toThrow(/checks nothing/);
    expect(rubricProblems('instructions', instructions.rubric)).toEqual([]);
  });
});

describe('Markdown reader', () => {
  it('reads front matter, headings, lists, code and tables', () => {
    const doc = parseMarkdown('---\nname: x-y\ntags:\n  - a\n  - "b"\nbad: one: two\n---\n\nTitle\n=====\n\n- a\n* b\n\n```sh\nnpm ci\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(doc.frontMatter?.entries.get('name')).toBe('x-y');
    expect(doc.frontMatter?.entries.get('tags')).toEqual(['a', 'b']);
    expect(doc.frontMatter?.errors[0].message).toMatch(/contains ": "/);
    expect(doc.blocks[0]).toMatchObject({ kind: 'heading', level: 1, style: 'setext', text: 'Title' });
    expect(doc.blocks[1]).toMatchObject({ kind: 'list' });
    expect(doc.blocks[2]).toMatchObject({ kind: 'code', lang: 'sh', closed: false });
  });
});

describe('calibration', () => {
  it('agrees with the human bands for most attempts', () => {
    const rows = calibrate();
    const inside = rows.filter((r) => r.inside).length;
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(inside).toBeGreaterThanOrEqual(rows.length - 2);
    expect(Math.max(...rows.map((r) => r.off))).toBeLessThan(5);
  });
});
