/**
 * Scores an MCP server's tool list (JSON) against the rubric's tools: names,
 * descriptions, parameters, types and required flags, and whether each input
 * schema is a valid object schema. `$ref`s are never followed.
 */
import {
  asCode,
  cap,
  contains,
  draft,
  fillerIn,
  lower,
  mentions,
  norm,
  onlyRestates,
  placeholdersIn,
  secretsIn,
  short,
  squash,
  weightOf,
  wordCount,
  compilePattern,
  type Draft,
  type Issue,
} from './common';
import { JSON_TYPES } from './rubric';
import type { DocRubric, DocToolRule } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

interface Param {
  name: string;
  schema: unknown;
  types: string[];
  description: string;
}

interface Tool {
  index: number;
  entry: unknown;
  name: string | null;
  description: string;
  schema: unknown;
  params: Param[];
  required: string[];
}

interface Parsed {
  tools: Tool[];
  fenced: boolean;
  wrapped: 'list' | 'object' | 'single';
  raw: string;
  strings: string[];
  error?: string;
}

function typesOf(schema: unknown): string[] {
  if (!isObj(schema)) return [];
  const out = new Set<string>();
  const t = schema.type;
  if (typeof t === 'string') out.add(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
  if (!out.size && Array.isArray(schema.enum)) {
    for (const v of schema.enum.slice(0, 50)) out.add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v);
  }
  if (!out.size) {
    for (const key of ['anyOf', 'oneOf']) {
      const branches = schema[key];
      if (Array.isArray(branches)) for (const b of branches.slice(0, 20)) if (isObj(b) && typeof b.type === 'string') out.add(b.type);
    }
  }
  if (!out.size && typeof schema.$ref === 'string') out.add('$ref');
  return [...out];
}

/** Every string in a JSON value, walked without recursion and with caps. */
function stringsIn(value: unknown): string[] {
  const out: string[] = [];
  const stack: { v: unknown; d: number }[] = [{ v: value, d: 0 }];
  let visited = 0;
  while (stack.length && visited < 200000) {
    const { v, d } = stack.pop()!;
    visited++;
    if (typeof v === 'string') out.push(v);
    else if (d < 64 && Array.isArray(v)) for (let i = v.length - 1; i >= 0; i--) stack.push({ v: v[i], d: d + 1 });
    else if (d < 64 && isObj(v)) {
      const keys = Object.keys(v);
      for (let i = keys.length - 1; i >= 0; i--) stack.push({ v: v[keys[i]], d: d + 1 });
    }
  }
  return out;
}

