/** The intent scorer's constants: every threshold, share and curve, with bounds (params.json). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FitParam } from '../criteria/model';

export const INTENT_PARAMS_PATH = fileURLToPath(new URL('./params.json', import.meta.url));

export type IntentParamFile = Record<string, FitParam> & { fit?: never };

export function loadIntentParams(path = INTENT_PARAMS_PATH): Record<string, FitParam> {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const out: Record<string, FitParam> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'fit') continue;
    const p = v as FitParam;
    out[k] = { value: p.value, min: p.min, max: p.max, meaning: p.meaning, neutral: p.neutral ?? p.value, ...(p.fixed ? { fixed: true } : {}) };
  }
  return out;
}

export function valuesOf(params: Record<string, FitParam>): Record<string, number> {
  const v: Record<string, number> = {};
  for (const [k, p] of Object.entries(params)) v[k] = p.value;
  return v;
}

/** The values grading uses: read once. */
export const INTENT_VALUES: Record<string, number> = valuesOf(loadIntentParams());

/** Writes fitted values back, keeping meanings and bounds, with a note. */
export function saveIntentParams(values: Record<string, number>, note: unknown, path = INTENT_PARAMS_PATH): string {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  for (const [k, v] of Object.entries(values)) {
    if (!raw[k] || raw[k].fixed) continue;
    if (raw[k].neutral === undefined) raw[k].neutral = raw[k].value;
    raw[k].value = Math.round(v * 10000) / 10000;
  }
  raw.fit = note;
  writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
  return path;
}
