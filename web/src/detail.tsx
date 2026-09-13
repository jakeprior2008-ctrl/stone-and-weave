import { useEffect } from 'preact/hooks';
import { money } from './card.tsx';
import { daysListed } from './filters.ts';
import type { Listing } from './types.ts';

function Spark({ points }: { points: { date: string; amount: number }[] }) {
  if (points.length < 2) return null;
  const amounts = points.map((p) => p.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 28 - ((p.amount - min) / span) * 24;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const fell = amounts.at(-1)! < amounts[0];

  return (
    <div class="spark">
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Price history">
        <path d={d} fill="none" stroke={fell ? 'var(--green)' : 'var(--accent)'} stroke-width="1.5" />
      </svg>
      <span>
        {points.length} price points · {fell ? 'down' : 'up'} from{' '}
        {amounts[0].toLocaleString()}
      </span>
    </div>
  );
}

export function Detail({
  listing,
  related,
  onClose,
}: {
  listing: Listing;
  related: Listing[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="scrim" onClick={onClose}>
      <aside class="drawer" onClick={(e) => e.stopPropagation()}>
        <button class="close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div class="shots">
          {listing.images.slice(0, 6).map((src) => (
            <img key={src} src={src} alt={listing.title} loading="lazy" />
          ))}
        </div>

        <h2>{listing.title}</h2>

        <div class="headline">
          <strong>{money(listing)}</strong>
          {listing.priceGBP !== null && listing.price?.currency !== 'GBP' && (
            <span class="approx">≈ £{listing.priceGBP.toLocaleString()}</span>
          )}
        </div>

        <dl class="facts">
          <div><dt>Dealer</dt><dd>{listing.sourceName}</dd></div>
          {listing.brand && <div><dt>Brand</dt><dd>{listing.brand}</dd></div>}
          {listing.reference && <div><dt>Reference</dt><dd>{listing.reference}</dd></div>}
          {listing.caseSizeMm && <div><dt>Case</dt><dd>{listing.caseSizeMm}mm</dd></div>}
          {listing.era && <div><dt>Era</dt><dd>{listing.era}</dd></div>}
          <div><dt>Oddity</dt><dd>{listing.oddity}/100</dd></div>
          <div><dt>Seen</dt><dd>{daysListed(listing)} days ago</dd></div>
        </dl>

        {listing.tags.length > 0 && (
          <div class="chips wide">
            {listing.tags.map((t) => (
              <span class="chip" key={t}>{t.replace(/-/g, ' ')}</span>
            ))}
          </div>
        )}

        <Spark points={listing.priceHistory} />

        {listing.description && <p class="desc">{listing.description}</p>}

        {related.length > 0 && (
          <div class="related">
            <h4>Also listed elsewhere</h4>
            {related.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer">
                {r.sourceName} — {money(r)}
              </a>
            ))}
          </div>
        )}

        <a class="cta" href={listing.url} target="_blank" rel="noopener noreferrer">
          View at {listing.sourceName} ↗
        </a>
      </aside>
    </div>
  );
}
