import type { Hunt as HuntData } from './types.ts';

/**
 * The places we deliberately don't crawl - no API, anti-bot, or terms that
 * don't allow it. One click away instead of silently missing.
 */
export function Hunt({ hunt }: { hunt: HuntData | null }) {
  if (!hunt) return <p class="empty">Hunt directory not loaded yet.</p>;

  return (
    <div class="hunt">
      <section>
        <h3>Instagram</h3>
        <p class="note">
          Instagram has no usable public API and scraping it breaks their terms, so these are
          link-outs. Several of these dealers are crawled properly in Browse as well — but the
          drops land here first.
        </p>
        <div class="cards">
          {hunt.instagram.map((a) => (
            <a key={a.handle} href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noopener noreferrer">
              <strong>{a.name}</strong>
              <span class="handle">@{a.handle}</span>
              {a.note && <span class="note">{a.note}</span>}
            </a>
          ))}
        </div>
      </section>

      <section>
        <h3>Chrono24 saved searches</h3>
        <p class="note">
          Chrono24 blocks crawlers, so these open straight into a pre-filtered result set, newest
          first.
        </p>
        <div class="pills">
          {hunt.chrono24.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
          ))}
        </div>
      </section>

      <section>
        <h3>Auctions &amp; markets</h3>
        <div class="cards">
          {hunt.auctions.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer">
              <strong>{a.name}</strong>
              {a.note && <span class="note">{a.note}</span>}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
