import { describe, expect, it } from 'vitest';
import { readCaption } from '../src/caption.ts';

describe('price extraction', () => {
  it('reads a plain GBP price with trailing hashtags', () => {
    const r = readCaption('Rare Omega Seamaster 1965 stunning original condition\n#vintage #omega #forsale £4,500');
    expect(r.price).toEqual({ amount: 4500, currency: 'GBP' });
  });

  it('reads GBP shorthand with a k suffix', () => {
    expect(readCaption('Beautiful Rolex Datejust £4.5k, DM to reserve').price).toEqual({
      amount: 4500,
      currency: 'GBP',
    });
  });

  it('reads a USD price with commas', () => {
    expect(readCaption('Cartier Tank $5,200 ready to ship').price).toEqual({ amount: 5200, currency: 'USD' });
  });

  it('reads a currency code before the amount', () => {
    expect(readCaption('IWC Mark XI USD 5200 firm').price).toEqual({ amount: 5200, currency: 'USD' });
  });

  it('reads a currency code after the amount', () => {
    expect(readCaption('Longines chronograph 4500 GBP or nearest offer').price).toEqual({
      amount: 4500,
      currency: 'GBP',
    });
  });

  it('reads a GBP symbol code form', () => {
    expect(readCaption('Tudor Submariner GBP 4500 no offers').price).toEqual({ amount: 4500, currency: 'GBP' });
  });

  it('reads a EUR code form', () => {
    expect(readCaption('Breitling Navitimer EUR 4500').price).toEqual({ amount: 4500, currency: 'EUR' });
  });

  it('reads a European-format EUR price', () => {
    expect(readCaption('Patek Calatrava €4.500,00 papers included').price).toEqual({
      amount: 4500,
      currency: 'EUR',
    });
  });

  it('reads a Swiss apostrophe CHF price', () => {
    expect(readCaption('Vacheron Constantin CHF 8\'500 box and papers').price).toEqual({
      amount: 8500,
      currency: 'CHF',
    });
  });

  it('reads a Hong Kong dollar price', () => {
    expect(readCaption('Rolex GMT Master HK$38,000 excellent condition').price).toEqual({
      amount: 38000,
      currency: 'HKD',
    });
  });

  it('reads a yen price', () => {
    expect(readCaption('Seiko 6139 bullhead ¥250,000 rare colourway').price).toEqual({
      amount: 250000,
      currency: 'JPY',
    });
  });

  it('flags an unconvertible currency instead of guessing', () => {
    const r = readCaption('Rolex Oyster Perpetual AED 12,000 shipped from Dubai');
    expect(r.price).toBeNull();
    expect(r.reason).toBe('unconvertible currency: AED');
  });

  it('does not read a reference number as a price', () => {
    const r = readCaption('Omega Speedmaster Ref. 145.012-67 all original');
    expect(r.price).toBeNull();
  });

  it('does not read a bare year as a price', () => {
    const r = readCaption('Rare vintage piece from 1970, all original parts');
    expect(r.price).toBeNull();
  });

  it('does not read a case size as a price', () => {
    const r = readCaption('Omega Seamaster steel 36mm black dial');
    expect(r.price).toBeNull();
  });

  it('does not read a calibre number as a price', () => {
    const r = readCaption('Jaeger-LeCoultre powered by cal. 2135, recently serviced');
    expect(r.price).toBeNull();
  });

  it('does not read a water resistance depth as a price', () => {
    const r = readCaption('Dive watch rated to 200m, matching bracelet');
    expect(r.price).toBeNull();
  });

  it('does not read a limited edition count as a price', () => {
    const r = readCaption('Limited edition, 1 of 100 made, full set');
    expect(r.price).toBeNull();
  });

  it('ignores a number inside a hashtag', () => {
    const r = readCaption('Stunning piece available now #4500gbp #vintagewatch');
    expect(r.price).toBeNull();
  });

  it('prefers the first plausible price when several numbers appear', () => {
    const r = readCaption('Ref. 6538 from 1965, 36mm, £4,500 firm, cal. 722');
    expect(r.price).toEqual({ amount: 4500, currency: 'GBP' });
  });
});

describe('price on request', () => {
  it('reads "DM for price"', () => {
    const r = readCaption('Stunning Rolex Explorer, DM for price');
    expect(r.priceOnRequest).toBe(true);
    expect(r.price).toBeNull();
  });

  it('reads "DM for details"', () => {
    expect(readCaption('Rare piece, DM for details').priceOnRequest).toBe(true);
  });

  it('reads "PM for price"', () => {
    expect(readCaption('Beautiful dial, PM for price').priceOnRequest).toBe(true);
  });

  it('reads "POA"', () => {
    expect(readCaption('Grand Seiko snowflake, POA').priceOnRequest).toBe(true);
  });

  it('reads "price on request"', () => {
    expect(readCaption('One owner example, price on request').priceOnRequest).toBe(true);
  });

  it('reads "enquire"', () => {
    expect(readCaption('Exceptional condition, enquire within').priceOnRequest).toBe(true);
  });

  it('reads "ask for price"', () => {
    expect(readCaption('Museum quality, ask for price').priceOnRequest).toBe(true);
  });

  it('lets a price-on-request marker override a nearby number', () => {
    const r = readCaption('Ref. 6538, DM for price, cal. 722');
    expect(r.priceOnRequest).toBe(true);
    expect(r.price).toBeNull();
  });
});