export function parseTools(text: string): Parsed {
  let raw = text.trim();
  let fenced = false;
  if (raw.startsWith('```') || raw.startsWith('~~~')) {
    const nl = raw.indexOf('\n');
    raw = nl < 0 ? '' : raw.slice(nl + 1);
    raw = raw.replace(/\n?\s*(```|~~~)\s*$/, '');
    fenced = true;
  }
  const base: Parsed = { tools: [], fenced, wrapped: 'list', raw, strings: [] };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ...base, error: `The tool list is not valid JSON (${short(why, 80)}).` };
  }
  let entries: unknown[];
  if (Array.isArray(data)) entries = data;
  else if (isObj(data) && Array.isArray(data.tools)) {
    entries = data.tools;
    base.wrapped = 'object';
  } else if (isObj(data) && typeof data.name === 'string') {
    entries = [data];
    base.wrapped = 'single';
  } else return { ...base, error: 'The JSON is not a list of tool definitions (expected `[ { "name": ..., "inputSchema": ... } ]`).' };
  if (!entries.length) return { ...base, error: 'The tool list is empty.' };
  base.strings = stringsIn(data);
  base.tools = entries.slice(0, 500).map((entry, index) => {
    let e: unknown = entry;
    if (isObj(e) && isObj(e.function) && (e.type === 'function' || e.type === undefined)) e = e.function;
    const o = isObj(e) ? e : {};
    const schema = o.inputSchema ?? o.input_schema ?? o.parameters;
    const props = isObj(schema) && isObj(schema.properties) ? schema.properties : {};
    const params: Param[] = Object.keys(props)
      .slice(0, 200)
      .map((name) => {
        const s = props[name];
        return { name, schema: s, types: typesOf(s), description: isObj(s) && typeof s.description === 'string' ? s.description : '' };
      });
    const required = isObj(schema) && Array.isArray(schema.required) ? schema.required.filter((x): x is string => typeof x === 'string') : [];
    return {
      index,
      entry: e,
      name: typeof o.name === 'string' ? o.name : null,
      description: typeof o.description === 'string' ? o.description : '',
      schema,
      params,
      required,
    };
  });
  return base;
}

const flat = (s: string) => s.toLowerCase().replace(/[\s_.-]+/g, '');

/** Pairs each rubric tool with a candidate tool: exact name or alias first, then the same name spelt differently. */
function matchTools(rules: DocToolRule[], tools: Tool[]): Map<string, { tool: Tool; exact: boolean }> {
  const out = new Map<string, { tool: Tool; exact: boolean }>();
  const used = new Set<number>();
  for (const pass of [true, false]) {
    for (const rule of rules) {
      if (out.has(rule.name)) continue;
      const names = [rule.name, ...(rule.aliases ?? [])];
      const t = tools.find((c) => c.name !== null && !used.has(c.index) && (pass ? names.includes(c.name) : names.some((n) => flat(n) === flat(c.name!))));
      if (t) {
        out.set(rule.name, { tool: t, exact: pass });
        used.add(t.index);
      }
    }
  }
  return out;
}

const article = (t: string) => (/^[aeiou]/.test(t) ? 'an' : 'a');
const hasDescription = (t: Tool) => wordCount(t.description) >= 3 && !onlyRestates(t.description, (t.name ?? '').replace(/[_.-]+/g, ' '));

export function scoreTools(rubric: DocRubric, text: string): { drafts: Draft[]; words: number; error?: string } {
  const parsed = parseTools(text);
  if (parsed.error) return { drafts: [], words: 0, error: parsed.error };
  const rules = rubric.tools ?? [];
  const tools = parsed.tools;
  const matched = matchTools(rules, tools);
  const words = parsed.strings.reduce((n, s) => n + wordCount(s), 0);

  // ---- key facts: anywhere in the tool list's text, or in one tool's text.
  const toolText = (t: Tool) => [t.name ?? '', t.description, ...t.params.flatMap((p) => [p.name, p.description])].join('\n');
  const all = parsed.strings.join('\n');
  let kfGot = 0;
  let kfTotal = 0;
  const kfIssues: Issue[] = [];
  for (const fact of rubric.keyFacts) {
    const w = weightOf(fact.importance);
    kfTotal += w;
    const scope = fact.section ? matched.get(fact.section)?.tool : undefined;
    const hay = squash(scope ? toolText(scope) : all);
    let credit = 0;
    let wrongPlace = false;
    for (const alt of fact.anyOf) {
      const a = squash(alt);
      if (contains(hay, a)) credit = Math.max(credit, 1);
      else if (contains(lower(hay), lower(a))) credit = Math.max(credit, 0.75);
      else if (fact.section && contains(lower(squash(all)), lower(a))) {
        credit = Math.max(credit, 0.7);
        wrongPlace = true;
      }
    }
    kfGot += w * credit;
    if (credit === 0) {
      kfIssues.push({ message: fact.section ? `Tool ${asCode(fact.section)} is missing ${fact.label} ${asCode(fact.anyOf[0])}.` : `The tool list is missing ${fact.label} ${asCode(fact.anyOf[0])}.`, weight: w });
    } else if (credit < 1) {
      kfIssues.push({
        message: wrongPlace ? `${cap(fact.label)} ${asCode(fact.anyOf[0])} belongs in the description of tool ${asCode(fact.section!)}.` : `Write ${fact.label} exactly as ${asCode(fact.anyOf[0])}.`,
        weight: w * (1 - credit),
      });
    }
  }
  const keyFacts = rubric.keyFacts.length
    ? draft('keyFacts', 'Key facts', 'works', kfGot / kfTotal, kfIssues)
    : draft('keyFacts', 'Key facts', 'works', 1, [], ['Not checked: the rubric lists no key facts.'], false);

  // ---- completeness: each tool present, described, and its description covers what it must.
  let cGot = 0;
  const cIssues: Issue[] = [];
  for (const rule of rules) {
    const m = matched.get(rule.name);
    if (!m) {
      cIssues.push({ message: `The server has no ${asCode(rule.name)} tool.`, weight: 1 });
      continue;
    }
    const t = m.tool;
    const described = hasDescription(t);
    const must = rule.mustDescribe ?? [];
    let v = 0.3;
    const descWeight = must.length ? 0.4 : 0.7;
    if (described) v += 0.4;
    else if (!t.description.trim()) cIssues.push({ message: `Tool ${asCode(t.name!)} has no description; say what it does and when to use it.`, weight: descWeight });
    else cIssues.push({ message: `Tool ${asCode(t.name!)}'s description only repeats its name; say what it returns and when to use it.`, weight: descWeight });
    if (must.length) {
      const text = [t.description, ...t.params.map((p) => p.description)].join(' ');
      const missing = must.filter((x) => !mentions(text, x));
      v += 0.3 * (1 - missing.length / must.length);
      for (const x of missing) cIssues.push({ message: `Tool ${asCode(t.name!)}'s description should mention "${x}".`, weight: 0.3 / must.length });
    } else if (described) v += 0.3;
    cGot += v;
  }
  const completeness = draft('completeness', 'Completeness', 'works', rules.length ? cGot / rules.length : 1, cIssues);

  // ---- structure: every tool and parameter, with the right type and required flag.
  let sGot = 0;
  const sIssues: Issue[] = [];
  for (const rule of rules) {
    const m = matched.get(rule.name);
    if (!m) {
      sIssues.push({ message: `The server has no ${asCode(rule.name)} tool.`, weight: 1 });
      continue;
    }
    const t = m.tool;
    const tn = asCode(t.name!);
    // A name is the tool's API: a caller asking for `get_order` does not find `getOrder`.
    const nameCredit = m.exact ? 1 : 0.7;
    if (!m.exact) sIssues.push({ message: `Tool ${tn} should be named ${asCode(rule.name)}.`, weight: 0.3 });
    // A tool is only as callable as its worst parameter, so parameter scores multiply.
    // Each is 0.2 present (0.1 if misnamed), 0.55 right type, 0.25 right required flag;
    // an optional parameter that is wrong hurts half as much as a required one.
    let paramScore = 1;
    for (const p of rule.params) {
      const share = 0.85 * (p.required ? 1 : 0.5);
      const cand = t.params.find((c) => c.name === p.name) ?? t.params.find((c) => flat(c.name) === flat(p.name));
      let s = 0;
      if (!cand) {
        sIssues.push({ message: `Tool ${tn} is missing the parameter ${asCode(p.name)} (${p.type}${p.required ? ', required' : ''}).`, weight: share });
      } else {
        s = cand.name === p.name ? 0.2 : 0.1;
        if (cand.name !== p.name) sIssues.push({ message: `Tool ${tn}: parameter ${asCode(cand.name)} should be named ${asCode(p.name)}.`, weight: share * 0.1 });
        const typeOk = cand.types.includes(p.type) || (p.type === 'number' && cand.types.includes('integer'));
        const halfType = p.type === 'integer' && cand.types.includes('number');
        if (typeOk) s += 0.55;
        else {
          if (halfType) s += 0.275;
          const got = cand.types.length ? cand.types.join(' or ') : 'untyped';
          sIssues.push({ message: `Tool ${tn}: parameter ${asCode(p.name)} should be ${article(p.type)} ${p.type}, it is ${got === 'untyped' ? 'untyped' : `${article(got)} ${got}`}.`, weight: share * (halfType ? 0.275 : 0.55) });
        }
        const isReq = t.required.includes(cand.name);
        if (isReq === p.required) s += 0.25;
        else sIssues.push({ message: p.required ? `Tool ${tn}: parameter ${asCode(p.name)} should be required.` : `Tool ${tn}: parameter ${asCode(p.name)} should be optional; it is marked required.`, weight: share * 0.25 });
      }
      paramScore *= p.required ? s : 0.5 + 0.5 * s;
    }
    let v = nameCredit * (0.15 + 0.85 * paramScore);
    const known = new Set(rule.params.flatMap((p) => [p.name, flat(p.name)]));
    for (const r of t.required) {
      if (known.has(r) || known.has(flat(r))) continue;
      v -= 0.1;
      sIssues.push({ message: `Tool ${tn}: parameter ${asCode(r)} is required but the challenge does not ask for it; callers will not know to send it.`, weight: 0.1 });
    }
    sGot += Math.max(0, v);
  }
  const structure = draft('structure', 'Structure', 'works', rules.length ? sGot / rules.length : 1, sIssues);

  // ---- validity: well-formed names, unique, valid object schemas.
  const vIssues: Issue[] = [];
  let vSum = 0;
  const seenNames = new Map<string, number>();
  for (const t of tools) {
    let fails = 0;
    const fail = (message: string) => {
      fails++;
      vIssues.push({ message, weight: 0.25 / tools.length });
    };
    if (!isObj(t.entry)) {
      vIssues.push({ message: `Entry ${t.index + 1} in the list is not a tool definition (an object with a name).`, weight: 1 / tools.length });
      continue;
    }
    const tn = t.name ? asCode(t.name) : `entry ${t.index + 1}`;
    if (t.name === null) fail(`Entry ${t.index + 1} has no name.`);
    else {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(t.name)) fail(`Tool name ${asCode(short(t.name, 40))} is not well formed; use letters, digits, \`_\` or \`-\` (at most 64).`);
      const seen = seenNames.get(t.name) ?? 0;
      if (seen === 1) fail(`Two tools are named ${tn}; tool names must be unique.`);
      seenNames.set(t.name, seen + 1);
    }
    const s = t.schema;
    if (!isObj(s)) {
      fail(`Tool ${tn} has no input schema; add \`inputSchema\` with \`type: "object"\` and \`properties\`.`);
      fails += 1;
    } else {
      if (s.type !== 'object') fail(`Tool ${tn}: the input schema's type should be "object", it is ${JSON.stringify(s.type) ?? 'missing'}.`);
      if (s.properties !== undefined && !isObj(s.properties)) fail(`Tool ${tn}: \`properties\` should be an object.`);
      let untyped = 0;
      for (const p of t.params) {
        if (!p.types.length) {
          if (++untyped <= 2) fail(`Tool ${tn}: parameter ${asCode(p.name)} has no type.`);
        } else {
          const bad = p.types.find((x) => x !== '$ref' && !JSON_TYPES.includes(x));
          if (bad) fail(`Tool ${tn}: parameter ${asCode(p.name)} has type "${short(bad, 20)}", which is not a JSON Schema type.`);
        }
      }
      if (s.required !== undefined) {
        if (!Array.isArray(s.required) || s.required.some((x) => typeof x !== 'string')) fail(`Tool ${tn}: \`required\` should be a list of parameter names.`);
        else {
          const names = new Set(t.params.map((p) => p.name));
          const ghost = t.required.filter((r) => !names.has(r));
          for (const g of ghost.slice(0, 2)) fail(`Tool ${tn}: \`required\` names ${asCode(g)}, which is not a property.`);
        }
      }
    }
    vSum += Math.max(0, 1 - 0.25 * fails);
  }
  let validityValue = vSum / tools.length;
  if (parsed.fenced) {
    validityValue -= 0.1;
    vIssues.push({ message: 'Return only the JSON; the ``` fence around it is not part of a tool list.', weight: 0.1 });
  }
  if (parsed.wrapped === 'single') {
    validityValue -= 0.25;
    vIssues.push({ message: 'The JSON is a single tool; wrap the tools in a list `[ ... ]`.', weight: 0.25 });
  }
  const validity = draft('validity', 'Validity', 'engineering', validityValue, vIssues);

  // ---- concision
  const nIssues: Issue[] = [];
  let nValue = 1;
  const max = rubric.limits?.maxWords;
  const min = rubric.limits?.minWords;
  if (max && words > max) {
    const b = Math.max(0, 1 - (0.7 * (words - max)) / max);
    nValue = b;
    nIssues.push({ message: `The descriptions total ${words} words; the budget is ${max}. Say what each tool does once.`, weight: 1 - b });
  } else if (min && words < min) {
    nValue = words / min;
    nIssues.push({ message: `The descriptions total ${words} words; they should be at least ${min}.`, weight: 1 - nValue });
  }
  const descSeen = new Map<string, number>();
  for (const t of tools) {
    const key = norm(t.description);
    if (key.split(' ').length < 3) continue;
    descSeen.set(key, (descSeen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of descSeen) {
    if (count < 2) continue;
    nValue -= 0.15 * (count - 1);
    nIssues.push({ message: `${count} tools share the description "${short(key, 40)}"; say what each one does.`, weight: 0.15 * (count - 1) });
  }
  const fillers = new Set(parsed.strings.flatMap((s) => fillerIn(s)));
  for (const f of [...fillers].slice(0, 3)) {
    nValue -= 0.03;
    nIssues.push({ message: `Cut filler such as "${f}".`, weight: 0.03 });
  }
  const concision = draft('concision', 'Concision', 'engineering', nValue, nIssues, [`${words} words of text.`]);

  // ---- cleanliness
  const kIssues: Issue[] = [];
  let kValue = 1;
  const addK = (message: string, weight: number) => {
    kValue -= weight;
    kIssues.push({ message, weight });
  };
  let ph = 0;
  for (const s of parsed.strings) for (const what of placeholdersIn(s)) if (++ph <= 4) addK(`Remove the placeholder "${what}" ("${short(s, 40)}").`, 0.25);
  const lines = parsed.raw.split('\n');
  for (const f of rubric.forbidden ?? []) {
    const re = compilePattern(f.pattern);
    if (!re) continue;
    const hits = lines.map((l, i) => (re.test(l.length > 10000 ? l.slice(0, 10000) : l) ? i + 1 : 0)).filter(Boolean).slice(0, 4);
    if (hits.length) addK(`Remove ${f.label} (line ${hits.join(', ')}): the challenge forbids it.`, 0.4 + 0.1 * (hits.length - 1));
  }
  let secrets = 0;
  lines.forEach((l, i) => {
    if (secrets >= 3) return;
    const found = secretsIn(l);
    if (found.length) {
      secrets++;
      addK(`Line ${i + 1} looks like it holds a secret (${found[0]}); never put credentials in a tool list.`, 0.5);
    }
  });
  const cleanliness = draft('cleanliness', 'Cleanliness', 'engineering', kValue, kIssues);

  // ---- scannable: tools and parameters described, descriptions not walls of text.
  const gIssues: Issue[] = [];
  const named = tools.filter((t) => isObj(t.entry));
  const toolsDescribed = named.filter(hasDescription).length / Math.max(1, named.length);
  const allParams = named.flatMap((t) => t.params.map((p) => ({ t, p })));
  const paramsDescribed = allParams.length ? allParams.filter(({ p }) => wordCount(p.description) >= 2).length / allParams.length : 1;
  for (const t of named) {
    const missing = t.params.filter((p) => wordCount(p.description) < 2).map((p) => asCode(p.name));
    if (missing.length && allParams.length) {
      gIssues.push({ message: `Tool ${t.name ? asCode(t.name) : `entry ${t.index + 1}`}: parameter${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'have' : 'has'} no description.`, weight: (0.5 * missing.length) / allParams.length });
    }
    if (!hasDescription(t)) gIssues.push({ message: `Tool ${t.name ? asCode(t.name) : `entry ${t.index + 1}`} needs a description a model can read.`, weight: 0.5 / named.length });
  }
  let gValue = 0.5 * toolsDescribed + 0.5 * paramsDescribed;
  for (const t of named) {
    const n = wordCount(t.description);
    if (n > 80) {
      gValue -= 0.1;
      gIssues.push({ message: `Tool ${asCode(t.name ?? '?')}'s description is ${n} words; keep it to what the tool does and when to use it.`, weight: 0.1 });
    }
  }
  const scannable = draft('scannable', 'Scannable', 'looks', gValue, gIssues);

  // ---- consistency: one naming style.
  const style = (n: string) => (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(n) ? 'snake_case' : /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(n) ? 'camelCase' : /^[a-z0-9]+(-[a-z0-9]+)+$/.test(n) ? 'kebab-case' : /^[A-Z][a-zA-Z0-9]+$/.test(n) && /[a-z]/.test(n) ? 'PascalCase' : '');
  const oIssues: Issue[] = [];
  let oValue = 1;
  const toolStyles = new Set(named.map((t) => style(t.name ?? '')).filter(Boolean));
  if (toolStyles.size > 1) {
    oValue -= 0.3;
    oIssues.push({ message: `Tool names mix ${[...toolStyles].join(' and ')}; use one style.`, weight: 0.3 });
  }
  const paramStyles = new Set(allParams.map(({ p }) => style(p.name)).filter(Boolean));
  if (paramStyles.size > 1) {
    oValue -= 0.2;
    oIssues.push({ message: `Parameter names mix ${[...paramStyles].join(' and ')}; use one style.`, weight: 0.2 });
  }
  const consistency = draft('consistency', 'Consistency', 'looks', oValue, oIssues);

  return { drafts: [keyFacts, completeness, structure, validity, concision, cleanliness, scannable, consistency], words };
}
