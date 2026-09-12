import type { RawListing } from '../types.ts';

/**
 * eBay Browse API. Needs a free developer key; without one the crawl simply
 * skips eBay rather than failing, so the repo works for anyone who clones it.
 *
 * Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as repo secrets to switch on.
 */
const SEARCHES = [
  'vintage watch stone dial', 'malachite dial watch', 'lapis lazuli dial watch',
  'tigers eye dial watch', 'onyx dial vintage watch', 'coral dial watch',
  'feather dial watch', 'vintage watch woven bracelet', 'vintage watch mesh bracelet',
  'hammered bracelet vintage watch', 'beads of rice bracelet watch',
  'bamboo bracelet watch', 'vintage cocktail watch gold',
];

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(id: string, secret: string): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });
  if (!res.ok) throw new Error(`eBay auth failed: HTTP ${res.status}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  return json.access_token;
}

export async function fetchEbay(marketplace = 'EBAY_GB', perSearch = 40): Promise<RawListing[]> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) {
    console.log('  eBay: no credentials set, skipping (set EBAY_CLIENT_ID/SECRET to enable)');
    return [];
  }

  const token = await getToken(id, secret);
  const byId = new Map<string, RawListing>();

  for (const q of SEARCHES) {
    const url =
      'https://api.ebay.com/buy/browse/v1/item_summary/search' +
      `?q=${encodeURIComponent(q)}&limit=${perSearch}&filter=buyingOptions:{FIXED_PRICE|AUCTION}`;
    try {
      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': marketplace,
        },
      });
      if (!res.ok) {
        console.warn(`  eBay: "${q}" returned HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { itemSummaries?: any[] };
      for (const item of json.itemSummaries ?? []) {
        const amount = Number.parseFloat(item.price?.value);
        // Searches overlap heavily; keep one entry per item.
        byId.set(item.itemId, {
          sourceId: item.itemId,
          url: item.itemWebUrl,
          title: item.title ?? '',
          description: [item.shortDescription, item.condition, q].filter(Boolean).join(' '),
          price:
            Number.isFinite(amount) && amount > 0
              ? { amount, currency: item.price?.currency ?? 'GBP' }
              : null,
          images: [item.image?.imageUrl, ...(item.thumbnailImages ?? []).map((t: any) => t.imageUrl)]
            .filter(Boolean)
            .slice(0, 6),
          available: true,
          publishedAt: item.itemCreationDate ?? null,
          vendor: item.seller?.username ?? null,
        });
      }
    } catch (err) {
      console.warn(`  eBay: "${q}" failed - ${err instanceof Error ? err.message : err}`);
    }
  }

  return [...byId.values()];
}
