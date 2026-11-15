// Shared by the page and site property tests.

export const r1 = (n: number | null) => (n === null ? 'null' : (Math.round(n * 10) / 10).toString());

/** Steps whose totals must never rise; returns one line per rise. */
export function rises(label: string, steps: { name: string; total: number; text: string }[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].total > steps[i - 1].total) {
      out.push(`${label}: ${steps[i - 1].name} -> ${steps[i].name} rose: ${steps[i - 1].text}  ->  ${steps[i].text}`);
    }
  }
  return out;
}