describe('sold detection', () => {
  it('reads "SOLD ✅"', () => {
    expect(readCaption('SOLD ✅ thank you all for the interest').sold).toBe(true);
  });

  it('reads "sold out"', () => {
    expect(readCaption('This piece is sold out, more coming soon').sold).toBe(true);
  });

  it('reads "no longer available"', () => {
    expect(readCaption('This watch is no longer available').sold).toBe(true);
  });

  it('reads "reserved"', () => {
    expect(readCaption('Reserved for a client, thank you').sold).toBe(true);
  });

  it('reads "on hold"', () => {
    expect(readCaption('This one is on hold for now').sold).toBe(true);
  });

  it('reads "gone"', () => {
    expect(readCaption('This beauty is gone to a great new home').sold).toBe(true);
  });

  it('does not fire on "sold separately"', () => {
    expect(readCaption('Watch and bracelet sold separately, please enquire').sold).toBe(false);
  });

  it('does not fire on "never sold"', () => {
    expect(readCaption('This exact configuration was never sold at retail').sold).toBe(false);
  });

  it('does not fire on "unsold"', () => {
    expect(readCaption('An unsold prototype from the archive').sold).toBe(false);
  });

  it('does not fire on "sold in 1970"', () => {
    expect(readCaption('This reference was first sold in 1970').sold).toBe(false);
  });
});

describe('title extraction', () => {
  it('takes the first line and strips trailing hashtags', () => {
    const r = readCaption('Omega Seamaster 300 automatic steel #vintage #omega #forsale');
    expect(r.title).toBe('Omega Seamaster 300 automatic steel');
  });

  it('strips a leading emoji', () => {
    const r = readCaption('🔥 Rolex Datejust two-tone, box and papers included');
    expect(r.title).toBe('Rolex Datejust two-tone, box and papers included');
  });

  it('collapses internal whitespace', () => {
    const r = readCaption('Cartier   Tank    Louis   yellow    gold, superb condition');
    expect(r.title).toBe('Cartier Tank Louis yellow gold, superb condition');
  });

  it('caps at 90 characters on a word boundary', () => {
    const r = readCaption(
      'Extraordinarily rare and exceptionally well preserved Patek Philippe Calatrava reference 96 in yellow gold with original box and papers',
    );
    expect(r.title.length).toBeLessThanOrEqual(90);
    expect(r.title.endsWith(' ')).toBe(false);
    expect('Extraordinarily rare and exceptionally well preserved Patek Philippe Calatrava reference 96 in yellow gold with original box and papers'.startsWith(r.title)).toBe(true);
  });

  it('falls through to the next line when the first is too short', () => {
    const r = readCaption('SOLD\nOmega Speedmaster Professional moonwatch, 1969 example\n#omega #speedy');
    expect(r.title).toBe('Omega Speedmaster Professional moonwatch, 1969 example');
  });

  it('takes the first sentence, leaving the rest for the description', () => {
    const r = readCaption('Rare Omega Seamaster in superb condition. DM for price, ships worldwide.');
    expect(r.title).toBe('Rare Omega Seamaster in superb condition.');
  });
});

describe('isListing', () => {
  it('is true when there is a price', () => {
    const r = readCaption('Omega Seamaster steel 36mm £2,200');
    expect(r.isListing).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('is true when there is a price-on-request marker', () => {
    const r = readCaption('Rolex Submariner, POA');
    expect(r.isListing).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('is true when there is a sold marker', () => {
    const r = readCaption('Omega Speedmaster - SOLD, thanks everyone');
    expect(r.isListing).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('is true from a taxonomy tag alone', () => {
    const r = readCaption('Piaget Ellipse with a stunning malachite dial, no price mentioned');
    expect(r.isListing).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.title).toContain('malachite');
  });

  it('is false for a pair of cufflinks even with a price', () => {
    const r = readCaption('Gorgeous vintage cufflinks £250, perfect gift');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('accessory');
  });

  it('is false for a happy new year post', () => {
    const r = readCaption('Happy new year from all of us at the shop, see you in 2026');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('greeting');
  });

  it('is false for an event post', () => {
    const r = readCaption('See you at the watch fair this weekend, come say hello');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('event');
  });

  it('is false for a service post with no price', () => {
    const r = readCaption('Back from service and running beautifully again');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('service-post');
  });

  it('is true for a service post that also lists a price', () => {
    const r = readCaption('Back from service and now available at £3,200');
    expect(r.isListing).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('is false for a recruitment post', () => {
    const r = readCaption('We are now hiring a watchmaker, apply within');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('recruitment');
  });

  it('is false for a plain wrist shot with no price or tag', () => {
    const r = readCaption('Wrist check for today, loving this combo');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('wrist-shot');
  });

  it('is true for a wrist shot caption that also carries a price', () => {
    const r = readCaption('On the wrist today, and yes it is for sale at £1,800');
    expect(r.isListing).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('is false with a generic reason when nothing signals a listing', () => {
    const r = readCaption('Just admiring the collection this afternoon');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('no-listing-signal');
  });

  it('is false and names the unconvertible currency when that is the only signal', () => {
    const r = readCaption('Beautiful dress watch AED 9,000 no other details');
    expect(r.isListing).toBe(false);
    expect(r.reason).toBe('unconvertible currency: AED');
  });
});

describe('input handling', () => {
  it('caps very long captions rather than throwing', () => {
    const long = 'Omega Seamaster steel 36mm £2,200 '.repeat(500);
    expect(() => readCaption(long)).not.toThrow();
    const r = readCaption(long);
    expect(r.price).toEqual({ amount: 2200, currency: 'GBP' });
  });

  it('handles an empty caption', () => {
    const r = readCaption('');
    expect(r.isListing).toBe(false);
    expect(r.price).toBeNull();
    expect(r.title).toBe('');
  });
});
