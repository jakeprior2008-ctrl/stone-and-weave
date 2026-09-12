import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Listing } from './types.ts';

type Match = {
  tags?: string[];
  allTags?: string[];
  brands?: string[];
  maxPriceGBP?: number;
  minPriceGBP?: number;
  minOddity?: number;
  minCaseMm?: number;
  maxCaseMm?: number;
  text?: string;
};
export type Rule = { name: string; priority?: string; match: Match };

export const loadRules = (path = 'watchlist.yml'): Rule[] =>
  (parse(readFileSync(path, 'utf8')).rules ?? []) as Rule[];

export function matches(listing: Listing, m: Match): boolean {
  if (m.tags && !m.tags.some((t) => listing.tags.includes(t))) return false;
  if (m.allTags && !m.allTags.every((t) => listing.tags.includes(t))) return false;
  if (m.brands && !m.brands.some((b) => listing.brand?.toLowerCase().includes(b.toLowerCase())))
    return false;
  if (m.minOddity !== undefined && listing.oddity < m.minOddity) return false;

  // An unpriced listing ("POA") must not silently pass a price filter.
  if (m.maxPriceGBP !== undefined && (listing.priceGBP === null || listing.priceGBP > m.maxPriceGBP))
    return false;
  if (m.minPriceGBP !== undefined && (listing.priceGBP === null || listing.priceGBP < m.minPriceGBP))
    return false;

  if (m.minCaseMm !== undefined && (listing.caseSizeMm === null || listing.caseSizeMm < m.minCaseMm))
    return false;
  if (m.maxCaseMm !== undefined && (listing.caseSizeMm === null || listing.caseSizeMm > m.maxCaseMm))
    return false;
  if (m.text && !new RegExp(m.text, 'i').test(`${listing.title} ${listing.description}`))
    return false;
  return true;
}

export function findMatches(listings: Listing[], rules: Rule[]) {
  const hits: { rule: Rule; listing: Listing }[] = [];
  for (const listing of listings) {
    const rule = rules.find((r) => matches(listing, r.match));
    if (rule) hits.push({ rule, listing });
  }
  // Best things first - a grail should never arrive below a merely odd piece.
  return hits.sort((a, b) => b.listing.oddity - a.listing.oddity);
}

const money = (l: Listing) =>
  l.price ? `${l.price.currency} ${l.price.amount.toLocaleString()}` : 'POA';

/** Push to ntfy. Failure here must never fail the crawl - data is already saved. */
export async function pushNtfy(
  topic: string,
  hits: { rule: Rule; listing: Listing }[],
  limit = 12,
): Promise<number> {
  let sent = 0;
  for (const { rule, listing } of hits.slice(0, limit)) {
    const headers: Record<string, string> = {
      Title: `${listing.grail ? '🏆 ' : ''}${listing.title}`.slice(0, 200),
      Tags: listing.grail ? 'trophy' : 'watch',
      Priority: listing.grail || rule.priority === 'high' ? 'high' : 'default',
      Click: listing.url,
      Actions: `view, Open listing, ${listing.url}`,
    };
    if (listing.images[0]) headers.Attach = listing.images[0];

    const body = [
      `${money(listing)} · ${listing.sourceName}`,
      listing.tags.length ? listing.tags.join(', ') : null,
      `oddity ${listing.oddity} · matched "${rule.name}"`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', headers, body });
      if (res.ok) sent++;
    } catch (err) {
      console.warn(`  ntfy push failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return sent;
}
