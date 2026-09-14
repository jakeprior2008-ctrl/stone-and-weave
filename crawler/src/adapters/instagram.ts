import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { politeFetch } from '../http.ts';
import { readCaption } from '../caption.ts';
import type { RawListing } from '../types.ts';

/**
 * Instagram cannot be scraped. A profile page is a JavaScript shell behind
 * a login wall - there is no HTML to parse and no public feed endpoint, so
 * every other adapter in this repo (jsonld, shopify) simply doesn't apply
 * here. The only route Meta actually offers is the Graph API's "Business
 * Discovery" field: one Instagram Business/Creator account can read the
 * recent public media of another Business/Creator account, by username,
 * with a long-lived token. That's what this adapter calls.
 *
 * ---------------------------------------------------------------------
 * Signed-URL trade-off, read before touching media_url handling below:
 * ---------------------------------------------------------------------
 * The `media_url` the Graph API returns is a signed CDN link that expires
 * within hours to days. There is no way around that from the read side of
 * the API. Two options exist: (a) re-fetch it fresh on every crawl, so the
 * link is always current as of the last successful crawl but can go dead
 * for a visitor who loads the page long after; or (b) download and commit
 * the actual image bytes into the repo so they never expire. This adapter
 * deliberately does (a). Option (b) would add an image per listing per
 * account, every six hours, forever, to a dataset whose unbounded growth
 * is already flagged as a problem in docs/REVIEW.md - trading a rare
 * "missing thumbnail" for a repo that grows without bound is the wrong
 * trade for a public, free-tier crawler. A stale-image is a visible,
 * recoverable inconvenience; a repo that outgrows what Actions can check
 * out is not.
 *
 * Unproven against the live API: this has been written defensively against
 * the documented response shape, but the owner has not yet created a Meta
 * app, so every error branch below (Graph error payload, missing
 * business_discovery, missing/empty media) is assumed and untested against
 * a real token. Nothing here may throw past fetchOneAccount - a bad
 * response from one account must never take down the other accounts, and
 * a bad response from Instagram entirely must never take down the crawl.
 *
 * Set IG_TOKEN and IG_USER_ID as repo secrets to switch this on. Without
 * both, fetchInstagram() returns [] before making any request - see
 * sources/instagram.yml for the account list and docs for how to get a
 * token that doesn't expire (a Meta System User token, not a user token).
 */

const GRAPH_VERSION = 'v21.0';
const MEDIA_LIMIT = 25;
const DESCRIPTION_MAX = 280;

type IgAccount = { handle: string; name: string; currency?: string; note?: string };

type IgMedia = {
  caption?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
};

type BusinessDiscoveryResponse = {
  business_discovery?: {
    media?: { data?: IgMedia[] };
  };
  error?: { message?: string; type?: string; code?: number };
};

function loadAccounts(): IgAccount[] {
  let raw: string;
  try {
    raw = readFileSync('sources/instagram.yml', 'utf8');
  } catch {
    return [];
  }
  try {
    const doc = parse(raw) as { accounts?: IgAccount[] } | null;
    return doc?.accounts ?? [];
  } catch {
    return [];
  }
}

/** Pull the shortcode out of a permalink, e.g. https://www.instagram.com/p/ABC123xyz/ */
function shortcodeFrom(permalink: string | undefined, fallback: string): string {
  const m = permalink?.match(/\/(?:p|reel)\/([^/?#]+)/);
  return m ? m[1] : fallback;
}

/**
 * Pure parsing, kept separate from the network call so it can be unit
 * tested with fixture payloads and no fetch. Never throws: every failure
 * mode collapses to an empty array plus a reason string for the caller to
 * log.
 */
export function parseBusinessDiscovery(
  json: unknown,
  account: IgAccount,
): { listings: RawListing[]; skipped: Record<string, number>; reason: string | null } {
  const skipped: Record<string, number> = {};
  const bump = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  const body = json as BusinessDiscoveryResponse;

  if (body && typeof body === 'object' && body.error) {
    return {
      listings: [],
      skipped,
      reason: `Graph error: ${body.error.message ?? body.error.type ?? 'unknown'}`,
    };
  }

  const discovery = body?.business_discovery;
  if (!discovery) {
    return { listings: [], skipped, reason: 'no business_discovery (personal account, or bad handle)' };
  }

  const media = discovery.media?.data;
  if (!media || media.length === 0) {
    return { listings: [], skipped, reason: 'no media' };
  }

  const listings: RawListing[] = [];

  for (const item of media) {
    const caption = item.caption ?? '';
    const read = readCaption(caption);

    if (!read.isListing) {
      bump(read.reason);
      continue;
    }

    const sourceId = shortcodeFrom(item.permalink, `${account.handle}-${listings.length}`);
    const url = item.permalink ?? `https://www.instagram.com/${account.handle}/`;

    const images =
      item.media_type === 'IMAGE' || item.media_type === 'CAROUSEL_ALBUM'
        ? [item.media_url].filter((u): u is string => !!u)
        : [];

    listings.push({
      sourceId,
      url,
      title: read.title || caption.slice(0, 90),
      description: caption.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX),
      price: read.price,
      images,
      available: !read.sold,
      publishedAt: item.timestamp ?? null,
      vendor: null,
    });
  }

  return { listings, skipped, reason: null };
}

async function fetchOneAccount(
  userId: string,
  token: string,
  account: IgAccount,
): Promise<RawListing[]> {
  const fields = `business_discovery.username(${account.handle}){media.limit(${MEDIA_LIMIT}){caption,media_url,permalink,timestamp,media_type}}`;
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(userId)}` +
    `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await politeFetch(url, { delayMs: 1500, accept: 'application/json' });
    if (!res.ok) {
      console.warn(`  Instagram: @${account.handle} returned HTTP ${res.status}`);
      return [];
    }

    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      console.warn(`  Instagram: @${account.handle} did not return JSON`);
      return [];
    }

    const { listings, skipped, reason } = parseBusinessDiscovery(json, account);
    if (reason) {
      console.warn(`  Instagram: @${account.handle} - ${reason}`);
    }
    const skippedCount = Object.values(skipped).reduce((a, b) => a + b, 0);
    if (skippedCount > 0) {
      const tally = Object.entries(skipped)
        .map(([r, n]) => `${r}: ${n}`)
        .join(', ');
      console.log(`  Instagram: @${account.handle} skipped ${skippedCount} post(s) - ${tally}`);
    }
    return listings;
  } catch (err) {
    console.warn(`  Instagram: @${account.handle} failed - ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function fetchInstagram(): Promise<RawListing[]> {
  const token = process.env.IG_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (!token || !userId) {
    console.log('  Instagram: no credentials set, skipping (set IG_TOKEN/IG_USER_ID to enable)');
    return [];
  }

  const accounts = loadAccounts();
  if (accounts.length === 0) return [];

  const out: RawListing[] = [];
  for (const account of accounts) {
    const listings = await fetchOneAccount(userId, token, account);
    out.push(...listings);
  }
  return out;
}
