import { describe, expect, it } from 'vitest';
import { apply, EMPTY } from '../src/filters.ts';
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

describe('apply: brand filter', () => {
  it('matches a brand case-insensitively', () => {
    const omega = listing({ brand: 'Omega' });
    const rolex = listing({ brand: 'Rolex' });
    const out = apply([omega, rolex], { ...EMPTY, brands: ['omega'] }, null);
    expect(out.map((l) => l.id)).toEqual([omega.id]);
  });

  it('excludes a listing with no brand rather than letting it through', () => {
    const omega = listing({ brand: 'Omega' });
    const unbranded = listing({ brand: null });
    const out = apply([omega, unbranded], { ...EMPTY, brands: ['Omega'] }, null);
    expect(out.map((l) => l.id)).toEqual([omega.id]);
  });

  it('ANDs the brand filter with a tag filter', () => {
    const match = listing({ brand: 'Omega', tags: ['grail'] });
    const wrongTag = listing({ brand: 'Omega', tags: [] });
    const wrongBrand = listing({ brand: 'Rolex', tags: ['grail'] });
    const out = apply(
      [match, wrongTag, wrongBrand],
      { ...EMPTY, brands: ['Omega'], tags: ['grail'] },
      null,
    );
    expect(out.map((l) => l.id)).toEqual([match.id]);
  });
});
