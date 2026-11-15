import { describe, expect, it } from 'vitest';
import { checkPromptOriginality, ORIGINALITY } from '../../src/prompt/originality';

const BRIEF =
  'Riverside Bakery is a small family bakery that opened in 1998 on the corner of Elm Street. ' +
  'The owners want a single welcoming page that tells new visitors who they are, shows the three breads they are proudest of, ' +
  'and makes it easy to find the shop and order a cake for a birthday or a wedding. ' +
  'The page should feel warm and homely, like walking into the shop early in the morning while the ovens are still hot.';

const REQUIREMENTS = [
  'Show a heading with the bakery name near the top of the page so visitors know at once where they are.',
  'List the three signature breads with their names and prices laid out side by side on wide screens.',
  'Include an order form for cakes that asks for the date of the event and the number of guests expected.',
  'Give the address and opening hours in a footer at the bottom of the page in small but readable text.',
];

const CHALLENGE = [BRIEF, ...REQUIREMENTS];

const OWN_WORDS =
  'Build me a cosy one page site for Riverside Bakery. Put the name big at the top. ' +
  'Then a row of three cards: Sourdough Loaf $6.50, Rye Batch $5.25 and Seeded Cob $4.75, stacking on phones. ' +
  'Add a cake request form with fields for event date and guest count, and finish with a footer holding 12 Elm Street ' +
  'and the hours, 7am to 3pm daily. Use cream, brown and soft orange so it feels like fresh bread.';

describe('checkPromptOriginality', () => {
  it('has the documented defaults', () => {
    expect(ORIGINALITY).toEqual({ minRun: 8, maxRun: 25, maxShare: 0.4 });
  });

  it('passes a prompt in the player\'s own words that mentions every name and price', () => {
    const r = checkPromptOriginality(OWN_WORDS, CHALLENGE);
    expect(r.ok).toBe(true);
    expect(r.copiedShare).toBe(0);
    expect(r.message).toBeNull();
  });

  it('fails the brief pasted whole', () => {
    const r = checkPromptOriginality(BRIEF, CHALLENGE);
    expect(r.ok).toBe(false);
    expect(r.copiedShare).toBe(1);
    expect(r.longestRun).toBeGreaterThanOrEqual(ORIGINALITY.maxRun);
    expect(r.message).toMatch(/^About 100% of this prompt is copied from the challenge text\./);
    expect(r.copiedRuns.length).toBeGreaterThan(0);
  });

  it('fails the brief pasted with a sentence of the player\'s own before and after', () => {
    const r = checkPromptOriginality(`Please make this for me, it matters a lot. ${BRIEF} Use nice colours and keep it tidy.`, CHALLENGE);
    expect(r.ok).toBe(false);
    expect(r.copiedShare).toBeGreaterThan(0.8);
  });

  it('flags three pasted requirements only when the share passes the limit', () => {
    const pasted = REQUIREMENTS.slice(0, 3).join(' ');
    const short = checkPromptOriginality(`${OWN_WORDS} ${pasted}`, CHALLENGE, { maxRun: 1000 });
    const long = checkPromptOriginality(`${OWN_WORDS} ${OWN_WORDS} ${OWN_WORDS} ${OWN_WORDS} ${pasted}`, CHALLENGE, { maxRun: 1000 });
    expect(short.copiedShare).toBeGreaterThan(ORIGINALITY.maxShare);
    expect(short.ok).toBe(false);
    expect(long.copiedShare).toBeGreaterThan(0);
    expect(long.copiedShare).toBeLessThanOrEqual(ORIGINALITY.maxShare);
    expect(long.ok).toBe(true);
    expect(long.longestRun).toBe(Math.max(...REQUIREMENTS.slice(0, 3).map(promptLength)));
    expect(long.copiedRuns).toHaveLength(3);
  });

  it('passes a paraphrase with the same facts', () => {
    const paraphrase =
      'Riverside Bakery is a family run shop on Elm Street, open since 1998. I want one friendly page introducing them, ' +
      'showing off their three favourite breads, and making it simple to locate the shop and book a cake for weddings or birthdays. ' +
      'It should feel warm, like stepping in at dawn with the ovens going. Name at the top, breads with prices in a row on desktop, ' +
      'a cake form asking event date and guests, and address plus hours in a small footer.';
    const r = checkPromptOriginality(paraphrase, CHALLENGE);
    expect(r.ok).toBe(true);
  });

  it('is not fooled by case, punctuation and line breaks', () => {
    const disguised = BRIEF.toUpperCase().replace(/ /g, ' -- ').replace(/\./g, '!!\n\n').replace(/,/g, ';\n');
    const r = checkPromptOriginality(disguised, CHALLENGE);
    expect(r.ok).toBe(false);
    expect(r.copiedShare).toBe(1);
  });

  it('is not fooled by reordering sentences', () => {
    const sentences = BRIEF.split('. ');
    const r = checkPromptOriginality(sentences.reverse().join('. '), CHALLENGE);
    expect(r.ok).toBe(false);
    expect(r.copiedShare).toBeGreaterThan(0.9);
  });

  it('checks a 12,000-character prompt against 10,000 characters of challenge text well under 50 ms', () => {
    const vocab = Array.from({ length: 400 }, (_, i) => `w${i.toString(36)}`);
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const text = (chars: number) => {
      const out: string[] = [];
      let n = 0;
      while (n < chars) {
        const w = vocab[Math.floor(rand() * vocab.length)];
        out.push(w);
        n += w.length + 1;
      }
      return out.join(' ');
    };
    const challenge = [text(10_000)];
    const prompt = text(6_000) + ' ' + challenge[0].slice(0, 6_000);
    checkPromptOriginality(prompt, challenge); // warm up
    const t0 = performance.now();
    const r = checkPromptOriginality(prompt, challenge);
    const ms = performance.now() - t0;
    expect(prompt.length).toBeGreaterThanOrEqual(12_000);
    expect(r.ok).toBe(false);
    expect(ms).toBeLessThan(50);
  });

  it('does not throw on odd input', () => {
    expect(checkPromptOriginality('', CHALLENGE)).toMatchObject({ ok: true, copiedShare: 0, words: 0, message: null });
    expect(checkPromptOriginality('?!... ,,, ---', ['', '!!!'])).toMatchObject({ ok: true, copiedShare: 0 });
    expect(checkPromptOriginality('a'.repeat(50_000), ['a'.repeat(50_000)])).toMatchObject({ ok: true, words: 1 });
    expect(checkPromptOriginality(OWN_WORDS, [])).toMatchObject({ ok: true, copiedShare: 0 });
    expect(checkPromptOriginality('one two three', CHALLENGE)).toMatchObject({ ok: true, copiedShare: 0, words: 3 });
  });
});

function promptLength(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
