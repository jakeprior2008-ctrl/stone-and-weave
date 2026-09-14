import { describe, expect, it } from 'vitest';
import { detectBrand, detectCaseSize, detectEra, detectReference, toGBP } from '../src/normalise.ts';
import { parseProduct } from '../src/adapters/jsonld.ts';

describe('field extraction', () => {
  it('prefers the longest brand match', () => {
    expect(detectBrand('Grand Seiko SBGW231', null)).toBe('Grand Seiko');
    expect(detectBrand('Seiko 6139 bullhead', null)).toBe('Seiko');
  });

  it('falls back to the shop vendor when no brand is known', () => {
    expect(detectBrand('Unsigned cocktail watch', 'Doble')).toBe('Doble');
    expect(detectBrand('Unsigned cocktail watch', null)).toBeNull();
  });

  it('gives known brands their correct display name, not naive title-case', () => {
    expect(detectBrand('IWC Mark XI', null)).toBe('IWC');
    expect(detectBrand('Jaeger-LeCoultre Reverso', null)).toBe('Jaeger-LeCoultre');
    expect(detectBrand('a. lange & sohne 1815', null)).toBe('A. Lange & Söhne');
  });

  it('rejects a vendor that just names the dealer, but keeps an unrelated one', () => {
    expect(detectBrand('Unsigned cocktail watch', 'Analog:Shift', 'Analog Shift')).toBeNull();
    expect(detectBrand('Unsigned cocktail watch', 'Doble', 'Analog Shift')).toBe('Doble');
  });

  it('rejects an empty or placeholder vendor', () => {
    expect(detectBrand('Unsigned cocktail watch', 'Default Title')).toBeNull();
    expect(detectBrand('Unsigned cocktail watch', 'N/A')).toBeNull();
    expect(detectBrand('Unsigned cocktail watch', '-')).toBeNull();
    expect(detectBrand('Unsigned cocktail watch', 'unknown')).toBeNull();
  });

  it('pulls references and case sizes', () => {
    expect(detectReference('Rolex Datejust ref. 69178 yellow gold')).toBe('69178');
    expect(detectCaseSize('Rolex 26mm Datejust')).toBe(26);
    // A 500mm "case" is a measurement of something else.
    expect(detectCaseSize('shipped in a 500mm box')).toBeNull();
  });

  it('does not capture the word "reference" itself when no number follows', () => {
    expect(detectReference('Reference 9706')).toBe('9706');
    expect(detectReference('ref. 69178')).toBe('69178');
    expect(detectReference('a reference to the 1970s')).toBeNull();
    expect(detectReference('Reference: 3842P')).toBe('3842P');
    expect(detectReference('Ref.1601')).toBe('1601');
  });

  it('reads an era from a decade or a circa year', () => {
    expect(detectEra('Piaget 1970s Ellipse')).toBe('1970s');
    expect(detectEra('circa 1986 Rolex Datejust')).toBe('1980s');
    expect(detectEra('Modern release')).toBeNull();
  });

  it('converts to GBP and admits when it cannot', () => {
    expect(toGBP(100, 'GBP')).toBe(100);
    expect(toGBP(100, 'USD')).toBe(79);
    expect(toGBP(100, 'XYZ')).toBeNull();
  });
});

describe('JSON-LD parsing', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"WebSite","name":"shop"}</script>
    <script type="application/ld+json">{"@type":"Product","name":"Rolex Lapis Dial — Doble Vintage Watches",
      "image":"http://static1.squarespace.com/a.jpg",
      "description":"18ct gold with lapis lazuli stone dial",
      "offers":{"@type":"Offer","price":15950.0,"priceCurrency":"GBP","availability":"InStock","sku":"SQ48"}}</script>
  </head></html>`;

  it('finds the Product among several graphs', () => {
    const l = parseProduct(html, 'https://x.com/collection/p/rolex-lapis');
    expect(l?.title).toBe('Rolex Lapis Dial');
    expect(l?.price).toEqual({ amount: 15950, currency: 'GBP' });
    expect(l?.sourceId).toBe('SQ48');
  });

  it('upgrades Squarespace http image URLs', () => {
    expect(parseProduct(html, 'https://x.com/p/a')?.images?.[0]).toMatch(/^https:\/\//);
  });

  it('returns null when there is no product', () => {
    expect(parseProduct('<html><body>nothing</body></html>', 'https://x.com/p/a')).toBeNull();
  });
});
