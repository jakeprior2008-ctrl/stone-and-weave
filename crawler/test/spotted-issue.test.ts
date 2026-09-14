import { describe, expect, it } from 'vitest';
import {
  extractFields,
  parseIssueBody,
  parseSpottedIssue,
  upsertEntry,
  validatePermalink,
  type SpottedEntry,
} from '../../scripts/parse-spotted-issue.ts';

const FORM_BODY = `### Post link

https://www.instagram.com/p/ABC123xyz/

### Caption

Rare Omega Seamaster 1965 stunning original condition £4,500

### Dealer

doblevintagewatches

### Price

_No response_

### Why it's interesting

Tropical dial, bamboo bracelet.`;

describe('parseIssueBody', () => {
  it('splits a rendered issue form into label -> value', () => {
    const fields = parseIssueBody(FORM_BODY);
    expect(fields['post link']).toBe('https://www.instagram.com/p/ABC123xyz/');
    expect(fields.caption).toContain('Omega Seamaster');
    expect(fields.dealer).toBe('doblevintagewatches');
  });

  it('reads an unfilled optional field as empty, not the literal placeholder', () => {
    const fields = parseIssueBody(FORM_BODY);
    expect(fields.price).toBe('');
  });

  it('handles an empty body', () => {
    expect(parseIssueBody('')).toEqual({});
  });
});

describe('extractFields', () => {
  it('pulls the spotted form fields by label', () => {
    const fields = extractFields(FORM_BODY);
    expect(fields).toEqual({
      permalink: 'https://www.instagram.com/p/ABC123xyz/',
      caption: 'Rare Omega Seamaster 1965 stunning original condition £4,500',
      dealer: 'doblevintagewatches',
      price: '',
      note: 'Tropical dial, bamboo bracelet.',
    });
  });

  it('defaults every field to empty when the body has no matching headings', () => {
    expect(extractFields('nothing here')).toEqual({
      permalink: '', caption: '', dealer: '', price: '', note: '',
    });
  });
});

describe('validatePermalink', () => {
  it('accepts a plain post link', () => {
    const r = validatePermalink('https://www.instagram.com/p/ABC123xyz/');
    expect(r).toEqual({
      ok: true, shortcode: 'ABC123xyz', handle: null,
      permalink: 'https://www.instagram.com/p/ABC123xyz/',
    });
  });

  it('accepts a reel link and one without a trailing slash', () => {
    expect(validatePermalink('https://www.instagram.com/reel/XYZ789/')).toMatchObject({ ok: true, shortcode: 'XYZ789' });
    expect(validatePermalink('https://instagram.com/p/ABC123xyz')).toMatchObject({ ok: true, shortcode: 'ABC123xyz' });
  });

  it('picks up the handle when the link is username-scoped', () => {
    const r = validatePermalink('https://www.instagram.com/doblevintagewatches/p/ABC123xyz/');
    expect(r).toMatchObject({ ok: true, handle: 'doblevintagewatches', shortcode: 'ABC123xyz' });
  });

  it('rejects a profile link with no post', () => {
    const r = validatePermalink('https://www.instagram.com/doblevintagewatches/');
    expect(r.ok).toBe(false);
  });

  it('rejects a non-instagram URL', () => {
    const r = validatePermalink('https://example.com/p/ABC123xyz/');
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('instagram.com') });
  });

  it('rejects an empty link', () => {
    expect(validatePermalink('').ok).toBe(false);
    expect(validatePermalink('   ').ok).toBe(false);
  });

  it('rejects garbage text', () => {
    expect(validatePermalink('saw it on instagram, cant remember the link').ok).toBe(false);
  });
});

describe('parseSpottedIssue', () => {
  it('builds a full entry from a filled-in form', () => {
    const r = parseSpottedIssue(FORM_BODY, 42, '2026-09-14T12:00:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.entry).toEqual({
      shortcode: 'ABC123xyz',
      permalink: 'https://www.instagram.com/p/ABC123xyz/',
      dealer: 'doblevintagewatches',
      caption: 'Rare Omega Seamaster 1965 stunning original condition £4,500',
      price: '',
      note: 'Tropical dial, bamboo bracelet.',
      issue: 42,
      filedAt: '2026-09-14T12:00:00.000Z',
    });
  });

  it('falls back to the handle in the link when dealer is left blank', () => {
    const body = `### Post link\n\nhttps://www.instagram.com/doblevintagewatches/p/ABC123xyz/\n\n### Caption\n\n_No response_\n\n### Dealer\n\n_No response_\n\n### Price\n\n_No response_\n\n### Why it's interesting\n\n_No response_`;
    const r = parseSpottedIssue(body, 1, '2026-09-14T12:00:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.entry.dealer).toBe('doblevintagewatches');
  });

  it('falls back to "unknown" when neither dealer nor a handle in the link is given', () => {
    const body = `### Post link\n\nhttps://www.instagram.com/p/ABC123xyz/\n\n### Dealer\n\n_No response_`;
    const r = parseSpottedIssue(body, 1, '2026-09-14T12:00:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.entry.dealer).toBe('unknown');
  });

  it('rejects a bad permalink and explains why, without building an entry', () => {
    const body = `### Post link\n\nhttps://example.com/watch\n\n### Caption\n\n_No response_`;
    const r = parseSpottedIssue(body, 7, '2026-09-14T12:00:00.000Z');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected rejection');
    expect(r.reason).toMatch(/instagram/i);
  });
});

describe('upsertEntry', () => {
  const entry = (over: Partial<SpottedEntry> = {}): SpottedEntry => ({
    shortcode: 'ABC123xyz', permalink: 'https://www.instagram.com/p/ABC123xyz/',
    dealer: 'doble', caption: 'c', price: '', note: '', issue: 1,
    filedAt: '2026-09-14T00:00:00.000Z', ...over,
  });

  it('appends a new shortcode', () => {
    const next = upsertEntry([entry()], entry({ shortcode: 'XYZ789' }));
    expect(next.map((e) => e.shortcode)).toEqual(['ABC123xyz', 'XYZ789']);
  });

  it('replaces the entry with a matching shortcode instead of duplicating it — an edited issue updates in place', () => {
    const original = entry({ caption: 'first pass' });
    const edited = entry({ caption: 'edited caption', issue: 1 });
    const next = upsertEntry([original], edited);
    expect(next).toHaveLength(1);
    expect(next[0].caption).toBe('edited caption');
  });
});
