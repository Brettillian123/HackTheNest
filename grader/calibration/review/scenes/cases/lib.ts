/** Shared helpers for the review cases. Each goal file exports a GoalSet. */
export interface Case {
  id: string;
  note: string;
  code: string;
}
export interface GoalSet {
  id: string;
  goal: string;
  attempts: Case[];
}

/** Replaces every occurrence of each `from` with `to`, in order; throws if a `from` is missing, so a variant never silently equals the goal. */
export function sub(code: string, ...pairs: [string, string][]): string {
  for (const [from, to] of pairs) {
    if (!code.includes(from)) throw new Error('sub: not found: ' + from);
    code = code.split(from).join(to);
  }
  return code;
}
