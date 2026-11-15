import { PERF } from './config';
import { round1 } from './util';

/** What loading one page costs, counted from the page itself. Nothing here is timed. */
export interface PageStats {
  /** Paths of the files the page loaded from the site (the page itself, its stylesheets...), sorted. */
  files: string[];
  /** How many files that is. */
  requests: number;
  /** Total bytes of those files. */
  bytes: number;
  /** Things the page asked for that are not in the site (outside addresses, missing files). */
  blockedRequests: number;
  /** Elements in the page. */
  elements: number;
  /** Deepest nesting of elements. */
  maxDepth: number;
  /** CSS rules the page has to check against its elements. */
  cssRules: number;
  /** Rendered page height in pixels. */
  height: number;
  /** Addresses of the links on the page that a visitor could see. */
  links: string[];
}

export type Device = (typeof PERF.devices)[number];

/**
 * Estimated time for a page to load on a simulated device, in milliseconds.
 *
 *   network = connection set-up + one round trip per file + download time
 *   cpu     = slowdown x (parsing + matching styles + layout + painting)
 *
 * It is a model, not a measurement: the same page always gives the same
 * number, and a page with more bytes, more files, more elements or more CSS
 * always gives a bigger one. That is what makes it fair to grade on.
 */
export function estimateLoadMs(stats: PageStats, width: number, device: Device): number {
  const { cost } = PERF;
  const network =
    (2 + stats.requests + stats.blockedRequests) * device.roundTripMs + (stats.bytes * 8) / device.kbps;
  const megapixels = (width * stats.height) / 1_000_000;
  const cpu =
    device.cpuSlowdown *
    ((stats.bytes / 1024) * cost.parseMsPerKb +
      ((stats.elements * stats.cssRules) / 1000) * cost.styleMsPerThousandMatches +
      stats.elements * cost.layoutMsPerElement * (1 + stats.maxDepth / 32) +
      megapixels * cost.paintMsPerMegapixel);
  return network + cpu;
}

/**
 * Credit for a submission / goal ratio, from 1 down to -1.
 *
 *   up to `full`      1      as good as the goal, give or take
 *   `full` to `zero`  1 to 0 a straight line
 *   `zero` to `worst` 0 to -1 on a log scale: 3x, 5.5x and 10x are evenly spaced
 *   past `worst`      -1
 *
 * A negative credit takes marks away from the rest of the score.
 */
export function ratioCredit(ratio: number): number {
  const { full, zero, worst } = PERF.ratio;
  if (!(ratio > full)) return 1; // also covers NaN, which cannot arise from valid counts
  if (ratio <= zero) return 1 - (ratio - full) / (zero - full);
  if (ratio >= worst) return -1;
  return -Math.log(ratio / zero) / Math.log(worst / zero);
}

/** How far under the goal a ratio is: 0.3 means 30% smaller or faster. 0 at or above the goal. */
export function ratioSaving(ratio: number): number {
  return ratio < 1 ? 1 - Math.max(0, ratio) : 0;
}

function ratioOf(value: number, reference: number, slack = 0): number {
  const bottom = reference + slack;
  if (bottom <= 0) return value + slack <= 0 ? 1 : Number.POSITIVE_INFINITY;
  return (value + slack) / bottom;
}

export interface DeviceCheck {
  device: string;
  /** Estimated load time of the submission's pages, in milliseconds. */
  estimatedMs: number;
  /** The same for the goal's pages: the reference solution. */
  referenceMs: number;
  /** estimatedMs / referenceMs, to two decimals. */
  ratio: number;
  /** -100 to 100. */
  credit: number;
  /** Within the allowed factor of the reference. */
  passed: boolean;
}

export interface Efficiency {
  /** -100 to 100: half space, half time. Negative means far heavier than the goal. */
  score: number;
  /** 0 to 100: how far under the goal the site comes, on average. Earns the bonus. */
  saving: number;
  /** True when no check is worse than the goal: size and every device at or under it, one at least under. Needed for the bonus. */
  beatsGoal: boolean;
  space: { bytes: number; referenceBytes: number; ratio: number; credit: number };
  time: { credit: number; checks: DeviceCheck[] };
}

export interface EfficiencyScore {
  /** Rounded, for showing to people. */
  report: Efficiency;
  /** -1 to 1, unrounded, for the total. */
  credit: number;
  /** 0 to 1, unrounded, for the bonus. */
  saving: number;
  /** Smaller and faster than the goal: no check worse, at least one better. */
  beatsGoal: boolean;
}

const round2 = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : value);

/**
 * Scores a submission's size and estimated load times against the goal's.
 * `pairs` are the pages being compared (submission page, goal page);
 * `bytes` and `referenceBytes` are the whole submitted site and the goal
 * files those pages use.
 */
export function scoreEfficiency(
  pairs: { candidate: PageStats; goal: PageStats }[],
  width: number,
  bytes: number,
  referenceBytes: number,
): EfficiencyScore {
  const spaceRatio = ratioOf(bytes, referenceBytes, PERF.slackBytes);
  const spaceCredit = ratioCredit(spaceRatio);

  let timeCredit = 0;
  let timeSaving = 0;
  let noneWorse = spaceRatio <= 1;
  const checks: DeviceCheck[] = PERF.devices.map((device) => {
    let estimated = 0;
    let reference = 0;
    for (const pair of pairs) {
      estimated += estimateLoadMs(pair.candidate, width, device);
      reference += estimateLoadMs(pair.goal, width, device);
    }
    const ratio = ratioOf(estimated, reference);
    const credit = ratioCredit(ratio);
    timeCredit += credit;
    timeSaving += ratioSaving(ratio);
    if (!(ratio <= 1)) noneWorse = false;
    return {
      device: device.name,
      estimatedMs: round1(estimated),
      referenceMs: round1(reference),
      ratio: round2(ratio),
      credit: round1(credit * 100),
      passed: ratio <= PERF.passRatio,
    };
  });
  if (checks.length > 0) {
    timeCredit /= checks.length;
    timeSaving /= checks.length;
  } else {
    timeCredit = 1;
  }

  const credit = 0.5 * spaceCredit + 0.5 * timeCredit;
  const saving = 0.5 * ratioSaving(spaceRatio) + 0.5 * timeSaving;
  // "Better on size and speed" means both: a site that is faster but bigger
  // (or smaller but slower) has not beaten the goal.
  const beatsGoal = noneWorse && saving > 0;
  return {
    credit,
    saving,
    beatsGoal,
    report: {
      score: round1(credit * 100),
      saving: round1(saving * 100),
      beatsGoal,
      space: { bytes, referenceBytes, ratio: round2(spaceRatio), credit: round1(spaceCredit * 100) },
      time: { credit: round1(timeCredit * 100), checks },
    },
  };
}
