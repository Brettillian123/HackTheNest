import {
  IMPORTANT_MIN,
  IMPORTANT_SHARE,
  INLINE_STYLE_MIN,
  INLINE_STYLE_SHARE,
  REPEATED_STYLE_MIN,
} from './config';
import type { Issue, SourceFacts } from './types';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

function examples(list: string[], wrap = (s: string) => s): string {
  return list.length > 0 ? ` (${list.slice(0, 3).map(wrap).join(', ')})` : '';
}

/** Clean-code problems on one page, unsorted and not yet compared with the goal. */
export function validityIssues(src: SourceFacts): Issue[] {
  const issues: Issue[] = [];
  const add = (rule: string, count: number, message: string) => {
    if (count > 0) issues.push({ rule, count, message });
  };
  const pe = (kind: string) => src.parseErrors[kind] ?? 0;

  if (!src.hasDoctype) {
    add('no-doctype', 1, 'The page does not start with <!DOCTYPE html>, so browsers draw it in old "quirks" mode.');
  }

  let n = pe('unclosed-tag');
  add('unclosed-tag', n, `${plural(n, 'A tag is', 'tags are')} never closed, or closed in the wrong order.`);
  n = pe('stray-end-tag');
  add('stray-end-tag', n, `${plural(n, 'A closing tag has', 'closing tags have')} no matching opening tag.`);
  n = pe('self-closing-tag');
  add(
    'self-closing-tag',
    n,
    `${plural(n, 'A tag is', 'tags are')} written as self-closing (like <div/>) but cannot be: HTML ignores the slash and leaves it open.`,
  );
  n = pe('attribute-syntax');
  add(
    'attribute-syntax',
    n,
    `${plural(n, 'A tag has', 'tags have')} broken attributes (repeated, missing a space or a value, or stray characters).`,
  );
  n = pe('character-reference');
  add(
    'character-reference',
    n,
    `${plural(n, 'A special character is', 'special characters are')} written wrongly: entities like &amp;amp; need their semicolon.`,
  );
  n = pe('broken-comment');
  add('broken-comment', n, `${plural(n, 'A comment is', 'comments are')} not written as <!-- ... -->.`);
  n = pe('other-syntax');
  add('other-syntax', n, `The HTML has ${plural(n, 'another syntax error', 'other syntax errors')}.`);

  n = src.duplicateIds.count;
  add(
    'duplicate-id',
    n,
    `${plural(n, 'An id is', 'ids are')} used on more than one element; each id must be unique${examples(src.duplicateIds.examples, (s) => `"${s}"`)}.`,
  );

  n = src.obsoleteTags.count;
  add(
    'obsolete-tag',
    n,
    `${plural(n, 'An outdated tag is', 'outdated tags are')} used for looks; use CSS instead${examples(src.obsoleteTags.examples, (s) => `<${s}>`)}.`,
  );
  n = src.obsoleteAttributes.count;
  add(
    'obsolete-attribute',
    n,
    `${plural(n, 'An outdated styling attribute is', 'outdated styling attributes are')} used; use CSS instead${examples(src.obsoleteAttributes.examples)}.`,
  );

  if (src.inlineStyled >= INLINE_STYLE_MIN && src.inlineStyled >= INLINE_STYLE_SHARE * src.bodyElements) {
    n = src.inlineStyled;
    const pct = Math.round((100 * n) / Math.max(1, src.bodyElements));
    add(
      'inline-styles',
      n,
      `${n} elements (${pct}% of the page) are styled one by one with style="..." instead of shared CSS rules.`,
    );
  }
  n = src.repeatedInlineStyle.extraCopies;
  if (n > 0) {
    add(
      'repeated-inline-style',
      n,
      `The same inline style is copied out ${n} extra times instead of being written once as a class (a style repeated ${REPEATED_STYLE_MIN}+ times, e.g. "${src.repeatedInlineStyle.example}").`,
    );
  }

  if (src.importantCount >= IMPORTANT_MIN && src.importantCount >= IMPORTANT_SHARE * src.declarationCount) {
    n = src.importantCount;
    add('heavy-important', n, `!important is used ${n} times; fix the CSS order or selectors instead of forcing styles.`);
  }

  return issues;
}
