import { politeFetch } from '../http.ts';
import type { Dealer, RawListing } from '../types.ts';

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  published_at: string | null;
  tags: string[] | string;
  images: { src: string }[];
  variants: { price: string; available: boolean }[];
};

const PAGE = 250;

/**
 * Shopify exposes the full catalogue as JSON on every storefront. Bulk, cheap,
 * and structured - one request per 250 products, no HTML parsing.
 */
export async function fetchShopify(dealer: Dealer, maxPages = 30): Promise<RawListing[]> {
  const out: RawListing[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${dealer.url}/products.json?limit=${PAGE}&page=${page}`;
    const res = await politeFetch(url, { accept: 'application/json' });
    if (!res.ok) {
      if (page === 1) throw new Error(`HTTP ${res.status} on ${url}`);
      break;
    }

    let products: ShopifyProduct[];
    try {
      products = (JSON.parse(res.text).products ?? []) as ShopifyProduct[];
    } catch {
      if (page === 1) throw new Error('products.json did not return JSON (parked domain?)');
      break;
    }
    if (products.length === 0) break;

    for (const p of products) {
      const variant = p.variants?.[0];
      const amount = variant ? Number.parseFloat(variant.price) : NaN;
      const tagText = Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags ?? '');

      out.push({
        sourceId: String(p.id),
        url: `${dealer.url}/products/${p.handle}`,
        title: p.title,
        description: `${p.body_html ?? ''} ${tagText}`,
        price:
          Number.isFinite(amount) && amount > 0
            ? { amount, currency: dealer.currency ?? 'USD' }
            : null,
        images: (p.images ?? []).map((i) => i.src).slice(0, 8),
        available: p.variants?.some((v) => v.available) ?? true,
        publishedAt: p.published_at,
        vendor: p.vendor || null,
      });
    }

    if (products.length < PAGE) break;
  }

  return out;
}
