import { describe, expect, it } from 'vitest';
import { buildVocab } from '../vocab.ts';
import { parse } from '../src/parse.ts';
import { EMPTY, apply, fromQuery, toQuery, type Filters } from '../src/filters.ts';
import type { Listing } from '../src/types.ts';

const vocab = buildVocab();

type Case = {
  q: string;
  patch: Partial<Filters>;
  leftover: string;
};

const GREEN_STONES = ['malachite', 'jade', 'chrysocolla', 'aventurine', 'amazonite', 'bloodstone'];
const BLUE_STONES = ['lapis-lazuli', 'sodalite', 'turquoise'];
const WOVEN = [
  'woven-bracelet', 'bamboo-bracelet', 'rope-bracelet', 'corn-bracelet', 'claw-bracelet',
  'brick-bracelet', 'bark-bracelet', 'ladder-bracelet', 'beads-of-rice', 'tubogas',
];

const cases: Case[] = [
  // --- verbatim from the product owner ---
  {
    q: 'gold dress watch with a green stone dial under £3,000',
    patch: { maxPrice: 3000, anyTags: [GREEN_STONES] },
    leftover: 'gold dress dial',
  },
  {
    q: 'something like a Piaget Ellipse but cheaper',
    patch: { brands: ['Piaget'], anyTags: [['ellipse']] },
    leftover: 'cheaper',
  },
  { q: 'malachite under 3k', patch: { maxPrice: 3000, anyTags: [['malachite']] }, leftover: '' },
  {
    q: '70s tonneau cartier',
    patch: { eras: ['1970s'], anyTags: [['tonneau']], brands: ['Cartier'] },
    leftover: '',
  },
  { q: 'small jade ladies', patch: { maxCase: 32, anyTags: [['ladies'], ['jade']] }, leftover: '' },
  {
    q: 'between £500 and £2,000 woven',
    patch: { minPrice: 500, maxPrice: 2000, anyTags: [WOVEN] },
    leftover: '',
  },
  { q: '34mm', patch: { minCase: 33, maxCase: 35 }, leftover: '' },
  { q: 'grails only', patch: { grailsOnly: true }, leftover: 'only' },
  {
    q: 'blue stone dial over 5k',
    patch: { minPrice: 5000, anyTags: [BLUE_STONES] },
    leftover: 'dial',
  },
  { q: 'tiger eye', patch: { anyTags: [['tigers-eye']] }, leftover: '' },
  { q: "tiger's eye", patch: { anyTags: [['tigers-eye']] }, leftover: '' },
  { q: 'purple unicorn', patch: {}, leftover: 'purple unicorn' },
  { q: '', patch: {}, leftover: '' },

  // --- price ---
  { q: 'under £1,000', patch: { maxPrice: 1000 }, leftover: '' },
  { q: 'below 800', patch: { maxPrice: 800 }, leftover: '' },
  { q: 'less than 500', patch: { maxPrice: 500 }, leftover: '' },
  { q: 'max 2000', patch: { maxPrice: 2000 }, leftover: '' },
  { q: 'up to 1500', patch: { maxPrice: 1500 }, leftover: '' },
  { q: 'no more than 4000', patch: { maxPrice: 4000 }, leftover: '' },
  { q: '<2000', patch: { maxPrice: 2000 }, leftover: '' },
  { q: 'over £2,000', patch: { minPrice: 2000 }, leftover: '' },
  { q: 'above 3000', patch: { minPrice: 3000 }, leftover: '' },
  { q: 'from £1,500', patch: { minPrice: 1500 }, leftover: '' },
  { q: 'min 500', patch: { minPrice: 500 }, leftover: '' },
  { q: 'at least 200', patch: { minPrice: 200 }, leftover: '' },
  { q: '>5000', patch: { minPrice: 5000 }, leftover: '' },
  { q: '£3,000', patch: { maxPrice: 3000 }, leftover: '' },
  { q: '2500-4000', patch: { minPrice: 2500, maxPrice: 4000 }, leftover: '' },
  { q: '1000 to 2000', patch: { minPrice: 1000, maxPrice: 2000 }, leftover: '' },
  { q: 'cheap', patch: { maxPrice: 2000 }, leftover: '' },
  { q: 'expensive', patch: { minPrice: 10000 }, leftover: '' },
  { q: 'expensive patek', patch: { minPrice: 10000 }, leftover: 'patek' },

  // --- era ---
  { q: "'70s", patch: { eras: ['1970s'] }, leftover: '' },
  { q: '1970s', patch: { eras: ['1970s'] }, leftover: '' },
  { q: 'seventies', patch: { eras: ['1970s'] }, leftover: '' },
  { q: 'nineties omega', patch: { eras: ['1990s'], brands: ['Omega'] }, leftover: '' },
  { q: 'vintage rolex', patch: { brands: ['Rolex'] }, leftover: '' },

  // --- case ---
  { q: 'small', patch: { maxCase: 32 }, leftover: '' },
  { q: 'large tonneau', patch: { minCase: 38, anyTags: [['tonneau']] }, leftover: '' },
  { q: 'midsize cartier tank', patch: { minCase: 33, maxCase: 37, brands: ['Cartier'] }, leftover: '' },

  // --- grail / oddity ---
  { q: 'holy grail', patch: { grailsOnly: true }, leftover: '' },
  { q: 'weird', patch: { minOddity: 60 }, leftover: '' },
  { q: 'strange oddball', patch: { minOddity: 60 }, leftover: '' },

  // --- brand / model ---
  { q: 'royal oak', patch: { brands: ['Audemars Piguet'] }, leftover: '' },
  { q: 'reverso', patch: { brands: ['Jaeger-Lecoultre'] }, leftover: '' },
  { q: 'grand seiko', patch: { brands: ['Grand Seiko'] }, leftover: '' },
  // "carrera" is also a model key -> Heuer, mentioned alongside "Tag Heuer"
  // itself; both are recognised brand mentions and both are removed from leftover.
  { q: 'tag heuer carrera', patch: { brands: ['Tag Heuer', 'Heuer'] }, leftover: '' },
];

