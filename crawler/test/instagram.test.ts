import { describe, expect, it } from 'vitest';
import { parseBusinessDiscovery } from '../src/adapters/instagram.ts';

const account = { handle: 'testwatches', name: 'Test Watches' };

/** Shaped exactly like a real Graph API Business Discovery response. */
function discovery(media: unknown[]) {
  return { business_discovery: { media: { data: media } } };
}

describe('parseBusinessDiscovery', () => {
  it('reads a normal image post with a price', () => {
    const { listings, reason } = parseBusinessDiscovery(
      discovery([
        {
          caption: 'Malachite dial cocktail watch, 1970s\n£2,400, DM to buy',
          media_url: 'https://scontent.cdninstagram.com/img1.jpg',
          permalink: 'https://www.instagram.com/p/ABC123xyz/',
          timestamp: '2026-01-01T00:00:00+0000',
          media_type: 'IMAGE',
        },
      ]),
      account,
    );
    expect(reason).toBeNull();
    expect(listings).toHaveLength(1);
    const l = listings[0];
    expect(l.sourceId).toBe('ABC123xyz');
    expect(l.url).toBe('https://www.instagram.com/p/ABC123xyz/');
    expect(l.title).toMatch(/Malachite dial cocktail watch/);
    expect(l.price).toEqual({ amount: 2400, currency: 'GBP' });
    expect(l.images).toEqual(['https://scontent.cdninstagram.com/img1.jpg']);
    expect(l.available).toBe(true);
    expect(l.publishedAt).toBe('2026-01-01T00:00:00+0000');
    expect(l.vendor).toBeNull();
  });

  it('takes the media_url for a carousel', () => {
    const { listings } = parseBusinessDiscovery(
      discovery([
        {
          caption: 'Onyx dial, box and papers, $3,200',
          media_url: 'https://scontent.cdninstagram.com/cover.jpg',
          permalink: 'https://www.instagram.com/p/CAROUSEL1/',
          media_type: 'CAROUSEL_ALBUM',
        },
      ]),
      account,
    );
    expect(listings).toHaveLength(1);
    expect(listings[0].images).toEqual(['https://scontent.cdninstagram.com/cover.jpg']);
  });

  it('has no images for a video post', () => {
    const { listings } = parseBusinessDiscovery(
      discovery([
        {
          caption: 'Tigers eye dial in motion, €1,900',
          media_url: 'https://scontent.cdninstagram.com/vid1.mp4',
          permalink: 'https://www.instagram.com/reel/VID1/',
          media_type: 'VIDEO',
        },
      ]),
      account,
    );
    expect(listings).toHaveLength(1);
    expect(listings[0].images).toEqual([]);
  });

  it('marks a sold post unavailable', () => {
    const { listings } = parseBusinessDiscovery(
      discovery([
        {
          caption: 'Feather dial beauty - SOLD, thanks all',
          media_url: 'https://scontent.cdninstagram.com/img2.jpg',
          permalink: 'https://www.instagram.com/p/SOLD1/',
          media_type: 'IMAGE',
        },
      ]),
      account,
    );
    expect(listings).toHaveLength(1);
    expect(listings[0].available).toBe(false);
  });

  it('skips a plain wrist shot with no price or listing signal', () => {
    const { listings, skipped } = parseBusinessDiscovery(
      discovery([
        {
          caption: 'On the wrist today, loving this one',
          media_url: 'https://scontent.cdninstagram.com/img3.jpg',
          permalink: 'https://www.instagram.com/p/WRIST1/',
          media_type: 'IMAGE',
        },
      ]),
      account,
    );
    expect(listings).toHaveLength(0);
    expect(skipped['wrist-shot']).toBe(1);
  });

  it('handles a Graph error payload without throwing', () => {
    const result = parseBusinessDiscovery(
      { error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } },
      account,
    );
    expect(result.listings).toEqual([]);
    expect(result.reason).toMatch(/Invalid OAuth access token/);
  });

  it('handles a response with no business_discovery (personal account)', () => {
    const result = parseBusinessDiscovery({}, account);
    expect(result.listings).toEqual([]);
    expect(result.reason).toMatch(/no business_discovery/);
  });

  it('handles an empty media.data array', () => {
    const result = parseBusinessDiscovery(discovery([]), account);
    expect(result.listings).toEqual([]);
    expect(result.reason).toBe('no media');
  });

  it('handles a missing media key entirely', () => {
    const result = parseBusinessDiscovery({ business_discovery: {} }, account);
    expect(result.listings).toEqual([]);
    expect(result.reason).toBe('no media');
  });

  it('skips a caption with no price at all and no other listing signal', () => {
    const { listings, skipped } = parseBusinessDiscovery(
      discovery([
        {
          caption: 'Happy new year from the whole team!',
          media_url: 'https://scontent.cdninstagram.com/img4.jpg',
          permalink: 'https://www.instagram.com/p/NOPRICE1/',
          media_type: 'IMAGE',
        },
      ]),
      account,
    );
    expect(listings).toHaveLength(0);
    expect(skipped['greeting']).toBe(1);
  });

  it('never throws on malformed or unexpected input', () => {
    expect(() => parseBusinessDiscovery(null, account)).not.toThrow();
    expect(() => parseBusinessDiscovery(undefined, account)).not.toThrow();
    expect(() => parseBusinessDiscovery('not an object', account)).not.toThrow();
    expect(() => parseBusinessDiscovery({ business_discovery: { media: {} } }, account)).not.toThrow();
    expect(() => parseBusinessDiscovery(discovery([{}]), account)).not.toThrow();
  });
});
