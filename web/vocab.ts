// Build-time only. Reads taxonomy.yml with the `yaml` package and produces a
// plain-JSON vocabulary consumed by the site's query parser (a later piece
// of work) through the `virtual:vocab` module registered in vite.config.ts.
// This file must never be imported at runtime by anything under web/src -
// that would drag the `yaml` parser into the shipped bundle.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { CANONICAL_BRANDS, KNOWN_BRANDS, MODELS } from '../crawler/src/brands.ts';

type RuleSpec = {
  tag: string;
  label: string;
  group: string;
  rarity: number;
  any: string[];
  titleOnly?: boolean;
  synonyms?: string[];
};

type TaxonomySpec = {
  grails: string[];
  families: Record<string, string[]>;
  groups: Record<string, string>;
  rules: RuleSpec[];
  phrases?: Record<string, string[]>;
};

export type Vocab = {
  tags: { tag: string; label: string; group: string; synonyms: string[] }[];
  phrases: Record<string, string[]>;
  brands: string[];
  /** Curated display-name brands only - the rail's brand facet trusts this list. */
  canonicalBrands: string[];
  models: Record<string, string>;
};

function loadSpec(): TaxonomySpec {
  const path = fileURLToPath(new URL('../crawler/src/taxonomy.yml', import.meta.url));
  return parse(readFileSync(path, 'utf8'));
}

export function buildVocab(): Vocab {
  const spec = loadSpec();
  const tagIds = new Set(spec.rules.map((r) => r.tag));

  const phrases = spec.phrases ?? {};
  for (const [phrase, tags] of Object.entries(phrases)) {
    for (const t of tags) {
      if (!tagIds.has(t)) {
        throw new Error(`phrases["${phrase}"] references unknown tag "${t}"`);
      }
    }
  }

  // No synonym may collide with another rule's own tag id or label
  // (case-insensitive), since that would make the query parser resolve a
  // typed word to the wrong tag. It is fine for a rule to list its own tag
  // id or label as a synonym.
  const idAndLabelByRule = spec.rules.map((r) => ({
    tag: r.tag,
    keys: new Set([r.tag.toLowerCase(), r.label.toLowerCase()]),
  }));

  for (const rule of spec.rules) {
    for (const syn of rule.synonyms ?? []) {
      const lower = syn.toLowerCase();
      for (const other of idAndLabelByRule) {
        if (other.tag === rule.tag) continue;
        if (other.keys.has(lower)) {
          throw new Error(
            `synonym "${syn}" on tag "${rule.tag}" collides with tag/label of "${other.tag}"`,
          );
        }
      }
    }
  }

  return {
    tags: spec.rules.map((r) => ({
      tag: r.tag,
      label: r.label,
      group: r.group,
      synonyms: r.synonyms ?? [],
    })),
    phrases,
    brands: [...KNOWN_BRANDS],
    canonicalBrands: [...CANONICAL_BRANDS],
    models: { ...MODELS },
  };
}
