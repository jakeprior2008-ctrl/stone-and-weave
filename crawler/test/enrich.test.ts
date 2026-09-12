import { describe, expect, it } from 'vitest';
import { isGrail, looksLikeAccessory, oddityScore, searchableText, tagsFor } from '../src/enrich.ts';

const tag = (text: string) => tagsFor(searchableText(text, '', ''));
const score = (text: string) => oddityScore(tag(text), true);

describe('taxonomy tagging', () => {
  it('tags the stone dials Jake actually hunts', () => {
    expect(tag('Piaget Ellipse 9454 Malachite Roman')).toContain('malachite');
    expect(tag('Rolex Datejust Lapis Lazuli Stone Dial')).toContain('lapis-lazuli');
    expect(tag('Piaget Ellipse 9822 Tiger Eye 1970s')).toContain('tigers-eye');
    expect(tag('Piaget Cobra Onyx Dial')).toContain('onyx');
  });

  it('implies stone-dial from a specific stone', () => {
    // So a filter on "stone dial" still catches a malachite that never says it.
    expect(tag('Piaget Malachite Roman')).toContain('stone-dial');
  });

  it('tags bracelets by construction', () => {
    expect(tag('Audemars Piguet Bamboo Yellow Gold')).toContain('bamboo-bracelet');
    expect(tag('Universal Geneve beads of rice bracelet')).toContain('beads-of-rice');
    expect(tag('Omega with woven mesh bracelet')).toContain('woven-bracelet');
    expect(tag('Rolex with hammered bracelet')).toContain('hammered-bracelet');
  });

  it('leaves an ordinary watch untagged', () => {
    expect(tag('Omega Seamaster steel 36mm black dial')).toHaveLength(0);
  });
});

describe('grail precision', () => {
  // Grails fire a phone push, so a false positive is expensive.
  it('does not read "featherlight" as a feather dial', () => {
    expect(tag('Piaget Altiplano 9036 Roman featherlight and refined')).not.toContain('feather-dial');
  });

  it('does not read a coral-coloured dial as a coral dial', () => {
    expect(tag('Rolex Datejust coral red dial')).not.toContain('coral');
  });

  it('still catches the real thing', () => {
    expect(isGrail(tag('Piaget feather dial cocktail watch'))).toBe(true);
    expect(isGrail(tag('Patek Philippe coral dial 1970s'))).toBe(true);
    expect(isGrail(tag('Piaget Ellipse Malachite'))).toBe(true);
  });
});

describe('oddity scoring', () => {
  it('ranks a plain watch near zero', () => {
    expect(score('Cartier Tank Louis yellow gold')).toBeLessThan(15);
  });

  it('puts grails above merely unusual pieces', () => {
    const grail = score('Piaget feather dial cocktail watch');
    const unusual = score('Vacheron Constantin TV 1976 bark finish case textured dial');
    expect(grail).toBeGreaterThan(unusual);
    expect(grail).toBeGreaterThanOrEqual(92);
  });

  it('does not pay twice for one physical feature', () => {
    // lapis implies stone-dial; bark/textured/hammered are one bark finish.
    const single = score('Piaget Lapis Lazuli stone dial');
    const familyStack = score('Piaget bark bracelet bark dial hammered finish textured dial');
    expect(familyStack).toBeLessThan(single);
  });

  it('rewards crossing categories', () => {
    const oneCategory = score('Piaget onyx dial');
    const threeCategories = score('Piaget onyx dial woven bracelet tonneau case');
    expect(threeCategories).toBeGreaterThan(oneCategory);
  });
});

describe('recycled URL slugs', () => {
  // Dealers reuse URLs: Doble had a birch-wood dial on a "...malachite..."
  // slug, which tagged it as a grail it was not.
  const slug = 'https://x.com/p/rolex-datejust-yellow-gold-malachite-stone-dial-ref-69178';
  const realCopy =
    'A beautiful Rolex Datejust in 18ct yellow gold with a birch wood dial, ' +
    'presented with its original box, papers and hang tags in lovely condition.';

  it('trusts the description over a stale slug', () => {
    expect(tagsFor(searchableText('Rolex Datejust Birch Wood Dial', realCopy, slug)))
      .not.toContain('malachite');
  });

  it('still uses the slug when the copy is too thin to rely on', () => {
    expect(tagsFor(searchableText('Rolex Datejust', '', slug))).toContain('malachite');
  });
});

describe('accessories and catalogue copy', () => {
  it('recognises stock that is not a watch', () => {
    expect(looksLikeAccessory('Mondani Books - Rolex Day-Date')).toBe(true);
    expect(looksLikeAccessory('24-Piece Canvas Watch Roll')).toBe(true);
    expect(looksLikeAccessory('Rolex Datejust 26mm Onyx Stone Dial')).toBe(false);
  });

  it('lets the title settle which stone it is', () => {
    // Dealer copy offering other stones must not override a plain title.
    const tags = tagsFor(
      searchableText('Rolex Datejust Onyx Stone Dial', 'Also available in lapis and aventurine.', ''),
      'Rolex Datejust Onyx Stone Dial',
    );
    expect(tags).toContain('onyx');
    expect(tags).not.toContain('lapis-lazuli');
    expect(tags).not.toContain('aventurine');
  });

  it('drops stone tags entirely when only a catalogue lists them', () => {
    const tags = tagsFor(
      searchableText('Rolex Day-Date reference guide', 'Covers lapis, malachite, onyx and jade dials in detail.', ''),
      'Rolex Day-Date reference guide',
    );
    expect(tags.filter((t) => ['lapis-lazuli', 'malachite', 'onyx', 'jade'].includes(t))).toHaveLength(0);
  });

  it('still tags a stone named only in the description', () => {
    const tags = tagsFor(
      searchableText('Piaget dress watch', 'Fitted with a striking malachite dial.', ''),
      'Piaget dress watch',
    );
    expect(tags).toContain('malachite');
    expect(tags).toContain('stone-dial');
  });
});
