import type { Rect } from '../types';

export type Importance = 'critical' | 'major' | 'normal' | 'minor';

/** How much a component counts, as a multiple of a normal one. Small on purpose. */
export const IMPORTANCE_WEIGHT: Record<Importance, number> = { critical: 1.5, major: 1.25, normal: 1, minor: 0.75 };

export type ComponentType =
  | 'navigation' | 'hero' | 'heading' | 'text' | 'card-group' | 'card' | 'table' | 'form'
  | 'list' | 'image' | 'chart' | 'stats' | 'footer' | 'banner' | 'sidebar' | 'other';

export interface PageComponent {
  /** Stable for a given goal: "c1", "c2.3". */
  id: string;
  type: ComponentType;
  /** Plain words for feedback: "the pricing cards", "the sign-up form", "the footer". */
  name: string;
  rect: Rect;
  /** Indexes into the goal snapshot's blocks that belong to this component and to none of its children. */
  blocks: number[];
  children: PageComponent[];
  importance: Importance;
  /** Block indexes (within this component, children included) whose exact words matter most: prices, totals, figures, button labels, the brand name, the main heading. */
  keyTexts: number[];
}

export interface PageProfile {
  version: 1;
  /** 'rules' when built by rules alone, 'rules+marks' when the challenge author's marks were applied. */
  source: 'rules' | 'rules+marks';
  width: number;
  height: number;
  components: PageComponent[];
  /** Small shifts of the four sub-score weights for this challenge, each within -0.05 to +0.05 and summing to 0. The rules leave it at zeros; only the author's marks set it. */
  weightShift: { content: number; layout: number; style: number; visual: number };
}

/**
 * Marks a challenge's author writes by hand next to the goal, after looking
 * at the overlay. Components are named by their `name` or `id`, key texts by
 * their visible words.
 */
export interface ProfileMarks {
  components?: Record<string, { importance?: Importance; name?: string }>;
  keyTexts?: { add?: string[]; drop?: string[] };
  weightShift?: Partial<PageProfile['weightShift']>;
}
