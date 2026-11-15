/** The interface `npm run fit` fits. One model per domain; registry in ./models.ts. */

export interface FitParam {
  value: number;
  min: number;
  max: number;
  fixed?: boolean;
  meaning: string;
  /** Where the fit is pulled back towards (defaults to the starting value). */
  neutral?: number;
}

export interface FitModel<M = unknown> {
  domain: 'pages' | 'sites' | 'scenes';
  /** Every constant, with bounds; fixed ones are never moved by a fit. */
  params: Record<string, FitParam>;
  /** Pull this model's measurements out of one attempt's result as the bench wrote it. */
  extract(result: unknown): M | null;
  /** Pure, deterministic, 0 to 100 (sites and scenes may pass 100 by their bonus). */
  score(measurements: M, values: Record<string, number>): number;
  /** Optional: tidy fitted values before they are reported or saved (e.g. shares summing to 1). */
  tidy?(values: Record<string, number>): Record<string, number>;
  /** Optional: save fitted values (non-fixed only) with a note; returns the file written. Without it, --write refuses. */
  save?(values: Record<string, number>, note: unknown): string;
}
