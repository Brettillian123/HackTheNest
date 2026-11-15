/**
 * Registry of fit models, by name, for `npm run fit -- --model <name>`.
 * Each entry builds its model when asked (so loading one never reads another's files).
 *
 * To add one, export a FitModel (see ./model.ts) from a file of your own and add one line:
 *   import { sitesModel } from '../site-fit-model';   // at the top
 *   sites: () => sitesModel,                          // in MODELS
 */
import type { FitModel } from './model';
import { PARAMS_PATH, getBlock, loadParamsFile, makeCombineModel } from './params';
import { scenesModel } from '../scene3d/model';
import { sitesModel } from './site-model';
import { makeIntentModel } from '../intent/model';

export const MODELS: Record<string, () => FitModel<any>> = {
  pages: () => makeCombineModel(getBlock(loadParamsFile(PARAMS_PATH), 'pages'), 'pages', PARAMS_PATH),
  scenes: () => scenesModel,
  sites: () => sitesModel,
  intent: () => makeIntentModel(),
};

export function getModel(name: string): FitModel<any> {
  const make = MODELS[name];
  if (!make) throw new Error(`no fit model "${name}"; known: ${Object.keys(MODELS).join(', ')}`);
  return make();
}
