/**
 * Code size for the engineering score: what the code does, not how it is
 * written down. Comments are removed and every run of whitespace becomes one
 * space, so comments, blank lines and indentation cost nothing. Identifier
 * length still counts (telling a meaningful name from padding is not
 * something a deterministic count can do fairly); that is accepted.
 *
 * Strings, template literals (including their ${...} parts) and regular
 * expression literals are copied as they are, so comment-like text inside
 * them ("http://...", /\/*x/) is never mistaken for a comment.
 */

const WORD_END = /[\w$)\]]/;
// After these words a "/" starts a regular expression, not a division.
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** The code with comments removed and whitespace collapsed. */
export function normalizeSource(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  let pendingSpace = false;
  // Template literal nesting: each entry is the brace depth at which a ${ opened.
  const templates: number[] = [];
  let depth = 0;

  const emit = (s: string) => {
    if (pendingSpace && out.length > 0) out += ' ';
    pendingSpace = false;
    out += s;
  };
  const lastWord = () => /([\w$]+)\s*$/.exec(out)?.[1] ?? '';
  const regexAllowed = () => {
    const t = out.trimEnd();
    if (t.length === 0) return true;
    const c = t[t.length - 1];
    if (!WORD_END.test(c)) return true; // after an operator or opening bracket
    return REGEX_AFTER_WORD.has(lastWord());
  };

  /** Copies a template literal body from i (just after a backtick or a closing }), stopping after the closing backtick or at a ${. */
  const templateBody = () => {
    let s = '';
    while (i < n) {
      const c = source[i];
      if (c === '\\') {
        s += source.slice(i, i + 2);
        i += 2;
      } else if (c === '`') {
        s += c;
        i++;
        emit(s);
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        s += '${';
        i += 2;
        emit(s);
        templates.push(depth);
        depth++;
        return;
      } else {
        s += c;
        i++;
      }
    }
    emit(s);
  };

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      pendingSpace = true;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      pendingSpace = true;
    } else if (/\s/.test(c)) {
      while (i < n && /\s/.test(source[i])) i++;
      pendingSpace = true;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      emit(source.slice(i, j + 1));
      i = j + 1;
    } else if (c === '`') {
      i++;
      emit('`');
      templateBody();
    } else if (c === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < n && source[j] !== '\n') {
        const d = source[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(source[j])) j++; // flags
      emit(source.slice(i, j));
      i = j;
    } else if (c === '{') {
      depth++;
      emit(c);
      i++;
    } else if (c === '}') {
      depth--;
      i++;
      if (templates.length > 0 && templates[templates.length - 1] === depth) {
        templates.pop();
        emit('}');
        // Glue the rest of the template to the closing brace, without a space.
        pendingSpace = false;
        templateBody();
      } else {
        emit(c);
      }
    } else {
      emit(c);
      i++;
    }
  }
  return out;
}

/** Bytes (UTF-8) of the normalised code: the size the engineering score compares. */
export function codeSize(source: string): number {
  return Buffer.byteLength(normalizeSource(source), 'utf8');
}
