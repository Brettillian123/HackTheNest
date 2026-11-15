import { Parser, type DefaultTreeAdapterMap, type ParserError } from 'parse5';
import { REPEATED_STYLE_MIN } from './config';
import type { SourceFacts } from './types';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
/** Stop walking after this many nodes, so a huge page cannot stall the grader. */
const NODE_CAP = 200_000;
const END_TAG_CAP = 200_000;
const EXAMPLES = 5;

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
  // Obsolete but still void in the parser.
  'basefont', 'bgsound', 'frame', 'keygen', 'param',
]);

/** Elements whose end tag the HTML standard lets you leave out. */
const OPTIONAL_END = new Set([
  'html', 'head', 'body', 'p', 'li', 'dt', 'dd', 'option', 'optgroup', 'tr', 'td', 'th',
  'thead', 'tbody', 'tfoot', 'colgroup', 'caption', 'rb', 'rt', 'rp', 'rtc',
]);

/** End tags never counted as stray: the parser handles these specially and they are harmless. */
const IGNORED_END = new Set(['html', 'body', 'head']);

const OBSOLETE_TAGS = new Set([
  'font', 'center', 'marquee', 'blink', 'big', 'strike', 'tt', 'acronym', 'applet', 'basefont',
  'bgsound', 'dir', 'frame', 'frameset', 'noframes', 'nobr', 'spacer', 'xmp', 'listing', 'plaintext',
  'isindex', 'multicol',
]);

