import MiniSearch from 'minisearch';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Card } from './card.tsx';
import { Detail } from './detail.tsx';
import { Hunt as HuntTab } from './hunt.tsx';
import { Rail } from './rail.tsx';
import { apply, fromQuery, toQuery, type Filters } from './filters.ts';
import { loadPins, togglePin } from './pins.ts';
import { parse } from './parse.ts';
import { similar } from './similar.ts';
import type { Hunt, Listing, SourceMeta, Taxonomy } from './types.ts';
import vocab from 'virtual:vocab';

const base = import.meta.env.BASE_URL;
const json = async <T,>(file: string, fallback: T): Promise<T> => {
  try {
    const res = await fetch(`${base}${file}`);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
};

const LAST_VISIT = 'stone-and-weave:last-visit';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Removes one understood term's matched text from the raw query so the
// parse re-runs without it - a case-insensitive, whitespace-collapsing
// substring removal, since `text` comes from the lowercased, clipped copy
// of `q` that parse() actually scanned.
function removeTerm(q: string, text: string): string {
  const re = new RegExp(escapeRe(text), 'i');
  return q.replace(re, ' ').replace(/\s+/g, ' ').trim();
}

// Same, but for a single leftover word: bounded so removing "gold" never
// eats part of a longer word it happens to be a substring of.
function removeWord(q: string, word: string): string {
  const re = new RegExp(String.raw`\b${escapeRe(word)}\b`, 'i');
  return q.replace(re, ' ').replace(/\s+/g, ' ').trim();
}

// "gold", "dress" and "dial" - quoted, comma-separated, no Oxford comma.
function quoteList(words: string[]): string {
  const quoted = words.map((w) => `"${w}"`);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

export function App() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [sold, setSold] = useState<Listing[] | null>(null);
  const [loadingSold, setLoadingSold] = useState(false);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ groups: {}, tags: [] });
  const [meta, setMeta] = useState<SourceMeta[]>([]);
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [filters, setFilters] = useState<Filters>(() => fromQuery(location.search));
  const [selected, setSelected] = useState<Listing | null>(null);
  const [tab, setTab] = useState<'browse' | 'hunt'>('browse');
  const [railOpen, setRailOpen] = useState(false);
  const [pins, setPins] = useState<Set<string>>(() => loadPins());
  const [lastVisit] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_VISIT);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    json<Listing[]>('listings.json', []).then(setListings);
    json<Taxonomy>('taxonomy.json', { groups: {}, tags: [] }).then(setTaxonomy);
    json<SourceMeta[]>('meta.json', []).then(setMeta);
    json<Hunt | null>('hunt.json', null).then(setHunt);
    try {
      localStorage.setItem(LAST_VISIT, new Date().toISOString());
    } catch {
      /* private mode - the badge is a nicety, not a requirement */
    }
  }, []);

  // The sold archive is a separate megabyte-scale file, so it is fetched once,
  // and only if you actually ask to see it.
  useEffect(() => {
    const needsArchive = filters.includeSold || (filters.pinnedOnly && pins.size > 0);
    if (!needsArchive || sold !== null || loadingSold) return;
    setLoadingSold(true);
    json<Listing[]>('sold.json', []).then((s) => {
      setSold(s);
      setLoadingSold(false);
    });
  }, [filters.includeSold, filters.pinnedOnly, pins.size, sold, loadingSold]);

  useEffect(() => {
    const q = toQuery(filters);
    history.replaceState(null, '', q ? `?${q}` : location.pathname);
  }, [filters]);

  const corpus = useMemo(
    () => ((filters.includeSold || filters.pinnedOnly) && sold ? [...(listings ?? []), ...sold] : listings),
    [listings, sold, filters.includeSold, filters.pinnedOnly],
  );

  const rarityMap = useMemo(
    () => new Map(taxonomy.tags.map((t) => [t.tag, t.rarity])),
    [taxonomy],
  );

  const index = useMemo(() => {
    if (!corpus) return null;
    const mini = new MiniSearch<Listing>({
      fields: ['title', 'description', 'brand', 'sourceName', 'tags', 'reference'],
      storeFields: ['id'],
      searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND' },
      extractField: (doc, field) =>
        field === 'tags' ? doc.tags.join(' ') : ((doc as any)[field] ?? ''),
    });
    mini.addAll(corpus);
    return mini;
  }, [corpus]);

  // The search box is parsed into filter-shaped state (tags, brand, price,
  // era, case, grail, oddity) without ever writing back into `filters` -
  // the rail keeps showing only what the user explicitly checked. What's
  // left over after parsing (e.g. "gold dress dial") still goes to the text
  // index, same as the whole query did before.
  const parsed = useMemo(() => parse(filters.q, vocab), [filters.q]);
  const effectiveFilters = useMemo<Filters>(() => ({ ...filters, ...parsed.patch }), [filters, parsed]);

  const matchedIds = useMemo(() => {
    if (!index || !parsed.leftover.trim()) return null;
    return new Set(index.search(parsed.leftover).map((r) => r.id as string));
  }, [index, parsed.leftover]);

  const results = useMemo(
    () => (corpus ? apply(corpus, effectiveFilters, matchedIds, pins) : []),
    [corpus, effectiveFilters, matchedIds, pins],
  );

  const leftoverWords = useMemo(
    () => (parsed.leftover.trim() ? parsed.leftover.trim().split(/\s+/) : []),
    [parsed.leftover],
  );

  // Per leftover word: whether the text index finds it *anywhere* in the
  // corpus at all, independent of the other filters. Zero hits means the
  // word itself is not understood by the index (not just "no match here");
  // a hit elsewhere means it was searched, even if this particular
  // combination came up empty.
  const wordHits = useMemo(() => {
    if (!index || leftoverWords.length === 0) return null;
    return leftoverWords.map((w) => index.search(w).length > 0);
  }, [index, leftoverWords]);

  // What the chips alone (price/era/tags/brand/etc, no text index) match -
  // used to tell "the chips are fine, the extra words just don't fit" apart
  // from "even the chips alone match nothing".
  const chipsOnlyCount = useMemo(
    () => (corpus ? apply(corpus, effectiveFilters, null, pins).length : 0),
    [corpus, effectiveFilters, pins],
  );

  const freshCount = useMemo(
    () => (lastVisit && listings ? listings.filter((l) => l.firstSeen > lastVisit).length : 0),
    [lastVisit, listings],
  );

  const stale = meta.filter((m) => !m.ok);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div class="shell">
      <header class="top">
        <div class="brand">
          <h1>Stone &amp; Weave</h1>
          <span class="tagline">Stone dials, odd weaves, difficult things</span>
        </div>

        <div class="tabs">
          <button class={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>
            Browse
          </button>
          <button class={tab === 'hunt' ? 'on' : ''} onClick={() => setTab('hunt')}>
            Hunt
          </button>
        </div>

        {tab === 'browse' && (
          <div class="search-wrap">
            <input
              class="search"
              type="search"
              placeholder="green stone dial under £3k · 70s Piaget · something like a Cartier Tank"
              value={filters.q}
              onInput={(e) => set({ q: (e.target as HTMLInputElement).value })}
            />
            {filters.q.trim() && (
              <div class="parsed">
                {parsed.understood.map((u, i) => (
                  <span class={`chip ${u.kind === 'noop' ? 'noop' : ''}`} key={i}>
                    {u.label}
                    {u.kind !== 'noop' && (
                      <button
                        class="x"
                        type="button"
                        aria-label={`Remove "${u.label}" from the search`}
                        onClick={() => set({ q: removeTerm(filters.q, u.text) })}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {leftoverWords.length > 0 && (
                  <>
                    <span class="chip-label">text:</span>
                    {leftoverWords.map((word, i) => (
                      <span class="chip free" key={`free-${i}`}>
                        {word}
                        <button
                          class="x"
                          type="button"
                          aria-label={`Remove "${word}" from the search`}
                          onClick={() => set({ q: removeWord(filters.q, word) })}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {tab === 'hunt' ? (
        <HuntTab hunt={hunt} />
      ) : (
        <div class="body">
          <button class="rail-toggle" onClick={() => setRailOpen((o) => !o)}>
            {railOpen ? 'Hide filters' : 'Filters'}
            {filters.tags.length > 0 && <span class="pip">{filters.tags.length}</span>}
          </button>

          <Rail
            open={railOpen}
            filters={filters}
            set={set}
            taxonomy={taxonomy}
            listings={corpus ?? []}
            meta={meta}
            pinCount={pins.size}
          />

          <main>
            <div class="bar">
              <span class="count">
                {listings === null
                  ? 'Loading…'
                  : loadingSold
                    ? 'Loading the sold archive…'
                    : `${results.length.toLocaleString()} watches`}
                {freshCount > 0 && <em class="fresh"> · {freshCount} new since your last visit</em>}
              </span>

              <select
                value={filters.sort}
                onChange={(e) => set({ sort: (e.target as HTMLSelectElement).value as Filters['sort'] })}
              >
                <option value="oddity">Weird &amp; wonderful</option>
                <option value="new">Newest found</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="drop">Biggest price drop</option>
                <option value="stale">Longest listed</option>
              </select>
            </div>

            {stale.length > 0 && (
              <p class="stale">
                {stale.length} source{stale.length > 1 ? 's' : ''} did not respond on the last crawl
                ({stale.map((s) => s.name).join(', ')}). Their listings are held, not deleted.
              </p>
            )}

            {listings !== null && !loadingSold && results.length === 0 && (
              <p class="empty">
                {filters.pinnedOnly
                  ? 'Nothing pinned yet. Tap ☆ on anything you want to keep an eye on.'
                  : filters.q.trim()
                    ? leftoverWords.length > 0
                      ? (() => {
                          const searched = wordHits
                            ? leftoverWords.filter((_, i) => wordHits[i])
                            : leftoverWords;
                          const notUnderstood = wordHits
                            ? leftoverWords.filter((_, i) => !wordHits[i])
                            : [];
                          const chipsClause =
                            chipsOnlyCount === 0
                              ? 'The chips alone match nothing — try removing a chip.'
                              : `The chips alone match ${chipsOnlyCount.toLocaleString()} watch${
                                  chipsOnlyCount === 1 ? '' : 'es'
                                }${searched.length ? `, but none also mention ${quoteList(searched)}.` : '.'}`;
                          const notUnderstoodClause = notUnderstood.length
                            ? ` Not understood: ${notUnderstood.join(', ')}.`
                            : '';
                          return `Nothing matches. ${chipsClause}${notUnderstoodClause} Remove a word or a chip.`;
                        })()
                      : 'Nothing matches that combination — try removing a chip.'
                    : `Nothing matches. ${filters.tags.length > 0 ? 'Tags combine with AND — try removing one.' : ''}`}
              </p>
            )}

            <div class="grid">
              {results.slice(0, 600).map((l) => (
                <Card
                  key={l.id}
                  listing={l}
                  isNew={!!lastVisit && l.firstSeen > lastVisit}
                  pinned={pins.has(l.id)}
                  onPin={(id) => setPins((p) => togglePin(p, id))}
                  onOpen={setSelected}
                />
              ))}
            </div>

            {results.length > 600 && (
              <p class="more">Showing the first 600 of {results.length.toLocaleString()} — narrow the filters to see the rest.</p>
            )}
          </main>
        </div>
      )}

      {selected && (
        <Detail
          listing={selected}
          related={(listings ?? []).filter(
            (l) => l.fingerprint === selected.fingerprint && l.id !== selected.id,
          )}
          similar={similar(selected, listings ?? [], rarityMap).map((s) => s.listing)}
          onOpen={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
