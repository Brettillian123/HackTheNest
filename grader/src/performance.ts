import { PERF } from './config';
import { fallingCredit, round1 } from './util';

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
  /** Raw link addresses found on the page. */
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

export interface DeviceCheck {
  device: string;
  /** Estimated load time of the submission's pages, in milliseconds. */
  estimatedMs: number;
  /** The same for the goal's pages: the reference solution. */
  referenceMs: number;
  /** 0 to 100. */
  credit: number;
  /** Within the allowed factor of the reference. */
  passed: boolean;
}

export interface Efficiency {
  /** 0 to 100: half space, half time. */
  score: number;
  space: { bytes: number; referenceBytes: number; credit: number };
  time: { credit: number; checks: DeviceCheck[] };
}

function ratioCredit(value: number, reference: number): number {
  if (reference <= 0) return value <= 0 ? 1 : 0;
  return fallingCredit(value / reference, PERF.ratio.full, PERF.ratio.zero);
}

/**
 * Scores a submission's size and estimated load times against the goal's.
 * `pairs` are the pages being compared (submission page, goal page);
 * `bytes` and `referenceBytes` are the whole submitted site and the goal
 * files those pages use. Doing as well as the goal, or better, is full marks.
 */
export function scoreEfficiency(
  pairs: { candidate: PageStats; goal: PageStats }[],
  width: number,
  bytes: number,
  referenceBytes: number,
): Efficiency {
  const spaceCredit = ratioCredit(bytes, referenceBytes);
  const checks: DeviceCheck[] = PERF.devices.map((device) => {
    let estimated = 0;
    let reference = 0;
    for (const pair of pairs) {
      estimated += estimateLoadMs(pair.candidate, width, device);
      reference += estimateLoadMs(pair.goal, width, device);
    }
    return {
      device: device.name,
      estimatedMs: round1(estimated),
      referenceMs: round1(reference),
      credit: round1(ratioCredit(estimated, reference) * 100),
      passed: reference > 0 && estimated <= reference * PERF.passRatio,
    };
  });
  const timeCredit =
    checks.length === 0 ? 1 : checks.reduce((sum, c) => sum + c.credit, 0) / checks.length / 100;
  return {
    score: round1((0.5 * spaceCredit + 0.5 * timeCredit) * 100),
    space: { bytes, referenceBytes, credit: round1(spaceCredit * 100) },
    time: { credit: round1(timeCredit * 100), checks },
  };
}