/** Presentational attributes the HTML standard made obsolete. `null` means on any HTML element. */
const OBSOLETE_ATTRS: Record<string, Set<string> | null> = {
  bgcolor: null,
  align: null,
  valign: null,
  background: new Set(['body', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']),
  cellpadding: new Set(['table']),
  cellspacing: new Set(['table']),
  hspace: new Set(['img', 'object', 'iframe']),
  vspace: new Set(['img', 'object', 'iframe']),
  nowrap: new Set(['td', 'th']),
  clear: new Set(['br']),
  text: new Set(['body']),
  link: new Set(['body']),
  vlink: new Set(['body']),
  alink: new Set(['body']),
};

/**
 * Parse error kinds. parse5 reports tokenizer errors; unclosed and stray tags
 * are found by this module itself from source locations, because parse5 does
 * not report them.
 */
const ERROR_KIND: Record<string, string | null> = {
  'non-void-html-element-start-tag-with-trailing-solidus': 'self-closing-tag',
  'duplicate-attribute': 'attribute-syntax',
  'missing-whitespace-between-attributes': 'attribute-syntax',
  'unexpected-character-in-attribute-name': 'attribute-syntax',
  'unexpected-equals-sign-before-attribute-name': 'attribute-syntax',
  'unexpected-character-in-unquoted-attribute-value': 'attribute-syntax',
  'missing-attribute-value': 'attribute-syntax',
  'unexpected-solidus-in-tag': 'attribute-syntax',
  'unknown-named-character-reference': 'character-reference',
  'missing-semicolon-after-character-reference': 'character-reference',
  'absence-of-digits-in-numeric-character-reference': 'character-reference',
  'null-character-reference': 'character-reference',
  'surrogate-character-reference': 'character-reference',
  'character-reference-outside-unicode-range': 'character-reference',
  'control-character-reference': 'character-reference',
  'noncharacter-character-reference': 'character-reference',
  'incorrectly-opened-comment': 'broken-comment',
  'nested-comment': 'broken-comment',
  'abrupt-closing-of-empty-comment': 'broken-comment',
  'eof-in-comment': 'broken-comment',
  'incorrectly-closed-comment': 'broken-comment',
  'cdata-in-html-content': 'broken-comment',
  'eof-in-cdata': 'broken-comment',
  // Covered by the no-doctype rule.
  'missing-doctype': null,
  'non-conforming-doctype': null,
  // Covered by this module's own unclosed / stray tag counts.
  'open-elements-left-after-eof': null,
  'end-tag-without-matching-open-element': null,
  'closing-of-element-with-open-child-elements': null,
  // Invisible characters: noise, not a code-quality signal.
  'control-character-in-input-stream': null,
  'noncharacter-in-input-stream': null,
  'surrogate-in-input-stream': null,
  'unexpected-null-character': null,
};

interface Loc {
  startOffset: number;
  endOffset: number;
}
interface ElLoc extends Loc {
  startTag?: Loc;
  endTag?: Loc;
}
interface TreeNode {
  nodeName: string;
  tagName?: string;
  namespaceURI?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: TreeNode[];
  content?: TreeNode;
  value?: string;
  mode?: string;
  sourceCodeLocation?: ElLoc | null;
}

class RecordingParser extends Parser<DefaultTreeAdapterMap> {
  endTags: { name: string; offset: number }[] = [];
  override onEndTag(token: Parameters<Parser<DefaultTreeAdapterMap>['onEndTag']>[0]): void {
    if (token.location && this.endTags.length < END_TAG_CAP) {
      this.endTags.push({ name: token.tagName, offset: token.location.startOffset });
    }
    super.onEndTag(token);
  }
}

function short(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Check what can be told from the HTML text alone. */
export function checkSource(html: string): SourceFacts {
  const parseErrors: Record<string, number> = {};
  const bump = (kind: string, n = 1) => {
    parseErrors[kind] = (parseErrors[kind] ?? 0) + n;
  };

  const parser = new RecordingParser({
    sourceCodeLocationInfo: true,
    onParseError: (err: ParserError) => {
      const kind = err.code in ERROR_KIND ? ERROR_KIND[err.code] : 'other-syntax';
      if (kind) bump(kind);
    },
  });
  parser.tokenizer.write(html, true);
  const doc = parser.document as unknown as TreeNode;

  let hasDoctype = false;
  for (const child of doc.childNodes ?? []) if (child.nodeName === '#documentType') hasDoctype = true;
  if (doc.mode === 'quirks') hasDoctype = false;

  const matchedEnds = new Set<number>();
  const idCounts = new Map<string, number>();
  const styleCounts = new Map<string, number>();
  const obsoleteTagExamples: string[] = [];
  const obsoleteAttrExamples: string[] = [];
  let obsoleteTags = 0;
  let obsoleteAttrs = 0;
  let unclosed = 0;
  let bodyElements = 0;
  let inlineStyled = 0;
  let css = '';
  let truncated = false;

  // Iterative walk. `inBody` and `inTemplate` travel with each node.
  const stack: { node: TreeNode; inBody: boolean; inTemplate: boolean }[] = [
    { node: doc, inBody: false, inTemplate: false },
  ];
  let visited = 0;
  while (stack.length > 0) {
    if (++visited > NODE_CAP) {
      truncated = true;
      break;
    }
    const { node, inBody, inTemplate } = stack.pop()!;
    const tag = node.tagName;
    let childInBody = inBody;
    if (tag !== undefined) {
      const isHtml = node.namespaceURI === HTML_NS;
      const loc = node.sourceCodeLocation;
      if (loc?.endTag) matchedEnds.add(loc.endTag.startOffset);
      if (isHtml && loc?.startTag && !loc.endTag && !VOID.has(tag) && !OPTIONAL_END.has(tag)) {
        // `<div/>` is reported as a self-closing error already; don't count it twice.
        const st = loc.startTag;
        const selfClosed = sourceSlice(st.endOffset - 2, st.endOffset) === '/>';
        if (!selfClosed) unclosed++;
      }
      if (tag === 'body') childInBody = true;
      if (inBody) bodyElements++;

      if (isHtml && OBSOLETE_TAGS.has(tag)) {
        obsoleteTags++;
        if (!obsoleteTagExamples.includes(tag) && obsoleteTagExamples.length < EXAMPLES) obsoleteTagExamples.push(tag);
      }
      for (const a of node.attrs ?? []) {
        const name = a.name.toLowerCase();
        if (isHtml && Object.hasOwn(OBSOLETE_ATTRS, name)) {
          const on = OBSOLETE_ATTRS[name];
          if (on === null || on.has(tag)) {
            obsoleteAttrs++;
            if (!obsoleteAttrExamples.includes(name) && obsoleteAttrExamples.length < EXAMPLES) obsoleteAttrExamples.push(name);
          }
        }
        if (name === 'id' && !inTemplate && a.value !== '') {
          idCounts.set(a.value, (idCounts.get(a.value) ?? 0) + 1);
        }
        if (name === 'style') {
          const norm = a.value.toLowerCase().replace(/\s+/g, '').replace(/;+$/, '');
          if (norm !== '') {
            css += `\n${a.value};`;
            if (inBody) inlineStyled++;
            if (inBody && (styleCounts.has(norm) || styleCounts.size < 5000)) {
              styleCounts.set(norm, (styleCounts.get(norm) ?? 0) + 1);
            }
          }
        }
      }
      if (tag === 'style' && isHtml && !inTemplate) {
        for (const c of node.childNodes ?? []) if (c.nodeName === '#text' && c.value) css += `\n${c.value}`;
      }
    }
    const children = node.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], inBody: childInBody, inTemplate });
    }
    if (node.content) stack.push({ node: node.content, inBody: childInBody, inTemplate: true });
  }

  function sourceSlice(a: number, b: number): string {
    return html.slice(Math.max(0, a), b);
  }

  if (unclosed > 0) bump('unclosed-tag', unclosed);
  let stray = 0;
  for (const end of parser.endTags) {
    if (!IGNORED_END.has(end.name) && !matchedEnds.has(end.offset)) stray++;
  }
  if (stray > 0) bump('stray-end-tag', stray);

  let duplicateCount = 0;
  const duplicateExamples: string[] = [];
  for (const [id, n] of idCounts) {
    if (n > 1) {
      duplicateCount += n - 1;
      if (duplicateExamples.length < EXAMPLES) duplicateExamples.push(short(id));
    }
  }

  let extraCopies = 0;
  let example = '';
  let exampleCount = 0;
  for (const [style, n] of styleCounts) {
    if (n >= REPEATED_STYLE_MIN) {
      extraCopies += n - 1;
      if (n > exampleCount) {
        exampleCount = n;
        example = short(style);
      }
    }
  }

  const cleanCss = stripComments(css);
  const importantCount = (cleanCss.match(/!\s*important/gi) ?? []).length;
  // Rough: "name: value" runs. Selector pseudo-classes like a:hover can be
  // over-counted, which only makes the !important share look smaller.
  const declarationCount = (cleanCss.match(/[a-z-]+\s*:[^;{}]+/gi) ?? []).length;

  return {
    hasDoctype,
    parseErrors,
    duplicateIds: { count: duplicateCount, examples: duplicateExamples },
    obsoleteTags: { count: obsoleteTags, examples: obsoleteTagExamples },
    obsoleteAttributes: { count: obsoleteAttrs, examples: obsoleteAttrExamples },
    bodyElements,
    inlineStyled,
    repeatedInlineStyle: { extraCopies, example },
    importantCount,
    declarationCount,
    truncated,
  };
}
