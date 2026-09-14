import { FX_TO_GBP } from './normalise.ts';
import { looksLikeAccessory, tagsFor } from './enrich.ts';
import type { Money } from './types.ts';

export type CaptionRead = {
  price: Money | null;
  priceOnRequest: boolean;
  sold: boolean;
  title: string;
  isListing: boolean;
  reason: string;
};

const MAX_INPUT = 3000;

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

/** Symbols that map straight to an ISO code. HK$ is handled separately so it
 * never gets swallowed by the bare "$" branch. */
const SYMBOL_CURRENCY: Record<string, string> = { '£': 'GBP', $: 'USD', '€': 'EUR', '¥': 'JPY' };

/**
 * Codes we recognise as "this looks like a currency", beyond what FX_TO_GBP
 * can convert. A price in a currency we cannot convert is still a price - it
 * is reported as unconvertible rather than silently dropped as "just a
 * number", per the caller's request.
 */
const CURRENCY_CODES = [
  ...Object.keys(FX_TO_GBP),
  'AED', 'NOK', 'NZD', 'ZAR', 'CNY', 'RMB', 'THB', 'MYR', 'PLN', 'CZK',
];

/** Hashtags never contribute a price - mask them out before scanning so a
 * stray "#soldfor4500" cannot be read as a price. */
