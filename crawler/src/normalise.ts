import { createHash } from 'node:crypto';
import { BRAND_DISPLAY, CANONICAL_BRANDS, KNOWN_BRANDS } from './brands.ts';
import { isGrail, oddityScore, searchableText, tagsFor } from './enrich.ts';
import type { Dealer, Listing, RawListing } from './types.ts';

/**
 * Static FX table. Deliberately not a live API call: prices here are for
 * sorting and rough filtering, not settlement, and a dead API must never be
 * able to break a crawl. Refresh occasionally by hand.
 */
export const FX_TO_GBP: Record<string, number> = {
  GBP: 1, USD: 0.79, EUR: 0.86, CHF: 0.92, HKD: 0.1, JPY: 0.0052,
  SGD: 0.59, AUD: 0.52, CAD: 0.57, SEK: 0.075, DKK: 0.115,
};

export function toGBP(amount: number, currency: string): number | null {
  const rate = FX_TO_GBP[currency.toUpperCase()];
  return rate ? Math.round(amount * rate) : null;
}

const VENDOR_PLACEHOLDERS = new Set(['default title', 'n/a', '-', 'unknown']);

// Words that add nothing when comparing a Shopify vendor string against the
// dealer's own name - "Vintage Watch Specialist" the vendor vs "Vintage Watch
// Specialist Ltd" the dealer should still be recognised as the same name.
const NAME_FILLER = /\b(watches?|vintage|london|co|ltd)\b/g;

const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(NAME_FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when a Shopify `vendor` string is really just the dealer's own name. */
function vendorNamesDealer(vendor: string, dealerName: string): boolean {
  const v = normaliseName(vendor);
  const d = normaliseName(dealerName);
  if (!v || !d) return false;
  return v === d || d.includes(v) || v.includes(d);
}

export function detectBrand(
  text: string,
  vendor?: string | null,
  dealerName?: string,
): string | null {
  const haystack = text.toLowerCase();
  // Longest match first so "grand seiko" never resolves to "seiko".
  const hit = [...KNOWN_BRANDS]
    .sort((a, b) => b.length - a.length)
    .find((b) => haystack.includes(b));
  if (hit) return BRAND_DISPLAY[hit] ?? hit.replace(/\b\w/g, (c) => c.toUpperCase());

  const v = vendor?.trim();
  if (!v) return null;
  if (VENDOR_PLACEHOLDERS.has(v.toLowerCase())) return null;
  if (dealerName && vendorNamesDealer(v, dealerName)) return null;
  return v;
}

export function isCanonicalBrand(b: string | null): boolean {
  return b !== null && CANONICAL_BRANDS.includes(b);
}

export function detectReference(text: string): string | null {
  const m = text.match(/\bref(?:erence)?(?:\.\s*|:\s*|\s+)((?=[A-Z0-9./-]*\d)[A-Z0-9][A-Z0-9./-]{2,})/i);
  return m ? m[1].replace(/[.,]$/, '') : null;
}

export function detectCaseSize(text: string): number | null {
  // Prefer an explicit "34mm"; ignore anything implausible for a wristwatch.
  for (const m of text.matchAll(/\b(\d{2}(?:\.\d)?)\s?mm\b/gi)) {
    const n = Number.parseFloat(m[1]);
    if (n >= 18 && n <= 50) return n;
  }
  return null;
}

export function detectEra(text: string): string | null {
  const decade = text.match(/\b(19[2-9]0)s\b/);
  if (decade) return `${decade[1]}s`;
  const circa = text.match(/\b(?:circa|c\.)\s?(19[2-9]\d|20[0-2]\d)\b/i);
  if (circa) return `${circa[1].slice(0, 3)}0s`;
  const year = text.match(/\b(19[2-9]\d)\b/);
  return year ? `${year[1].slice(0, 3)}0s` : null;
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** Stable across crawls: same listing at the same dealer always gets the same id. */
export const listingId = (dealerId: string, sourceId: string) => sha1(`${dealerId}:${sourceId}`);

/** Loose identity, used to spot the same watch listed by two dealers. */
export function fingerprint(brand: string | null, ref: string | null, title: string): string {
  const core = [brand ?? '', ref ?? '', title.toLowerCase().replace(/[^a-z0-9 ]/g, '')]
    .join(' ')
    .replace(/\b(the|a|and|with|original|papers|box|vintage|watch|mm)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return sha1(core);
}

export function normalise(raw: RawListing, dealer: Dealer, now: string): Listing {
  const text = searchableText(raw.title, raw.description ?? '', raw.url);
  const tags = tagsFor(text, raw.title);
  const brand = detectBrand(text, raw.vendor, dealer.name);
  const price = raw.price ?? null;

  return {
    id: listingId(dealer.id, raw.sourceId),
    fingerprint: fingerprint(brand, detectReference(text), raw.title),
    source: dealer.id,
    sourceName: dealer.name,
    url: raw.url,
    title: raw.title,
    description: (raw.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      // The full copy lives at the dealer; this is the gist for search and the
      // drawer. 11k listings are fetched as one file, so every byte is paid for.
      .slice(0, 280),
    brand,
    reference: detectReference(text),
    price,
    priceGBP: price ? toGBP(price.amount, price.currency) : null,
    images: (raw.images ?? []).slice(0, 3),
    tags,
    grail: isGrail(tags),
    oddity: oddityScore(tags, brand !== null),
    caseSizeMm: detectCaseSize(text),
    era: detectEra(text),
    firstSeen: now,
    lastSeen: now,
    missedCrawls: 0,
    available: raw.available !== false,
    status: 'active',
    priceHistory: price ? [{ date: now.slice(0, 10), amount: price.amount, currency: price.currency }] : [],
  };
}
