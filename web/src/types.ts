export type Listing = {
  id: string; fingerprint: string; source: string; sourceName: string; url: string;
  title: string; description: string; brand: string | null; reference: string | null;
  price: { amount: number; currency: string } | null; priceGBP: number | null;
  images: string[]; tags: string[]; grail: boolean; oddity: number;
  caseSizeMm: number | null; era: string | null; firstSeen: string; lastSeen: string;
  available: boolean;
  status: string; priceHistory: { date: string; amount: number; currency: string }[];
};

export type Taxonomy = {
  groups: Record<string, string>;
  tags: { tag: string; label: string; group: string; rarity: number }[];
};

export type SourceMeta = {
  id: string; name: string; url: string; lastRun: string; lastSuccess: string | null;
  count: number; ok: boolean; error: string | null;
};

export type Hunt = {
  instagram: { handle: string; name: string; note?: string }[];
  auctions: { name: string; url: string; note?: string }[];
  chrono24: { name: string; url: string }[];
};
