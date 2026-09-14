import { describe, expect, it } from 'vitest';
import { parseSpottedYaml, rowToListing, type SpottedRow } from '../src/spotted.ts';

const NOW = '2026-09-14T12:00:00.000Z';

const row = (over: Partial<SpottedRow> = {}): SpottedRow => ({
  shortcode: 'ABC123xyz',
  permalink: 'https://www.instagram.com/p/ABC123xyz/',
  dealer: 'doblevintagewatches',
  caption: 'Rare Piaget Ellipse Malachite dial, stunning original condition. £4,500. DM to reserve.',
  price: '',
  note: '',
  issue: 12,
  filedAt: NOW,
  ...over,
});

describe('rowToListing', () => {
  it('runs the caption through normalise() so tagging, oddity and brand match every other source', () => {
    const l = rowToListing(row(), NOW);
    expect(l.source).toBe('spotted');
    expect(l.sourceName).toBe('Spotted on Instagram');
    expect(l.url).toBe('https://www.instagram.com/p/ABC123xyz/');
    expect(l.images).toEqual([]);
    expect(l.brand).toBe('Piaget');
    expect(l.tags).toContain('malachite');
    expect(l.price).toEqual({ amount: 4500, currency: 'GBP' });
    expect(l.priceGBP).toBe(4500);
    expect(l.available).toBe(true);
  });

  it('is stable across an edited issue: same shortcode -> same id', () => {
    const a = rowToListing(row({ caption: 'first pass, no price yet' }), NOW);
    const b = rowToListing(row({ caption: 'edited, now with a price £3,000' }), NOW);
    expect(a.id).toBe(b.id);
  });

  it('falls back to the price field and then the note when the caption is empty', () => {
    const l = rowToListing(row({ caption: '', price: '£2,200', note: 'IWC Mark XI, sector dial' }), NOW);
    expect(l.price).toEqual({ amount: 2200, currency: 'GBP' });
    expect(l.title).toContain('IWC Mark XI');
  });

  it('reads a separate price field when the caption has no price of its own', () => {
    const l = rowToListing(
      row({ caption: 'Beautiful Omega Seamaster, all original.', price: '£1,950' }),
      NOW,
    );
    expect(l.price).toEqual({ amount: 1950, currency: 'GBP' });
  });

  it('marks it unavailable when the caption says sold', () => {
    const l = rowToListing(row({ caption: 'Gorgeous Rolex Datejust — sold, thanks everyone!' }), NOW);
    expect(l.available).toBe(false);
  });

  it('keeps an entry even when the caption reads as not-a-listing - the owner filed it on purpose', () => {
    const l = rowToListing(row({ caption: 'Happy New Year from all of us!', note: '' }), NOW);
    expect(l).toBeTruthy();
    expect(l.source).toBe('spotted');
  });

  it('never leaves the title empty, even with nothing pasted at all', () => {
    const l = rowToListing(row({ caption: '', price: '', note: '' }), NOW);
    expect(l.title.length).toBeGreaterThan(0);
    expect(l.title).toContain('doblevintagewatches');
  });
});

describe('parseSpottedYaml', () => {
  it('reads an empty spotted: [] as no rows', () => {
    expect(parseSpottedYaml('spotted: []\n')).toEqual([]);
  });

  it('reads a header-commented file with no rows', () => {
    expect(parseSpottedYaml('# some header\n\nspotted: []\n')).toEqual([]);
  });

  it('reads rows out of a populated file', () => {
    const text = `spotted:\n  - shortcode: ABC123xyz\n    permalink: https://www.instagram.com/p/ABC123xyz/\n    dealer: doble\n    caption: "Piaget malachite"\n    price: ""\n    note: ""\n    issue: 1\n    filedAt: "${NOW}"\n`;
    const rows = parseSpottedYaml(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].shortcode).toBe('ABC123xyz');
  });

  it('is safe against garbage input, never throwing', () => {
    expect(parseSpottedYaml('not: [valid, yaml,')).toEqual([]);
    expect(parseSpottedYaml('')).toEqual([]);
  });
});
