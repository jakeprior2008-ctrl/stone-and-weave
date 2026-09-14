import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { fetchEbay } from './adapters/ebay.ts';
import { fetchInstagram } from './adapters/instagram.ts';
import { fetchJsonLd } from './adapters/jsonld.ts';
import { fetchShopify } from './adapters/shopify.ts';
import { findMatches, loadRules, pushNtfy } from './alerts.ts';
import { ALL_TAGS, GROUPS, looksLikeAccessory } from './enrich.ts';
import { normalise } from './normalise.ts';
import { SPOTTED_DEALER, loadSpotted } from './spotted.ts';
import { merge, pruneArchive, readJson, writeJson } from './store.ts';
import type { Dealer, Listing, SourceMeta } from './types.ts';

const DATA = 'data';
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY_RUN = flag('dry-run');
const ONLY = value('source');

async function main() {
  const now = new Date().toISOString();
  const registry = parse(readFileSync('sources/dealers.yml', 'utf8')) as { dealers: Dealer[] };
  const dealers = registry.dealers
    .filter((d) => d.enabled !== false)
    .filter((d) => !ONLY || d.id === ONLY)
    .sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));

  console.log(`Stone & Weave crawl — ${dealers.length} dealer(s)${DRY_RUN ? ' [dry run]' : ''}\n`);

  const fresh: Listing[] = [];
  const meta: SourceMeta[] = [];
  const succeeded = new Set<string>();
  const prevMeta = readJson<SourceMeta[]>(`${DATA}/meta.json`, []);

  for (const dealer of dealers) {
    const before = fresh.length;
    try {
      const raw =
        dealer.adapter === 'shopify' ? await fetchShopify(dealer) : await fetchJsonLd(dealer);
      for (const r of raw) {
        if (!r.title || !r.url) continue;
        if (looksLikeAccessory(r.title)) continue;
        fresh.push(normalise(r, dealer, now));
      }
      succeeded.add(dealer.id);
      const count = fresh.length - before;
      console.log(`  ✓ ${dealer.name.padEnd(26)} ${String(count).padStart(4)} listings`);
      meta.push({
        id: dealer.id, name: dealer.name, url: dealer.url, adapter: dealer.adapter,
        lastRun: now, lastSuccess: now, count, ok: true, error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${dealer.name.padEnd(26)} ${message}`);
      // A failed source keeps its previous listings - see store.merge.
      meta.push({
        id: dealer.id, name: dealer.name, url: dealer.url, adapter: dealer.adapter,
        lastRun: now, lastSuccess: prevMeta.find((m) => m.id === dealer.id)?.lastSuccess ?? null,
        count: 0, ok: false, error: message,
      });
    }
  }

  if (!ONLY) {
    // Instagram is JS-behind-auth and cannot be crawled, so these come from
    // the owner's own eyes via a GitHub Issue Form instead - see
    // .github/workflows/spotted.yml. Always "succeeds": a hand-filed find
    // must never be aged out by an absent or empty spotted.yml.
    const spotted = loadSpotted(now);
    if (spotted.length > 0) {
      fresh.push(...spotted);
      succeeded.add(SPOTTED_DEALER.id);
      console.log(`  ✓ ${SPOTTED_DEALER.name.padEnd(26)} ${String(spotted.length).padStart(4)} listings`);
      meta.push({
        id: SPOTTED_DEALER.id, name: SPOTTED_DEALER.name, url: SPOTTED_DEALER.url, adapter: 'spotted',
        lastRun: now, lastSuccess: now, count: spotted.length, ok: true, error: null,
      });
    }
  }

  if (!ONLY) {
    try {
      const ebayDealer: Dealer = {
        id: 'ebay', name: 'eBay', url: 'https://www.ebay.co.uk', adapter: 'shopify', currency: 'GBP',
      };
      const raw = await fetchEbay();
      if (raw.length > 0) {
        for (const r of raw) fresh.push(normalise(r, ebayDealer, now));
        succeeded.add('ebay');
        console.log(`  ✓ ${'eBay'.padEnd(26)} ${String(raw.length).padStart(4)} listings`);
        meta.push({
          id: 'ebay', name: 'eBay', url: ebayDealer.url, adapter: 'ebay',
          lastRun: now, lastSuccess: now, count: raw.length, ok: true, error: null,
        });
      }
    } catch (err) {
      console.log(`  ✗ eBay — ${err instanceof Error ? err.message : err}`);
    }

    try {
      const instagramDealer: Dealer = {
        id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com', adapter: 'shopify',
      };
      const raw = await fetchInstagram();
      if (raw.length > 0) {
        for (const r of raw) fresh.push(normalise(r, instagramDealer, now));
        succeeded.add('instagram');
        console.log(`  ✓ ${'Instagram'.padEnd(26)} ${String(raw.length).padStart(4)} listings`);
        meta.push({
          id: 'instagram', name: 'Instagram', url: instagramDealer.url, adapter: 'instagram',
          lastRun: now, lastSuccess: now, count: raw.length, ok: true, error: null,
        });
      }
    } catch (err) {
      console.log(`  ✗ Instagram — ${err instanceof Error ? err.message : err}`);
    }
  }

  // State lives in two files so the browser only pays for what it shows.
  const existing = [
    ...readJson<Listing[]>(`${DATA}/listings.json`, []),
    ...readJson<Listing[]>(`${DATA}/sold.json`, []),
  ];
  const result = merge(existing, fresh, succeeded, now);

  console.log(
    `\n${result.listings.length} active · ${result.newListings.length} new · ` +
      `${result.priceDrops.length} price drop(s) · ${result.archived.length} archived`,
  );

  const grails = result.newListings.filter((l) => l.grail);
  if (grails.length) {
    console.log(`\n🏆 ${grails.length} grail(s) in this crawl:`);
    for (const g of grails.slice(0, 10)) {
      console.log(`   ${g.title.slice(0, 68)} — ${g.tags.join(', ')}`);
    }
  }

  if (DRY_RUN) {
    console.log('\nDry run — nothing written.');
    const top = [...result.listings].sort((a, b) => b.oddity - a.oddity).slice(0, 15);
    for (const l of top) {
      console.log(`  ${String(l.oddity).padStart(3)} ${l.title.slice(0, 60).padEnd(62)} ${l.tags.slice(0, 4).join(',')}`);
    }
    return;
  }

  const archive = pruneArchive(
    [...readJson<Listing[]>(`${DATA}/archive.json`, []), ...result.archived],
    new Date(),
  );

  // Everything for sale loads up front. The sold archive is a separate file
  // the browser fetches only if you ask to see it, and keeps only pieces with
  // some character - nobody needs 10,000 sold steel three-handers. Sold copy is
  // dropped too: it is reference material, and the full text is at the dealer.
  const forSale = result.listings.filter((l) => l.available);
  const soldArchive = result.listings
    .filter((l) => !l.available && l.tags.length > 0)
    .map((l) => ({ ...l, description: '', images: l.images.slice(0, 1) }));

  writeJson(`${DATA}/listings.json`, forSale);
  writeJson(`${DATA}/sold.json`, soldArchive);
  writeJson(`${DATA}/archive.json`, archive);
  writeJson(`${DATA}/meta.json`, meta);
  writeJson(`${DATA}/taxonomy.json`, { groups: GROUPS, tags: ALL_TAGS });
  writeJson(`${DATA}/hunt.json`, parse(readFileSync('sources/hunt.yml', 'utf8')));
  console.log(
    `\nWrote listings.json (${forSale.length} for sale), sold.json ` +
      `(${soldArchive.length} archived), archive.json (${archive.length} delisted).`,
  );

  // Alerts are last: the dataset is already safely on disk by this point.
  const topic = process.env.NTFY_TOPIC;
  const hits = findMatches(result.newListings.filter((l) => l.available), loadRules());
  if (hits.length === 0) {
    console.log('No watchlist matches this crawl.');
  } else if (!topic) {
    console.log(`${hits.length} watchlist match(es) — set NTFY_TOPIC to get them pushed:`);
    for (const h of hits.slice(0, 8)) console.log(`   [${h.rule.name}] ${h.listing.title.slice(0, 60)}`);
  } else {
    const sent = await pushNtfy(topic, hits);
    console.log(`Pushed ${sent}/${hits.length} watchlist match(es) to ntfy.`);
  }
}

main().catch((err) => {
  console.error('Crawl failed:', err);
  process.exit(1);
});
