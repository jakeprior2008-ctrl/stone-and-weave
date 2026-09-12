import { describe, expect, it } from 'vitest';
import { merge } from '../src/store.ts';
import type { Listing } from '../src/types.ts';

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'a', fingerprint: 'f', source: 'doble', sourceName: 'Doble',
  url: 'https://x/1', title: 'Piaget', description: '', brand: 'Piaget', reference: null,
  price: { amount: 100, currency: 'GBP' }, priceGBP: 100, images: [], tags: [], grail: false,
  oddity: 50, caseSizeMm: null, era: null, available: true, firstSeen: '2026-01-01T00:00:00Z',
  lastSeen: '2026-01-01T00:00:00Z', missedCrawls: 0, status: 'active',
  priceHistory: [{ date: '2026-01-01', amount: 100, currency: 'GBP' }], ...over,
});

const NOW = '2026-02-01T00:00:00Z';
const ok = new Set(['doble']);

describe('merge', () => {
  it('never overwrites firstSeen', () => {
    const { listings } = merge([listing()], [listing({ firstSeen: NOW })], ok, NOW);
    expect(listings[0].firstSeen).toBe('2026-01-01T00:00:00Z');
    expect(listings[0].lastSeen).toBe(NOW);
  });

  it('reports genuinely new listings', () => {
    const { newListings } = merge([listing()], [listing(), listing({ id: 'b' })], ok, NOW);
    expect(newListings.map((l) => l.id)).toEqual(['b']);
  });

  it('records price drops', () => {
    const cheaper = listing({ price: { amount: 80, currency: 'GBP' }, priceGBP: 80 });
    const { priceDrops, listings } = merge([listing()], [cheaper], ok, NOW);
    expect(priceDrops[0]).toMatchObject({ from: 100, to: 80 });
    expect(listings[0].priceHistory).toHaveLength(2);
  });

  it('does not archive on a single absence', () => {
    const { listings, archived } = merge([listing()], [], ok, NOW);
    expect(archived).toHaveLength(0);
    expect(listings[0].missedCrawls).toBe(1);
  });

  it('archives only after two consecutive misses', () => {
    const once = merge([listing()], [], ok, NOW);
    const twice = merge(once.listings, [], ok, NOW);
    expect(twice.archived).toHaveLength(1);
    expect(twice.listings).toHaveLength(0);
  });

  it('holds listings steady when their source failed', () => {
    // A dealer having a bad five minutes must not age out their inventory.
    const { listings, archived } = merge([listing()], [], new Set(), NOW);
    expect(archived).toHaveLength(0);
    expect(listings[0].missedCrawls).toBe(0);
  });
});
