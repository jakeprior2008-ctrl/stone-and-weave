import { politeFetch } from '../http.ts';
import { tagsFor } from '../enrich.ts';
import type { Dealer, RawListing } from '../types.ts';

/**
 * Generic adapter for shops with no bulk feed (Squarespace, Wix, WooCommerce).
 * Walks sitemap.xml for product URLs, then reads schema.org Product JSON-LD off
 * each page. One request per product, so it is rate-limited hard and capped.
 */
export async function fetchJsonLd(dealer: Dealer, maxProducts?: number): Promise<RawListing[]> {
  const all = await productUrls(dealer);
  if (all.length === 0) throw new Error('no product URLs found in sitemap');

  // On a big marketplace, fetching every page would take hours and almost all
  // of it would be ordinary steel sports watches. The slug already carries the
  // description, so tag it first and only spend a request on the odd ones.
  const urls = dealer.prefilter ? all.filter(isInteresting) : all;
  const cap = maxProducts ?? dealer.maxProducts ?? 400;
  if (dealer.prefilter) {
    console.log(`    ${all.length} products, ${urls.length} match the taxonomy`);
  }

  const out: RawListing[] = [];
  for (const url of urls.slice(0, cap)) {
    const res = await politeFetch(url, { delayMs: 900, accept: 'text/html' });
    if (!res.ok) continue;
    const listing = parseProduct(res.text, url);
    if (listing) out.push(listing);
  }
  return out;
}

/** Cheap slug-only test: does this URL look like something worth fetching? */
export function isInteresting(url: string): boolean {
  const slug = url.split('/').pop()?.replace(/-/g, ' ') ?? '';
  return tagsFor(slug).length > 0;
}

async function productUrls(dealer: Dealer): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [`${dealer.url}/sitemap.xml`];
  const marker = dealer.productPath ?? '/p/';

  // Follow one level of sitemap index, which is all any of these shops use.
  for (let i = 0; i < queue.length && i < 12; i++) {
    // Deliberately not Accept: application/xml — Squarespace answers 406 to a
    // restrictive Accept on its sitemap, which silently killed this adapter.
    const res = await politeFetch(queue[i], { delayMs: 800, accept: '*/*' });
    if (!res.ok) continue;

    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    for (const loc of locs) {
      if (loc.endsWith('.xml') && !queue.includes(loc)) queue.push(loc);
      else if (loc.includes(marker)) seen.add(loc);
    }
  }
  return [...seen];
}

/** Exported for tests - pure string in, listing out. */
export function parseProduct(html: string, url: string): RawListing | null {
  for (const block of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    // A page may carry several graphs; only one is the Product.
    for (const node of Array.isArray(data) ? data : [data]) {
      const n = node as Record<string, any>;
      if (n?.['@type'] !== 'Product') continue;

      const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers;
      const amount = Number.parseFloat(offer?.price);
      const images = (Array.isArray(n.image) ? n.image : [n.image])
        .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
        // Squarespace serves http:// in JSON-LD; the page itself is https.
        .map((s: string) => s.replace(/^http:\/\//, 'https://'))
        .slice(0, 8);

      return {
        sourceId: offer?.sku ?? url.split('/').pop() ?? url,
        url,
        title: String(n.name ?? '').split(' — ')[0].trim(),
        description: String(n.description ?? ''),
        price:
          Number.isFinite(amount) && amount > 0
            ? { amount, currency: offer?.priceCurrency ?? 'GBP' }
            : null,
        images,
        available: !/OutOfStock|SoldOut/i.test(String(offer?.availability ?? '')),
        publishedAt: null,
        vendor: null,
      };
    }
  }
  return null;
}
