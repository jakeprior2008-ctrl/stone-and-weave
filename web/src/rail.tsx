import { useMemo } from 'preact/hooks';
import type { Filters } from './filters.ts';
import type { Listing, SourceMeta, Taxonomy } from './types.ts';

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export function Rail({
  open,
  filters,
  set,
  taxonomy,
  listings,
  meta,
}: {
  open: boolean;
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  taxonomy: Taxonomy;
  listings: Listing[];
  meta: SourceMeta[];
}) {
  // Counts make the rail honest: you can see there are 12 malachites before clicking.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of listings) for (const t of l.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return c;
  }, [listings]);

  const eras = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings) if (l.era) set.add(l.era);
    return [...set].sort();
  }, [listings]);

  const byGroup = useMemo(() => {
    const g = new Map<string, Taxonomy['tags']>();
    for (const t of taxonomy.tags) {
      if (!counts.has(t.tag)) continue; // hide tags nothing currently matches
      g.set(t.group, [...(g.get(t.group) ?? []), t]);
    }
    for (const list of g.values()) {
      list.sort((a, b) => (counts.get(b.tag) ?? 0) - (counts.get(a.tag) ?? 0));
    }
    return g;
  }, [taxonomy, counts]);

  const active =
    filters.tags.length + filters.sources.length + filters.eras.length > 0 ||
    filters.grailsOnly ||
    filters.includeSold ||
    filters.minOddity > 0 ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.minCase !== null ||
    filters.maxCase !== null;

  return (
    <aside class={`rail${open ? ' open' : ''}`}>
      <label class="grail-switch">
        <input
          type="checkbox"
          checked={filters.grailsOnly}
          onChange={(e) => set({ grailsOnly: (e.target as HTMLInputElement).checked })}
        />
        <span>Grails only</span>
        <small>feather, coral, stone</small>
      </label>

      <label class="sold-switch">
        <input
          type="checkbox"
          checked={filters.includeSold}
          onChange={(e) => set({ includeSold: (e.target as HTMLInputElement).checked })}
        />
        <span>Include sold</span>
        <small>dealer archives — what exists, not what's buyable</small>
      </label>

      <section>
        <h4>
          Oddity <span class="val">{filters.minOddity}+</span>
        </h4>
        <input
          type="range"
          min={0}
          max={95}
          step={5}
          value={filters.minOddity}
          onInput={(e) => set({ minOddity: Number((e.target as HTMLInputElement).value) })}
        />
      </section>

      <section>
        <h4>Price (£)</h4>
        <div class="pair">
          <input type="number" placeholder="min" value={filters.minPrice ?? ''}
            onInput={(e) => set({ minPrice: numOrNull((e.target as HTMLInputElement).value) })} />
          <input type="number" placeholder="max" value={filters.maxPrice ?? ''}
            onInput={(e) => set({ maxPrice: numOrNull((e.target as HTMLInputElement).value) })} />
        </div>
      </section>

      <section>
        <h4>Case (mm)</h4>
        <div class="pair">
          <input type="number" placeholder="min" value={filters.minCase ?? ''}
            onInput={(e) => set({ minCase: numOrNull((e.target as HTMLInputElement).value) })} />
          <input type="number" placeholder="max" value={filters.maxCase ?? ''}
            onInput={(e) => set({ maxCase: numOrNull((e.target as HTMLInputElement).value) })} />
        </div>
      </section>

      {[...byGroup.entries()].map(([group, tags]) => (
        <section key={group}>
          <h4>{taxonomy.groups[group] ?? group}</h4>
          <ul class="tags">
            {tags.map((t) => (
              <li key={t.tag}>
                <label>
                  <input
                    type="checkbox"
                    checked={filters.tags.includes(t.tag)}
                    onChange={() => set({ tags: toggle(filters.tags, t.tag) })}
                  />
                  <span>{t.label}</span>
                  <em>{counts.get(t.tag)}</em>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {eras.length > 0 && (
        <section>
          <h4>Era</h4>
          <ul class="tags cols">
            {eras.map((e) => (
              <li key={e}>
                <label>
                  <input type="checkbox" checked={filters.eras.includes(e)}
                    onChange={() => set({ eras: toggle(filters.eras, e) })} />
                  <span>{e}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4>Dealer</h4>
        <ul class="tags">
          {meta.map((m) => (
            <li key={m.id}>
              <label>
                <input type="checkbox" checked={filters.sources.includes(m.id)}
                  onChange={() => set({ sources: toggle(filters.sources, m.id) })} />
                <span class={m.ok ? '' : 'down'}>{m.name}</span>
                <em>{m.count || ''}</em>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {active && (
        <button
          class="clear"
          onClick={() =>
            set({
              tags: [], sources: [], eras: [], grailsOnly: false, includeSold: false, minOddity: 0,
              minPrice: null, maxPrice: null, minCase: null, maxCase: null,
            })
          }
        >
          Clear filters
        </button>
      )}
    </aside>
  );
}

const numOrNull = (v: string) => (v === '' ? null : Number(v));