describe('parse', () => {
  for (const { q, patch, leftover } of cases) {
    it(`"${q}"`, () => {
      const result = parse(q, vocab);
      expect(result.patch).toEqual(patch);
      expect(result.leftover).toBe(leftover);
    });
  }

  it('produces understood entries in query order', () => {
    const result = parse('70s tonneau cartier', vocab);
    expect(result.understood.map((u) => u.kind)).toEqual(['era', 'tags', 'brand']);
  });

  it('labels a multi-tag phrase with the tag names it expands to', () => {
    const result = parse('green stone dial', vocab);
    expect(result.understood[0].label).toBe(
      'green stone → malachite, jade, chrysocolla, aventurine, amazonite, bloodstone',
    );
  });

  it('reconstructs a tag label that virtual:vocab drops as mechanically derivable', () => {
    // web/vite.config.ts ships a tag's `label` only when it differs from the
    // naive title-case of its id, to save bytes; parse.ts must fall back to
    // that same derivation when label is absent from the real bundle.
    const naiveLabel = (tag: string) => tag.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const trimmed = {
      ...vocab,
      tags: vocab.tags.map((t) => ({
        ...t,
        label: t.label === naiveLabel(t.tag) ? (undefined as unknown as string) : t.label,
      })),
    };
    const onyx = parse('onyx', trimmed); // "Onyx" is naive-derivable -> dropped from the shipped payload
    expect(onyx.understood[0].label).toBe('Onyx');
    const tigers = parse('tiger eye', trimmed); // "Tiger's eye" is not naive-derivable -> kept
    expect(tigers.understood[0].label).toBe("Tiger's eye");
  });

  it('gives "vintage" a noop chip rather than a filter', () => {
    const result = parse('vintage', vocab);
    expect(result.patch).toEqual({});
    expect(result.understood).toEqual([
      { text: 'vintage', kind: 'noop', label: 'vintage: everything here is', patch: {} },
    ]);
  });

  it('is deterministic and cheap on a long, junk-filled input', () => {
    const long = 'malachite '.repeat(50) + 'x'.repeat(500);
    const start = performance.now();
    const a = parse(long, vocab);
    const b = parse(long, vocab);
    expect(performance.now() - start).toBeLessThan(200);
    expect(a).toEqual(b);
    // input is capped at 200 chars before anything else happens
    expect(a.patch.anyTags).toEqual([['malachite']]);
  });

  it('never throws on empty or whitespace-only input', () => {
    expect(() => parse('', vocab)).not.toThrow();
    expect(() => parse('   ', vocab)).not.toThrow();
    expect(parse('   ', vocab).leftover).toBe('');
  });
});

