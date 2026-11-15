/**
 * The intent scorer as a FitModel, for `npm run fit -- --model intent`.
 * Records come from calibration/intent/run.ts: each holds the raw intent
 * measurements of one attempt's page and the site facts around it
 * (engineering credit, the page-pillar shares), so the fit moves only the
 * intent constants and the site total is rebuilt the way the site layer
 * builds it for a one-page site: 100 x (0.40 works + 0.25 looks + 0.35 engineering x works).
 */
import type { FitModel } from '../criteria/model';
import { breakdownOf, criteriaOf, type IntentMeasurements } from './combine';
import { INTENT_PARAMS_PATH, loadIntentParams, saveIntentParams } from './params';

export interface IntentFitRecord {
  intent: IntentMeasurements;
  /** Engineering credit, 0 to 1. */
  engineering: number;
  /** Site-model shares: content within a page's works mark, style within its looks mark. */
  pageWorksContent: number;
  pageLooksStyle: number;
  worksWeight: number;
  looksWeight: number;
  engineeringWeight: number;
}

export function siteTotalOf(r: IntentFitRecord, values: Record<string, number>): number {
  const b = breakdownOf(criteriaOf(r.intent, values), values);
  const works = b.content === null ? b.layout / 100 : (r.pageWorksContent * b.content + (1 - r.pageWorksContent) * b.layout) / 100;
  const looks = (r.pageLooksStyle * b.style + (1 - r.pageLooksStyle) * b.visual) / 100;
  return Math.max(0, Math.min(100, 100 * (r.worksWeight * works + r.looksWeight * looks + r.engineeringWeight * r.engineering * works)));
}

export function makeIntentModel(path = INTENT_PARAMS_PATH): FitModel<IntentFitRecord> {
  return {
    domain: 'pages',
    params: loadIntentParams(path),
    extract(result: unknown) {
      const r = result as Partial<IntentFitRecord> | null;
      return r && r.intent && typeof r.engineering === 'number' ? (r as IntentFitRecord) : null;
    },
    score: siteTotalOf,
    save: (values, note) => saveIntentParams(values, note, path),
  };
}

export const intentModel = makeIntentModel();
