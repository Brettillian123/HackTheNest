import { PERF } from './site-config';
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
 *   network = connection set-up + the page + its other files in batches
 *             + download time
 *   cpu     = slowdown x (parsing + matching styles + layout + painting)
 *
 * A browser fetches about PERF.parallelRequests files at once, so the files
 * a page asks for cost one round trip per batch of that many, not one each:
 * six small stylesheets wait about as long as one.
 *
 * It is a model, not a measurement: the same page always gives the same
 * number, and a page with more bytes, more files, more elements or more CSS
 * never gives a smaller one. That is what makes it fair to grade on.
 */
export function estimateLoadMs(stats: PageStats, width: number, device: Device): number {
  const { cost } = PERF;
  const others = Math.max(0, stats.requests - 1) + stats.blockedRequests;
  const roundTrips = 3 + Math.ceil(others / PERF.parallelRequests);
  const network = roundTrips * device.roundTripMs + (stats.bytes * 8) / device.kbps;
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
 *   `zero` to `worst` 0 to -1 on a log scale
 *   past `worst`      -1
 *
 * A negative credit takes marks away from the rest of the score. Sites use
 * PERF.ratio; the default is the general curve other graders (scenes) use.
 */
export const GENERAL_RATIO = { full: 1.15, zero: 3, worst: 10 } as const;

export function ratioCredit(ratio: number, limits: { full: number; zero: number; worst: number } = GENERAL_RATIO): number {
  const { full, zero, worst } = limits;
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
  /** -100 to 100: the worse of space and time. Negative means far heavier than the goal. */
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
  /** Unrounded parts of `credit`, for working out what each fault cost: credit = the lower of space and time. */
  spaceCredit: number;
  timeCredit: number;
  /** Unrounded size ratio, and the device whose load-time ratio is worst (null when there are no devices). */
  spaceRatio: number;
  worstDevice: { name: string; ratio: number } | null;
}

const round2 = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : value);

/**
 * The facts size and speed are judged on, with no tunable constant applied:
 * the bytes of the submitted site and of the goal files compared with it,
 * and each device's estimated load time for both (unrounded).
 */
export interface EfficiencyMeasurement {
  bytes: number;
  referenceBytes: number;
  devices: { name: string; estimatedMs: number; referenceMs: number }[];
}

/** How measurements become credit. The site model passes its own values; the defaults are site-config.ts's. */
export interface EfficiencyLimits {
  ratio: { full: number; zero: number; worst: number };
  slackBytes: number;
  /** 1: efficiency is the worse of size and speed; 0: their mean; in between, a blend. */
  worstBlend: number;
}

export const DEFAULT_EFFICIENCY_LIMITS: EfficiencyLimits = { ratio: PERF.ratio, slackBytes: PERF.slackBytes, worstBlend: 1 };

/**
 * Measures a submission's size and estimated load times against the goal's.
 * `pairs` are the pages being compared (submission page, goal page);
 * `bytes` and `referenceBytes` are the whole submitted site and the goal
 * files those pages use.
 */
export function measureEfficiency(
  pairs: { candidate: PageStats; goal: PageStats }[],
  width: number,
  bytes: number,
  referenceBytes: number,
  /** Pages of the submission the goal does not have that a visitor can reach: their load time counts, against nothing. */
  extra: PageStats[] = [],
): EfficiencyMeasurement {
  return {
    bytes,
    referenceBytes,
    devices: PERF.devices.map((device) => {
      let estimated = 0;
      let reference = 0;
      for (const pair of pairs) {
        estimated += estimateLoadMs(pair.candidate, width, device);
        reference += estimateLoadMs(pair.goal, width, device);
      }
      for (const page of extra) estimated += estimateLoadMs(page, width, device);
      return { name: device.name, estimatedMs: estimated, referenceMs: reference };
    }),
  };
}

/** Scores size and speed in one step: measureEfficiency, then combineEfficiency with site-config.ts's numbers. */
export function scoreEfficiency(
  pairs: { candidate: PageStats; goal: PageStats }[],
  width: number,
  bytes: number,
  referenceBytes: number,
  extra: PageStats[] = [],
): EfficiencyScore {
  return combineEfficiency(measureEfficiency(pairs, width, bytes, referenceBytes, extra));
}

/** Efficiency credit from its two sides: the worse of them, the mean, or a blend (limits.worstBlend). */
export function blendEfficiency(spaceCredit: number, timeCredit: number, worstBlend: number): number {
  return worstBlend * Math.min(spaceCredit, timeCredit) + (1 - worstBlend) * ((spaceCredit + timeCredit) / 2);
}

/** Turns measured size and load times into credit. Pure. More bytes or a slower device never raise it. */
export function combineEfficiency(m: EfficiencyMeasurement, limits: EfficiencyLimits = DEFAULT_EFFICIENCY_LIMITS): EfficiencyScore {
  const { bytes, referenceBytes } = m;
  const spaceRatio = ratioOf(bytes, referenceBytes, limits.slackBytes);
  const spaceCredit = ratioCredit(spaceRatio, limits.ratio);

  let timeCredit = 0;
  let timeSaving = 0;
  let noneWorse = spaceRatio <= 1;
  let worstDevice: { name: string; ratio: number } | null = null;
  const checks: DeviceCheck[] = m.devices.map((device) => {
    const estimated = device.estimatedMs;
    const reference = device.referenceMs;
    const ratio = ratioOf(estimated, reference);
    const credit = ratioCredit(ratio, limits.ratio);
    timeCredit += credit;
    timeSaving += ratioSaving(ratio);
    if (!(ratio <= 1)) noneWorse = false;
    if (worstDevice === null || ratio > worstDevice.ratio) worstDevice = { name: device.name, ratio };
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

  // The worst measure wins (worstBlend 1): a site that is light but slow, or
  // fast but bloated, is only as good as its worse side.
  const credit = blendEfficiency(spaceCredit, timeCredit, limits.worstBlend);
  const saving = 0.5 * ratioSaving(spaceRatio) + 0.5 * timeSaving;
  // "Better on size and speed" means both: a site that is faster but bigger
  // (or smaller but slower) has not beaten the goal.
  const beatsGoal = noneWorse && saving > 0;
  return {
    credit,
    saving,
    beatsGoal,
    spaceCredit,
    timeCredit,
    spaceRatio,
    worstDevice,
    report: {
      score: round1(credit * 100),
      saving: round1(saving * 100),
      beatsGoal,
      space: { bytes, referenceBytes, ratio: round2(spaceRatio), credit: round1(spaceCredit * 100) },
      time: { credit: round1(timeCredit * 100), checks },
    },
  };
}