describe('parse -> Filters round trip via toQuery/fromQuery', () => {
  it('round-trips anyTags and brands through the URL', () => {
    const { patch } = parse('gold dress watch with a green stone dial under £3,000 piaget', vocab);
    const merged: Filters = { ...EMPTY, ...patch };
    const restored = fromQuery(toQuery(merged));
    expect(restored.anyTags).toEqual(merged.anyTags);
    expect(restored.brands).toEqual(merged.brands);
    expect(restored.maxPrice).toBe(merged.maxPrice);
  });

  it('encodes multiple anyTags groups with | inside a group and , between groups', () => {
    const f: Filters = { ...EMPTY, anyTags: [['malachite', 'jade'], ['onyx']], brands: ['Piaget', 'Cartier'] };
    const qs = toQuery(f);
    expect(qs).toContain('any=malachite%7Cjade%2Conyx');
    expect(qs).toContain('brand=Piaget%2CCartier');
    const restored = fromQuery(qs);
    expect(restored.anyTags).toEqual([['malachite', 'jade'], ['onyx']]);
    expect(restored.brands).toEqual(['Piaget', 'Cartier']);
  });

  it('fromQuery on an empty search yields EMPTY-shaped anyTags/brands', () => {
    const restored = fromQuery('');
    expect(restored.anyTags).toEqual([]);
    expect(restored.brands).toEqual([]);
  });
});

// ---------------------------------------------------------------- apply()

const listing = (over: Partial<Listing>): Listing => ({
  id: over.id ?? 'id',
  fingerprint: 'fp',
  source: 'src',
  sourceName: 'Src',
  url: 'https://example.com',
  title: 't',
  description: 'd',
  brand: null,
  reference: null,
  price: null,
  priceGBP: null,
  images: [],
  tags: [],
  grail: false,
  oddity: 0,
  caseSizeMm: null,
  era: null,
  firstSeen: '2024-01-01T00:00:00.000Z',
  lastSeen: '2024-01-01T00:00:00.000Z',
  available: true,
  status: 'active',
  priceHistory: [],
  ...over,
});

describe('apply() with anyTags and brands', () => {
  const listings: Listing[] = [
    listing({ id: 'a', brand: 'Piaget', tags: ['malachite'] }),
    listing({ id: 'b', brand: 'Cartier', tags: ['onyx'] }),
    listing({ id: 'c', brand: 'Cartier', tags: ['malachite', 'onyx'] }),
    listing({ id: 'd', brand: null, tags: ['jade'] }),
  ];

  it('anyTags groups OR within a group and AND across groups', () => {
    const f: Filters = { ...EMPTY, anyTags: [['malachite', 'jade'], ['onyx']] };
    const ids = apply(listings, f, null).map((l) => l.id);
    // needs (malachite OR jade) AND onyx -> only 'c'
    expect(ids).toEqual(['c']);
  });

  it('anyTags is independent of tags (both must be satisfied)', () => {
    const f: Filters = { ...EMPTY, tags: ['onyx'], anyTags: [['malachite']] };
    const ids = apply(listings, f, null).map((l) => l.id);
    expect(ids).toEqual(['c']);
  });

  it('brands matches case-insensitively against l.brand', () => {
    const f: Filters = { ...EMPTY, brands: ['cartier'] };
    const ids = apply(listings, f, null).map((l) => l.id).sort();
    expect(ids).toEqual(['b', 'c']);
  });

  it('an unbranded listing fails a brand filter', () => {
    const f: Filters = { ...EMPTY, brands: ['Piaget'] };
    const ids = apply(listings, f, null).map((l) => l.id);
    expect(ids).toEqual(['a']);
  });
});
