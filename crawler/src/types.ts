export type Tag = { tag: string; label: string; group: string; rarity: number };

export type Money = { amount: number; currency: string };

export type PricePoint = { date: string; amount: number; currency: string };

/** What an adapter returns. Deliberately loose - normalise.ts tightens it. */
export type RawListing = {
  sourceId: string;
  url: string;
  title: string;
  description?: string;
  price?: Money | null;
  images?: string[];
  available?: boolean;
  publishedAt?: string | null;
  vendor?: string | null;
};

export type Listing = {
  id: string;
  fingerprint: string;
  source: string;
  sourceName: string;
  url: string;
  title: string;
  description: string;
  brand: string | null;
  reference: string | null;
  price: Money | null;
  priceGBP: number | null;
  images: string[];
  tags: string[];
  grail: boolean;
  oddity: number;
  caseSizeMm: number | null;
  era: string | null;
  firstSeen: string;
  lastSeen: string;
  missedCrawls: number;
  available: boolean;
  status: 'active' | 'gone';
  priceHistory: PricePoint[];
};

export type SourceMeta = {
  id: string;
  name: string;
  url: string;
  adapter: string;
  lastRun: string;
  lastSuccess: string | null;
  count: number;
  ok: boolean;
  error: string | null;
};

export type Dealer = {
  id: string;
  name: string;
  url: string;
  adapter: 'shopify' | 'jsonld';
  productPath?: string;
  currency?: string;
  region?: string;
  instagram?: string;
  priority?: number;
  /** Tag-filter the sitemap before fetching pages. For large marketplaces. */
  prefilter?: boolean;
  maxProducts?: number;
  notes?: string;
  enabled?: boolean;
};
