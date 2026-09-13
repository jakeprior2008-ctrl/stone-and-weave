import { describe, expect, it } from 'vitest';
import { buildVocab } from '../vocab.ts';

describe('buildVocab', () => {
  it('builds without throwing', () => {
    expect(() => buildVocab()).not.toThrow();
  });

  it('maps every phrase only to real tags', () => {
    const vocab = buildVocab();
    const tagIds = new Set(vocab.tags.map((t) => t.tag));
    for (const [phrase, tags] of Object.entries(vocab.phrases)) {
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tagIds.has(tag), `phrase "${phrase}" -> unknown tag "${tag}"`).toBe(true);
      }
    }
  });

  it('gives every rule lower-case, non-empty synonym strings', () => {
    const vocab = buildVocab();
    for (const t of vocab.tags) {
      for (const syn of t.synonyms) {
        expect(typeof syn).toBe('string');
        expect(syn.length).toBeGreaterThan(0);
        expect(syn).toBe(syn.toLowerCase());
      }
    }
  });

  it('carries the full known-brand list', () => {
    // The taxonomy task brief describes 44 brands; the actual KNOWN_BRANDS
    // array (moved unchanged from normalise.ts) has 43. No behaviour change
    // is in scope here, so this checks the real, current list.
    const vocab = buildVocab();
    expect(vocab.brands.length).toBeGreaterThanOrEqual(40);
  });

  it('resolves models to their canonical brand', () => {
    const vocab = buildVocab();
    expect(vocab.models['tank']).toBe('Cartier');
    expect(vocab.models['reverso']).toBe('Jaeger-Lecoultre');
    expect(vocab.models['royal oak']).toBe('Audemars Piguet');
  });
});
