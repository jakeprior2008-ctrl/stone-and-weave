import { daysListed, dropPct } from './filters.ts';
import type { Listing } from './types.ts';

/**
 * Dealer CDNs serve full-resolution files - Squarespace hands back 1500px and
 * Shopify the original upload. A phone showing a 200px tile should not download
 * either, and both CDNs resize on request, so ask for what we actually draw.
 */
export function thumb(url: string, width = 500): string {
  if (/static\d?\.squarespace\.com/.test(url)) {
    return url.replace(/([?&])format=\d+w/, `$1format=${width}w`);
  }
  if (/cdn\.shopify\.com/.test(url)) {
    // Shopify sizes via a _WxH suffix on the filename, before any query string.
    return url.replace(/(\.(?:jpe?g|png|webp|gif))(\?|$)/i, `_${width}x$1$2`);
  }
  return url;
}

export const money = (l: Listing) =>
  l.price
    ? new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: l.price.currency,
        maximumFractionDigits: 0,
      }).format(l.price.amount)
    : 'POA';

export function Card({
  listing,
  isNew,
  onOpen,
}: {
  listing: Listing;
  isNew: boolean;
  onOpen: (l: Listing) => void;
}) {
  const drop = dropPct(listing);
  const days = daysListed(listing);

  return (
    <article class={`card${listing.grail ? ' grail' : ''}${listing.available ? '' : ' sold'}`} onClick={() => onOpen(listing)}>
      <div class="thumb">
        {listing.images[0] ? (
          <img src={thumb(listing.images[0])} alt={listing.title} loading="lazy" decoding="async" />
        ) : (
          <div class="noimg">no image</div>
        )}
        {listing.grail && <span class="badge grail-badge">grail</span>}
        {isNew && !listing.grail && <span class="badge new-badge">new</span>}
        {drop >= 3 && listing.available && <span class="badge drop-badge">−{Math.round(drop)}%</span>}
        {!listing.available && <span class="badge sold-badge">sold</span>}
      </div>

      <div class="info">
        <h3>{listing.title}</h3>
        <div class="line">
          <strong>{money(listing)}</strong>
          <span class="dealer">{listing.sourceName}</span>
        </div>
        <div class="chips">
          {listing.tags.slice(0, 3).map((t) => (
            <span class="chip" key={t}>
              {t.replace(/-/g, ' ')}
            </span>
          ))}
          {listing.tags.length > 3 && <span class="chip more">+{listing.tags.length - 3}</span>}
        </div>
        <div class="meta">
          <span class="odd" title="Oddity score">
            {listing.oddity}
          </span>
          {listing.caseSizeMm && <span>{listing.caseSizeMm}mm</span>}
          {listing.era && <span>{listing.era}</span>}
          <span class="days">{days === 0 ? 'today' : `${days}d`}</span>
        </div>
      </div>
    </article>
  );
}
