/**
 * The real model runs (calibration/real-runs) with human score bands: the six
 * in bands.json must stay within 3 points of their band, the twelve held-out
 * runs in bands-heldout.json within 3.5.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Grader } from '../src/index';
import { gradeRealRuns } from '../calibration/real-runs/run';

const grader = new Grader();
afterAll(() => grader.close());

const here = dirname(fileURLToPath(import.meta.url));
const runs = join(here, '..', 'calibration', 'real-runs');
const pack = join(here, '..', '..', 'challenge-pack');
const HELDOUT_REFERENCES: Record<string, string> = {
  'restaurant-menu': join(pack, 'pages', 'goals', 'restaurant-menu.html'),
  'analytics-dashboard': join(pack, 'pages', 'goals', 'analytics-dashboard.html'),
  'kanban-board': join(pack, 'pages-2', 'apps', 'goals', 'kanban-board.html'),
};
const HELDOUT = JSON.parse(readFileSync(join(runs, 'bands-heldout.json'), 'utf8')) as Record<
  string,
  Record<string, { band: [number, number] }>
>;

const missOf = (total: number, [lo, hi]: [number, number]) => (total < lo ? lo - total : total > hi ? total - hi : 0);

describe('real model runs against human bands', () => {
  it('every total is inside its band or within 3 points of it', async () => {
    const rows = await gradeRealRuns(grader);
    expect(rows.length).toBe(6);
    for (const r of rows) {
      console.log(`${r.run}: ${r.total} against ${r.band.join('-')}`);
      expect(missOf(r.total, r.band), `${r.run}: ${r.total} against ${r.band.join('-')}`).toBeLessThanOrEqual(3);
    }
  }, 300_000);

  it('every held-out total is inside its band or within 3.5 points of it', async () => {
    const failures: string[] = [];
    let count = 0;
    for (const [slug, set] of Object.entries(HELDOUT)) {
      const goal = await grader.prepareSite({ 'index.html': readFileSync(HELDOUT_REFERENCES[slug], 'utf8') });
      for (const [name, { band }] of Object.entries(set)) {
        const { result } = await grader.gradeSite(goal, { 'index.html': readFileSync(join(runs, slug, `${name}.html`), 'utf8') });
        count++;
        const line = `${slug}/${name}: ${result.total} against ${band.join('-')}`;
        console.log(line);
        if (missOf(result.total, band) > 3.5) failures.push(line);
      }
    }
    expect(count).toBe(12);
    expect(failures).toEqual([]);
  }, 600_000);
});
