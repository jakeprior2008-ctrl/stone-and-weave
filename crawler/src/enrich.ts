import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Tag } from './types.ts';

type RuleSpec = { tag: string; label: string; group: string; rarity: number; any: string[] };
type TaxonomySpec = {
  grails: string[];
  families: Record<string, string[]>;
  groups: Record<string, string>;
  rules: RuleSpec[];
};

const spec: TaxonomySpec = parse(
  readFileSync(fileURLToPath(new URL('./taxonomy.yml', import.meta.url)), 'utf8'),
);

const compiled = spec.rules.map((r) => ({
  ...r,
  patterns: r.any.map((p) => new RegExp(p, 'i')),
}));

export const GROUPS = spec.groups;
export const GRAILS = new Set(spec.grails);
export const ALL_TAGS: Tag[] = spec.rules.map(({ tag, label, group, rarity }) => ({
  tag,
  label,
  group,
  rarity,
}));

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');

/**
 * Slug words carry real signal on pages with thin copy, but dealers recycle
 * URLs: Doble had a birch-wood dial still sitting on a "...malachite..." slug,
 * which tagged it as a malachite grail. So the slug is only consulted when the
 * description is too sparse to stand on its own.
 */
export function searchableText(title: string, description: string, url: string): string {
  const body = stripHtml(description);
  const slug = body.trim().length >= 60 ? '' : (url.split('/').pop()?.replace(/-/g, ' ') ?? '');
  return `${title} ${body} ${slug}`.replace(/\s+/g, ' ').trim();
}

const STONE_TAGS = spec.families?.stone ?? [];

/**
 * Books, straps, winders and watch rolls are stock too, but they are not
 * watches and a Rolex encyclopaedia listing every dial variant scores as a
 * grail. Conservative on purpose: only unambiguous accessory wording.
 */
export function looksLikeAccessory(title: string): boolean {
  return /\b(books?|magazines?|catalogues?|encyclopedia|posters?|watch roll|watch winder|watch box|storage case|gift card|spring bars?|polishing cloth|loupe)\b/i.test(
    title,
  );
}

export function tagsFor(text: string, title?: string): string[] {
  const found: string[] = [];
  for (const rule of compiled) {
    if (rule.patterns.some((p) => p.test(text))) found.push(rule.tag);
  }
  return withStoneRules(found, title);
}

/**
 * Dealers list the other stones they can supply ("also in lapis, aventurine"),
 * which sprayed three stone tags onto a plainly-titled Onyx Datejust. When the
 * title names the stone, it wins outright; when only the body does and it names
 * three or more, that is a catalogue rather than a description, so none stick.
 */
function withStoneRules(found: string[], title?: string): string[] {
  const specific = STONE_TAGS.filter((t) => t !== 'stone-dial');
  let stones = found.filter((t) => specific.includes(t));
  let out = found;

  if (stones.length > 0) {
    const fromTitle = title ? stones.filter((t) => tagsForRaw(title).includes(t)) : [];
    if (fromTitle.length > 0) stones = fromTitle;
    else if (stones.length >= 3) stones = [];
    out = found.filter((t) => !specific.includes(t) || stones.includes(t));
  }

  // A specific stone implies the parent tag, so a filter on "stone dial"
  // catches a malachite that never says the words.
  if (stones.length > 0 && !out.includes('stone-dial')) out.push('stone-dial');
  return out;
}

/** Raw rule match with no stone post-processing - used to test the title alone. */
function tagsForRaw(text: string): string[] {
  return compiled.filter((r) => r.patterns.some((p) => p.test(text))).map((r) => r.tag);
}

const RARITY = new Map(spec.rules.map((r) => [r.tag, r.rarity]));

/** tag -> family id, for tags that belong to one. */
const FAMILY = new Map<string, string>();
for (const [family, tags] of Object.entries(spec.families ?? {})) {
  for (const t of tags) FAMILY.set(t, family);
}

/**
 * Collapse each family to its rarest member. A lapis dial is one feature, not
 * two, even though it carries both `lapis-lazuli` and the implied `stone-dial`.
 */
function scoringTags(tags: string[]): string[] {
  const best = new Map<string, string>();
  const loose: string[] = [];
  for (const t of tags) {
    const fam = FAMILY.get(t);
    if (!fam) {
      loose.push(t);
      continue;
    }
    const current = best.get(fam);
    if (!current || (RARITY.get(t) ?? 0) > (RARITY.get(current) ?? 0)) best.set(fam, t);
  }
  return [...loose, ...best.values()];
}

/**
 * 0-100. Rewards rare tags and combinations of them; a grail floors the score
 * at 85 so it can never be buried behind a merely unusual piece.
 */
export function oddityScore(tags: string[], brandKnown: boolean): number {
  if (tags.length === 0) return brandKnown ? 5 : 12;

  const scored = scoringTags(tags);
  const rarities = scored.map((t) => RARITY.get(t) ?? 0).sort((a, b) => b - a);
  // Diminishing returns: the third odd feature matters less than the first.
  const weighted = rarities.reduce((sum, r, i) => sum + r / (i + 1), 0);
  let score = Math.min(100, Math.round(weighted * 5));

  // Crossing categories is what makes a watch genuinely strange: a stone dial
  // AND a woven bracelet beats two unusual dials.
  const groups = new Set(
    scored.map((t) => spec.rules.find((r) => r.tag === t)?.group).filter(Boolean),
  );
  if (groups.size >= 3) score += 12;
  else if (groups.size === 2) score += 6;

  if (!brandKnown) score += 5;
  if (tags.some((t) => GRAILS.has(t))) score = Math.max(score, 92);

  return Math.max(0, Math.min(100, score));
}

export const isGrail = (tags: string[]) => tags.some((t) => GRAILS.has(t));
