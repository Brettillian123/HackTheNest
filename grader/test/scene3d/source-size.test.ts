import { describe, expect, it } from 'vitest';
import { codeSize, normalizeSource } from '../../src/scene3d/source-size';

describe('code size: what the code does, not how it is written down', () => {
  it('drops line and block comments and collapses whitespace', () => {
    const terse = 'function f(a){return a+1;}';
    const chatty = `// Adds one.\n/* A block\n   comment. */\nfunction f(a){\n\n    // the answer\n    return a+1; /* done */\n}\n`;
    expect(normalizeSource(chatty)).toBe('function f(a){ return a+1; }');
    expect(normalizeSource(terse)).toBe(terse);
    expect(codeSize(chatty)).toBe(codeSize('function f(a){\n  return a+1;\n}'));
  });

  it('keeps comment-like text inside strings, templates and regular expressions', () => {
    const code = [
      "const a = 'http://x.test/*not*/';",
      'const b = "// still a string";',
      'const c = `line // one\n  /* two */ ${1 + /* gone */ 2} // kept`;',
      String.raw`const d = /\/\/[/*]x/g; // gone`,
      'const e = 10 / 2 / 5; // gone',
    ].join('\n');
    expect(normalizeSource(code)).toBe(
      [
        "const a = 'http://x.test/*not*/';",
        'const b = "// still a string";',
        'const c = `line // one\n  /* two */ ${1 + 2} // kept`;',
        String.raw`const d = /\/\/[/*]x/g;`,
        'const e = 10 / 2 / 5;',
      ].join(' '),
    );
  });
});
