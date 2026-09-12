import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Listing } from './types.ts';

const GONE_AFTER_MISSES = 2;
const ARCHIVE_MONTHS = 24;

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 0)}\n`);
}

export type MergeResult = {
  listings: Listing[];
  archived: Listing[];
  newListings: Listing[];
  priceDrops: { listing: Listing; from: number; to: number }[];
};

/**
 * Merge a fresh crawl into the existing dataset.
 *
 * Rules that matter:
 * - firstSeen is never overwritten. It is the only record of when a piece
 *   appeared, and it drives the "new today" view.
 * - A listing absent from one crawl is NOT deleted. A dealer having a bad
 *   five minutes must not wipe their history. It takes GONE_AFTER_MISSES
 *   consecutive absences to archive one.
 * - Only sources that actually crawled successfully may age their listings.
 *   A source that threw is skipped entirely, so its listings hold steady.
 */
export function merge(
  existing: Listing[],
  fresh: Listing[],
  succeededSources: Set<string>,
  now: string,
): MergeResult {
  const byId = new Map(existing.map((l) => [l.id, l]));
  const freshIds = new Set(fresh.map((l) => l.id));
  const newListings: Listing[] = [];
  const priceDrops: MergeResult['priceDrops'] = [];

  for (const item of fresh) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, item);
      newListings.push(item);
      continue;
    }

    const history = [...prev.priceHistory];
    const today = now.slice(0, 10);
    if (item.price) {
      const last = history.at(-1);
      if (!last || last.amount !== item.price.amount) {
        history.push({ date: today, amount: item.price.amount, currency: item.price.currency });
        if (last && item.price.amount < last.amount) {
          priceDrops.push({ listing: item, from: last.amount, to: item.price.amount });
        }
      }
    }

    byId.set(item.id, {
      ...item,
      firstSeen: prev.firstSeen,
      lastSeen: now,
      missedCrawls: 0,
      status: 'active',
      priceHistory: history.slice(-40),
    });
  }

  const listings: Listing[] = [];
  const archived: Listing[] = [];

  for (const l of byId.values()) {
    if (freshIds.has(l.id) || !succeededSources.has(l.source)) {
      listings.push(freshIds.has(l.id) ? l : { ...l });
      continue;
    }
    const missed = l.missedCrawls + 1;
    if (missed >= GONE_AFTER_MISSES) archived.push({ ...l, status: 'gone', missedCrawls: missed });
    else listings.push({ ...l, missedCrawls: missed });
  }

  return { listings, archived, newListings, priceDrops };
}

/** Keep archive.json from growing without bound. */
export function pruneArchive(archive: Listing[], now: Date): Listing[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - ARCHIVE_MONTHS);
  const seen = new Set<string>();
  return archive
    .filter((l) => new Date(l.lastSeen) >= cutoff)
    .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
}
