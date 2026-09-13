import { describe, expect, it } from 'vitest';
import { similar } from '../src/similar.ts';
import type { Listing } from '../src/types.ts';

let n = 0;
function listing(overrides: Partial<Listing> = {}): Listing {
  n += 1;
  return {
    id: `id-${n}`,
    fingerprint: `fp-${n}`,
    source: 'dealer',
    sourceName: 'Dealer',
    url: `https://example.com/${n}`,
    title: `Watch ${n}`,
    description: '',
    brand: null,
    reference: null,
    price: null,
    priceGBP: null,
    images: [],
    tags: [],
    grail: false,
    oddity: 50,
    caseSizeMm: null,
    era: null,
    firstSeen: '2026-01-01',
    lastSeen: '2026-01-01',
    available: true,
    status: 'for-sale',
    priceHistory: [],
    ...overrides,
  };
}

const rarity = new Map<string, number>([
  ['common-tag', 0],
  ['rare-tag', 9],
  ['other-tag', 1],
]);

describe('similar', () => {
  it('ranks a shared rare tag above a shared common tag', () => {
    const target = listing({ tags: ['rare-tag', 'common-tag'] });
    const rareMatch = listing({ tags: ['rare-tag'] });
    const commonMatch = listing({ tags: ['common-tag'] });

    const results = similar(target, [rareMatch, commonMatch], rarity);
    expect(results[0].listing.id).toBe(rareMatch.id);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('gives a bonus for the same brand', () => {
    const target = listing({ tags: ['common-tag'], brand: 'Omega' });
    const sameBrand = listing({ tags: ['common-tag'], brand: 'Omega' });
    const otherBrand = listing({ tags: ['common-tag'], brand: 'Rolex' });

    const results = similar(target, [sameBrand, otherBrand], rarity);
    const same = results.find((r) => r.listing.id === sameBrand.id)!;
    const other = results.find((r) => r.listing.id === otherBrand.id)!;
    expect(same.score).toBeGreaterThan(other.score);
  });

  it('restricts to a price window around a priced target', () => {
    const target = listing({ tags: ['common-tag'], priceGBP: 1000 });
    const inWindow = listing({ tags: ['common-tag'], priceGBP: 1800 });
    const tooExpensive = listing({ tags: ['common-tag'], priceGBP: 5000 });
    const unpriced = listing({ tags: ['common-tag'], priceGBP: null });

    const results = similar(target, [inWindow, tooExpensive, unpriced], rarity);
    const ids = results.map((r) => r.listing.id);
    expect(ids).toContain(inWindow.id);
    expect(ids).not.toContain(tooExpensive.id);
    expect(ids).not.toContain(unpriced.id);
  });

  it('imposes no price restriction when the target is unpriced', () => {
    const target = listing({ tags: ['common-tag'], priceGBP: null });
    const candidate = listing({ tags: ['common-tag'], priceGBP: 50000 });

    const results = similar(target, [candidate], rarity);
    expect(results.map((r) => r.listing.id)).toContain(candidate.id);
  });

  it('excludes the target itself and listings sharing its fingerprint', () => {
    const target = listing({ tags: ['common-tag'] });
    const sameFingerprint = listing({ tags: ['common-tag'], fingerprint: target.fingerprint });

    const results = similar(target, [target, sameFingerprint], rarity);
    expect(results).toHaveLength(0);
  });

  it('returns nothing when there is no shared tag or brand', () => {
    const target = listing({ tags: ['rare-tag'], brand: 'Omega' });
    const unrelated = listing({ tags: ['other-tag'], brand: 'Rolex' });

    expect(similar(target, [unrelated], rarity)).toHaveLength(0);
  });

  it('respects the limit', () => {
    const target = listing({ tags: ['common-tag'] });
    const pool = Array.from({ length: 20 }, () => listing({ tags: ['common-tag'] }));

    const results = similar(target, pool, rarity, 3);
    expect(results).toHaveLength(3);
  });
});
