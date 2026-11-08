/// <reference lib="webworker" />
import type { Tuning } from '../config/tuning';
import { campMission, generateWorld, surveyWorld, type CampSpec, type Survey } from '../sim/generation';

/**
 * The seed explorer's worker (explore.ts): generates each seed it is given, one after
 * another, and posts back its survey, so the page stays responsive while dozens of
 * valleys are built. The tuning comes with the request: this worker imports no tuning of
 * its own, so the explorer always shows the numbers the page was given.
 */
export interface ExploreRequest {
  tuning: Tuning;
  seeds: string[];
  /** Stamped on every reply, so replies to an older request can be told apart. */
  batch: number;
  /** The camp to generate (lab D). */
  camp: CampSpec;
}

export type ExploreReply = { batch: number; seed: string; survey: Survey; ms: number } | { batch: number; seed: string; error: string };

self.onmessage = (e: MessageEvent<ExploreRequest>) => {
  const { tuning, seeds, batch, camp } = e.data;
  for (const seed of seeds) {
    const t0 = performance.now();
    try {
      const world = generateWorld(campMission(seed, camp), tuning);
      const reply: ExploreReply = { batch, seed, survey: surveyWorld(world), ms: performance.now() - t0 };
      self.postMessage(reply);
    } catch (err) {
      const reply: ExploreReply = { batch, seed, error: err instanceof Error ? err.message : String(err) };
      self.postMessage(reply);
    }
  }
};
