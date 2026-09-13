import type { Listing } from './types.ts';

export type Sort = 'new' | 'oddity' | 'price-asc' | 'price-desc' | 'drop' | 'stale';

export type Filters = {
  q: string;
  tags: string[];
  sources: string[];
  eras: string[];
  minPrice: number | null;
  maxPrice: number | null;
  minCase: number | null;
  maxCase: number | null;
  minOddity: number;
  grailsOnly: boolean;
  pinnedOnly: boolean;
  includeSold: boolean;
  sort: Sort;
};

export const EMPTY: Filters = {
  q: '', tags: [], sources: [], eras: [], minPrice: null, maxPrice: null,
  minCase: null, maxCase: null, minOddity: 0, grailsOnly: false, pinnedOnly: false, includeSold: false, sort: 'oddity',
};

/** Filter state lives in the URL so a hunt can be bookmarked and shared. */
export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tags.length) p.set('tags', f.tags.join(','));
  if (f.sources.length) p.set('src', f.sources.join(','));
  if (f.eras.length) p.set('era', f.eras.join(','));
  if (f.minPrice !== null) p.set('min', String(f.minPrice));
  if (f.maxPrice !== null) p.set('max', String(f.maxPrice));
  if (f.minCase !== null) p.set('cmin', String(f.minCase));
  if (f.maxCase !== null) p.set('cmax', String(f.maxCase));
  if (f.minOddity > 0) p.set('odd', String(f.minOddity));
  if (f.grailsOnly) p.set('grail', '1');
  if (f.pinnedOnly) p.set('pinned', '1');
  if (f.includeSold) p.set('sold', '1');
  if (f.sort !== 'oddity') p.set('sort', f.sort);
  return p.toString();
}

export function fromQuery(search: string): Filters {
  const p = new URLSearchParams(search);
  const num = (k: string) => (p.has(k) ? Number(p.get(k)) : null);
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : []);
  return {
    ...EMPTY,
    q: p.get('q') ?? '',
    tags: list('tags'),
    sources: list('src'),
    eras: list('era'),
    minPrice: num('min'), maxPrice: num('max'),
    minCase: num('cmin'), maxCase: num('cmax'),
    minOddity: num('odd') ?? 0,
    grailsOnly: p.get('grail') === '1',
    pinnedOnly: p.get('pinned') === '1',
    includeSold: p.get('sold') === '1',
    sort: (p.get('sort') as Sort) ?? 'oddity',
  };
}

const dropPct = (l: Listing) => {
  if (l.priceHistory.length < 2) return 0;
  const first = l.priceHistory[0].amount;
  const last = l.priceHistory.at(-1)!.amount;
  return first > 0 ? ((first - last) / first) * 100 : 0;
};

export const daysListed = (l: Listing) =>
  Math.floor((Date.now() - new Date(l.firstSeen).getTime()) / 86_400_000);

export function apply(
  listings: Listing[],
  f: Filters,
  matchedIds: Set<string> | null,
  pins: Set<string> = new Set(),
): Listing[] {
  const out = listings.filter((l) => {
    if (matchedIds && !matchedIds.has(l.id)) return false;
    if (f.pinnedOnly && !pins.has(l.id)) return false;
    // A pinned piece stays visible even once it sells - that is the point of a
    // shortlist, and losing one silently would be worse than showing it sold.
    if (!f.includeSold && !l.available && !pins.has(l.id)) return false;
    if (f.grailsOnly && !l.grail) return false;
    // Every selected tag must be present - filters narrow, they don't widen.
    if (f.tags.length && !f.tags.every((t) => l.tags.includes(t))) return false;
    if (f.sources.length && !f.sources.includes(l.source)) return false;
    if (f.eras.length && (!l.era || !f.eras.includes(l.era))) return false;
    if (l.oddity < f.minOddity) return false;
    // An unpriced listing is excluded by a price filter rather than sneaking through.
    if (f.minPrice !== null && (l.priceGBP === null || l.priceGBP < f.minPrice)) return false;
    if (f.maxPrice !== null && (l.priceGBP === null || l.priceGBP > f.maxPrice)) return false;
    if (f.minCase !== null && (l.caseSizeMm === null || l.caseSizeMm < f.minCase)) return false;
    if (f.maxCase !== null && (l.caseSizeMm === null || l.caseSizeMm > f.maxCase)) return false;
    return true;
  });

  const price = (l: Listing) => l.priceGBP ?? Number.POSITIVE_INFINITY;
  const sorters: Record<Sort, (a: Listing, b: Listing) => number> = {
    new: (a, b) => b.firstSeen.localeCompare(a.firstSeen),
    oddity: (a, b) => b.oddity - a.oddity || b.firstSeen.localeCompare(a.firstSeen),
    'price-asc': (a, b) => price(a) - price(b),
    'price-desc': (a, b) => (b.priceGBP ?? -1) - (a.priceGBP ?? -1),
    drop: (a, b) => dropPct(b) - dropPct(a),
    stale: (a, b) => a.firstSeen.localeCompare(b.firstSeen),
  };
  return out.sort(sorters[f.sort]);
}

export { dropPct };