function maskHashtags(text: string): string {
  return text.replace(/#\S+/g, (m) => ' '.repeat(m.length));
}

/**
 * A price token can be British/US style (comma thousands, dot decimal),
 * European style (dot thousands, comma decimal), Swiss style (apostrophe
 * thousands), or shorthand ("4.5k"). Decide which by inspecting the
 * separators actually present rather than guessing from locale.
 */
function parseNumberToken(raw: string, hasK: boolean): number | null {
  let s = raw.trim();
  if (!/\d/.test(s)) return null;

  if (s.includes("'")) {
    s = s.replace(/'/g, '');
  } else {
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      // Whichever separator appears last is the decimal point.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      const parts = s.split(',');
      // "4,50" is a decimal; "4,500" is thousands.
      s = parts.length === 2 && parts[1].length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (hasDot && !hasK) {
      const parts = s.split('.');
      // "4.500" is thousands; "4.5" is a decimal (and always is under "k").
      if (parts.length === 2 && parts[1].length === 3) s = s.replace('.', '');
    }
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(hasK ? n * 1000 : n);
}

type PriceCandidate = { index: number; amount: number; currency: string };

function findPriceCandidates(text: string): PriceCandidate[] {
  const masked = maskHashtags(text);
  const candidates: PriceCandidate[] = [];
  const codeAlt = CURRENCY_CODES.join('|');

  const symbolRe = /(£|HK\$|\$|€|¥)\s?(\d[\d.,']*)(k)?\b/gi;
  const codeBeforeRe = new RegExp(`\\b(${codeAlt})\\b\\s?(\\d[\\d.,']*)(k)?\\b`, 'gi');
  const codeAfterRe = new RegExp(`(\\d[\\d.,']*)(k)?\\s?\\b(${codeAlt})\\b`, 'gi');

  for (const m of masked.matchAll(symbolRe)) {
    const sym = m[1];
    const currency = sym === 'HK$' ? 'HKD' : SYMBOL_CURRENCY[sym];
    const amount = parseNumberToken(m[2], !!m[3]);
    if (currency && amount !== null) candidates.push({ index: m.index ?? 0, amount, currency });
  }
  for (const m of masked.matchAll(codeBeforeRe)) {
    const amount = parseNumberToken(m[2], !!m[3]);
    if (amount !== null) candidates.push({ index: m.index ?? 0, amount, currency: m[1].toUpperCase() });
  }
  for (const m of masked.matchAll(codeAfterRe)) {
    const amount = parseNumberToken(m[1], !!m[2]);
    if (amount !== null) candidates.push({ index: m.index ?? 0, amount, currency: m[3].toUpperCase() });
  }

  candidates.sort((a, b) => a.index - b.index);
  return candidates;
}

function extractPrice(text: string): { price: Money | null; unconvertibleReason: string | null } {
  const first = findPriceCandidates(text)[0];
  if (!first) return { price: null, unconvertibleReason: null };
  if (!(first.currency in FX_TO_GBP)) {
    return { price: null, unconvertibleReason: `unconvertible currency: ${first.currency}` };
  }
  return { price: { amount: first.amount, currency: first.currency }, unconvertibleReason: null };
}

// ---------------------------------------------------------------------------
// Price on request / sold
// ---------------------------------------------------------------------------

const POA_PATTERNS = [
  /\bdm for (?:price|details)\b/i,
  /\bpm for price\b/i,
  /\bpoa\b/i,
  /\bprice on request\b/i,
  /\benquire\b/i,
  /\bask for price\b/i,
];

function isPriceOnRequest(text: string): boolean {
  return POA_PATTERNS.some((p) => p.test(text));
}

const SOLD_PATTERNS = [
  // "sold" itself, but not "unsold" (blocked by \b), "sold separately", or
  // "sold in <year>", and not preceded by "never".
  /(?<!never\s)\bsold\b(?!\s*separately)(?!\s+in\s+\d{4})/i,
  /\bno longer available\b/i,
  /\breserved\b/i,
  /\bon\s+hold\b/i,
  /\bgone\b/i,
];

function isSold(text: string): boolean {
  return SOLD_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

const LEADING_EMOJI_RE = /^[\p{Extended_Pictographic}️‍\s]+/u;
const TRAILING_HASHTAGS_RE = /(?:[\s,]*#[^\s#]+)+\s*$/u;

function capAt90(s: string): string {
  if (s.length <= 90) return s;
  const slice = s.slice(0, 90);
  const idx = slice.lastIndexOf(' ');
  return (idx > 40 ? slice.slice(0, idx) : slice).trim();
}

/** Cut a line at its first sentence end, provided that leaves something
 * substantial - otherwise the whole line stands as the candidate title. */
function firstSentence(line: string): string {
  const m = line.match(/^(.{12,}?[.!?])(?:\s|$)/);
  return m ? m[1] : line;
}

function processLine(line: string): string {
  let s = line.replace(LEADING_EMOJI_RE, '');
  s = firstSentence(s);
  s = s.replace(TRAILING_HASHTAGS_RE, '');
  s = s.replace(/\s+/g, ' ').trim();
  return capAt90(s);
}

function extractTitle(caption: string): string {
  const lines = caption.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return '';

  let title = processLine(lines[0]);
  if (title.length < 12) {
    for (let i = 1; i < lines.length; i++) {
      const candidate = processLine(lines[i]);
      if (candidate.length >= 12) {
        title = candidate;
        break;
      }
    }
  }
  return title;
}

// ---------------------------------------------------------------------------
// isListing
// ---------------------------------------------------------------------------

const NOT_STOCK: Array<{ reason: string; test: RegExp }> = [
  { reason: 'greeting', test: /\b(happy new year|merry christmas|happy holidays|season'?s greetings)\b/i },
  { reason: 'event', test: /\b(see you at|trade fair|watch fair|the fair|our booth)\b/i },
  { reason: 'service-post', test: /\b(back from service|in the workshop|restoration complete)\b/i },
  { reason: 'recruitment', test: /\b(we're hiring|now hiring|join our team|job opening|vacancy)\b/i },
  { reason: 'wrist-shot', test: /\b(wrist check|on the wrist today|daily wear|wristshot)\b/i },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function readCaption(caption: string): CaptionRead {
  const text = (caption ?? '').slice(0, MAX_INPUT);

  const priceOnRequest = isPriceOnRequest(text);
  const { price: rawPrice, unconvertibleReason } = extractPrice(text);
  const price = priceOnRequest ? null : rawPrice;
  const sold = isSold(text);
  const title = extractTitle(text);
  const tags = tagsFor(text, title);

  const hasSignal = price !== null || priceOnRequest || sold || tags.length > 0;

  let isListing: boolean;
  let reason: string;

  if (looksLikeAccessory(title)) {
    isListing = false;
    reason = 'accessory';
  } else if (hasSignal) {
    isListing = true;
    reason = 'ok';
  } else {
    isListing = false;
    const notStock = NOT_STOCK.find((r) => r.test.test(text));
    reason = unconvertibleReason ?? notStock?.reason ?? 'no-listing-signal';
  }

  return { price, priceOnRequest, sold, title, isListing, reason };
}
