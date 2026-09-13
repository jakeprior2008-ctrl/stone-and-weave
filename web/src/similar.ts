import type { Listing } from './types.ts';

/**
 * Rarity-weighted tag overlap (a weighted Jaccard index) between the target
 * listing and every other for-sale listing already in the browser, plus small
 * bonuses for a shared brand, era, or close case size. No embeddings, no
 * extra payload - just the fields already loaded for the grid.
 */
export function similar(
  target: Listing,
  pool: Listing[],
  rarity: Map<string, number>,
  limit = 8,
): { listing: Listing; score: number }[] {
  const targetTags = new Set(target.tags);
  const targetBrand = target.brand?.toLowerCase() ?? null;
  const hasPrice = target.priceGBP !== null;
  const minPrice = hasPrice ? target.priceGBP! * 0.5 : null;
  const maxPrice = hasPrice ? target.priceGBP! * 2 : null;

  const weight = (t: string) => (rarity.get(t) ?? 0) + 1;

  const scored: { listing: Listing; score: number }[] = [];

  for (const candidate of pool) {
    if (candidate.id === target.id) continue;
    if (candidate.fingerprint === target.fingerprint) continue;

    const candidateBrand = candidate.brand?.toLowerCase() ?? null;
    const sameBrand = targetBrand !== null && candidateBrand !== null && targetBrand === candidateBrand;

    const shared: string[] = [];
    const union = new Set(targetTags);
    for (const t of candidate.tags) union.add(t);
    let sharedWeight = 0;
    let unionWeight = 0;
    for (const t of union) {
      const w = weight(t);
      unionWeight += w;
      if (targetTags.has(t) && candidate.tags.includes(t)) {
        sharedWeight += w;
        shared.push(t);
      }
    }

    if (shared.length === 0 && !sameBrand) continue;

    if (hasPrice) {
      if (candidate.priceGBP === null) continue;
      if (candidate.priceGBP < minPrice! || candidate.priceGBP > maxPrice!) continue;
    }

    let score = unionWeight > 0 ? (sharedWeight / unionWeight) * 10 : 0;
    if (sameBrand) score += 2;
    if (target.era && candidate.era && target.era === candidate.era) score += 1;
    if (
      target.caseSizeMm !== null &&
      candidate.caseSizeMm !== null &&
      Math.abs(target.caseSizeMm - candidate.caseSizeMm) <= 2
    ) {
      score += 1;
    }

    scored.push({ listing: candidate, score });
  }

  scored.sort((a, b) => b.score - a.score || b.listing.oddity - a.listing.oddity);
  return scored.slice(0, limit);
}
