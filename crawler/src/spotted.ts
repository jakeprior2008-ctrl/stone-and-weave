import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { readCaption } from './caption.ts';
import { normalise } from './normalise.ts';
import type { Dealer, Listing, RawListing } from './types.ts';

/** Shape written by scripts/parse-spotted-issue.ts. */
export type SpottedRow = {
  shortcode: string;
  permalink: string;
  dealer: string;
  caption: string;
  price: string;
  note: string;
  issue?: number;
  filedAt?: string;
};

export const SPOTTED_DEALER: Dealer = {
  id: 'spotted',
  name: 'Spotted on Instagram',
  url: 'https://www.instagram.com',
  adapter: 'jsonld',
};

/** Parse the YAML text of sources/spotted.yml into rows. Empty/absent -> []. */
export function parseSpottedYaml(text: string): SpottedRow[] {
  try {
    const doc = parse(text) as { spotted?: SpottedRow[] } | null;
    return doc?.spotted ?? [];
  } catch (err) {
    console.log(`  ✗ Spotted on Instagram — ${err instanceof Error ? err.message : err} (spotted.yml ignored)`);
    return [];
  }
}

/**
 * Turn one issue-filed row into a Listing through the same normalise() every
 * other source goes through, so tagging, oddity, grail, era and case size
 * all come from one code path.
 *
 * No images: Instagram's CDN URLs are signed and expire, so a spotted entry
 * is deliberately imageless and links straight back to the post instead.
 */
export function rowToListing(row: SpottedRow, now: string): Listing {
  // The caption is the primary read. When nothing was pasted, fall back to
  // reading the free-text price field and the note instead.
  const text = row.caption.trim() || [row.price, row.note].filter((s) => s.trim()).join('\n');
  const read = readCaption(text);

  // A caption price wins; a separate price-field price fills in only if the
  // caption didn't mention one and isn't itself "price on request".
  let price = read.price;
  if (!price && !read.priceOnRequest && row.price.trim()) {
    price = readCaption(row.price).price;
  }

  const title = read.title || row.note.trim() || `Spotted on Instagram — @${row.dealer}`;

  if (!read.isListing) {
    // Heuristic says this doesn't look like stock for sale - logged, not
    // acted on. The owner filed it on purpose, so his judgement wins.
    console.log(`  · ${row.shortcode} kept despite heuristic (${read.reason}): ${title.slice(0, 60)}`);
  }

  const raw: RawListing = {
    sourceId: row.shortcode,
    url: row.permalink,
    title,
    description: row.caption.trim() || row.note.trim() || row.price.trim(),
    price,
    images: [],
    available: !read.sold,
  };

  return normalise(raw, SPOTTED_DEALER, now);
}

/**
 * All spotted listings for this crawl. A missing or empty sources/spotted.yml
 * yields an empty list and changes nothing else, so the file is safe to ship
 * before a single issue has ever been filed.
 */
export function loadSpotted(now: string): Listing[] {
  const path = 'sources/spotted.yml';
  if (!existsSync(path)) return [];
  return parseSpottedYaml(readFileSync(path, 'utf8')).map((row) => rowToListing(row, now));
}
