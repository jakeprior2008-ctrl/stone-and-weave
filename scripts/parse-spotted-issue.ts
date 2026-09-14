import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

/**
 * Turns a "Spotted on Instagram" issue form submission into a
 * sources/spotted.yml entry. Pure and testable on its own — the only I/O is
 * in main(), which is skipped on import.
 */

export type SpottedEntry = {
  shortcode: string;
  permalink: string;
  dealer: string;
  caption: string;
  price: string;
  note: string;
  issue: number;
  filedAt: string;
};

// GitHub Issue Forms render each field as a "### Label" heading followed by
// its value, with an unfilled optional field rendered as literally
// "_No response_".
const HEADING_RE = /^###\s+(.+?)\s*$/gm;

/** Map the issue form's field labels onto our internal field names. */
const LABELS: Record<string, keyof RawFields> = {
  'post link': 'permalink',
  caption: 'caption',
  dealer: 'dealer',
  price: 'price',
  "why it's interesting": 'note',
};

type RawFields = { permalink: string; caption: string; dealer: string; price: string; note: string };

/** Split a rendered issue body into { label: value } by its "### " headings. */
export function parseIssueBody(body: string): Record<string, string> {
  const text = body ?? '';
  const headings = [...text.matchAll(HEADING_RE)];
  const out: Record<string, string> = {};

  for (let i = 0; i < headings.length; i++) {
    const label = headings[i][1].trim().toLowerCase();
    const start = (headings[i].index ?? 0) + headings[i][0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index! : text.length;
    const value = text.slice(start, end).trim();
    out[label] = value === '_No response_' ? '' : value;
  }
  return out;
}

/** Pull just the fields the spotted form cares about, everything else ignored. */
export function extractFields(body: string): RawFields {
  const byLabel = parseIssueBody(body);
  const fields: RawFields = { permalink: '', caption: '', dealer: '', price: '', note: '' };
  for (const [label, key] of Object.entries(LABELS)) {
    if (byLabel[label] !== undefined) fields[key] = byLabel[label];
  }
  return fields;
}

export type PermalinkResult =
  | { ok: true; shortcode: string; handle: string | null; permalink: string }
  | { ok: false; reason: string };

// https://www.instagram.com/p/SHORTCODE/ or /reel/SHORTCODE/, optionally
// prefixed with the poster's handle (instagram.com/handle/p/SHORTCODE/) and
// optionally with a query string.
const PERMALINK_RE =
  /^https:\/\/(?:www\.)?instagram\.com\/(?:([A-Za-z0-9_.]+)\/)?(p|reel)\/([A-Za-z0-9_-]+)\/?(?:\?.*)?$/;

export function validatePermalink(raw: string): PermalinkResult {
  const url = raw.trim();
  if (!url) {
    return { ok: false, reason: 'The post link is missing.' };
  }
  if (!/^https:\/\//.test(url)) {
    return { ok: false, reason: 'The post link must start with https://.' };
  }
  if (!/instagram\.com/.test(url)) {
    return { ok: false, reason: 'That is not an instagram.com link.' };
  }
  const m = url.match(PERMALINK_RE);
  if (!m) {
    return {
      ok: false,
      reason:
        'That does not look like a post or reel link. Expected something like ' +
        'https://www.instagram.com/p/SHORTCODE/ or https://www.instagram.com/reel/SHORTCODE/.',
    };
  }
  const [, handle, kind, shortcode] = m;
  return { ok: true, shortcode, handle: handle ?? null, permalink: `https://www.instagram.com/${kind}/${shortcode}/` };
}

export type ParseResult =
  | { ok: true; entry: SpottedEntry }
  | { ok: false; reason: string };

/** Build the spotted.yml entry a form submission produces, or say why it can't. */
export function parseSpottedIssue(body: string, issueNumber: number, now: string): ParseResult {
  const fields = extractFields(body);
  const permalink = validatePermalink(fields.permalink);
  if (!permalink.ok) return { ok: false, reason: permalink.reason };

  const dealer = fields.dealer.trim() || permalink.handle || 'unknown';

  return {
    ok: true,
    entry: {
      shortcode: permalink.shortcode,
      permalink: permalink.permalink,
      dealer,
      caption: fields.caption.trim(),
      price: fields.price.trim(),
      note: fields.note.trim(),
      issue: issueNumber,
      filedAt: now,
    },
  };
}

/**
 * Replace the entry with a matching shortcode, or append. Editing an issue
 * re-runs the workflow with the same shortcode, so this is what keeps a
 * re-edit from piling up duplicates.
 */
export function upsertEntry(existing: SpottedEntry[], entry: SpottedEntry): SpottedEntry[] {
  const i = existing.findIndex((e) => e.shortcode === entry.shortcode);
  if (i === -1) return [...existing, entry];
  const next = [...existing];
  next[i] = entry;
  return next;
}

// ---------------------------------------------------------------------------
// CLI entry point — reads the issue from env, writes sources/spotted.yml, and
// tells the workflow what to comment via GITHUB_OUTPUT. Skipped on import so
// the functions above stay unit-testable without touching the filesystem.
// ---------------------------------------------------------------------------

function setOutput(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  const line = `${name}<<SPOTTED_EOF\n${value}\nSPOTTED_EOF\n`;
  if (file) writeFileSync(file, line, { flag: 'a' });
  else console.log(`${name}: ${value}`);
}

function main() {
  const body = process.env.ISSUE_BODY ?? '';
  const issueNumber = Number.parseInt(process.env.ISSUE_NUMBER ?? '0', 10);
  const now = new Date().toISOString();
  const path = 'sources/spotted.yml';

  const result = parseSpottedIssue(body, issueNumber, now);
  if (!result.ok) {
    setOutput('valid', 'false');
    setOutput('comment', `Couldn't file this one: ${result.reason}\n\nEdit the issue and it'll be picked up again.`);
    return;
  }

  const doc = parse(readFileSync(path, 'utf8')) as { spotted: SpottedEntry[] } | null;
  const list = doc?.spotted ?? [];
  const next = upsertEntry(list, result.entry);
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(/spotted:[\s\S]*$/, stringify({ spotted: next })),
  );

  setOutput('valid', 'true');
  setOutput('shortcode', result.entry.shortcode);
  const priceLine = result.entry.caption || result.entry.price
    ? `Caption/price recorded — the next crawl will read a price and title out of it.`
    : `No caption or price given, so it'll show up as price-on-request until the listing is edited.`;
  setOutput(
    'comment',
    `Filed as \`${result.entry.shortcode}\` for **${result.entry.dealer}**. ${priceLine}\n\n` +
      `It'll appear in the grid at the next crawl (every 6 hours).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
